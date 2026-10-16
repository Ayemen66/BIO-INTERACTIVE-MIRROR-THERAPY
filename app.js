/**
 * NeuroGrasp AI Main Application Orchestrator
 * Connects 3-channel sEMG acquisition, GNN 8-gesture model, PCA9685 3-Servo Mirror Therapy, visual multi-game suite, and Emergency Stop Safety system.
 */

let emgEngine;
let gnnEngine;
let visualGame;
let progressTracker;
let activeTab = 'monitoring';
let selectedGameMode = 'hand_ball';
let isEmergencyStopped = false;
let lastTime = 0;

function logDiagnostic(type, message) {
  const terminal = document.getElementById('app-terminal');
  if (!terminal) return;

  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

  const entry = document.createElement('div');
  entry.style.marginBottom = '4px';
  entry.innerHTML = `<span style="color:#64748b;">[${timeStr}]</span> <span style="color:${type === 'error' ? '#f43f5e' : type === 'success' ? '#10b981' : '#38bdf8'};">${message}</span>`;

  terminal.appendChild(entry);
  terminal.scrollTop = terminal.scrollHeight;
}

window.selectGameMode = function(mode) {
  selectedGameMode = mode;
  if (visualGame) visualGame.setGameMode(mode);

  ['hand', 'maze', 'galaxy'].forEach(m => {
    const card = document.getElementById(`card-game-${m}`);
    if (card) {
      if ((m === 'hand' && mode === 'hand_ball') || m === mode) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    }
  });

  logDiagnostic('info', `🎮 Switched Active Game to: [${mode.toUpperCase()}]`);
};

