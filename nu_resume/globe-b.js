// Globe B — abstract geometry / emergence. Crimson cube wireframes float in
// from off-screen and resolve into a composed cluster, then idle-rotate as
// a group while each cube keeps a slow independent tumble.
window.GlobeB = (function () {
  const VERTS = [
    [-1,-1,-1], [1,-1,-1], [1,1,-1], [-1,1,-1],
    [-1,-1, 1], [1,-1, 1], [1,1, 1], [-1,1, 1],
  ];
  const CUBE_EDGES = [
    [0,1],[1,2],[2,3],[3,0],
    [4,5],[5,6],[6,7],[7,4],
    [0,4],[1,5],[2,6],[3,7],
  ];

  const GROUP_SPIN = 2 * Math.PI / 52000; // rad/ms, slower than Globe A
  const CUBE_COUNT = 18;

  const mm = (A, B) => [
    A[0]*B[0]+A[1]*B[3]+A[2]*B[6], A[0]*B[1]+A[1]*B[4]+A[2]*B[7], A[0]*B[2]+A[1]*B[5]+A[2]*B[8],
    A[3]*B[0]+A[4]*B[3]+A[5]*B[6], A[3]*B[1]+A[4]*B[4]+A[5]*B[7], A[3]*B[2]+A[4]*B[5]+A[5]*B[8],
    A[6]*B[0]+A[7]*B[3]+A[8]*B[6], A[6]*B[1]+A[7]*B[4]+A[8]*B[7], A[6]*B[2]+A[7]*B[5]+A[8]*B[8],
  ];
  const mv  = (M, v) => [M[0]*v[0]+M[1]*v[1]+M[2]*v[2], M[3]*v[0]+M[4]*v[1]+M[5]*v[2], M[6]*v[0]+M[7]*v[1]+M[8]*v[2]];
  const mrx = a => { const c=Math.cos(a),s=Math.sin(a); return [1,0,0, 0,c,-s, 0,s,c]; };
  const mry = a => { const c=Math.cos(a),s=Math.sin(a); return [c,0,s, 0,1,0,-s,0,c]; };
  const IDENT = [1,0,0, 0,1,0, 0,0,1];

  function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }
  function easeOutBack(x) {
    const c1 = 1.15, c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  }
  function lerp3(a, b, t) { return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t]; }

  function create(canvas) {
    const ctx = canvas.getContext('2d');
    let W, H, cx, cy, R, rafId = null, running = false;
    let cubes = [], groupRotM = IDENT, lastTS = 0, startTS = 0;
    let resizeObserver;

    function buildScene() {
      const GOLDEN = Math.PI * (3 - Math.sqrt(5));
      cubes = Array.from({ length: CUBE_COUNT }, (_, i) => {
        const y0  = 1 - (i / (CUBE_COUNT - 1)) * 2;
        const lat = Math.asin(Math.max(-0.98, Math.min(0.98, y0)));
        const lon = (GOLDEN * i) % (Math.PI * 2);
        const radius = R * (0.14 + Math.random() * 0.42);
        const dir = [Math.cos(lat)*Math.cos(lon), Math.sin(lat), Math.cos(lat)*Math.sin(lon)];
        const targetPos = [dir[0]*radius, dir[1]*radius, dir[2]*radius];

        const sDir = norm3([Math.random()-0.5, Math.random()-0.5, Math.random()-0.5]);
        const sDist = R * (2.2 + Math.random() * 1.6);
        const startPos = [sDir[0]*sDist, sDir[1]*sDist, sDir[2]*sDist];

        const isCore = i % 6 === 0;
        const size = R * (isCore ? 0.10 + Math.random()*0.03 : 0.045 + Math.random()*0.05);
        const rgb = isCore ? [235, 60, 70] : [175 - Math.random()*40, 18 + Math.random()*10, 34 + Math.random()*12];

        return {
          startPos, targetPos, size, rgb,
          delay: i * 90 + Math.random() * 160,
          duration: 1200 + Math.random() * 700,
          localRotM: mm(mrx(Math.random()*Math.PI*2), mry(Math.random()*Math.PI*2)),
          spinX: (Math.random() - 0.5) * 0.00035,
          spinY: (Math.random() - 0.5) * 0.00035,
        };
      });
    }

    function norm3(v) { const l=Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2])||1e-9; return [v[0]/l,v[1]/l,v[2]/l]; }
    function proj(p) { return [cx + p[0], cy - p[1], p[2]]; }

    function render(ts) {
      if (!running) return;
      if (!startTS) startTS = ts;
      const dt = lastTS ? Math.min(ts - lastTS, 50) : 16;
      lastTS = ts;
      const elapsed = ts - startTS;

      groupRotM = mm(mry(GROUP_SPIN * dt), groupRotM);

      ctx.clearRect(0, 0, W, H);

      const drawList = [];

      cubes.forEach(c => {
        c.localRotM = mm(mrx(c.spinX * dt), mm(mry(c.spinY * dt), c.localRotM));
        const raw = Math.max(0, Math.min(1, (elapsed - c.delay) / c.duration));
        const posT = easeOutBack(raw);
        const fadeT = easeOutCubic(raw);
        const centerLocal = lerp3(c.startPos, c.targetPos, posT);
        const scale = 0.35 + 0.65 * fadeT;

        const verts = VERTS.map(v => {
          const rv = mv(c.localRotM, [v[0]*c.size*scale, v[1]*c.size*scale, v[2]*c.size*scale]);
          const local = [centerLocal[0]+rv[0], centerLocal[1]+rv[1], centerLocal[2]+rv[2]];
          return mv(groupRotM, local);
        });

        const centerWorld = mv(groupRotM, centerLocal);
        drawList.push({ verts, alpha: fadeT, rgb: c.rgb, z: centerWorld[2] });
      });

      drawList.sort((a, b) => a.z - b.z);

      drawList.forEach(({ verts, alpha, rgb }) => {
        if (alpha <= 0.002) return;
        const [r, g, b] = rgb;
        CUBE_EDGES.forEach(([ia, ib]) => {
          const pa = proj(verts[ia]);
          const pb = proj(verts[ib]);
          const mz = (pa[2] + pb[2]) * 0.5;
          const depth = Math.max(0.15, Math.min(1, (mz / (R * 0.9) + 1) * 0.5 + 0.35));
          ctx.beginPath();
          ctx.moveTo(pa[0], pa[1]);
          ctx.lineTo(pb[0], pb[1]);
          ctx.strokeStyle = `rgba(${r|0},${g|0},${b|0},${Math.min(0.95, alpha * depth)})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        });
        // soft vertex glow on the nearest corner for a bit of weight
        const nearest = verts.reduce((a, v) => v[2] > a[2] ? v : a, verts[0]);
        const pr = proj(nearest);
        const glowR = Math.max(6, (canvas._sizeR || 40) * 0.05);
        const glow = ctx.createRadialGradient(pr[0], pr[1], 0, pr[0], pr[1], glowR);
        glow.addColorStop(0, `rgba(${r|0},${g|0},${b|0},${alpha * 0.35})`);
        glow.addColorStop(1, `rgba(${r|0},${g|0},${b|0},0)`);
        ctx.beginPath();
        ctx.arc(pr[0], pr[1], glowR, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();
      });

      rafId = requestAnimationFrame(render);
    }

    function setSize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      W = rect.width; H = rect.height;
      cx = W * 0.5; cy = H * 0.5;
      R = Math.min(W, H) / 2.3;
      canvas._sizeR = R;
    }

    function start() {
      if (running) return;
      running = true;
      lastTS = 0; startTS = 0; groupRotM = IDENT;
      setSize();
      buildScene();
      resizeObserver = new ResizeObserver(() => setSize());
      resizeObserver.observe(canvas);
      rafId = requestAnimationFrame(render);
    }

    function stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      if (resizeObserver) resizeObserver.disconnect();
    }

    return { start, stop };
  }

  return { create };
})();
