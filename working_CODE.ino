  // =============================================================
// AquaDetect ESP32 Firmware v2.0
// Intelligent Sensor-Based Oil-Water Separation System
//
// Hardware:
//   - ESP32 DevKit V1
//   - 2x BTS7960 43A Motor Drivers
//   - Waterproof Servo S020A-180 (rudder)
//   - NEO-M8N GPS Module (UART2)
//   - ICM-20948 9-axis IMU (I2C)
//   - LJC18A3-H-Z/BX Capacitive Oil Sensor (Active LOW)
//   - 5V Relay Module (water pump)
//   - 12V Lithium Battery + Solar Panel
//
// Pin Assignment:
//   BTS7960 #1 (LEFT motor)
//     R_PWM → GPIO 25 (Forward)
//     L_PWM → GPIO 26 (Backward)
//     R_EN  → GPIO 32 (Enable — was 5V, now ESP32)
//     L_EN  → GPIO 32 (Enable — same as R_EN)
//
//   BTS7960 #2 (RIGHT motor)
//     R_PWM → GPIO 27 (Forward)
//     L_PWM → GPIO 14 (Backward)
//     R_EN  → GPIO 33 (Enable — was 5V, now ESP32)
//     L_EN  → GPIO 33 (Enable — same as R_EN)
//
//   Servo PWM          → GPIO 13
//   GPS TX → ESP RX    → GPIO 16
//   GPS RX → ESP TX    → GPIO 17
//   ICM-20948 SDA      → GPIO 21
//   ICM-20948 SCL      → GPIO 22
//   Relay IN (pump)    → GPIO 18
//   Oil Sensor         → GPIO 34 (Active LOW)
//   Battery ADC        → GPIO 35
//
// WIRING CHANGE FROM v1.0:
//   BTS7960 R_EN and L_EN must be disconnected
//   from 5V and connected to GPIO 32 (driver 1)
//   and GPIO 33 (driver 2) for boot safety.
//
// Backend: FastAPI on http://YOUR_COMPUTER_IP:8000
// =============================================================

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>
#include <TinyGPSPlus.h>
#include <Wire.h>
#include "ICM_20948.h"

// =============================================================
// CONFIGURATION — Edit these before uploading
// =============================================================

const char* WIFI_SSID     = "BlynkIot";
const char* WIFI_PASSWORD = "slashgwapo";
const char* BACKEND_URL   = "http://172.20.10.2:8000";

// =============================================================
// PIN DEFINITIONS
// =============================================================

// BTS7960 #1 — LEFT motor
#define MOTOR1_R_PWM  25    // Forward PWM
#define MOTOR1_L_PWM  26    // Backward PWM
#define MOTOR1_EN     32    // Enable (LOW = disabled, HIGH = enabled)

// BTS7960 #2 — RIGHT motor
#define MOTOR2_R_PWM  27    // Forward PWM
#define MOTOR2_L_PWM  14    // Backward PWM
#define MOTOR2_EN     33    // Enable (LOW = disabled, HIGH = enabled)

// Servo (rudder)
#define SERVO_PIN     13

// GPS (Hardware Serial2)
#define GPS_RX_PIN    16    // ESP32 RX ← GPS TX
#define GPS_TX_PIN    17    // ESP32 TX → GPS RX
#define GPS_BAUD      9600

// ICM-20948 IMU (I2C)
#define IMU_SDA       21
#define IMU_SCL       22

// Relay (water pump) — Active HIGH
#define RELAY_PIN     18

// Oil Sensor — Active LOW
#define OIL_SENSOR_PIN 34

// Battery voltage divider
#define BATTERY_ADC_PIN       35
#define VOLTAGE_DIVIDER_RATIO 2.0   // 10k/10k divider
#define ADC_REF_VOLTAGE       3.3
#define ADC_RESOLUTION        4095.0

// =============================================================
// PWM CHANNEL DEFINITIONS (ESP32 LEDC)
// =============================================================

#define PWM_FREQ       1000  // 1kHz
#define PWM_RESOLUTION 8     // 8-bit (0-255)

#define CH_MOTOR1_FWD  0
#define CH_MOTOR1_BWD  1
#define CH_MOTOR2_FWD  2
#define CH_MOTOR2_BWD  3

