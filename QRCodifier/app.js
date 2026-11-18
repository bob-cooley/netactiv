(() => {
  'use strict';

  const csrf = document.querySelector('meta[name="csrf-token"]').content;
  const $ = (id) => document.getElementById(id);

  const QUIET = 4;          // quiet zone in modules (QR spec minimum)
  const PNG_TARGET = 4096;  // max PNG edge in px
  const EC_LEVEL = 'M';

  const state = {
    items: [],
    selectedId: null,
    checkSeq: 0,
    lastCheck: null, // { url, check }
  };

  // ------------------------------------------------------------------
  // API
  // ------------------------------------------------------------------

  async function api(action, data = {}) {
    const res = await fetch('api.php', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify(Object.assign({ action }, data)),
    });
    if (res.status === 401) {
      location.reload();
      throw new Error('Signed out');
    }
    let json;
    try { json = await res.json(); } catch (e) { throw new Error('Server error (' + res.status + ')'); }
    if (!res.ok || json.error) {
      const err = new Error(json.error || 'Request failed');
      err.payload = json;
      throw err;
    }
    return json;
  }

  // ------------------------------------------------------------------
  // QR rendering
  // ------------------------------------------------------------------

  function buildQr(text) {
    qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    const qr = qrcode(0, EC_LEVEL);
    qr.addData(text, 'Byte');
    qr.make();
    return qr;
  }

  function qrSvg(qr) {
    const n = qr.getModuleCount();
    const total = n + QUIET * 2;
    let d = '';
    for (let r = 0; r < n; r++) {
      let c = 0;
      while (c < n) {
        if (qr.isDark(r, c)) {
          const start = c;
          while (c < n && qr.isDark(r, c)) c++;
          const w = c - start;
          d += 'M' + (start + QUIET) + ' ' + (r + QUIET) + 'h' + w + 'v1h-' + w + 'z';
        } else {
          c++;
        }
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + ' ' + total +
      '" shape-rendering="crispEdges"><rect width="' + total + '" height="' + total +
      '" fill="#ffffff"/><path d="' + d + '" fill="#000000"/></svg>';
  }

  function qrCanvas(qr) {
    const n = qr.getModuleCount();
    const total = n + QUIET * 2;
    const cell = Math.max(1, Math.floor(PNG_TARGET / total)); // whole pixels per module = crisp edges
    const size = cell * total;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000000';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) ctx.fillRect((c + QUIET) * cell, (r + QUIET) * cell, cell, cell);
      }
    }
    return canvas;
  }

  function fileBase(item) {
    let host = 'qr';
    try { host = new URL(item.url).hostname.replace(/^www\./, ''); } catch (e) { /* keep default */ }
    const slug = (item.label || host).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    return 'qr-' + (slug || 'code');
  }

  function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function downloadPng(item) {
    const canvas = qrCanvas(buildQr(item.url));
    canvas.toBlob((blob) => {
      if (blob) saveBlob(blob, fileBase(item) + '.png');
    }, 'image/png');
  }

  function downloadSvg(item) {
    const svg = '<?xml version="1.0" encoding="UTF-8"?>\n' + qrSvg(buildQr(item.url));
    saveBlob(new Blob([svg], { type: 'image/svg+xml' }), fileBase(item) + '.svg');
  }

  // ------------------------------------------------------------------
  // Status dots
  // ------------------------------------------------------------------

  const STATE_LABEL = { idle: 'Not checked', checking: 'Checking', ok: 'Live', warn: 'Reachable, blocks checks', bad: 'Not reachable' };

  function setDot(el, s) {
    el.dataset.state = s;
    el.setAttribute('aria-label', STATE_LABEL[s] || s);
    el.title = STATE_LABEL[s] || s;
  }

  function ago(ts) {
    if (!ts) return '';
    const s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    if (s < 86400 * 30) return Math.floor(s / 86400) + ' d ago';
    return new Date(ts * 1000).toLocaleDateString();
  }

  // ------------------------------------------------------------------
  // Live URL check while typing
  // ------------------------------------------------------------------

  const urlInput = $('url');
  const urlDot = $('url-dot');
  const urlMsg = $('url-msg');
  let debounce = null;

  function setUrlMsg(text, kind) {
    urlMsg.textContent = text || '';
    urlMsg.dataset.kind = kind || '';
  }

  async function runCheck() {
    const raw = urlInput.value.trim();
    if (!raw) {
      setDot(urlDot, 'idle');
      setUrlMsg('');
      state.lastCheck = null;
      return null;
    }
    const seq = ++state.checkSeq;
    setDot(urlDot, 'checking');
    setUrlMsg('Checking...');
    try {
      const res = await api('check', { url: raw });
      if (seq !== state.checkSeq) return null;
      state.lastCheck = res;
      setDot(urlDot, res.check.state);
      setUrlMsg(res.check.message, res.check.state);
      return res;
    } catch (e) {
      if (seq !== state.checkSeq) return null;
      state.lastCheck = null;
      setDot(urlDot, 'bad');
      setUrlMsg(e.message, 'bad');
      return null;
    }
  }

  urlInput.addEventListener('input', () => {
    clearTimeout(debounce);
    state.checkSeq++; // invalidate any in-flight check
    setDot(urlDot, 'idle');
    setUrlMsg('');
    if (urlInput.value.trim()) debounce = setTimeout(runCheck, 800);
  });

  urlInput.addEventListener('blur', () => {
    if (urlInput.value.trim() && urlDot.dataset.state === 'idle') {
      clearTimeout(debounce);
      runCheck();
    }
  });

  // ------------------------------------------------------------------
  // Generate
  // ------------------------------------------------------------------

  const genBtn = $('generate');

  $('create-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    clearTimeout(debounce);
    const raw = urlInput.value.trim();
    if (!raw) {
      urlInput.focus();
      return;
    }
    genBtn.disabled = true;
    genBtn.textContent = 'Checking...';
    setDot(urlDot, 'checking');
    setUrlMsg('Checking...');
    state.checkSeq++;
    try {
      const res = await api('save', { url: raw, label: $('label').value.trim() });
      const item = res.item;
      setDot(urlDot, item.check.state);
      setUrlMsg(item.check.message, item.check.state);
      upsert(item, true);
      select(item.id, true);
      urlInput.value = '';
      $('label').value = '';
      setDot(urlDot, 'idle');
      setUrlMsg('');
    } catch (e) {
      setDot(urlDot, 'bad');
      setUrlMsg(e.message, 'bad');
    } finally {
      genBtn.disabled = false;
      genBtn.textContent = 'Generate';
    }
  });

  // ------------------------------------------------------------------
  // Preview
  // ------------------------------------------------------------------

  function renderPreview() {
    const item = state.items.find((i) => i.id === state.selectedId);
    const box = $('preview');
    if (!item) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const qr = buildQr(item.url);
    $('preview-qr').innerHTML = qrSvg(qr);
    $('preview-label').textContent = item.label || '';
    $('preview-label').hidden = !item.label;
    const link = $('preview-url');
    link.textContent = item.url;
    link.href = item.url;
    setDot($('preview-dot'), item.check ? item.check.state : 'idle');
    const st = $('preview-status');
    st.textContent = item.check ? item.check.message + ' - checked ' + ago(item.check.checked_at) : '';
    st.dataset.kind = item.check ? item.check.state : '';

    const n = qr.getModuleCount();
    const total = n + QUIET * 2;
    const px = Math.floor(PNG_TARGET / total) * total;
    $('preview-spec').textContent =
      'PNG ' + px + ' x ' + px + ' px (' + Math.round(px / 2) + ' ppi at 2 in) - SVG vector - ' +
      n + ' x ' + n + ' modules, error correction ' + EC_LEVEL;
  }

  $('dl-png').addEventListener('click', () => {
    const item = state.items.find((i) => i.id === state.selectedId);
    if (item) downloadPng(item);
  });
  $('dl-svg').addEventListener('click', () => {
    const item = state.items.find((i) => i.id === state.selectedId);
    if (item) downloadSvg(item);
  });

  function select(id, scroll) {
    state.selectedId = id;
    renderPreview();
    renderGrid();
    if (scroll && window.matchMedia('(max-width: 860px)').matches) {
      $('preview').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // ------------------------------------------------------------------
  // Gallery
  // ------------------------------------------------------------------

  const grid = $('grid');
  const search = $('search');

  function upsert(item, toFront) {
    const i = state.items.findIndex((x) => x.id === item.id);
    if (i >= 0) state.items.splice(i, 1);
    if (toFront || i < 0) state.items.unshift(item);
    else state.items.splice(i, 0, item);
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return url; }
  }

  function renderGrid() {
    const q = search.value.trim().toLowerCase();
    const list = q
      ? state.items.filter((i) => (i.url + ' ' + (i.label || '')).toLowerCase().includes(q))
      : state.items;

    $('count').textContent = state.items.length ? String(state.items.length) : '';
    $('empty').hidden = state.items.length > 0;
    grid.textContent = '';

    for (const item of list) {
      const li = el('li', 'card' + (item.id === state.selectedId ? ' selected' : ''));
      li.tabIndex = 0;
      li.setAttribute('role', 'button');
      li.setAttribute('aria-label', 'Select ' + (item.label || item.url));
      li.addEventListener('click', (ev) => {
        if (ev.target.closest('.card-actions')) return;
        select(item.id, true);
      });
      li.addEventListener('keydown', (ev) => {
        if ((ev.key === 'Enter' || ev.key === ' ') && ev.target === li) {
          ev.preventDefault();
          select(item.id, true);
        }
      });

      const thumb = el('div', 'thumb');
      thumb.innerHTML = qrSvg(buildQr(item.url));
      li.appendChild(thumb);

      const body = el('div', 'card-body');
      const title = el('p', 'card-title');
      const dot = el('span', 'dot');
      setDot(dot, item.check ? item.check.state : 'idle');
      title.appendChild(dot);
      title.appendChild(el('span', 'card-name', item.label || hostOf(item.url)));
      body.appendChild(title);
      body.appendChild(el('p', 'card-url', item.url));
      body.appendChild(el('p', 'card-meta',
        (item.check ? (item.check.code || '-') + ' - checked ' + ago(item.check.checked_at) : 'not checked')));

      const actions = el('div', 'card-actions');
      const png = el('button', 'mini', 'PNG');
      png.type = 'button';
      png.title = 'Download PNG';
      png.addEventListener('click', () => downloadPng(item));
      const svg = el('button', 'mini', 'SVG');
      svg.type = 'button';
      svg.title = 'Download SVG';
      svg.addEventListener('click', () => downloadSvg(item));
      const re = el('button', 'mini', 'Recheck');
      re.type = 'button';
      re.addEventListener('click', () => recheck(item, re, dot));
      const del = el('button', 'mini danger', 'Delete');
      del.type = 'button';
      del.addEventListener('click', () => remove(item));
      actions.append(png, svg, re, del);
      body.appendChild(actions);

      li.appendChild(body);
      grid.appendChild(li);
    }
  }

  async function recheck(item, btn, dot) {
    btn.disabled = true;
    setDot(dot, 'checking');
    try {
      const res = await api('recheck', { id: item.id });
      upsert(res.item, false);
    } catch (e) {
      alert(e.message);
    } finally {
      renderGrid();
      if (state.selectedId === item.id) renderPreview();
    }
  }

  async function remove(item) {
    if (!confirm('Delete "' + (item.label || item.url) + '" from the gallery?')) return;
    try {
      await api('delete', { id: item.id });
      state.items = state.items.filter((i) => i.id !== item.id);
      if (state.selectedId === item.id) state.selectedId = null;
      renderGrid();
      renderPreview();
    } catch (e) {
      alert(e.message);
    }
  }

  search.addEventListener('input', renderGrid);

  // ------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------

  (async () => {
    try {
      const res = await api('list');
      state.items = res.items || [];
    } catch (e) {
      $('empty').hidden = false;
      $('empty').textContent = 'Could not load gallery: ' + e.message;
      return;
    }
    if (state.items.length) state.selectedId = state.items[0].id;
    renderGrid();
    renderPreview();
  })();
})();
