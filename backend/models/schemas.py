# models/schemas.py
# ---------------------------------------------------------------------------
# All Pydantic request/response schemas for the Oil-Water Separation API.
#
# Organisation:
#   1. Shared base types  (GPSCoords, LastDetection)
#   2. /command
#   3. /mode
#   4. /navigate
#   5. /status
#   6. /detect  +  /detections
#   7. /cleaning
#   8. /home
#   9. /battery
#  10. /logs
#  11. /filter
#
# Validator conventions used throughout:
#   lat        → ge=-90,  le=90
#   lng        → ge=-180, le=180
#   heading    → ge=0.0,  lt=360.0  (0 = North, clockwise)
#   confidence → ge=0.0,  le=1.0
#   battery    → ge=0,    le=100    (integer percentage)
#   voltage    → ge=0.0              (cannot be negative)
#   distance   → ge=0.0
#   area       → ge=0.0
#
# All datetime fields are UTC.  Route handlers always use
# datetime.now(timezone.utc) when creating timestamps.
# ---------------------------------------------------------------------------

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, model_validator


# ===========================================================================
# STANDARD RESPONSE ENVELOPE
# Every endpoint wraps its payload in this schema so the frontend always
# receives a consistent structure: { success, data, message, timestamp }.
# ===========================================================================

class StandardResponse(BaseModel):
    """Universal response wrapper returned by every API endpoint."""
    success: bool = Field(
        ...,
        description="True when the request completed successfully; False on error.",
    )
    data: Any = Field(
        None,
        description="Endpoint-specific payload. See individual endpoint docs for the shape.",
    )
    message: str = Field(
        ...,
        description="Human-readable summary of the result or error.",
    )
    timestamp: datetime = Field(
        ...,
        description="UTC datetime when the response was generated.",
    )


# ===========================================================================
# SHARED BASE TYPES
# Defined first so they can be referenced by all schemas below.
# ===========================================================================

class GPSCoords(BaseModel):
    """A latitude/longitude coordinate pair."""
    lat: float = Field(
        ...,
        ge=-90.0,
        le=90.0,
        description="Latitude in decimal degrees (−90 to +90).",
        examples=[14.5995],
    )
    lng: float = Field(
        ...,
        ge=-180.0,
        le=180.0,
        description="Longitude in decimal degrees (−180 to +180).",
        examples=[120.9842],
    )


class LastDetection(BaseModel):
    """The most recent YOLOv8 detection stored in backend state."""
    lat: float = Field(
        ...,
        ge=-90.0,
        le=90.0,
        description="Estimated latitude of the detected oil patch.",
    )
    lng: float = Field(
        ...,
        ge=-180.0,
        le=180.0,
        description="Estimated longitude of the detected oil patch.",
    )
    confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="YOLOv8 confidence score of the detection (0.0–1.0).",
    )


# ===========================================================================
# /command  (routes/commands.py)
# ===========================================================================

class CommandRequest(BaseModel):
    """Body for POST /command — frontend sends a command to the RC boat.

    Movement:
        forward, backward, turn_left, turn_right,
        forward_left, forward_right, stop
    Pump:
        pump_on, pump_off
    System:
        return_home, emergency_stop
    Hardware:
        set_rudder  → directly set rudder angle (requires `angle` field)

    UPDATED: Added set_rudder command, speed (PWM 0-255), and angle (-90 to +90)
             to support the double BTS7960 motor drivers and S020A-180 servos.
    """
    command: Literal[
        "forward", "backward",
        "turn_left", "turn_right",
        "forward_left", "forward_right",
        "stop",
        "pump_on", "pump_off",
        "return_home", "emergency_stop",
        # UPDATED: new command to directly set both rudder servos to a specific angle
        "set_rudder",
    ] = Field(
        ...,
        description=(
            "Command sent to the ESP32. Movement, pump, system, or hardware commands. "
            "'set_rudder' requires the 'angle' field."
        ),
        examples=["forward"],
    )

    # UPDATED: PWM speed value for the BTS7960 motor drivers (0–255).
    # Only applied to movement commands; ignored for pump, system, and set_rudder.
    speed: Optional[int] = Field(
        default=200,
        ge=0,
        le=255,
        description=(
            "PWM speed value for the BTS7960 motor drivers (0 = stopped, 255 = full speed). "
            "Default 200. Applies to movement commands only. "
            "Ignored for pump_on, pump_off, emergency_stop, return_home, and set_rudder."
        ),
        examples=[200],
    )

    # UPDATED: Rudder angle for the S020A-180 waterproof servos.
    # Required when command is "set_rudder"; ignored for all other commands.
    angle: Optional[int] = Field(
        default=None,
        ge=-90,
        le=90,
        description=(
            "Servo angle in degrees for the S020A-180 rudder servos. "
            "0 = straight ahead, negative = turn left, positive = turn right. "
            "Required when command is 'set_rudder'. Ignored for all other commands."
        ),
        examples=[0, -30, 45],
    )

    @model_validator(mode="after")
    def angle_required_for_set_rudder(self) -> "CommandRequest":
        """Raise a 422 if 'set_rudder' is sent without an angle value.

        This fires before the route handler so FastAPI returns a proper
        RequestValidationError (HTTP 422) with a clear message instead of
        reaching the route logic with an invalid payload.
        """
        if self.command == "set_rudder" and self.angle is None:
            raise ValueError(
                "angle is required when command is 'set_rudder'. "
                "Provide an integer between -90 (full left) and +90 (full right). "
                "Example: {\"command\": \"set_rudder\", \"angle\": -30}"
            )
        return self


