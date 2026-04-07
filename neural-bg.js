(function () {
  const canvas = document.getElementById('neural-bg');
  const ctx = canvas.getContext('2d');
  let W, H, nodes, edges, pulses, rafId;

  // Network architecture — nodes per layer
  const LAYERS = [3, 5, 8, 7, 9, 7, 8, 5, 3];
  const PULSE_COUNT = 30;
  const EDGE_PROB = 0.55;       // probability any two adjacent-layer nodes connect
  const SKIP_PROB = 0.08;       // probability of skip-layer connections (residual)

  // ── Build ──────────────────────────────────────────────────────────────────
  function build() {
    nodes = [];
    edges = [];
    pulses = [];

    const nL = LAYERS.length;
    const padX = Math.max(W * 0.07, 60);
    const padY = Math.max(H * 0.12, 60);
    const usableW = W - 2 * padX;
    const usableH = H - 2 * padY;

    // Create nodes per layer
    const byLayer = LAYERS.map((count, li) => {
      const x = padX + li * usableW / (nL - 1);
      return Array.from({ length: count }, (_, ni) => {
        const yBase = count > 1 ? padY + ni * usableH / (count - 1) : H / 2;
        const node = {
          x: x + (Math.random() - 0.5) * 14,
          y: yBase + (Math.random() - 0.5) * (usableH / count * 0.2),
          r: 1.8 + Math.random() * 1.4,
          phase: Math.random() * Math.PI * 2,
          glow: 0,
          layer: li,
        };
        nodes.push(node);
        return node;
      });
    });

    // Adjacent-layer edges
    for (let li = 0; li < nL - 1; li++) {
      byLayer[li].forEach(a => {
        byLayer[li + 1].forEach(b => {
          if (Math.random() < EDGE_PROB) {
            edges.push({ a, b, alpha: 0.04 + Math.random() * 0.07 });
          }
        });
      });
    }

    // Skip-layer (residual) edges — adds depth, breaks constellation look
    for (let li = 0; li < nL - 2; li++) {
      byLayer[li].forEach(a => {
        byLayer[li + 2].forEach(b => {
          if (Math.random() < SKIP_PROB) {
            edges.push({ a, b, alpha: 0.02 + Math.random() * 0.03 });
          }
        });
      });
    }

    // Seed pulses at staggered positions
    for (let i = 0; i < PULSE_COUNT; i++) {
      pulses.push(makePulse(Math.random()));
    }
  }

  function makePulse(startT = 0) {
    const edge = edges[Math.floor(Math.random() * edges.length)];
    const red = Math.random() < 0.1; // ~10% use brand red
    return {
      edge,
      t: startT,
      speed: 0.0022 + Math.random() * 0.0028,
      r: red ? 2.3 : 1.4,
      red,
      col: red ? '196,18,48' : '185,185,185',
      alpha: red ? 0.85 : 0.55,
    };
  }

  // ── Draw ───────────────────────────────────────────────────────────────────
  function draw(ts) {
    ctx.clearRect(0, 0, W, H);

    // Background gradient
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#070707');
    bg.addColorStop(1, '#111111');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // ── Edges ──
    edges.forEach(e => {
      ctx.beginPath();
      ctx.moveTo(e.a.x, e.a.y);
      ctx.lineTo(e.b.x, e.b.y);
      ctx.strokeStyle = `rgba(140,140,140,${e.alpha})`;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    });

    // ── Pulses ──
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      p.t += p.speed;

      if (p.t >= 1) {
        // Light up destination node
        p.edge.b.glow = Math.min(1, p.edge.b.glow + 0.7);
        pulses[i] = makePulse(0);
        continue;
      }

      const ex = p.edge.a.x, ey = p.edge.a.y;
      const tx = p.edge.b.x, ty = p.edge.b.y;
      const x = ex + (tx - ex) * p.t;
      const y = ey + (ty - ey) * p.t;

      // Trail dot
      if (p.t > 0.06) {
        const px = ex + (tx - ex) * (p.t - 0.06);
        const py = ey + (ty - ey) * (p.t - 0.06);
        ctx.beginPath();
        ctx.arc(px, py, p.r * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.col},${p.alpha * 0.25})`;
        ctx.fill();
      }

      // Main dot
      ctx.beginPath();
      ctx.arc(x, y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.col},${p.alpha})`;
      ctx.fill();
    }

    // ── Nodes ──
    nodes.forEach(n => {
      n.glow *= 0.93;
      const breathe = Math.sin(ts * 0.0007 + n.phase) * 0.12 + 0.88;
      const a = 0.28 + breathe * 0.18 + n.glow * 0.54;
      const r = n.r * (1 + n.glow * 0.7);

      // Glow halo
      if (n.glow > 0.06) {
        const gr = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 7);
        gr.addColorStop(0, `rgba(180,180,180,${n.glow * 0.18})`);
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.beginPath();
        ctx.arc(n.x, n.y, r * 7, 0, Math.PI * 2);
        ctx.fillStyle = gr;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(195,195,195,${a})`;
      ctx.fill();
    });

    rafId = requestAnimationFrame(draw);
  }

  // ── Resize ─────────────────────────────────────────────────────────────────
  let resizeTimer;
  function resize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      cancelAnimationFrame(rafId);
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
      build();
      rafId = requestAnimationFrame(draw);
    }, 100);
  }

  window.addEventListener('resize', resize);

  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
  build();
  rafId = requestAnimationFrame(draw);
})();