window.triggerHapticPulse = function(intensity) {
  if (isEmergencyStopped) {
    logDiagnostic('error', '⚠️ Emergency Stop is active. Reset Emergency Stop to use haptics.');
    return;
  }
  if (emgEngine) {
    const vibArr = [intensity, intensity, intensity, intensity, intensity];
    emgEngine.sendJsonCommand({ vibrate: vibArr });
    logDiagnostic('info', `📳 Haptic Vibration Test Triggered (${intensity}% Intensity).`);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  emgEngine = new EMGEngine();
  gnnEngine = new GNNModelEngine();
  visualGame = new VisualRehabGame('visual-game-canvas');
  progressTracker = new ProgressTracker();

  // Initialize Theme (White background for Phone APK / Mobile or saved preference)
  const isMobileOrApk = window.isAndroidApk || (window.innerWidth <= 960) || (localStorage.getItem('neurograsp_theme') === 'white');
  if (isMobileOrApk) {
    document.body.classList.add('theme-white');
    const themeIcon = document.getElementById('theme-icon');
    if (themeIcon) themeIcon.textContent = '🌙 Cyber Dark';
  }

  // Theme Toggle Button
  const btnTheme = document.getElementById('btn-toggle-theme');
  if (btnTheme) {
    btnTheme.addEventListener('click', () => {
      const isWhite = document.body.classList.toggle('theme-white');
      const themeIcon = document.getElementById('theme-icon');
      if (themeIcon) themeIcon.textContent = isWhite ? '🌙 Cyber Dark' : '☀️ White Clinic';
      localStorage.setItem('neurograsp_theme', isWhite ? 'white' : 'dark');
      logDiagnostic('info', `🎨 Visual Theme Switched to: [${isWhite ? 'WHITE MEDICAL CLINIC' : 'CYBER DARK'}]`);
    });
  }

  // Patient Intake Modal Flow
  const modalIntake = document.getElementById('modal-patient-intake');
  const formIntake = document.getElementById('form-patient-intake');
  const btnNewPatient = document.getElementById('btn-new-patient');
  const btnProgressNewPatient = document.getElementById('btn-progress-new-patient');

  const openIntakeModal = () => {
    if (modalIntake) {
      modalIntake.classList.remove('hidden');
      const nameInput = document.getElementById('input-patient-name');
      if (nameInput) nameInput.focus();
    }
  };

  const closeIntakeModal = () => {
    if (modalIntake) modalIntake.classList.add('hidden');
  };

  if (formIntake) {
    formIntake.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('input-patient-name') ? document.getElementById('input-patient-name').value : "Patient";
      const age = document.getElementById('input-patient-age') ? document.getElementById('input-patient-age').value : "45";
      const hand = document.getElementById('select-hand-affected') ? document.getElementById('select-hand-affected').value : "Right Hand";

      progressTracker.setPatient(name, age, hand);
      closeIntakeModal();
      logDiagnostic('success', `👤 Registered Patient: [${name}], Age: [${age}], Target Hand: [${hand}]. 3-Trial Evaluation Initialized.`);
      switchTab('game');
    });
  }

  if (btnNewPatient) btnNewPatient.addEventListener('click', openIntakeModal);
  if (btnProgressNewPatient) btnProgressNewPatient.addEventListener('click', openIntakeModal);

  // Auto show Patient Intake on startup if not registered
  setTimeout(() => {
    if (progressTracker && progressTracker.patientName === "Pending Intake") {
      openIntakeModal();
    }
  }, 350);

  // Tab Navigation Routing
  const tabs = document.querySelectorAll('.nav-tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetView = tab.getAttribute('data-tab');
      switchTab(targetView);
    });
  });

  // Bluetooth BLE Connect Button
  const btnConnectBle = document.getElementById('btn-connect-ble');
  if (btnConnectBle) {
    btnConnectBle.addEventListener('click', async () => {
      const ok = await emgEngine.connectBluetooth(logDiagnostic);
      if (ok) {
        btnConnectBle.classList.add('bluetooth-active');
        const txt = document.getElementById('txt-ble-status');
        if (txt) txt.textContent = '● BLE CONNECTED';
      }
    });
  }

  // USB Connect Button
  const btnConnect = document.getElementById('btn-connect-usb');
  if (btnConnect) {
    btnConnect.addEventListener('click', async () => {
      const ok = await emgEngine.connectWebSerial(logDiagnostic);
      if (ok) {
        btnConnect.classList.add('connected');
        const txt = document.getElementById('txt-usb-status');
        if (txt) txt.textContent = '● USB CONNECTED';
      }
    });
  }

  // 🚨 EMERGENCY POWER STOP BUTTON HANDLER
  const btnEStop = document.getElementById('btn-emergency-stop');
  if (btnEStop) {
    btnEStop.addEventListener('click', () => {
      isEmergencyStopped = !isEmergencyStopped;

      if (isEmergencyStopped) {
        // Activate Emergency Stop
        btnEStop.classList.add('active-estop');
        btnEStop.innerHTML = '🚨 EMERGENCY STOPPED (CLICK TO RESET)';

        // 1. Send Emergency Stop Command to ESP32 (works across USB and Bluetooth!)
        if (emgEngine) {
          emgEngine.sendJsonCommand({ stop: true, mode: -1 });
          emgEngine.servoAngles = [0, 0, 0];
        }

        // 2. Stop Game if running
        if (visualGame && visualGame.isPlaying) {
          visualGame.stop();
        }

        // 3. Reset Sliders UI to 0°
        ['slider-servo1', 'slider-servo2', 'slider-servo3'].forEach((id, idx) => {
          const el = document.getElementById(id);
          if (el) el.value = 0;
          const txt = document.getElementById(`txt-servo${idx + 1}-angle`);
          if (txt) txt.textContent = '0°';
        });

        logDiagnostic('error', '🚨 EMERGENCY POWER STOP ACTIVATED! All servos opened & haptics powered OFF.');
      } else {
        // Reset Emergency Stop
        btnEStop.classList.remove('active-estop');
        btnEStop.innerHTML = '🚨 EMERGENCY STOP';

        if (emgEngine) {
          emgEngine.sendJsonCommand({ mode: 0 });
        }

        logDiagnostic('success', '✅ Emergency Stop cleared. System resumed in Mode 0 (Mirror Therapy).');
      }
    });
  }

  // Mirror Therapy Hardware Test & Calibration Controls
  const btnTestServos = document.getElementById('btn-test-servos');
  if (btnTestServos) {
    btnTestServos.addEventListener('click', async () => {
      if (isEmergencyStopped) {
        logDiagnostic('error', '⚠️ Cannot test servos while Emergency Stop is active.');
        return;
      }
      logDiagnostic('info', '🦾 Sending Servo Diagnostic Test Sweep (0° -> 60° -> 0°)...');
      if (emgEngine) await emgEngine.testServos();
      logDiagnostic('success', '✅ Servo sweep command sent! If servos did not move, check external 5V power on PCA9685 green terminal (V+)!');
    });
  }

  const btnCalibFlat = document.getElementById('btn-calib-flat');
  if (btnCalibFlat) {
    btnCalibFlat.addEventListener('click', async () => {
      logDiagnostic('info', '📏 Capturing Flat / Straight finger baselines for flex sensors...');
      if (emgEngine) await emgEngine.calibrateFlat();
      logDiagnostic('success', '✅ Straight fingers baseline calibrated!');
    });
  }

  const btnCalibFist = document.getElementById('btn-calib-fist');
  if (btnCalibFist) {
    btnCalibFist.addEventListener('click', async () => {
      logDiagnostic('info', '✊ Capturing Fist / Bent finger baselines for flex sensors...');
      if (emgEngine) await emgEngine.calibrateFist();
      logDiagnostic('success', '✅ Full fist baseline calibrated!');
    });
  }

  // System Mode Selector
  const selectSysMode = document.getElementById('select-system-mode');
  if (selectSysMode) {
    selectSysMode.addEventListener('change', (e) => {
      if (isEmergencyStopped) {
        logDiagnostic('error', '⚠️ Clear Emergency Stop before switching modes.');
        return;
      }
      const modeVal = parseInt(e.target.value);
      if (emgEngine) emgEngine.setSystemMode(modeVal);

      const badge = document.getElementById('badge-mirror-mode');
      if (badge) {
        if (modeVal === 0) {
          badge.textContent = '● MODE 0: MIRROR ACTIVE';
          badge.style.borderColor = 'var(--accent-green)';
          badge.style.color = 'var(--accent-green)';
          badge.style.background = 'rgba(16, 185, 129, 0.2)';
        } else if (modeVal === 1) {
          badge.textContent = '● MODE 1: sEMG TRIGGERED';
          badge.style.borderColor = 'var(--accent-cyan)';
          badge.style.color = 'var(--accent-cyan)';
          badge.style.background = 'rgba(56, 189, 248, 0.2)';
        } else {
          badge.textContent = '● MODE 2: MANUAL OVERRIDE';
          badge.style.borderColor = 'var(--accent-purple)';
          badge.style.color = 'var(--accent-purple)';
          badge.style.background = 'rgba(192, 132, 252, 0.2)';
        }
      }
      logDiagnostic('info', `System Operating Mode Switched to: [MODE ${modeVal}]`);
    });
  }

  // Servo Slider Overrides
  const s1 = document.getElementById('slider-servo1');
  const s2 = document.getElementById('slider-servo2');
  const s3 = document.getElementById('slider-servo3');

  const onServoSliderChange = () => {
    if (isEmergencyStopped) return;
    if (s1 && s2 && s3 && emgEngine) {
      const s1Val = parseInt(s1.value);
      const s2Val = parseInt(s2.value);
      const s3Val = parseInt(s3.value);

      document.getElementById('txt-servo1-angle').textContent = `${s1Val}°`;
      document.getElementById('txt-servo2-angle').textContent = `${s2Val}°`;
      document.getElementById('txt-servo3-angle').textContent = `${s3Val}°`;

      emgEngine.sendJsonCommand({ servos: [s1Val, s2Val, s3Val] });
    }
  };

  if (s1) s1.addEventListener('input', onServoSliderChange);
  if (s2) s2.addEventListener('input', onServoSliderChange);
  if (s3) s3.addEventListener('input', onServoSliderChange);

  // Game Controls
  const btnStartGame = document.getElementById('btn-start-game');
  const btnStopGame = document.getElementById('btn-stop-game');

  if (btnStartGame) {
    btnStartGame.addEventListener('click', () => {
      if (isEmergencyStopped) {
        logDiagnostic('error', '⚠️ Clear Emergency Stop before starting game session.');
        return;
      }

      const trialNum = progressTracker ? progressTracker.getCurrentTrialNumber() : 1;
      if (progressTracker && progressTracker.isSessionComplete()) {
        alert(`Patient ${progressTracker.patientName} has finished all 3 trials! Click "Register Next Patient" to start evaluation for another patient.`);
        return;
      }

      const dur = document.getElementById('select-game-duration') ? document.getElementById('select-game-duration').value : 60;
      visualGame.start(emgEngine, gnnEngine, dur, selectedGameMode);
      btnStartGame.style.display = 'none';
      if (btnStopGame) btnStopGame.style.display = 'inline-flex';
      logDiagnostic('info', `🎮 Trial ${trialNum} of 3 Started [Mode: ${selectedGameMode.toUpperCase()}, Duration: ${dur}s].`);
    });
  }

  if (btnStopGame) {
    btnStopGame.addEventListener('click', () => {
      visualGame.stop();
      btnStartGame.style.display = 'inline-flex';
      btnStopGame.style.display = 'none';
      logDiagnostic('info', '🎮 Trial stopped by therapist.');
    });
  }

  // Export Report Button
  const btnExport = document.getElementById('btn-export-report');
  if (btnExport) {
    btnExport.addEventListener('click', () => {
      progressTracker.exportReport();
    });
  }

  // Download High-Resolution Charts Button
  const btnDownloadCharts = document.getElementById('btn-download-charts');
  if (btnDownloadCharts) {
    btnDownloadCharts.addEventListener('click', () => {
      progressTracker.exportHighResCharts();
    });
  }

  // Listen for session/trial end
  window.addEventListener('game-session-end', (e) => {
    progressTracker.addSession(e.detail);
    if (btnStartGame) btnStartGame.style.display = 'inline-flex';
    if (btnStopGame) btnStopGame.style.display = 'none';
    logDiagnostic('success', `Trial ${progressTracker.trials.length} complete! Accuracy: ${e.detail.accuracy}%, Score: ${e.detail.score}`);

    // If 3 trials reached, automatically switch to Progress Tracker tab to view full results!
    if (progressTracker.trials.length >= 3) {
      setTimeout(() => switchTab('progress'), 800);
    }
  });

  // Initial Logs
  logDiagnostic('success', 'NeuroGrasp AI sEMG Rehabilitation Suite Initialized.');
  logDiagnostic('info', 'ESP32 Pins: sEMG FDS (GPIO36), EDC (GPIO39), FCR (GPIO34). Flex (35,32,33,25,26). Servos (PCA9685 Ch 0,1,2).');
  logDiagnostic('success', 'Pre-trained GNN 8-Class Model Ready.');

  progressTracker.renderSessionTable();
  progressTracker.updateStatsCards();
  progressTracker.renderHighResCharts();

  // Start Render Loop
  lastTime = performance.now();
  requestAnimationFrame(mainAppLoop);
});