class CommandResponse(BaseModel):
    """Response for GET /command and POST /command — ESP32 reads this on every poll.

    UPDATED: Added speed and angle so the ESP32 knows the full hardware parameters
             to apply, not just the command string.
    """
    command: str = Field(
        ...,
        description="Current movement command for the ESP32 to execute.",
        examples=["forward"],
    )
    # UPDATED: Echoes the stored PWM speed so ESP32 can apply it to the BTS7960 drivers
    speed: Optional[int] = Field(
        default=None,
        description=(
            "PWM speed value to apply to the BTS7960 motor drivers (0–255). "
            "Present for movement commands; null for pump/system/rudder commands."
        ),
        examples=[200],
    )
    # UPDATED: Echoes the stored rudder angle so ESP32 can position the servos
    angle: Optional[int] = Field(
        default=None,
        description=(
            "Rudder servo angle in degrees (-90 to +90). "
            "Present for set_rudder commands; null for all other commands."
        ),
        examples=[0],
    )


# ===========================================================================
# /mode  (routes/commands.py)
# ===========================================================================

class ModeRequest(BaseModel):
    """Body for POST /mode — switches the device operating mode.

    Modes:
        manual     → operator controls via POST /command
        automatic  → heading-correction loop navigates to target GPS
        cleaning   → outward spiral pattern centred on oil GPS
        standby    → idle, motors off, only sending status updates
        returning  → navigating back to saved home GPS point
    """
    mode: Literal["manual", "automatic", "cleaning", "standby", "returning"] = Field(
        ...,
        description="Target operating mode for the device.",
        examples=["automatic"],
    )


class ModeResponse(BaseModel):
    """Confirmation that the mode was updated."""
    current_mode: Literal["manual", "automatic", "cleaning", "standby", "returning"] = Field(
        ...,
        description="The operating mode that is now active.",
    )


# ===========================================================================
# /navigate  (routes/commands.py)
# ===========================================================================

class NavigateRequest(BaseModel):
    """Body for POST /navigate — starts autonomous navigation to a GPS target.

    Validation rules:
      - If home=True, target_lat/target_lng are ignored; saved home GPS is used.
      - If home=False, target_lat and target_lng are required.
      - If source="detection", detection_id is required.
    """
    target_lat: Optional[float] = Field(
        default=None,
        ge=-90.0,
        le=90.0,
        description="Target latitude (−90 to +90). Required when home=False.",
        examples=[14.5995],
    )
    target_lng: Optional[float] = Field(
        default=None,
        ge=-180.0,
        le=180.0,
        description="Target longitude (−180 to +180). Required when home=False.",
        examples=[120.9842],
    )
    source: Literal["manual_input", "detection"] = Field(
        ...,
        description="How the target was chosen: 'manual_input' or 'detection'.",
        examples=["detection"],
    )
    detection_id: Optional[str] = Field(
        default=None,
        description="UUID of the oil detection to navigate to. "
                    "Required when source='detection'. Marks was_navigated_to=True.",
        examples=["a3f1c2d4-11ab-4e6b-9c0f-112233445566"],
    )
    home: bool = Field(
        default=False,
        description="If True, navigate to the saved home GPS point. "
                    "target_lat/target_lng are ignored when this is True.",
    )

    def resolved_target(self, home_gps: dict) -> tuple[float, float]:
        """Return the (lat, lng) this request resolves to, accounting for home=True."""
        if self.home:
            return home_gps["lat"], home_gps["lng"]
        return self.target_lat, self.target_lng  # type: ignore[return-value]


