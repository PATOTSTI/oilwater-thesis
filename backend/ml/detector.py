# ml/detector.py
# ---------------------------------------------------------------------------
# YOLOv8 inference helper.
#
# Usage:
#   1. Call `load_model(path)` once at startup to get a YOLO instance.
#   2. Call `run_inference(model, pil_image)` for every incoming image.
#
# The model object is stored in core/state.py["model"] so that routers do
# not need to import ultralytics directly.
# ---------------------------------------------------------------------------

from pathlib import Path
from PIL import Image
from ultralytics import YOLO


def load_model(model_path: str = "ml/best.pt") -> YOLO:
    """
    Load the YOLOv8 model from disk and return it.

    Args:
        model_path: Path to the trained .pt weights file.
                    Defaults to "ml/best.pt" relative to the project root.

    Returns:
        A loaded `ultralytics.YOLO` instance ready for inference.

    Raises:
        FileNotFoundError: If the weights file does not exist at model_path.
    """
    path = Path(model_path)

    if not path.exists():
        raise FileNotFoundError(
            f"YOLOv8 model weights not found at '{path.resolve()}'.\n"
            "Please place your trained 'best.pt' file inside the 'ml/' folder."
        )

    print(f"[DETECTOR] Loading YOLOv8 model from: {path.resolve()}")
    model = YOLO(str(path))
    print("[DETECTOR] Model loaded successfully.")
    return model


def run_inference(
    model: YOLO,
    image: Image.Image,
    confidence_threshold: float = 0.60,
) -> list[dict]:
    """
    Run YOLOv8 inference on a PIL image and return structured detections.

    Args:
        model:                A loaded YOLO instance (from `load_model`).
        image:                A PIL Image object (any mode; converted to RGB internally).
        confidence_threshold: Minimum confidence score to keep a detection (default 0.60).
                              Detections below this value are silently discarded.

    Returns:
        A list of detection dicts for every detection that passes the threshold:
            {
                "x1": float,         # bounding box left edge  (pixels)
                "y1": float,         # bounding box top edge   (pixels)
                "x2": float,         # bounding box right edge (pixels)
                "y2": float,         # bounding box bottom edge(pixels)
                "confidence": float, # detection score 0–1
                "class_name": str,   # label string, e.g. "oil"
                "image_width": int,  # original image width  (pixels)
                "image_height": int, # original image height (pixels)
            }
        Returns an empty list if nothing passes the threshold.
    """
    # YOLOv8 expects an RGB image
    image = image.convert("RGB")
    img_width, img_height = image.size

    # Run inference — `verbose=False` silences per-frame YOLO console output
    results = model(image, verbose=False)

    detections: list[dict] = []

    for result in results:
        for box in result.boxes:
            confidence = float(box.conf[0])

            # Discard low-confidence detections before doing any further work
            if confidence < confidence_threshold:
                continue

            x1, y1, x2, y2 = box.xyxy[0].tolist()
            class_id = int(box.cls[0])
            class_name = result.names[class_id]

            detections.append({
                "x1": round(x1, 2),
                "y1": round(y1, 2),
                "x2": round(x2, 2),
                "y2": round(y2, 2),
                "confidence": round(confidence, 4),
                "class_name": class_name,
                "image_width": img_width,
                "image_height": img_height,
            })

    return detections
