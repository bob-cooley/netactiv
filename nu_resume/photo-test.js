// TEMP wiring for the photo-effect sizing test page. Entirely self-contained
// so it (and photo-particle.js / photo-drag.js / photo-ripple.js) can be
// deleted wholesale later along with its two <script> tags in index.html.
(function () {
  var panel = document.querySelector('.panel[data-panel="photo-test"]');
  if (!panel) return;

  var img = document.getElementById('temp-size-test');
  var canvas2d = document.getElementById('photo-canvas-2d');
  var canvasGl = document.getElementById('photo-canvas-gl');
  var select = document.getElementById('photo-effect-select');
  if (!img || !canvas2d || !canvasGl || !select) return;

  var GL_EFFECTS = { ripple: true };
  var current = null;
  var loaded = img.complete && img.naturalWidth > 0;

  function drawStatic() {
    var ctx = canvas2d.getContext('2d');
    ctx.clearRect(0, 0, canvas2d.width, canvas2d.height);
    ctx.drawImage(img, 0, 0, canvas2d.width, canvas2d.height);
  }

  function mount(which) {
    if (current) { current.stop(); current = null; }

    var useGl = !!GL_EFFECTS[which];
    canvas2d.hidden = useGl;
    canvasGl.hidden = !useGl;

    if (!loaded) return;

    if (which === 'particle') {
      current = window.PhotoParticle.create(canvas2d, img);
      current.start();
    } else if (which === 'drag') {
      current = window.PhotoDrag.create(canvas2d, img);
      current.start();
    } else if (which === 'ripple') {
      current = window.PhotoRipple.create(canvasGl, img);
      current.start();
    } else {
      drawStatic();
    }
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