// =============================================================
// TIMING INTERVALS
// =============================================================

const unsigned long STATUS_INTERVAL  = 3000;  // Post status every 3s
const unsigned long COMMAND_INTERVAL = 500;   // Poll command every 0.5s

// =============================================================
// GLOBAL OBJECTS
// =============================================================

Servo          rudderServo;
TinyGPSPlus    gps;
HardwareSerial gpsSerial(2);  // UART2 for GPS
ICM_20948_I2C  imu;

// =============================================================
// GLOBAL STATE
// =============================================================

// Timing
unsigned long lastStatusPost  = 0;
unsigned long lastCommandPoll = 0;

// GPS
double gpsLat   = 0.0;
double gpsLng   = 0.0;
bool   gpsValid = false;

// IMU
float heading  = 0.0;
float tiltX    = 0.0;
float tiltY    = 0.0;
float gyroZ    = 0.0;
bool  imuReady = false;

// Sensors
bool oilDetected = false;
bool pumpOn      = false;

// Last command
String lastCommand = "stop";
int    lastSpeed   = 0;
int    lastAngle   = 0;

// Armed state — synced from backend
bool motorsArmed = false;

// =============================================================
// SETUP
// =============================================================

void setup() {
  Serial.begin(115200);
  delay(100);

  // ═══════════════════════════════════════════════════════════
  // SAFETY FIRST — Disable motor drivers before anything else.
  // This prevents motors from spinning during boot or upload
  // because floating GPIO pins cannot trigger the BTS7960
  // when the enable pins are held LOW by the ESP32.
  // ═══════════════════════════════════════════════════════════

  // Step 1 — Disable BTS7960 enable pins FIRST
  pinMode(MOTOR1_EN, OUTPUT);
  pinMode(MOTOR2_EN, OUTPUT);
  digitalWrite(MOTOR1_EN, LOW);  // Driver 1 disabled
  digitalWrite(MOTOR2_EN, LOW);  // Driver 2 disabled

  // Step 2 — Force PWM pins LOW
  pinMode(MOTOR1_R_PWM, OUTPUT);
  pinMode(MOTOR1_L_PWM, OUTPUT);
  pinMode(MOTOR2_R_PWM, OUTPUT);
  pinMode(MOTOR2_L_PWM, OUTPUT);
  digitalWrite(MOTOR1_R_PWM, LOW);
  digitalWrite(MOTOR1_L_PWM, LOW);
  digitalWrite(MOTOR2_R_PWM, LOW);
  digitalWrite(MOTOR2_L_PWM, LOW);

  // Step 3 — Force relay OFF (pump)
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);

  // Step 4 — Oil sensor as input
  pinMode(OIL_SENSOR_PIN, INPUT);

  Serial.println("=== AquaDetect ESP32 v2.0 Booting ===");
  Serial.println("[SAFETY] Motor drivers DISABLED");
  Serial.println("[SAFETY] All outputs forced OFF");

  delay(500);

  // Initialize PWM channels (drivers still disabled)
  initMotorPWM();

  // Initialize servo to center
  initServo();

  // Initialize I2C for IMU
  Wire.begin(IMU_SDA, IMU_SCL);

  // Initialize ICM-20948 IMU
  initIMU();

  // Initialize GPS on Serial2
  initGPS();

  // Connect to WiFi
  connectWiFi();

  // Final safety confirmation after boot
  stopMotors();    // Ensure motors are stopped
  centerRudder();  // Ensure rudder is centered

  Serial.println("[SAFETY] Boot complete");
  Serial.println("[SAFETY] Motors confirmed OFF");
  Serial.println("=== AquaDetect Ready ===");
  Serial.println("[WAITING] Device online — "
                 "arm motors from dashboard");
}

// =============================================================
// MAIN LOOP
// =============================================================

void loop() {
  // Reconnect WiFi if lost
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Connection lost. Reconnecting...");
    connectWiFi();
    return;
  }

  unsigned long now = millis();

  // Read sensors continuously
  readGPS();
  readIMU();
  readOilSensor();

  // Post status every 3 seconds
  if (now - lastStatusPost >= STATUS_INTERVAL) {
    postStatus();
    lastStatusPost = now;
  }

  // Poll commands every 0.5 seconds
  if (now - lastCommandPoll >= COMMAND_INTERVAL) {
    pollCommand();
    lastCommandPoll = now;
  }
}