class NavigateResponse(BaseModel):
    """Confirmation that navigation has started, with computed initial metrics."""
    target_gps: GPSCoords = Field(
        ...,
        description="The GPS coordinates the device is navigating to.",
    )
    source: Literal["manual_input", "detection", "home"] = Field(
        ...,
        description="Navigation source that was resolved.",
    )
    mode: Literal["automatic"] = Field(
        default="automatic",
        description="Operating mode now active (always 'automatic').",
    )
    initial_distance_m: float = Field(
        ...,
        ge=0.0,
        description="Straight-line distance in metres from current position to target.",
    )
    initial_bearing: float = Field(
        ...,
        ge=0.0,
        lt=360.0,
        description="Compass bearing (0–360°) from current position to target.",
    )
    first_command: Literal[
        "forward", "turn_left", "turn_right", "stop"
    ] = Field(
        ...,
        description="First movement command issued by the heading correction loop.",
    )


# ===========================================================================
# /status  (routes/status.py)
# ===========================================================================

class StatusUpdate(BaseModel):
    """Full status payload sent by the ESP32 on every polling cycle.

    Covers GPS, IMU (ICM-20948), oil sensor, pump, power system,
    current movement state, and a device-side timestamp.
    All datetime fields are UTC (or will be treated as UTC by the backend).
    """

    # --- GPS (NEO-M8N) ---
    lat: float = Field(
        ..., ge=-90.0, le=90.0,
        description="Current device latitude (−90 to +90).",
        examples=[14.5995],
    )
    lng: float = Field(
        ..., ge=-180.0, le=180.0,
        description="Current device longitude (−180 to +180).",
        examples=[120.9842],
    )

    # --- IMU (ICM-20948) ---
    heading: float = Field(
        ..., ge=0.0, lt=360.0,
        description="Magnetometer compass heading in degrees (0.0–359.9). 0° = North.",
        examples=[182.5],
    )
    tilt_x: float = Field(
        ...,
        description="Accelerometer x-axis tilt in degrees. Positive = nose-up.",
        examples=[1.2],
    )
    tilt_y: float = Field(
        ...,
        description="Accelerometer y-axis tilt in degrees. Positive = roll right.",
        examples=[-0.8],
    )
    gyro_z: float = Field(
        ...,
        description="Gyroscope z-axis rotation rate in deg/sec. Positive = clockwise.",
        examples=[0.05],
    )

    # --- Oil Detection (capacitive sensor) ---
    oil_detected: bool = Field(
        ...,
        description="True if the capacitive sensor detects oil on the water surface.",
        examples=[False],
    )

    # --- Pump ---
    pump_status: bool = Field(
        ...,
        description="True if the extraction pump is currently running.",
        examples=[False],
    )

    # --- Power System ---
    battery_level: int = Field(
        ..., ge=0, le=100,
        description="Battery charge percentage (0–100). "
                    "Backend triggers 'returning' mode automatically below 20%.",
        examples=[78],
    )
    battery_voltage: float = Field(
        ..., ge=0.0,
        description="Actual measured battery voltage in volts (e.g. 11.4 V).",
        examples=[11.4],
    )
    solar_charging: bool = Field(
        ...,
        description="True if the solar panel is currently charging the battery.",
        examples=[True],
    )
    power_source: Literal["solar", "battery"] = Field(
        ...,
        description="Active power source: 'solar' (panel output) or 'battery'.",
        examples=["solar"],
    )

    # --- Movement (ESP32 confirmed state) ---
    current_command: str = Field(
        ...,
        description="Last movement command the ESP32 actually executed.",
        examples=["forward"],
    )
    current_mode: str = Field(
        ...,
        description="Operating mode the ESP32 is currently running.",
        examples=["automatic"],
    )

    # UPDATED: Actual rudder angle reported by the ESP32 (read from servo feedback or
    # stored last-set value on the device). Optional with default 0 so older firmware
    # that does not yet send this field still passes validation without breaking.
    rudder_angle: Optional[int] = Field(
        default=0,
        ge=-90,
        le=90,
        description=(
            "Current rudder angle as reported by the ESP32 (-90 to +90). "
            "0 = straight ahead, negative = left, positive = right. "
            "Defaults to 0 if the ESP32 firmware does not send this field yet."
        ),
        examples=[0, -30, 45],
    )

    # UPDATED: Optional power rail status sent by ESP32 firmware.
    # Each sub-field is also Optional so the ESP32 can report only the rails
    # it has monitoring for, leaving the rest at their default True.
    # Set to None (omit entirely) if the firmware does not support rail reporting yet.
    power_rails: Optional[PowerRails] = Field(
        default=None,
        description=(
            "Optional status of the four voltage rails reported by the ESP32. "
            "Omit this field entirely if the firmware does not support rail monitoring. "
            "Any sub-field that is omitted defaults to True on the backend."
        ),
    )

    # --- System ---
    timestamp: datetime = Field(
        ...,
        description="UTC datetime when this status was recorded on the device (ISO 8601).",
        examples=["2026-02-24T10:30:00Z"],
    )


