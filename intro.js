(function () {
  function run() {
    const W = window.innerWidth;
    const H = window.innerHeight;

    const logoEl   = document.querySelector('.logo');
    const navEl    = document.querySelector('.site-nav');
    const footerEl = document.getElementById('site-footer');

    // Pre-hide elements; intro will reveal them
    [logoEl, navEl, footerEl].forEach(el => {
      if (el) { el.style.opacity = '0'; el.style.transition = 'opacity 0.35s ease'; }
    });

    // Overlay canvas
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    cv.style.cssText = 'position:fixed;inset:0;z-index:100;pointer-events:none;';
    document.body.appendChild(cv);
    const ctx = cv.getContext('2d');

    // Bounding rects (layout unaffected by opacity:0)
    const lr = logoEl   ? logoEl.getBoundingClientRect()   : null;
    const nr = navEl    ? navEl.getBoundingClientRect()    : null;
    const fr = footerEl ? footerEl.getBoundingClientRect() : null;

    // Globe geometry (mirrors setSize in home-globe.js)
    const gR  = H * 0.148;
    const gcx = W - gR - 75;
    const gcy = H - gR - 75;

    // Vertical midpoints
    const LMY = lr ? lr.top  + lr.height  * 0.5 : 76;
    const NMY = nr ? nr.top  + nr.height  * 0.5 : 61;
    const FMY = fr ? fr.top  + fr.height  * 0.5 : H - 100;

    // ── Waypoints ───────────────────────────────────────────────────────────────
    // Index map (for reveal triggers):
    //   0        : off-screen entry
    //   1        : logo left
    //   2        : logo mid (slight arc)
    //   3        : logo right          → reveal .logo
    //   4        : bridge mid
    //   5        : nav left            → reveal .site-nav
    //   6,7      : nav mid, nav right
    //   8,9      : transition to globe
    //   10..10+N : globe arc (N+1 points)
    //   10+N+1   : exit globe
    //   10+N+2   : bridge to footer
    //   10+N+3   : footer right        → reveal footer
    //   10+N+4   : footer left
    //   10+N+5   : exit off-screen

    const pts = [];

    // Entry
    pts.push([-12, LMY]);

    // Logo sweep
    pts.push([lr ? lr.left + lr.width * 0.12 : 90,  LMY]);
    pts.push([lr ? lr.left + lr.width * 0.55 : 300, lr ? lr.top + lr.height * 0.3 : LMY - 10]);
    pts.push([lr ? lr.right : 540,                   LMY]);                         // idx 3

    // Bridge to nav
    const bx = lr && nr ? lr.right + (nr.left - lr.right) * 0.5 : W * 0.6;
    pts.push([bx, NMY - 4]);

    // Nav sweep
    pts.push([nr ? nr.left               : W * 0.65, NMY]);                         // idx 5
    pts.push([nr ? nr.left + nr.width * 0.45 : W * 0.82, NMY]);
    pts.push([nr ? nr.right              : W - 75,   NMY]);

    // Transition down toward globe
    pts.push([W * 0.93, H * 0.30]);
    pts.push([gcx + Math.cos(-1.2) * gR, gcy + Math.sin(-1.2) * gR]);

    // Globe arc: ~330° starting just past top-right, going clockwise
    const ARC_N    = 36;
    const ARC_IDX0 = pts.length; // = 10
    const startA   = -Math.PI * 0.6;
    for (let i = 0; i <= ARC_N; i++) {
      const a = startA + (i / ARC_N) * (Math.PI * 1.83);
      pts.push([gcx + Math.cos(a) * gR * 1.03, gcy + Math.sin(a) * gR * 1.03]);
    }

    // Exit globe toward footer
    pts.push([gcx - gR * 0.4, gcy + gR * 1.15]);
    pts.push([fr ? fr.right + 30 : 280, FMY]);

    const FOOTER_IDX = pts.length;
    pts.push([fr ? fr.right : 260, FMY]);                                           // footer entry
    pts.push([fr ? fr.left  :  75, FMY]);
    pts.push([-12, FMY]);

    // ── Arc-length parameterization ──────────────────────────────────────────────
    const cumLen = [0];
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i][0] - pts[i-1][0];
      const dy = pts[i][1] - pts[i-1][1];
      cumLen.push(cumLen[i-1] + Math.sqrt(dx*dx + dy*dy));
    }
    const totalLen = cumLen[cumLen.length - 1];

    function posAtFrac(f) {
      const target = f * totalLen;
      let i = 1;
      while (i < cumLen.length - 1 && cumLen[i] < target) i++;
      const t = (target - cumLen[i-1]) / (cumLen[i] - cumLen[i-1] || 1);
      return [
        pts[i-1][0] + t * (pts[i][0] - pts[i-1][0]),
        pts[i-1][1] + t * (pts[i][1] - pts[i-1][1]),
      ];
    }

    // Reveal triggers: fraction of path at which each element fades in
    const reveals = [
      { frac: cumLen[1]          / totalLen, el: logoEl   },
      { frac: cumLen[5]          / totalLen, el: navEl    },
      { frac: cumLen[FOOTER_IDX] / totalLen, el: footerEl },
    ];

    // ── Animation ───────────────────────────────────────────────────────────────
    const DURATION  = 2500;
    const TRAIL_LEN = 22;
    const trail     = [];
    const triggered = new Set();
    let t0 = null;

    function frame(ts) {
      if (!t0) t0 = ts;
      const raw = Math.min((ts - t0) / DURATION, 1);

      // Ease: strong cubic in, linear middle, light ease out
      const e = raw < 0.08
        ? raw / 0.08 * 0.08                          // quick ease-in over first 8%
        : raw;

      const [x, y] = posAtFrac(Math.min(e, 1));
      trail.push([x, y]);
      if (trail.length > TRAIL_LEN) trail.shift();

      ctx.clearRect(0, 0, W, H);

      // Trail — phosphor decay
      for (let i = 0; i < trail.length; i++) {
        const a = (i / trail.length);
        ctx.beginPath();
        ctx.arc(trail[i][0], trail[i][1], 1.2 + a * 1.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${a * 0.45})`;
        ctx.fill();
      }

      // Outer glow
      ctx.save();
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur  = 16;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fill();
      ctx.restore();

      // Bright core
      ctx.save();
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur  = 6;
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();

      // Reveal elements
      reveals.forEach(r => {
        if (!triggered.has(r) && r.el && e >= r.frac) {
          triggered.add(r);
          r.el.style.opacity = '1';
        }
      });

      if (raw < 1) {
        requestAnimationFrame(frame);
      } else {
        // Ensure everything is visible
        [logoEl, navEl, footerEl].forEach(el => { if (el) el.style.opacity = '1'; });
        // Fade out overlay
        cv.style.transition = 'opacity 0.45s ease';
        cv.style.opacity    = '0';
        setTimeout(() => { if (cv.parentNode) cv.remove(); }, 550);
      }
    }

    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