// =============================================================
// MOTOR PWM INITIALIZATION
// =============================================================

void initMotorPWM() {
  // Keep enable pins LOW (disabled) during PWM setup
  digitalWrite(MOTOR1_EN, LOW);
  digitalWrite(MOTOR2_EN, LOW);

  // Configure LEDC PWM channels
  ledcSetup(CH_MOTOR1_FWD, PWM_FREQ, PWM_RESOLUTION);
  ledcSetup(CH_MOTOR1_BWD, PWM_FREQ, PWM_RESOLUTION);
  ledcSetup(CH_MOTOR2_FWD, PWM_FREQ, PWM_RESOLUTION);
  ledcSetup(CH_MOTOR2_BWD, PWM_FREQ, PWM_RESOLUTION);

  // Attach pins to channels
  ledcAttachPin(MOTOR1_R_PWM, CH_MOTOR1_FWD);
  ledcAttachPin(MOTOR1_L_PWM, CH_MOTOR1_BWD);
  ledcAttachPin(MOTOR2_R_PWM, CH_MOTOR2_FWD);
  ledcAttachPin(MOTOR2_L_PWM, CH_MOTOR2_BWD);

  // Write zero to all channels immediately
  ledcWrite(CH_MOTOR1_FWD, 0);
  ledcWrite(CH_MOTOR1_BWD, 0);
  ledcWrite(CH_MOTOR2_FWD, 0);
  ledcWrite(CH_MOTOR2_BWD, 0);

  Serial.println("[MOTORS] PWM initialized — "
                 "all channels at zero");
}

// =============================================================
// SERVO INITIALIZATION
// =============================================================

void initServo() {
  rudderServo.attach(SERVO_PIN, 500, 2400);
  rudderServo.write(90);  // Center position
  Serial.println("[SERVO] Initialized at center (90°)");
}

// =============================================================
// IMU INITIALIZATION (ICM-20948)
// =============================================================

void initIMU() {
  Serial.print("[IMU] Initializing ICM-20948...");

  bool initialized = false;
  for (int attempts = 0; attempts < 5; attempts++) {
    if (imu.begin(Wire, 1) == ICM_20948_Stat_Ok) {
      initialized = true;
      break;
    }
    Serial.print(".");
    delay(500);
  }

  if (initialized) {
    imuReady = true;
    Serial.println(" OK!");
  } else {
    imuReady = false;
    Serial.println(" FAILED! Check SDA/SCL wiring.");
    Serial.println("[IMU] Continuing without IMU data.");
  }
}

// =============================================================
// GPS INITIALIZATION (NEO-M8N on Serial2)
// =============================================================

void initGPS() {
  gpsSerial.begin(GPS_BAUD, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  Serial.println("[GPS] NEO-M8N initialized on Serial2");
  Serial.println("[GPS] Waiting for satellite fix...");
}

// =============================================================
// WIFI CONNECTION
// =============================================================

void connectWiFi() {
  Serial.print("[WiFi] Connecting to: ");
  Serial.println(WIFI_SSID);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Connected!");
    Serial.print("[WiFi] ESP32 IP: ");
    Serial.println(WiFi.localIP());
    Serial.print("[WiFi] Backend: ");
    Serial.println(BACKEND_URL);
  } else {
    Serial.println("\n[WiFi] Failed to connect!");
    Serial.println("[WiFi] Check SSID and password.");
  }
}

// =============================================================
// READ GPS
// =============================================================

void readGPS() {
  while (gpsSerial.available() > 0) {
    char c = gpsSerial.read();
    gps.encode(c);
  }

  if (gps.location.isUpdated() && gps.location.isValid()) {
    gpsLat   = gps.location.lat();
    gpsLng   = gps.location.lng();
    gpsValid = true;
  }
}

// =============================================================
// READ IMU (ICM-20948)
// =============================================================

