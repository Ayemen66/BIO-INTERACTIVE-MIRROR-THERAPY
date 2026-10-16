/*
 * =====================================================================================
 * NEUROGRASP EXOSKELETON - DEDICATED SERVO HARDWARE TEST BENCH
 * =====================================================================================
 * Purpose:
 *   Standalone diagnostic firmware to test PCA9685 and 3 Exoskeleton Servo Motors.
 *   Contains ZERO unnecessary dependencies (no Bluetooth, no EMG, no WebSerial).
 * 
 * Hardware Wiring (ESP32 30-Pin DevKit to PCA9685):
 *   - ESP32 GPIO 21 (SDA)  ----->  PCA9685 SDA
 *   - ESP32 GPIO 22 (SCL)  ----->  PCA9685 SCL
 *   - ESP32 3.3V or VIN    ----->  PCA9685 VCC (Chip Logic Power)
 *   - ESP32 GND            ----->  PCA9685 GND
 * 
 * CRITICAL POWER REQUIREMENT FOR SERVOS:
 *   - Servos CANNOT run on ESP32 3.3V or USB power!
 *   - Connect an EXTERNAL 5V or 6V (2A - 5A) power supply to the PCA9685 
 *     GREEN SCREW TERMINAL:
 *       (+) 5V/6V Power Supply  ----->  PCA9685 V+ (Screw Terminal)
 *       (-) GND Power Supply    ----->  PCA9685 GND (Screw Terminal)
 *       ESP32 GND               ----->  PCA9685 GND (Common Ground)
 * 
 * Servo Channels on PCA9685:
 *   - Channel 0: Servo 1 (Thumb)
 *   - Channel 1: Servo 2 (Index + Middle)
 *   - Channel 2: Servo 3 (Ring + Pinky)
 * 
 * Servo Wire Colors:
 *   - Brown / Black  ----->  GND (Top row / Black pin)
 *   - Red            ----->  V+  (Middle row / Red pin)
 *   - Orange / White ----->  PWM Signal (Bottom row / Yellow pin)
 * =====================================================================================
 */

#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>

#define I2C_SDA_PIN      21
#define I2C_SCL_PIN      22
#define PCA9685_ADDR     0x40

// Servo Channels
#define CH_SERVO_1       0  // Thumb
#define CH_SERVO_2       1  // Index + Middle
#define CH_SERVO_3       2  // Ring + Pinky

// Calibrated 50Hz PWM Servo Pulses for SG90 / MG90S / MG995
// 50Hz period = 20,000 µs. 1 tick = ~4.88 µs.
// 0° (Fully Open Hand)   = 180 ticks (~880 µs)
// 90° (Full Fist Clench) = 430 ticks (~2100 µs)
#define PULSE_0_DEG      180
#define PULSE_90_DEG     430

Adafruit_PWMServoDriver pca = Adafruit_PWMServoDriver(PCA9685_ADDR);
bool pcaConnected = false;

int angleToPulse(int angle) {
  angle = constrain(angle, 0, 90);
  return map(angle, 0, 90, PULSE_0_DEG, PULSE_90_DEG);
}

void setServoAngle(uint8_t ch, int angle) {
  int pulse = angleToPulse(angle);
  pca.setPWM(ch, 0, pulse);
}

void scanI2CBus() {
  Serial.println("\n--------------------------------------------------");
  Serial.println("[I2C SCAN] Scanning bus on GPIO 21 (SDA) / GPIO 22 (SCL)...");
  byte count = 0;
  for (byte i = 1; i < 127; i++) {
    Wire.beginTransmission(i);
    if (Wire.endTransmission() == 0) {
      Serial.print("  -> Found I2C Device at address: 0x");
      if (i < 16) Serial.print("0");
      Serial.println(i, HEX);
      count++;
      if (i == PCA9685_ADDR || i == 0x41) {
        pcaConnected = true;
      }
    }
  }

  if (count == 0) {
    Serial.println("\n[ERROR] NO I2C DEVICES FOUND!");
    Serial.println("  1. Check GPIO 21 (SDA) and GPIO 22 (SCL) connections.");
    Serial.println("  2. Check that PCA9685 VCC is connected to ESP32 3.3V or VIN.");
    Serial.println("  3. Check that PCA9685 GND is connected to ESP32 GND.\n");
  } else if (pcaConnected) {
    Serial.println("[SUCCESS] PCA9685 Servo Driver found at 0x40!\n");
  }
}

void sweepServo(uint8_t ch, const char* name) {
  Serial.print(">> Testing ");
  Serial.print(name);
  Serial.print(" (PCA9685 Channel ");
  Serial.print(ch);
  Serial.println(")...");

  Serial.println("   Moving 0° -> 90° (Closing)...");
  for (int a = 0; a <= 90; a += 5) {
    setServoAngle(ch, a);
    delay(25);
  }
  delay(400);

  Serial.println("   Moving 90° -> 0° (Opening)...");
  for (int a = 90; a >= 0; a -= 5) {
    setServoAngle(ch, a);
    delay(25);
  }
  delay(300);
}

