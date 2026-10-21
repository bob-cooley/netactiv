// TEMP wiring for the photo sizing/effect test page. Entirely self-contained
// so it (and photo-ascii-wipe.js) can be deleted wholesale later along with
// their <script> tags in index.html.
(function () {
  var panel = document.querySelector('.panel[data-panel="photo-test"]');
  if (!panel) return;

  var img = document.getElementById('temp-size-test');
  var canvas2d = document.getElementById('photo-canvas-2d');
  if (!img || !canvas2d) return;

  var current = null;
  var loaded = img.complete && img.naturalWidth > 0;

  function mount() {
    if (current) { current.stop(); current = null; }
    if (!loaded || !window.PhotoAsciiWipe) return;
    current = window.PhotoAsciiWipe.create(canvas2d, img);
    current.start();
  }

  function onImgReady() {
    loaded = true;
    if (panel.classList.contains('is-active')) mount();
  }
  if (loaded) onImgReady(); else img.addEventListener('load', onImgReady);

  var mo = new MutationObserver(function () {
    if (panel.classList.contains('is-active')) {
      mount();
    } else if (current) {
      current.stop();
      current = null;
    }
  });
  mo.observe(panel, { attributes: true, attributeFilter: ['class'] });
})();
