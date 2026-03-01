# routes/detection.py
# ---------------------------------------------------------------------------
# Endpoints for YOLOv8-based oil detection from drone images.
#
# How it works:
#   1. The drone operator uploads an aerial image via POST /detect along with
#      the drone's GPS position, altitude, heading, and camera FOV.
#   2. The backend runs YOLOv8 on the image and filters detections below 60%.
#   3. For each valid detection, the bounding-box centre pixel is projected
#      to a real GPS coordinate using the drone's known position and altitude.
#   4. Each detection is saved to a rolling history and is queryable later.
#   5. The highest-confidence detection updates app_state["last_detection"]
#      so the navigation system always has a fresh target GPS available.
#
# Routes in this file:
#   POST /detect          → upload image, run YOLOv8, get geo-referenced results
#   GET  /detect/history  → full rolling history of all saved detections
#   GET  /detections      → paginated, filterable summary list
# ---------------------------------------------------------------------------

import io
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, UploadFile, File, Form, Query, HTTPException
from PIL import Image

from core.state import app_state, MAX_DETECTION_HISTORY
from core.response import make_response
from core.utils import compute_gsd, pixel_to_gps
from core.logger import log_event
from ml.detector import run_inference
from models.schemas import (
    OilDetection,
    OilDetectionEntry,
    DetectionListItem,
    DetectionListResponse,
    DetectionResponse,
    DroneInfo,
    BBox,
    CenterPixel,
    GPSCoords,
    StandardResponse,
)

router = APIRouter()

# Only JPEG and PNG are accepted — other formats are rejected with a 422 error
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/jpg", "image/png"}

# Detections with confidence below this value are discarded (also enforced
# inside ml/detector.py — both filters run to be safe)
CONFIDENCE_THRESHOLD = 0.40


