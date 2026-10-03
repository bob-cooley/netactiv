(function () {
  const canvas = document.getElementById('home-globe');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let W, H, cx, cy, R, Rdraw = 0, rafId;
  let lastTS = 0;
  let currentMode = 'chill';
  let joltEnd = 0, lastJolt = 0;
  let isDrag = false, lastPX = 0, lastPY = 0, lastPT = 0;
  let velX = 0, velY = 0;
  let rotM, dragSens = 0.005;
  let revertTimer = null;

  const TILT           = 0.44;
  const SPIN_MS        = 28000;
  const AUTO_SPIN_BASE = 2 * Math.PI / SPIN_MS;
  const FREQ           = 8;   // Goldberg subdivision frequency L → 10L²+2 = 642 cells

  const MODES = {
    chill:      { speedMult: 1.0, flicker: false, joltAmp: 36,  joltGap: 2000 },
    overcaffed: { speedMult: 3.0, flicker: true,  joltAmp: 95,  joltGap: 280  },
  };

  const ORIG_TEXT = 'transmission arrival pending';
  const GCHARS    = '░▒▓█#@!$%&?~<>[]{}0123456789\/|';
  let letterTimer = null;

  // ── Matrix math ──────────────────────────────────────────────────────────────
  const mm  = (A, B) => [
    A[0]*B[0]+A[1]*B[3]+A[2]*B[6], A[0]*B[1]+A[1]*B[4]+A[2]*B[7], A[0]*B[2]+A[1]*B[5]+A[2]*B[8],
    A[3]*B[0]+A[4]*B[3]+A[5]*B[6], A[3]*B[1]+A[4]*B[4]+A[5]*B[7], A[3]*B[2]+A[4]*B[5]+A[5]*B[8],
    A[6]*B[0]+A[7]*B[3]+A[8]*B[6], A[6]*B[1]+A[7]*B[4]+A[8]*B[7], A[6]*B[2]+A[7]*B[5]+A[8]*B[8],
  ];
  const mv  = (M, v) => [M[0]*v[0]+M[1]*v[1]+M[2]*v[2], M[3]*v[0]+M[4]*v[1]+M[5]*v[2], M[6]*v[0]+M[7]*v[1]+M[8]*v[2]];
  const mrx = a => { const c=Math.cos(a),s=Math.sin(a); return [1,0,0, 0,c,-s, 0,s,c]; };
  const mry = a => { const c=Math.cos(a),s=Math.sin(a); return [c,0,s, 0,1,0,-s,0,c]; };
  const mrz = a => { const c=Math.cos(a),s=Math.sin(a); return [c,-s,0, s,c,0, 0,0,1]; };

  function norm3(v) {
    const l = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
    return l < 1e-12 ? [0,0,0] : [v[0]/l, v[1]/l, v[2]/l];
  }

  function rot(p)  { return mv(rotM, p); }

  // ── Goldberg Polyhedron (hexagonal DGGS) ──────────────────────────────────────
  // Subdivided icosahedron → sphere → dualized to hex/pent cell mesh
  // 12 pentagonal cells at icosahedron vertices, 10L²-10 hexagonal cells

  let cells     = [];   // [{center, verts, isPent}]
  let neighbors = [];   // [Array<number>]

  function buildGlobe() {
    const L = FREQ;
    const φ = (1 + Math.sqrt(5)) / 2;

    // Icosahedron vertices (normalized to unit sphere)
    const IV = [
      [ 0,  1,  φ], [ 0,  1, -φ], [ 0, -1,  φ], [ 0, -1, -φ],
      [ 1,  φ,  0], [ 1, -φ,  0], [-1,  φ,  0], [-1, -φ,  0],
      [ φ,  0,  1], [ φ,  0, -1], [-φ,  0,  1], [-φ,  0, -1],
    ].map(v => norm3(v));

    // 20 triangular faces, consistent outward winding
    const IF = [
      [0,4,8], [0,8,2], [0,2,10],[0,10,6],[0,6,4],
      [3,9,1], [3,1,11],[3,11,7],[3,7,5], [3,5,9],
      [4,1,9], [4,9,8], [8,9,5], [8,5,2], [2,5,7],
      [2,7,10],[10,7,11],[10,11,6],[6,11,1],[6,1,4],
    ];

    const vertMap = new Map();
    const verts   = [];
    const tris    = [];

    function getVert(px, py, pz) {
      const n = norm3([px, py, pz]);
      const key = n[0].toFixed(7) + '|' + n[1].toFixed(7) + '|' + n[2].toFixed(7);
      let idx = vertMap.get(key);
      if (idx === undefined) { idx = verts.length; verts.push(n); vertMap.set(key, idx); }
      return idx;
    }

    IF.forEach(([ia, ib, ic]) => {
      const A = IV[ia], B = IV[ib], C = IV[ic];
      const g = [];
      for (let j = 0; j <= L; j++) {
        g[j] = [];
        for (let i = 0; i <= L - j; i++) {
          const wA = (L-j-i)/L, wB = j/L, wC = i/L;
          g[j][i] = getVert(wA*A[0]+wB*B[0]+wC*C[0], wA*A[1]+wB*B[1]+wC*C[1], wA*A[2]+wB*B[2]+wC*C[2]);
        }
      }
      for (let j = 0; j < L; j++) {
        for (let i = 0; i < L - j; i++) {
          tris.push([g[j][i], g[j][i+1], g[j+1][i]]);
          if (i + j < L - 1) tris.push([g[j][i+1], g[j+1][i+1], g[j+1][i]]);
        }
      }
    });

    // Triangle centroids (normalized to sphere surface)
    const tC = tris.map(([a,b,c]) => norm3([
      verts[a][0]+verts[b][0]+verts[c][0],
      verts[a][1]+verts[b][1]+verts[c][1],
      verts[a][2]+verts[b][2]+verts[c][2],
    ]));

    // Vertex → adjacent triangles
    const v2t = Array.from({length: verts.length}, () => []);
    tris.forEach(([a,b,c], ti) => { v2t[a].push(ti); v2t[b].push(ti); v2t[c].push(ti); });

    // Sort adjacent triangles angularly around each vertex (tangent-plane projection)
    function sortAround(vi) {
      const adj = v2t[vi];
      if (adj.length < 3) return adj;
      const n = verts[vi];
      let t0 = Math.abs(n[0]) < 0.9 ? [1,0,0] : [0,1,0];
      const d = t0[0]*n[0]+t0[1]*n[1]+t0[2]*n[2];
      t0 = norm3([t0[0]-d*n[0], t0[1]-d*n[1], t0[2]-d*n[2]]);
      const t1 = [n[1]*t0[2]-n[2]*t0[1], n[2]*t0[0]-n[0]*t0[2], n[0]*t0[1]-n[1]*t0[0]];
      return adj.slice().sort((ta, tb) => {
        const ca=tC[ta], cb=tC[tb];
        const ax=ca[0]*t0[0]+ca[1]*t0[1]+ca[2]*t0[2], ay=ca[0]*t1[0]+ca[1]*t1[1]+ca[2]*t1[2];
        const bx=cb[0]*t0[0]+cb[1]*t0[1]+cb[2]*t0[2], by=cb[0]*t1[0]+cb[1]*t1[1]+cb[2]*t1[2];
        return Math.atan2(ay,ax) - Math.atan2(by,bx);
      });
    }

    // Dualize: each subdivided vertex → one cell; cell polygon = sorted adjacent triangle centroids
    cells = verts.map((center, vi) => {
      const sorted = sortAround(vi);
      return { center, verts: sorted.map(ti => tC[ti]), isPent: sorted.length === 5, vi };
    });

    // Neighbor map: cells sharing a triangular-mesh edge are neighbors
    const v2c = new Int32Array(verts.length).fill(-1);
    cells.forEach((c, ci) => { v2c[c.vi] = ci; });

    neighbors = cells.map(() => []);
    const seen = new Set();
    tris.forEach(([a,b,c]) => {
      [[a,b],[b,c],[a,c]].forEach(([x,y]) => {
        const k = x < y ? `${x},${y}` : `${y},${x}`;
        if (seen.has(k)) return;
        seen.add(k);
        const ci = v2c[x], cj = v2c[y];
        if (ci >= 0 && cj >= 0) { neighbors[ci].push(cj); neighbors[cj].push(ci); }
      });
    });
  }

  function findNeighbors(ci) { return neighbors[ci]; }

  // ── Render ────────────────────────────────────────────────────────────────────
  function render(ts) {
    const dt = lastTS ? Math.min(ts - lastTS, 50) : 16;
    lastTS = ts;
    Rdraw = R;

    const mode = MODES[currentMode];
    const autoSpin = AUTO_SPIN_BASE * mode.speedMult;
    let flickerMult = 1, joltX = 0, joltY = 0;

    if (mode.flicker) {
      flickerMult = Math.random() < 0.30 ? 0.04 + Math.random() * 0.18 : 0.45 + Math.random() * 0.55;
      if (ts > joltEnd) {
        const since = ts - lastJolt;
        if (since > 30000 || (since > mode.joltGap && Math.random() < 0.007 * dt / 16.67)) {
          joltEnd = ts + 60 + Math.random() * 120;
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

    // Rotate cell centers and sort back-to-front (painter's algorithm)
    const sorted = cells.map(cell => ({ cell, z: rot(cell.center)[2] }));
    sorted.sort((a, b) => a.z - b.z);

    sorted.forEach(({ cell, z }) => {
      if (z < -0.3) return;

      const pts = cell.verts.map(v => {
        const r = rot(v);
        return [cx + Rdraw * r[0], cy - Rdraw * r[1]];
      });

      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();

      const vis = z > 0 ? z : 0;
      const fill = (0.06 + vis * 0.18) * flickerMult;
      ctx.fillStyle = cell.isPent
        ? `rgba(70,12,12,${fill})`
        : `rgba(8,28,62,${fill})`;
      ctx.fill();

      if (z > -0.15) {
        const ea = (z > 0 ? 0.10 + vis * 0.32 : (z + 0.15) * 0.15) * flickerMult;
        ctx.strokeStyle = `rgba(0,180,255,${ea})`;
        ctx.lineWidth   = vis > 0.5 ? 0.7 : 0.4;
        ctx.stroke();
      }
    });

    // Rim glow
    const rim = ctx.createRadialGradient(cx, cy, Rdraw * 0.88, cx, cy, Rdraw * 1.18);
    rim.addColorStop(0,    `rgba(0,170,255,${0.12 * flickerMult})`);
    rim.addColorStop(0.55, `rgba(0,120,220,${0.05 * flickerMult})`);
    rim.addColorStop(1,    'rgba(0,70,180,0)');
    ctx.beginPath();
    ctx.arc(cx, cy, Rdraw * 1.18, 0, Math.PI * 2);
    ctx.fillStyle = rim;
    ctx.fill();

    cx -= joltX; cy -= joltY;
    rafId = requestAnimationFrame(render);
  }

  // ── setSize ───────────────────────────────────────────────────────────────────
  function setSize() {
    const rect = canvas.getBoundingClientRect();
    W = canvas.width  = Math.round(rect.width);
    H = canvas.height = Math.round(rect.height);
    R = H / 4.2;
    Rdraw = R;
    cx = W - R * 1.04;
    cy = H * 0.5;
    dragSens = Math.PI / (2 * R);
    canvas.style.cursor = 'pointer';

    const footer = document.getElementById('site-footer');
    if (footer) {
      const excess = H - (cy + R);
      footer.style.marginTop = Math.round(-excess + 14) + 'px';
    }
  }

  // ── Letter glitch ─────────────────────────────────────────────────────────────
  function startLetterGlitch() {
    const gt = document.getElementById('glitch-text');
    if (!gt) return;
    const baseChars = ORIG_TEXT.split('');
    const nonSpace  = baseChars.map((c, i) => c !== ' ' ? i : -1).filter(i => i >= 0);
    let zapIndex = -1, zapExpiry = 0;
    letterTimer = setInterval(() => {
      const now = performance.now();
      if (zapIndex === -1 && Math.random() < 0.08) {
        zapIndex  = nonSpace[Math.floor(Math.random() * nonSpace.length)];
        zapExpiry = now + 40 + Math.random() * 60;
      }
      if (zapIndex !== -1) {
        if (now < zapExpiry) {
          const display = baseChars.slice();
          display[zapIndex] = GCHARS[Math.floor(Math.random() * GCHARS.length)];
          const s = display.join('');
          gt.textContent = s; gt.setAttribute('data-text', s);
        } else {
          zapIndex = -1;
          gt.textContent = ORIG_TEXT; gt.setAttribute('data-text', ORIG_TEXT);
        }
      }
    }, 60);
  }

  function stopLetterGlitch() {
    clearInterval(letterTimer); letterTimer = null;
    const gt = document.getElementById('glitch-text');
    if (gt) { gt.textContent = ORIG_TEXT; gt.setAttribute('data-text', ORIG_TEXT); }
  }

  // ── Click handler ─────────────────────────────────────────────────────────────
  canvas.addEventListener('click', e => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    if ((mx - cx)*(mx - cx) + (my - cy)*(my - cy) > R * R) return;

    clearTimeout(revertTimer);
    currentMode = 'overcaffed';
    joltEnd = 0; lastJolt = 0;
    velY = AUTO_SPIN_BASE * MODES.overcaffed.speedMult;

    const gt = document.getElementById('glitch-text');
    const ov = document.getElementById('glitch-overlay');
    if (gt) gt.classList.add('active');
    if (ov) ov.classList.add('active');
    document.body.classList.add('overcaffed');
    startLetterGlitch();

    revertTimer = setTimeout(() => {
      currentMode = 'chill';
      velY = AUTO_SPIN_BASE * MODES.chill.speedMult;
      if (gt) gt.classList.remove('active');
      if (ov) ov.classList.remove('active');
      document.body.classList.remove('overcaffed');
      stopLetterGlitch();
    }, 2000);
  });

  // ── Mouse drag ────────────────────────────────────────────────────────────────
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
    velX = al * ((e.clientY - lastPY) * dragSens / dt) + (1-al) * velX;
    velY = al * ((e.clientX - lastPX) * dragSens / dt) + (1-al) * velY;
    lastPX = e.clientX; lastPY = e.clientY; lastPT = now;
  });
  window.addEventListener('mouseup', () => { isDrag = false; });

  // ── Touch drag ────────────────────────────────────────────────────────────────
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
    velX = al * ((e.touches[0].clientY - lastPY) * dragSens / dt) + (1-al) * velX;
    velY = al * ((e.touches[0].clientX - lastPX) * dragSens / dt) + (1-al) * velY;
    lastPX = e.touches[0].clientX; lastPY = e.touches[0].clientY; lastPT = now;
  }, { passive: false });
  canvas.addEventListener('touchend', () => { isDrag = false; });

  // ── Init ──────────────────────────────────────────────────────────────────────
  rotM = mrz(TILT);
  velY = AUTO_SPIN_BASE;

  buildGlobe();
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
