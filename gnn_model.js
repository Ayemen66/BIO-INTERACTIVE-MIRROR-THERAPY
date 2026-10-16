/**
 * NeuroGrasp Graph Neural Network (GCN) Gesture Inference Engine & Visual Topology Renderer
 * Evaluates 3 Muscle Nodes (FDS, EDC, FCR) against 8 Target Movement States:
 * 0: Mass Extension
 * 1: Mass Flexion
 * 2: Hook Grasp
 * 3: Ball Squeeze
 * 4: Sphere Grasp
 * 5: Diameter Grasp
 * 6: Controlled Release
 * 7: Final Rest
 */

class GNNModelEngine {
  constructor() {
    this.classes = [
      "Mass Extension",
      "Mass Flexion",
      "Hook Grasp",
      "Ball Squeeze",
      "Sphere Grasp",
      "Diameter Grasp",
      "Controlled Release",
      "Final Rest"
    ];

    // Normalized Adjacency Matrix D^(-1/2) A D^(-1/2) for FDS, EDC, FCR graph
    this.adjNorm = [
      [0.4545, 0.2727, 0.3182], // FDS node connections
      [0.2727, 0.5000, 0.2000], // EDC node connections
      [0.3182, 0.2000, 0.4762]  // FCR node connections
    ];

    this.smoothedProbs = [0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.65];
  }

  /**
   * Evaluates GNN Spectral Convolution forward pass on real-time muscle envelopes
   */
  predict(fdsEnv, edcEnv, fcrEnv) {
    const fdsAct = Math.min(1.0, Math.max(0, fdsEnv / 100.0));
    const edcAct = Math.min(1.0, Math.max(0, edcEnv / 100.0));
    const fcrAct = Math.min(1.0, Math.max(0, fcrEnv / 100.0));

    // Graph Convolution Layer 1: H_out = A_norm @ H_in
    const gcnFDS = this.adjNorm[0][0] * fdsAct + this.adjNorm[0][1] * edcAct + this.adjNorm[0][2] * fcrAct;
    const gcnEDC = this.adjNorm[1][0] * fdsAct + this.adjNorm[1][1] * edcAct + this.adjNorm[1][2] * fcrAct;
    const gcnFCR = this.adjNorm[2][0] * fdsAct + this.adjNorm[2][1] * edcAct + this.adjNorm[2][2] * fcrAct;

    // Gesture Logit scoring according to physiological rules
    const rawScores = new Array(8).fill(0);

    // 0: Mass Extension (EDC dominant)
    rawScores[0] = gcnEDC * 4.5 - (fdsAct + fcrAct) * 1.5;

    // 1: Mass Flexion (FDS & FCR high, EDC low)
    rawScores[1] = (gcnFDS + gcnFCR) * 3.0 - edcAct * 2.0;

    // 2: Hook Grasp (FDS isolated dominant)
    rawScores[2] = fdsAct * 4.8 - edcAct * 2.5 - fcrAct * 1.2;

    // 3: Ball Squeeze (All channels high co-activation)
    rawScores[3] = (fdsAct + edcAct + fcrAct) * 2.2;

    // 4: Sphere Grasp (Balanced moderate co-activation)
    const coBalance = 1.0 - Math.abs(fdsAct - edcAct);
    rawScores[4] = (fdsAct + edcAct) * 1.8 + coBalance * 2.0;

    // 5: Diameter Grasp (FCR + FDS strong)
    rawScores[5] = (fcrAct * 3.0 + fdsAct * 2.0) - edcAct * 1.5;

    // 6: Controlled Release (EDC active, FDS decreasing)
    rawScores[6] = (edcAct * 2.5 + (1.0 - fdsAct) * 1.5);

    // 7: Final Rest (Low energy on all channels)
    const totalEnergy = fdsAct + edcAct + fcrAct;
    rawScores[7] = totalEnergy < 0.15 ? 4.0 : 0.01;

    // Softmax calculation
    const maxLogit = Math.max(...rawScores);
    const exps = rawScores.map(s => Math.exp(s - maxLogit));
    const sumExps = exps.reduce((a, b) => a + b, 0);
    const rawProbs = exps.map(e => e / sumExps);

    // Exponential Moving Average smoothing
    const alpha = 0.40;
    for (let i = 0; i < 8; i++) {
      this.smoothedProbs[i] = alpha * rawProbs[i] + (1 - alpha) * this.smoothedProbs[i];
    }

    let maxIdx = 0;
    for (let i = 1; i < 8; i++) {
      if (this.smoothedProbs[i] > this.smoothedProbs[maxIdx]) maxIdx = i;
    }

    return {
      predictedClass: this.classes[maxIdx],
      classIdx: maxIdx,
      confidence: this.smoothedProbs[maxIdx],
      probabilities: [...this.smoothedProbs],
      nodeActivations: { fds: fdsAct, edc: edcAct, fcr: fcrAct }
    };
  }

  /**
   * Renders real-time 3-Node Muscle Graph Canvas (FDS, EDC, FCR) with dynamic glowing edge weights
   */
  drawGraphNetwork(canvasId, fdsEnv, edcEnv, fcrEnv) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Node Positions (Triangle Topology)
    const nodes = [
      { id: 'FDS', name: 'FDS (Flexor)', x: w * 0.28, y: h * 0.75, color: '#38bdf8', act: fdsEnv / 100 },
      { id: 'EDC', name: 'EDC (Extensor)', x: w * 0.50, y: h * 0.25, color: '#f43f5e', act: edcEnv / 100 },
      { id: 'FCR', name: 'FCR (Wrist)', x: w * 0.72, y: h * 0.75, color: '#10b981', act: fcrEnv / 100 }
    ];

    // Draw Graph Edges
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const n1 = nodes[i];
        const n2 = nodes[j];
        const edgeWeight = (n1.act + n2.act) / 2;

        ctx.beginPath();
        ctx.moveTo(n1.x, n1.y);
        ctx.lineTo(n2.x, n2.y);
        ctx.lineWidth = 2 + edgeWeight * 8;
        ctx.strokeStyle = edgeWeight > 0.25 ? 'rgba(56, 189, 248, 0.85)' : 'rgba(148, 163, 184, 0.25)';
        if (edgeWeight > 0.25) {
          ctx.shadowColor = '#38bdf8';
          ctx.shadowBlur = 12;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }

    // Draw Nodes
    nodes.forEach(n => {
      const radius = 24 + n.act * 16;

      // Glow Ring
      ctx.beginPath();
      ctx.arc(n.x, n.y, radius + 10, 0, Math.PI * 2);
      ctx.fillStyle = `${n.color}25`;
      ctx.fill();

      // Node Body
      ctx.beginPath();
      ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = n.color;
      ctx.shadowColor = n.color;
      ctx.shadowBlur = 20;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Label Text
      ctx.fillStyle = '#060913';
      ctx.font = 'bold 12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(n.id, n.x, n.y + 4);

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 12px Inter, sans-serif';
      ctx.fillText(`${Math.round(n.act * 100)}%`, n.x, n.y + radius + 18);
    });
  }
}

if (typeof window !== 'undefined') {
  window.GNNModelEngine = GNNModelEngine;
}
