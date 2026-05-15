# routes/status.py
# ---------------------------------------------------------------------------
# Endpoints for exchanging device status between the ESP32 and the frontend.
#
# Data flow:
#   ESP32 → POST /status   (pushes sensor readings every polling cycle)
#   Frontend ← GET /status (reads the latest full system snapshot)
#   Frontend ← GET /status/history (reads the rolling history log for charts)
#
# Routes in this file:
#   POST /status         → ESP32 sends full sensor payload
#   GET  /status         → Frontend reads the complete current system state
#   GET  /status/history → Frontend reads the rolling history log
# ---------------------------------------------------------------------------

from datetime import datetime, timezone

from fastapi import APIRouter

from core.state import app_state, MAX_HISTORY
from core.response import make_response
from core.utils import (
    haversine_distance,
    bearing_to_target,
    compute_heading_error,
    # UPDATED: needed to compute suggested_rudder_angle for GET /status
    heading_error_to_rudder_angle,
)
from core.logger import log_event
from models.schemas import (
    StatusUpdate,
    StatusResponse,
    StatusHistoryEntry,
    GPSCoords,
    LastDetection,
    StandardResponse,
)

router = APIRouter()

# Battery percentage that triggers an automatic mode switch to "returning".
# Must match the threshold defined in routes/battery.py.
LOW_BATTERY_THRESHOLD = 20

# Module-level flag — ensures home GPS is only auto-saved once (from the
# very first POST /status update), not overwritten on every subsequent update.
_home_saved = False


