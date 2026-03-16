# AquaDetect — Project Context & AI Memory File
# Use this file when asking AI to fix, change, or add features.
# Paste this entire file at the start of any new AI conversation.

---

## 1. PROJECT OVERVIEW

**Project Title:** An Intelligent Sensor-Based Approach to Oil-Water Separation
Using Filtration and Detection

**Dashboard Name:** AquaDetect

**Purpose:** Thesis project — autonomous RC boat that detects and cleans
oil spills using YOLOv8 detection, GPS navigation, and spiral cleaning patterns.

**Stack:**
- Backend: FastAPI (Python) → localhost:8000
- Frontend: Vite + React → localhost:5173
- Hardware: ESP32 DevKit V1 RC boat

**Run Commands:**
```bash
# Backend
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1 --reload

# Frontend
npm run dev
```

---

## 2. HARDWARE COMPONENTS

| Component | Model | Purpose |
|---|---|---|
| MCU | ESP32 DevKit V1 | Main controller |
| Motor Driver | Double BTS7960 43A (x2) | Drive motors |
| GPS | NEO-M8N | Position tracking |
| IMU | ICM-20948 9-axis | Heading/tilt/gyro |
| Oil Sensor | LJC18A3-H-Z/BX | Capacitive oil detection |
| Motors | Brushed 550 Black 21T (x2) | Propulsion |
| Servo | Waterproof S020A-180 (x2) | Rudder control |
| Pump | DC Water Pump 12V | Oil collection |
| Battery | 12V Lithium | Power source |
| Solar | Mini Solar Panel 3W 12V | Charging |
| Buck Converters | 5A (x4) | Voltage regulation |

**Current Wiring Status:**
- ✅ One servo motor wired (rudder)
- ⏳ All other components pending wiring

---

## 3. BACKEND ARCHITECTURE

### File Structure
```
backend/
├── main.py
├── core/
│   ├── state.py        ← app_state dict (all runtime data)
│   ├── response.py     ← make_response() helper
│   ├── logger.py       ← log_event() helper
│   └── utils.py        ← haversine, bearing, heading utils
├── models/
│   └── schemas.py      ← Pydantic models
└── routes/
    ├── status.py       ← POST/GET /status
    ├── command.py      ← POST/GET /command
    ├── mode.py         ← POST /mode
    ├── navigate.py     ← POST /navigate
    ├── detection.py    ← POST /detect
    ├── cleaning.py     ← POST /cleaning/start|stop, GET /cleaning/status
    ├── battery.py      ← GET /battery, GET /battery/history
    ├── filter.py       ← POST/GET /filter/status
    ├── home.py         ← POST /home/set, GET /home
    └── logs.py         ← GET /logs, DELETE /logs
```

### Key API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| POST | /status | ESP32 sends sensor data |
| GET | /status | Frontend reads full state |
| POST | /command | Send movement command |
| GET | /command | ESP32 polls for commands |
| POST | /mode | Change operating mode |
| POST | /navigate | Set navigation target |
| POST | /detect | YOLOv8 oil detection |
| POST | /cleaning/start | Start spiral cleaning |
| POST | /cleaning/stop | Stop cleaning |
| GET | /cleaning/status | Get cleaning progress |
| GET | /battery | Get battery data |
| GET | /battery/history | Get battery history |
| POST | /home/set | Save home GPS |
| GET | /home | Get home GPS |
| POST | /filter/status | Update filter status |
| GET | /filter/status | Get filter status |
| GET | /logs | Get activity logs |
| DELETE | /logs | Clear all logs |
| GET | /health | Health check |

### Critical Backend Settings

```python
# routes/detection.py
CONFIDENCE_THRESHOLD = 0.40  # Changed from 0.60

# models/schemas.py
confidence: float = Field(ge=0.4)  # Must match above

# routes/status.py
LOW_BATTERY_THRESHOLD = 20  # Auto-return below 20%
```

### app_state Structure (core/state.py)
```python
app_state = {
    # GPS
    "device_gps": {"lat": 0.0, "lng": 0.0},
    "home_gps": {"lat": 0.0, "lng": 0.0},
    "target_gps": {"lat": 0.0, "lng": 0.0},
    "home_set": False,
    "target_set": False,

    # IMU
    "heading": 0.0,
    "tilt_x": 0.0,
    "tilt_y": 0.0,
    "gyro_z": 0.0,

    # Sensors
    "oil_detected": False,
    "pump_status": False,

    # Power
    "battery_level": 0,
    "battery_voltage": 0.0,
    "solar_charging": False,
    "power_source": "battery",
    "power_rails": {
        "motors_12v": True,
        "logic_5v": True,
        "sensors_3v3": True,
        "servos_rail": True,
    },

    # Control
    "current_mode": "standby",
    "current_command": "stop",
    "esp32_command": "stop",
    "esp32_mode": "standby",
    "esp32_rudder_angle": 0,

    # History
    "status_history": [],
    "event_log": [],
    "last_updated": None,
}
```

