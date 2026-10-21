// TEMP effect — particle build: samples the photo into a grid of particles
// that scatter off-canvas and ease back to their home (source) position,
// then dissolve into the actual sharp photo once settled. Click the canvas
// to replay. Same factory pattern as the globe modules.
window.PhotoParticle = (function () {
  const RESOLVE_MS = 300;

  function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }
  function easeOutBack(x) {
    const c1 = 1.2, c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  }

  function create(canvas, image) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const STEP = 3;
    let particles = [];
    let maxFinish = 0;
    let rafId = null, running = false, startTS = 0, settled = false;

    function sampleParticles() {
      const off = document.createElement('canvas');
      off.width = W; off.height = H;
      const octx = off.getContext('2d');
      octx.drawImage(image, 0, 0, W, H);
      const data = octx.getImageData(0, 0, W, H).data;

      particles = [];
      maxFinish = 0;
      for (let y = 0; y < H; y += STEP) {
        for (let x = 0; x < W; x += STEP) {
          const i = (y * W + x) * 4;
          const a = data[i + 3];
          if (a < 10) continue;
          const delay = Math.random() * 500;
          const duration = 500 + Math.random() * 500;
          if (delay + duration > maxFinish) maxFinish = delay + duration;
          particles.push({
            hx: x, hy: y,
            r: data[i], g: data[i + 1], b: data[i + 2],
            delay, duration,
            sx: Math.random() * (W + 300) - 150 + (Math.random() < 0.5 ? -200 : 200),
            sy: Math.random() * (H + 300) - 150 + (Math.random() < 0.5 ? -200 : 200),
          });
        }
      }
    }

    function drawParticles(elapsed, alpha) {
      particles.forEach(p => {
        const raw = Math.max(0, Math.min(1, (elapsed - p.delay) / p.duration));
        const t = easeOutBack(raw);
        const x = p.sx + (p.hx - p.sx) * t;
        const y = p.sy + (p.hy - p.sy) * t;
        const a = easeOutCubic(raw) * alpha;
        ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${a})`;
        ctx.fillRect(x, y, STEP + 0.5, STEP + 0.5);
      });
    }

    function render(ts) {
      if (!running) return;
      if (!startTS) startTS = ts;
      const elapsed = ts - startTS;

      ctx.clearRect(0, 0, W, H);

      if (elapsed < maxFinish) {
        drawParticles(elapsed, 1);
      } else {
        const resolveT = Math.min(1, (elapsed - maxFinish) / RESOLVE_MS);
        if (resolveT < 1) {
          drawParticles(elapsed, 1 - resolveT);
          ctx.save();
          ctx.globalAlpha = resolveT;
          ctx.drawImage(image, 0, 0, W, H);
          ctx.restore();
        } else {
          ctx.drawImage(image, 0, 0, W, H);
          settled = true;
          rafId = null;
        }
      }

      if (!settled) rafId = requestAnimationFrame(render);
    }

    function replay() {
      startTS = 0;
      settled = false;
      sampleParticles();
      if (running && !rafId) rafId = requestAnimationFrame(render);
    }

    function onClick() { replay(); }

    function start() {
      if (running) return;
      running = true;
      settled = false;
      sampleParticles();
      canvas.addEventListener('click', onClick);
      rafId = requestAnimationFrame(render);
    }

    function stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      canvas.removeEventListener('click', onClick);
    }

    return { start, stop };
  }

  return { create };
})();
