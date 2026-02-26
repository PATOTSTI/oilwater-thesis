# routes/home.py
# ---------------------------------------------------------------------------
# Endpoints for managing the home GPS reference point.
#
# The "home" point is the GPS coordinate where the device was deployed from.
# It is used by:
#   - The "return_home" command (ESP32 navigates back here)
#   - The "returning" mode (auto-triggered on low battery)
#   - POST /navigate with home=True (frontend can send device home explicitly)
#
# How home gets set:
#   1. Automatically — on the very first POST /status update from the ESP32,
#      the device's GPS is saved as home (see routes/status.py).
#   2. Manually — the operator calls POST /home/set at any time to override
#      the auto-saved position with the current device location.
#
# Routes in this file:
#   POST /home/set → save current device GPS as the home reference point
#   GET  /home     → retrieve the saved home coordinates
# ---------------------------------------------------------------------------

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from core.state import app_state
from core.response import make_response
from models.schemas import HomeResponse, StandardResponse

router = APIRouter()


# ---------------------------------------------------------------------------
# POST /home/set
# ---------------------------------------------------------------------------
@router.post(
    "/home/set",
    response_model=StandardResponse,
    summary="Save the current device GPS position as the home reference point",
)
def set_home():
    """Lock the device's current GPS position as the home reference point.

    The home point is used as the destination for "return_home" commands
    and automatic low-battery returns.

    **Requirement:** At least one POST /status update must have been received
    so the backend has a real GPS fix from the ESP32. If no update has been
    received yet (device not connected), a 400 error is returned.

    Calling this endpoint multiple times is safe — it simply overwrites the
    previous home position with the current device location.

    **Called by:** Frontend dashboard (operator presses "Set Home" button).
    """
    # Reject if the ESP32 has never sent a status update (no real GPS fix yet)
    if app_state["last_updated"] is None:
        raise HTTPException(
            status_code=400,
            detail=(
                "Cannot set home — no device status update has been received yet. "
                "The ESP32 must send at least one POST /status with a valid GPS fix."
            ),
        )

    lat = app_state["device_gps"]["lat"]
    lng = app_state["device_gps"]["lng"]
    saved_at = datetime.now(timezone.utc)

    # Overwrite the home GPS with the current device location
    app_state["home_gps"]["lat"] = lat
    app_state["home_gps"]["lng"] = lng
    app_state["home_set"] = True
    app_state["home_saved_at"] = saved_at

    print(f"[POST /home/set] Home GPS saved manually → lat={lat}, lng={lng}")

    return make_response(
        data=HomeResponse(home_set=True, lat=lat, lng=lng, saved_at=saved_at).model_dump(),
        message=f"Home GPS saved at ({lat}, {lng}).",
    )


# ---------------------------------------------------------------------------
# GET /home
# ---------------------------------------------------------------------------
@router.get(
    "/home",
    response_model=StandardResponse,
    summary="Retrieve the saved home GPS reference point",
)
def get_home():
    """Return the saved home GPS coordinates.

    The response includes a `home_set` boolean so the frontend can tell the
    difference between "home is at (0.0, 0.0)" and "home has never been set".

    **When home is not set:**
    - `home_set` = False
    - `lat`, `lng`, and `saved_at` are null

    **When home is set:**
    - `home_set` = True
    - `lat` and `lng` contain the saved coordinates
    - `saved_at` is the UTC timestamp when the point was saved

    **Called by:** Frontend (display home marker on map, confirm home is set).
    """
    if not app_state["home_set"]:
        print("[GET /home] Home GPS not set yet — returning null.")
        return make_response(
            data=HomeResponse(home_set=False, lat=None, lng=None, saved_at=None).model_dump(),
            message="Home GPS has not been set yet. "
                    "It will be auto-saved on the first POST /status update.",
        )

    lat = app_state["home_gps"]["lat"]
    lng = app_state["home_gps"]["lng"]
    saved_at = app_state["home_saved_at"]

    print(f"[GET /home] Home GPS → lat={lat}, lng={lng}")

    return make_response(
        data=HomeResponse(home_set=True, lat=lat, lng=lng, saved_at=saved_at).model_dump(),
        message=f"Home GPS is set at ({lat}, {lng}).",
    )