---

## 4. CRITICAL FIELD NAME MAPPINGS
# These caused bugs — always use the CORRECT names

### Backend Response → Frontend Usage

| Data | WRONG ❌ | CORRECT ✅ |
|---|---|---|
| Device GPS lat | `deviceStatus.lat` | `deviceStatus.device_gps.lat` |
| Device GPS lng | `deviceStatus.lng` | `deviceStatus.device_gps.lng` |
| Cleaning active | `cleaningStatus.is_active` | `cleaningStatus.active` |
| Log level field | `log.level` | `log.event_type` |
| Log array path | `result.logs` | `result.logs` or `result.data.logs` |
| Rudder angle | `deviceStatus.rudder_angle` | `deviceStatus.esp32_rudder_angle` |

### API Request Payloads

```js
// POST /navigate — MUST include source field
{
  target_lat: 14.5995,
  target_lng: 120.9842,
  source: "manual_input",  // ← REQUIRED
  home: false
}

// POST /navigate — Return home
{
  home: true,
  source: "manual_input",
  target_lat: 0,
  target_lng: 0
}

// DELETE /logs — MUST include confirm field
{ confirm: true }  // ← REQUIRED

// POST /detect — FormData field name
formData.append('file', imageFile)  // ← must be 'file' not 'image'
```

---

## 5. FRONTEND ARCHITECTURE

### File Structure
```
frontend/src/
├── api/
│   ├── apiClient.js    ← Axios instance + interceptor
│   └── endpoints.js    ← All API functions
├── components/
│   ├── Sidebar.jsx     ← Navigation + theme toggle
│   ├── StatusBar.jsx   ← Online pill + mode badge + E-STOP
│   └── AlertBanner.jsx ← 4 alert types with dismiss logic
├── context/
│   └── AppContext.jsx  ← Global state (deviceStatus source of truth)
├── hooks/
│   ├── useDeviceStatus.js
│   ├── useBattery.js
│   ├── useCommand.js
│   ├── useMode.js
│   ├── useCleaningStatus.js
│   └── useNavigation.js
└── pages/
    ├── Dashboard.jsx     ✅
    ├── MapControl.jsx    ✅
    ├── ManualControl.jsx ✅
    ├── Detection.jsx     ✅
    ├── Cleaning.jsx      ✅
    ├── Battery.jsx       ✅
    ├── Sensors.jsx       ✅
    └── Logs.jsx          ✅
```

### API Data Flow
```
ESP32 → POST /status
  → FastAPI stores in app_state
  → Frontend polls GET /status every 2s
  → apiClient interceptor returns response.data (envelope)
  → unwrap() extracts envelope.data (payload)
  → AppContext stores as deviceStatus
  → All pages read from useApp().deviceStatus
```

### apiClient.js Pattern
```js
// Interceptor returns response.data (the envelope)
// unwrap() extracts envelope.data (the payload)

const unwrap = (envelope) => envelope.data

// All endpoints use unwrap():
export const getStatus = () =>
  apiClient.get('/status').then(unwrap)

export const postStatus = (data) =>
  apiClient.post('/status', data).then(unwrap)
```

### AppContext — What It Provides
```js
const {
  deviceStatus,        // Full payload from GET /status
  currentMode,         // deviceStatus.current_mode
  batteryLevel,        // deviceStatus.battery_level
  batteryVoltage,      // deviceStatus.battery_voltage
  solarCharging,       // deviceStatus.solar_charging
  isDeviceOnline,      // true if last update < 5 seconds ago
  lowBatteryWarning,   // true if battery < 20%
} = useApp()
```

### Reading Device Data in Pages
```js
// ALWAYS read from AppContext deviceStatus
const { deviceStatus, isDeviceOnline } = useApp()

// GPS
const lat = deviceStatus?.device_gps?.lat
const lng = deviceStatus?.device_gps?.lng

// IMU
const heading = deviceStatus?.heading
const tiltX = deviceStatus?.tilt_x
const tiltY = deviceStatus?.tilt_y
const gyroZ = deviceStatus?.gyro_z

// Sensors
const oilDetected = deviceStatus?.oil_detected
const pumpStatus = deviceStatus?.pump_status

// Control
const currentMode = deviceStatus?.current_mode
const currentCommand = deviceStatus?.current_command
const rudderAngle = deviceStatus?.esp32_rudder_angle
```

---

## 6. KNOWN BUGS FIXED (Never Repeat These)

### Bug 1 — GPS Not Showing on Dashboard
**Cause:** `useStatusData()` hook returned wrong data level
**Fix:** Read directly from `useApp().deviceStatus.device_gps.lat`

