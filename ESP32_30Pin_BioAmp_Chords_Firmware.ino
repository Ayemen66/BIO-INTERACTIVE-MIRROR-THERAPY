/*
 * =====================================================================================
 * NEUROGRASP & NEUROMIRROR REHABILITATION GLOVE - ESP32 30-PIN UNIVERSAL FIRMWARE
 * =====================================================================================
 * Target Board: ESP32 30-Pin DevKit V1 (Compatible with ESP32 Core v2.x & v3.x)
 * Dual Connectivity: High-Speed USB Serial (115200 Baud) + Wireless Bluetooth BLE (Nordic UART)
 * 
 * Actuators (PCA9685 16-Channel PWM Driver on I2C 0x40):
 *   - Channel 0: Servo 1 (Thumb Actuator)  <-- Flex 0 (Thumb, GPIO 35) [Full 180° Travel]
 *   - Channel 1: Servo 2 (Index & Middle)  <-- Flex 1 (Index, GPIO 32) + Flex 2 (Middle, GPIO 33) [180°]
 *   - Channel 2: Servo 3 (Ring & Pinky)    <-- Flex 3 (Ring, GPIO 25) + Flex 4 (Pinky, GPIO 26)   [180°]
 *   - Channel 3: Single 5V Haptic Vibration Cell Motor (PWM)
 * 
 * Sensors:
 *   - 3x BioAmp EXG Pill sEMG Sensors:
 *       * GPIO 36 (VP): FDS (Flexor Digitorum Superficialis - Finger Flexion)
 *       * GPIO 39 (VN): EDC (Extensor Digitorum Communis - Finger Extension)
 *       * GPIO 34:      FCR (Flexor Carpi Radialis - Wrist Flexion)
 *   - 5x Flex Sensors (Healthy Master Hand for Real-Time Mirror Therapy):
 *       * GPIO 35: Thumb Flex   (ADC1_CH7)
 *       * GPIO 32: Index Flex   (ADC1_CH4)
 *       * GPIO 33: Middle Flex  (ADC1_CH5)
 *       * GPIO 25: Ring Flex    (ADC2_CH8)
 *       * GPIO 26: Pinky Flex   (ADC2_CH9)
 * 
 * Safety & Emergency Stop:
 *   - Software Emergency Stop: {"stop": true} or raw ASCII "STOP" / "ESTOP"
 *     (Instantly opens all servos to 0° and powers off the vibration motor)
 * 
 * Operating Modules:
 *   - MODULE 0 [SMART 180° MIRROR THERAPY]:
 *       * Full 180-degree high-torque mechanical travel for active finger lifting & fist clench.
 *       * Absolute deviation mapping: Works flawlessly whether resistance increases or decreases.
 *       * Active Extension Boost: Forces servos to full lift when master hand opens.
 *       * Single vibration motor on Ch 3 pulses when hand flexes > 55° to confirm grip.
 *   - MODULE 1 [THERAPEUTIC REHABILITATION]:
 *       * Flex sensors decoupled. Servos safely resting at 0°.
 *       * 3-Channel BioAmp sEMG streams to Web App & Mobile APK for games, GNN, & trials.
 *       * Single vibration motor provides haptic biofeedback on muscle targets.
 *   - MODULE 2 [DIRECT APP OVERRIDE]:
 *       * Web app / Mobile sliders directly control individual servo positions.
 * =====================================================================================
 */

#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>
#include <ArduinoJson.h>

// -------------------------------------------------------------------------------------
// BLUETOOTH LOW ENERGY (BLE) WIRELESS SUPPORT (FOR MOBILE APK & PC)
// -------------------------------------------------------------------------------------
#define ENABLE_BLUETOOTH_BLE 1

#if ENABLE_BLUETOOTH_BLE
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

#define BLE_DEVICE_NAME      "NeuroGrasp-AI"
#define SERVICE_UUID         "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define CHARACTERISTIC_TX    "6e400003-b5a3-f393-e0a9-e50e24dcca9e" // ESP32 -> App (Notify)
#define CHARACTERISTIC_RX    "6e400002-b5a3-f393-e0a9-e50e24dcca9e" // App -> ESP32 (Write)

