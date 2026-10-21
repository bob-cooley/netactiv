// TEMP effect — halftone: samples the photo onto a dot grid, dot radius
// driven by inverse luminance (classic ink-density halftone), rendered in
// each dot's sampled color against the dark canvas. Dots near the cursor
// get a mild extra pulse. Same factory pattern as the others.
window.PhotoHalftone = (function () {
  const CELL = 7;
  const MAX_R = CELL * 0.62;
  const MIN_R = CELL * 0.08;
  const HOVER_RADIUS = 50;
  const HOVER_BOOST = 0.5;

  function create(canvas, image) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    let dots = [];
    let rafId = null, running = false;
    let mouseX = -9999, mouseY = -9999;

    function sampleDots() {
      const off = document.createElement('canvas');
      off.width = W; off.height = H;
      const octx = off.getContext('2d');
      octx.drawImage(image, 0, 0, W, H);
      const data = octx.getImageData(0, 0, W, H).data;

      dots = [];
      for (let y = 0; y < H; y += CELL) {
        for (let x = 0; x < W; x += CELL) {
          const cx = Math.min(W - 1, x + CELL / 2) | 0;
          const cy = Math.min(H - 1, y + CELL / 2) | 0;
          const i = (cy * W + cx) * 4;
          if (data[i + 3] < 10) continue;
          const r = data[i], g = data[i + 1], b = data[i + 2];
          const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          const radius = MIN_R + (1 - lum) * (MAX_R - MIN_R);
          dots.push({ cx: x + CELL / 2, cy: y + CELL / 2, r, g, b, radius });
        }
      }
    }

    function render() {
      if (!running) return;
      ctx.clearRect(0, 0, W, H);

      dots.forEach(d => {
        const dx = d.cx - mouseX, dy = d.cy - mouseY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        let radius = d.radius;
        if (dist < HOVER_RADIUS) {
          radius += (1 - dist / HOVER_RADIUS) * HOVER_BOOST * MAX_R;
        }
        if (radius < 0.3) return;
        ctx.beginPath();
        ctx.arc(d.cx, d.cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${d.r},${d.g},${d.b})`;
        ctx.fill();
      });

      rafId = requestAnimationFrame(render);
    }

    function pointerPos(e) {
      const rect = canvas.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }
    function onMove(e) { const p = pointerPos(e); mouseX = p.x; mouseY = p.y; }
    function onLeave() { mouseX = -9999; mouseY = -9999; }

    function start() {
      if (running) return;
      running = true;
      sampleDots();
      canvas.addEventListener('mousemove', onMove);
      canvas.addEventListener('mouseleave', onLeave);
      canvas.addEventListener('touchmove', onMove, { passive: true });
      canvas.addEventListener('touchend', onLeave);
      rafId = requestAnimationFrame(render);
    }

    function stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
      canvas.removeEventListener('touchmove', onMove);
      canvas.removeEventListener('touchend', onLeave);
    }

    return { start, stop };
  }

  return { create };
})();
