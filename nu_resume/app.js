(function () {
  var GLOBE_KEY = 'nu_resume_globe';
  var canvas = document.getElementById('globe-canvas');
  var hero = document.getElementById('hero');
  var current = null;
  var currentGlobeId = null;

  // Keep --header-h in sync with the header's real rendered height (it can
  // wrap to two rows on narrow viewports), so panel/page top padding never
  // guesses wrong and hides content behind the header.
  var siteHeader = document.querySelector('.site-header');
  function syncHeaderHeight() {
    document.documentElement.style.setProperty('--header-h', siteHeader.offsetHeight + 'px');
  }
  syncHeaderHeight();
  if (window.ResizeObserver) {
    new ResizeObserver(syncHeaderHeight).observe(siteHeader);
  } else {
    window.addEventListener('resize', syncHeaderHeight);
  }

  function mountGlobe(which) {
    if (which === currentGlobeId) return;
    if (current) current.stop();
    var factory = which === 'b' ? window.GlobeB : window.GlobeA;
    current = factory.create(canvas);
    current.start();
    currentGlobeId = which;

    document.querySelectorAll('.globe-toggle-btn').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.dataset.globe === which);
    });

    try { localStorage.setItem(GLOBE_KEY, which); } catch (e) {}
  }

  var storedGlobe = 'a';
  try { storedGlobe = localStorage.getItem(GLOBE_KEY) || 'a'; } catch (e) {}
  mountGlobe(storedGlobe === 'b' ? 'b' : 'a');

  document.querySelectorAll('.globe-toggle-btn').forEach(function (btn) {
    btn.addEventListener('click', function () { mountGlobe(btn.dataset.globe); });
  });

  // ---------- View / panel routing ----------

  var panels = document.querySelectorAll('.panel');
  var navButtons = document.querySelectorAll('[data-view]');
  var viewSelect = document.getElementById('view-select');
  var currentView = 'home';

  function setView(view) {
    if (view === currentView) return;
    currentView = view;

    hero.classList.toggle('is-receded', view !== 'home');

    panels.forEach(function (panel) {
      var isActive = panel.dataset.panel === view;
      panel.classList.toggle('is-active', isActive);
      if (isActive) {
        var grid = panel.querySelector('.metric-grid');
        if (grid) {
          grid.classList.remove('replay');
          void grid.offsetWidth;
          grid.classList.add('replay');
        }
      }
    });

    navButtons.forEach(function (btn) {
      btn.classList.toggle('is-active', btn.dataset.view === view);
    });

    if (viewSelect.value !== view) viewSelect.value = view;
  }

  navButtons.forEach(function (btn) {
    btn.addEventListener('click', function () { setView(btn.dataset.view); });
  });

  viewSelect.addEventListener('change', function () { setView(viewSelect.value); });

  // ---------- Settings gear ----------

  var gearBtn = document.getElementById('gear-btn');
  var settingsPanel = document.getElementById('settings-panel');

  function closeSettings() {
    settingsPanel.hidden = true;
    gearBtn.setAttribute('aria-expanded', 'false');
  }
  function toggleSettings() {
    var willOpen = settingsPanel.hidden;
    settingsPanel.hidden = !willOpen;
    gearBtn.setAttribute('aria-expanded', String(willOpen));
  }

  gearBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    toggleSettings();
  });
  settingsPanel.addEventListener('click', function (e) { e.stopPropagation(); });

  // ---------- Resume download dropdown ----------

  var downloadBtn = document.getElementById('download-btn');
  var downloadMenu = document.getElementById('download-menu');

  function closeDownloadMenu() {
    if (!downloadBtn) return;
    downloadMenu.hidden = true;
    downloadBtn.setAttribute('aria-expanded', 'false');
  }
  function toggleDownloadMenu() {
    var willOpen = downloadMenu.hidden;
    downloadMenu.hidden = !willOpen;
    downloadBtn.setAttribute('aria-expanded', String(willOpen));
  }

  if (downloadBtn) {
    downloadBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleDownloadMenu();
    });
    downloadMenu.addEventListener('click', function (e) { e.stopPropagation(); });
  }

  document.addEventListener('click', function () {
    if (!settingsPanel.hidden) closeSettings();
    if (downloadBtn && !downloadMenu.hidden) closeDownloadMenu();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeSettings();
      closeDownloadMenu();
    }
  });

  // ---------- Dev: reload & clear cache ----------

  document.getElementById('reload-cache-btn').addEventListener('click', function () {
    try { localStorage.clear(); } catch (e) {}
    location.reload();
  });
})();