function switchTab(tabName) {
  const views = ['monitoring', 'mirror', 'game', 'progress', 'hardware'];
  views.forEach(v => {
    const el = document.getElementById(`tab-${v}`);
    if (el) el.classList.remove('active-view');
  });

  const targetEl = document.getElementById(`tab-${tabName}`);
  if (targetEl) targetEl.classList.add('active-view');

  const tabs = document.querySelectorAll('.nav-tab-btn');
  tabs.forEach(t => {
    if (t.getAttribute('data-tab') === tabName) t.classList.add('active');
    else t.classList.remove('active');
  });

  activeTab = tabName;
  if (tabName === 'game' && visualGame) visualGame.resizeCanvas();
}

function mainAppLoop(timestamp) {
  const dt = Math.min(0.1, (timestamp - lastTime) / 1000);
  lastTime = timestamp;

  if (emgEngine) emgEngine.update(dt);

  const fdsEnv = emgEngine ? emgEngine.channels.fds.envelope : 0;
  const edcEnv = emgEngine ? emgEngine.channels.edc.envelope : 0;
  const fcrEnv = emgEngine ? emgEngine.channels.fcr.envelope : 0;

  // Run GNN Inference
  let gnnRes = { predictedClass: 'Final Rest', confidence: 0.95 };
  if (gnnEngine) {
    gnnRes = gnnEngine.predict(fdsEnv, edcEnv, fcrEnv);
  }

  // Update Monitoring View UI
  if (activeTab === 'monitoring') {
    drawScope('canvas-fds', emgEngine.channels.fds.rawBuffer, '#38bdf8', fdsEnv, 'val-fds-env');
    drawScope('canvas-edc', emgEngine.channels.edc.rawBuffer, '#f43f5e', edcEnv, 'val-edc-env');
    drawScope('canvas-fcr', emgEngine.channels.fcr.rawBuffer, '#10b981', fcrEnv, 'val-fcr-env');

    if (gnnEngine) {
      gnnEngine.drawGraphNetwork('canvas-gnn-topology', fdsEnv, edcEnv, fcrEnv);
    }

    const gestureTxt = document.getElementById('gnn-predicted-gesture');
    const confTxt = document.getElementById('gnn-confidence-val');
    if (gestureTxt) gestureTxt.textContent = gnnRes.predictedClass;
    if (confTxt) confTxt.textContent = `${Math.round(gnnRes.confidence * 100)}%`;
  }

  // Update Mirror Therapy View UI
  if (activeTab === 'mirror' && emgEngine) {
    for (let i = 0; i < 5; i++) {
      const elVal = document.getElementById(`flex-val-${i}`);
      const elRaw = document.getElementById(`flex-raw-${i}`);
      const elBar = document.getElementById(`flex-bar-${i}`);
      const angle = Math.round(emgEngine.flexAngles[i]);
      const raw = (emgEngine.rawFlex && emgEngine.rawFlex[i] !== undefined) ? emgEngine.rawFlex[i] : '--';

      if (elVal) elVal.textContent = `${angle}°`;
      if (elRaw) elRaw.textContent = `ADC: ${raw}`;
      if (elBar) elBar.style.width = `${Math.min(100, Math.max(0, (angle / 90) * 100))}%`;
    }

    const s1 = document.getElementById('slider-servo1');
    const s2 = document.getElementById('slider-servo2');
    const s3 = document.getElementById('slider-servo3');

    if (s1 && document.activeElement !== s1) {
      s1.value = Math.round(emgEngine.servoAngles[0]);
      document.getElementById('txt-servo1-angle').textContent = `${Math.round(emgEngine.servoAngles[0])}°`;
    }
    if (s2 && document.activeElement !== s2) {
      s2.value = Math.round(emgEngine.servoAngles[1]);
      document.getElementById('txt-servo2-angle').textContent = `${Math.round(emgEngine.servoAngles[1])}°`;
    }
    if (s3 && document.activeElement !== s3) {
      s3.value = Math.round(emgEngine.servoAngles[2]);
      document.getElementById('txt-servo3-angle').textContent = `${Math.round(emgEngine.servoAngles[2])}°`;
    }

    // Render the synchronized dual hand mirror therapy visualizer
    drawMirrorHandsVisualizer(emgEngine.flexAngles, emgEngine.servoAngles);
  }

  // Update Game Loop
  if (activeTab === 'game' && visualGame) {
    visualGame.update(dt);
  }

  requestAnimationFrame(mainAppLoop);
}

