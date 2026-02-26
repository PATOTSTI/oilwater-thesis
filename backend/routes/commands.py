# routes/commands.py
# ---------------------------------------------------------------------------
# Endpoints that control the ESP32's movement and operating mode.
#
# How commands flow through the system:
#   1. Frontend calls POST /command or POST /mode to set what should happen.
#   2. The ESP32 polls GET /command every second to receive its next instruction.
#   3. In "automatic" or "cleaning" mode the backend auto-generates the command
#      each poll using GPS + heading data — the frontend does not need to do
#      anything after setting the navigation target.
#
# Routes in this file:
#   GET  /command  → ESP32 polls this to know what to do next
#   POST /command  → Frontend sends a movement, pump, or system command
#   POST /mode     → Frontend switches the operating mode
#   POST /navigate → Frontend sets a GPS destination for automatic navigation
# ---------------------------------------------------------------------------

from fastapi import APIRouter, HTTPException

from core.state import app_state
from core.response import make_response
from core.utils import (
    haversine_distance,
    bearing_to_target,
    compute_navigation_command,
    # UPDATED: needed to seed current_rudder_angle when navigation starts
    heading_error_to_rudder_angle,
)
from core.logger import log_event
from models.schemas import (
    CommandRequest,
    CommandResponse,
    ModeRequest,
    ModeResponse,
    NavigateRequest,
    NavigateResponse,
    GPSCoords,
    StandardResponse,
)

router = APIRouter()

# These commands bypass the "manual mode only" restriction because they are
# safety-critical: emergency_stop cuts all power, return_home heads for safety.
PRIORITY_COMMANDS = {"emergency_stop", "return_home"}

# Pump commands need extra handling to keep pump_status in sync with state.
PUMP_COMMANDS = {"pump_on", "pump_off"}


