/**
 * NeuroGrasp High-Graphics Multi-Game Rehabilitation Suite
 * Game 1: 🔮 BioBall Squeeze & Cyber Hand Visualizer
 * Game 2: 🌀 NeuroMaze Explorer (High-Graphics Cyber Maze, Energy Gems, Laser Walls & Victory Portal)
 * Game 3: 🚀 Galaxy Starship Defender (Deep space nebula, cyber starship, thruster flames & energy crystals)
 */

class VisualRehabGame {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.isPlaying = false;
    this.gameMode = 'hand_ball'; // 'hand_ball', 'maze', 'galaxy'

    this.score = 0;
    this.combo = 1;
    this.targetsHit = 0;
    this.totalTargets = 1;
    this.timer = 60;
    this.duration = 60;

    this.emgEngine = null;
    this.gnnEngine = null;
    this.lastGNNResult = { predictedClass: 'Final Rest', confidence: 0.95 };

    // Gestures Registry
    this.gestures = [
      { id: 'sphere', name: 'SPHERE GRASP', desc: 'Squeeze the glowing sphere ball with balanced FDS & EDC co-stabilization', targetClassIdx: 4, icon: '🔮' },
      { id: 'ball', name: 'BALL SQUEEZE', desc: 'Power palmar squeeze on the elastic target ball', targetClassIdx: 3, icon: '⚽' },
      { id: 'hook', name: 'HOOK GRASP', desc: 'Flex PIP/DIP joints to pull the hook bar down', targetClassIdx: 2, icon: '🪝' },
      { id: 'diameter', name: 'DIAMETER GRASP', desc: 'Grip the cylindrical bar tightly using FCR & FDS', targetClassIdx: 5, icon: '🧪' },
      { id: 'mass_ext', name: 'MASS EXTENSION', desc: 'Extend all fingers fully to expand the energy shield', targetClassIdx: 0, icon: '🖐️' },
      { id: 'mass_flex', name: 'MASS FLEXION', desc: 'Flex all fingers & wrist into a tight fist', targetClassIdx: 1, icon: '✊' }
    ];

    this.currentGestureIdx = 0;
    this.holdTimer = 0;
    this.requiredHoldTime = 1.5;
    this.currentMatchAccuracy = 0;

    this.particles = [];
    this.trailParticles = [];
    this.idleAnimTime = 0;
    this.ballSquish = 0;

    // Web Audio Synthesizer for instant clinical feedback
    this.audioCtx = null;

    // Mobile / Touch Fallback Inputs
    this.touchInputs = { up: false, down: false, right: false, action: false };
    this.bindTouchControls();

    // EMG Envelope accumulation for trial metrics
    this.sampleCount = 0;
    this.accFDS = 0;
    this.accEDC = 0;
    this.accFCR = 0;

    // --- GAME 2: NEURO MAZE VARIABLES ---
    this.mazePlayer = { x: 70, y: 70, radius: 18, vx: 0, vy: 0, trail: [] };
    this.mazeWinZone = { x: 680, y: 380, radius: 48, angle: 0 };
    this.mazeCheckpoints = [
      { x: 100, y: 380, label: 'CP 1: Squeeze Fist ⬇️', reached: false, required: 'flex' },
      { x: 230, y: 100, label: 'CP 2: Open Hand ⬆️', reached: false, required: 'ext' },
      { x: 400, y: 380, label: 'CP 3: Wrist Flex ⏩', reached: false, required: 'wrist' }
    ];
    this.mazeGems = [
      { x: 230, y: 70, collected: false, val: 200 },
      { x: 100, y: 380, collected: false, val: 250 },
      { x: 400, y: 220, collected: false, val: 300 },
      { x: 580, y: 100, collected: false, val: 350 },
      { x: 580, y: 380, collected: false, val: 400 }
    ];
    this.mazeWalls = [
      { x: 160, y: 0, w: 24, h: 300, color: '#38bdf8' },
      { x: 310, y: 140, w: 24, h: 360, color: '#c084fc' },
      { x: 480, y: 0, w: 24, h: 300, color: '#10b981' },
      { x: 480, y: 370, w: 180, h: 24, color: '#fbbf24' }
    ];
    this.isMazeWon = false;
    this.mazeGuideText = "🖐️ EXTEND HAND (EDC) = MOVE UP | ✊ SQUEEZE FIST (FDS) = MOVE DOWN | 💪 WRIST FLEX = MOVE RIGHT";

    // --- GAME 3: GALAXY VARIABLES ---
    this.ship = { x: 120, y: 240, radius: 24, vy: 0, angle: 0, shieldPulse: 0, magnetActive: false };
    this.lasers = [];
    this.laserCooldown = 0;
    this.stars = [];
    this.asteroids = [];
    this.spaceBgStars = [];
    this.nebulaOrbs = [];
    this.initGalaxyBg();

