# core/state.py
# ---------------------------------------------------------------------------
# Central in-memory state for the oil-water separation system.
#
# The AppState class holds every mutable value the backend tracks.
# It is instantiated once at module load time as `app_state`.
#
# Dict-style access  (app_state["key"], app_state["key"] = value)
# is supported via __getitem__ / __setitem__ so all existing route
# handlers work without change.
#
# Attribute-style access (app_state.key) is also available.
# ---------------------------------------------------------------------------

from datetime import datetime
from typing import Any, Optional


# Maximum number of status history entries to keep in memory.
MAX_HISTORY = 100

# Maximum number of individual oil detections to keep in detection history.
MAX_DETECTION_HISTORY = 500

# Maximum number of activity log entries to keep in memory.
MAX_LOGS = 1000


class AppState:
    """Single source of truth for all application state.

    Using a class instance (instead of a plain dict) gives us attribute
    access, IDE auto-complete, and an explicit inventory of every state
    field — while the __getitem__ / __setitem__ shims keep all existing
    route handlers working unchanged.
    """

    def __init__(self) -> None:
        # =====================================================================
        # BACKEND-CONTROLLED STATE
        # Set by the frontend or by backend logic.
        # =====================================================================

        # --- Operation mode ---
        # "manual"    → frontend controls movement directly via POST /command
        # "automatic" → device navigates autonomously using heading correction
        # "cleaning"  → device executes spiral cleaning pattern
        # "standby"   → device is idle, motors off
        # "returning" → device is returning to home GPS point
        self.current_mode: str = "manual"

        # --- Movement command ---
        # What the backend wants the ESP32 to do; polled via GET /command.
        self.current_command: str = "stop"

        # UPDATED: Last PWM speed sent to the BTS7960 43A motor drivers (0–255).
        # Default 200 gives a good balance between speed and control for testing.
        # Updated by POST /command whenever a movement command includes a speed value.
        self.current_speed: int = 200

        # UPDATED: Last rudder angle sent to the S020A-180 waterproof servos (-90 to +90).
        # 0 = straight ahead, negative = left, positive = right.
        # Updated by POST /command when command is "set_rudder".
        self.current_rudder_angle: int = 0

        # --- Automatic navigation target ---
        # Set by POST /navigate; cleared when switching to "manual" mode.
        self.target_gps: dict = {"lat": 0.0, "lng": 0.0}

        # True once a real navigation target has been set via POST /navigate.
        # Prevents (0.0, 0.0) from being treated as a valid destination.
        self.target_set: bool = False

        # How the current navigation target was set.
        # "manual_input" | "detection" | "home" | None
        self.navigation_source: Optional[str] = None

        # --- Home GPS point ---
        # Auto-saved from the first POST /status, or overridden by POST /home/set.
        self.home_gps: dict = {"lat": 0.0, "lng": 0.0}
        self.home_set: bool = False
        self.home_saved_at: Optional[datetime] = None

        # --- Latest YOLOv8 detection result ---
        # Updated by POST /detect after a successful inference run.
        self.last_detection: dict = {"lat": 0.0, "lng": 0.0, "confidence": 0.0}

        # =====================================================================
        # ESP32-REPORTED STATE
        # Values received from the device via POST /status.
        # =====================================================================

        # --- Device location (NEO-M8N GPS) ---
        self.device_gps: dict = {"lat": 0.0, "lng": 0.0}

        # --- IMU (ICM-20948) ---
        self.heading: float = 0.0       # magnetometer compass heading (0–359.9°)
        self.tilt_x: float = 0.0        # accelerometer x-axis tilt in degrees
        self.tilt_y: float = 0.0        # accelerometer y-axis tilt in degrees
        self.gyro_z: float = 0.0        # gyroscope z-axis rotation rate (deg/sec)

        # --- Oil detection (capacitive sensor) ---
        self.oil_detected: bool = False

        # --- Pump state (confirmed by ESP32) ---
        self.pump_status: bool = False

        # --- Power system ---
        self.battery_level: int = 100           # integer percentage 0–100
        self.battery_voltage: float = 0.0       # actual voltage, e.g. 11.4 V
        self.solar_charging: bool = False       # True if solar panel is charging
        self.power_source: str = "battery"      # "solar" or "battery"

        # UPDATED: Status of the four buck/step-down converter rails.
        # Defaulting all to True because there are no rail-monitoring sensors yet.
        # TODO (future): Update individual fields when ESP32 rail sensing is added.
        #   motors_12v  → BTS7960 43A motor drivers + extraction pump
        #   logic_5v    → ESP32 microcontroller
        #   sensors_3v3 → ICM-20948 IMU + NEO-M8N GPS
        #   servos_rail → S020A-180 waterproof rudder servos
        self.power_rails: dict = {
            "motors_12v": True,
            "logic_5v": True,
            "sensors_3v3": True,
            "servos_rail": True,
        }

        # --- ESP32 confirmed movement state ---
        # Distinct from current_command (backend desire) — these reflect
        # what the ESP32 last *confirmed* it executed.
        self.esp32_command: str = "stop"
        self.esp32_mode: str = "manual"
        # UPDATED: Actual rudder angle reported by the ESP32 via POST /status.
        # Stored separately from current_rudder_angle (the backend's commanded value)
        # so the frontend can compare commanded vs actual servo position.
        self.esp32_rudder_angle: int = 0

        # Timestamp of the last received status update from the ESP32.
        self.last_updated: Optional[datetime] = None

        # =====================================================================
        # HISTORY LOGS
        # =====================================================================

        # Rolling list of the last MAX_HISTORY status payloads from ESP32.
        self.status_history: list = []

        # Rolling list of every individual oil detection from POST /detect.
        self.detection_history: list = []

        # Chronological activity log appended by core/logger.py.
        self.event_log: list = []

        # =====================================================================
        # CLEANING PATTERN STATE
        # Set by POST /cleaning/start; consumed by GET /command in cleaning mode.
        # =====================================================================
        self.cleaning: dict = {
            "active": False,
            "center_lat": 0.0,
            "center_lng": 0.0,
            "max_radius": 5.0,
            "step_size": 0.5,
            "waypoints": [],
            "current_index": 0,
            "total_waypoints": 0,
            "current_radius": 0.0,
        }

        # =====================================================================
        # FILTER STATUS
        # Updated manually by the operator via POST /filter/status.
        # =====================================================================
        self.filter_status: str = "clean"
        self.filter_updated_at: Optional[datetime] = None

        # =====================================================================
        # SYSTEM / INTERNAL
        # =====================================================================

        # Set in main.py lifespan so GET /health can compute uptime.
        self.startup_time: Optional[datetime] = None

        # YOLOv8 model instance — loaded once at startup via main.py lifespan.
        self.model: Any = None

    # -------------------------------------------------------------------------
    # Dict-style access shims
    # These let all route handlers keep using app_state["key"] syntax unchanged.
    # -------------------------------------------------------------------------

    def __getitem__(self, key: str) -> Any:
        return getattr(self, key)

    def __setitem__(self, key: str, value: Any) -> None:
        setattr(self, key, value)

    def get(self, key: str, default: Any = None) -> Any:
        return getattr(self, key, default)


# The single shared instance imported by every router and utility module.
app_state = AppState()