### Bug 2 — Return Home Failing
**Cause:** Missing `source` field in navigate payload
**Fix:** Always include `source: "manual_input"` in POST /navigate

### Bug 3 — Detection Field Name Wrong
**Cause:** FormData used `image` as field name
**Fix:** Backend expects `file` → `formData.append('file', imageFile)`

### Bug 4 — Confidence Threshold Not Working
**Cause:** Changed in detection.py but not in schemas.py
**Fix:** Must change in BOTH files — detection.py AND schemas.py

### Bug 5 — Cleaning Status Always Inactive
**Cause:** Frontend checked `cleaningStatus.is_active`
**Fix:** Backend returns `active` → use `cleaningStatus.active`

### Bug 6 — Log Level Badges Blank
**Cause:** Frontend read `log.level`
**Fix:** Backend uses `event_type` → use `log.event_type`

### Bug 7 — Log Summary Stats Always 0
**Cause:** Summary counted from wrong field name
**Fix:** Use `log.event_type` not `log.level` in all filter/count logic

### Bug 8 — Delete Logs White Screen
**Cause:** Import used `clearLogs` but function is named `deleteLogs`
**Fix:** Import and call `deleteLogs()` everywhere

### Bug 9 — Bounding Boxes Outside Image
**Cause:** Canvas used container dimensions not actual image render size
**Fix:** Calculate letterbox offset using object-contain math:
```js
const scale = Math.min(containerW/naturalW, containerH/naturalH)
const renderedW = naturalW * scale
const renderedH = naturalH * scale
const offsetX = (containerW - renderedW) / 2
const offsetY = (containerH - renderedH) / 2
```

### Bug 10 — Mode Not Updating from Status JSON
**Cause:** Mode is backend-controlled not ESP32-reported
**Fix:** Change mode via POST /mode only, not via status JSON

### Bug 11 — Oil Detection Warning Not Logging
**Cause:** No log_event call for oil detection in status.py
**Fix:** Added log_event with `_last_oil_detected` flag to prevent
duplicate logs on every status post

---

## 7. PAGE-BY-PAGE REFERENCE

### Dashboard.jsx
- Reads: `useApp().deviceStatus` directly
- Shows: GPS, battery, mode, oil status, heading, tilt
- Auto-refreshes via AppContext polling

### MapControl.jsx
- Uses: react-leaflet + Leaflet.js
- IMPORTANT: Use `CircleMarker` only — never `Marker`
  (Vite has icon path issues with default Marker)
- Shows: Device position, home, target, detection locations
- Navigate: POST /navigate with source field

### ManualControl.jsx
- D-pad controls + keyboard shortcuts
- Speed slider (50-255 PWM)
- Rudder slider (-90 to +90 degrees)
- Pump toggle (blocked in non-manual modes)
- Mode switcher
- E-STOP (no confirmation, immediate)

### Detection.jsx
- Upload: Drag/drop image with EXIF auto-read
- EXIF: DJI Mini 2 auto-fills GPS + altitude
- Detect: POST /detect with FormData field `file`
- Canvas: Draws bounding boxes with letterbox offset correction
- Results: Detection list with Navigate button

### Cleaning.jsx
- Controls: Center GPS, radius, step, speed
- Auto-fill: Uses device_gps from AppContext
- Status field: `active` not `is_active`
- Progress: Polls every 2s when active
- Map: Leaflet spiral preview with CircleMarker only

### Battery.jsx
- Polls: every 5 seconds
- Chart: Recharts LineChart with 20% warning line
- Filter: Mark as clean / needs replacement
- Power rails: 4 indicators (12V, 5V, 3.3V, servo)

### Sensors.jsx
- Reads: AppContext deviceStatus (auto-refreshes)
- Cards: Oil sensor, Compass, Tilt/bubble level,
  Gyroscope, Rudder angle, GPS & movement
- High tilt warning: triggers when tilt > 15°

### Logs.jsx
- Field names: `event_type` (not `level`), `category`
- Log array: `result.logs` from API response
- Clear: requires `{confirm: true}` in DELETE body
- Auto-refresh: every 5 seconds when enabled
- Filters: level + category + search combined

---

## 8. ESP32 CONNECTION

### Configuration
```cpp
const char* WIFI_SSID = "YOUR_2.4GHz_WIFI";
const char* WIFI_PASSWORD = "YOUR_PASSWORD";
const char* BACKEND_URL = "http://192.168.254.109:8000";
const int SERVO_PIN = 18;
```

### Important Notes
- ESP32 supports 2.4GHz WiFi ONLY (not 5GHz)
- Computer and ESP32 must be on same network
- Use computer's IPv4 address not localhost
- Windows Firewall must allow port 8000
- Status posts every 3 seconds
- Command polls every 0.5 seconds