BLEServer *pBleServer = NULL;
BLECharacteristic *pTxCharacteristic = NULL;
bool bleConnected = false;
#endif

// -------------------------------------------------------------------------------------
// PIN DEFINITIONS (ESP32 30-PIN DEVKIT)
// -------------------------------------------------------------------------------------
#define I2C_SDA_PIN          21
#define I2C_SCL_PIN          22

// 3 BioAmp EXG Pill sEMG Target Sensors
#define PIN_EMG_FDS          36    // FDS (Finger Flexion)
#define PIN_EMG_EDC          39    // EDC (Finger Extension)
#define PIN_EMG_FCR          34    // FCR (Wrist Flexion)

// 5 Flex Sensors (Healthy Master Hand for Mirror Therapy)
#define PIN_FLEX_THUMB       35    // Flex 0: Thumb
#define PIN_FLEX_INDEX       32    // Flex 1: Index
#define PIN_FLEX_MIDDLE      33    // Flex 2: Middle
#define PIN_FLEX_RING        25    // Flex 3: Ring
#define PIN_FLEX_PINKY       26    // Flex 4: Pinky

#define PIN_STATUS_LED       2     // Onboard Blue LED

// -------------------------------------------------------------------------------------
// PCA9685 PWM CHANNELS & FULL 180° SERVO TIMINGS
// -------------------------------------------------------------------------------------
#define PCA9685_I2C_ADDR     0x40

// Servo Channels on PCA9685
#define CH_SERVO_THUMB       0     // Servo 1: Thumb Actuator
#define CH_SERVO_INDEX_MID   1     // Servo 2: Index + Middle Fingers
#define CH_SERVO_RING_PINKY  2     // Servo 3: Ring + Pinky Fingers

// Single Vibration Motor Channel on PCA9685 (PWM Haptic Motor)
#define CH_VIB_MOTOR         3

// FULL 180-DEGREE SERVO PULSE CALIBRATION (50Hz = 20,000 µs period, 1 tick = ~4.88 µs)
// 0°   = ~560 µs  (115 ticks) - Full Extension / Fingers Fully Lifted Up
// 180° = ~2460 µs (505 ticks) - Full Flexion / Complete Clenched Fist Grip
#define SERVO_PULSE_0_DEG    115
#define SERVO_PULSE_180_DEG  505
#define SERVO_MAX_TRAVEL_DEG 180

// MECHANICAL LINKAGE DIRECTION INVERSION:
// Change to 'true' if your mechanical glove is built so that 180° lifts the fingers and 0° closes them!
const bool INVERT_SERVO_DIR = false;

// -------------------------------------------------------------------------------------
// CALIBRATION & FILTERING CONSTANTS
// -------------------------------------------------------------------------------------
const int flexPins[5] = {PIN_FLEX_THUMB, PIN_FLEX_INDEX, PIN_FLEX_MIDDLE, PIN_FLEX_RING, PIN_FLEX_PINKY};

// Adaptive Flex Sensor Calibration
int flexRestADC[5]    = {2000, 2000, 2000, 2000, 2000}; // Rest baseline captured at boot
int flexMaxTravel[5]  = {320, 320, 320, 320, 320};      // Sensitive travel range (~320 ADC)
int lastGoodFlexRaw[5]= {2000, 2000, 2000, 2000, 2000};

// BioAmp EXG Pill DC Baseline & MVC Ceiling
const int EMG_BASELINE = 2048;     // BioAmp EXG Pill 1.65V DC center bias
const int EMG_MVC_MAX  = 3200;     // Maximum Voluntary Contraction ceiling

// Smooth Motion Factor (25% new target + 75% previous position)
const float SMOOTHING_FACTOR = 0.25f;

// High Precision 500 Hz Sampling (2000 microseconds)
const unsigned long SAMPLE_INTERVAL_US = 2000;
unsigned long lastSampleMicros = 0;

