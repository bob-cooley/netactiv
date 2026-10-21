// TEMP wiring for the photo-effect sizing test page. Entirely self-contained
// so it (and the photo-*.js effect files) can be deleted wholesale later
// along with their <script> tags in index.html.
(function () {
  var panel = document.querySelector('.panel[data-panel="photo-test"]');
  if (!panel) return;

  var img = document.getElementById('temp-size-test');
  var canvas2d = document.getElementById('photo-canvas-2d');
  var canvasGl = document.getElementById('photo-canvas-gl');
  var select = document.getElementById('photo-effect-select');
  if (!img || !canvas2d || !canvasGl || !select) return;

  var EFFECTS = {
    particle: { gl: false, factory: function () { return window.PhotoParticle; } },
    drag:     { gl: false, factory: function () { return window.PhotoDrag; } },
    ripple:   { gl: true,  factory: function () { return window.PhotoRipple; } },
    repel:    { gl: false, factory: function () { return window.PhotoRepel; } },
    glitch:   { gl: true,  factory: function () { return window.PhotoGlitch; } },
    halftone: { gl: false, factory: function () { return window.PhotoHalftone; } },
    ascii:    { gl: false, factory: function () { return window.PhotoAscii; } },
    'ascii-wipe': { gl: false, factory: function () { return window.PhotoAsciiWipe; } },
  };

  var current = null;
  var loaded = img.complete && img.naturalWidth > 0;

  function drawStatic() {
    var ctx = canvas2d.getContext('2d');
    ctx.clearRect(0, 0, canvas2d.width, canvas2d.height);
    ctx.drawImage(img, 0, 0, canvas2d.width, canvas2d.height);
  }

  function mount(which) {
    if (current) { current.stop(); current = null; }

    var entry = EFFECTS[which];
    canvas2d.hidden = !!(entry && entry.gl);
    canvasGl.hidden = !(entry && entry.gl);

    if (!loaded) return;

    if (!entry) { drawStatic(); return; }
    var factory = entry.factory();
    current = factory.create(entry.gl ? canvasGl : canvas2d, img);
    current.start();
  }

  function activeMount() { mount(select.value); }

  select.addEventListener('change', activeMount);

  function onImgReady() {
    loaded = true;
    if (panel.classList.contains('is-active')) activeMount();
    else drawStatic();
  }
  if (loaded) onImgReady(); else img.addEventListener('load', onImgReady);

  var mo = new MutationObserver(function () {
    if (panel.classList.contains('is-active')) {
      activeMount();
    } else if (current) {
      current.stop();
      current = null;
    }
  });
  mo.observe(panel, { attributes: true, attributeFilter: ['class'] });
})();