void readIMU() {
  if (!imuReady) return;

  if (imu.dataReady()) {
    imu.getAGMT();

    // Accelerometer → tilt angles
    float ax = imu.agmt.acc.axes.x;
    float ay = imu.agmt.acc.axes.y;
    float az = imu.agmt.acc.axes.z;

    tiltX = atan2(ay, az) * 180.0 / PI;
    tiltY = atan2(-ax, sqrt(ay * ay + az * az)) * 180.0 / PI;

    // Gyroscope Z axis (degrees/sec)
    gyroZ = imu.agmt.gyr.axes.z / 131.0;

    // Magnetometer → compass heading
    float mx = imu.agmt.mag.axes.x;
    float my = imu.agmt.mag.axes.y;

    float rawHeading = atan2(my, mx) * 180.0 / PI;
    if (rawHeading < 0) rawHeading += 360.0;
    heading = rawHeading;
  }
}

// =============================================================
// READ OIL SENSOR (Active LOW)
// =============================================================

void readOilSensor() {
  // LED ON = nothing detected = pin HIGH
  // LED OFF = oil detected = pin LOW
  oilDetected = (digitalRead(OIL_SENSOR_PIN) == LOW);
}

// =============================================================
// READ BATTERY VOLTAGE
// =============================================================

float readBatteryVoltage() {
  // Temporarily hardcoded until voltage divider is wired
  // Replace with ADC reading when divider is connected:
  // int rawADC = analogRead(BATTERY_ADC_PIN);
  // return (rawADC / ADC_RESOLUTION) * ADC_REF_VOLTAGE
  //        * VOLTAGE_DIVIDER_RATIO;
  return 11.8;
}

int readBatteryLevel(float voltage) {
  // 12.6V = 100%, 10.0V = 0%
  int level = (int)((voltage - 10.0) / (12.6 - 10.0) * 100.0);
  return constrain(level, 0, 100);
}

// =============================================================
// POST STATUS TO BACKEND
// =============================================================

void postStatus() {
  HTTPClient http;
  String url = String(BACKEND_URL) + "/status";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);

  float batteryVoltage = readBatteryVoltage();
  int   batteryLevel   = readBatteryLevel(batteryVoltage);
  bool  solarCharging  = (batteryVoltage > 12.4);
  String powerSource   = solarCharging ? "solar" : "battery";

  // Build timestamp from GPS if available
  String timestamp = "2026-05-14T00:00:00Z";
if (gps.date.isValid() && gps.time.isValid() &&
    gps.date.year() > 2000 &&
    gps.date.month() >= 1 && gps.date.month() <= 12 &&
    gps.date.day() >= 1 && gps.date.day() <= 31) {
  char ts[25];
  sprintf(ts, "%04d-%02d-%02dT%02d:%02d:%02dZ",
    gps.date.year(), gps.date.month(), gps.date.day(),
    gps.time.hour(), gps.time.minute(), gps.time.second()
  );
  timestamp = String(ts);
}

  // Build JSON payload
  StaticJsonDocument<512> doc;
  doc["lat"]             = gpsValid ? gpsLat : 0.0;
  doc["lng"]             = gpsValid ? gpsLng : 0.0;
  doc["heading"]         = heading;
  doc["tilt_x"]          = tiltX;
  doc["tilt_y"]          = tiltY;
  doc["gyro_z"]          = gyroZ;
  doc["oil_detected"]    = oilDetected;
  doc["pump_status"]     = pumpOn;
  doc["battery_level"]   = batteryLevel;
  doc["battery_voltage"] = batteryVoltage;
  doc["solar_charging"]  = solarCharging;
  doc["power_source"]    = powerSource;
  doc["current_command"] = lastCommand;
  doc["current_mode"]    = "manual";
  doc["rudder_angle"]    = lastAngle;
  doc["timestamp"]       = timestamp;

  String payload;
  serializeJson(doc, payload);

  Serial.println("[STATUS] Posting...");
  Serial.print("[STATUS] GPS: ");
  Serial.print(gpsValid ? gpsLat : 0.0, 6);
  Serial.print(", ");
  Serial.println(gpsValid ? gpsLng : 0.0, 6);
  Serial.print("[STATUS] Heading: ");
  Serial.print(heading);
  Serial.print("° | Oil: ");
  Serial.print(oilDetected ? "DETECTED" : "Clear");
  Serial.print(" | Battery: ");
  Serial.print(batteryLevel);
  Serial.print("% (");
  Serial.print(batteryVoltage);
  Serial.print("V) | Armed: ");
  Serial.println(motorsArmed ? "YES" : "NO");

  int responseCode = http.POST(payload);

  if (responseCode == 200) {
    String response = http.getString();
    StaticJsonDocument<256> respDoc;
    DeserializationError error = 
      deserializeJson(respDoc, response);

    if (!error) {
      String mode = 
        respDoc["data"]["current_mode"] | "manual";
      String cmd  = 
        respDoc["data"]["current_command"] | "stop";

      if (mode == "returning" && cmd == "return_home") {
        Serial.println("[STATUS] LOW BATTERY — "
                       "Backend triggered return home!");
      }
    }
    Serial.println("[STATUS] Posted OK: " + 
                   String(responseCode));
  } else {
    Serial.println("[STATUS] Post failed: " + 
                   String(responseCode));
  }

  http.end();
}