# ---------------------------------------------------------------------------
# POST /detect
# ---------------------------------------------------------------------------
@router.post(
    "/detect",
    response_model=StandardResponse,
    summary="Upload a drone image and run YOLOv8 oil detection",
)
async def detect_oil(
    file: UploadFile = File(
        ...,
        description="Aerial drone image. Must be JPEG or PNG.",
    ),
    drone_lat: float = Form(
        ...,
        description="GPS latitude of the drone when the image was captured.",
    ),
    drone_lng: float = Form(
        ...,
        description="GPS longitude of the drone when the image was captured.",
    ),
    drone_altitude: float = Form(
        ...,
        description="Drone altitude above the water surface in metres.",
    ),
    drone_heading: float = Form(
        ...,
        ge=0.0,
        lt=360.0,
        description="Drone compass heading in degrees when image was captured (0° = North).",
    ),
    fov: float = Form(
        default=84.0,
        gt=0.0,
        lt=180.0,
        description="Horizontal camera field of view in degrees. Default is 84°.",
    ),
):
    """Run YOLOv8 oil detection on an uploaded drone image.

    The request must be sent as **multipart/form-data** containing the image
    file and all drone metadata fields.

    **Processing pipeline:**

    1. Validate file type (JPEG / PNG only).
    2. Check that the YOLOv8 model has been loaded (returns 503 if not).
    3. Decode the image with Pillow.
    4. Run YOLOv8 inference — detections below 60% confidence are discarded.
    5. For each valid detection:
       - Compute the bounding-box centre pixel (cx, cy).
       - Use `pixel_to_gps()` to project (cx, cy) to a real GPS coordinate
         based on drone altitude, heading, and camera FOV.
       - Estimate the oil patch area in square metres using the Ground Sample
         Distance (GSD = metres per pixel at the drone's altitude).
       - Assign a unique UUID as `detection_id`.
    6. Save all detections to the rolling `detection_history`.
    7. Update `app_state["last_detection"]` with the highest-confidence result
       so POST /navigate can use it immediately without extra queries.

    **Called by:** Frontend or drone ground-control station.
    """
    # ---- File type validation ----
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Unsupported file type: '{file.content_type}'. "
                "Only JPEG and PNG images are accepted."
            ),
        )

    # ---- Model availability check ----
    # The model is loaded at startup; if best.pt was missing, model stays None
    model = app_state.get("model")
    if model is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "YOLOv8 model is not loaded. "
                "Ensure 'ml/best.pt' exists and restart the server."
            ),
        )

    print(
        f"[POST /detect] '{file.filename}' | "
        f"lat={drone_lat}, lng={drone_lng}, alt={drone_altitude}m, "
        f"hdg={drone_heading}°, fov={fov}°"
    )

    # ---- Decode image ----
    image_bytes = await file.read()
    try:
        image = Image.open(io.BytesIO(image_bytes))
    except Exception:
        raise HTTPException(
            status_code=422,
            detail="Could not decode the uploaded file. Please upload a valid JPEG or PNG.",
        )

    img_width, img_height = image.size

    # ---- Run YOLOv8 inference ----
    # run_inference() applies the confidence threshold internally and returns
    # a list of dicts with bounding box, confidence, and class name.
    raw_detections = run_inference(model, image, confidence_threshold=CONFIDENCE_THRESHOLD)
    print(
        f"[POST /detect] Inference done — "
        f"{len(raw_detections)} detection(s) ≥ {CONFIDENCE_THRESHOLD * 100:.0f}% confidence."
    )

    # Compute Ground Sample Distance (metres per pixel) for area estimation
    gsd = compute_gsd(drone_altitude, img_width, fov)

    server_time = datetime.now(timezone.utc)
    detections: list[OilDetection] = []     # structured Pydantic objects for response
    history_entries: list[dict] = []        # flat dicts for lightweight storage

    for raw in raw_detections:
        x1, y1, x2, y2 = raw["x1"], raw["y1"], raw["x2"], raw["y2"]

        # Bounding-box centre pixel
        cx = round((x1 + x2) / 2.0, 2)
        cy = round((y1 + y2) / 2.0, 2)

        # Project centre pixel to a real GPS coordinate in the world
        est_lat, est_lng = pixel_to_gps(
            cx=cx, cy=cy,
            image_width=img_width, image_height=img_height,
            drone_lat=drone_lat, drone_lng=drone_lng,
            drone_altitude_m=drone_altitude,
            drone_heading_deg=drone_heading,
            fov_deg=fov,
        )

        # Estimate oil patch area: (bbox width in px × gsd) × (bbox height in px × gsd)
        bbox_w_m = (x2 - x1) * gsd
        bbox_h_m = (y2 - y1) * gsd
        area_sqm = round(bbox_w_m * bbox_h_m, 4)

        detection_id = str(uuid.uuid4())  # unique ID for this detection

        detection = OilDetection(
            detection_id=detection_id,
            bbox=BBox(x1=x1, y1=y1, x2=x2, y2=y2),
            center_pixel=CenterPixel(cx=cx, cy=cy),
            confidence=raw["confidence"],
            class_name=raw["class_name"],
            estimated_gps=GPSCoords(lat=est_lat, lng=est_lng),
            area_sqm=area_sqm,
        )
        detections.append(detection)

        # Flat dict version for efficient storage in the history list
        history_entries.append({
            "detection_id": detection_id,
            "received_at": server_time,
            "drone_lat": drone_lat,
            "drone_lng": drone_lng,
            "drone_altitude": drone_altitude,
            "drone_heading": drone_heading,
            "image_width": img_width,
            "image_height": img_height,
            "bbox": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
            "center_pixel": {"cx": cx, "cy": cy},
            "confidence": raw["confidence"],
            "class_name": raw["class_name"],
            "estimated_gps": {"lat": est_lat, "lng": est_lng},
            "area_sqm": area_sqm,
            "was_navigated_to": False,  # set to True when POST /navigate uses this ID
        })

    # ---- Save detections to history ----
    app_state["detection_history"].extend(history_entries)

    # Rolling cap — drop oldest entries when the limit is exceeded
    if len(app_state["detection_history"]) > MAX_DETECTION_HISTORY:
        app_state["detection_history"] = app_state["detection_history"][-MAX_DETECTION_HISTORY:]

    # ---- Update last_detection with the best result ----
    if detections:
        best = max(detections, key=lambda d: d.confidence)
        app_state["last_detection"]["lat"] = best.estimated_gps.lat
        app_state["last_detection"]["lng"] = best.estimated_gps.lng
        app_state["last_detection"]["confidence"] = best.confidence

        log_event(
            "detection",
            f"{len(detections)} oil detection(s) found. Best: {best.class_name} @ {best.confidence:.2%}.",
            {
                "total": len(detections),
                "best_confidence": best.confidence,
                "best_class": best.class_name,
                "best_gps": {"lat": best.estimated_gps.lat, "lng": best.estimated_gps.lng},
                "best_area_sqm": best.area_sqm,
                "drone_lat": drone_lat,
                "drone_lng": drone_lng,
                "drone_altitude": drone_altitude,
            },
        )
        print(
            f"[POST /detect] Best — class='{best.class_name}', "
            f"conf={best.confidence:.4f}, area={best.area_sqm}m²"
        )
    else:
        log_event(
            "detection",
            "Inference complete — no detections above confidence threshold.",
            {"drone_lat": drone_lat, "drone_lng": drone_lng, "drone_altitude": drone_altitude},
        )

    response_obj = DetectionResponse(
        detections=detections,
        total_detections=len(detections),
        image_width=img_width,
        image_height=img_height,
        drone_info=DroneInfo(
            lat=drone_lat, lng=drone_lng,
            altitude=drone_altitude, heading=drone_heading,
        ),
        timestamp=server_time,
    )

    msg = (
        f"{len(detections)} oil detection(s) found."
        if detections
        else "Inference complete — no oil detections above the confidence threshold."
    )
    return make_response(data=response_obj.model_dump(), message=msg)