// -------------------------------------------------------------------------------------
// GLOBAL OBJECTS & STATE
// -------------------------------------------------------------------------------------
Adafruit_PWMServoDriver pca9685 = Adafruit_PWMServoDriver(PCA9685_I2C_ADDR);
bool pcaReady = false;

// Current & Target Angles for the 3 Servos (0° to 180°)
float currentAngleThumb    = 0.0f;
float currentAngleIndexMid = 0.0f;
float currentAngleRingPnk  = 0.0f;

float targetAngleThumb     = 0.0f;
float targetAngleIndexMid  = 0.0f;
float targetAngleRingPnk   = 0.0f;

// 5 Processed Flex Angles (0° - 90° for App UI) & Raw ADC Readings
int flexAngle[5] = {0, 0, 0, 0, 0}; // 0:Thumb, 1:Index, 2:Middle, 3:Ring, 4:Pinky
int flexRaw[5]   = {0, 0, 0, 0, 0};

// 3 Raw & Processed sEMG Signals
int fds_raw = 2048, edc_raw = 2048, fcr_raw = 2048;
float emgEnvelopeFDS = 0.0f;
float emgEnvelopeEDC = 0.0f;
float emgEnvelopeFCR = 0.0f;

// System Mode: -1 = EMERGENCY STOP, 0 = Mirror Therapy, 1 = EMG Triggered, 2 = Web App Direct Mode
int systemMode = 0; 

// Telemetry Timer (30ms = ~33 Hz, smooth telemetry, safe for BLE buffer)
unsigned long lastTelemetryTime = 0;
const unsigned long TELEMETRY_INTERVAL_MS = 30;

// Servo Update Timer (20ms = 50 Hz, matches servo PWM rate)
unsigned long lastServoUpdateTime = 0;
const unsigned long SERVO_UPDATE_INTERVAL_MS = 20;

// Function Declarations
void processJsonCommand(String jsonStr);
void sampleEMGSensors();
void sampleFlexSensors();
void autoCalibrateFlexBaselines();
void broadcastTelemetry();
void executeEmergencyStop();
void clearEmergencyStop();

// -------------------------------------------------------------------------------------
// HELPER FUNCTIONS
// -------------------------------------------------------------------------------------
int angleToPcaPulse(float angle) {
  angle = constrain(angle, 0.0f, (float)SERVO_MAX_TRAVEL_DEG);
  if (INVERT_SERVO_DIR) {
    angle = (float)SERVO_MAX_TRAVEL_DEG - angle;
  }
  return map((int)angle, 0, SERVO_MAX_TRAVEL_DEG, SERVO_PULSE_0_DEG, SERVO_PULSE_180_DEG);
}

void setVibrationIntensity(uint8_t channel, uint8_t intensityPercent) {
  if (!pcaReady || systemMode == -1) {
    if (pcaReady) pca9685.setPWM(channel, 0, 0);
    return;
  }
  int pwmValue = map(constrain(intensityPercent, 0, 100), 0, 100, 0, 4095);
  if (pwmValue <= 0) {
    pca9685.setPWM(channel, 0, 0);
  } else if (pwmValue >= 4095) {
    pca9685.setPWM(channel, 4096, 0);
  } else {
    pca9685.setPWM(channel, 0, pwmValue);
  }
}

void executeEmergencyStop() {
  systemMode = -1;
  targetAngleThumb    = 0.0f;
  targetAngleIndexMid = 0.0f;
  targetAngleRingPnk  = 0.0f;

  currentAngleThumb   = 0.0f;
  currentAngleIndexMid= 0.0f;
  currentAngleRingPnk = 0.0f;

  // Open all servos immediately to 0° (Fully Lifted Hand)
  if (pcaReady) {
    pca9685.setPWM(CH_SERVO_THUMB,      0, angleToPcaPulse(0));
    pca9685.setPWM(CH_SERVO_INDEX_MID,  0, angleToPcaPulse(0));
    pca9685.setPWM(CH_SERVO_RING_PINKY, 0, angleToPcaPulse(0));
    pca9685.setPWM(CH_VIB_MOTOR,        0, 0);
  }
  Serial.println("[ESTOP] 🚨 EMERGENCY STOP! All servos opened to 0°.");
}