// =============================================================
// POLL COMMAND FROM BACKEND
// =============================================================

void pollCommand() {
  // Skip if WiFi not connected
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String(BACKEND_URL) + "/command";
  http.begin(url);
  http.setTimeout(5000);

  int responseCode = http.GET();

  if (responseCode == 200) {
    String response = http.getString();

    StaticJsonDocument<256> doc;
    DeserializationError error = 
      deserializeJson(doc, response);

    if (!error) {
      String command = doc["data"]["command"] | "stop";
      int    speed   = doc["data"]["speed"]   | 0;
      int    angle   = doc["data"]["angle"]   | 0;
      bool   pump    = doc["data"]["pump"]    | false;
      bool   armed   = doc["data"]["armed"]   | false;

      // ── Handle arm state change ──────────────────────────
      if (armed != motorsArmed) {
        motorsArmed = armed;

        if (motorsArmed) {
          Serial.println("[ARM] Motors ARMED! "
                         "Ready for operation.");
        } else {
          Serial.println("[ARM] Motors DISARMED!");
          // Force stop immediately on disarm
          stopMotors();
          centerRudder();
          Serial.println("[SAFETY] Motors stopped "
                         "on disarm");
        }
      }

      // ── Handle command changes ───────────────────────────
      if (command != lastCommand ||
          speed   != lastSpeed   ||
          angle   != lastAngle) {

        // Stop and E-Stop always work
        if (command == "stop" ||
            command == "emergency_stop") {
          executeCommand(command, speed, angle);
        }
        // All movement commands need armed state
        else if (motorsArmed) {
          executeCommand(command, speed, angle);
        }
        // Block movement when disarmed
        else {
          Serial.println("[BLOCKED] Motors disarmed "
                         "— ignoring: " + command);
          stopMotors();
        }

        lastCommand = command;
        lastSpeed   = speed;
        lastAngle   = angle;
      }

      // Pump works regardless of arm state
      if (pump != pumpOn) {
        setPump(pump);
      }
    }
  } else if (responseCode != -1) {
    Serial.println("[CMD] Poll failed: " + 
                   String(responseCode));
  }

  http.end();
}

// =============================================================
// EXECUTE COMMAND
// =============================================================

