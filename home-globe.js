(function () {
  const canvas = document.getElementById('home-globe');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let W, H, cx, cy, R, Rdraw = 0, rafId;
  let nodes = [], edges = [], packets = [];
  let lastTS = 0;
  let currentMode = 'chill';
  let joltEnd = 0, lastJolt = 0;
  let isDrag = false, lastPX = 0, lastPY = 0, lastPT = 0;
  let velX = 0, velY = 0;
  let rotM, dragSens = 0.005;
  let revertTimer = null;

  const TILT           = 0.44;
  const LAT_LINES      = 9;
  const LON_LINES      = 18;
  const SPIN_MS        = 28000;
  const AUTO_SPIN_BASE = 2 * Math.PI / SPIN_MS;
  const SEGS           = 72;
  const ESEGS          = 32;
  const MAX_PARALLEL   = 2;
  const PARALLEL_DOT   = 0.82;

  const MODES = {
    chill:      { speedMult: 1.0, countMult: 2.0, nodeCountMult: undefined, packetCountMult: undefined, maxParallel: 2,  flicker: false, joltAmp: 36,  joltGap: 2000 },
    overcaffed: { speedMult: 3.0, countMult: 4.0, nodeCountMult: 2.0,       packetCountMult: 2.0,        maxParallel: 10, flicker: true,  joltAmp: 58,  joltGap: 600  },
  };

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

  const mm = (A, B) => [
    A[0]*B[0]+A[1]*B[3]+A[2]*B[6], A[0]*B[1]+A[1]*B[4]+A[2]*B[7], A[0]*B[2]+A[1]*B[5]+A[2]*B[8],
    A[3]*B[0]+A[4]*B[3]+A[5]*B[6], A[3]*B[1]+A[4]*B[4]+A[5]*B[7], A[3]*B[2]+A[4]*B[5]+A[5]*B[8],
    A[6]*B[0]+A[7]*B[3]+A[8]*B[6], A[6]*B[1]+A[7]*B[4]+A[8]*B[7], A[6]*B[2]+A[7]*B[5]+A[8]*B[8],
  ];
  const mv  = (M, v) => [M[0]*v[0]+M[1]*v[1]+M[2]*v[2], M[3]*v[0]+M[4]*v[1]+M[5]*v[2], M[6]*v[0]+M[7]*v[1]+M[8]*v[2]];
  const mrx = a => { const c=Math.cos(a),s=Math.sin(a); return [1,0,0, 0,c,-s, 0,s,c]; };
  const mry = a => { const c=Math.cos(a),s=Math.sin(a); return [c,0,s, 0,1,0,-s,0,c]; };
  const mrz = a => { const c=Math.cos(a),s=Math.sin(a); return [c,-s,0, s,c,0, 0,0,1]; };

  function cross3(a, b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
  function norm3(v) { const l=Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]); return l<1e-9?v:[v[0]/l,v[1]/l,v[2]/l]; }

  function tooParallel(ax, axes, max) {
    let n = 0;
    for (const ex of axes) {
      if (Math.abs(ax[0]*ex[0]+ax[1]*ex[1]+ax[2]*ex[2]) > PARALLEL_DOT && ++n >= (max||MAX_PARALLEL)) return true;
    }
    return false;
  }

  function xyz(lat, lon) { const c=Math.cos(lat); return [c*Math.cos(lon), Math.sin(lat), c*Math.sin(lon)]; }
  function rot(p) { return mv(rotM, p); }
  function proj(p) { return [cx + Rdraw * p[0], cy - Rdraw * p[1], p[2]]; }

  function slerp(a, b, t) {
    let dot = a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
    dot = Math.max(-1, Math.min(1, dot));
    const omega = Math.acos(dot);
    if (omega < 1e-6) return [a[0], a[1], a[2]];
    const s = Math.sin(omega);
    return [
      a[0]*Math.sin((1-t)*omega)/s + b[0]*Math.sin(t*omega)/s,
      a[1]*Math.sin((1-t)*omega)/s + b[1]*Math.sin(t*omega)/s,
      a[2]*Math.sin((1-t)*omega)/s + b[2]*Math.sin(t*omega)/s,
    ];
  }

  function buildScene() {
    const mode = MODES[currentMode];
    const nc = mode.nodeCountMult !== undefined ? mode.nodeCountMult : mode.countMult;
    const pc = mode.packetCountMult !== undefined ? mode.packetCountMult : mode.countMult;
    const nodeCount   = Math.max(8,  Math.round(44 * nc));
    const edgeCount   = Math.max(5,  Math.round(50 * mode.countMult));
    const packetCount = Math.max(3,  Math.round(28 * pc));
    const mxP = mode.maxParallel || MAX_PARALLEL;

    const GOLDEN = Math.PI * (3 - Math.sqrt(5));
    nodes = Array.from({ length: nodeCount }, (_, i) => {
      const y0  = 1 - (i / (nodeCount - 1)) * 2;
      const yj  = Math.max(-0.98, Math.min(0.98, y0 + (Math.random() - 0.5) * 0.14));
      const lat = Math.asin(yj);
      const lon = ((GOLDEN * i + (Math.random() - 0.5) * 0.45) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      const type = pickType();
      return {
        pos: xyz(lat, lon), type,
        pulsePhase:  Math.random() * Math.PI * 2,
        pulsePeriod: (1400 + Math.random() * 2400) / (type.pulseSpeed * mode.speedMult),
      };
    });

    const used = new Set(), edgeAxes = [];
    edges = [];

    const hubIdxs = nodes.reduce((a, nd, i) => nd.type.id === 'hub' ? [...a, i] : a, []);
    hubIdxs.forEach(h => {
      const target = 5 + Math.floor(Math.random() * 2);
      let got = 0, t = 0;
      while (got < target && t++ < 600) {
        const b = Math.floor(Math.random() * nodeCount);
        const k = `${Math.min(h, b)}-${Math.max(h, b)}`;
        if (b === h || used.has(k)) continue;
        const ax = norm3(cross3(nodes[h].pos, nodes[b].pos));
        if (tooParallel(ax, edgeAxes, mxP)) continue;
        used.add(k); edgeAxes.push(ax);
        const dom = TYPE_PRIORITY[nodes[h].type.id] >= TYPE_PRIORITY[nodes[b].type.id] ? nodes[h].type : nodes[b].type;
        edges.push({ a: h, b, rgb: dom.rgb });
        got++;
      }
    });

    let tries = 0;
    while (edges.length < edgeCount && tries++ < 8000) {
      const a = Math.floor(Math.random() * nodeCount);
      const b = Math.floor(Math.random() * nodeCount);
      const k = `${Math.min(a, b)}-${Math.max(a, b)}`;
      if (a === b || used.has(k)) continue;
      const ax = norm3(cross3(nodes[a].pos, nodes[b].pos));
      if (tooParallel(ax, edgeAxes, mxP)) continue;
      edgeAxes.push(ax); used.add(k);
      const dom = TYPE_PRIORITY[nodes[a].type.id] >= TYPE_PRIORITY[nodes[b].type.id] ? nodes[a].type : nodes[b].type;
      edges.push({ a, b, rgb: dom.rgb });
    }

    const SLOW_CAP = 4, SLOW_FLOOR_RAW = 0.0002 + 0.003 * 0.20;
    const slowEdges = new Set(); let slowCount = 0;
    packets = Array.from({ length: packetCount }, () => {
      const edge = Math.floor(Math.random() * edges.length);
      const rawSpeed = 0.0002 + Math.pow(Math.random(), 1.5) * 0.003;
      let speed = rawSpeed * mode.speedMult;
      if (rawSpeed < SLOW_FLOOR_RAW && (slowCount >= SLOW_CAP || slowEdges.has(edge))) {
        speed = (SLOW_FLOOR_RAW + Math.random() * (0.0032 - SLOW_FLOOR_RAW)) * mode.speedMult;
      } else if (rawSpeed < SLOW_FLOOR_RAW) { slowCount++; slowEdges.add(edge); }
      return { edge, t: Math.random(), speed };
    });
  }

  function render(ts) {
    const dt = lastTS ? Math.min(ts - lastTS, 50) : 16;
    lastTS = ts;
    Rdraw = R;

    const mode = MODES[currentMode];
    const autoSpin = AUTO_SPIN_BASE * mode.speedMult;

    let flickerMult = 1;
    let joltX = 0, joltY = 0;

    if (mode.flicker) {
      flickerMult = Math.random() < 0.30 ? 0.04 + Math.random() * 0.18 : 0.45 + Math.random() * 0.55;
      if (ts > joltEnd) {
        const timeSince = ts - lastJolt;
        if (timeSince > 30000 || (timeSince > mode.joltGap && Math.random() < 0.003 * dt / 16.67)) {
          joltEnd = ts + 120 + Math.random() * 220;
          lastJolt = ts;
        }
      }
      if (ts < joltEnd) {
        joltX = (Math.random() - 0.5) * mode.joltAmp;
        joltY = (Math.random() - 0.5) * mode.joltAmp;
      }
    }

    if (!isDrag) {
      rotM = mm(mrx(velX * dt), rotM);
      rotM = mm(mry(velY * dt), rotM);
      const decay = Math.pow(0.97, dt / 16.67);
      velX *= decay;
      const spinTarget = velY < 0 ? -autoSpin : autoSpin;
      velY = spinTarget + (velY - spinTarget) * decay;
    }

    ctx.clearRect(0, 0, W, H);

    cx += joltX; cy += joltY;

    // Back wireframe
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
    ctx.strokeStyle = `rgba(0, 175, 255, ${0.06 * flickerMult})`;
    ctx.lineWidth = 0.4;
    ctx.stroke();

    // Front wireframe
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
    ctx.strokeStyle = `rgba(0, 210, 255, ${0.28 * flickerMult})`;
    ctx.lineWidth = 0.65;
    ctx.stroke();

    // Axis
    const nPole = proj(rot([0, 1, 0]));
    const sPole = proj(rot([0, -1, 0]));
    ctx.setLineDash([4, 8]);
    ctx.beginPath();
    ctx.moveTo(cx + (nPole[0] - cx) * 1.18, cy + (nPole[1] - cy) * 1.18);
    ctx.lineTo(cx + (sPole[0] - cx) * 1.18, cy + (sPole[1] - cy) * 1.18);
    ctx.strokeStyle = `rgba(0, 160, 220, ${0.18 * flickerMult})`;
    ctx.lineWidth = 0.7;
    ctx.stroke();
    ctx.setLineDash([]);

    // Edges
    edges.forEach(({ a, b, rgb: [er, eg, eb] }) => {
      let prev = null;
      for (let j = 0; j <= ESEGS; j++) {
        const sp = slerp(nodes[a].pos, nodes[b].pos, j / ESEGS);
        const rp = proj(rot(sp));
        if (prev) {
          const mz   = (rp[2] + prev[2]) * 0.5;
          const alph = (mz > 0 ? (0.06 + mz * 0.40) : 0.010) * flickerMult;
          ctx.beginPath();
          ctx.moveTo(prev[0], prev[1]);
          ctx.lineTo(rp[0], rp[1]);
          ctx.strokeStyle = `rgba(${er},${eg},${eb},${Math.min(alph, 0.98)})`;
          ctx.lineWidth = 0.85;
          ctx.stroke();
        }
        prev = rp;
      }
    });

    // Nodes
    nodes.forEach(nd => {
      const rp = proj(rot(nd.pos));
      if (rp[2] < -0.04) return;
      const pulse = 0.5 + 0.5 * Math.sin(ts / nd.pulsePeriod * Math.PI * 2 + nd.pulsePhase);
      const vis   = rp[2] > 0 ? 0.40 + rp[2] * 0.60 : 0;
      const a     = Math.min(0.98, vis * (0.55 + 0.45 * pulse) * flickerMult);
      const gr    = Rdraw * nd.type.glowScale * (0.018 + 0.010 * pulse);
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

    // Packets
    packets.forEach(p => {
      p.t = (p.t + p.speed) % 1;
      const edge = edges[p.edge];
      const sp   = slerp(nodes[edge.a].pos, nodes[edge.b].pos, p.t);
      const rp   = proj(rot(sp));
      if (rp[2] < 0) return;
      const a  = (0.45 + rp[2] * 0.55) * flickerMult;
      const pr = Rdraw * 0.014;
      const [er, eg, eb] = edge.rgb;
      const g  = ctx.createRadialGradient(rp[0], rp[1], 0, rp[0], rp[1], pr);
      g.addColorStop(0,   `rgba(255,255,255,${a})`);
      g.addColorStop(0.4, `rgba(${er},${eg},${eb},${a * 0.70})`);
      g.addColorStop(1,   `rgba(${er},${eg},${eb},0)`);
      ctx.beginPath();
      ctx.arc(rp[0], rp[1], pr, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
    });

    // Rim glow
    const rim = ctx.createRadialGradient(cx, cy, Rdraw * 0.88, cx, cy, Rdraw * 1.18);
    rim.addColorStop(0,    `rgba(0, 170, 255, ${0.12 * flickerMult})`);
    rim.addColorStop(0.55, `rgba(0, 120, 220, ${0.05 * flickerMult})`);
    rim.addColorStop(1,    'rgba(0, 70, 180, 0)');
    ctx.beginPath();
    ctx.arc(cx, cy, Rdraw * 1.18, 0, Math.PI * 2);
    ctx.fillStyle = rim;
    ctx.fill();

    cx -= joltX; cy -= joltY;

    rafId = requestAnimationFrame(render);
  }

  function setSize() {
    const rect = canvas.getBoundingClientRect();
    W = canvas.width  = Math.round(rect.width);
    H = canvas.height = Math.round(rect.height);
    R = H / 2.1;
    Rdraw = R;
    cx = W - R * 1.04;
    cy = H * 0.5;
    dragSens = Math.PI / (2 * R);
    canvas.style.cursor = 'pointer';

    // Pull footer flush to globe bottom (cy + R), not canvas bottom
    const footer = document.getElementById('site-footer');
    if (footer) {
      const excess = H - (cy + R);
      footer.style.marginTop = Math.round(-excess + 14) + 'px';
    }
  }

  // Click → overcaffed for 1 second, then snap back to chill
  canvas.addEventListener('click', () => {
    clearTimeout(revertTimer);
    currentMode = 'overcaffed';
    joltEnd = 0; lastJolt = 0;
    buildScene();
    velY = AUTO_SPIN_BASE * MODES.overcaffed.speedMult;
    const gt = document.getElementById('glitch-text');
    if (gt) gt.classList.add('active');

    revertTimer = setTimeout(() => {
      currentMode = 'chill';
      buildScene();
      velY = AUTO_SPIN_BASE * MODES.chill.speedMult;
      if (gt) gt.classList.remove('active');
    }, 1000);
  });

  // Mouse drag
  canvas.addEventListener('mousedown', e => {
    isDrag = true; lastPX = e.clientX; lastPY = e.clientY;
    lastPT = performance.now(); velX = 0; velY = 0;
  });
  window.addEventListener('mousemove', e => {
    if (!isDrag) return;
    const now = performance.now(), dt = Math.max(1, now - lastPT);
    rotM = mm(mrx((e.clientY - lastPY) * dragSens), rotM);
    rotM = mm(mry((e.clientX - lastPX) * dragSens), rotM);
    const al = 0.65;
    velX = al * ((e.clientY - lastPY) * dragSens / dt) + (1 - al) * velX;
    velY = al * ((e.clientX - lastPX) * dragSens / dt) + (1 - al) * velY;
    lastPX = e.clientX; lastPY = e.clientY; lastPT = now;
  });
  window.addEventListener('mouseup', () => { isDrag = false; });

  // Touch drag
  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    isDrag = true; lastPX = e.touches[0].clientX; lastPY = e.touches[0].clientY;
    lastPT = performance.now(); velX = 0; velY = 0;
  }, { passive: false });
  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (!isDrag) return;
    const now = performance.now(), dt = Math.max(1, now - lastPT);
    rotM = mm(mrx((e.touches[0].clientY - lastPY) * dragSens), rotM);
    rotM = mm(mry((e.touches[0].clientX - lastPX) * dragSens), rotM);
    const al = 0.65;
    velX = al * ((e.touches[0].clientY - lastPY) * dragSens / dt) + (1 - al) * velX;
    velY = al * ((e.touches[0].clientX - lastPX) * dragSens / dt) + (1 - al) * velY;
    lastPX = e.touches[0].clientX; lastPY = e.touches[0].clientY; lastPT = now;
  }, { passive: false });
  canvas.addEventListener('touchend', () => { isDrag = false; });

  rotM = mrz(TILT);
  velY = AUTO_SPIN_BASE;

  buildScene();
  setSize();

  let rsTimer;
  window.addEventListener('resize', () => {
    clearTimeout(rsTimer);
    rsTimer = setTimeout(() => {
      cancelAnimationFrame(rafId);
      setSize();
      rafId = requestAnimationFrame(render);
    }, 120);
  });

  rafId = requestAnimationFrame(render);
})();