void clearEmergencyStop() {
  systemMode = 0;
  Serial.println("[ESTOP] ✅ Emergency Stop Cleared. Restored to Mirror Therapy.");
}

// -------------------------------------------------------------------------------------
// BLUETOOTH LOW ENERGY CALLBACKS
// -------------------------------------------------------------------------------------
#if ENABLE_BLUETOOTH_BLE
class BleServerCallbacks: public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) {
    bleConnected = true;
    Serial.println("[BLE] ✅ Wireless Client connected.");
  }
  void onDisconnect(BLEServer* pServer) {
    bleConnected = false;
    Serial.println("[BLE] ⚠️ Client disconnected. Advertising restarted.");
    BLEDevice::startAdvertising();
  }
};

class BleRxCallbacks: public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *pCharacteristic) {
    String rxValue = pCharacteristic->getValue();
    if (rxValue.length() > 0) {
      processJsonCommand(rxValue);
    }
  }
};
#endif

// -------------------------------------------------------------------------------------
// INITIAL FLEX SENSOR BASELINE CALIBRATION
// -------------------------------------------------------------------------------------
void autoCalibrateFlexBaselines() {
  Serial.println("\n[FLEX CALIB] Keep healthy hand FLAT & RELAXED for baseline calibration...");
  delay(500);

  for (int i = 0; i < 5; i++) {
    long sum = 0;
    for (int s = 0; s < 25; s++) {
      sum += analogRead(flexPins[i]);
      delay(6);
    }
    int rest = sum / 25;
    lastGoodFlexRaw[i] = rest;
    if (rest > 200 && rest < 3900) {
      flexRestADC[i] = rest;
      flexMaxTravel[i] = 320; // Default sensitive travel span
    }
    Serial.print("  [Flex "); Serial.print(i); Serial.print(" Pin "); Serial.print(flexPins[i]);
    Serial.print("] Rest ADC Baseline = "); Serial.println(rest);
  }
  Serial.println("[FLEX CALIB] ✅ Baselines recorded. Active Extension & 180° Mirroring Armed!\n");
}

// -------------------------------------------------------------------------------------
// SETUP ROUTINE
// -------------------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  Serial.setTimeout(10);
  delay(200);

  Serial.println("\n==================================================================");
  Serial.println("  NEUROGRASP & NEUROMIRROR REHABILITATION GLOVE FIRMWARE (180°)  ");
  Serial.println("==================================================================");

  pinMode(PIN_STATUS_LED, OUTPUT);
  digitalWrite(PIN_STATUS_LED, HIGH);

  // 12-Bit ADC Configuration
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);

  // Initialize I2C and PCA9685 Servo Driver
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  Wire.setClock(100000);
  delay(50);

  Wire.beginTransmission(PCA9685_I2C_ADDR);
  if (Wire.endTransmission() == 0) {
    pcaReady = true;
    pca9685.begin();
    pca9685.setPWMFreq(50);
    delay(50);

    Serial.println("[PCA9685] ✅ Driver detected & initialized at 0x40 (50 Hz).");

    // VISUAL FULL 180-DEGREE SWEEP VERIFICATION (0° -> 180° -> 0°)
    // Shows the therapist that servos are physically powered and capable of full finger lift!
    Serial.println("[SERVO INIT] Sweeping Servos (0° -> 180° -> 0°) to verify full finger lift...");
    
    // 0° (Fully Lifted Fingers)
    pca9685.setPWM(CH_SERVO_THUMB,      0, angleToPcaPulse(0));
    pca9685.setPWM(CH_SERVO_INDEX_MID,  0, angleToPcaPulse(0));
    pca9685.setPWM(CH_SERVO_RING_PINKY, 0, angleToPcaPulse(0));
    delay(600);

    // 180° (Fully Clenched Fist)
    pca9685.setPWM(CH_SERVO_THUMB,      0, angleToPcaPulse(180));
    pca9685.setPWM(CH_SERVO_INDEX_MID,  0, angleToPcaPulse(180));
    pca9685.setPWM(CH_SERVO_RING_PINKY, 0, angleToPcaPulse(180));
    delay(800);

    // Return to 0° (Fully Lifted Hand)
    pca9685.setPWM(CH_SERVO_THUMB,      0, angleToPcaPulse(0));
    pca9685.setPWM(CH_SERVO_INDEX_MID,  0, angleToPcaPulse(0));
    pca9685.setPWM(CH_SERVO_RING_PINKY, 0, angleToPcaPulse(0));
    pca9685.setPWM(CH_VIB_MOTOR, 0, 0);
    delay(400);
    Serial.println("[SERVO INIT] ✅ 180° Sweep complete. Servos resting at 0° (Hand Lifted).");
  } else {
    pcaReady = false;
    Serial.println("[PCA9685] ⚠️ PCA9685 NOT found on I2C 0x40! Check SDA(21), SCL(22), VCC, GND.");
  }