# ---------------------------------------------------------------------------
# GET /command
# ---------------------------------------------------------------------------
@router.get(
    "/command",
    response_model=StandardResponse,
    summary="ESP32 polling endpoint — returns the next command to execute",
)
def get_command():
    """Return the current command for the ESP32 to execute.

    The ESP32 calls this endpoint on every polling cycle (e.g. once per second).
    The response is a single command string such as "forward" or "turn_left".

    **Behaviour depends on the current operating mode:**

    - **emergency_stop active** — always returns "emergency_stop" regardless of mode.
      This can never be overridden by autonomous logic.

    - **cleaning mode** — the backend works through the spiral waypoint queue one
      by one. It computes the correct direction to reach the next waypoint using
      the device's current GPS and heading, advances the index when the device
      arrives, and switches mode to "standby" when all waypoints are done.

    - **automatic mode** — the backend runs a simple heading-correction loop:
      it computes the bearing to the target GPS, compares it to the device's
      current compass heading, and returns "forward", "turn_right", or "turn_left"
      accordingly. Returns "stop" and switches to "standby" when arrived.

    - **all other modes** — returns whatever command was last stored in state
      (set by POST /command or a mode transition).

    **Called by:** ESP32 polling loop.
    """
    # Emergency stop is the highest-priority command — never override it
    if app_state["current_command"] == "emergency_stop":
        print("[GET /command] Emergency stop active — returning 'emergency_stop'.")
        return make_response(
            # UPDATED: no speed/angle for emergency_stop (motors cut immediately)
            data=CommandResponse(command="emergency_stop").model_dump(),
            message="Emergency stop is active. All motors and pump halted.",
        )

    # ---- Cleaning mode: feed spiral waypoints one by one ----
    # The cleaning state dict holds the waypoint list and a current_index pointer.
    # Each call to this endpoint advances toward the next waypoint.
    if app_state["current_mode"] == "cleaning" and app_state["cleaning"]["active"]:
        cleaning = app_state["cleaning"]

        # All waypoints have been consumed — cleaning is complete
        if cleaning["current_index"] >= cleaning["total_waypoints"]:
            cleaning["active"] = False
            app_state["current_mode"] = "standby"
            app_state["current_command"] = "stop"
            log_event(
                "cleaning",
                "Cleaning pattern complete — all waypoints reached.",
                {"total_waypoints": cleaning["total_waypoints"]},
            )
            print("[GET /command] Cleaning complete — switching to 'standby'.")
            return make_response(
                data=CommandResponse(command="stop").model_dump(),
                message="Cleaning complete. Device returned to standby.",
            )

        # Compute the proportional heading correction toward the current waypoint
        wp = cleaning["waypoints"][cleaning["current_index"]]

        # UPDATED: apply this waypoint's assigned speed to state so the
        # CommandResponse echoes the correct PWM value for the BTS7960 drivers.
        app_state["current_speed"] = wp["speed"]

        # UPDATED: compute_navigation_command now returns a dict with
        # command, rudder_angle, speed, and heading_error.
        nav_result = compute_navigation_command(
            current_lat=app_state["device_gps"]["lat"],
            current_lng=app_state["device_gps"]["lng"],
            target_lat=wp["lat"],
            target_lng=wp["lng"],
            current_heading=app_state["heading"],
        )
        nav_cmd = nav_result["command"]

        # UPDATED: For cleaning mode, use the waypoint's assigned speed (from
        # CHANGE 4) but cap it at 150 when the heading error is large (> 30°).
        # This preserves per-ring speeds on straight runs while slowing down
        # during tight heading corrections to avoid overshooting the arc.
        wp_speed = app_state["current_speed"]
        effective_speed = (
            min(wp_speed, 150) if abs(nav_result["heading_error"]) > 30 else wp_speed
        )

        # "stop" means we arrived at this waypoint — advance to the next one
        if nav_cmd == "stop":
            cleaning["current_index"] += 1

            # Check again in case advancing just consumed the last waypoint
            if cleaning["current_index"] >= cleaning["total_waypoints"]:
                cleaning["active"] = False
                app_state["current_mode"] = "standby"
                app_state["current_command"] = "stop"
                log_event(
                    "cleaning",
                    "Cleaning pattern complete — all waypoints reached.",
                    {"total_waypoints": cleaning["total_waypoints"]},
                )
                print("[GET /command] Cleaning complete — switching to 'standby'.")
                return make_response(
                    data=CommandResponse(command="stop").model_dump(),
                    message="Cleaning complete. Device returned to standby.",
                )

            # Compute the correction toward the newly selected next waypoint
            next_wp = cleaning["waypoints"][cleaning["current_index"]]
            cleaning["current_radius"] = next_wp["radius"]
            # UPDATED: update speed for the newly advanced waypoint
            app_state["current_speed"] = next_wp["speed"]
            nav_result = compute_navigation_command(
                current_lat=app_state["device_gps"]["lat"],
                current_lng=app_state["device_gps"]["lng"],
                target_lat=next_wp["lat"],
                target_lng=next_wp["lng"],
                current_heading=app_state["heading"],
            )
            nav_cmd = nav_result["command"]
            # Apply the same speed cap for the new waypoint
            wp_speed = app_state["current_speed"]
            effective_speed = (
                min(wp_speed, 150) if abs(nav_result["heading_error"]) > 30 else wp_speed
            )
            print(
                f"[GET /command] Cleaning — wp {cleaning['current_index']}/"
                f"{cleaning['total_waypoints']} | r={next_wp['radius']}m | "
                f"cmd='{nav_cmd}' | rudder={nav_result['rudder_angle']}° | "
                f"speed={effective_speed} PWM"
            )

        app_state["current_command"] = nav_cmd
        # UPDATED: store the proportional rudder angle in state
        app_state["current_rudder_angle"] = nav_result["rudder_angle"]
        return make_response(
            data=CommandResponse(
                command=nav_cmd,
                speed=effective_speed if nav_cmd != "stop" else None,
                # UPDATED: include proportional rudder angle in the response
                angle=nav_result["rudder_angle"] if nav_cmd != "stop" else None,
            ).model_dump(),
            message=(
                f"Cleaning waypoint command: '{nav_cmd}' | "
                f"rudder={nav_result['rudder_angle']}° | speed={effective_speed} PWM."
            ),
        )

    # ---- Automatic mode: proportional heading correction loop toward target GPS ----
    # This runs on every poll so the command adapts live as the device moves.
    if app_state["current_mode"] == "automatic" and app_state["target_set"]:
        # UPDATED: returns dict {command, rudder_angle, speed, heading_error}
        nav_result = compute_navigation_command(
            current_lat=app_state["device_gps"]["lat"],
            current_lng=app_state["device_gps"]["lng"],
            target_lat=app_state["target_gps"]["lat"],
            target_lng=app_state["target_gps"]["lng"],
            current_heading=app_state["heading"],
        )
        nav_cmd = nav_result["command"]

        # "stop" means the device has arrived at the destination
        if nav_cmd == "stop":
            app_state["target_set"] = False
            app_state["current_mode"] = "standby"
            app_state["navigation_source"] = None
            # Reset rudder to straight on arrival
            app_state["current_rudder_angle"] = 0
            log_event(
                "navigation",
                "Navigation target reached — switching to standby.",
                {"target": app_state["target_gps"]},
            )
            print("[GET /command] Target reached — switching to 'standby'.")

        app_state["current_command"] = nav_cmd
        # UPDATED: store the proportional rudder angle and navigation speed in state
        if nav_cmd != "stop":
            app_state["current_rudder_angle"] = nav_result["rudder_angle"]
            app_state["current_speed"] = nav_result["speed"]

        print(
            f"[GET /command] Auto-nav → cmd='{nav_cmd}' | "
            f"rudder={nav_result['rudder_angle']}° | "
            f"hdg_err={nav_result['heading_error']}° | "
            f"speed={nav_result['speed']} PWM"
        )
        # UPDATED: return proportional rudder angle alongside the forward command
        return make_response(
            data=CommandResponse(
                command=nav_cmd,
                speed=nav_result["speed"] if nav_cmd != "stop" else None,
                angle=nav_result["rudder_angle"] if nav_cmd != "stop" else None,
            ).model_dump(),
            message=(
                f"Auto-navigation: '{nav_cmd}' | "
                f"rudder={nav_result['rudder_angle']}° | "
                f"speed={nav_result['speed']} PWM."
            ),
        )

    # ---- Returning mode: always enforce return_home ----
    # Self-heals any stale command that may have been written between the
    # low-battery trigger in POST /status and this poll.
    if app_state["current_mode"] == "returning":
        app_state["current_command"] = "return_home"
        print("[GET /command] Returning mode active — enforcing 'return_home'.")
        return make_response(
            data=CommandResponse(command="return_home").model_dump(),
            message="Returning to home. Command: 'return_home'.",
        )

    # ---- Default: return whatever command is currently stored ----
    cmd = app_state["current_command"]
    print(f"[GET /command] ESP32 polled — returning: '{cmd}'")
    # UPDATED: echo speed and angle from state so ESP32 always has full hardware parameters.
    # speed is included for movement commands; angle is included when cmd is set_rudder.
    _is_movement = cmd not in {"stop", "pump_on", "pump_off", "emergency_stop",
                                "return_home", "set_rudder"}
    return make_response(
        data=CommandResponse(
            command=cmd,
            speed=app_state["current_speed"] if _is_movement else None,
            angle=app_state["current_rudder_angle"] if cmd == "set_rudder" else None,
        ).model_dump(),
        message=f"Current command: '{cmd}'.",
    )