void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("\n==========================================================");
  Serial.println("  NEUROGRASP - PCA9685 SERVO HARDWARE DIAGNOSTIC TEST     ");
  Serial.println("==========================================================");

  // Initialize I2C
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  Wire.setClock(100000);
  delay(100);

  // Scan I2C
  scanI2CBus();

  if (pcaConnected) {
    pca.begin();
    pca.setPWMFreq(50); // 50 Hz servo PWM
    delay(50);

    // Initial position 0°
    setServoAngle(CH_SERVO_1, 0);
    setServoAngle(CH_SERVO_2, 0);
    setServoAngle(CH_SERVO_3, 0);
    Serial.println("[READY] Servos homed to 0° (Open Hand).");
  }

  Serial.println("\n--- HARDWARE POWER VERIFICATION ---");
  Serial.println("If servos do not move during the test below:");
  Serial.println("1. Did you connect an EXTERNAL 5V supply to the PCA9685 green terminal (V+)?");
  Serial.println("2. Is the external power supply turned ON?");
  Serial.println("3. Are the servo plugs facing the right way? (Brown=GND, Red=5V, Yellow=Signal)\n");

  Serial.println("Type commands in Serial Monitor:");
  Serial.println("  's' = Run automatic sweep test on all servos");
  Serial.println("  '1' = Move Servo 1 (Thumb) to 90°");
  Serial.println("  '2' = Move Servo 2 (Index+Mid) to 90°");
  Serial.println("  '3' = Move Servo 3 (Ring+Pinky) to 90°");
  Serial.println("  '0' = Open all servos to 0°\n");

  delay(1500);
}

void loop() {
  // Check for incoming Serial commands from user
  if (Serial.available()) {
    char cmd = Serial.read();
    
    if (cmd == 's' || cmd == 'S') {
      Serial.println("\n=== STARTING FULL AUTOMATIC SERVO SWEEP TEST ===");
      sweepServo(CH_SERVO_1, "Servo 1 [Thumb]");
      sweepServo(CH_SERVO_2, "Servo 2 [Index + Middle]");
      sweepServo(CH_SERVO_3, "Servo 3 [Ring + Pinky]");

      Serial.println(">> Moving ALL 3 SERVOS TOGETHER (0° -> 90° -> 0°)...");
      for (int a = 0; a <= 90; a += 5) {
        setServoAngle(CH_SERVO_1, a);
        setServoAngle(CH_SERVO_2, a);
        setServoAngle(CH_SERVO_3, a);
        delay(25);
      }
      delay(600);
      for (int a = 90; a >= 0; a -= 5) {
        setServoAngle(CH_SERVO_1, a);
        setServoAngle(CH_SERVO_2, a);
        setServoAngle(CH_SERVO_3, a);
        delay(25);
      }
      Serial.println("=== SWEEP TEST FINISHED! ===\n");
    }
    else if (cmd == '1') {
      Serial.println("Servo 1 (Thumb) -> 90° (Closed)");
      setServoAngle(CH_SERVO_1, 90);
    }
    else if (cmd == '2') {
      Serial.println("Servo 2 (Index + Mid) -> 90° (Closed)");
      setServoAngle(CH_SERVO_2, 90);
    }
    else if (cmd == '3') {
      Serial.println("Servo 3 (Ring + Pinky) -> 90° (Closed)");
      setServoAngle(CH_SERVO_3, 90);
    }
    else if (cmd == '0') {
      Serial.println("All Servos -> 0° (Fully Open Hand)");
      setServoAngle(CH_SERVO_1, 0);
      setServoAngle(CH_SERVO_2, 0);
      setServoAngle(CH_SERVO_3, 0);
    }
  }

  // Automatic periodic sweep every 6 seconds so user sees movement without typing
  static unsigned long lastAutoSweep = 0;
  if (millis() - lastAutoSweep >= 6000) {
    lastAutoSweep = millis();
    if (pcaConnected) {
      Serial.println("[AUTO-TEST] Sweeping all 3 servos (0° -> 90° -> 0°)...");
      for (int a = 0; a <= 90; a += 6) {
        setServoAngle(CH_SERVO_1, a);
        setServoAngle(CH_SERVO_2, a);
        setServoAngle(CH_SERVO_3, a);
        delay(20);
      }
      delay(400);
      for (int a = 90; a >= 0; a -= 6) {
        setServoAngle(CH_SERVO_1, a);
        setServoAngle(CH_SERVO_2, a);
        setServoAngle(CH_SERVO_3, a);
        delay(20);
      }
      delay(200);
      Serial.println("[AUTO-TEST] Sweep complete. Waiting 6 seconds for next cycle...");
    }
  }
}