#if ENABLE_BLUETOOTH_BLE
  BLEDevice::init(BLE_DEVICE_NAME);
  pBleServer = BLEDevice::createServer();
  pBleServer->setCallbacks(new BleServerCallbacks());

  BLEService *pService = pBleServer->createService(SERVICE_UUID);
  pTxCharacteristic = pService->createCharacteristic(
                        CHARACTERISTIC_TX,
                        BLECharacteristic::PROPERTY_NOTIFY
                      );
  pTxCharacteristic->addDescriptor(new BLE2902());

  BLECharacteristic *pRxCharacteristic = pService->createCharacteristic(
                                           CHARACTERISTIC_RX,
                                           BLECharacteristic::PROPERTY_WRITE
                                         );
  pRxCharacteristic->setCallbacks(new BleRxCallbacks());

  pService->start();
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);
  pAdvertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();
  Serial.println("[BLE] ✅ Wireless BLE 'NeuroGrasp-AI' Advertising Ready.");
#endif

  // Calibrate Resting Baseline for the 5 Flex Sensors
  autoCalibrateFlexBaselines();

  // Diagnostic LED Blink
  for (int i = 0; i < 3; i++) {
    digitalWrite(PIN_STATUS_LED, LOW);
    delay(60);
    digitalWrite(PIN_STATUS_LED, HIGH);
    delay(60);
  }

  lastSampleMicros = micros();
  Serial.println("[READY] System initialized in MODULE 0: High-Torque 180° Mirror Therapy.\n");
}

