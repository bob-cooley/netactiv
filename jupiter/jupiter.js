(function () {
  const canvas = document.getElementById('jupiter-canvas');
  const ctx    = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  let W, H, cx, cy, R, rafId, stars = [];
  let tex; // generated texture canvas

  const ROTATION_MS = 30000; // full rotation period (ms) — Jupiter ~10h, sped up
  const TEX_W = 2048, TEX_H = 512;

  // ── Procedural Jupiter texture ─────────────────────────────────────────────
  function generateTexture() {
    const tc = document.createElement('canvas');
    tc.width = TEX_W; tc.height = TEX_H;
    const tx = tc.getContext('2d');
    tx.imageSmoothingEnabled = true;

    const bands = [
      [0.00, 0.06, '#6b3d1e'],
      [0.06, 0.03, '#c8924a'],
      [0.09, 0.04, '#8a4820'],
      [0.13, 0.05, '#e4c882'],
      [0.18, 0.05, '#7a3c1a'],
      [0.23, 0.07, '#ecd490'],
      [0.30, 0.11, '#783814'],
      [0.41, 0.13, '#f2dfa4'],
      [0.54, 0.11, '#64280c'],
      [0.65, 0.07, '#c88838'],
      [0.72, 0.05, '#7c3c1e'],
      [0.77, 0.06, '#d09e58'],
      [0.83, 0.04, '#5c2c12'],
      [0.87, 0.13, '#7a4428'],
    ];

    bands.forEach(([y0, h, color]) => {
      tx.fillStyle = color;
      tx.fillRect(0, y0 * TEX_H, TEX_W, Math.ceil(h * TEX_H) + 1);
    });

    tx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < bands.length - 1; i++) {
      const [y0, h, c0] = bands[i];
      const [, , c1]    = bands[i + 1];
      const edgeY       = (y0 + h) * TEX_H;
      const amp         = 4 + Math.random() * 5;
      const freq1       = 6  + Math.random() * 8;
      const freq2       = 14 + Math.random() * 10;
      const phase1      = Math.random() * Math.PI * 2;
      const phase2      = Math.random() * Math.PI * 2;

      for (let x = 0; x < TEX_W; x += 2) {
        const wave = Math.sin(x / TEX_W * Math.PI * freq1 + phase1) * amp
                   + Math.sin(x / TEX_W * Math.PI * freq2 + phase2) * (amp * 0.4);
        const blend = 8;
        for (let dy = -blend; dy <= blend; dy++) {
          const t = Math.max(0, 1 - Math.abs(dy - wave) / blend);
          if (t < 0.01) continue;
          tx.globalAlpha = t * 0.55;
          tx.fillStyle   = dy < wave ? c0 : c1;
          tx.fillRect(x, edgeY + dy, 2, 1);
        }
      }
    }
    tx.globalAlpha = 1;

    tx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 120; i++) {
      const y   = Math.random() * TEX_H;
      const x   = Math.random() * TEX_W;
      const len = 60 + Math.random() * 300;
      tx.globalAlpha = 0.04 + Math.random() * 0.06;
      tx.fillStyle   = Math.random() < 0.6 ? '#fff8e0' : '#200800';
      tx.fillRect(x, y, len, 1 + (Math.random() < 0.3 ? 1 : 0));
    }
    tx.globalAlpha = 1;
    tx.globalCompositeOperation = 'source-over';

    const grsX  = TEX_W  * 0.30;
    const grsY  = TEX_H  * 0.655;
    const grsRx = TEX_W  * 0.054;
    const grsRy = TEX_H  * 0.036;

    const halo = tx.createRadialGradient(grsX, grsY, grsRx * 0.5, grsX, grsY, grsRx * 1.4);
    halo.addColorStop(0,   'rgba(180, 70, 25, 0)');
    halo.addColorStop(0.5, 'rgba(160, 55, 18, 0.25)');
    halo.addColorStop(1,   'rgba(140, 45, 15, 0)');
    tx.save();
    tx.translate(grsX, grsY);
    tx.scale(1, grsRy * 1.4 / (grsRx * 1.4));
    tx.beginPath();
    tx.arc(0, 0, grsRx * 1.4, 0, Math.PI * 2);
    tx.fillStyle = halo;
    tx.fill();
    tx.restore();

    const core = tx.createRadialGradient(grsX, grsY * (grsRx / grsRy), 0,
                                          grsX, grsY * (grsRx / grsRy), grsRx);
    core.addColorStop(0,   'rgba(210, 80, 30, 0.92)');
    core.addColorStop(0.45,'rgba(185, 58, 20, 0.85)');
    core.addColorStop(0.75,'rgba(155, 42, 14, 0.65)');
    core.addColorStop(1,   'rgba(130, 35, 10, 0)');
    tx.save();
    tx.translate(grsX, grsY);
    tx.scale(1, grsRy / grsRx);
    tx.beginPath();
    tx.arc(0, 0, grsRx, 0, Math.PI * 2);
    tx.fillStyle = core;
    tx.fill();
    tx.restore();

    tx.save();
    tx.translate(grsX, grsY);
    tx.scale(1, grsRy / grsRx);
    const eye = tx.createRadialGradient(0, 0, 0, 0, 0, grsRx * 0.28);
    eye.addColorStop(0, 'rgba(255, 230, 190, 0.5)');
    eye.addColorStop(1, 'rgba(255, 200, 150, 0)');
    tx.beginPath();
    tx.arc(0, 0, grsRx * 0.28, 0, Math.PI * 2);
    tx.fillStyle = eye;
    tx.fill();
    tx.restore();

    return tc;
  }

  function buildStars() {
    stars = Array.from({ length: 280 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.3 + Math.random() * 1.1,
      a: 0.2 + Math.random() * 0.8,
    }));
  }

  function render(ts) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#020306';
    ctx.fillRect(0, 0, W, H);

    stars.forEach(s => {
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(215,228,255,${s.a})`;
      ctx.fill();
    });

    const offset   = (ts / ROTATION_MS) % 1;
    const srcOffX  = offset * TEX_W;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();

    for (let dy = -R; dy <= R; dy++) {
      const sinP  = dy / R;
      const cosP  = Math.sqrt(Math.max(0, 1 - sinP * sinP));
      const phi   = Math.asin(sinP);
      const stripW = 2 * R * cosP;
      if (stripW < 1) continue;

      const srcY    = ((phi / Math.PI) + 0.5) * (TEX_H - 1);
      const y       = cy + dy;
      const x       = cx - stripW * 0.5;

      const seg1Src = srcOffX;
      const seg1Len = TEX_W - seg1Src;
      const seg1Px  = (seg1Len / TEX_W) * stripW;
      ctx.drawImage(tex, seg1Src, srcY, seg1Len, 1, x, y, seg1Px, 1);

      if (srcOffX > 0) {
        ctx.drawImage(tex, 0, srcY, srcOffX, 1, x + seg1Px, y, stripW - seg1Px, 1);
      }
    }

    ctx.restore();

    const limb = ctx.createRadialGradient(
      cx - R * 0.18, cy - R * 0.12, R * 0.25,
      cx, cy, R
    );
    limb.addColorStop(0.45, 'rgba(0,0,0,0)');
    limb.addColorStop(0.82, 'rgba(0,0,0,0.12)');
    limb.addColorStop(1.00, 'rgba(0,0,0,0.72)');
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = limb;
    ctx.fill();

    const hiGrad = ctx.createRadialGradient(
      cx - R * 0.28, cy - R * 0.22, 0,
      cx - R * 0.10, cy - R * 0.08, R * 0.85
    );
    hiGrad.addColorStop(0,    'rgba(255,240,210,0.10)');
    hiGrad.addColorStop(0.45, 'rgba(255,220,170,0.04)');
    hiGrad.addColorStop(1,    'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = hiGrad;
    ctx.fill();

    const glow = ctx.createRadialGradient(cx, cy, R * 0.93, cx, cy, R * 1.20);
    glow.addColorStop(0,    'rgba(180, 110, 45, 0.22)');
    glow.addColorStop(0.45, 'rgba(150,  85, 30, 0.10)');
    glow.addColorStop(1,    'rgba(100,  55, 20, 0)');
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.20, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    rafId = requestAnimationFrame(render);
  }

  function resize() {
    W  = canvas.width  = window.innerWidth;
    H  = canvas.height = window.innerHeight;
    R  = Math.min(W, H) * 0.40;
    cx = W * 0.5;
    cy = H * 0.5;
    buildStars();
  }

  tex = generateTexture();
  resize();

  let rsTimer;
  window.addEventListener('resize', () => {
    clearTimeout(rsTimer);
    rsTimer = setTimeout(() => {
      cancelAnimationFrame(rafId);
      resize();
      rafId = requestAnimationFrame(render);
    }, 120);
  });

  rafId = requestAnimationFrame(render);
})();
