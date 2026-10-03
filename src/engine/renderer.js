// WebGL2 renderer: low-res scene target -> nearest-neighbour upscale.
// Passes: sky, static world mesh, dynamic world geometry (doors, platforms),
// billboards (cutout, then additive/alpha), first-person weapon, post FX.

import * as S from './shaders.js';
import { perspective, lookAt, multiply, invert } from './mat4.js';

const SPRITE_FLOATS = 3 + 2 + 4 + 4 + 4 + 4 + 4; // 25 floats per instance

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    console.error(src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n'));
    throw new Error('Shader compile failed: ' + log);
  }
  return sh;
}

function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link failed: ' + gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    const name = info.name.replace(/\[0\]$/, '');
    u[name] = gl.getUniformLocation(p, info.name);
  }
  return { p, u };
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL2 is not available on this device/browser.');
    this.gl = gl;
    this.maxLayers = gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS);
    this.progWorld = program(gl, S.worldVS, S.worldFS);
    this.progSky = program(gl, S.skyVS, S.skyFS);
    this.progSprite = program(gl, S.spriteVS, S.spriteFS);
    this.progQuad = program(gl, S.quadVS, S.quadFS);
    this.progPost = program(gl, S.postVS, S.postFS);

    this.view = new Float32Array(16);
    this.proj = new Float32Array(16);
    this.viewProj = new Float32Array(16);
    this.invViewProj = new Float32Array(16);
    this.lightPos = new Float32Array(S.MAX_LIGHTS * 4);
    this.lightCol = new Float32Array(S.MAX_LIGHTS * 4);
    this.lightCount = 0;
    this.time = 0;
    this.camRight = [1, 0, 0];
    this.camUp = [0, 1, 0];
    this.camPos = [0, 0, 0];
    this.env = null;

    this.emptyVAO = gl.createVertexArray();
    this._initQuad();
    this._initSprites();
    this.worldMesh = null;
    this.dynamicMesh = this._createMeshBuffers(true);
    this.lowW = 320; this.lowH = 200;
    this.fbo = null;
    this.whiteTex = this.createTextureFromPixels(1, 1, new Uint8Array([255, 255, 255, 255]));
    this.wallArray = null;
  }

  // ------------------------------------------------------------------ setup
  _initQuad() {
    const gl = this.gl;
    this.quadVAO = gl.createVertexArray();
    gl.bindVertexArray(this.quadVAO);
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  _initSprites() {
    const gl = this.gl;
    this.spriteVAO = gl.createVertexArray();
    gl.bindVertexArray(this.spriteVAO);
    const cb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, 0, 0.5, 0, -0.5, 1, 0.5, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.spriteInstBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteInstBuf);
    this.spriteCap = 4096;
    this.spriteData = new Float32Array(this.spriteCap * SPRITE_FLOATS);
    gl.bufferData(gl.ARRAY_BUFFER, this.spriteData.byteLength, gl.DYNAMIC_DRAW);
    const stride = SPRITE_FLOATS * 4;
    const layout = [[1, 3], [2, 2], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4]];
    let off = 0;
    for (const [loc, size] of layout) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, off);
      gl.vertexAttribDivisor(loc, 1);
      off += size * 4;
    }
    gl.bindVertexArray(null);
  }

  _createMeshBuffers(dynamic) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    const ibo = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    const stride = 12 * 4; // pos3 uv2 normal3 info4
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 20);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, stride, 32);
    gl.bindVertexArray(null);
    return { vao, vbo, ibo, count: 0, dynamic };
  }

  // Upload mesh built by MeshBuilder (Float32Array verts, Uint32Array indices)
  setWorldMesh(verts, indices) {
    const gl = this.gl;
    if (!this.worldMesh) this.worldMesh = this._createMeshBuffers(false);
    const m = this.worldMesh;
    gl.bindVertexArray(m.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    m.count = indices.length;
  }

  setDynamicMesh(verts, indices, count) {
    const gl = this.gl;
    const m = this.dynamicMesh;
    gl.bindVertexArray(m.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STREAM_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STREAM_DRAW);
    gl.bindVertexArray(null);
    m.count = count;
  }

  // Build the wall/floor texture array from a list of 64x64 canvases/images.
  setWallTextures(sources, size = 64) {
    const gl = this.gl;
    if (this.wallArray) gl.deleteTexture(this.wallArray);
    const n = Math.max(1, Math.min(sources.length, this.maxLayers));
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, Math.floor(Math.log2(size)) + 1, gl.RGBA8, size, size, n);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    for (let i = 0; i < n; i++) {
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, size, size, 1, gl.RGBA, gl.UNSIGNED_BYTE, sources[i]);
    }
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
    this.wallArray = tex;
  }

  createTexture(source, { mipmap = false, wrap = false } = {}) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mipmap ? gl.NEAREST_MIPMAP_NEAREST : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    if (mipmap) gl.generateMipmap(gl.TEXTURE_2D);
    return tex;
  }

  createTextureFromPixels(w, h, pixels) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    return tex;
  }

  deleteTexture(tex) { if (tex) this.gl.deleteTexture(tex); }

  // ------------------------------------------------------------------ frame
  resize(cssW, cssH, dpr, renderHeight) {
    const gl = this.gl;
    const w = Math.max(1, Math.round(cssW * dpr)), h = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    const lowH = Math.round(renderHeight);
    const lowW = Math.round(lowH * (cssW / cssH));
    if (this.fbo && lowW === this.lowW && lowH === this.lowH) return;
    this.lowW = lowW; this.lowH = lowH;
    if (this.fbo) {
      gl.deleteFramebuffer(this.fbo.fb);
      gl.deleteTexture(this.fbo.tex);
      gl.deleteRenderbuffer(this.fbo.depth);
    }
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, lowW, lowH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const depth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, lowW, lowH);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.fbo = { fb, tex, depth };
  }

  // camera: {x, y, z, yaw, pitch, fov, roll}
  beginFrame(camera, env, lights, time) {
    const gl = this.gl;
    this.time = time;
    this.env = env;
    const cp = Math.cos(camera.pitch), sp = Math.sin(camera.pitch);
    const fx = Math.cos(camera.yaw) * cp, fy = sp, fz = Math.sin(camera.yaw) * cp;
    const roll = camera.roll || 0;
    const ux = -Math.sin(camera.yaw) * Math.sin(roll), uy = Math.cos(roll), uz = Math.cos(camera.yaw) * Math.sin(roll);
    lookAt(this.view, camera.x, camera.y, camera.z, camera.x + fx, camera.y + fy, camera.z + fz, ux, uy, uz);
    perspective(this.proj, camera.fov, this.lowW / this.lowH, 0.05, 400);
    multiply(this.viewProj, this.proj, this.view);
    invert(this.invViewProj, this.viewProj);
    this.camPos = [camera.x, camera.y, camera.z];
    // camera basis from view matrix rows
    const v = this.view;
    this.camRight = [v[0], v[4], v[8]];
    this.camUp = [v[1], v[5], v[9]];

    // lights: nearest first
    const list = lights
      .map((l) => ({ l, d: (l.x - camera.x) ** 2 + (l.y - camera.y) ** 2 + (l.z - camera.z) ** 2 - l.radius * l.radius }))
      .sort((a, b) => a.d - b.d)
      .slice(0, S.MAX_LIGHTS);
    this.lightCount = list.length;
    for (let i = 0; i < list.length; i++) {
      const l = list[i].l;
      this.lightPos.set([l.x, l.y, l.z, l.radius], i * 4);
      const k = l.intensity ?? 1;
      this.lightCol.set([l.r * k, l.g * k, l.b * k, 0], i * 4);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo.fb);
    gl.viewport(0, 0, this.lowW, this.lowH);
    gl.clearColor(env.fogColor[0], env.fogColor[1], env.fogColor[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  _commonUniforms(u) {
    const gl = this.gl, env = this.env;
    if (u.uLightPos) gl.uniform4fv(u.uLightPos, this.lightPos);
    if (u.uLightCol) gl.uniform4fv(u.uLightCol, this.lightCol);
    if (u.uLightCount) gl.uniform1i(u.uLightCount, this.lightCount);
    if (u.uFogColor) gl.uniform3fv(u.uFogColor, env.fogColor);
    if (u.uFogDensity) gl.uniform1f(u.uFogDensity, env.fogDensity);
    if (u.uAmbient) gl.uniform1f(u.uAmbient, env.ambient);
    if (u.uGrade) gl.uniform3fv(u.uGrade, env.grade);
    if (u.uCamPos) gl.uniform3fv(u.uCamPos, this.camPos);
    if (u.uTime) gl.uniform1f(u.uTime, this.time);
    if (u.uAnimFps) gl.uniform1f(u.uAnimFps, env.animFps || 6);
    if (u.uViewProj) gl.uniformMatrix4fv(u.uViewProj, false, this.viewProj);
  }

  drawSky(sky) {
    const gl = this.gl;
    const { p, u } = this.progSky;
    gl.useProgram(p);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.uniformMatrix4fv(u.uInvViewProj, false, this.invViewProj);
    gl.uniform3fv(u.uCamPos, this.camPos);
    gl.uniform1f(u.uTime, this.time);
    gl.uniform3fv(u.uTop, sky.top);
    gl.uniform3fv(u.uHorizon, sky.horizon);
    gl.uniform3fv(u.uBottom, sky.bottom);
    gl.uniform1f(u.uStars, sky.stars || 0);
    gl.uniform3fv(u.uSunDir, sky.sunDir || [0.3, 0.6, 0.5]);
    gl.uniform3fv(u.uSunColor, sky.sunColor || [1, 0.9, 0.7]);
    gl.uniform1f(u.uSunSize, sky.sunSize || 0);
    gl.uniform1i(u.uPlanet, sky.planet || 0);
    gl.uniform3fv(u.uPlanetDir, sky.planetDir || [1, -0.3, 0.2]);
    gl.uniform1f(u.uPlanetSize, sky.planetSize || 0.5);
    gl.uniform4fv(u.uClouds, sky.clouds || [0, 0, 0, 0]);
    gl.uniform1f(u.uCloudSpeed, sky.cloudSpeed || 0.02);
    gl.uniform1f(u.uStreak, sky.streak || 0);
    gl.bindVertexArray(this.emptyVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
  }

  drawWorld() {
    const gl = this.gl;
    const { p, u } = this.progWorld;
    gl.useProgram(p);
    this._commonUniforms(u);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.wallArray);
    gl.uniform1i(u.uTex, 0);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
    gl.disable(gl.BLEND);
    for (const m of [this.worldMesh, this.dynamicMesh]) {
      if (!m || !m.count) continue;
      gl.bindVertexArray(m.vao);
      gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0);
    }
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(null);
  }

  // batches: Map<key, {tex, mode, items: SpriteInstance[]}>
  // SpriteInstance fields documented in game/spritebatch.js
  drawSprites(batches) {
    const gl = this.gl;
    const { p, u } = this.progSprite;
    gl.useProgram(p);
    this._commonUniforms(u);
    gl.uniform3fv(u.uCamRight, this.camRight);
    gl.uniform3fv(u.uCamUp, this.camUp);
    gl.uniform1i(u.uTex, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(this.spriteVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteInstBuf);
    gl.enable(gl.DEPTH_TEST);
    for (const mode of [0, 2, 1]) {
      if (mode === 0) { gl.disable(gl.BLEND); gl.depthMask(true); }
      else if (mode === 1) { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false); }
      else { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); }
      gl.uniform1i(u.uMode, mode);
      for (const b of batches) {
        if (b.mode !== mode || !b.count) continue;
        gl.bindTexture(gl.TEXTURE_2D, b.tex || this.whiteTex);
        let start = 0;
        while (start < b.count) {
          const n = Math.min(this.spriteCap, b.count - start);
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, b.data, start * SPRITE_FLOATS, n * SPRITE_FLOATS);
          gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
          start += n;
        }
      }
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  // Draw a textured rect in low-res pixel coordinates (0,0 = top-left).
  drawQuad(tex, x, y, w, h, uv = [0, 0, 1, 1], opts = {}) {
    const gl = this.gl;
    const { p, u } = this.progQuad;
    gl.useProgram(p);
    gl.disable(gl.DEPTH_TEST);
    const W = this.lowW, H = this.lowH;
    const x0 = (x / W) * 2 - 1, x1 = ((x + w) / W) * 2 - 1;
    const y0 = 1 - ((y + h) / H) * 2, y1 = 1 - (y / H) * 2;
    gl.uniform4f(u.uRect, x0, y0, x1, y1);
    gl.uniform4fv(u.uUV, uv);
    gl.uniform4fv(u.uTint, opts.tint || [1, 1, 1, 1]);
    gl.uniform3fv(u.uAdd, opts.add || [0, 0, 0]);
    gl.uniform1f(u.uHue, opts.hue || 0);
    gl.uniform1i(u.uAdditive, opts.additive ? 1 : 0);
    if (opts.additive) { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); } else gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex || this.whiteTex);
    gl.uniform1i(u.uTex, 0);
    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
  }

  endFrame(post) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.disable(gl.DEPTH_TEST);
    const { p, u } = this.progPost;
    gl.useProgram(p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fbo.tex);
    gl.uniform1i(u.uScene, 0);
    gl.uniform2f(u.uRes, this.lowW, this.lowH);
    gl.uniform1f(u.uTime, this.time);
    gl.uniform4fv(u.uFlash, post.flash || [0, 0, 0, 0]);
    gl.uniform1f(u.uVignette, post.vignette ?? 0.9);
    gl.uniform1f(u.uLevelUp, post.levelUp || 0);
    gl.uniform1f(u.uQuantize, post.quantize ? 1 : 0);
    gl.uniform1f(u.uBrightness, post.brightness ?? 1);
    gl.uniform1f(u.uWarp, post.warp || 0);
    gl.uniform1f(u.uLowHealth, post.lowHealth || 0);
    gl.bindVertexArray(this.emptyVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST);
  }

  // Project a world point to low-res screen coords (for damage numbers etc).
  project(x, y, z) {
    const m = this.viewProj;
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
    const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
    const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (cw <= 0.01) return null;
    return { x: (cx / cw * 0.5 + 0.5), y: (1 - (cy / cw * 0.5 + 0.5)), w: cw };
  }
}

export { SPRITE_FLOATS };