### Firewall Fix (Run as Admin)
```bash
netsh advfirewall firewall add rule name="FastAPI Port 8000" dir=in action=allow protocol=TCP localport=8000
```

### Serial Monitor Success Output
```
=== AquaDetect ESP32 ===
Servo initialized
WiFi connected!
ESP32 IP: 192.168.254.XXX
Status posted OK: 200
```

### Error Codes
- `-1` = Cannot reach backend (wrong IP, firewall, different network)
- `400` = Bad request (wrong payload format)
- `422` = Validation error (field missing or wrong type)

---

## 9. TEST PAYLOADS

### Normal Operation
```json
POST http://localhost:8000/status
{
  "lat": 14.5995, "lng": 120.9842,
  "heading": 45.5, "tilt_x": 1.2,
  "tilt_y": 0.8, "gyro_z": 0.3,
  "oil_detected": false, "pump_status": false,
  "battery_level": 85, "battery_voltage": 11.8,
  "solar_charging": true, "power_source": "solar",
  "current_command": "stop", "current_mode": "manual",
  "rudder_angle": 0,
  "timestamp": "2026-03-09T10:00:00Z"
}
```

### Oil Detected
```json
{"oil_detected": true, "pump_status": true,
 "current_command": "forward"}
```
(Change these fields in normal operation JSON)

### Low Battery Warning (triggers auto-return)
```json
{"battery_level": 15, "battery_voltage": 10.2,
 "solar_charging": false, "power_source": "battery"}
```

### High Tilt Warning
```json
{"tilt_x": 18.5, "tilt_y": 16.2, "gyro_z": 2.5}
```

### Returning Home Mode
```json
{"battery_level": 15, "battery_voltage": 10.2,
 "current_command": "return_home",
 "current_mode": "returning"}
```

### Change Mode
```
POST http://localhost:8000/mode
{"mode": "manual"}     ← or automatic, cleaning, standby, returning
```

### Start Cleaning
```
POST http://localhost:8000/cleaning/start
{
  "center_lat": 14.5995, "center_lng": 120.9842,
  "max_radius": 5.0, "step_size": 0.5,
  "inner_speed": 120, "outer_speed": 180
}
```

### Set Home
```
POST http://localhost:8000/home/set
(no body needed)
```

### Navigate To
```
POST http://localhost:8000/navigate
{
  "target_lat": 14.6010, "target_lng": 120.9850,
  "source": "manual_input", "home": false
}
```

---

## 10. DEBUGGING GUIDE

### White Screen
1. Open F12 → Console
2. Find red error message
3. Most common causes:
   - Wrong import name (clearLogs vs deleteLogs)
   - Missing export in endpoints.js
   - Syntax error in JSX

### Data Not Showing
1. Check field name mapping (Section 4)
2. Add console.log to see raw data:
   ```js
   console.log('[PageName] raw:', data)
   console.log('[PageName] keys:', Object.keys(data ?? {}))
   ```
3. Check if unwrap() is being called in endpoints.js

### API Call Failing
1. Check Thunder Client response structure
2. Verify payload has all required fields
3. Check for 422 validation errors in FastAPI terminal

### Device Shows Offline
1. Verify backend running on port 8000
2. Post a status JSON via Thunder Client
3. Check AppContext isDeviceOnline threshold (5 seconds)

### Map Not Showing
1. Verify leaflet CSS is imported
2. Use CircleMarker not Marker
3. Check GPS coordinates are valid numbers not strings

### Bounding Boxes Wrong Position
1. Use getBoundingClientRect() not offsetWidth
2. Calculate letterbox offset for object-contain images
3. Use ResizeObserver not window resize event

---

## 11. HOW TO USE THIS FILE WITH AI

When asking AI for help paste this at the start:

```
I am working on AquaDetect, an autonomous RC boat dashboard.
Here is the complete project context: [paste this file]

My issue: [describe the problem]
The file affected: [filename]
The error message: [exact error]
The relevant code: [paste the specific function or component]
```

This gives the AI full context to:
- Know the exact field names used
- Understand the data flow
- Avoid repeating known bugs
- Make targeted fixes without breaking other parts

---

## 12. OPERATING MODES

| Mode | Description | Behavior |
|---|---|---|
| manual | Human controlled | D-pad/keyboard active |
| automatic | GPS navigation | Follows target waypoint |
| cleaning | Spiral pattern | Executes cleaning waypoints |
| returning | Going home | Auto-triggered by low battery |
| standby | Idle | No movement commands |

### Mode Rules
- Pump toggle blocked in non-manual modes
- E-STOP works in ALL modes immediately
- Low battery (< 20%) forces `returning` mode
- Mode is backend-controlled via POST /mode
- ESP32 reports its mode via POST /status (may differ)

---

*Last Updated: March 2026*
*Project: AquaDetect Thesis Dashboard*
*Stack: FastAPI + React + ESP32*