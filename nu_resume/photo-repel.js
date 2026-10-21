// TEMP effect — mouse-repel particles: the photo is rendered as a grid of
// particles sitting at their home position; particles near the cursor get
// pushed away and spring back once the cursor moves on. Continuous/ambient,
// unlike the one-shot Particle Build. Same factory pattern as the others.
window.PhotoRepel = (function () {
  const STEP = 3;
  const RADIUS = 75;
  const FORCE = 7.5;
  const SPRING = 0.12;
  const DAMPING = 0.82;

  function create(canvas, image) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    let particles = [];
    let rafId = null, running = false;
    let mouseX = -9999, mouseY = -9999;

    function sampleParticles() {
      const off = document.createElement('canvas');
      off.width = W; off.height = H;
      const octx = off.getContext('2d');
      octx.drawImage(image, 0, 0, W, H);
      const data = octx.getImageData(0, 0, W, H).data;

      particles = [];
      for (let y = 0; y < H; y += STEP) {
        for (let x = 0; x < W; x += STEP) {
          const i = (y * W + x) * 4;
          if (data[i + 3] < 10) continue;
          particles.push({
            hx: x, hy: y,
            r: data[i], g: data[i + 1], b: data[i + 2],
            dx: 0, dy: 0, vx: 0, vy: 0,
          });
        }
      }
    }

    function render() {
      if (!running) return;
      ctx.clearRect(0, 0, W, H);

      particles.forEach(p => {
        const px = p.hx + p.dx, py = p.hy + p.dy;
        const toX = px - mouseX, toY = py - mouseY;
        const dist = Math.sqrt(toX * toX + toY * toY);
        if (dist < RADIUS && dist > 0.01) {
          const f = (1 - dist / RADIUS) * FORCE;
          p.vx += (toX / dist) * f;
          p.vy += (toY / dist) * f;
        }
        p.vx += -p.dx * SPRING;
        p.vy += -p.dy * SPRING;
        p.vx *= DAMPING; p.vy *= DAMPING;
        p.dx += p.vx; p.dy += p.vy;

        ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`;
        ctx.fillRect(p.hx + p.dx, p.hy + p.dy, STEP + 0.5, STEP + 0.5);
      });

      rafId = requestAnimationFrame(render);
    }

    function pointerPos(e) {
      const rect = canvas.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }
    function onMove(e) {
      const p = pointerPos(e);
      mouseX = p.x; mouseY = p.y;
    }
    function onLeave() { mouseX = -9999; mouseY = -9999; }

    function start() {
      if (running) return;
      running = true;
      sampleParticles();
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
