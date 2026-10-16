/**
 * NeuroGrasp sEMG Signal Ingestion & Mirror Therapy Exoskeleton Engine
 * Calibrated for 3 BioAmp EXG Pill sensors (1.65V DC center bias @ 2048 ADC counts)
 * + 5 Flex Sensors + PCA9685 3 Servo Exoskeleton (Thumb, Index+Middle, Ring+Pinky).
 */

class EMGEngine {
  constructor() {
    this.isConnected = false;
    this.isHardwareMode = false;
    this.port = null;
    this.reader = null;

    // Dynamic DC Baseline offsets
    this.baselines = { fds: 2048, edc: 2048, fcr: 2048 };

    // Signal Channels & Ring Buffers
    this.channels = {
      fds: { raw: 0, envelope: 0, rawBuffer: new Float32Array(300) },
      edc: { raw: 0, envelope: 0, rawBuffer: new Float32Array(300) },
      fcr: { raw: 0, envelope: 0, rawBuffer: new Float32Array(300) }
    };

    // 5 Flex Sensor Angles (0° - 90°)
    this.flexAngles = [0, 0, 0, 0, 0]; // Thumb, Index, Middle, Ring, Pinky
    this.rawFlex = [2400, 2400, 2400, 2400, 2400]; // Raw 12-bit ADC counts

    // 3 Exoskeleton Servo Angles (0° - 90°)
    this.servoAngles = [0, 0, 0]; // Servo 1 (Thumb), Servo 2 (Index+Middle), Servo 3 (Ring+Pinky)

    // System Operating Mode: 0 = Flex Mirror Therapy, 1 = EMG Triggered, 2 = Web App Control
    this.systemMode = 0;

    // Target Activation Envelopes (0 to 100%)
    this.targets = { fds: 0, edc: 0, fcr: 0 };

    // Bluetooth BLE Properties
    this.bleDevice = null;
    this.bleServer = null;
    this.bleTxChar = null;
    this.bleRxChar = null;
    this.isBleConnected = false;
    this.bleBuffer = "";
  }

