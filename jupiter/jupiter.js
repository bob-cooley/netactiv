(function () {
  const canvas = document.getElementById('jupiter-canvas');
  const ctx    = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  let W, H, cx, cy, R, rafId, stars = [];
  let tex;
  let sphereCanvas, sphereCtx;

  const ROTATION_MS = 30000;
  const TEX_W = 2048, TEX_H = 512;

  // ── Procedural Jupiter texture ─────────────────────────────────────────────
  function generateTexture() {
    const tc = document.createElement('canvas');
    tc.width = TEX_W; tc.height = TEX_H;
    const tx = tc.getContext('2d');
    tx.imageSmoothingEnabled = true;

    // Muted, photorealistic palette — cream zones, muted-brown belts
    const bands = [
      [0.00, 0.07, '#6a5038'],  // N polar — gray-brown
      [0.07, 0.05, '#b08e5c'],  // NNZ — tan
      [0.12, 0.07, '#7a4828'],  // NEB — main dark belt
      [0.19, 0.05, '#c8b478'],  // NTrZ — cream
      [0.24, 0.06, '#bca868'],  // EZn — warm light
      [0.30, 0.06, '#a07c50'],  // EB — equatorial band
      [0.36, 0.08, '#784e38'],  // SEB — south equatorial belt
      [0.44, 0.09, '#b8a268'],  // STrZ — south tropical zone
      [0.53, 0.06, '#6a4430'],  // STB — south temperate belt
      [0.59, 0.07, '#8e6c56'],  // SSTB
      [0.66, 0.07, '#745848'],  // S polar region
      [0.73, 0.27, '#584030'],  // SP — south polar cap
    ];

    bands.forEach(([y0, h, color]) => {
      tx.fillStyle = color;
      tx.fillRect(0, y0 * TEX_H, TEX_W, Math.ceil(h * TEX_H) + 2);
    });

    // Wide, turbulent blending between bands
    for (let i = 0; i < bands.length - 1; i++) {
      const [y0, h, c0] = bands[i];
      const [, , c1]    = bands[i + 1];
      const edgeY       = (y0 + h) * TEX_H;
      const amp         = 5 + Math.random() * 8;
      const freq1       = 4  + Math.random() * 5;
      const freq2       = 11 + Math.random() * 8;
      const phase1      = Math.random() * Math.PI * 2;
      const phase2      = Math.random() * Math.PI * 2;

      for (let x = 0; x < TEX_W; x += 2) {
        const wave = Math.sin(x / TEX_W * Math.PI * freq1 + phase1) * amp
                   + Math.sin(x / TEX_W * Math.PI * freq2 + phase2) * (amp * 0.35);
        const blend = 26; // wide transition (was 8)
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

    // Subtle cloud streaks
    tx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 160; i++) {
      const y   = Math.random() * TEX_H;
      const x   = Math.random() * TEX_W;
      const len = 60 + Math.random() * 360;
      tx.globalAlpha = 0.012 + Math.random() * 0.030;
      tx.fillStyle   = Math.random() < 0.65 ? '#fff0d0' : '#1a0500';
      tx.fillRect(x, y, len, 1 + (Math.random() < 0.28 ? 1 : 0));
    }
    tx.globalAlpha = 1;
    tx.globalCompositeOperation = 'source-over';

    // Great Red Spot
    const grsX  = TEX_W  * 0.30;
    const grsY  = TEX_H  * 0.625;
    const grsRx = TEX_W  * 0.050;
    const grsRy = TEX_H  * 0.034;

    tx.save();
    tx.translate(grsX, grsY);
    tx.scale(1, grsRy * 1.5 / (grsRx * 1.5));
    const halo = tx.createRadialGradient(0, 0, grsRx * 0.3, 0, 0, grsRx * 1.5);
    halo.addColorStop(0,   'rgba(160, 58, 20, 0)');
    halo.addColorStop(0.4, 'rgba(145, 50, 16, 0.18)');
    halo.addColorStop(1,   'rgba(125, 40, 12, 0)');
    tx.beginPath();
    tx.arc(0, 0, grsRx * 1.5, 0, Math.PI * 2);
    tx.fillStyle = halo;
    tx.fill();
    tx.restore();

    tx.save();
    tx.translate(grsX, grsY);
    tx.scale(1, grsRy / grsRx);
    const eye = tx.createRadialGradient(0, 0, 0, 0, 0, grsRx);
    eye.addColorStop(0,    'rgba(182, 62, 20, 0.58)');
    eye.addColorStop(0.5,  'rgba(158, 48, 15, 0.38)');
    eye.addColorStop(0.85, 'rgba(130, 36, 10, 0.14)');
    eye.addColorStop(1,    'rgba(110, 28,  8, 0)');
    tx.beginPath();
    tx.arc(0, 0, grsRx, 0, Math.PI * 2);
    tx.fillStyle = eye;
    tx.fill();
    tx.restore();

    // Soften: blend 50% of a gaussian-blurred copy into the texture
    const blurred = document.createElement('canvas');
    blurred.width = TEX_W; blurred.height = TEX_H;
    const bx = blurred.getContext('2d');
    bx.filter = 'blur(3px)';
    bx.drawImage(tc, 0, 0);
    bx.filter = 'none';
    tx.globalAlpha = 0.50;
    tx.drawImage(blurred, 0, 0);
    tx.globalAlpha = 1;

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

  function ensureSphereCanvas() {
    if (!sphereCanvas || sphereCanvas.width !== W || sphereCanvas.height !== H) {
      sphereCanvas = document.createElement('canvas');
      sphereCanvas.width  = W;
      sphereCanvas.height = H;
      sphereCtx = sphereCanvas.getContext('2d');
      sphereCtx.imageSmoothingEnabled = true;
      sphereCtx.imageSmoothingQuality = 'high';
    }
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

    const offset  = (ts / ROTATION_MS) % 1;
    const srcOffX = offset * TEX_W;

    // Draw strips to offscreen canvas, then composite with blur
    ensureSphereCanvas();
    sphereCtx.clearRect(0, 0, W, H);
    sphereCtx.save();
    sphereCtx.beginPath();
    sphereCtx.arc(cx, cy, R, 0, Math.PI * 2);
    sphereCtx.clip();

    for (let dy = -R; dy <= R; dy++) {
      const sinP   = dy / R;
      const cosP   = Math.sqrt(Math.max(0, 1 - sinP * sinP));
      const phi    = Math.asin(sinP);
      const stripW = 2 * R * cosP;
      if (stripW < 1) continue;

      const srcY   = ((phi / Math.PI) + 0.5) * (TEX_H - 1);
      const y      = cy + dy;
      const x      = cx - stripW * 0.5;

      const seg1Src = srcOffX;
      const seg1Len = TEX_W - seg1Src;
      const seg1Px  = (seg1Len / TEX_W) * stripW;
      sphereCtx.drawImage(tex, seg1Src, srcY, seg1Len, 1, x, y, seg1Px, 1);

      if (srcOffX > 0) {
        sphereCtx.drawImage(tex, 0, srcY, srcOffX, 1, x + seg1Px, y, stripW - seg1Px, 1);
      }
    }

    sphereCtx.restore();

    // Composite sphere with a gentle blur — smooths scanlines, gives gaseous feel
    ctx.filter = 'blur(1px)';
    ctx.drawImage(sphereCanvas, 0, 0);
    ctx.filter = 'none';

    // Overlays (sharp, drawn without blur)
    const limb = ctx.createRadialGradient(
      cx - R * 0.18, cy - R * 0.12, R * 0.25,
      cx, cy, R
    );
    limb.addColorStop(0.45, 'rgba(0,0,0,0)');
    limb.addColorStop(0.82, 'rgba(0,0,0,0.14)');
    limb.addColorStop(1.00, 'rgba(0,0,0,0.76)');
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = limb;
    ctx.fill();

    const hiGrad = ctx.createRadialGradient(
      cx - R * 0.28, cy - R * 0.22, 0,
      cx - R * 0.10, cy - R * 0.08, R * 0.85
    );
    hiGrad.addColorStop(0,    'rgba(255,240,210,0.09)');
    hiGrad.addColorStop(0.45, 'rgba(255,220,170,0.04)');
    hiGrad.addColorStop(1,    'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = hiGrad;
    ctx.fill();

    const glow = ctx.createRadialGradient(cx, cy, R * 0.93, cx, cy, R * 1.20);
    glow.addColorStop(0,    'rgba(155, 95, 38, 0.20)');
    glow.addColorStop(0.45, 'rgba(125, 75, 28, 0.09)');
    glow.addColorStop(1,    'rgba( 85, 52, 18, 0)');
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
    sphereCanvas = null; // force recreate on next frame
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