class StatusHistoryEntry(BaseModel):
    """One entry in the rolling status history log.

    Mirrors StatusUpdate fields plus a server-side received_at stamp
    so device-time vs server-arrival-time can be compared.
    """
    # Server-side timestamp
    received_at: datetime = Field(
        ...,
        description="UTC datetime when the server received and stored this entry.",
    )
    # GPS
    lat: float = Field(..., ge=-90.0, le=90.0, description="Device latitude at this timestamp.")
    lng: float = Field(..., ge=-180.0, le=180.0, description="Device longitude at this timestamp.")
    # IMU
    heading: float = Field(..., ge=0.0, lt=360.0, description="Compass heading in degrees (0–360).")
    tilt_x: float = Field(..., description="Accelerometer x-axis tilt in degrees.")
    tilt_y: float = Field(..., description="Accelerometer y-axis tilt in degrees.")
    gyro_z: float = Field(..., description="Gyroscope z-axis rotation rate in deg/sec.")
    # Sensors
    oil_detected: bool = Field(..., description="Capacitive sensor oil reading.")
    pump_status: bool = Field(..., description="True if the pump was running.")
    # Power
    battery_level: int = Field(..., ge=0, le=100, description="Battery percentage (0–100).")
    battery_voltage: float = Field(..., ge=0.0, description="Battery voltage in volts.")
    solar_charging: bool = Field(..., description="True if solar panel was charging.")
    power_source: Literal["solar", "battery"] = Field(..., description="Active power source.")
    # Movement
    current_command: str = Field(..., description="Command the ESP32 executed at this time.")
    current_mode: str = Field(..., description="Mode the ESP32 was in at this time.")
    # Device time
    timestamp: datetime = Field(..., description="UTC datetime recorded on the device.")


class StatusResponse(BaseModel):
    """Full system state returned by GET /status — read by the frontend dashboard."""

    # --- Backend-controlled state ---
    current_mode: Literal["manual", "automatic", "cleaning", "standby", "returning"] = Field(
        ..., description="Operating mode currently active on the backend.",
    )
    current_command: str = Field(
        ..., description="Latest movement command issued by the backend.",
    )
    target_gps: GPSCoords = Field(..., description="Active navigation target GPS.")
    home_gps: GPSCoords = Field(..., description="Saved home/dock GPS point.")
    last_detection: LastDetection = Field(..., description="Most recent YOLOv8 detection result.")

    # --- ESP32-reported live state ---
    device_gps: GPSCoords = Field(..., description="Current GPS position of the device.")
    heading: float = Field(..., ge=0.0, lt=360.0, description="Compass heading in degrees (0–360).")
    tilt_x: float = Field(..., description="Accelerometer x-axis tilt in degrees.")
    tilt_y: float = Field(..., description="Accelerometer y-axis tilt in degrees.")
    gyro_z: float = Field(..., description="Gyroscope z-axis rotation rate in deg/sec.")
    oil_detected: bool = Field(..., description="True if the capacitive sensor detects oil.")
    pump_status: bool = Field(..., description="True if the extraction pump is running.")

    # --- Power ---
    battery_level: int = Field(..., ge=0, le=100, description="Battery percentage (0–100).")
    battery_voltage: float = Field(..., ge=0.0, description="Battery voltage in volts.")
    solar_charging: bool = Field(..., description="True if the solar panel is currently charging.")
    power_source: Literal["solar", "battery"] = Field(..., description="Active power source.")

    # --- ESP32 confirmed movement state ---
    esp32_command: str = Field(..., description="Last command the ESP32 confirmed executing.")
    esp32_mode: str = Field(..., description="Operating mode the ESP32 is currently in.")
    # UPDATED: Actual rudder angle the ESP32 is reporting, mirroring the
    # esp32_command / esp32_mode pattern for ESP32-confirmed hardware state.
    esp32_rudder_angle: int = Field(
        default=0,
        ge=-90,
        le=90,
        description=(
            "Current rudder angle as last reported by the ESP32 via POST /status (-90 to +90). "
            "Compare against current_rudder_angle (backend-commanded) to detect servo lag."
        ),
    )

    # --- Timestamps ---
    last_updated: Optional[datetime] = Field(
        None,
        description="UTC datetime of the last POST /status update received. "
                    "Null if no update has been received yet.",
    )

    # --- Backend-computed navigation metrics ---
    distance_to_target: Optional[float] = Field(
        None,
        ge=0.0,
        description="Haversine distance in metres from the device to the active navigation target. "
                    "Null if no target has been set via POST /navigate.",
    )
    # UPDATED: proportional rudder angle the backend suggests for the current heading error.
    # Mirrors heading_error_to_rudder_angle() in core/utils.py.
    # Null when no navigation target is active.
    suggested_rudder_angle: Optional[int] = Field(
        None,
        ge=-90,
        le=90,
        description=(
            "Proportional rudder servo angle (-90 to +90) suggested by the backend "
            "heading correction loop. Computed from heading_error using the same "
            "step mapping used by GET /command. "
            "Null if no navigation target is active."
        ),
    )
    heading_error: Optional[float] = Field(
        None,
        ge=-180.0,
        le=180.0,
        description="Signed degrees between current heading and bearing to target. "
                    "Positive = needs to turn right, negative = turn left. "
                    "Null if no target has been set.",
    )
    time_since_last_update: Optional[float] = Field(
        None,
        ge=0.0,
        description="Seconds elapsed since the ESP32 last sent a POST /status update. "
                    "Null if no update received yet. Large values indicate a connection loss.",
    )


