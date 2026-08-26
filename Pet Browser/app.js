(() => {
  "use strict";

  const sheet = new Image();
  sheet.src = "neko-sprite.webp";

  const canvas = document.querySelector("#pet");
  const ctx = canvas.getContext("2d", { alpha: true });
  const loading = document.querySelector("#loading");
  const sizeInput = document.querySelector("#size");
  const fullscreenButton = document.querySelector("#fullscreen");

  // The original art is irregularly spaced. These cells isolate each authored
  // pose; every cell is then alpha-scanned below so the visible cat, not the
  // nominal cell, determines its crop and scale.
  const rows = [
    { name: "idle",    y0: 0,    y1: 151,  centers: [72, 199, 329, 471, 596, 713] },
    { name: "walk",    y0: 151,  y1: 278,  centers: [75, 217, 360, 509, 661, 814, 948] },
    { name: "run",     y0: 278,  y1: 418,  centers: [75, 217, 364, 510, 660, 809, 952] },
    { name: "sleep",   y0: 418,  y1: 540,  centers: [84, 223, 353, 493] },
    { name: "curious", y0: 540,  y1: 676,  centers: [63, 196, 335, 464, 602] },
    { name: "happy",   y0: 676,  y1: 826,  centers: [79, 226, 348, 487, 614, 738, 864, 975] },
    { name: "play",    y0: 826,  y1: 968,  centers: [77, 200, 341, 497, 634, 758] },
    { name: "pounce",  y0: 968,  y1: 1115, centers: [70, 222, 373, 516, 648] },
    { name: "pounce",  y0: 1115, y1: 1236, centers: [89, 262, 442, 620, 796, 936] },
    { name: "look",    y0: 1236, y1: 1372, centers: [64, 188, 306, 451, 577, 695, 839, 960] },
    { name: "look",    y0: 1372, y1: 1531, centers: [62, 181, 305, 445, 569, 706, 844, 961] }
  ];

  const actions = {};
  let active = "idle";
  let frameIndex = 0;
  let lastFrameAt = 0;
  let cssWidth = 0;
  let cssHeight = 0;
  let displayScale = Number(sizeInput.value) / 100;
  let bob = 0;

  function makeCells(row) {
    return row.centers.map((center, index) => {
      const left = index === 0 ? 0 : Math.floor((row.centers[index - 1] + center) / 2);
      const right = index === row.centers.length - 1
        ? sheet.naturalWidth
        : Math.floor((center + row.centers[index + 1]) / 2);
      return { x: left, y: row.y0, width: right - left, height: row.y1 - row.y0 };
    });
  }

  function detectVisibleBounds(cell) {
    const work = document.createElement("canvas");
    work.width = cell.width;
    work.height = cell.height;
    const workCtx = work.getContext("2d", { willReadFrequently: true });
    workCtx.drawImage(sheet, cell.x, cell.y, cell.width, cell.height, 0, 0, cell.width, cell.height);
    const pixels = workCtx.getImageData(0, 0, cell.width, cell.height).data;
    let minX = cell.width, minY = cell.height, maxX = -1, maxY = -1;

    for (let y = 0; y < cell.height; y += 1) {
      for (let x = 0; x < cell.width; x += 1) {
        if (pixels[(y * cell.width + x) * 4 + 3] > 20) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    if (maxX < minX || maxY < minY) return null;
    const safety = 5;
    minX = Math.max(0, minX - safety);
    minY = Math.max(0, minY - safety);
    maxX = Math.min(cell.width - 1, maxX + safety);
    maxY = Math.min(cell.height - 1, maxY + safety);

    return {
      x: cell.x + minX,
      y: cell.y + minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1
    };
  }

  function prepareFrames() {
    rows.forEach((row) => {
      const detected = makeCells(row).map(detectVisibleBounds).filter(Boolean);
      actions[row.name] = [...(actions[row.name] || []), ...detected];
    });
  }

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    cssWidth = window.innerWidth;
    cssHeight = window.innerHeight;
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function draw(now) {
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    const frames = actions[active];
    if (!frames?.length) {
      requestAnimationFrame(draw);
      return;
    }

    const interval = active === "run" ? 92 : active === "walk" ? 138 : active === "sleep" ? 560 : 230;
    if (now - lastFrameAt > interval) {
      frameIndex = (frameIndex + 1) % frames.length;
      lastFrameAt = now;
    }

    const frame = frames[frameIndex];
    const controlReserve = cssWidth < 680 ? 88 : 105;
    const availableHeight = Math.max(160, cssHeight - controlReserve - 26);
    const availableWidth = Math.max(180, cssWidth - 32);

    // FULL means fill the usable stage. Each frame gets its own fit calculation,
    // so wide, tall, and effect-heavy poses stay completely inside the interface.
    const scale = Math.min(availableWidth / frame.width, availableHeight / frame.height) * displayScale;
    const drawWidth = frame.width * scale;
    const drawHeight = frame.height * scale;
    const centerY = (cssHeight - controlReserve) * 0.52;
    const motion = active === "run" || active === "walk" ? Math.sin(now / 115) * 4 : Math.sin(now / 680) * 2;
    bob += (motion - bob) * 0.08;
    const x = (cssWidth - drawWidth) / 2;
    const y = centerY - drawHeight / 2 + bob;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(sheet, frame.x, frame.y, frame.width, frame.height, x, y, drawWidth, drawHeight);
    requestAnimationFrame(draw);
  }

  function setAction(name) {
    if (!actions[name]?.length) return;
    active = name;
    frameIndex = 0;
    lastFrameAt = 0;
    document.querySelectorAll("[data-action]").forEach((button) => {
      button.classList.toggle("active", button.dataset.action === name);
    });
  }

  sheet.addEventListener("load", () => {
    prepareFrames();
    resize();
    loading.classList.add("hidden");
    requestAnimationFrame(draw);
  });

  sheet.addEventListener("error", () => {
    loading.textContent = "Neko could not load.";
  });

  window.addEventListener("resize", resize);
  sizeInput.addEventListener("input", () => { displayScale = Number(sizeInput.value) / 100; });
  document.querySelector(".actions").addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (button) setAction(button.dataset.action);
  });

  canvas.addEventListener("click", () => setAction(active === "happy" ? "idle" : "happy"));

  fullscreenButton.addEventListener("click", async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch (_) {
      // The app still fills the browser viewport when fullscreen is unavailable.
    }
  });

  document.addEventListener("fullscreenchange", () => {
    fullscreenButton.setAttribute("aria-label", document.fullscreenElement ? "Exit fullscreen" : "Enter fullscreen");
  });
})();