void executeCommand(String command, int speed, int angle) {

  // ── STOP ──────────────────────────────────────────────────
  if (command == "stop") {
    stopMotors();
    centerRudder();
    Serial.println("[EXEC] Stopped");
  }

  // ── EMERGENCY STOP ────────────────────────────────────────
  else if (command == "emergency_stop") {
    stopMotors();
    centerRudder();
    setPump(false);
    Serial.println("[EXEC] EMERGENCY STOP!");
  }

  // ── FORWARD ───────────────────────────────────────────────
  else if (command == "forward") {
    int pwm = constrain(speed, 0, 255);
    motorForward(pwm, pwm);
    Serial.println("[EXEC] Forward @ " + String(pwm));
  }

  // ── BACKWARD ──────────────────────────────────────────────
  else if (command == "backward") {
    int pwm = constrain(speed, 0, 255);
    motorBackward(pwm, pwm);
    Serial.println("[EXEC] Backward @ " + String(pwm));
  }

  // ── TURN LEFT ─────────────────────────────────────────────
  // Both motors forward + rudder left
  else if (command == "turn_left") {
    int pwm = constrain(speed, 0, 255);
    motorForward(pwm, pwm);
    setRudder(-45);
    Serial.println("[EXEC] Turn Left @ " + String(pwm));
  }

  // ── TURN RIGHT ────────────────────────────────────────────
  // Both motors forward + rudder right
  else if (command == "turn_right") {
    int pwm = constrain(speed, 0, 255);
    motorForward(pwm, pwm);
    setRudder(45);
    Serial.println("[EXEC] Turn Right @ " + String(pwm));
  }

  // ── FORWARD LEFT ──────────────────────────────────────────
  else if (command == "forward_left") {
    int pwm = constrain(speed, 0, 255);
    motorForward(pwm, pwm);
    setRudder(-25);
    Serial.println("[EXEC] Forward Left @ " + String(pwm));
  }

  // ── FORWARD RIGHT ─────────────────────────────────────────
  else if (command == "forward_right") {
    int pwm = constrain(speed, 0, 255);
    motorForward(pwm, pwm);
    setRudder(25);
    Serial.println("[EXEC] Forward Right @ " + String(pwm));
  }

  // ── SET RUDDER ────────────────────────────────────────────
  else if (command == "set_rudder") {
    setRudder(angle);
    Serial.println("[EXEC] Rudder → " + 
                   String(angle) + "°");
  }

  // ── RETURN HOME ───────────────────────────────────────────
  else if (command == "return_home") {
    int pwm = constrain(speed, 0, 255);
    if (pwm > 0) {
      motorForward(pwm, pwm);
    } else {
      stopMotors();
    }
    setRudder(angle);
    Serial.println("[EXEC] Returning home...");
  }

  // ── UNKNOWN ───────────────────────────────────────────────
  else {
    Serial.println("[EXEC] Unknown: " + command);
    stopMotors();
  }
}

// =============================================================
// MOTOR CONTROL
// =============================================================

void stopMotors() {
  // Disable drivers first then zero PWM
  digitalWrite(MOTOR1_EN, LOW);
  digitalWrite(MOTOR2_EN, LOW);
  ledcWrite(CH_MOTOR1_FWD, 0);
  ledcWrite(CH_MOTOR1_BWD, 0);
  ledcWrite(CH_MOTOR2_FWD, 0);
  ledcWrite(CH_MOTOR2_BWD, 0);
}

void motorForward(int leftPWM, int rightPWM) {
  leftPWM  = constrain(leftPWM,  0, 255);
  rightPWM = constrain(rightPWM, 0, 255);

  // Set PWM values first then enable drivers
  ledcWrite(CH_MOTOR1_FWD, leftPWM);
  ledcWrite(CH_MOTOR1_BWD, 0);
  ledcWrite(CH_MOTOR2_FWD, rightPWM);
  ledcWrite(CH_MOTOR2_BWD, 0);

  // Enable drivers after PWM is ready
  digitalWrite(MOTOR1_EN, HIGH);
  digitalWrite(MOTOR2_EN, HIGH);
}

void motorBackward(int leftPWM, int rightPWM) {
  leftPWM  = constrain(leftPWM,  0, 255);
  rightPWM = constrain(rightPWM, 0, 255);

  // Set PWM values first then enable drivers
  ledcWrite(CH_MOTOR1_FWD, 0);
  ledcWrite(CH_MOTOR1_BWD, leftPWM);
  ledcWrite(CH_MOTOR2_FWD, 0);
  ledcWrite(CH_MOTOR2_BWD, rightPWM);

  // Enable drivers after PWM is ready
  digitalWrite(MOTOR1_EN, HIGH);
  digitalWrite(MOTOR2_EN, HIGH);
}

// =============================================================
// SERVO / RUDDER CONTROL
// =============================================================

void setRudder(int angle) {
  // angle: -90 (full left) to +90 (full right)
  angle = constrain(angle, -90, 90);
  // Map to servo range 0-180
  int servoPos = map(angle, -90, 90, 0, 180);
  rudderServo.write(servoPos);
  lastAngle = angle;
}

void centerRudder() {
  rudderServo.write(90);
  lastAngle = 0;
}

// =============================================================
// PUMP CONTROL (relay)
// =============================================================

void setPump(bool on) {
  pumpOn = on;
  digitalWrite(RELAY_PIN, on ? HIGH : LOW);
  Serial.println("[PUMP] " + String(on ? "ON" : "OFF"));
}