  bindKeyboardFallback() {
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'f') this.targets.fds = 95;   // Flexion / FDS (Fist)
      if (k === 'e') this.targets.edc = 95;   // Extension / EDC (Open)
      if (k === 'r') this.targets.fcr = 95;   // Wrist / FCR (Radial)
      if (k === 'b') { this.targets.fds = 85; this.targets.edc = 85; this.targets.fcr = 80; } // Ball Squeeze
      if (k === 's') { this.targets.fds = 65; this.targets.edc = 60; this.targets.fcr = 55; } // Sphere Grasp
      if (k === 'h') { this.targets.fds = 95; this.targets.edc = 10; this.targets.fcr = 30; } // Hook Grasp
    });

    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'f') this.targets.fds = 0;
      if (k === 'e') this.targets.edc = 0;
      if (k === 'r') this.targets.fcr = 0;
      if (k === 'b' || k === 's' || k === 'h') { this.targets.fds = 0; this.targets.edc = 0; this.targets.fcr = 0; }
    });
  }

  async sendJsonCommand(cmdObj) {
    const jsonStr = JSON.stringify(cmdObj) + "\n";

    // 1. Send via Bluetooth BLE if connected
    if (this.isBleConnected && this.bleTxChar) {
      try {
        const encoder = new TextEncoder();
        await this.bleTxChar.writeValue(encoder.encode(jsonStr));
        return;
      } catch (err) {
        console.warn("BLE command write failed:", err);
      }
    }

    // 2. Send via WebSerial USB if connected
    if (this.port && this.port.writable) {
      try {
        const textEncoder = new TextEncoderStream();
        const writableStreamClosed = textEncoder.readable.pipeTo(this.port.writable);
        const writer = textEncoder.writable.getWriter();
        await writer.write(jsonStr);
        writer.releaseLock();
      } catch (err) {
        console.warn("Serial command write failed:", err);
      }
    }
  }

  // =========================================================================
  // BLUETOOTH LOW ENERGY (WEB BLUETOOTH API FOR PHONES & PC)
  // Standard Nordic UART Service for wireless ESP32 communication
  // =========================================================================
  async connectBluetooth(onLog) {
    if (!navigator.bluetooth) {
      if (onLog) onLog('error', '⚠️ Web Bluetooth API not supported in this browser. Please use Chrome on Android/PC or modern Edge.');
      return false;
    }

    const UART_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
    const UART_TX_CHAR_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // App writes to ESP32
    const UART_RX_CHAR_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"; // ESP32 notifies App

    try {
      if (onLog) onLog('info', '🔵 Scanning for ESP32 NeuroGrasp Bluetooth device...');
      this.bleDevice = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: 'NeuroGrasp' }, { namePrefix: 'ESP32' }],
        optionalServices: [UART_SERVICE_UUID]
      });

      if (onLog) onLog('info', `Connecting to GATT server on [${this.bleDevice.name}]...`);
      this.bleServer = await this.bleDevice.gatt.connect();

      const service = await this.bleServer.getPrimaryService(UART_SERVICE_UUID);
      this.bleTxChar = await service.getCharacteristic(UART_TX_CHAR_UUID);
      this.bleRxChar = await service.getCharacteristic(UART_RX_CHAR_UUID);

      // Start Telemetry Notifications from ESP32
      await this.bleRxChar.startNotifications();
      const decoder = new TextDecoder();

      this.bleRxChar.addEventListener('characteristicvaluechanged', (event) => {
        const chunk = decoder.decode(event.target.value);
        this.bleBuffer += chunk;
        const lines = this.bleBuffer.split("\n");
        this.bleBuffer = lines.pop();

        for (let line of lines) {
          this.parseTelemetryLine(line.trim());
        }
      });

      this.bleDevice.addEventListener('gattserverdisconnected', () => {
        this.isBleConnected = false;
        this.isConnected = false;
        this.isHardwareMode = false;
        if (onLog) onLog('error', '⚠️ Bluetooth ESP32 disconnected.');
      });

      this.isBleConnected = true;
      this.isConnected = true;
      this.isHardwareMode = true;

      if (onLog) onLog('success', `✅ Bluetooth Connected to ${this.bleDevice.name}! Streaming 3x sEMG & Exoskeleton Telemetry.`);
      return true;
    } catch (err) {
      if (onLog) onLog('error', `⚠️ Bluetooth Connection Cancelled or Failed: ${err.message}`);
      return false;
    }
  }

  // =========================================================================
  // USB WEBSERIAL (115200 BAUD FOR PC & USB-OTG PHONES)
  // =========================================================================
  async connectWebSerial(onLog) {
    if (!('serial' in navigator)) {
      if (onLog) onLog('error', 'Web Serial API not supported in this browser. Please use Google Chrome or Microsoft Edge.');
      return false;
    }

    try {
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate: 115200 });
      this.isConnected = true;
      this.isHardwareMode = true;

      if (onLog) onLog('success', '✅ ESP32 WebSerial Connected (115200 Baud). Streaming 3x sEMG, 5x Flex & 3x Servos...');
      this.startReadLoop(onLog);
      return true;
    } catch (err) {
      if (onLog) {
        onLog('error', `⚠️ Serial Connection Error: ${err.message}`);
        onLog('info', '💡 TIP: Windows allows only ONE program to open a COM port at a time. If Arduino IDE Serial Monitor or BioAmp Chords is open, close them and click Connect again!');
      }
      return false;
    }
  }

  async startReadLoop(onLog) {
    if (!this.port || !this.port.readable) return;

    try {
      const textDecoder = new TextDecoderStream();
      const readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
      this.reader = textDecoder.readable.getReader();

      let buffer = "";

      while (true) {
        const { value, done } = await this.reader.read();
        if (done) {
          this.reader.releaseLock();
          break;
        }
        if (value) {
          buffer += value;
          const lines = buffer.split("\n");
          buffer = lines.pop();

          for (let line of lines) {
            this.parseTelemetryLine(line.trim());
          }
        }
      }
    } catch (err) {
      if (onLog) onLog('error', `Stream read error: ${err.message}`);
    }
  }

  // Unified Telemetry Parser for both USB WebSerial and Bluetooth BLE
  parseTelemetryLine(line) {
    if (!line || line.startsWith("#")) return;

    // Check if line contains JSON metadata separator ("fds,edc,fcr | {...}")
    let csvPart = line;
    let jsonPart = "";

    if (line.includes("|")) {
      const segments = line.split("|");
      csvPart = segments[0].trim();
      jsonPart = segments[1].trim();
    }

    // Parse sEMG CSV values
    if (csvPart.includes(",")) {
      const parts = csvPart.split(",").map(v => parseFloat(v.trim()));
      if (parts.length >= 3 && !isNaN(parts[0])) {
        this.baselines.fds += (parts[0] - this.baselines.fds) * 0.005;
        this.baselines.edc += (parts[1] - this.baselines.edc) * 0.005;
        this.baselines.fcr += (parts[2] - this.baselines.fcr) * 0.005;

        const ampFDS = Math.abs(parts[0] - this.baselines.fds);
        const ampEDC = Math.abs(parts[1] - this.baselines.edc);
        const ampFCR = Math.abs(parts[2] - this.baselines.fcr);

        this.targets.fds = Math.min(100, Math.max(0, (ampFDS / 700.0) * 100));
        this.targets.edc = Math.min(100, Math.max(0, (ampEDC / 700.0) * 100));
        this.targets.fcr = Math.min(100, Math.max(0, (ampFCR / 700.0) * 100));
      }
    }

    // Parse Flex & Servo JSON Metadata
    if (jsonPart && jsonPart.startsWith("{")) {
      try {
        const meta = JSON.parse(jsonPart);
        if (meta.flex) this.flexAngles = meta.flex;
        if (meta.raw_flex) this.rawFlex = meta.raw_flex;
        if (meta.servos) this.servoAngles = meta.servos;
        if (meta.mode !== undefined) this.systemMode = meta.mode;
      } catch (e) {
        // Ignore transient JSON parse error
      }
    }
  }

  async testServos() {
    return this.sendJsonCommand({ test_servos: true });
  }

  async calibrateFlat() {
    return this.sendJsonCommand({ calibrate_flat: true });
  }

  async calibrateFist() {
    return this.sendJsonCommand({ calibrate_fist: true });
  }

  async setSystemMode(modeNum) {
    this.systemMode = modeNum;
    return this.sendJsonCommand({ mode: modeNum });
  }

  update(dt) {
    const alpha = Math.min(1.0, dt * 18.0);

    ['fds', 'edc', 'fcr'].forEach(ch => {
      const targetPct = this.targets[ch];
      const targetAmp = (targetPct / 100.0) * 1.2;

      this.channels[ch].envelope += (targetPct - this.channels[ch].envelope) * alpha;

      const noise = (Math.random() - 0.5) * 0.03;
      const rawVal = (Math.random() - 0.5) * 2 * targetAmp + noise;
      this.channels[ch].raw = rawVal;

      const buf = this.channels[ch].rawBuffer;
      buf.copyWithin(0, 1);
      buf[buf.length - 1] = rawVal;
    });

    // In simulation mode (without hardware), update flex & servo angles dynamically
    if (!this.isHardwareMode) {
      const avgEnv = (this.channels.fds.envelope + this.channels.fcr.envelope) / 2;
      const targetAngle = (avgEnv / 100.0) * 90.0;

      for (let i = 0; i < 5; i++) {
        this.flexAngles[i] += (targetAngle - this.flexAngles[i]) * Math.min(1.0, dt * 10);
      }

      this.servoAngles[0] += (this.flexAngles[0] - this.servoAngles[0]) * Math.min(1.0, dt * 10);
      this.servoAngles[1] += (((this.flexAngles[1] + this.flexAngles[2]) / 2) - this.servoAngles[1]) * Math.min(1.0, dt * 10);
      this.servoAngles[2] += (((this.flexAngles[3] + this.flexAngles[4]) / 2) - this.servoAngles[2]) * Math.min(1.0, dt * 10);
    }
  }
}

if (typeof window !== 'undefined') {
  window.EMGEngine = EMGEngine;
}