# ===========================================================================
# /detect  +  GET /detections  (routes/detection.py)
# ===========================================================================

class BBox(BaseModel):
    """Bounding box in image pixel coordinates (top-left origin)."""
    x1: float = Field(..., ge=0.0, description="Left edge of the bounding box (pixels).")
    y1: float = Field(..., ge=0.0, description="Top edge of the bounding box (pixels).")
    x2: float = Field(..., ge=0.0, description="Right edge of the bounding box (pixels).")
    y2: float = Field(..., ge=0.0, description="Bottom edge of the bounding box (pixels).")


class CenterPixel(BaseModel):
    """Centre pixel coordinate of a bounding box."""
    cx: float = Field(..., ge=0.0, description="Horizontal centre of the bounding box (pixels).")
    cy: float = Field(..., ge=0.0, description="Vertical centre of the bounding box (pixels).")


class DroneInfo(BaseModel):
    """Drone position and orientation metadata attached to an image capture."""
    lat: float = Field(
        ..., ge=-90.0, le=90.0,
        description="Drone latitude when the image was taken.",
    )
    lng: float = Field(
        ..., ge=-180.0, le=180.0,
        description="Drone longitude when the image was taken.",
    )
    altitude: float = Field(
        ..., ge=0.0,
        description="Drone altitude above ground level in metres (≥ 0).",
        examples=[30.0],
    )
    heading: float = Field(
        ..., ge=0.0, lt=360.0,
        description="Drone compass heading when the image was taken (0–360°).",
        examples=[90.0],
    )


class OilDetection(BaseModel):
    """A single confirmed oil detection from one YOLOv8 inference run."""
    detection_id: str = Field(..., description="Unique UUID assigned to this detection.")
    bbox: BBox = Field(..., description="Bounding box of the detection in pixel coordinates.")
    center_pixel: CenterPixel = Field(..., description="Centre pixel of the bounding box.")
    confidence: float = Field(
        ..., ge=0.40, le=1.0,
        description="YOLOv8 confidence score (0.60–1.0; detections below 60% are filtered out).",
    )
    class_name: str = Field(..., description="Detected class label (e.g. 'oil').")
    estimated_gps: GPSCoords = Field(
        ...,
        description="Projected real-world GPS position of the detection centre, "
                    "computed from drone position, altitude, heading, and camera FOV.",
    )
    area_sqm: float = Field(
        ..., ge=0.0,
        description="Estimated oil patch area in square metres, "
                    "derived from bounding box size × ground sample distance.",
    )


class DetectionResponse(BaseModel):
    """Response for POST /detect."""
    detections: list[OilDetection] = Field(
        default_factory=list,
        description="All detections that passed the 60% confidence threshold.",
    )
    total_detections: int = Field(
        ..., ge=0,
        description="Total number of valid detections returned.",
    )
    image_width: int = Field(
        ..., ge=1,
        description="Width of the uploaded image in pixels.",
    )
    image_height: int = Field(
        ..., ge=1,
        description="Height of the uploaded image in pixels.",
    )
    drone_info: DroneInfo = Field(
        ...,
        description="Drone position and orientation metadata from the request.",
    )
    timestamp: datetime = Field(
        ...,
        description="UTC datetime when the inference was performed on the server.",
    )