# ---------------------------------------------------------------------------
# POST /command
# ---------------------------------------------------------------------------
@router.post(
    "/command",
    response_model=StandardResponse,
    summary="Frontend sends a movement, pump, or system command",
)
def set_command(body: CommandRequest):
    """Accept a command from the frontend and store it in state.

    The stored command will be returned on the next GET /command poll
    from the ESP32.

    **Priority rules (enforced in order):**

    1. **emergency_stop** — always accepted regardless of mode.
       Immediately sets pump_status to False and overrides everything.

    2. **return_home** — always accepted regardless of mode.
       Puts the device on a path back to the saved home GPS point.

    3. **All other commands** — only accepted when mode is "manual".
       If the system is in "automatic" or another autonomous mode, a 400
       error is returned with a clear explanation.

    **Accepted command values:**

    | Category | Values |
    |----------|--------|
    | Movement | forward, backward, turn_left, turn_right, forward_left, forward_right, stop |
    | Pump     | pump_on, pump_off |
    | System   | return_home, emergency_stop |

    Invalid values are rejected automatically by Pydantic with a 422 error.

    **Called by:** Frontend dashboard.
    """
    # ---- Highest priority: emergency stop ----
    # Cuts all motors and pump immediately, no mode check required.
    if body.command == "emergency_stop":
        app_state["current_command"] = "emergency_stop"
        app_state["pump_status"] = False
        log_event(
            "warning",
            "EMERGENCY STOP issued — all motors and pump halted.",
            {"previous_mode": app_state["current_mode"]},
        )
        print("[POST /command] EMERGENCY STOP — all motors and pump halted.")
        return make_response(
            data=CommandResponse(command="emergency_stop").model_dump(),
            message="EMERGENCY STOP activated. All motors and pump halted.",
        )

    # ---- System priority: return home ----
    # Allowed in any mode so the operator can always recall the device.
    if body.command == "return_home":
        app_state["current_command"] = "return_home"
        log_event(
            "navigation",
            "return_home command issued.",
            {"from_mode": app_state["current_mode"]},
        )
        print("[POST /command] 'return_home' issued.")
        return make_response(
            data=CommandResponse(command="return_home").model_dump(),
            message="Device is navigating back to the home GPS point.",
        )

    # UPDATED: set_rudder — directly position the S020A-180 rudder servos.
    # Allowed in any mode (does not affect propellers) and requires an angle.
    if body.command == "set_rudder":
        # Validate that angle was provided — it is required for this command
        if body.angle is None:
            raise HTTPException(
                status_code=422,
                detail="angle is required for set_rudder command. "
                       "Provide an integer between -90 (full left) and +90 (full right).",
            )

        # Store the new rudder angle so GET /command echoes it to the ESP32
        app_state["current_command"] = "set_rudder"
        app_state["current_rudder_angle"] = body.angle

        log_event(
            "command",
            f"Rudder angle set to {body.angle}°.",
            # UPDATED: log includes angle so the activity log shows exact servo position
            {"command": "set_rudder", "angle": body.angle},
        )
        print(f"[POST /command] Rudder set to {body.angle}°.")
        return make_response(
            data=CommandResponse(
                command="set_rudder",
                angle=body.angle,
            ).model_dump(),
            message=f"Rudder angle set to {body.angle}° "
                    f"({'straight' if body.angle == 0 else 'left' if body.angle < 0 else 'right'}).",
        )

    # ---- All other commands require manual mode ----
    # Autonomous modes manage their own commands — manual input would conflict.
    if app_state["current_mode"] != "manual":
        raise HTTPException(
            status_code=400,
            detail=(
                f"Cannot send command '{body.command}' while in "
                f"'{app_state['current_mode']}' mode. "
                "Switch to 'manual' mode via POST /mode first, "
                "or use 'emergency_stop' / 'return_home' / 'set_rudder' which work in any mode."
            ),
        )

    # ---- Sync pump_status for pump commands ----
    # Pump commands do not use speed — ignore any speed value provided.
    if body.command == "pump_on":
        app_state["pump_status"] = True
        log_event("command", "Pump activated.", {"command": "pump_on"})
        print("[POST /command] Pump ON.")
        app_state["current_command"] = body.command
        return make_response(
            data=CommandResponse(command="pump_on").model_dump(),
            message="Pump activated.",
        )

    if body.command == "pump_off":
        app_state["pump_status"] = False
        log_event("command", "Pump deactivated.", {"command": "pump_off"})
        print("[POST /command] Pump OFF.")
        app_state["current_command"] = body.command
        return make_response(
            data=CommandResponse(command="pump_off").model_dump(),
            message="Pump deactivated.",
        )

    # ---- Movement commands ----
    # UPDATED: Store the speed value so the ESP32 applies it to the BTS7960 drivers.
    # Use body.speed if provided; fall back to the last stored speed.
    effective_speed = body.speed if body.speed is not None else app_state["current_speed"]
    app_state["current_speed"] = effective_speed
    app_state["current_command"] = body.command

    log_event(
        "command",
        f"Movement command issued: '{body.command}' at speed {effective_speed}.",
        # UPDATED: log now includes speed so the activity log reflects motor PWM value
        {"command": body.command, "speed": effective_speed, "mode": app_state["current_mode"]},
    )
    print(f"[POST /command] Movement: '{body.command}' | speed={effective_speed}")

    return make_response(
        data=CommandResponse(
            command=body.command,
            speed=effective_speed,
        ).model_dump(),
        message=f"Command '{body.command}' accepted at speed {effective_speed}.",
    )


