// TEMP effect — WebGL displacement ripple reacting to the cursor. Raw WebGL,
// no library: a single textured quad with a fragment shader that displaces
// UVs outward from the pointer with a decaying sine ripple. Same factory
// pattern as the other photo/globe modules.
window.PhotoRipple = (function () {
  const VERT_SRC = `
    attribute vec2 aPos;
    varying vec2 vUv;
    void main() {
      vUv = aPos * 0.5 + 0.5;
      gl_Position = vec4(aPos, 0.0, 1.0);
    }
  `;
  const FRAG_SRC = `
    precision mediump float;
    varying vec2 vUv;
    uniform sampler2D uTex;
    uniform vec2 uMouse;
    uniform float uTime;
    uniform float uStrength;
    void main() {
      vec2 uv = vUv;
      vec2 toMouse = uv - uMouse;
      float dist = length(toMouse);
      float falloff = exp(-dist * 6.0);
      float ripple = sin(dist * 28.0 - uTime * 5.0) * 0.05 * falloff * uStrength;
      vec2 dir = dist > 0.0001 ? toMouse / dist : vec2(0.0);
      vec2 displaced = uv + dir * ripple;
      gl_FragColor = texture2D(uTex, displaced);
    }
  `;

  function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error('shader compile error:', gl.getShaderInfoLog(sh));
    }
    return sh;
  }

  function create(canvas, image) {
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    let rafId = null, running = false, startTS = 0;
    let mouseU = 0.5, mouseV = 0.5, strength = 0, targetStrength = 0;
    let program, posLoc, texUniform, mouseUniform, timeUniform, strengthUniform;
    let quadBuf, texture;

    if (!gl) {
      // No WebGL support — fall back to a plain static draw via 2D canvas.
      return {
        start: function () {
          const ctx = canvas.getContext('2d');
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        },
        stop: function () {},
      };
    }

    function setup() {
      const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
      const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
      program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      gl.useProgram(program);

      quadBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1, 1, -1, -1, 1,
        -1, 1, 1, -1, 1, 1,
      ]), gl.STATIC_DRAW);
      posLoc = gl.getAttribLocation(program, 'aPos');
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

      texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      texUniform = gl.getUniformLocation(program, 'uTex');
      mouseUniform = gl.getUniformLocation(program, 'uMouse');
      timeUniform = gl.getUniformLocation(program, 'uTime');
      strengthUniform = gl.getUniformLocation(program, 'uStrength');

      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    function render(ts) {
      if (!running) return;
      if (!startTS) startTS = ts;
      const t = (ts - startTS) / 1000;

      strength += (targetStrength - strength) * 0.08;

      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(texUniform, 0);
      gl.uniform2f(mouseUniform, mouseU, mouseV);
      gl.uniform1f(timeUniform, t);
      gl.uniform1f(strengthUniform, strength);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      rafId = requestAnimationFrame(render);
    }

    function onMove(e) {
      const rect = canvas.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      mouseU = (t.clientX - rect.left) / rect.width;
      mouseV = 1 - (t.clientY - rect.top) / rect.height;
      targetStrength = 1;
    }
    function onLeave() { targetStrength = 0; }

    function start() {
      if (running) return;
      running = true;
      setup();
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