class OilDetectionEntry(BaseModel):
    """One entry in the persistent detection history log."""
    detection_id: str = Field(..., description="Unique UUID for this detection.")
    received_at: datetime = Field(..., description="UTC datetime when the server stored this entry.")
    drone_lat: float = Field(..., ge=-90.0, le=90.0, description="Drone latitude when image was captured.")
    drone_lng: float = Field(..., ge=-180.0, le=180.0, description="Drone longitude when image was captured.")
    drone_altitude: float = Field(..., ge=0.0, description="Drone altitude above ground in metres.")
    drone_heading: float = Field(..., ge=0.0, lt=360.0, description="Drone compass heading (0–360°).")
    image_width: int = Field(..., ge=1, description="Width of the source image in pixels.")
    image_height: int = Field(..., ge=1, description="Height of the source image in pixels.")
    bbox: BBox = Field(..., description="Bounding box in pixel coordinates.")
    center_pixel: CenterPixel = Field(..., description="Centre pixel of the bounding box.")
    confidence: float = Field(..., ge=0.0, le=1.0, description="YOLOv8 confidence score (0–1).")
    class_name: str = Field(..., description="Detected class label (e.g. 'oil').")
    estimated_gps: GPSCoords = Field(..., description="Projected real-world GPS of the detection.")
    area_sqm: float = Field(..., ge=0.0, description="Estimated oil area in square metres.")
    was_navigated_to: bool = Field(
        default=False,
        description="True if the device was sent to this detection location via POST /navigate.",
    )


class DetectionListItem(BaseModel):
    """Lightweight detection summary for GET /detections paginated list."""
    detection_id: str = Field(..., description="Unique UUID for this detection.")
    estimated_gps: GPSCoords = Field(..., description="Projected real-world GPS of the detection.")
    confidence: float = Field(..., ge=0.0, le=1.0, description="YOLOv8 confidence score (0–1).")
    timestamp: datetime = Field(..., description="UTC datetime when this detection was received.")
    was_navigated_to: bool = Field(
        ...,
        description="True if the device was sent to this detection location.",
    )


class DetectionListResponse(BaseModel):
    """Paginated response for GET /detections."""
    detections: list[DetectionListItem]
    total: int = Field(..., ge=0, description="Total detections matching the filter (before pagination).")
    returned: int = Field(..., ge=0, description="Number of detections in this page.")
    offset: int = Field(..., ge=0, description="Offset used for this page.")
    limit: int = Field(..., ge=1, description="Page size limit used for this page.")


# ===========================================================================
# /cleaning  (routes/cleaning.py)
# ===========================================================================

class CleaningStartRequest(BaseModel):
    """Body for POST /cleaning/start — defines the outward spiral cleaning pattern."""
    center_lat: float = Field(
        ..., ge=-90.0, le=90.0,
        description="Latitude of the spiral centre (oil location).",
        examples=[14.5995],
    )
    center_lng: float = Field(
        ..., ge=-180.0, le=180.0,
        description="Longitude of the spiral centre (oil location).",
        examples=[120.9842],
    )
    max_radius: float = Field(
        default=5.0, gt=0.0,
        description="Maximum spiral radius in metres. Default 5.0 m.",
        examples=[5.0],
    )
    step_size: float = Field(
        default=0.5, gt=0.0,
        description="Radius expansion per ring and approximate arc spacing in metres. Default 0.5 m.",
        examples=[0.5],
    )
    # UPDATED: per-loop speed control for the BTS7960 43A motor drivers (PWM 0-255).
    # inner_speed applies to the tightest (smallest radius) rings;
    # outer_speed applies to the widest (largest radius) rings.
    # All rings in between are linearly interpolated between the two values.
    inner_speed: Optional[int] = Field(
        default=120,
        ge=0,
        le=255,
        description=(
            "PWM speed for the innermost spiral loops (0–255). Default 120. "
            "Lower speed helps the boat complete tight-radius arcs without overshooting."
        ),
        examples=[120],
    )
    outer_speed: Optional[int] = Field(
        default=180,
        ge=0,
        le=255,
        description=(
            "PWM speed for the outermost spiral loops (0–255). Default 180. "
            "Higher speed is efficient on wide-radius arcs with gentle turns."
        ),
        examples=[180],
    )