# ---------------------------------------------------------------------------
# POST /mode
# ---------------------------------------------------------------------------
@router.post(
    "/mode",
    response_model=StandardResponse,
    summary="Frontend switches the device's operating mode",
)
def set_mode(body: ModeRequest):
    """Switch the device to a new operating mode.

    Each mode has side effects to ensure the device is always in a safe,
    consistent state after the transition:

    | Mode       | Side effects on switch |
    |------------|------------------------|
    | manual     | Clears navigation target; resets command to "stop" |
    | automatic  | None — relies on an active target from POST /navigate |
    | cleaning   | None — relies on waypoints from POST /cleaning/start |
    | standby    | Sets command to "stop" and pump to off |
    | returning  | Sets command to "return_home" |

    **Note:** The "emergency_stop" command (POST /command) overrides all modes.
    A separate low-battery rule in POST /status can also auto-switch to "returning".

    **Called by:** Frontend dashboard.
    """
    previous_mode = app_state["current_mode"]
    app_state["current_mode"] = body.mode

    if body.mode == "manual":
        # Clear autonomous navigation so the device doesn't keep steering itself
        app_state["current_command"] = "stop"
        app_state["target_gps"] = {"lat": 0.0, "lng": 0.0}
        app_state["target_set"] = False
        log_event(
            "mode_change",
            f"Mode changed: '{previous_mode}' → 'manual'. Navigation target cleared.",
            {"from": previous_mode, "to": "manual"},
        )
        print(f"[POST /mode] '{previous_mode}' → 'manual' — navigation cleared.")

    elif body.mode == "automatic":
        # The frontend should call POST /navigate after this to set a target
        log_event(
            "mode_change",
            f"Mode changed: '{previous_mode}' → 'automatic'.",
            {"from": previous_mode, "to": "automatic"},
        )
        print(f"[POST /mode] '{previous_mode}' → 'automatic'.")

    elif body.mode == "cleaning":
        # The frontend should call POST /cleaning/start after this
        log_event(
            "mode_change",
            f"Mode changed: '{previous_mode}' → 'cleaning'.",
            {"from": previous_mode, "to": "cleaning"},
        )
        print(f"[POST /mode] '{previous_mode}' → 'cleaning'.")

    elif body.mode == "standby":
        # Standby = everything off, device just sends status updates
        app_state["current_command"] = "stop"
        app_state["pump_status"] = False
        log_event(
            "mode_change",
            f"Mode changed: '{previous_mode}' → 'standby'. Motors and pump off.",
            {"from": previous_mode, "to": "standby"},
        )
        print(f"[POST /mode] '{previous_mode}' → 'standby'.")

    elif body.mode == "returning":
        # Tell the ESP32 to navigate home on the next GET /command poll
        app_state["current_command"] = "return_home"
        log_event(
            "mode_change",
            f"Mode changed: '{previous_mode}' → 'returning'. Issuing return_home.",
            {"from": previous_mode, "to": "returning"},
        )
        print(f"[POST /mode] '{previous_mode}' → 'returning'.")

    return make_response(
        data=ModeResponse(current_mode=body.mode).model_dump(),
        message=f"Mode switched to '{body.mode}'.",
    )