# ---------------------------------------------------------------------------
# POST /status
# ---------------------------------------------------------------------------
@router.post(
    "/status",
    response_model=StandardResponse,
    summary="ESP32 sends its full sensor payload to the backend",
)
def update_status(body: StatusUpdate):
    """Receive and store a full sensor update from the ESP32.

    The ESP32 calls this endpoint on every polling cycle (e.g. once per second)
    to report all of its sensor readings. The backend:

    1. Stores every field in `app_state` for immediate access by GET /status.
    2. Appends the payload to `status_history` (capped at MAX_HISTORY entries)
       for charts and data export.
    3. **Auto-saves home GPS** — on the very first call, the device's GPS is
       automatically saved as the home reference point. This ensures `return_home`
       always has a valid target even if POST /home/set was never called.
    4. **Low-battery auto-return** — if `battery_level` drops below 20% and the
       device is not already returning or in standby, the backend automatically
       switches to "returning" mode and issues a "return_home" command.

    The response echoes back the current `mode`, `command`, and `pump_status`
    so the ESP32 can act on them immediately without waiting for a GET /command poll.

    **Called by:** ESP32 polling loop.
    """
    global _home_saved

    # Capture server time first — used for both home_saved_at and last_updated
    server_time = datetime.now(timezone.utc)

    # ---- Store GPS ----
    app_state["device_gps"]["lat"] = body.lat
    app_state["device_gps"]["lng"] = body.lng

    # Auto-save home GPS from the very first status update so "return_home"
    # always has a valid destination, even without a manual POST /home/set call.
    if not _home_saved:
        app_state["home_gps"]["lat"] = body.lat
        app_state["home_gps"]["lng"] = body.lng
        app_state["home_set"] = True
        app_state["home_saved_at"] = server_time
        _home_saved = True
        print(f"[POST /status] Home GPS auto-saved → lat={body.lat}, lng={body.lng}")

    # ---- Store IMU readings (ICM-20948) ----
    app_state["heading"] = body.heading   # compass direction the boat faces
    app_state["tilt_x"] = body.tilt_x
    app_state["tilt_y"] = body.tilt_y
    app_state["gyro_z"] = body.gyro_z

    # ---- Store sensor readings ----
    app_state["oil_detected"] = body.oil_detected
    app_state["pump_status"] = body.pump_status

    # Log warning when oil is newly detected
    if body.oil_detected and not app_state.get(
        "_last_oil_detected", False
    ):
        log_event(
            "warning",
            f"Oil detected by capacitive sensor at "
            f"lat={body.lat}, lng={body.lng}.",
            {
                "lat": body.lat,
                "lng": body.lng,
                "pump_status": body.pump_status,
            },
        )
    app_state["_last_oil_detected"] = body.oil_detected

    # ---- Store power readings ----
    app_state["battery_level"] = body.battery_level
    app_state["battery_voltage"] = body.battery_voltage
    app_state["solar_charging"] = body.solar_charging
    app_state["power_source"] = body.power_source

    # UPDATED: Update power rail status if the ESP32 firmware sends it.
    # Only update the fields that are actually present in the payload — fields
    # that the ESP32 omits (None) keep their current value in state (default True).
    # This lets firmware report rails incrementally as sensing hardware is added.
    if body.power_rails is not None:
        for rail_name, rail_value in body.power_rails.model_dump(exclude_none=True).items():
            app_state["power_rails"][rail_name] = rail_value

    # ---- Store ESP32's confirmed movement state ----
    # These reflect what the ESP32 last *executed*, which may differ from
    # app_state["current_command"] (what the backend *wants* it to do).
    app_state["esp32_command"] = body.current_command
    app_state["esp32_mode"] = body.current_mode
    # UPDATED: Store the ESP32-reported rudder angle so GET /status can show it.
    # body.rudder_angle defaults to 0 if older firmware omits the field.
    app_state["esp32_rudder_angle"] = body.rudder_angle

    # Record when this update arrived
    app_state["last_updated"] = server_time

    print(
        f"[POST /status] lat={body.lat}, lng={body.lng}, "
        f"heading={body.heading}°, oil={body.oil_detected}, pump={body.pump_status}, "
        f"battery={body.battery_level}% ({body.battery_voltage}V), "
        f"solar={body.solar_charging}, source={body.power_source}"
    )

    # ---- Append to rolling history log ----
    # Each entry mirrors the fields in StatusHistoryEntry so it can be
    # deserialised directly by GET /status/history.
    history_entry = {
        "received_at": server_time,
        "lat": body.lat,
        "lng": body.lng,
        "heading": body.heading,
        "tilt_x": body.tilt_x,
        "tilt_y": body.tilt_y,
        "gyro_z": body.gyro_z,
        "oil_detected": body.oil_detected,
        "pump_status": body.pump_status,
        "battery_level": body.battery_level,
        "battery_voltage": body.battery_voltage,
        "solar_charging": body.solar_charging,
        "power_source": body.power_source,
        "current_command": body.current_command,
        "current_mode": body.current_mode,
        "timestamp": body.timestamp,
    }
    app_state["status_history"].append(history_entry)

    # Drop the oldest entries when the cap is exceeded to prevent memory growth
    if len(app_state["status_history"]) > MAX_HISTORY:
        app_state["status_history"] = app_state["status_history"][-MAX_HISTORY:]

    # ---- Low-battery auto-return ----
    # If the battery is critically low and the device is not already safe,
    # the backend forces a return-home to prevent losing the device at sea.
    triggered_return = False
    safe_modes = {"returning", "standby"}

    if (
        body.battery_level < LOW_BATTERY_THRESHOLD
        and app_state["current_mode"] not in safe_modes
        and app_state["current_command"] != "emergency_stop"
    ):
        previous_mode = app_state["current_mode"]
        app_state["current_mode"] = "returning"
        app_state["current_command"] = "return_home"
        app_state["pump_status"] = False    # also turn off the pump to save power
        triggered_return = True

        log_event(
            "warning",
            f"Low battery ({body.battery_level}%) — auto-switching to 'returning'.",
            {
                "battery_level": body.battery_level,
                "battery_voltage": body.battery_voltage,
                "previous_mode": previous_mode,
            },
        )
        print(
            f"[POST /status] LOW BATTERY ({body.battery_level}%) — "
            f"'{previous_mode}' → 'returning'."
        )

    # Build response — echo back the commands so ESP32 can act immediately
    response_data = {
        "current_mode": app_state["current_mode"],
        "current_command": app_state["current_command"],
        "pump_status": app_state["pump_status"],
    }
    if triggered_return:
        response_data["low_battery_warning"] = (
            f"Battery at {body.battery_level}%. Auto-switched to 'returning'."
        )

    msg = (
        f"Status updated. LOW BATTERY ({body.battery_level}%) — returning to home."
        if triggered_return
        else "Status updated successfully."
    )
    return make_response(data=response_data, message=msg)


