// Globe C — Goldberg Polyhedron hexagonal DGGS (subdivided icosahedron, dualized)
// Same factory pattern as globe-a.js and globe-b.js.
window.GlobeC = (function () {
  function create(canvas) {
    const ctx = canvas.getContext('2d');
    let W, H, cx, cy, R, Rdraw = 0, rafId = null, running = false;
    let lastTS = 0;
    let isDrag = false, lastPX = 0, lastPY = 0, lastPT = 0;
    let velX = 0, velY = 0;
    let rotM, dragSens = 0.005;
    let cells = [], neighbors = [];
    let resizeObserver;

    const TILT           = 0.44;
    const SPIN_MS        = 28000;
    const AUTO_SPIN_BASE = 2 * Math.PI / SPIN_MS;
    const FREQ           = 8;  // 10L²+2 = 642 cells

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
    function rot(p) { return mv(rotM, p); }

    function buildGlobe() {
      const L = FREQ;
      const phi = (1 + Math.sqrt(5)) / 2;
      const IV = [
        [ 0,  1,  phi], [ 0,  1, -phi], [ 0, -1,  phi], [ 0, -1, -phi],
        [ 1,  phi,  0], [ 1, -phi,  0], [-1,  phi,  0], [-1, -phi,  0],
        [ phi,  0,  1], [ phi,  0, -1], [-phi,  0,  1], [-phi,  0, -1],
      ].map(v => norm3(v));
      const IF = [
        [0,4,8], [0,8,2], [0,2,10],[0,10,6],[0,6,4],
        [3,9,1], [3,1,11],[3,11,7],[3,7,5], [3,5,9],
        [4,1,9], [4,9,8], [8,9,5], [8,5,2], [2,5,7],
        [2,7,10],[10,7,11],[10,11,6],[6,11,1],[6,1,4],
      ];
      const vertMap = new Map(), verts = [], tris = [];
      function getVert(px, py, pz) {
        const n = norm3([px, py, pz]);
        const key = n[0].toFixed(7) + '|' + n[1].toFixed(7) + '|' + n[2].toFixed(7);
        let idx = vertMap.get(key);
        if (idx === undefined) { idx = verts.length; verts.push(n); vertMap.set(key, idx); }
        return idx;
      }
      IF.forEach(function(face) {
        const A = IV[face[0]], B = IV[face[1]], C = IV[face[2]];
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
      const tC = tris.map(function(t) {
        return norm3([verts[t[0]][0]+verts[t[1]][0]+verts[t[2]][0], verts[t[0]][1]+verts[t[1]][1]+verts[t[2]][1], verts[t[0]][2]+verts[t[1]][2]+verts[t[2]][2]]);
      });
      const v2t = Array.from({length: verts.length}, function() { return []; });
      tris.forEach(function(t, ti) { v2t[t[0]].push(ti); v2t[t[1]].push(ti); v2t[t[2]].push(ti); });
      function sortAround(vi) {
        const adj = v2t[vi];
        if (adj.length < 3) return adj;
        const n = verts[vi];
        let t0 = Math.abs(n[0]) < 0.9 ? [1,0,0] : [0,1,0];
        const d = t0[0]*n[0]+t0[1]*n[1]+t0[2]*n[2];
        t0 = norm3([t0[0]-d*n[0], t0[1]-d*n[1], t0[2]-d*n[2]]);
        const t1 = [n[1]*t0[2]-n[2]*t0[1], n[2]*t0[0]-n[0]*t0[2], n[0]*t0[1]-n[1]*t0[0]];
        return adj.slice().sort(function(ta, tb) {
          const ca=tC[ta], cb=tC[tb];
          const ax=ca[0]*t0[0]+ca[1]*t0[1]+ca[2]*t0[2], ay=ca[0]*t1[0]+ca[1]*t1[1]+ca[2]*t1[2];
          const bx=cb[0]*t0[0]+cb[1]*t0[1]+cb[2]*t0[2], by=cb[0]*t1[0]+cb[1]*t1[1]+cb[2]*t1[2];
          return Math.atan2(ay,ax) - Math.atan2(by,bx);
        });
      }
      cells = verts.map(function(center, vi) {
        const sorted = sortAround(vi);
        return { center: center, verts: sorted.map(function(ti) { return tC[ti]; }), isPent: sorted.length === 5, vi: vi };
      });
      const v2c = new Int32Array(verts.length).fill(-1);
      cells.forEach(function(c, ci) { v2c[c.vi] = ci; });
      neighbors = cells.map(function() { return []; });
      const seen = new Set();
      tris.forEach(function(t) {
        [[t[0],t[1]],[t[1],t[2]],[t[0],t[2]]].forEach(function(pair) {
          const x = pair[0], y = pair[1];
          const k = x < y ? x+','+y : y+','+x;
          if (seen.has(k)) return;
          seen.add(k);
          const ci = v2c[x], cj = v2c[y];
          if (ci >= 0 && cj >= 0) { neighbors[ci].push(cj); neighbors[cj].push(ci); }
        });
      });
    }

    function render(ts) {
      if (!running) return;
      const dt = lastTS ? Math.min(ts - lastTS, 50) : 16;
      lastTS = ts;
      Rdraw = R;

      if (!isDrag) {
        rotM = mm(mrx(velX * dt), rotM);
        rotM = mm(mry(velY * dt), rotM);
        const decay = Math.pow(0.97, dt / 16.67);
        velX *= decay;
        const spinTarget = velY < 0 ? -AUTO_SPIN_BASE : AUTO_SPIN_BASE;
        velY = spinTarget + (velY - spinTarget) * decay;
      }

      ctx.clearRect(0, 0, W, H);

      const sortedCells = cells.map(function(cell) { return { cell: cell, z: rot(cell.center)[2] }; });
      sortedCells.sort(function(a, b) { return a.z - b.z; });

      sortedCells.forEach(function(item) {
        const cell = item.cell, z = item.z;
        if (z < -0.3) return;
        const pts = cell.verts.map(function(v) {
          const r = rot(v);
          return [cx + Rdraw * r[0], cy - Rdraw * r[1]];
        });
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.closePath();
        const vis = z > 0 ? z : 0;
        const fill = 0.06 + vis * 0.18;
        ctx.fillStyle = cell.isPent ? 'rgba(70,12,12,'+fill+')' : 'rgba(8,28,62,'+fill+')';
        ctx.fill();
        if (z > -0.15) {
          const ea = z > 0 ? 0.10 + vis * 0.32 : (z + 0.15) * 0.15;
          ctx.strokeStyle = 'rgba(0,180,255,'+ea+')';
          ctx.lineWidth = vis > 0.5 ? 0.7 : 0.4;
          ctx.stroke();
        }
      });

      const rim = ctx.createRadialGradient(cx, cy, Rdraw * 0.88, cx, cy, Rdraw * 1.18);
      rim.addColorStop(0,    'rgba(0,170,255,0.12)');
      rim.addColorStop(0.55, 'rgba(0,120,220,0.05)');
      rim.addColorStop(1,    'rgba(0,70,180,0)');
      ctx.beginPath();
      ctx.arc(cx, cy, Rdraw * 1.18, 0, Math.PI * 2);
      ctx.fillStyle = rim;
      ctx.fill();

      rafId = requestAnimationFrame(render);
    }

    function setSize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      W = rect.width; H = rect.height;
      R = Math.min(W, H) / 2.3;
      Rdraw = R;
      cx = W * 0.5;
      cy = H * 0.5;
      dragSens = Math.PI / (2 * R);
    }

    function onMouseDown(e) {
      isDrag = true; lastPX = e.clientX; lastPY = e.clientY;
      lastPT = performance.now(); velX = 0; velY = 0;
      canvas.style.cursor = 'grabbing';
    }
    function onMouseMove(e) {
      if (!isDrag) return;
      const now = performance.now(), dt = Math.max(1, now - lastPT);
      rotM = mm(mrx((e.clientY - lastPY) * dragSens), rotM);
      rotM = mm(mry((e.clientX - lastPX) * dragSens), rotM);
      const al = 0.65;
      velX = al * ((e.clientY - lastPY) * dragSens / dt) + (1 - al) * velX;
      velY = al * ((e.clientX - lastPX) * dragSens / dt) + (1 - al) * velY;
      lastPX = e.clientX; lastPY = e.clientY; lastPT = now;
    }
    function onMouseUp() { isDrag = false; canvas.style.cursor = 'grab'; }
    function onTouchStart(e) {
      e.preventDefault();
      isDrag = true; lastPX = e.touches[0].clientX; lastPY = e.touches[0].clientY;
      lastPT = performance.now(); velX = 0; velY = 0;
    }
    function onTouchMove(e) {
      e.preventDefault();
      if (!isDrag) return;
      const now = performance.now(), dt = Math.max(1, now - lastPT);
      rotM = mm(mrx((e.touches[0].clientY - lastPY) * dragSens), rotM);
      rotM = mm(mry((e.touches[0].clientX - lastPX) * dragSens), rotM);
      const al = 0.65;
      velX = al * ((e.touches[0].clientY - lastPY) * dragSens / dt) + (1 - al) * velX;
      velY = al * ((e.touches[0].clientX - lastPX) * dragSens / dt) + (1 - al) * velY;
      lastPX = e.touches[0].clientX; lastPY = e.touches[0].clientY; lastPT = now;
    }
    function onTouchEnd() { isDrag = false; }

    function start() {
      if (running) return;
      running = true;
      rotM = mrz(TILT);
      velY = AUTO_SPIN_BASE;
      lastTS = 0;
      buildGlobe();
      setSize();
      canvas.style.cursor = 'grab';
      canvas.addEventListener('mousedown', onMouseDown);
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      canvas.addEventListener('touchstart', onTouchStart, { passive: false });
      canvas.addEventListener('touchmove', onTouchMove, { passive: false });
      canvas.addEventListener('touchend', onTouchEnd);
      resizeObserver = new ResizeObserver(function() { setSize(); });
      resizeObserver.observe(canvas);
      rafId = requestAnimationFrame(render);
    }

    function stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      if (resizeObserver) resizeObserver.disconnect();
    }

    return { start: start, stop: stop };
  }

  return { create: create };
})();