# ---------------------------------------------------------------------------
# POST /navigate
# ---------------------------------------------------------------------------
@router.post(
    "/navigate",
    response_model=StandardResponse,
    summary="Set a GPS destination and start autonomous navigation",
)
def set_navigate(body: NavigateRequest):
    """Set a GPS target and begin autonomous navigation.

    After this endpoint is called:
    - The device mode is automatically switched to "automatic".
    - The target GPS is stored in state.
    - The first navigation command is pre-computed and stored so the ESP32
      receives it on the very next GET /command poll.

    **Three ways to specify the destination:**

    1. `home=True` — navigate to the saved home GPS point (requires at least
       one POST /status update to have been received).

    2. `source="manual_input"` — navigate to the `target_lat` / `target_lng`
       coordinates provided directly in the request.

    3. `source="detection"` — navigate to a previously detected oil location.
       Requires `detection_id` to match an entry in the detection history.
       That entry is automatically marked `was_navigated_to=True`.

    **Called by:** Frontend dashboard.
    """
    # ---- Input validation ----
    if not body.home:
        if body.target_lat is None or body.target_lng is None:
            raise HTTPException(
                status_code=422,
                detail="target_lat and target_lng are required when home=False.",
            )

    if body.source == "detection" and not body.detection_id:
        raise HTTPException(
            status_code=422,
            detail="detection_id is required when source='detection'.",
        )

    # ---- Resolve the target GPS coordinates ----
    if body.home:
        # Use the saved home GPS point — reject if home has never been set
        home = app_state["home_gps"]
        if home["lat"] == 0.0 and home["lng"] == 0.0:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Home GPS has not been set yet. "
                    "The ESP32 must send at least one POST /status update first."
                ),
            )
        target_lat = home["lat"]
        target_lng = home["lng"]
        effective_source = "home"
    else:
        target_lat = body.target_lat
        target_lng = body.target_lng
        effective_source = body.source

    # ---- Store navigation target in state ----
    app_state["target_gps"]["lat"] = target_lat
    app_state["target_gps"]["lng"] = target_lng
    app_state["target_set"] = True
    app_state["navigation_source"] = effective_source

    # ---- Switch to automatic mode ----
    previous_mode = app_state["current_mode"]
    app_state["current_mode"] = "automatic"

    print(
        f"[POST /navigate] Target → ({target_lat}, {target_lng}) | "
        f"source='{effective_source}' | '{previous_mode}' → 'automatic'"
    )

    # ---- Mark the detection as visited if navigating to a detection ----
    if body.source == "detection" and body.detection_id:
        for entry in app_state["detection_history"]:
            if entry["detection_id"] == body.detection_id:
                entry["was_navigated_to"] = True
                print(f"[POST /navigate] Detection '{body.detection_id}' marked was_navigated_to=True.")
                break
        else:
            print(f"[POST /navigate] Warning: detection_id '{body.detection_id}' not found.")

    # ---- Compute initial navigation metrics ----
    dev_lat = app_state["device_gps"]["lat"]
    dev_lng = app_state["device_gps"]["lng"]

    initial_distance = haversine_distance(dev_lat, dev_lng, target_lat, target_lng)
    initial_bearing = bearing_to_target(dev_lat, dev_lng, target_lat, target_lng)

    # Pre-compute the first command so the ESP32 doesn't have to wait an extra poll
    # UPDATED: compute_navigation_command now returns a dict; extract the
    # initial command and seed the rudder angle and speed for the first poll.
    first_result = compute_navigation_command(
        current_lat=dev_lat,
        current_lng=dev_lng,
        target_lat=target_lat,
        target_lng=target_lng,
        current_heading=app_state["heading"],
    )
    first_command = first_result["command"]
    app_state["current_command"] = first_command
    app_state["current_rudder_angle"] = first_result["rudder_angle"]
    app_state["current_speed"] = first_result["speed"]

    log_event(
        "navigation",
        f"Navigation started via '{effective_source}'.",
        {
            "target_lat": target_lat,
            "target_lng": target_lng,
            "source": effective_source,
            "detection_id": body.detection_id,
            "distance_m": initial_distance,
            "bearing": initial_bearing,
        },
    )
    print(
        f"[POST /navigate] distance={initial_distance}m, "
        f"bearing={initial_bearing}°, first_cmd='{first_command}', "
        f"rudder={first_result['rudder_angle']}°, speed={first_result['speed']} PWM"
    )

    return make_response(
        data=NavigateResponse(
            target_gps=GPSCoords(lat=target_lat, lng=target_lng),
            source=effective_source,
            mode="automatic",
            initial_distance_m=initial_distance,
            initial_bearing=initial_bearing,
            first_command=first_command,
        ).model_dump(),
        message=f"Navigation started toward ({target_lat}, {target_lng}) via '{effective_source}'.",
    )