function drawScope(canvasId, buffer, color, envVal, labelId) {
  const canvas = document.getElementById(canvasId);
  const label = document.getElementById(labelId);
  if (label) label.textContent = `${Math.round(envVal)}%`;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  for (let i = 0; i < buffer.length; i++) {
    const x = (i / buffer.length) * w;
    const y = (h / 2) - (buffer[i] * (h / 2 - 5));
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

/**
 * High-Fidelity Dual-Hand Mirror Therapy Visualizer
 * Synchronously displays the Healthy Master Glove and the Robotic Exoskeleton Glove.
 */
function drawMirrorHandsVisualizer(flexAngles, servoAngles) {
  const canvas = document.getElementById('canvas-mirror-hands');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  // Background subtle technical grid
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.05)';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y < h; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  // 1. Draw Left Hand: Healthy Master Hand (Flex Sensors)
  drawArticulatedHand(ctx, w * 0.22, h * 0.72, flexAngles, {
    isExoskeleton: false,
    title: "🖐️ HEALTHY MASTER GLOVE",
    subtitle: "5 Flex Sensors (Master Kinematics)",
    baseColor: "#38bdf8",
    accentColor: "#10b981",
    glowColor: "rgba(56, 189, 248, 0.4)"
  });

  // 2. Draw Center: Neural Mirroring Synapse Channel
  const cx = w * 0.50;
  const cy = h * 0.48;

  ctx.save();
  ctx.fillStyle = 'rgba(8, 12, 26, 0.9)';
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, cx - 115, cy - 42, 230, 84, 12);
  ctx.fill();
  ctx.stroke();

  // Synapse text
  ctx.fillStyle = '#38bdf8';
  ctx.font = '800 13px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('⇄ NEURO-MIRROR ⇄', cx, cy - 10);

  ctx.font = '700 10px JetBrains Mono, monospace';
  ctx.fillStyle = '#10b981';
  ctx.fillText('BILATERAL SYNAPSE', cx, cy + 8);

  ctx.font = '600 9px Inter, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText('Healthy Hand ➔ Exoskeleton Servos', cx, cy + 24);

  // Animated synaptic pulse dots
  const time = performance.now() * 0.003;
  for (let d = 0; d < 4; d++) {
    const pulseX = cx - 95 + ((time * 70 + d * 55) % 190);
    ctx.beginPath();
    ctx.arc(pulseX, cy - 25, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#38bdf8';
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 8;
    ctx.fill();
  }
  ctx.restore();

  // 3. Draw Right Hand: Impaired Robotic Exoskeleton (Servos)
  const exoFingerAngles = [
    servoAngles[0] || 0, // Thumb
    servoAngles[1] || 0, // Index
    servoAngles[1] || 0, // Middle
    servoAngles[2] || 0, // Ring
    servoAngles[2] || 0  // Pinky
  ];

  drawArticulatedHand(ctx, w * 0.78, h * 0.72, exoFingerAngles, {
    isExoskeleton: true,
    title: "🦾 ROBOTIC EXOSKELETON",
    subtitle: "3 PCA9685 Servos (Slave Actuation)",
    baseColor: "#f43f5e",
    accentColor: "#c084fc",
    glowColor: "rgba(244, 63, 94, 0.4)",
    servoAngles: servoAngles
  });
}

/**
 * Draws an articulated hand with 5 realistic bending fingers and knuckle joints
 */
function drawArticulatedHand(ctx, rootX, rootY, angles, config) {
  ctx.save();

  // Title Header
  ctx.textAlign = 'center';
  ctx.font = '800 13px Inter, sans-serif';
  ctx.fillStyle = config.baseColor;
  ctx.fillText(config.title, rootX, 28);

  ctx.font = '600 10px Inter, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.fillText(config.subtitle, rootX, 44);

  // Palm Base
  ctx.fillStyle = config.isExoskeleton ? 'rgba(30, 15, 35, 0.85)' : 'rgba(10, 25, 45, 0.85)';
  ctx.strokeStyle = config.baseColor;
  ctx.lineWidth = 2;
  ctx.shadowColor = config.glowColor;
  ctx.shadowBlur = 10;

  ctx.beginPath();
  ctx.ellipse(rootX, rootY, 48, 38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Exoskeleton PCB / Mechanical Bracket lines on Palm
  if (config.isExoskeleton) {
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rootX - 25, rootY - 10);
    ctx.lineTo(rootX + 25, rootY - 10);
    ctx.moveTo(rootX - 30, rootY + 10);
    ctx.lineTo(rootX + 30, rootY + 10);
    ctx.stroke();

    // Servo Motor Indicators on Wrist
    ctx.font = '700 8px JetBrains Mono, monospace';
    ctx.fillStyle = '#fef08a';
    ctx.fillText('PCA9685 3-CH', rootX, rootY + 5);
  } else {
    ctx.font = '700 8px JetBrains Mono, monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fillText('FLEX MASTER', rootX, rootY + 5);
  }

  // 5 Fingers Configuration: [Thumb, Index, Middle, Ring, Pinky]
  const fingerOffsets = [
    { name: "Th", baseAngle: -0.65, length: 42, baseDx: -38, baseDy: 5,  segments: 2 },
    { name: "Idx", baseAngle: -0.22, length: 55, baseDx: -20, baseDy: -30, segments: 3 },
    { name: "Mid", baseAngle: 0.00,  length: 62, baseDx: 0,   baseDy: -35, segments: 3 },
    { name: "Rng", baseAngle: 0.22,  length: 56, baseDx: 20,  baseDy: -30, segments: 3 },
    { name: "Pnk", baseAngle: 0.45,  length: 46, baseDx: 38,  baseDy: -20, segments: 3 }
  ];

  fingerOffsets.forEach((f, idx) => {
    const rawDeg = angles[idx] || 0;
    const bendRad = (rawDeg / 90) * 1.35; // 0 = straight up, ~1.35 rad = fully curled

    let startX = rootX + f.baseDx;
    let startY = rootY + f.baseDy;

    // Draw Knuckle Base Pivot
    ctx.beginPath();
    ctx.arc(startX, startY, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = config.accentColor;
    ctx.fill();

    const segCount = f.segments;
    const segLen = f.length / segCount;
    let currentAngle = (-Math.PI / 2) + f.baseAngle;

    for (let s = 0; s < segCount; s++) {
      // Each joint bends progressively as bendRad increases
      currentAngle += (bendRad / segCount) * (idx === 0 ? 0.85 : 1.15);

      const nextX = startX + Math.cos(currentAngle) * segLen;
      const nextY = startY + Math.sin(currentAngle) * segLen;

      // Finger bone segment
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(nextX, nextY);
      ctx.strokeStyle = config.isExoskeleton ? (s % 2 === 0 ? '#f43f5e' : '#c084fc') : config.baseColor;
      ctx.lineWidth = config.isExoskeleton ? 4.5 : 3.5;
      ctx.lineCap = 'round';
      ctx.stroke();

      // If exoskeleton, draw mechanical joint brackets
      if (config.isExoskeleton) {
        ctx.beginPath();
        ctx.arc(nextX, nextY, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#fef08a';
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(nextX, nextY, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = config.accentColor;
        ctx.fill();
      }

      startX = nextX;
      startY = nextY;
    }

    // Fingertip degree label
    ctx.font = '700 9px JetBrains Mono, monospace';
    ctx.fillStyle = config.isExoskeleton ? '#f43f5e' : '#38bdf8';
    ctx.fillText(`${Math.round(rawDeg)}°`, startX, startY - 6);
  });

  ctx.restore();
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}
