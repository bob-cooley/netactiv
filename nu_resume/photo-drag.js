// TEMP effect — pixel-cluster drag: the photo is cut into small tiles, each
// tied to its neighbors and to its home position by spring constraints.
// Drag a tile and its neighbors pull along; release and it all settles back.
// Same factory pattern as the globe modules.
window.PhotoDrag = (function () {
  const CELL = 14;
  const HOME_SPRING = 0.10;
  const DAMPING = 0.90;
  const CONSTRAINT_ITERS = 3;

  function create(canvas, image) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cols = Math.ceil(W / CELL);
    const rows = Math.ceil(H / CELL);
    let cells = [];
    let edges = [];
    let rafId = null, running = false;
    let dragIdx = -1, lastPX = 0, lastPY = 0;

    function buildGrid() {
      cells = [];
      for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
          const hx = gx * CELL, hy = gy * CELL;
          cells.push({
            hx, hy, x: hx, y: hy, px: hx, py: hy,
            sx: hx, sy: hy, sw: Math.min(CELL, W - hx), sh: Math.min(CELL, H - hy),
          });
        }
      }
      edges = [];
      for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
          const i = gy * cols + gx;
          if (gx < cols - 1) edges.push([i, i + 1, CELL]);
          if (gy < rows - 1) edges.push([i, i + cols, CELL]);
        }
      }
    }

    function idxAt(mx, my) {
      const gx = Math.max(0, Math.min(cols - 1, Math.floor(mx / CELL)));
      const gy = Math.max(0, Math.min(rows - 1, Math.floor(my / CELL)));
      return gy * cols + gx;
    }

    function step() {
      // Verlet integration toward home (spring) for every non-dragged cell.
      cells.forEach((c, i) => {
        if (i === dragIdx) return;
        const vx = (c.x - c.px) * DAMPING;
        const vy = (c.y - c.py) * DAMPING;
        c.px = c.x; c.py = c.y;
        c.x += vx + (c.hx - c.x) * HOME_SPRING;
        c.y += vy + (c.hy - c.y) * HOME_SPRING;
      });

      // Neighbor distance constraints (cloth-style relaxation).
      for (let iter = 0; iter < CONSTRAINT_ITERS; iter++) {
        edges.forEach(([ia, ib, rest]) => {
          const a = cells[ia], b = cells[ib];
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
          const diff = (dist - rest) / dist;
          const aFixed = ia === dragIdx, bFixed = ib === dragIdx;
          if (aFixed && bFixed) return;
          const share = aFixed || bFixed ? 1 : 0.5;
          if (!aFixed) { a.x += dx * diff * share; a.y += dy * diff * share; }
          if (!bFixed) { b.x -= dx * diff * share; b.y -= dy * diff * share; }
        });
      }
    }

    function render() {
      if (!running) return;
      step();
      ctx.clearRect(0, 0, W, H);
      cells.forEach(c => {
        ctx.drawImage(image, c.sx, c.sy, c.sw, c.sh, c.x, c.y, c.sw, c.sh);
      });
      rafId = requestAnimationFrame(render);
    }

    function pointerPos(e) {
      const rect = canvas.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }

    function onDown(e) {
      const p = pointerPos(e);
      dragIdx = idxAt(p.x, p.y);
      lastPX = p.x; lastPY = p.y;
    }
    function onMove(e) {
      if (dragIdx === -1) return;
      e.preventDefault();
      const p = pointerPos(e);
      const c = cells[dragIdx];
      c.px = c.x; c.py = c.y;
      c.x = p.x - CELL / 2; c.y = p.y - CELL / 2;
      lastPX = p.x; lastPY = p.y;
    }
    function onUp() { dragIdx = -1; }

    function start() {
      if (running) return;
      running = true;
      buildGrid();
      canvas.addEventListener('mousedown', onDown);
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      canvas.addEventListener('touchstart', onDown, { passive: true });
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend', onUp);
      canvas.style.cursor = 'grab';
      rafId = requestAnimationFrame(render);
    }

    function stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      canvas.removeEventListener('touchstart', onDown);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    }

    return { start, stop };
  }

  return { create };
})();