class CleaningWaypoint(BaseModel):
    """One waypoint in the generated spiral cleaning pattern.

    UPDATED: turn_angle is now a rudder servo angle (-90 to +90) rather than
    a compass bearing. speed is a new PWM value for the BTS7960 motor drivers.
    Both are scaled per ring — tighter inner rings get sharper angles and slower
    speeds; wider outer rings get gentle angles and faster speeds.
    """
    lat: float = Field(..., ge=-90.0, le=90.0, description="Waypoint latitude.")
    lng: float = Field(..., ge=-180.0, le=180.0, description="Waypoint longitude.")
    # UPDATED: rudder servo angle for this arc segment (-90 = full left, +90 = full right).
    # Replaces the old compass bearing. The heading correction loop in GET /command
    # still computes the actual turn direction; this angle tells the ESP32 how sharp
    # to set the rudder servos for this segment.
    turn_angle: int = Field(
        ..., ge=-90, le=90,
        description=(
            "Rudder servo angle for this arc segment (-90 to +90). "
            "Larger absolute value = tighter turn (inner loops). "
            "Smaller absolute value = gentler arc (outer loops)."
        ),
    )
    distance: float = Field(
        ..., ge=0.0,
        description="Distance in metres from the previous waypoint.",
    )
    radius: float = Field(
        ..., ge=0.0,
        description="Spiral ring radius this waypoint belongs to, in metres.",
    )
    # UPDATED: PWM speed for the BTS7960 43A motor drivers on this arc segment.
    # Slower on tight inner loops (default ~120), faster on wide outer loops (default ~180).
    speed: int = Field(
        ..., ge=0, le=255,
        description=(
            "PWM speed for the BTS7960 motor drivers on this arc segment (0–255). "
            "Inner tight loops use a slower speed; outer wide loops use a faster speed."
        ),
    )


class CleaningStartResponse(BaseModel):
    """Response for POST /cleaning/start."""
    active: bool = Field(..., description="Always True when cleaning has started successfully.")
    center: GPSCoords = Field(..., description="GPS centre of the spiral pattern.")
    max_radius: float = Field(..., ge=0.0, description="Maximum spiral radius in metres.")
    step_size: float = Field(..., gt=0.0, description="Ring step size in metres.")
    total_waypoints: int = Field(..., ge=0, description="Total number of waypoints in the queue.")
    mode: Literal["cleaning"] = Field(
        default="cleaning",
        description="Operating mode now active (always 'cleaning').",
    )
    first_command: Literal["forward", "turn_left", "turn_right", "stop"] = Field(
        ...,
        description="First movement command computed for the first waypoint.",
    )


class CleaningStatusResponse(BaseModel):
    """Response for GET /cleaning/status."""
    active: bool = Field(..., description="True if a cleaning operation is currently running.")
    current_waypoint_index: int = Field(
        ..., ge=0,
        description="Index of the next waypoint to be navigated to (0-based).",
    )
    total_waypoints: int = Field(..., ge=0, description="Total waypoints in this cleaning run.")
    progress_percent: float = Field(
        ..., ge=0.0, le=100.0,
        description="Cleaning progress as a percentage (0.0–100.0).",
    )
    center: GPSCoords = Field(..., description="GPS centre of the spiral pattern.")
    current_radius: float = Field(
        ..., ge=0.0,
        description="Spiral ring radius the device is currently on, in metres.",
    )


# ===========================================================================
# /home  (routes/home.py)
# ===========================================================================

class HomeResponse(BaseModel):
    """Response for GET /home and POST /home/set."""
    home_set: bool = Field(
        ...,
        description="True if a home GPS point has been saved (manually or auto from first status).",
    )
    lat: Optional[float] = Field(
        None, ge=-90.0, le=90.0,
        description="Home latitude (−90 to +90). Null if home has not been set yet.",
    )
    lng: Optional[float] = Field(
        None, ge=-180.0, le=180.0,
        description="Home longitude (−180 to +180). Null if home has not been set yet.",
    )
    saved_at: Optional[datetime] = Field(
        None,
        description="UTC datetime when home was last saved. Null if not set yet.",
    )


# ===========================================================================
# /battery  (routes/battery.py)
# ===========================================================================

# UPDATED: Nested model representing the four buck/step-down converter rails
# on the boat (12V motors, 5V logic, 3.3V sensors, servo rail).
class PowerRails(BaseModel):
    """Status of the four buck/step-down converter voltage rails.

    Each field is Optional[bool] with default True because the ESP32 firmware
    does not yet have dedicated rail-monitoring sensors.

    TODO (future): When voltage-sense resistors or digital monitoring is added
    to the ESP32, set these to the real measured values instead of defaulting to True.
    """
    # UPDATED: 12V rail powers the double BTS7960 43A motor drivers and extraction pump
    motors_12v: Optional[bool] = Field(
        default=True,
        description=(
            "True if the 12V rail is active (powers BTS7960 motor drivers and pump). "
            "Defaults to True until hardware rail monitoring is implemented."
        ),
    )
    # UPDATED: 5V rail powers the ESP32 microcontroller
    logic_5v: Optional[bool] = Field(
        default=True,
        description=(
            "True if the 5V rail is active (powers the ESP32). "
            "Defaults to True until hardware rail monitoring is implemented."
        ),
    )
    # UPDATED: 3.3V rail powers the ICM-20948 IMU and NEO-M8N GPS sensor
    sensors_3v3: Optional[bool] = Field(
        default=True,
        description=(
            "True if the 3.3V rail is active (powers ICM-20948 IMU and NEO-M8N GPS). "
            "Defaults to True until hardware rail monitoring is implemented."
        ),
    )
    # UPDATED: Servo rail powers the two S020A-180 waterproof rudder servos
    servos_rail: Optional[bool] = Field(
        default=True,
        description=(
            "True if the servo rail is active (powers S020A-180 rudder servos). "
            "Defaults to True until hardware rail monitoring is implemented."
        ),
    )