// -------------------------------------------------------------------------------------
// MAIN LOOP
// -------------------------------------------------------------------------------------
void loop() {
  // 1. Process Incoming Commands from Web Application / Serial (Non-blocking)
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    processJsonCommand(cmd);
  }

  // 2. High-Precision 500 Hz Sampling Loop for sEMG & Flex Sensors
  unsigned long currentMicros = micros();
  if (currentMicros - lastSampleMicros >= SAMPLE_INTERVAL_US) {
    lastSampleMicros += SAMPLE_INTERVAL_US;

    sampleEMGSensors();
    sampleFlexSensors();
  }

  // 3. Emergency Stop State Check
  if (systemMode == -1) {
    targetAngleThumb    = 0.0f;
    targetAngleIndexMid = 0.0f;
    targetAngleRingPnk  = 0.0f;

    // Fast warning blink on onboard LED
    digitalWrite(PIN_STATUS_LED, (millis() / 200) % 2 == 0 ? HIGH : LOW);
  }
  // 4. MODULE 0: SMART 180° MIRROR THERAPY KINEMATICS
  else if (systemMode == 0) {
    // ---------------------------------------------------------------------------------
    // Proportional 180° Mirroring:
    // flexAngle (0° to 90° for App UI) is scaled to full 0° to 180° for the exoskeleton servos!
    // This gives DOUBLE the mechanical travel to power-lift and close the fingers!
    // ---------------------------------------------------------------------------------

    // Servo 1 (Thumb) <-- Thumb Flex (GPIO 35) mapped to 0° - 180°
    targetAngleThumb = (float)map(flexAngle[0], 0, 90, 0, 180);

    // Servo 2 (Index + Middle) <-- Average of Index (GPIO 32) & Middle (GPIO 33) mapped to 0° - 180°
    float avgIndexMid = ((float)flexAngle[1] + (float)flexAngle[2]) / 2.0f;
    targetAngleIndexMid = (float)map((int)avgIndexMid, 0, 90, 0, 180);

    // Servo 3 (Ring + Pinky) <-- Average of Ring (GPIO 25) & Pinky (GPIO 26) mapped to 0° - 180°
    float avgRingPnk = ((float)flexAngle[3] + (float)flexAngle[4]) / 2.0f;
    targetAngleRingPnk = (float)map((int)avgRingPnk, 0, 90, 0, 180);

    // ACTIVE EXTENSION BOOST (Clinical Feature):
    // When healthy finger is open/straight (angle < 12°), force servo to hard 0° to power-lift fingers!
    if (flexAngle[0] < 12) targetAngleThumb = 0.0f;
    if (avgIndexMid < 12.0f) targetAngleIndexMid = 0.0f;
    if (avgRingPnk < 12.0f) targetAngleRingPnk = 0.0f;

    // Single Vibration Motor on Ch 3: Vibrate when hand flexes > 55° to confirm grasp
    if (flexAngle[0] > 55 || flexAngle[1] > 55 || flexAngle[2] > 55 || flexAngle[3] > 55) {
      int maxAngle = max(flexAngle[0], max(flexAngle[1], max(flexAngle[2], flexAngle[3])));
      int vibStrength = map(maxAngle, 55, 90, 40, 100);
      setVibrationIntensity(CH_VIB_MOTOR, vibStrength);
    } else {
      setVibrationIntensity(CH_VIB_MOTOR, 0);
    }
  } 
  // MODULE 1: EMG Triggered / Therapeutic Rehabilitation Mode
  else if (systemMode == 1) {
    targetAngleThumb    = 0.0f;
    targetAngleIndexMid = 0.0f;
    targetAngleRingPnk  = 0.0f;

    // Biofeedback on muscle contraction
    if (emgEnvelopeFDS > 45.0f) {
      setVibrationIntensity(CH_VIB_MOTOR, 70);
    } else {
      setVibrationIntensity(CH_VIB_MOTOR, 0);
    }
  }
  // MODULE 2: Direct App Override Mode (angles driven by app sliders 0° - 180°)

  // 5. Smooth Servo Actuation at 50 Hz (20ms interval prevents I2C bus flooding)
  unsigned long now = millis();
  if (now - lastServoUpdateTime >= SERVO_UPDATE_INTERVAL_MS) {
    lastServoUpdateTime = now;

    currentAngleThumb    += (targetAngleThumb    - currentAngleThumb)    * SMOOTHING_FACTOR;
    currentAngleIndexMid += (targetAngleIndexMid - currentAngleIndexMid) * SMOOTHING_FACTOR;
    currentAngleRingPnk  += (targetAngleRingPnk  - currentAngleRingPnk)  * SMOOTHING_FACTOR;

    if (pcaReady) {
      pca9685.setPWM(CH_SERVO_THUMB,      0, angleToPcaPulse(currentAngleThumb));
      pca9685.setPWM(CH_SERVO_INDEX_MID,  0, angleToPcaPulse(currentAngleIndexMid));
      pca9685.setPWM(CH_SERVO_RING_PINKY, 0, angleToPcaPulse(currentAngleRingPnk));
    }
  }

  // 6. Broadcast Telemetry Frame (USB WebSerial & Wireless BLE)
  if (now - lastTelemetryTime >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryTime = now;
    broadcastTelemetry();
  }
}

