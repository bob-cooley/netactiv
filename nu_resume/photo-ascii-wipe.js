// TEMP effect — ASCII wipe: same character grid as ASCII Art, but flattened
// into one reading-order sequence (row by row, left to right). Two erasure
// fronts start at the very first and very last character and advance toward
// each other, one character at a time; each erased character reveals the
// real photo underneath at that cell. The fronts meet in the middle of the
// sequence, at which point the photo is fully revealed. Click to replay.
// Same factory pattern as the other photo effects.
window.PhotoAsciiWipe = (function () {
  const CELL = 8;
  const RAMP = ' .:-=+*#%@';
  const BG = '#0a0a0f';
  const HOLD_MS = 1500;
  const DURATION_MS = 2800;

  function create(canvas, image) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    let cells = [];
    let rafId = null, running = false, startTS = 0, done = false;

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

    function render(ts) {
      if (!running) return;
      if (!startTS) startTS = ts;
      const elapsed = ts - startTS;
      const total = cells.length;
      const wipeElapsed = Math.max(0, elapsed - HOLD_MS);
      const frac = Math.min(1, wipeElapsed / DURATION_MS);
      const erased = Math.floor(frac * total);
      const loCount = Math.ceil(erased / 2);
      const hiCount = erased - loCount;
      const hiStart = total - hiCount;

      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(image, 0, 0, W, H);

      ctx.font = `${CELL * 1.25}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (let i = loCount; i < hiStart; i++) {
        const c = cells[i];
        ctx.fillStyle = BG;
        ctx.fillRect(c.x - CELL / 2, c.y - CELL / 2, CELL, CELL);
        if (c.ch !== ' ') {
          const toned = Math.pow(c.lum, 1.4);
          const alpha = Math.min(0.68, toned * 0.75 + 0.12);
          ctx.fillStyle = `rgba(90,255,150,${alpha})`;
          ctx.fillText(c.ch, c.x, c.y);
        }
      }

      if (frac >= 1) {
        done = true;
        rafId = null;
        return;
      }
      rafId = requestAnimationFrame(render);
    }

    function replay() {
      startTS = 0;
      done = false;
      if (running && !rafId) rafId = requestAnimationFrame(render);
    }

    function onClick() { replay(); }

    function start() {
      if (running) return;
      running = true;
      done = false;
      sampleCells();
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