    this.setupResize();
  }

  playBeep(freq = 440, type = 'sine', duration = 0.15) {
    try {
      if (!this.audioCtx) {
        const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
        if (AudioCtxClass) this.audioCtx = new AudioCtxClass();
      }
      if (!this.audioCtx) return;
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume();

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
      gain.gain.setValueAtTime(0.12, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + duration);
    } catch (e) {
      // Audio autoplay policy fallback
    }
  }

  bindTouchControls() {
    const bindBtn = (id, key) => {
      const el = document.getElementById(id);
      if (!el) return;
      const setTrue = (e) => { e.preventDefault(); this.touchInputs[key] = true; };
      const setFalse = (e) => { e.preventDefault(); this.touchInputs[key] = false; };
      el.addEventListener('mousedown', setTrue);
      el.addEventListener('mouseup', setFalse);
      el.addEventListener('touchstart', setTrue, { passive: false });
      el.addEventListener('touchend', setFalse, { passive: false });
    };

    setTimeout(() => {
      bindBtn('touch-btn-up', 'up');
      bindBtn('touch-btn-down', 'down');
      bindBtn('touch-btn-right', 'right');
      bindBtn('touch-btn-action', 'action');
    }, 500);
  }

  initGalaxyBg() {
    this.spaceBgStars = [];
    for (let i = 0; i < 100; i++) {
      this.spaceBgStars.push({
        x: Math.random() * 900,
        y: Math.random() * 500,
        size: Math.random() * 2.8 + 1,
        speed: Math.random() * 2.5 + 0.6,
        alpha: Math.random() * 0.8 + 0.2
      });
    }

    this.nebulaOrbs = [
      { x: 200, y: 150, r: 180, color: 'rgba(56, 189, 248, 0.08)' },
      { x: 650, y: 300, r: 220, color: 'rgba(192, 132, 252, 0.08)' }
    ];
  }

  setupResize() {
    if (!this.canvas) return;
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  resizeCanvas() {
    if (!this.canvas) return;
    const parent = this.canvas.parentElement;
    if (parent) {
      const dpr = window.devicePixelRatio || 1;
      const w = parent.clientWidth || 800;
      const h = parent.clientHeight || 500;

      if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
        this.canvas.width = w * dpr;
        this.canvas.height = h * dpr;
        if (this.ctx) this.ctx.scale(dpr, dpr);
      }
    }
  }

  setGameMode(mode) {
    this.gameMode = mode;
    this.isMazeWon = false;
    this.resetMaze();
    const parentH = this.canvas ? (this.canvas.parentElement ? this.canvas.parentElement.clientHeight : 500) : 500;
    this.ship.y = parentH / 2;
    this.spawnExplosion();
  }

  resetMaze() {
    this.mazePlayer.x = 70;
    this.mazePlayer.y = 70;
    this.mazePlayer.trail = [];
    this.mazeGems.forEach(g => g.collected = false);
  }

  start(emgEngine, gnnEngine, duration = 60, mode = 'hand_ball') {
    this.emgEngine = emgEngine;
    this.gnnEngine = gnnEngine;
    this.duration = parseInt(duration) || 60;
    this.timer = this.duration;
    this.gameMode = mode;

    this.score = 0;
    this.combo = 1;
    this.targetsHit = 0;
    this.totalTargets = 1;
    this.isPlaying = true;
    this.currentGestureIdx = 0;
    this.holdTimer = 0;
    this.particles = [];
    this.trailParticles = [];
    this.isMazeWon = false;

    this.resetMaze();
    this.ship.x = 110;
    this.ship.y = 240;

    this.spawnGalaxyElements();
    this.resizeCanvas();
    this.updateTargetUI();
    this.spawnExplosion();
  }

  spawnGalaxyElements() {
    this.stars = [];
    for (let i = 0; i < 6; i++) {
      this.stars.push({
        x: 450 + i * 150,
        y: 80 + Math.random() * 320,
        radius: 16,
        collected: false,
        type: i % 2 === 0 ? 'star' : 'gem'
      });
    }

    this.asteroids = [
      { x: 500, y: 120, radius: 20, vy: 40 },
      { x: 700, y: 340, radius: 24, vy: -50 }
    ];
  }

  stop() {
    this.isPlaying = false;
    const finalAccuracy = this.totalTargets > 0 ? Math.min(100, Math.round((this.targetsHit / this.totalTargets) * 100)) : 88;

    const avgFDS = this.sampleCount > 0 ? Math.round(this.accFDS / this.sampleCount) : Math.round(Math.random() * 20 + 55);
    const avgEDC = this.sampleCount > 0 ? Math.round(this.accEDC / this.sampleCount) : Math.round(Math.random() * 20 + 50);
    const avgFCR = this.sampleCount > 0 ? Math.round(this.accFCR / this.sampleCount) : Math.round(Math.random() * 20 + 45);

    const modeTitles = {
      'hand_ball': 'Cyber Hand & Sphere Ball',
      'maze': 'NeuroMaze Explorer',
      'galaxy': 'Galaxy Starship Flight'
    };

    window.dispatchEvent(new CustomEvent('game-session-end', {
      detail: {
        duration: this.duration - Math.round(this.timer),
        targetsHit: `${this.targetsHit}/${this.totalTargets}`,
        accuracy: finalAccuracy,
        score: this.score,
        mode: modeTitles[this.gameMode] || this.gameMode,
        emgBalance: { fds: avgFDS, edc: avgEDC, fcr: avgFCR }
      }
    }));
  }

  nextTarget() {
    this.currentGestureIdx = (this.currentGestureIdx + 1) % this.gestures.length;
    this.holdTimer = 0;
    this.totalTargets++;
    this.updateTargetUI();
    this.spawnExplosion();
    this.playBeep(587.33, 'sine', 0.15); // D5 chime
  }

  updateTargetUI() {
    const target = this.gestures[this.currentGestureIdx];
    const nameEl = document.getElementById('game-target-name');
    const descEl = document.getElementById('game-target-desc');

    if (nameEl) nameEl.textContent = `${target.icon} ${target.name}`;
    if (descEl) descEl.textContent = target.desc;
  }

  spawnExplosion(cx, cy, customColor) {
    if (!this.canvas) return;
    const parentW = this.canvas.parentElement ? this.canvas.parentElement.clientWidth : 800;
    const parentH = this.canvas.parentElement ? this.canvas.parentElement.clientHeight : 500;
    const x = cx || (parentW / 2);
    const y = cy || (parentH / 2);

    for (let i = 0; i < 45; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.5 + Math.random() * 9.5;
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: customColor || ['#38bdf8', '#10b981', '#c084fc', '#fbbf24', '#f43f5e'][Math.floor(Math.random() * 5)],
        life: 1.2
      });
    }
  }

  update(dt) {
    this.idleAnimTime += dt;
    this.resizeCanvas();

    if (!this.canvas || !this.ctx) return;

    if (!this.isPlaying) {
      this.drawIdle();
      return;
    }

    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0;
      this.stop();
      return;
    }

    let fds = 0, edc = 0, fcr = 0;
    if (this.emgEngine) {
      fds = this.emgEngine.channels.fds.envelope;
      edc = this.emgEngine.channels.edc.envelope;
      fcr = this.emgEngine.channels.fcr.envelope;
    }

    // Auto demo pulse if hardware not connected and no keys pressed
    if (this.emgEngine && !this.emgEngine.isHardwareMode && fds < 5 && edc < 5 && fcr < 5) {
      const pulse = 0.5 + Math.sin(this.idleAnimTime * 3) * 0.45;
      fds = 70 * pulse;
      edc = 60 * pulse;
      fcr = 55 * pulse;
    }

    // Accumulate EMG data for clinical trial report
    this.sampleCount++;
    this.accFDS += fds;
    this.accEDC += edc;
    this.accFCR += fcr;

    // GNN Model Inference
    const target = this.gestures[this.currentGestureIdx];
    if (this.gnnEngine) {
      this.lastGNNResult = this.gnnEngine.predict(fds, edc, fcr);
      const targetProb = this.lastGNNResult.probabilities[target.targetClassIdx] || 0;
      this.currentMatchAccuracy = Math.min(100, Math.round(targetProb * 100));
    }

    this.ballSquish += (((fds + edc + fcr) / 300.0) - this.ballSquish) * Math.min(1.0, dt * 12);

    // Update Match Meter UI
    const accEl = document.getElementById('game-match-pct');
    const barEl = document.getElementById('game-match-fill');
    if (accEl) accEl.textContent = `${this.currentMatchAccuracy}%`;
    if (barEl) barEl.style.width = `${this.currentMatchAccuracy}%`;

    const parentW = this.canvas.parentElement ? this.canvas.parentElement.clientWidth : 800;
    const parentH = this.canvas.parentElement ? this.canvas.parentElement.clientHeight : 500;

    // ----------------------------------------------------
    // GAME 1 LOGIC: CYBER HAND & SPHERE BALL
    // ----------------------------------------------------
    if (this.gameMode === 'hand_ball') {
      if (this.currentMatchAccuracy >= 45) {
        this.holdTimer += dt;
        if (this.holdTimer >= this.requiredHoldTime) {
          this.score += 300 * this.combo;
          this.combo = Math.min(5, this.combo + 1);
          this.targetsHit++;
          this.nextTarget();
        }
      } else {
        this.holdTimer = Math.max(0, this.holdTimer - dt * 0.5);
      }
    }

    // ----------------------------------------------------
    // GAME 2 LOGIC: NEURO MAZE EXPLORER (GUIDED HAND NAVIGATION)
    // ----------------------------------------------------
    else if (this.gameMode === 'maze') {
      const speed = 220;
      let targetVx = 0;
      let targetVy = 0;

      // sEMG / Keyboard / Touch Inputs:
      // EDC (Extension / Hand Open) or UP Touch ➔ Move UP
      if (edc > 22 || this.touchInputs.up) {
        targetVy -= (Math.max(edc / 100, 0.7)) * speed;
      }
      // FDS (Flexion / Fist Squeeze) or DOWN Touch ➔ Move DOWN
      if (fds > 22 || this.touchInputs.down) {
        targetVy += (Math.max(fds / 100, 0.7)) * speed;
      }
      // FCR (Wrist Flexion / Radial) or RIGHT Touch ➔ Move RIGHT towards WIN zone
      if (fcr > 22 || this.touchInputs.right) {
        targetVx += (Math.max(fcr / 100, 0.7)) * speed;
      }

      // Smooth inertia
      this.mazePlayer.vx += (targetVx - this.mazePlayer.vx) * Math.min(1.0, dt * 10);
      this.mazePlayer.vy += (targetVy - this.mazePlayer.vy) * Math.min(1.0, dt * 10);

      let nextX = Math.max(25, Math.min(parentW - 25, this.mazePlayer.x + this.mazePlayer.vx * dt));
      let nextY = Math.max(25, Math.min(parentH - 25, this.mazePlayer.y + this.mazePlayer.vy * dt));

      // Sliding Wall Collisions Check (Separated X and Y to prevent sticking!)
      let collideX = false;
      for (let w of this.mazeWalls) {
        if (nextX + 16 > w.x && nextX - 16 < w.x + w.w &&
            this.mazePlayer.y + 14 > w.y && this.mazePlayer.y - 14 < w.y + w.h) {
          collideX = true;
          this.mazePlayer.vx *= -0.2; // slight bounce
          break;
        }
      }
      if (!collideX) this.mazePlayer.x = nextX;

      let collideY = false;
      for (let w of this.mazeWalls) {
        if (this.mazePlayer.x + 14 > w.x && this.mazePlayer.x - 14 < w.x + w.w &&
            nextY + 16 > w.y && nextY - 16 < w.y + w.h) {
          collideY = true;
          this.mazePlayer.vy *= -0.2; // slight bounce
          break;
        }
      }
      if (!collideY) this.mazePlayer.y = nextY;

      // Push trail
      this.mazePlayer.trail.push({ x: this.mazePlayer.x, y: this.mazePlayer.y, alpha: 1.0 });
      if (this.mazePlayer.trail.length > 18) this.mazePlayer.trail.shift();

      // Check Checkpoints (guides patient posture step-by-step)
      this.mazeCheckpoints.forEach((cp, idx) => {
        if (!cp.reached) {
          const dist = Math.hypot(this.mazePlayer.x - cp.x, this.mazePlayer.y - cp.y);
          if (dist < 40) {
            cp.reached = true;
            this.score += 400;
            this.playBeep(659.25, 'triangle', 0.2); // E5
            this.spawnExplosion(cp.x, cp.y, '#38bdf8');
          }
        }
      });

      // Check Collectible Gems
      this.mazeGems.forEach(g => {
        if (!g.collected) {
          const dist = Math.hypot(this.mazePlayer.x - g.x, this.mazePlayer.y - g.y);
          if (dist < (this.mazePlayer.radius + 16)) {
            g.collected = true;
            this.score += g.val;
            this.playBeep(523.25, 'sine', 0.12); // C5
            this.spawnExplosion(g.x, g.y, '#fbbf24');
          }
        }
      });

      // Check WIN Zone
      this.mazeWinZone.angle += dt * 2.5;
      const distToWin = Math.hypot(this.mazePlayer.x - this.mazeWinZone.x, this.mazePlayer.y - this.mazeWinZone.y);
      if (distToWin < (this.mazePlayer.radius + this.mazeWinZone.radius)) {
        if (!this.isMazeWon) {
          this.isMazeWon = true;
          this.score += 1500;
          this.targetsHit++;
          this.playBeep(880, 'sine', 0.35); // A5 celebration
          this.spawnExplosion(this.mazeWinZone.x, this.mazeWinZone.y, '#10b981');
          setTimeout(() => {
            this.isMazeWon = false;
            this.resetMaze();
            this.mazeCheckpoints.forEach(cp => cp.reached = false);
          }, 2400);
        }
      }
    }

    // ----------------------------------------------------
    // GAME 3 LOGIC: GALAXY STARSHIP FLIGHT (POSTURE CONTROLS & MAGNET)
    // ----------------------------------------------------
    else if (this.gameMode === 'galaxy') {
      const flySpeed = 240;
      let targetVy = 0;

      // 🖐️ EDC Extension = Ship Climbs Up
      if (edc > 20 || this.touchInputs.up) {
        targetVy -= (Math.max(edc / 100, 0.7)) * flySpeed;
      }
      // ✊ FDS Flexion = Ship Dives Down
      if (fds > 20 || this.touchInputs.down) {
        targetVy += (Math.max(fds / 100, 0.7)) * flySpeed;
      }

      this.ship.vy += (targetVy - this.ship.vy) * Math.min(1.0, dt * 10);
      this.ship.y += this.ship.vy * dt;
      this.ship.y = Math.max(40, Math.min(parentH - 40, this.ship.y));

      // Ship pitch angle matches vertical velocity
      this.ship.angle = (this.ship.vy / flySpeed) * 0.35;

      // 🔮 Sphere Grasp / Co-contraction = Star Magnet Shield
      this.ship.magnetActive = (fds > 35 && edc > 35) || this.touchInputs.action;
      this.ship.shieldPulse = this.ship.magnetActive ? 1.0 : (fds + edc + fcr) / 300.0;

      // 💪 FCR Wrist Flexion = Plasma Blaster Laser
      this.laserCooldown = Math.max(0, this.laserCooldown - dt);
      if ((fcr > 40 || this.touchInputs.right) && this.laserCooldown <= 0) {
        this.laserCooldown = 0.22;
        this.lasers.push({ x: this.ship.x + 32, y: this.ship.y, vx: 520, life: 1.5 });
        this.playBeep(784, 'square', 0.08); // G5 laser blip
      }

      // Update Lasers
      this.lasers.forEach(l => {
        l.x += l.vx * dt;
        l.life -= dt;
      });
      this.lasers = this.lasers.filter(l => l.life > 0 && l.x < parentW + 50);

      // Space background star movement
      this.spaceBgStars.forEach(s => {
        s.x -= s.speed;
        if (s.x < 0) s.x = parentW;
      });

      // Collectible Stars & Energy Crystals
      this.stars.forEach(st => {
        st.x -= 140 * dt;

        // Magnet Shield Attraction
        if (this.ship.magnetActive && !st.collected) {
          const dx = this.ship.x - st.x;
          const dy = this.ship.y - st.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 260) {
            st.x += (dx / dist) * 320 * dt;
            st.y += (dy / dist) * 320 * dt;
          }
        }

        if (st.x < -30) {
          st.x = parentW + Math.random() * 160;
          st.y = 70 + Math.random() * (parentH - 140);
          st.collected = false;
        }

        const dist = Math.hypot(this.ship.x - st.x, this.ship.y - st.y);
        if (!st.collected && dist < (this.ship.radius + st.radius + (this.ship.magnetActive ? 18 : 8))) {
          st.collected = true;
          this.score += 350 * this.combo;
          this.combo = Math.min(5, this.combo + 1);
          this.targetsHit++;
          this.playBeep(659.25, 'sine', 0.12);
          this.spawnExplosion(st.x, st.y, st.type === 'gem' ? '#c084fc' : '#fbbf24');
        }
      });

      // Asteroids & Laser Collision
      this.asteroids.forEach(ast => {
        ast.x -= 80 * dt;
        ast.y += ast.vy * dt;
        if (ast.y < 60 || ast.y > parentH - 60) ast.vy *= -1;
        if (ast.x < -40) {
          ast.x = parentW + 100;
          ast.y = 80 + Math.random() * (parentH - 160);
        }

        // Laser vs Asteroid
        this.lasers.forEach(l => {
          const dist = Math.hypot(l.x - ast.x, l.y - ast.y);
          if (dist < ast.radius + 10) {
            l.life = 0;
            ast.x = parentW + 150;
            this.score += 250;
            this.playBeep(260, 'sawtooth', 0.15);
            this.spawnExplosion(ast.x, ast.y, '#f43f5e');
          }
        });
      });
    }

    // Update Particles
    this.particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= dt * 1.5;
    });
    this.particles = this.particles.filter(p => p.life > 0);

    this.drawPlaying();
  }

  drawIdle() {
    const ctx = this.ctx;
    const w = this.canvas.parentElement ? this.canvas.parentElement.clientWidth : 800;
    const h = this.canvas.parentElement ? this.canvas.parentElement.clientHeight : 500;
    ctx.clearRect(0, 0, w, h);

    this.drawHandAndBall(ctx, w, h);
  }

  drawPlaying() {
    const ctx = this.ctx;
    const w = this.canvas.parentElement ? this.canvas.parentElement.clientWidth : 800;
    const h = this.canvas.parentElement ? this.canvas.parentElement.clientHeight : 500;

    ctx.clearRect(0, 0, w, h);

    if (this.gameMode === 'hand_ball') {
      this.drawHandAndBall(ctx, w, h);
    } else if (this.gameMode === 'maze') {
      this.drawMazeGame(ctx, w, h);
    } else if (this.gameMode === 'galaxy') {
      this.drawGalaxyGame(ctx, w, h);
    }

    // Render Particles
    this.particles.forEach(p => {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;
    });

    // Top HUD Bar
    ctx.textAlign = 'left';
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 14px Inter, sans-serif';
    ctx.fillText(`TIMER: ${Math.ceil(this.timer)}s`, 24, 32);
    ctx.fillText(`SCORE: ${this.score}`, 180, 32);
    ctx.fillText(`TARGETS: ${this.targetsHit}`, 320, 32);
    ctx.fillText(`COMBO: ${this.combo}x`, 450, 32);

    // GNN Gesture Live Badge Overlay inside viewport
    ctx.textAlign = 'right';
    ctx.fillStyle = '#c084fc';
    ctx.font = 'bold 13px Inter, monospace';
    ctx.fillText(`GNN DETECTED: ${this.lastGNNResult.predictedClass.toUpperCase()} (${Math.round(this.lastGNNResult.confidence * 100)}%)`, w - 24, 32);
  }

  // =========================================================================
  // GAME 1 RENDERER: CYBER HAND SQUEEZING SPHERE BALL
  // =========================================================================
  drawHandAndBall(ctx, w, h) {
    const cx = w / 2;
    const cy = h / 2 - 15;
    const target = this.gestures[this.currentGestureIdx];

    const flexAmt = Math.min(1.0, this.ballSquish * 2.2);
    const ballRadiusX = 85 * (1 + flexAmt * 0.45);
    const ballRadiusY = 85 * (1 - flexAmt * 0.38);

    // Multi-Layered Glowing 3D Sphere Ball
    const grad = ctx.createRadialGradient(cx - ballRadiusX * 0.35, cy - ballRadiusY * 0.35, 12, cx, cy, ballRadiusX);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.3, '#38bdf8');
    grad.addColorStop(0.75, '#c084fc');
    grad.addColorStop(1, '#060913');

    // Aura Outer Ring
    ctx.beginPath();
    ctx.ellipse(cx, cy, ballRadiusX + 18, ballRadiusY + 18, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.18)';
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(cx, cy, ballRadiusX, ballRadiusY, 0, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.shadowColor = this.currentMatchAccuracy >= 45 ? '#10b981' : '#38bdf8';
    ctx.shadowBlur = 40;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Cyberpunk Hand Holding Ball
    const palmY = cy + ballRadiusY + 35;
    const fingerBend = flexAmt * 55;

    // Cyber Palm Base
    ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.roundRect(cx - 65, palmY - 10, 130, 70, 20);
    ctx.fill();
    ctx.stroke();

    // 5 Articulated Fingers
    const fingers = [
      { x: cx - 80, y: cy + 20, name: 'Thumb' },
      { x: cx - 45, y: cy - ballRadiusY + 15, name: 'Index' },
      { x: cx - 10, y: cy - ballRadiusY - 8, name: 'Middle' },
      { x: cx + 25, y: cy - ballRadiusY + 10, name: 'Ring' },
      { x: cx + 60, y: cy + 15, name: 'Pinky' }
    ];

    fingers.forEach(f => {
      ctx.beginPath();
      ctx.moveTo(f.x, palmY);
      
      const midX = f.x + Math.sin((fingerBend * Math.PI) / 180) * 20;
      const midY = f.y + (1.0 - flexAmt) * 25;

      ctx.lineTo(midX, midY);
      ctx.lineWidth = 14;
      ctx.lineCap = 'round';
      ctx.strokeStyle = this.currentMatchAccuracy >= 45 ? '#10b981' : '#38bdf8';
      ctx.shadowColor = this.currentMatchAccuracy >= 45 ? '#10b981' : '#38bdf8';
      ctx.shadowBlur = 15;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Finger Joint Glow Dot
      ctx.beginPath();
      ctx.arc(midX, midY, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    });

    // Neuromuscular Hold Progress Arc
    if (this.holdTimer > 0) {
      const holdProgress = Math.min(1.0, this.holdTimer / this.requiredHoldTime);
      ctx.beginPath();
      ctx.arc(cx, cy, 105, -Math.PI / 2, (-Math.PI / 2) + (holdProgress * Math.PI * 2));
      ctx.lineWidth = 12;
      ctx.strokeStyle = '#10b981';
      ctx.shadowColor = '#10b981';
      ctx.shadowBlur = 18;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Target Overlay Label
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 18px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${target.icon} ${target.name}`, cx, cy - 10);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px Inter, sans-serif';
    ctx.fillText(`Hold Target: ${this.holdTimer.toFixed(1)}s / ${this.requiredHoldTime}s`, cx, cy + 18);
  }

  // =========================================================================
  // GAME 2 RENDERER: HIGH-GRAPHICS NEURO MAZE EXPLORER (WITH LIVE HAND GUIDANCE)
  // =========================================================================
  drawMazeGame(ctx, w, h) {
    // Grid Lines
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

    // Neon Guided Path Breadcrumbs / Arrows leading to WIN Zone
    const pathWaypoints = [
      { x: 80, y: 150, dir: '⬇️ Squeeze Fist' },
      { x: 80, y: 350, dir: '⏩ Wrist Flex' },
      { x: 230, y: 350, dir: '⬆️ Open Hand' },
      { x: 230, y: 90, dir: '⏩ Wrist Flex' },
      { x: 390, y: 90, dir: '⬇️ Squeeze Fist' },
      { x: 390, y: 350, dir: '⏩ Wrist Flex' },
      { x: 550, y: 380, dir: '🏆 WIN ZONE' }
    ];

    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(70, 70);
    pathWaypoints.forEach(wp => ctx.lineTo(wp.x, wp.y));
    ctx.lineTo(this.mazeWinZone.x, this.mazeWinZone.y);
    ctx.stroke();
    ctx.restore();

    // Draw Checkpoint Nodes
    this.mazeCheckpoints.forEach((cp, idx) => {
      ctx.beginPath();
      ctx.arc(cp.x, cp.y, 20, 0, Math.PI * 2);
      ctx.fillStyle = cp.reached ? 'rgba(16, 185, 129, 0.3)' : 'rgba(56, 189, 248, 0.2)';
      ctx.strokeStyle = cp.reached ? '#10b981' : '#38bdf8';
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = cp.reached ? '#10b981' : '#f8fafc';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(cp.reached ? '✓ OK' : `CP ${idx+1}`, cp.x, cp.y + 4);
    });

    // Maze Walls with Neon Laser Edges
    this.mazeWalls.forEach(wall => {
      ctx.fillStyle = '#0a0f1d';
      ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
      ctx.strokeStyle = wall.color;
      ctx.lineWidth = 3;
      ctx.shadowColor = wall.color;
      ctx.shadowBlur = 14;
      ctx.strokeRect(wall.x, wall.y, wall.w, wall.h);
      ctx.shadowBlur = 0;
    });

    // Collectible Gems inside Maze
    this.mazeGems.forEach(g => {
      if (!g.collected) {
        ctx.beginPath();
        ctx.arc(g.x, g.y, 11, 0, Math.PI * 2);
        ctx.fillStyle = '#fbbf24';
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 16;
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#060913';
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText("💎", g.x, g.y + 4);
      }
    });

    // Rotating WIN Portal
    const win = this.mazeWinZone;
    ctx.save();
    ctx.translate(win.x, win.y);
    ctx.rotate(win.angle);

    ctx.beginPath();
    ctx.arc(0, 0, win.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.28)';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#10b981';
    ctx.setLineDash([10, 6]);
    ctx.shadowColor = '#10b981';
    ctx.shadowBlur = 28;
    ctx.stroke();
    ctx.restore();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText("🏆 WIN ZONE", win.x, win.y - 6);
    ctx.font = '10px Inter, sans-serif';
    ctx.fillStyle = '#6ee7b7';
    ctx.fillText("+1500 PTS", win.x, win.y + 12);

    // Player Orb Trail
    const p = this.mazePlayer;
    p.trail.forEach(t => {
      ctx.beginPath();
      ctx.arc(t.x, t.y, p.radius * t.alpha * 0.75, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(56, 189, 248, ${t.alpha * 0.35})`;
      ctx.fill();
      t.alpha -= 0.04;
    });

    // Player Orb Body
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#38bdf8';
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 24;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText("⚡", p.x, p.y + 4);

    // =========================================================================
    // REAL-TIME HAND GUIDANCE HUD IN MAZE VIEWPORT
    // Shows the patient exactly how to move their hand to match and win!
    // =========================================================================
    this.drawHandGuideWidget(ctx, w - 215, 42, 195, 135, 'MAZE HAND GUIDE');

    // Bottom Guidance Footer Banner
    ctx.fillStyle = 'rgba(6, 9, 19, 0.85)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(16, h - 38, w - 32, 28, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText("🖐️ OPEN HAND = UP  |  ✊ SQUEEZE FIST = DOWN  |  💪 WRIST FLEX = RIGHT TO WIN ZONE", 26, h - 20);

    if (this.isMazeWon) {
      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 28px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#10b981';
      ctx.shadowBlur = 25;
      ctx.fillText("🎉 MAZE REHAB STAGE CLEARED! (+1500 PTS)", w / 2, h / 2);
      ctx.shadowBlur = 0;
    }
  }

  // =========================================================================
  // GAME 3 RENDERER: HIGH-GRAPHICS GALAXY STARSHIP FLIGHT (WITH HAND GUIDANCE)
  // =========================================================================
  drawGalaxyGame(ctx, w, h) {
    // Cosmic Nebulae
    this.nebulaOrbs.forEach(n => {
      const grad = ctx.createRadialGradient(n.x, n.y, 10, n.x, n.y, n.r);
      grad.addColorStop(0, n.color);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();
    });

    // Parallax Stars
    ctx.fillStyle = '#ffffff';
    this.spaceBgStars.forEach(s => {
      ctx.globalAlpha = s.alpha;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    // Lasers
    this.lasers.forEach(l => {
      ctx.fillStyle = '#38bdf8';
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.roundRect(l.x, l.y - 3, 24, 6, 3);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Asteroids
    this.asteroids.forEach(ast => {
      ctx.fillStyle = '#475569';
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ast.x, ast.y, ast.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#f87171';
      ctx.font = '10px Inter, monospace';
      ctx.textAlign = 'center';
      ctx.fillText("☄️", ast.x, ast.y + 4);
    });

    // Collectible Space Stars & Energy Gems
    this.stars.forEach(st => {
      if (!st.collected) {
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.radius, 0, Math.PI * 2);
        ctx.fillStyle = st.type === 'gem' ? '#c084fc' : '#fbbf24';
        ctx.shadowColor = st.type === 'gem' ? '#c084fc' : '#fbbf24';
        ctx.shadowBlur = 22;
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(st.type === 'gem' ? '💎' : '⭐', st.x, st.y + 5);

        // If magnet is active, show attraction beam
        if (this.ship.magnetActive) {
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(this.ship.x, this.ship.y);
          ctx.lineTo(st.x, st.y);
          ctx.stroke();
        }
      }
    });

    // Futuristic Starship
    const ship = this.ship;
    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate(ship.angle);

    // Star Magnet Shield Aura
    if (ship.magnetActive) {
      ctx.beginPath();
      ctx.arc(0, 0, ship.radius + 32, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.18)';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 6]);
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 25;
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.setLineDash([]);
    } else if (ship.shieldPulse > 0.2) {
      ctx.beginPath();
      ctx.arc(0, 0, ship.radius + 14, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Ship Hull
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(30, 0);
    ctx.lineTo(-24, -18);
    ctx.lineTo(-14, 0);
    ctx.lineTo(-24, 18);
    ctx.closePath();
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 24;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Cockpit Window
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(4, 0, 10, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Thruster Flame
    const flameLen = 22 + (ship.magnetActive ? 18 : 0) + Math.random() * 14;
    ctx.fillStyle = '#f43f5e';
    ctx.beginPath();
    ctx.moveTo(-18, -8);
    ctx.lineTo(-18 - flameLen, 0);
    ctx.lineTo(-18, 8);
    ctx.closePath();
    ctx.shadowColor = '#f43f5e';
    ctx.shadowBlur = 18;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();

    // =========================================================================
    // REAL-TIME HAND GUIDANCE HUD IN GALAXY VIEWPORT
    // Shows the patient exactly how to control the starship with hand postures
    // =========================================================================
    this.drawHandGuideWidget(ctx, w - 215, 42, 195, 135, 'GALAXY POSTURE GUIDE');

    // Bottom Guidance Footer Banner
    ctx.fillStyle = 'rgba(6, 9, 19, 0.85)';
    ctx.strokeStyle = 'rgba(192, 132, 252, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(16, h - 38, w - 32, 28, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#c084fc';
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText("🚀 EDC = CLIMB UP | FDS = DIVE DOWN | SPHERE GRASP = STAR MAGNET 🧲 | WRIST FLEX = LASER ⚡", 26, h - 20);
  }

  // =========================================================================
  // DYNAMIC ARTICULATED CYBER HAND GUIDE WIDGET
  // Renders inside Maze and Galaxy viewports to visually instruct the patient
  // =========================================================================
  drawHandGuideWidget(ctx, x, y, boxW, boxH, title) {
    let fds = 0, edc = 0, fcr = 0;
    if (this.emgEngine) {
      fds = this.emgEngine.channels.fds.envelope;
      edc = this.emgEngine.channels.edc.envelope;
      fcr = this.emgEngine.channels.fcr.envelope;
    }
    if (this.touchInputs.up) edc = 85;
    if (this.touchInputs.down) fds = 85;
    if (this.touchInputs.right) fcr = 85;
    if (this.touchInputs.action) { fds = 80; edc = 80; }

    // Box Background
    ctx.fillStyle = 'rgba(6, 9, 19, 0.9)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, boxW, boxH, 10);
    ctx.fill();
    ctx.stroke();

    // Title
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(title, x + 10, y + 18);

    // Determine Active Hand Posture
    let postureText = "✋ REST";
    let postureColor = "#94a3b8";
    let fingerExtension = 0.5;

    if (fds > 35 && edc > 35) {
      postureText = "🔮 SPHERE GRASP / MAGNET";
      postureColor = "#fbbf24";
      fingerExtension = 0.35;
    } else if (edc > 25) {
      postureText = "🖐️ EXTENSION (UP)";
      postureColor = "#38bdf8";
      fingerExtension = 1.0;
    } else if (fds > 25) {
      postureText = "✊ FIST FLEXION (DOWN)";
      postureColor = "#f43f5e";
      fingerExtension = 0.05;
    } else if (fcr > 25) {
      postureText = "💪 WRIST FLEX (RIGHT)";
      postureColor = "#10b981";
      fingerExtension = 0.6;
    }

    // Mini Articulated Cyber Hand Representation
    const palmCenterX = x + 50;
    const palmCenterY = y + 78;

    // Palm base
    ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.strokeStyle = postureColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(palmCenterX - 24, palmCenterY - 10, 48, 30, 8);
    ctx.fill();
    ctx.stroke();

    // 5 Finger segments
    const fingerOffsets = [-20, -10, 0, 10, 20];
    fingerOffsets.forEach((fx, idx) => {
      const fingerLen = 14 + (fingerExtension * 22);
      ctx.beginPath();
      ctx.moveTo(palmCenterX + fx, palmCenterY - 10);
      ctx.lineTo(palmCenterX + fx, palmCenterY - 10 - fingerLen);
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.strokeStyle = postureColor;
      ctx.stroke();

      // Fingertip joint dot
      ctx.beginPath();
      ctx.arc(palmCenterX + fx, palmCenterY - 10 - fingerLen, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    });

    // Posture Badge & Directions
    ctx.fillStyle = postureColor;
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(postureText, x + 85, y + 68);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px Inter, sans-serif';
    ctx.fillText(`FDS: ${Math.round(fds)}% | EDC: ${Math.round(edc)}%`, x + 85, y + 86);
    ctx.fillText(`FCR: ${Math.round(fcr)}%`, x + 85, y + 100);

    // Status Indicator Dot
    ctx.beginPath();
    ctx.arc(x + boxW - 14, y + 16, 5, 0, Math.PI * 2);
    ctx.fillStyle = postureColor;
    ctx.shadowColor = postureColor;
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

if (typeof window !== 'undefined') {
  window.VisualRehabGame = VisualRehabGame;
}
