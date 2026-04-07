(function () {
  const canvas = document.getElementById('neural-bg');
  const ctx    = canvas.getContext('2d');
  let W, H, intersections, glows, rafId;

  const CELL       = 96;   // grid spacing (px)
  const GLOW_N     = 10;   // simultaneous soft glows
  const LINE_ALPHA = 0.048; // grid line opacity — barely there
  const NODE_ALPHA = 0.10;  // tiny intersection dot opacity

  // Translucent panels — static, aligned to grid, suggest layered data
  // Defined as fractions; snapped to grid on build
  const PANEL_DEFS = [
    { fx: 0.52, fy: 0.04, fw: 0.44, fh: 0.54, a: 0.025 },
    { fx: 0.07, fy: 0.44, fw: 0.36, fh: 0.50, a: 0.020 },
    { fx: 0.60, fy: 0.65, fw: 0.30, fh: 0.30, a: 0.022 },
  ];
  let panels = [];

  // ── Build ──────────────────────────────────────────────────────────────────
  function build() {
    intersections = [];
    glows         = [];
    panels        = [];

    // Center the grid on screen
    const cols    = Math.ceil(W / CELL) + 1;
    const rows    = Math.ceil(H / CELL) + 1;
    const offsetX = ((W % CELL) / 2) || 0;
    const offsetY = ((H % CELL) / 2) || 0;

    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        intersections.push({
          x: offsetX + c * CELL,
          y: offsetY + r * CELL,
        });
      }
    }

    // Snap panels to grid edges for architectural precision
    PANEL_DEFS.forEach(p => {
      const rawX = p.fx * W, rawY = p.fy * H;
      const rawW = p.fw * W, rawH = p.fh * H;
      const x = offsetX + Math.round((rawX - offsetX) / CELL) * CELL;
      const y = offsetY + Math.round((rawY - offsetY) / CELL) * CELL;
      const w = Math.round(rawW / CELL) * CELL;
      const h = Math.round(rawH / CELL) * CELL;
      panels.push({ x, y, w, h, a: p.a });
    });

    // Choose random intersections to glow — not too close to edges
    const interior = intersections.filter(
      p => p.x > CELL && p.x < W - CELL && p.y > CELL && p.y < H - CELL
    );
    const shuffled = interior.sort(() => Math.random() - 0.5);
    glows = shuffled.slice(0, GLOW_N).map(pt => ({
      x:       pt.x,
      y:       pt.y,
      phase:   Math.random() * Math.PI * 2,
      period:  6000 + Math.random() * 8000,  // 6–14 s — very slow breathing
      maxA:    0.10 + Math.random() * 0.18,  // soft ceiling — never dramatic
      radius:  50 + Math.random() * 60,      // diffuse, not tight
    }));
  }

  // ── Draw ───────────────────────────────────────────────────────────────────
  function draw(ts) {
    ctx.clearRect(0, 0, W, H);

    // Matte black — flat, no gradient drama
    ctx.fillStyle = '#090909';
    ctx.fillRect(0, 0, W, H);

    // ── Translucent panels ──
    panels.forEach(p => {
      ctx.fillStyle = `rgba(200,205,210,${p.a})`;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      // Hair-line border — cold gray
      ctx.strokeStyle = `rgba(190,200,210,0.07)`;
      ctx.lineWidth = 0.5;
      ctx.strokeRect(p.x, p.y, p.w, p.h);
    });

    // ── Grid ──
    const cols    = Math.ceil(W / CELL) + 1;
    const rows    = Math.ceil(H / CELL) + 1;
    const offsetX = ((W % CELL) / 2) || 0;
    const offsetY = ((H % CELL) / 2) || 0;

    ctx.strokeStyle = `rgba(155,162,170,${LINE_ALPHA})`;
    ctx.lineWidth   = 0.5;

    for (let c = 0; c < cols; c++) {
      const x = offsetX + c * CELL;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let r = 0; r < rows; r++) {
      const y = offsetY + r * CELL;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // ── Intersection micro-dots ── (barely visible data-point suggestion)
    ctx.fillStyle = `rgba(170,178,186,${NODE_ALPHA})`;
    intersections.forEach(pt => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 0.9, 0, Math.PI * 2);
      ctx.fill();
    });

    // ── Slow node glows ──
    glows.forEach(g => {
      // Sine wave: 0→1→0, very long period, offset by phase
      const t = Math.sin((ts / g.period) * Math.PI * 2 + g.phase);
      const a = ((t * 0.5 + 0.5)) * g.maxA;
      if (a < 0.004) return;

      const grad = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.radius);
      grad.addColorStop(0,   `rgba(205,215,225,${a})`);
      grad.addColorStop(0.5, `rgba(190,205,218,${a * 0.4})`);
      grad.addColorStop(1,   'rgba(190,205,218,0)');

      ctx.beginPath();
      ctx.arc(g.x, g.y, g.radius, 0, Math.PI * 2);
      ctx.fillStyle = grad;
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
      W = canvas.width  = window.innerWidth;
      H = canvas.height = window.innerHeight;
      build();
      rafId = requestAnimationFrame(draw);
    }, 120);
  }

  window.addEventListener('resize', resize);
  W = canvas.width  = window.innerWidth;
  H = canvas.height = window.innerHeight;
  build();
  rafId = requestAnimationFrame(draw);
})();
