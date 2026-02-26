# routes/cleaning.py
# ---------------------------------------------------------------------------
# Endpoints for the automated spiral oil-cleaning pattern.
#
# How the cleaning pattern works:
#   1. The frontend calls POST /cleaning/start with a GPS centre point (the
#      oil location), a maximum radius, and a step size.
#   2. The backend calls generate_spiral_waypoints() which returns a list of
#      GPS points forming an outward Archimedean spiral.
#   3. The mode switches to "cleaning" and the waypoint list is stored in state.
#   4. The ESP32 polls GET /command as usual. The backend feeds waypoints one
#      by one — each poll returns the direction to the *current* waypoint.
#   5. When the device is close enough to the waypoint (≤ 2 m), the backend
#      advances the index to the next waypoint automatically.
#   6. When the last waypoint is reached the mode switches to "standby".
#
# Routes in this file:
#   POST /cleaning/start  → generate waypoints, switch to cleaning mode
#   POST /cleaning/stop   → abort cleaning, clear waypoints, return to standby
#   GET  /cleaning/status → live progress (waypoint index, %, current radius)
# ---------------------------------------------------------------------------

from fastapi import APIRouter, HTTPException

from core.state import app_state
from core.response import make_response
from core.utils import generate_spiral_waypoints, compute_navigation_command
from core.logger import log_event
from models.schemas import (
    CleaningStartRequest,
    CleaningStartResponse,
    CleaningStatusResponse,
    GPSCoords,
    StandardResponse,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# POST /cleaning/start
# ---------------------------------------------------------------------------
@router.post(
    "/cleaning/start",
    response_model=StandardResponse,
    summary="Generate a spiral cleaning pattern and begin the cleaning operation",
)
def start_cleaning(body: CleaningStartRequest):
    """Start an automated spiral cleaning operation centred on a GPS point.

    The backend generates an outward Archimedean spiral waypoint queue
    and the device navigates through every point autonomously via GET /command.

    **Request fields:**

    | Field        | Description |
    |--------------|-------------|
    | `center_lat` | GPS latitude of the oil slick centre |
    | `center_lng` | GPS longitude of the oil slick centre |
    | `max_radius` | Maximum radius of the spiral in metres (default 5.0 m) |
    | `step_size`  | Radius increase per ring and approximate arc spacing (default 0.5 m) |

    **Constraints:**
    - `step_size` must be ≤ `max_radius` or a 422 error is returned.
    - If a cleaning operation is already active, a 409 error is returned.
      Call POST /cleaning/stop first.

    **Side effects:**
    - Mode is switched to "cleaning".
    - `target_set` is set to False (cleaning manages its own waypoints).
    - The first movement command is pre-loaded into state so the ESP32
      receives it immediately on the next GET /command poll.

    **Called by:** Frontend dashboard.
    """
    # ---- Guard: prevent starting a second cleaning while one is running ----
    if app_state["cleaning"]["active"]:
        raise HTTPException(
            status_code=409,
            detail=(
                "A cleaning operation is already active. "
                "Call POST /cleaning/stop before starting a new one."
            ),
        )

    # ---- Validate step_size vs max_radius ----
    if body.step_size > body.max_radius:
        raise HTTPException(
            status_code=422,
            detail=(
                f"step_size ({body.step_size} m) cannot be larger than "
                f"max_radius ({body.max_radius} m). "
                "Reduce step_size or increase max_radius."
            ),
        )

    print(
        f"[POST /cleaning/start] Generating spiral — "
        f"center=({body.center_lat}, {body.center_lng}), "
        f"max_radius={body.max_radius}m, step_size={body.step_size}m"
    )

    # ---- Generate the spiral waypoint queue ----
    # UPDATED: pass inner_speed and outer_speed so each waypoint carries its own
    # PWM speed and rudder angle scaled to the ring radius.
    waypoints = generate_spiral_waypoints(
        center_lat=body.center_lat,
        center_lng=body.center_lng,
        max_radius=body.max_radius,
        step_size=body.step_size,
        inner_speed=body.inner_speed,
        outer_speed=body.outer_speed,
    )

    if not waypoints:
        raise HTTPException(
            status_code=500,
            detail=(
                "Waypoint generation returned an empty list. "
                "Try increasing max_radius or reducing step_size."
            ),
        )

    total = len(waypoints)
    print(f"[POST /cleaning/start] Generated {total} waypoints.")

    # ---- Store cleaning state ----
    cleaning = app_state["cleaning"]
    cleaning["active"] = True
    cleaning["center_lat"] = body.center_lat
    cleaning["center_lng"] = body.center_lng
    cleaning["max_radius"] = body.max_radius
    cleaning["step_size"] = body.step_size
    cleaning["waypoints"] = waypoints
    cleaning["current_index"] = 0
    cleaning["total_waypoints"] = total
    cleaning["current_radius"] = waypoints[0]["radius"]  # first ring radius

    # ---- Switch to cleaning mode ----
    # Disable the regular navigation target — cleaning feeds its own waypoints
    app_state["current_mode"] = "cleaning"
    app_state["target_set"] = False

    # ---- Pre-load the first command, rudder angle, and speed ----
    first_wp = waypoints[0]
    # UPDATED: compute_navigation_command now returns a dict; extract command and rudder angle.
    first_result = compute_navigation_command(
        current_lat=app_state["device_gps"]["lat"],
        current_lng=app_state["device_gps"]["lng"],
        target_lat=first_wp["lat"],
        target_lng=first_wp["lng"],
        current_heading=app_state["heading"],
    )
    first_command = first_result["command"]
    app_state["current_command"] = first_command
    # Seed rudder angle with the proportional correction for the first waypoint
    app_state["current_rudder_angle"] = first_result["rudder_angle"]
    # UPDATED: seed current_speed with the first waypoint's assigned speed so
    # the ESP32 receives the correct PWM value on the very first GET /command poll.
    app_state["current_speed"] = first_wp["speed"]

    log_event(
        "cleaning",
        f"Cleaning pattern started — {total} waypoints generated.",
        {
            "center_lat": body.center_lat,
            "center_lng": body.center_lng,
            "max_radius": body.max_radius,
            "step_size": body.step_size,
            "total_waypoints": total,
            "first_command": first_command,
            # UPDATED: log speed range so the activity log shows PWM info
            "inner_speed": body.inner_speed,
            "outer_speed": body.outer_speed,
            "first_waypoint_speed": first_wp["speed"],
        },
    )
    print(
        f"[POST /cleaning/start] Cleaning started — "
        f"total_waypoints={total}, first_command='{first_command}', "
        f"speeds inner={body.inner_speed} → outer={body.outer_speed} PWM"
    )

    return make_response(
        data=CleaningStartResponse(
            active=True,
            center=GPSCoords(lat=body.center_lat, lng=body.center_lng),
            max_radius=body.max_radius,
            step_size=body.step_size,
            total_waypoints=total,
            mode="cleaning",
            first_command=first_command,
        ).model_dump(),
        message=f"Cleaning pattern started. {total} waypoints generated.",
    )


# ---------------------------------------------------------------------------
# POST /cleaning/stop
# ---------------------------------------------------------------------------
@router.post(
    "/cleaning/stop",
    response_model=StandardResponse,
    summary="Abort the active cleaning operation and return to standby",
)
def stop_cleaning():
    """Stop the cleaning operation and return the device to standby.

    If no cleaning operation is currently active, the endpoint returns
    a success response with a message instead of raising an error — this
    makes it safe to call even when uncertain whether cleaning is running.

    **Side effects on stop:**
    - Cleaning state is reset (waypoints cleared, index zeroed).
    - Mode switches to "standby".
    - Command switches to "stop".

    The response includes how many waypoints were completed before stopping,
    which is useful for thesis data and progress reporting.

    **Called by:** Frontend dashboard (operator abort button).
    """
    # Safe no-op if nothing is running
    if not app_state["cleaning"]["active"]:
        return make_response(
            data={"mode": app_state["current_mode"]},
            message="No active cleaning operation to stop.",
        )

    completed = app_state["cleaning"]["current_index"]
    total = app_state["cleaning"]["total_waypoints"]

    # ---- Reset cleaning state ----
    cleaning = app_state["cleaning"]
    cleaning["active"] = False
    cleaning["waypoints"] = []
    cleaning["current_index"] = 0
    cleaning["total_waypoints"] = 0
    cleaning["current_radius"] = 0.0

    # ---- Return to standby ----
    app_state["current_mode"] = "standby"
    app_state["current_command"] = "stop"

    log_event(
        "cleaning",
        f"Cleaning stopped by operator — {completed}/{total} waypoints completed.",
        {"waypoints_completed": completed, "waypoints_total": total},
    )
    print(
        f"[POST /cleaning/stop] Aborted — "
        f"{completed}/{total} waypoints done. Mode → 'standby'."
    )

    return make_response(
        data={
            "waypoints_completed": completed,
            "waypoints_total": total,
            "mode": "standby",
        },
        message=f"Cleaning stopped. {completed} of {total} waypoints were completed.",
    )


# ---------------------------------------------------------------------------
# GET /cleaning/status
# ---------------------------------------------------------------------------
@router.get(
    "/cleaning/status",
    response_model=StandardResponse,
    summary="Returns live progress of the active cleaning operation",
)
def get_cleaning_status():
    """Return the current progress of the cleaning operation.

    The response is useful for displaying a live progress bar, a spiral
    overlay on the map, and a current-radius indicator on the dashboard.

    **Response fields:**

    | Field                   | Description |
    |-------------------------|-------------|
    | `active`                | True while cleaning is running |
    | `current_waypoint_index`| Which waypoint the device is heading toward |
    | `total_waypoints`       | Total waypoints in the pattern |
    | `progress_percent`      | Percentage of waypoints completed (0–100) |
    | `center`                | GPS centre of the spiral (the oil location) |
    | `current_radius`        | Radius of the current spiral ring in metres |

    Returns zeros when no cleaning operation has been started.

    **Called by:** Frontend dashboard (progress bar, map overlay).
    """
    cleaning = app_state["cleaning"]
    total = cleaning["total_waypoints"]
    index = cleaning["current_index"]

    # Avoid division by zero when no cleaning has been started
    progress = round((index / total * 100), 1) if total > 0 else 0.0

    print(
        f"[GET /cleaning/status] active={cleaning['active']}, "
        f"wp={index}/{total} ({progress}%), r={cleaning['current_radius']}m"
    )

    return make_response(
        data=CleaningStatusResponse(
            active=cleaning["active"],
            current_waypoint_index=index,
            total_waypoints=total,
            progress_percent=progress,
            center=GPSCoords(lat=cleaning["center_lat"], lng=cleaning["center_lng"]),
            current_radius=cleaning["current_radius"],
        ).model_dump(),
        message=(
            f"Cleaning in progress — {progress}% complete."
            if cleaning["active"]
            else "No active cleaning operation."
        ),
    )
