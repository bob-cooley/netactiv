(function () {
  const canvas = document.getElementById('neuralvex-canvas');
  const ctx    = canvas.getContext('2d');

  let W, H, cx, cy, R, rafId;
  let stars = [];
  let nodes = [], edges = [], packets = [];
  let dragSens = 0.005;

  const TILT         = 0.44;
  const LAT_LINES    = 9;
  const LON_LINES    = 18;
  const NODE_COUNT   = 44;
  const EDGE_COUNT   = 50;
  const PACKET_COUNT = 28;
  const SPIN_MS      = 28000;
  const AUTO_SPIN    = 2 * Math.PI / SPIN_MS;
  const RESUME_DELAY = 3500; // ms idle after drag before auto-spin resumes
  const RESUME_RAMP  = 2500; // ms to fade back to full auto-spin rate

  // ── Node types — each color has a role ────────────────────────────────────
  //   relay    cyan    backbone routing
  //   hub      amber   high-traffic aggregation points (bigger, slower pulse)
  //   gateway  violet  encrypted inter-sector portals
  //   core     white   critical infrastructure (brightest, steadiest)
  //   transfer green   active data-transfer endpoints (fastest pulse)
  const NODE_TYPES = [
    { id: 'relay',    rgb: [0,   255, 218], weight: 0.42, glowScale: 1.00, pulseSpeed: 1.00 },
    { id: 'hub',      rgb: [255, 178,   0], weight: 0.15, glowScale: 1.70, pulseSpeed: 0.55 },
    { id: 'gateway',  rgb: [195,  45, 255], weight: 0.16, glowScale: 1.20, pulseSpeed: 1.35 },
    { id: 'core',     rgb: [255, 255, 255], weight: 0.11, glowScale: 2.00, pulseSpeed: 0.38 },
    { id: 'transfer', rgb: [ 48, 255,  90], weight: 0.16, glowScale: 1.10, pulseSpeed: 1.70 },
  ];

  const TYPE_PRIORITY = { core: 5, hub: 4, gateway: 3, transfer: 2, relay: 1 };

  function pickType() {
    let r = Math.random(), acc = 0;
    for (const t of NODE_TYPES) { acc += t.weight; if (r < acc) return t; }
    return NODE_TYPES[0];
  }

  // ── 3×3 matrix math ─────────────────────────────────────────────

  const mm = (A, B) => [
    A[0]*B[0]+A[1]*B[3]+A[2]*B[6], A[0]*B[1]+A[1]*B[4]+A[2]*B[7], A[0]*B[2]+A[1]*B[5]+A[2]*B[8],
    A[3]*B[0]+A[4]*B[3]+A[5]*B[6], A[3]*B[1]+A[4]*B[4]+A[5]*B[7], A[3]*B[2]+A[4]*B[5]+A[5]*B[8],
    A[6]*B[0]+A[7]*B[3]+A[8]*B[6], A[6]*B[1]+A[7]*B[4]+A[8]*B[7], A[6]*B[2]+A[7]*B[5]+A[8]*B[8],
  ];
  const mv  = (M, v) => [
    M[0]*v[0]+M[1]*v[1]+M[2]*v[2],
    M[3]*v[0]+M[4]*v[1]+M[5]*v[2],
    M[6]*v[0]+M[7]*v[1]+M[8]*v[2],
  ];
  const mrx = a => { const c=Math.cos(a),s=Math.sin(a); return [1,0,0, 0,c,-s, 0,s,c]; };
  const mry = a => { const c=Math.cos(a),s=Math.sin(a); return [c,0,s, 0,1,0,-s,0,c]; };
  const mrz = a => { const c=Math.cos(a),s=Math.sin(a); return [c,-s,0, s,c,0, 0,0,1]; };

  // ── Orientation state ──────────────────────────────────────────

  let rotM  = mrz(TILT);   // start with axial tilt baked in
  let velX  = 0, velY = AUTO_SPIN; // angular velocity (rad/ms)
  let isDrag = false;
  let lastPX = 0, lastPY = 0, lastPT = 0, lastTS = 0;
  let lastInteract = -1e9; // ensures auto-spin runs from page load

  // ── 3-D helpers ─────────────────────────────────────────────────────

  function cross3(a, b) {
    return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  }

  function norm3(v) {
    const l = Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]);
    return l < 1e-9 ? v : [v[0]/l, v[1]/l, v[2]/l];
  }

  // returns true if axis ax is within ~35° of MAX_PARALLEL or more existing axes
  const MAX_PARALLEL = 2;
  const PARALLEL_DOT = 0.82;
  function tooParallel(ax, axes) {
    let n = 0;
    for (const ex of axes) {
      if (Math.abs(ax[0]*ex[0]+ax[1]*ex[1]+ax[2]*ex[2]) > PARALLEL_DOT && ++n >= MAX_PARALLEL) return true;
    }
    return false;
  }

  function xyz(lat, lon) {
    const c = Math.cos(lat);
    return [c * Math.cos(lon), Math.sin(lat), c * Math.sin(lon)];
  }

  function rot(p) { return mv(rotM, p); }

  function proj(p) {
    return [cx + R * p[0], cy - R * p[1], p[2]];
  }

  function slerp(a, b, t) {
    let dot = a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
    dot = Math.max(-1, Math.min(1, dot));
    const omega = Math.acos(dot);
    if (omega < 1e-6) return [a[0], a[1], a[2]];
    const s = Math.sin(omega);
    const fa = Math.sin((1 - t) * omega) / s;
    const fb = Math.sin(t * omega) / s;
    return [a[0]*fa + b[0]*fb, a[1]*fa + b[1]*fb, a[2]*fa + b[2]*fb];
  }

  // ── Scene init ────────────────────────────────────────────────────────

  function buildScene() {
    stars = Array.from({ length: 320 }, () => ({
      x: Math.random(), y: Math.random(),
      r: 0.25 + Math.random() * 0.85,
      a: 0.07 + Math.random() * 0.52,
    }));

    const GOLDEN = Math.PI * (3 - Math.sqrt(5));
    nodes = Array.from({ length: NODE_COUNT }, (_, i) => {
      const y0  = 1 - (i / (NODE_COUNT - 1)) * 2;
      const yj  = Math.max(-0.98, Math.min(0.98, y0 + (Math.random() - 0.5) * 0.14));
      const lat = Math.asin(yj);
      const lon = ((GOLDEN * i + (Math.random() - 0.5) * 0.45) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      const type = pickType();
      return {
        pos:         xyz(lat, lon),
        type,
        pulsePhase:  Math.random() * Math.PI * 2,
        pulsePeriod: (1400 + Math.random() * 2400) / type.pulseSpeed,
      };
    });

    const used = new Set();
    const edgeAxes = [];
    edges = [];

    const hubIdxs = nodes.reduce((a, nd, i) => nd.type.id === 'hub' ? [...a, i] : a, []);
    hubIdxs.forEach(h => {
      const target = 5 + Math.floor(Math.random() * 2);
      let got = 0, t = 0;
      while (got < target && t++ < 600) {
        const b = Math.floor(Math.random() * NODE_COUNT);
        const k = `${Math.min(h, b)}-${Math.max(h, b)}`;
        if (b === h || used.has(k)) continue;
        const ax = norm3(cross3(nodes[h].pos, nodes[b].pos));
        if (tooParallel(ax, edgeAxes)) continue;
        used.add(k);
        edgeAxes.push(ax);
        const dom = TYPE_PRIORITY[nodes[h].type.id] >= TYPE_PRIORITY[nodes[b].type.id]
          ? nodes[h].type : nodes[b].type;
        edges.push({ a: h, b, rgb: dom.rgb });
        got++;
      }
    });

    let tries = 0;
    while (edges.length < EDGE_COUNT && tries++ < 2000) {
      const a = Math.floor(Math.random() * NODE_COUNT);
      const b = Math.floor(Math.random() * NODE_COUNT);
      const k = `${Math.min(a, b)}-${Math.max(a, b)}`;
      if (a === b || used.has(k)) continue;
      const ax = norm3(cross3(nodes[a].pos, nodes[b].pos));
      if (tooParallel(ax, edgeAxes)) continue;
      used.add(k);
      edgeAxes.push(ax);
      const dom = TYPE_PRIORITY[nodes[a].type.id] >= TYPE_PRIORITY[nodes[b].type.id]
        ? nodes[a].type : nodes[b].type;
      edges.push({ a, b, rgb: dom.rgb });
    }

    packets = Array.from({ length: PACKET_COUNT }, () => ({
      edge:  Math.floor(Math.random() * edges.length),
      t:     Math.random(),
      speed: 0.0002 + Math.pow(Math.random(), 1.5) * 0.003,
    }));
  }

  // ── Render ───────────────────────────────────────────────────────────

  function render(ts) {
    const dt = lastTS ? Math.min(ts - lastTS, 50) : 16;
    lastTS = ts;

    // After drag: fling decays to zero so globe holds position.
    // Auto-spin resumes after RESUME_DELAY ms idle, ramping in over RESUME_RAMP ms.
    if (!isDrag) {
      const idle = ts - lastInteract;
      const spinTarget = idle < RESUME_DELAY ? 0
        : AUTO_SPIN * Math.min(1, (idle - RESUME_DELAY) / RESUME_RAMP);
      rotM = mm(mrx(velX * dt), rotM);
      rotM = mm(mry(velY * dt), rotM);
      const decay = Math.pow(0.97, dt / 16.67);
      velX *= decay;
      velY = spinTarget + (velY - spinTarget) * decay;
    }

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#02040d';
    ctx.fillRect(0, 0, W, H);

    stars.forEach(s => {
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(195,218,255,${s.a})`;
      ctx.fill();
    });

    const SEGS = 72;

    // ── Grid — back face ──
    ctx.beginPath();
    for (let i = 0; i <= LAT_LINES; i++) {
      const lat = -Math.PI / 2 + (i / LAT_LINES) * Math.PI;
      for (let j = 0; j < SEGS; j++) {
        const p0 = proj(rot(xyz(lat, (j / SEGS) * Math.PI * 2)));
        const p1 = proj(rot(xyz(lat, ((j + 1) / SEGS) * Math.PI * 2)));
        if (p0[2] <= 0 && p1[2] <= 0) { ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); }
      }
    }
    for (let i = 0; i < LON_LINES; i++) {
      const lon = (i / LON_LINES) * Math.PI * 2;
      for (let j = 0; j < SEGS; j++) {
        const p0 = proj(rot(xyz(-Math.PI/2 + (j / SEGS) * Math.PI, lon)));
        const p1 = proj(rot(xyz(-Math.PI/2 + ((j + 1) / SEGS) * Math.PI, lon)));
        if (p0[2] <= 0 && p1[2] <= 0) { ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); }
      }
    }
    ctx.strokeStyle = 'rgba(0, 175, 255, 0.06)';
    ctx.lineWidth = 0.4;
    ctx.stroke();

    // ── Grid — front face ──
    ctx.beginPath();
    for (let i = 0; i <= LAT_LINES; i++) {
      const lat = -Math.PI / 2 + (i / LAT_LINES) * Math.PI;
      for (let j = 0; j < SEGS; j++) {
        const p0 = proj(rot(xyz(lat, (j / SEGS) * Math.PI * 2)));
        const p1 = proj(rot(xyz(lat, ((j + 1) / SEGS) * Math.PI * 2)));
        if (p0[2] > 0 && p1[2] > 0) { ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); }
      }
    }
    for (let i = 0; i < LON_LINES; i++) {
      const lon = (i / LON_LINES) * Math.PI * 2;
      for (let j = 0; j < SEGS; j++) {
        const p0 = proj(rot(xyz(-Math.PI/2 + (j / SEGS) * Math.PI, lon)));
        const p1 = proj(rot(xyz(-Math.PI/2 + ((j + 1) / SEGS) * Math.PI, lon)));
        if (p0[2] > 0 && p1[2] > 0) { ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); }
      }
    }
    ctx.strokeStyle = 'rgba(0, 210, 255, 0.28)';
    ctx.lineWidth = 0.65;
    ctx.stroke();

    // ── Axis indicator ──
    const nPole = proj(rot([0, 1, 0]));
    const sPole = proj(rot([0, -1, 0]));
    const axX   = 1.18;
    ctx.setLineDash([4, 8]);
    ctx.beginPath();
    ctx.moveTo(cx + (nPole[0] - cx) * axX, cy + (nPole[1] - cy) * axX);
    ctx.lineTo(cx + (sPole[0] - cx) * axX, cy + (sPole[1] - cy) * axX);
    ctx.strokeStyle = 'rgba(0, 160, 220, 0.18)';
    ctx.lineWidth = 0.7;
    ctx.stroke();
    ctx.setLineDash([]);

    // ── Data edges ──
    const ESEGS = 32;
    edges.forEach(({ a, b, rgb: [er, eg, eb] }) => {
      let prev = null;
      for (let j = 0; j <= ESEGS; j++) {
        const sp = slerp(nodes[a].pos, nodes[b].pos, j / ESEGS);
        const rp = proj(rot(sp));
        if (prev) {
          const mz   = (rp[2] + prev[2]) * 0.5;
          const alph = mz > 0 ? (0.06 + mz * 0.40) : 0.010;
          ctx.beginPath();
          ctx.moveTo(prev[0], prev[1]);
          ctx.lineTo(rp[0], rp[1]);
          ctx.strokeStyle = `rgba(${er},${eg},${eb},${alph})`;
          ctx.lineWidth = 0.85;
          ctx.stroke();
        }
        prev = rp;
      }
    });

    // ── Nodes ──
    nodes.forEach(nd => {
      const rp = proj(rot(nd.pos));
      if (rp[2] < -0.04) return;
      const pulse = 0.5 + 0.5 * Math.sin(ts / nd.pulsePeriod * Math.PI * 2 + nd.pulsePhase);
      const vis   = rp[2] > 0 ? 0.40 + rp[2] * 0.60 : 0;
      const a     = vis * (0.55 + 0.45 * pulse);
      const gr    = R * nd.type.glowScale * (0.018 + 0.010 * pulse);
      const [nr, ng, nb] = nd.type.rgb;
      const g     = ctx.createRadialGradient(rp[0], rp[1], 0, rp[0], rp[1], gr);
      g.addColorStop(0,   `rgba(${nr},${ng},${nb},${a * 0.92})`);
      g.addColorStop(0.5, `rgba(${nr},${ng},${nb},${a * 0.28})`);
      g.addColorStop(1,   `rgba(${nr},${ng},${nb},0)`);
      ctx.beginPath();
      ctx.arc(rp[0], rp[1], gr, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      const dotR = nd.type.id === 'core' ? 2.4 : nd.type.id === 'hub' ? 2.0 : 1.6;
      ctx.beginPath();
      ctx.arc(rp[0], rp[1], dotR, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${nr},${ng},${nb},${Math.min(1, a * 1.3)})`;
      ctx.fill();
    });

    // ── Packets ──
    packets.forEach(p => {
      p.t = (p.t + p.speed) % 1;
      const edge = edges[p.edge];
      const sp   = slerp(nodes[edge.a].pos, nodes[edge.b].pos, p.t);
      const rp   = proj(rot(sp));
      if (rp[2] < 0) return;
      const a    = 0.45 + rp[2] * 0.55;
      const pr   = R * 0.014;
      const [er, eg, eb] = edge.rgb;
      const g    = ctx.createRadialGradient(rp[0], rp[1], 0, rp[0], rp[1], pr);
      g.addColorStop(0,   `rgba(255,255,255,${a})`);
      g.addColorStop(0.4, `rgba(${er},${eg},${eb},${a * 0.70})`);
      g.addColorStop(1,   `rgba(${er},${eg},${eb},0)`);
      ctx.beginPath();
      ctx.arc(rp[0], rp[1], pr, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
    });

    // ── Rim ──
    const rim = ctx.createRadialGradient(cx, cy, R * 0.88, cx, cy, R * 1.18);
    rim.addColorStop(0,    'rgba(0, 170, 255, 0.12)');
    rim.addColorStop(0.55, 'rgba(0, 120, 220, 0.05)');
    rim.addColorStop(1,    'rgba(0,  70, 180, 0)');
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.18, 0, Math.PI * 2);
    ctx.fillStyle = rim;
    ctx.fill();

    rafId = requestAnimationFrame(render);
  }

  // ── Drag input ───────────────────────────────────────────────────────────

  function onDown(x, y) {
    isDrag = true;
    lastPX = x; lastPY = y;
    lastPT = performance.now();
    velX = 0; velY = 0;
    canvas.style.cursor = 'grabbing';
  }

  function onMove(x, y) {
    if (!isDrag) return;
    const now = performance.now();
    const dt  = Math.max(1, now - lastPT);
    const dx  = x - lastPX;
    const dy  = y - lastPY;
    rotM = mm(mrx(dy * dragSens), rotM);
    rotM = mm(mry(dx * dragSens), rotM);
    const alpha = 0.65;
    velX = alpha * (dy * dragSens / dt) + (1 - alpha) * velX;
    velY = alpha * (dx * dragSens / dt) + (1 - alpha) * velY;
    lastPX = x; lastPY = y; lastPT = now;
  }

  function onUp() {
    isDrag = false;
    lastInteract = performance.now();
    canvas.style.cursor = 'grab';
  }

  // Mouse — move/up on window so fast drags don't escape the canvas
  canvas.addEventListener('mousedown', e => onDown(e.clientX, e.clientY));
  window.addEventListener('mousemove', e => onMove(e.clientX, e.clientY));
  window.addEventListener('mouseup',   onUp);

  // Touch
  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    onDown(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });
  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    onMove(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });
  canvas.addEventListener('touchend',   onUp);
  canvas.addEventListener('touchcancel', onUp);

  // ── Resize ─────────────────────────────────────────────────────────────

  function resize() {
    W  = canvas.width  = window.innerWidth;
    H  = canvas.height = window.innerHeight;
    R  = Math.min(W, H) * 0.38;
    cx = W * 0.5;
    cy = H * 0.5;
    dragSens = Math.PI / (2 * R);
    canvas.style.cursor = 'grab';
  }

  buildScene();
  resize();

  let rsTimer;
  window.addEventListener('resize', () => {
    clearTimeout(rsTimer);
    rsTimer = setTimeout(() => {
      cancelAnimationFrame(rafId);
      resize();
      rafId = requestAnimationFrame(render);
    }, 120);
  });

  rafId = requestAnimationFrame(render);
})();
