// TEMP effect — ASCII art: the photo rendered as monospace characters,
// density mapped to brightness, in a single terminal-green tone (distinct
// register from the full-color effects). Characters near the cursor get a
// mild brightness/size boost. Same factory pattern as the others.
window.PhotoAscii = (function () {
  const CELL = 8;
  const RAMP = ' .:-=+*#%@';
  const HOVER_RADIUS = 55;

  function create(canvas, image) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    let cells = [];
    let rafId = null, running = false;
    let mouseX = -9999, mouseY = -9999;

    function sampleCells() {
      const off = document.createElement('canvas');
      off.width = W; off.height = H;
      const octx = off.getContext('2d');
      octx.drawImage(image, 0, 0, W, H);
      const data = octx.getImageData(0, 0, W, H).data;

      cells = [];
      for (let y = 0; y < H; y += CELL) {
        for (let x = 0; x < W; x += CELL) {
          const cx = Math.min(W - 1, x + CELL / 2) | 0;
          const cy = Math.min(H - 1, y + CELL / 2) | 0;
          const i = (cy * W + cx) * 4;
          if (data[i + 3] < 10) continue;
          const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
          const idx = Math.min(RAMP.length - 1, Math.floor(lum * RAMP.length));
          cells.push({ x: x + CELL / 2, y: y + CELL / 2, ch: RAMP[idx], lum });
        }
      }
    }

    function render() {
      if (!running) return;
      ctx.clearRect(0, 0, W, H);
      ctx.font = `${CELL * 1.25}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      cells.forEach(c => {
        if (c.ch === ' ') return;
        const dx = c.x - mouseX, dy = c.y - mouseY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const boost = dist < HOVER_RADIUS ? (1 - dist / HOVER_RADIUS) : 0;
        const toned = Math.pow(c.lum, 1.4);
        const alpha = Math.min(0.68, toned * 0.75 + 0.12 + boost * 0.3);
        ctx.fillStyle = `rgba(90,255,150,${alpha})`;
        ctx.fillText(c.ch, c.x, c.y);
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
      sampleCells();
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
