# Oil-Water Separation System — Backend API

A FastAPI backend for an intelligent oil-water separation thesis project.
The system controls an ESP32-powered surface boat that autonomously detects, navigates to, and cleans oil slicks from the water surface using a YOLOv8 computer vision model.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [Project Structure](#3-project-structure)
4. [Setup & Running](#4-setup--running)
5. [Response Format](#5-response-format)
6. [API Endpoints Reference](#6-api-endpoints-reference)
   - [Health](#health)
   - [Commands & Mode](#commands--mode)
   - [Device Status](#device-status)
   - [Oil Detection](#oil-detection)
   - [Cleaning Pattern](#cleaning-pattern)
   - [Home Reference](#home-reference)
   - [Battery & Solar](#battery--solar)
   - [Filter Status](#filter-status)
   - [Activity Logs](#activity-logs)
7. [Operating Modes](#7-operating-modes)
8. [Command Reference](#8-command-reference)
9. [Autonomous Navigation](#9-autonomous-navigation)
10. [Oil Detection Pipeline](#10-oil-detection-pipeline)
11. [Spiral Cleaning Pattern](#11-spiral-cleaning-pattern)
12. [State Management](#12-state-management)
13. [Activity Logging](#13-activity-logging)
14. [Error Handling](#14-error-handling)

---

## 1. System Overview

The system has three layers that work together:

```
┌─────────────────────────────────────────────────────────┐
│  FRONTEND  (Web Dashboard)                              │
│  - Sends commands, mode changes, navigation targets     │
│  - Displays live GPS, sensor data, detection results    │
│  - Shows battery, filter status, and activity logs      │
└────────────────────┬────────────────────────────────────┘
                     │  HTTP / REST API
                     ▼
┌─────────────────────────────────────────────────────────┐
│  FASTAPI BACKEND  (This project)                        │
│  - Stores all system state in memory (AppState class)   │
│  - Runs YOLOv8 inference on uploaded drone images       │
│  - Computes GPS coordinates from pixel detections       │
│  - Runs the autonomous heading-correction loop          │
│  - Generates spiral cleaning waypoints                  │
└────────────────────┬────────────────────────────────────┘
                     │  HTTP polling (ESP32 side)
                     ▼
┌─────────────────────────────────────────────────────────┐
│  ESP32 MICROCONTROLLER  (On the boat)                   │
│  - Polls GET /command every second to get its order     │
│  - Sends POST /status with all sensor readings          │
│  - Executes commands: propellers, rudders, pump         │
│  - Sensors: GPS (NEO-M8N), IMU (ICM-20948), capacitive │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Architecture

### Why in-memory state?

All system data is stored in a single `AppState` class instance (`core/state.py`).
There is no database. This is intentional for a thesis demo:
- Zero setup — no database server needed
- Instant reads — state access is a Python attribute lookup
- Simple to debug — `print(app_state["battery_level"])` anywhere

The trade-off is that all data is **lost when the server restarts**. For a thesis
demo running over a few hours, this is perfectly fine.

### How polling works

The ESP32 does **not** receive push notifications. Instead:

1. The ESP32 calls `GET /command` every ~1 second to receive its next command.
2. The ESP32 calls `POST /status` every ~1 second to report its sensor readings.
3. In autonomous modes the backend computes a new command on **every** `GET /command`
   poll based on the latest GPS and heading from the most recent `POST /status`.

This simple polling design avoids WebSockets, MQTT, or any other real-time protocol
while still giving ~1-second response latency.

---

## 3. Project Structure

```
THESIS API/
│
├── main.py                  # App entry point — routers, CORS, lifespan, health
│
├── core/
│   ├── state.py             # AppState class — single source of truth for all data
│   ├── response.py          # make_response() helper for consistent JSON envelopes
│   ├── utils.py             # GPS math: Haversine, bearing, GSD, pixel_to_gps, spiral
│   └── logger.py            # log_event() — writes to the in-memory activity log
│
├── ml/
│   ├── detector.py          # YOLOv8 load_model() and run_inference() helpers
│   └── best.pt              # ← Your trained YOLOv8 weights file (you add this)
│
├── models/
│   └── schemas.py           # All Pydantic request/response schemas
│
├── routes/
│   ├── commands.py          # GET /command, POST /command, POST /mode, POST /navigate
│   ├── status.py            # POST /status, GET /status, GET /status/history
│   ├── detection.py         # POST /detect, GET /detect/history, GET /detections
│   ├── cleaning.py          # POST /cleaning/start, POST /cleaning/stop, GET /cleaning/status
│   ├── home.py              # POST /home/set, GET /home
│   ├── battery.py           # GET /battery, GET /battery/history
│   ├── filter.py            # POST /filter/status, GET /filter/status
│   └── logs.py              # GET /logs, DELETE /logs
│
└── requirements.txt         # Python dependencies
```

---

## 4. Setup & Running

### Requirements

- Python 3.10 or higher
- Your trained YOLOv8 model file saved as `ml/best.pt`

### Install dependencies

First, navigate to the `backend` folder (if you're not already there):

```bash
cd backend
```

Then install dependencies:

```bash
pip install -r requirements.txt
```

The `requirements.txt` includes:
- `fastapi` — the web framework
- `uvicorn[standard]` — the ASGI server
- `ultralytics` — YOLOv8 from Ultralytics
- `Pillow` — image decoding for uploaded drone images
- `python-multipart` — required for file uploads (multipart/form-data)

### Start the server

From inside the `backend` folder, run:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

- `--host 0.0.0.0` makes the server accessible from other devices on your network
  (so the ESP32 and the frontend can reach it).
- `--port 8000` is the default; change if needed.
- `--reload` automatically restarts the server when you save a file (dev only).

### Access the auto-generated API docs

Once running, open your browser:

| URL | Description |
|-----|-------------|
| `http://localhost:8000/docs` | Interactive Swagger UI — test every endpoint in the browser |
| `http://localhost:8000/redoc` | Read-only ReDoc documentation |
| `http://localhost:8000/health` | Quick health check |

---

## 5. Response Format

**Every single endpoint** returns the same JSON envelope:

```json
{
  "success": true,
  "data": { ... },
  "message": "Human-readable description of what happened.",
  "timestamp": "2026-02-24T10:30:00.000000+00:00"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `success` | `bool` | `true` on success, `false` on error |
| `data` | `any` | The endpoint-specific payload (object, list, or null) |
| `message` | `string` | Short description of the result |
| `timestamp` | `datetime` | UTC timestamp when the response was generated |

### Error responses

Errors (HTTP 4xx / 5xx) also use the same envelope with `success: false`:

```json
{
  "success": false,
  "data": null,
  "message": "Cannot send command 'forward' while in 'automatic' mode.",
  "timestamp": "2026-02-24T10:30:00.000000+00:00"
}
```

Validation errors (HTTP 422) include the Pydantic error details in `data`:

```json
{
  "success": false,
  "data": { "validation_errors": [ ... ] },
  "message": "Validation failed — body.command: Input should be 'forward' or ...",
  "timestamp": "2026-02-24T10:30:00.000000+00:00"
}
```

---

## 6. API Endpoints Reference

### Health

#### `GET /`
Quick liveness check. Returns 200 if the server is running.

**Response `data`:**
```json
{ "docs": "/docs", "health": "/health" }
```

---

#### `GET /health`
Detailed readiness check. Useful for monitoring dashboards.

**Response `data`:**
```json
{
  "status": "ok",
  "model_loaded": true,
  "device_connected": true,
  "uptime_seconds": 3621.5,
  "version": "1.0.0"
}
```

| Field | Description |
|-------|-------------|
| `model_loaded` | True once `ml/best.pt` has been loaded successfully |
| `device_connected` | True if the ESP32 sent a `POST /status` within the last 10 seconds |
| `uptime_seconds` | Seconds since the server process started |

---

### Commands & Mode

#### `GET /command`
The ESP32 calls this every ~1 second to receive its next movement command.

In **automatic** or **cleaning** mode, the backend computes a new command on
every call based on current GPS and heading. In all other modes it returns
whatever was last set via `POST /command`.

**Response `data`:**
```json
{ "command": "forward" }
```

---

#### `POST /command`
Frontend sends a command. The command is stored and returned on the next `GET /command` poll.

**Priority rules:**
- `emergency_stop` — always accepted, cuts all motors and pump immediately
- `return_home` — always accepted, navigates device back to home GPS
- All others — only accepted when mode is `"manual"`

**Request body:**
```json
{ "command": "forward" }
```

**Valid commands:**

| Category | Values |
|----------|--------|
| Movement | `forward`, `backward`, `turn_left`, `turn_right`, `forward_left`, `forward_right`, `stop` |
| Pump     | `pump_on`, `pump_off` |
| System   | `return_home`, `emergency_stop` |

---

#### `POST /mode`
Switch the device's operating mode.

**Request body:**
```json
{ "mode": "automatic" }
```

**Valid modes:** `manual`, `automatic`, `cleaning`, `standby`, `returning`

See [Operating Modes](#7-operating-modes) for a full description of each mode.

---

#### `POST /navigate`
Set a GPS destination and begin autonomous navigation.
Mode is automatically switched to `"automatic"`.

**Request body:**
```json
{
  "target_lat": 14.5995,
  "target_lng": 120.9842,
  "source": "manual_input",
  "detection_id": null,
  "home": false
}
```

| Field | Description |
|-------|-------------|
| `target_lat` / `target_lng` | Destination GPS (required unless `home=true`) |
| `source` | `"manual_input"` or `"detection"` |
| `detection_id` | Required when `source="detection"` — marks that detection as visited |
| `home` | If `true`, ignores lat/lng and navigates to the saved home GPS point |

**Response `data`:**
```json
{
  "target_gps": { "lat": 14.5995, "lng": 120.9842 },
  "source": "manual_input",
  "mode": "automatic",
  "initial_distance_m": 45.3,
  "initial_bearing": 127.8,
  "first_command": "turn_right"
}
```

---

### Device Status

#### `POST /status`
The ESP32 sends this on every polling cycle with all sensor readings.

**Request body:**
```json
{
  "lat": 14.5995,
  "lng": 120.9842,
  "heading": 135.0,
  "tilt_x": 1.2,
  "tilt_y": -0.5,
  "gyro_z": 0.03,
  "oil_detected": false,
  "pump_status": false,
  "battery_level": 85,
  "battery_voltage": 11.4,
  "solar_charging": true,
  "power_source": "solar",
  "current_command": "forward",
  "current_mode": "automatic",
  "timestamp": "2026-02-24T10:30:00Z"
}
```

**Response `data`** (echoed back so ESP32 can act immediately):
```json
{
  "current_mode": "automatic",
  "current_command": "forward",
  "pump_status": false
}
```

---

#### `GET /status`
Frontend reads the complete current system snapshot.

**Response `data`** includes all ESP32-reported fields plus three backend-computed metrics:

| Computed Field | Description |
|----------------|-------------|
| `distance_to_target` | Metres from device to navigation target. `null` if no target is set. |
| `heading_error` | Degrees to rotate to face the target. Positive = turn right. `null` if no target. |
| `time_since_last_update` | Seconds since ESP32 last sent `POST /status`. |

---

#### `GET /status/history`
Returns the rolling log of the last 100 status updates.

**Response `data`:**
```json
{
  "entries": [ { "received_at": "...", "lat": 14.5, "battery_level": 85, ... } ],
  "total": 47
}
```

---

### Oil Detection

#### `POST /detect`
Upload a drone image and run YOLOv8 oil detection. Sent as `multipart/form-data`.

**Form fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | file | Yes | JPEG or PNG image |
| `drone_lat` | float | Yes | Drone latitude |
| `drone_lng` | float | Yes | Drone longitude |
| `drone_altitude` | float | Yes | Altitude above water in metres |
| `drone_heading` | float | Yes | Compass heading 0–360° |
| `fov` | float | No | Camera FOV in degrees (default 84°) |

**Response `data`:**
```json
{
  "detections": [
    {
      "detection_id": "3fa85f64-...",
      "bbox": { "x1": 120.5, "y1": 80.2, "x2": 340.1, "y2": 210.7 },
      "center_pixel": { "cx": 230.3, "cy": 145.4 },
      "confidence": 0.923,
      "class_name": "oil",
      "estimated_gps": { "lat": 14.5995, "lng": 120.9842 },
      "area_sqm": 4.32
    }
  ],
  "total_detections": 1,
  "image_width": 1280,
  "image_height": 720,
  "drone_info": { "lat": 14.6, "lng": 120.98, "altitude": 20.0, "heading": 90.0 },
  "timestamp": "2026-02-24T10:30:00Z"
}
```

> **Note:** Only detections with ≥ 60% confidence are included.

---

#### `GET /detect/history`
Returns the full unfiltered detection history (all fields, all detections).
Use `GET /detections` for a paginated summary view.

---

#### `GET /detections`
Returns a paginated, filterable summary list of past detections.

**Query parameters:**

| Parameter | Default | Description |
|-----------|---------|-------------|
| `limit` | 20 | Max results per page |
| `offset` | 0 | Skip N results (pagination) |
| `min_confidence` | 0.0 | Minimum confidence score filter |

**Example:** `GET /detections?limit=10&min_confidence=0.8`

---

### Cleaning Pattern

#### `POST /cleaning/start`
Generate a spiral waypoint queue and begin automated cleaning.

**Request body:**
```json
{
  "center_lat": 14.5995,
  "center_lng": 120.9842,
  "max_radius": 5.0,
  "step_size": 0.5
}
```

| Field | Description |
|-------|-------------|
| `center_lat` / `center_lng` | Centre of the spiral (the oil slick location) |
| `max_radius` | Outer radius of the spiral in metres (default 5.0 m) |
| `step_size` | Radius increment per ring and arc spacing in metres (default 0.5 m) |

**Response `data`:**
```json
{
  "active": true,
  "center": { "lat": 14.5995, "lng": 120.9842 },
  "max_radius": 5.0,
  "step_size": 0.5,
  "total_waypoints": 94,
  "mode": "cleaning",
  "first_command": "forward"
}
```

---

#### `POST /cleaning/stop`
Abort the active cleaning operation. Returns to standby.

No request body needed.

**Response `data`:**
```json
{ "waypoints_completed": 42, "waypoints_total": 94, "mode": "standby" }
```

---

#### `GET /cleaning/status`
Returns real-time cleaning progress.

**Response `data`:**
```json
{
  "active": true,
  "current_waypoint_index": 42,
  "total_waypoints": 94,
  "progress_percent": 44.7,
  "center": { "lat": 14.5995, "lng": 120.9842 },
  "current_radius": 2.5
}
```

---

### Home Reference

#### `POST /home/set`
Save the device's current GPS position as the home reference point.
Requires at least one `POST /status` update to have been received.

No request body needed.

**Response `data`:**
```json
{ "home_set": true, "lat": 14.5995, "lng": 120.9842, "saved_at": "2026-02-24T10:00:00Z" }
```

---

#### `GET /home`
Return the saved home coordinates.

**Response `data`:** Same as above, or `{ "home_set": false, "lat": null, "lng": null, "saved_at": null }` if home has not been set.

> **Tip:** Home is auto-saved from the first `POST /status` update, so this endpoint almost always returns a real value after the device connects.

---

### Battery & Solar

#### `GET /battery`
Latest power system snapshot.

**Response `data`:**
```json
{
  "battery_level": 85,
  "battery_voltage": 11.4,
  "solar_charging": true,
  "power_source": "solar",
  "low_battery_warning": false,
  "estimated_runtime": "~1 hr 42 min"
}
```

The `low_battery_warning` flag is `true` when `battery_level < 20%`.
At that threshold, `POST /status` automatically switches mode to `"returning"`.

---

#### `GET /battery/history`
Battery level over time extracted from the status history.

**Query parameters:** `limit` (default 50, max 500)

**Response `data`:**
```json
{
  "entries": [
    { "timestamp": "...", "battery_level": 92, "battery_voltage": 11.8, "solar_charging": false, "power_source": "battery" }
  ],
  "total": 47
}
```

---

### Filter Status

The physical oil-absorption filter is made from human hair and must be replaced manually.
These endpoints are purely a **UI flag** — they do not control any hardware.

#### `POST /filter/status`
Update the filter condition.

**Request body:**
```json
{ "status": "needs_replacement" }
```

Valid values: `"clean"` or `"needs_replacement"`

---

#### `GET /filter/status`
Read the current filter condition.

**Response `data`:**
```json
{
  "status": "needs_replacement",
  "needs_replacement": true,
  "last_updated": "2026-02-24T09:15:00Z"
}
```

---

### Activity Logs

#### `GET /logs`
Returns the activity log, most recent first.

**Query parameters:**

| Parameter | Default | Description |
|-----------|---------|-------------|
| `limit` | 50 | Max entries to return |
| `event_type` | null | Filter by category |

**Valid `event_type` values:** `command`, `mode_change`, `detection`, `navigation`, `cleaning`, `status`, `warning`, `error`

**Example:** `GET /logs?event_type=warning&limit=20`

**Response `data`:**
```json
{
  "logs": [
    {
      "timestamp": "2026-02-24T10:30:00Z",
      "event_type": "warning",
      "message": "Low battery (18%) — auto-switching to 'returning'.",
      "data": { "battery_level": 18, "previous_mode": "automatic" }
    }
  ],
  "total": 135,
  "returned": 1
}
```

---

#### `DELETE /logs`
Clear the entire activity log. Requires confirmation.

**Request body:**
```json
{ "confirm": true }
```

**Response `data`:**
```json
{ "entries_removed": 135 }
```

---

## 7. Operating Modes

| Mode | Description | Side effects on entry |
|------|-------------|----------------------|
| `manual` | Operator controls the device directly via `POST /command` | Clears navigation target; resets command to `stop` |
| `automatic` | Device navigates autonomously to a GPS target | Requires `POST /navigate` to set a target first |
| `cleaning` | Device executes a spiral cleaning pattern | Requires `POST /cleaning/start` to generate waypoints first |
| `standby` | Device is idle — motors off, only sending status updates | Sets command to `stop`; turns pump off |
| `returning` | Device navigates back to the saved home GPS point | Sets command to `return_home` |

### Automatic mode transitions

| Trigger | New Mode |
|---------|----------|
| Navigation target reached (distance ≤ 2 m) | `standby` |
| All cleaning waypoints consumed | `standby` |
| `battery_level < 20%` | `returning` |
| `emergency_stop` command issued | any (command overrides mode) |

---

## 8. Command Reference

| Command | Category | Description |
|---------|----------|-------------|
| `forward` | Movement | Both propellers forward, rudders straight |
| `backward` | Movement | Both propellers reverse |
| `turn_left` | Movement | Rudders angled left, propellers forward |
| `turn_right` | Movement | Rudders angled right, propellers forward |
| `forward_left` | Movement | Forward with gradual left curve |
| `forward_right` | Movement | Forward with gradual right curve |
| `stop` | Movement | Both propellers stop gracefully |
| `pump_on` | Pump | Activate the oil extraction pump |
| `pump_off` | Pump | Deactivate the oil extraction pump |
| `return_home` | System | Navigate device back to saved home GPS point |
| `emergency_stop` | System | Immediately cut all motors and pump (highest priority) |

---

## 9. Autonomous Navigation

When mode is `"automatic"` and a target GPS is set, the backend runs a
**heading correction loop** on every `GET /command` poll:

```
Current GPS + Current Heading
           │
           ▼
  bearing_to_target()   ← calculates compass direction to destination
           │
           ▼
  compute_heading_error()  ← difference between current heading and bearing
           │
           ▼
  ┌─────────────────────────────────────────────────────┐
  │ distance ≤ 2 m       → "stop"  (arrived)            │
  │ |heading_error| ≤ 10°→ "forward"                    │
  │ heading_error > 10°  → "turn_right"                 │
  │ heading_error < -10° → "turn_left"                  │
  └─────────────────────────────────────────────────────┘
```

The thresholds (2 m arrival radius, ±10° tolerance) are defined in
`core/utils.py → compute_navigation_command()` and can be adjusted there.

---

## 10. Oil Detection Pipeline

```
POST /detect (multipart: image + drone metadata)
    │
    ▼
1. Validate file type (JPEG/PNG only)
    │
    ▼
2. Decode image with Pillow
    │
    ▼
3. Run YOLOv8 inference  ← ml/detector.py → run_inference()
   Filter: keep only detections ≥ 60% confidence
    │
    ▼
4. For each detection:
   a. Compute bounding-box centre pixel (cx, cy)
   b. compute_gsd() → metres per pixel at drone altitude
   c. pixel_to_gps() → project (cx, cy) to real GPS coordinates
   d. area_sqm = (bbox_width_px × gsd) × (bbox_height_px × gsd)
   e. Assign UUID as detection_id
    │
    ▼
5. Save all detections to detection_history (rolling, max 500)
    │
    ▼
6. Update app_state["last_detection"] with the best result
    │
    ▼
7. Return DetectionResponse with all geo-referenced detections
```

### GPS projection explained

The `pixel_to_gps()` function converts a pixel coordinate in a nadir
(straight-down) image to real-world GPS coordinates:

1. Compute the pixel's offset from the image centre in pixels.
2. Multiply by GSD to get the offset in metres (in drone-body frame).
3. Rotate by the drone heading to convert to North-East frame.
4. Add the North offset to drone latitude and East offset to drone longitude.

This assumes the camera points straight down. For tilted cameras the
calculation would need a more complex projection.

---

## 11. Spiral Cleaning Pattern

The `generate_spiral_waypoints()` function in `core/utils.py` creates an
outward Archimedean spiral:

```
Ring 1: radius = step_size       (e.g. 0.5 m)
Ring 2: radius = 2 × step_size   (e.g. 1.0 m)
Ring 3: radius = 3 × step_size   (e.g. 1.5 m)
  ...
Ring N: radius = max_radius      (e.g. 5.0 m)
```

Each ring has a number of waypoints proportional to its circumference so
the arc spacing between consecutive waypoints stays approximately equal to
`step_size`. This means outer rings have more waypoints than inner rings,
giving consistent coverage density.

During cleaning:
- The device navigates to each waypoint using the same heading-correction loop
  as autonomous navigation.
- When the device is within 2 m of a waypoint, the backend automatically
  advances to the next one.
- `GET /cleaning/status` shows live progress.

---

## 12. State Management

All runtime state lives in a single `AppState` instance in `core/state.py`.

```python
from core.state import app_state

app_state["battery_level"]          # read a value
app_state["current_mode"] = "manual" # write a value
app_state.get("model", None)        # read with default
```

### Key state fields

| Field | Type | Description |
|-------|------|-------------|
| `current_mode` | str | Current operating mode |
| `current_command` | str | Next command for the ESP32 |
| `device_gps` | dict | Latest GPS from ESP32 `{lat, lng}` |
| `target_gps` | dict | Navigation destination `{lat, lng}` |
| `target_set` | bool | True when a real navigation target is active |
| `home_gps` | dict | Saved home reference point `{lat, lng}` |
| `heading` | float | Latest compass heading from IMU |
| `battery_level` | int | Battery percentage 0–100 |
| `model` | YOLO | Loaded YOLOv8 model instance |
| `status_history` | list | Rolling log of ESP32 status updates (max 100) |
| `detection_history` | list | Rolling log of oil detections (max 500) |
| `event_log` | list | Activity log (max 1000 entries) |
| `cleaning` | dict | All cleaning pattern state and waypoints |

---

## 13. Activity Logging

The `log_event()` function in `core/logger.py` is called by route handlers
at every significant event:

```python
from core.logger import log_event

log_event(
    event_type="warning",
    message="Low battery (18%) — auto-switching to 'returning'.",
    data={"battery_level": 18, "previous_mode": "automatic"}
)
```

| Event Type | When it is logged |
|------------|-------------------|
| `command` | A movement or pump command is issued |
| `mode_change` | The operating mode is switched |
| `detection` | YOLOv8 inference completes (with or without results) |
| `navigation` | Navigation starts or a target is reached |
| `cleaning` | Cleaning starts, completes, or is stopped |
| `warning` | Low battery auto-return is triggered |
| `error` | An unexpected operation fails |

Retrieve logs via `GET /logs`. Clear them before a new demo run via `DELETE /logs`.

---

## 14. Error Handling

All errors return the standard `{ success, data, message, timestamp }` envelope.

### HTTP status codes used

| Code | Meaning | Example |
|------|---------|---------|
| 200 | OK | Successful request |
| 400 | Bad Request | Invalid state (wrong mode, home not set, etc.) |
| 409 | Conflict | Starting cleaning while cleaning is already active |
| 422 | Unprocessable Entity | Pydantic validation failure (invalid command string, etc.) |
| 503 | Service Unavailable | `POST /detect` called but YOLOv8 model not loaded |
| 500 | Internal Server Error | Unexpected crash (handler in `main.py`) |

### Common errors

| Endpoint | Error | Reason |
|----------|-------|--------|
| `POST /command` | 400 | Sending a movement command when not in manual mode |
| `POST /navigate` | 400 | Navigating home when home GPS was never set |
| `POST /navigate` | 422 | `source="detection"` but no `detection_id` provided |
| `POST /detect` | 422 | Uploading a file that is not JPEG or PNG |
| `POST /detect` | 503 | `ml/best.pt` is missing and model is not loaded |
| `POST /home/set` | 400 | Called before ESP32 sent any `POST /status` |
| `POST /cleaning/start` | 409 | Cleaning is already running |
| `DELETE /logs` | 400 | `confirm` field is `false` |

---

*This API was built for the thesis project: Intelligent Oil-Water Separation System using an ESP32-controlled surface boat with YOLOv8 aerial detection.*