# ---------------------------------------------------------------------------
# GET /status
# ---------------------------------------------------------------------------
@router.get(
    "/status",
    response_model=StandardResponse,
    summary="Frontend reads the full current system state",
)
def get_status():
    """Return the complete current system snapshot for the frontend dashboard.

    The response contains:
    - Every field stored in `app_state` (GPS, IMU, power, mode, command, etc.)
    - Three **computed fields** calculated fresh on each request:

      | Field                  | Description |
      |------------------------|-------------|
      | `distance_to_target`   | Metres from device GPS to navigation target. `null` if no target is set. |
      | `heading_error`        | Degrees the boat must rotate to face the target. Positive = turn right. `null` if no target. |
      | `time_since_last_update` | Seconds since the ESP32 last sent a POST /status. Useful for detecting disconnection. |

    **Called by:** Frontend dashboard (polling every 1–2 seconds).
    """
    state = app_state

    # ---- Compute navigation metrics only when a target is active ----
    distance_to_target = None
    heading_error = None
    # UPDATED: proportional rudder angle computed from the same mapping used by
    # GET /command so the frontend can preview what the boat will do next.
    suggested_rudder_angle = None

    if state["target_set"]:
        dev_lat = state["device_gps"]["lat"]
        dev_lng = state["device_gps"]["lng"]
        tgt_lat = state["target_gps"]["lat"]
        tgt_lng = state["target_gps"]["lng"]

        distance_to_target = haversine_distance(dev_lat, dev_lng, tgt_lat, tgt_lng)
        bearing = bearing_to_target(dev_lat, dev_lng, tgt_lat, tgt_lng)
        heading_error = compute_heading_error(state["heading"], bearing)
        # UPDATED: map heading_error to a rudder servo angle (-90 to +90)
        suggested_rudder_angle = heading_error_to_rudder_angle(heading_error)

    # ---- Compute time since last ESP32 update ----
    time_since_last_update = None
    if state["last_updated"] is not None:
        now = datetime.now(timezone.utc)
        last = state["last_updated"]
        # Ensure timezone-aware subtraction (protects against naive datetimes)
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        time_since_last_update = round((now - last).total_seconds(), 2)

    print(
        f"[GET /status] mode='{state['current_mode']}', "
        f"dist={distance_to_target}m, hdg_err={heading_error}°, "
        f"suggested_rudder={suggested_rudder_angle}°, "
        f"stale={time_since_last_update}s"
    )

    status_obj = StatusResponse(
        # Backend-controlled fields
        current_mode=state["current_mode"],
        current_command=state["current_command"],
        target_gps=GPSCoords(lat=state["target_gps"]["lat"], lng=state["target_gps"]["lng"]),
        home_gps=GPSCoords(lat=state["home_gps"]["lat"], lng=state["home_gps"]["lng"]),
        last_detection=LastDetection(
            lat=state["last_detection"]["lat"],
            lng=state["last_detection"]["lng"],
            confidence=state["last_detection"]["confidence"],
        ),
        # ESP32-reported fields
        device_gps=GPSCoords(lat=state["device_gps"]["lat"], lng=state["device_gps"]["lng"]),
        heading=state["heading"],
        tilt_x=state["tilt_x"],
        tilt_y=state["tilt_y"],
        gyro_z=state["gyro_z"],
        oil_detected=state["oil_detected"],
        pump_status=state["pump_status"],
        # Power
        battery_level=state["battery_level"],
        battery_voltage=state["battery_voltage"],
        solar_charging=state["solar_charging"],
        power_source=state["power_source"],
        # ESP32 confirmed state
        esp32_command=state["esp32_command"],
        esp32_mode=state["esp32_mode"],
        # UPDATED: include the ESP32-reported rudder angle in the status snapshot
        esp32_rudder_angle=state["esp32_rudder_angle"],
        last_updated=state["last_updated"],
        # Computed metrics (calculated above)
        distance_to_target=distance_to_target,
        # UPDATED: proportional rudder angle suggestion added alongside heading_error
        suggested_rudder_angle=suggested_rudder_angle,
        heading_error=heading_error,
        time_since_last_update=time_since_last_update,
    )

    return make_response(
        data=status_obj.model_dump(),
        message="Current device status retrieved.",
    )


# ---------------------------------------------------------------------------
# GET /status/history
# ---------------------------------------------------------------------------
@router.get(
    "/status/history",
    response_model=StandardResponse,
    summary="Returns the rolling history of all ESP32 status updates",
)
def get_status_history():
    """Return the rolling log of the last MAX_HISTORY status updates.

    Useful for:
    - Drawing GPS track lines on the frontend map.
    - Plotting sensor readings over time (battery level, heading, tilt).
    - Exporting raw data for thesis analysis.

    The history is a rolling buffer: once it reaches MAX_HISTORY (100) entries,
    the oldest entry is dropped each time a new one is added.

    **Called by:** Frontend dashboard (charts, data export).
    """
    history = app_state["status_history"]
    count = len(history)
    print(f"[GET /status/history] Returning {count} history entries.")

    # Deserialise each raw dict through StatusHistoryEntry for type safety
    entries = [StatusHistoryEntry(**e).model_dump() for e in history]
    return make_response(
        data={"entries": entries, "total": count},
        message=f"Returning {count} status history entries.",
    )