// -------------------------------------------------------------------------------------
// SENSOR ACQUISITION
// -------------------------------------------------------------------------------------
void sampleEMGSensors() {
  fds_raw = analogRead(PIN_EMG_FDS);
  edc_raw = analogRead(PIN_EMG_EDC);
  fcr_raw = analogRead(PIN_EMG_FCR);

  // Rectification & Normalization (0.0% to 100.0%)
  float ampFDS = abs(fds_raw - EMG_BASELINE);
  float ampEDC = abs(edc_raw - EMG_BASELINE);
  float ampFCR = abs(fcr_raw - EMG_BASELINE);

  float normFDS = constrain((ampFDS / 800.0f) * 100.0f, 0.0f, 100.0f);
  float normEDC = constrain((ampEDC / 800.0f) * 100.0f, 0.0f, 100.0f);
  float normFCR = constrain((ampFCR / 800.0f) * 100.0f, 0.0f, 100.0f);

  // Exponential Moving Average (EMA) Low-Pass Filter
  emgEnvelopeFDS = (emgEnvelopeFDS * 0.85f) + (normFDS * 0.15f);
  emgEnvelopeEDC = (emgEnvelopeEDC * 0.85f) + (normEDC * 0.15f);
  emgEnvelopeFCR = (emgEnvelopeFCR * 0.85f) + (normFCR * 0.15f);
}

void sampleFlexSensors() {
  // Read all 5 flex sensors using Absolute Deviation Mapping
  // This is immune to wiring polarity (works whether bending increases or decreases ADC!)
  for (int i = 0; i < 5; i++) {
    int raw = analogRead(flexPins[i]);

    // Safety guard against transient ADC glitches
    if (raw >= 100 && raw <= 4095) {
      lastGoodFlexRaw[i] = raw;
    } else {
      raw = lastGoodFlexRaw[i];
    }
    flexRaw[i] = raw;

    // Difference from resting flat baseline
    int delta = abs(raw - flexRestADC[i]);

    // Dynamically expand travel window if user bends further
    if (delta > flexMaxTravel[i] && delta < 3200) {
      flexMaxTravel[i] = delta;
    }

    // Small noise deadband (22 ADC counts)
    int angle = 0;
    if (delta > 22) {
      angle = map(delta, 22, flexMaxTravel[i], 0, 90);
      angle = constrain(angle, 0, 90);
    }
    flexAngle[i] = angle;
  }
}