# ---------------------------------------------------------------------------
# GET /detect/history
# ---------------------------------------------------------------------------
@router.get(
    "/detect/history",
    response_model=StandardResponse,
    summary="Returns the full rolling detection history (all fields)",
)
def get_detection_history():
    """Return every individual oil detection ever saved by POST /detect.

    This is the unfiltered, unpaginated full history list.
    Each entry includes all bounding-box, GPS, confidence, and drone metadata.
    Use GET /detections for a paginated, filterable summary view instead.

    **Called by:** Frontend (map view, raw data export).
    """
    history = app_state["detection_history"]
    count = len(history)
    print(f"[GET /detect/history] Returning {count} entries.")

    entries = [OilDetectionEntry(**e).model_dump() for e in history]
    return make_response(
        data={"entries": entries, "total": count},
        message=f"Returning {count} detection history entries.",
    )


# ---------------------------------------------------------------------------
# GET /detections
# ---------------------------------------------------------------------------
@router.get(
    "/detections",
    response_model=StandardResponse,
    summary="Returns a paginated, filterable summary list of past detections",
)
def list_detections(
    limit: int = Query(
        default=20,
        ge=1,
        le=200,
        description="Maximum number of results to return per page (1–200).",
    ),
    offset: int = Query(
        default=0,
        ge=0,
        description="Number of results to skip before returning (for pagination).",
    ),
    min_confidence: float = Query(
        default=0.0,
        ge=0.0,
        le=1.0,
        description=(
            "Only return detections at or above this confidence score. "
            "For example, 0.75 returns only high-confidence detections."
        ),
    ),
):
    """Return a paginated, filterable summary list of past oil detections.

    Each item in the list contains only the key summary fields:
    `detection_id`, `estimated_gps`, `confidence`, `timestamp`, and
    `was_navigated_to`.

    Use the query parameters to control which detections are returned:

    | Parameter       | Default | Description |
    |-----------------|---------|-------------|
    | `limit`         | 20      | Max results per page |
    | `offset`        | 0       | Skip N results (pagination) |
    | `min_confidence`| 0.0     | Minimum confidence filter |

    **Called by:** Frontend (dashboard table, map pins).
    """
    history = app_state["detection_history"]

    # Apply the confidence filter first
    filtered = [e for e in history if e["confidence"] >= min_confidence]
    total = len(filtered)

    # Apply pagination
    page = filtered[offset: offset + limit]

    # Map to the lightweight summary schema (drops bounding boxes and drone metadata)
    items = [
        DetectionListItem(
            detection_id=e["detection_id"],
            estimated_gps=GPSCoords(**e["estimated_gps"]),
            confidence=e["confidence"],
            timestamp=e["received_at"],
            was_navigated_to=e.get("was_navigated_to", False),
        )
        for e in page
    ]

    print(
        f"[GET /detections] total={total}, offset={offset}, "
        f"limit={limit}, min_confidence={min_confidence}, returned={len(items)}"
    )

    result = DetectionListResponse(
        detections=items,
        total=total,
        returned=len(items),
        offset=offset,
        limit=limit,
    )
    return make_response(
        data=result.model_dump(),
        message=f"Returning {len(items)} of {total} detections.",
    )