class BatteryResponse(BaseModel):
    """Response for GET /battery — latest power system snapshot."""
    battery_level: int = Field(
        ..., ge=0, le=100,
        description="Battery charge percentage (0–100).",
    )
    battery_voltage: float = Field(
        ..., ge=0.0,
        description="Actual measured battery voltage in volts.",
        examples=[11.4],
    )
    solar_charging: bool = Field(
        ...,
        description="True if the solar panel is currently providing charge.",
    )
    power_source: Literal["solar", "battery"] = Field(
        ...,
        description="Active power source: 'solar' or 'battery'.",
    )
    low_battery_warning: bool = Field(
        ...,
        description="True when battery_level is below 20%. "
                    "The backend will auto-switch to 'returning' mode.",
    )
    estimated_runtime: Optional[str] = Field(
        None,
        description="Linear runtime estimate based on current battery level "
                    "(e.g. '~45 minutes'). Null until the first POST /status is received.",
        examples=["~45 minutes"],
    )
    # UPDATED: Status of all four buck/step-down converter rails.
    # Defaults to all True until the ESP32 firmware reports real rail readings.
    power_rails: PowerRails = Field(
        default_factory=PowerRails,
        description=(
            "Status of the four voltage rails (12V motors, 5V logic, 3.3V sensors, servo). "
            "All True by default — will reflect real values once ESP32 rail monitoring is added."
        ),
    )
    data_initialized: bool = Field(
        ...,
        description=(
            "True once at least one POST /status has been received from the ESP32. "
            "False means all battery values are still defaults and have not been updated by the device."
        ),
    )


class BatteryHistoryEntry(BaseModel):
    """One power system snapshot extracted from the status history log."""
    timestamp: datetime = Field(..., description="UTC datetime when this status was recorded.")
    battery_level: int = Field(..., ge=0, le=100, description="Battery percentage (0–100).")
    battery_voltage: float = Field(..., ge=0.0, description="Battery voltage in volts.")
    solar_charging: bool = Field(..., description="True if the solar panel was charging.")
    power_source: Literal["solar", "battery"] = Field(..., description="Active power source.")


# ===========================================================================
# /logs  (routes/logs.py)
# ===========================================================================

class LogEntry(BaseModel):
    """One entry in the chronological activity log."""
    timestamp: datetime = Field(..., description="UTC datetime when the event was recorded.")
    event_type: Literal[
        "command", "mode_change", "detection",
        "navigation", "cleaning", "status", "warning", "error",
    ] = Field(
        ...,
        description="Event category.",
    )
    message: str = Field(..., description="Human-readable description of the event.")
    data: dict = Field(
        default_factory=dict,
        description="Optional structured context for the event (IDs, values, GPS, etc.).",
    )


class LogsResponse(BaseModel):
    """Response for GET /logs."""
    logs: list[LogEntry] = Field(..., description="Log entries (newest first).")
    total: int = Field(..., ge=0, description="Total entries in the log after filtering.")
    returned: int = Field(..., ge=0, description="Number of entries in this response.")


class ClearLogsRequest(BaseModel):
    """Body for DELETE /logs — requires explicit confirmation to prevent accidents."""
    confirm: bool = Field(
        ...,
        description="Must be True to clear the log. Prevents accidental deletions.",
        examples=[True],
    )


# ===========================================================================
# /filter  (routes/filter.py)
# ===========================================================================

class FilterStatusRequest(BaseModel):
    """Body for POST /filter/status — operator updates the physical hair filter flag."""
    status: Literal["clean", "needs_replacement"] = Field(
        ...,
        description="Current condition of the physical hair filter.",
        examples=["needs_replacement"],
    )


class FilterStatusResponse(BaseModel):
    """Response for GET and POST /filter/status."""
    status: Literal["clean", "needs_replacement"] = Field(
        ...,
        description="Current filter status.",
    )
    needs_replacement: bool = Field(
        ...,
        description="True when status is 'needs_replacement'. "
                    "Convenience field for frontend badge logic.",
    )
    last_updated: Optional[datetime] = Field(
        None,
        description="UTC datetime of the last manual status change. Null if never updated.",
    )