// -------------------------------------------------------------------------------------
// COMMAND PARSING (USB WEBSERIAL & BLE)
// -------------------------------------------------------------------------------------
void processJsonCommand(String jsonStr) {
  jsonStr.trim();
  if (jsonStr.length() == 0) return;

  // Fast ASCII commands
  if (jsonStr.equalsIgnoreCase("STOP") || jsonStr.equalsIgnoreCase("ESTOP") || jsonStr.equalsIgnoreCase("E")) {
    executeEmergencyStop();
    return;
  }
  if (jsonStr.equalsIgnoreCase("START") || jsonStr.equalsIgnoreCase("CLEAR") || jsonStr.equalsIgnoreCase("RESET")) {
    clearEmergencyStop();
    return;
  }
  if (jsonStr.startsWith("MODE") || jsonStr.startsWith("mode")) {
    if (jsonStr.indexOf("0") > 0) systemMode = 0;
    else if (jsonStr.indexOf("1") > 0) systemMode = 1;
    else if (jsonStr.indexOf("2") > 0) systemMode = 2;
    Serial.print("[MODE] Switched to Module "); Serial.println(systemMode);
    return;
  }

#if ARDUINOJSON_VERSION_MAJOR >= 7
  JsonDocument doc;
#else
  StaticJsonDocument<350> doc;
#endif

  DeserializationError err = deserializeJson(doc, jsonStr);
  if (err) return;

  // Emergency Stop Handler: {"stop": true}
  if (doc.containsKey("stop")) {
    if (doc["stop"].as<bool>() == true) executeEmergencyStop();
    else clearEmergencyStop();
    return;
  }

  // Calibration Handlers: {"calibrate_flat": true} / {"calibrate_fist": true}
  if (doc.containsKey("calibrate_flat")) {
    for (int i = 0; i < 5; i++) {
      flexRestADC[i] = flexRaw[i];
      flexMaxTravel[i] = 320;
    }
    Serial.println("[CALIB] Flat baseline re-calibrated for all 5 flex sensors.");
    return;
  }
  if (doc.containsKey("calibrate_fist")) {
    for (int i = 0; i < 5; i++) {
      int d = abs(flexRaw[i] - flexRestADC[i]);
      if (d > 100) flexMaxTravel[i] = d;
    }
    Serial.println("[CALIB] Fist maximum flex recorded for all 5 flex sensors.");
    return;
  }

  // Mode Switch: {"mode": 0} (Mirror) | {"mode": 1} (Therapeutic) | {"mode": 2} (Direct App Control)
  if (doc.containsKey("mode")) {
    systemMode = doc["mode"].as<int>();
    Serial.print("[MODE] Switched to Module: "); Serial.println(systemMode);
  }

  // Direct Servo Override: {"servos": [thumbAngle, indexMidAngle, ringPinkyAngle]}
  if (doc.containsKey("servos") && systemMode != -1) {
    systemMode = 2; // Direct app override
    targetAngleThumb    = constrain(doc["servos"][0].as<float>(), 0.0f, (float)SERVO_MAX_TRAVEL_DEG);
    targetAngleIndexMid = constrain(doc["servos"][1].as<float>(), 0.0f, (float)SERVO_MAX_TRAVEL_DEG);
    targetAngleRingPnk  = constrain(doc["servos"][2].as<float>(), 0.0f, (float)SERVO_MAX_TRAVEL_DEG);
  }

  // Single Vibration Pulse: {"vibrate": 80}
  if (doc.containsKey("vibrate") && systemMode != -1) {
    if (doc["vibrate"].is<int>()) {
      setVibrationIntensity(CH_VIB_MOTOR, doc["vibrate"].as<int>());
    } else if (doc["vibrate"].is<JsonArray>()) {
      setVibrationIntensity(CH_VIB_MOTOR, doc["vibrate"][0].as<int>());
    }
  }
}

// -------------------------------------------------------------------------------------
// TELEMETRY STREAM BROADCAST (USB WEBSERIAL & BLUETOOTH BLE)
// -------------------------------------------------------------------------------------
void broadcastTelemetry() {
  // Servo angles are normalized to 0-90 for the App visualizer, or sent directly
  int s1Val = (int)map((long)currentAngleThumb, 0, 180, 0, 90);
  int s2Val = (int)map((long)currentAngleIndexMid, 0, 180, 0, 90);
  int s3Val = (int)map((long)currentAngleRingPnk, 0, 180, 0, 90);

  String telemetryLine = String(fds_raw) + "," + String(edc_raw) + "," + String(fcr_raw) + " | {\"flex\":[";
  for (int i = 0; i < 5; i++) {
    telemetryLine += String(flexAngle[i]);
    if (i < 4) telemetryLine += ",";
  }
  telemetryLine += "],\"raw_flex\":[";
  for (int i = 0; i < 5; i++) {
    telemetryLine += String(flexRaw[i]);
    if (i < 4) telemetryLine += ",";
  }
  telemetryLine += "],\"servos\":[" + String(s1Val) + "," + String(s2Val) + "," + String(s3Val) + "],\"mode\":" + String(systemMode) + ",\"stop\":" + String(systemMode == -1 ? "true" : "false") + "}";

  // USB WebSerial (PC & Android USB-OTG)
  Serial.println(telemetryLine);

  // Wireless Bluetooth Low Energy (BLE for Mobile APK)
#if ENABLE_BLUETOOTH_BLE
  if (bleConnected && pTxCharacteristic) {
    String blePayload = telemetryLine + "\n";
    pTxCharacteristic->setValue(blePayload.c_str());
    pTxCharacteristic->notify();
  }
#endif
}
