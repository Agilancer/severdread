// GLSL ES 3.00 shaders. Everything renders into a low-resolution target that
// is then scaled up with nearest-neighbour filtering for the chunky look.

export const MAX_LIGHTS = 24;

const LIGHTING = /* glsl */ `
uniform vec4 uLightPos[${MAX_LIGHTS}];   // xyz + radius
uniform vec4 uLightCol[${MAX_LIGHTS}];   // rgb (pre-multiplied intensity)
uniform int uLightCount;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uAmbient;
uniform vec3 uGrade;        // level colour grade (multiply)
uniform vec3 uCamPos;
uniform float uTime;
uniform float uAnimFps;

vec3 dynLights(vec3 p, vec3 n, bool useNormal) {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uLightCount) break;
    vec3 d = uLightPos[i].xyz - p;
    float dl = length(d);
    float r = uLightPos[i].w;
    float att = clamp(1.0 - dl / r, 0.0, 1.0);
    att *= att;
    float lam = useNormal ? clamp(dot(n, d / max(dl, 0.001)) * 0.75 + 0.35, 0.0, 1.0) : 1.0;
    acc += uLightCol[i].rgb * att * lam;
  }
  return acc;
}

// Doom-ish light diminishing: things get darker with distance.
float diminish(float dist) {
  return clamp(1.3 - dist * 0.045, 0.28, 1.0);
}

vec3 applyFog(vec3 col, float dist) {
  float f = 1.0 - exp(-dist * uFogDensity);
  return mix(col, uFogColor, clamp(f, 0.0, 1.0));
}
`;

export const worldVS = /* glsl */ `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUV;
layout(location=2) in vec3 aNormal;
layout(location=3) in vec4 aInfo;   // layer, light, emissive, scroll
uniform mat4 uViewProj;
out vec3 vWorld;
out vec2 vUV;
out vec3 vNormal;
flat out float vLayer;
out float vLight;
flat out float vEmissive;
flat out float vScroll;
void main() {
  vWorld = aPos;
  vUV = aUV;
  vNormal = aNormal;
  vLayer = aInfo.x;
  vLight = aInfo.y;
  vEmissive = aInfo.z;
  vScroll = aInfo.w;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}`;

export const worldFS = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2DArray;
uniform sampler2DArray uTex;
${LIGHTING}
in vec3 vWorld;
in vec2 vUV;
in vec3 vNormal;
flat in float vLayer;
in float vLight;
flat in float vEmissive;
flat in float vScroll;
out vec4 outColor;
void main() {
  vec2 uv = vUV;
  // signed scroll speed along u (roads under vehicles, tunnel walls, lava flow)
  uv.x += uTime * vScroll;
  // animated layers are encoded as base + frames * 1000 (see game/leveltextures.js)
  float frames = floor(vLayer / 1000.0);
  float layer = vLayer - frames * 1000.0;
  if (frames > 0.0) layer += mod(floor(uTime * uAnimFps), frames);
  vec4 t = texture(uTex, vec3(uv, layer));
  if (t.a < 0.5) discard;      // see-through door frames / grates
  float dist = length(vWorld - uCamPos);
  vec3 n = normalize(vNormal);
  // fake contrast like the classic engine: E/W walls a bit brighter
  float contrast = abs(n.x) > 0.5 ? 1.08 : (abs(n.z) > 0.5 ? 0.9 : 1.0);
  float light = vLight * contrast * diminish(dist) + uAmbient;
  vec3 col = t.rgb * light * uGrade;
  col += t.rgb * dynLights(vWorld + n * 0.05, n, true);
  if (vEmissive > 0.0) {
    float pulse = 0.85 + 0.15 * sin(uTime * 2.3 + vWorld.x * 0.7 + vWorld.z * 0.5);
    col = mix(col, t.rgb * 1.35 * pulse, vEmissive);
  }
  col = applyFog(col, dist);
  outColor = vec4(col, 1.0);
}`;

export const skyVS = /* glsl */ `#version 300 es
const vec2 P[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));
out vec2 vNdc;
void main() { vNdc = P[gl_VertexID]; gl_Position = vec4(P[gl_VertexID], 0.9999, 1.0); }`;

export const skyFS = /* glsl */ `#version 300 es
precision highp float;
uniform mat4 uInvViewProj;
uniform vec3 uCamPos;
uniform float uTime;
uniform vec3 uTop, uHorizon, uBottom;
uniform float uStars;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunSize;
uniform int uPlanet;        // 0 none, 1 ruined earth, 2 mars, 3 gas giant, 4 black hole, 5 burning sun
uniform vec3 uPlanetDir;
uniform float uPlanetSize;
uniform vec4 uClouds;       // rgb colour, a density
uniform float uCloudSpeed;
uniform float uStreak;      // >0: stars stream past (moving ship/train)
in vec2 vNdc;
out vec4 outColor;

float h31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
float h21(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }

void main() {
  vec4 w = uInvViewProj * vec4(vNdc, 1.0, 1.0);
  vec3 dir = normalize(w.xyz / w.w - uCamPos);
  float y = dir.y;
  vec3 col = y > 0.0 ? mix(uHorizon, uTop, pow(clamp(y, 0.0, 1.0), 0.6)) : mix(uHorizon, uBottom, pow(clamp(-y, 0.0, 1.0), 0.5));

  // stars
  if (uStars > 0.0) {
    vec3 sd = dir;
    if (uStreak > 0.0) sd.x += uTime * uStreak * 0.02;
    vec3 cell = floor(sd * 140.0);
    float s = h31(cell);
    float tw = 0.6 + 0.4 * sin(uTime * 3.0 + s * 50.0);
    if (s > 1.0 - 0.012 * uStars) col += vec3(0.9, 0.9, 1.0) * tw * smoothstep(1.0 - 0.012 * uStars, 1.0, s) * 3.0;
    if (uStreak > 0.0) {
      vec2 sp = vec2(atan(dir.z, dir.x) * 30.0, dir.y * 60.0);
      float lane = floor(sp.y);
      float st = h21(vec2(lane, 7.0));
      float x = fract(sp.x * 0.05 + uTime * uStreak * (0.3 + st));
      float streak = smoothstep(0.0, 0.25, x) * smoothstep(0.32, 0.25, x) * step(0.7, st) * (1.0 - abs(fract(sp.y) - 0.5) * 2.0);
      col += vec3(0.6, 0.7, 1.0) * streak * 0.8;
    }
  }

  // planet / celestial body
  if (uPlanet > 0) {
    float d = acos(clamp(dot(dir, normalize(uPlanetDir)), -1.0, 1.0));
    if (d < uPlanetSize) {
      vec3 pd = normalize(uPlanetDir);
      vec3 right = normalize(cross(pd, vec3(0, 1, 0)));
      vec3 up = cross(right, pd);
      vec2 uv = vec2(dot(dir, right), dot(dir, up)) / sin(uPlanetSize);
      float r = length(uv);
      float z = sqrt(max(0.0, 1.0 - r * r));
      vec3 n = normalize(vec3(uv, z));
      float lit = clamp(dot(n, normalize(vec3(-0.6, 0.4, 0.7))), 0.0, 1.0);
      vec3 pc;
      vec2 suv = vec2(atan(n.x, n.z) + uTime * 0.01, n.y) * 3.0;
      if (uPlanet == 1) {        // ruined earth: scorched continents, grey seas, fires
        float land = fbm(suv * 1.5);
        pc = land > 0.5 ? mix(vec3(0.35, 0.25, 0.18), vec3(0.15, 0.12, 0.1), fbm(suv * 4.0)) : vec3(0.12, 0.18, 0.25);
        if (land > 0.55 && fbm(suv * 9.0 + 3.0) > 0.68) pc = vec3(1.0, 0.45, 0.1) * 1.5; // fires
        pc = mix(pc, vec3(0.6, 0.55, 0.5), smoothstep(0.55, 0.8, fbm(suv * 2.0 + uTime * 0.02)) * 0.6); // ash clouds
      } else if (uPlanet == 2) { pc = mix(vec3(0.7, 0.28, 0.12), vec3(0.4, 0.15, 0.08), fbm(suv * 2.0)); }
      else if (uPlanet == 3) { pc = mix(vec3(0.8, 0.6, 0.4), vec3(0.6, 0.3, 0.2), 0.5 + 0.5 * sin(n.y * 18.0 + fbm(suv) * 4.0)); }
      else if (uPlanet == 4) { pc = vec3(0.0); lit = 1.0; }
      else { pc = vec3(1.0, 0.6, 0.2) * (1.2 + fbm(suv * 3.0 + uTime * 0.1)); lit = 1.0; }
      vec3 planet = pc * (0.08 + lit);
      float edge = smoothstep(1.0, 0.96, r);
      col = mix(col, planet, edge);
      // atmosphere rim
      col += (uPlanet == 4 ? vec3(1.0, 0.5, 0.2) : vec3(0.4, 0.6, 1.0)) * smoothstep(0.85, 1.0, r) * smoothstep(1.08, 1.0, r) * 0.6;
    } else if (uPlanet == 4 && d < uPlanetSize * 1.8) {
      col += vec3(1.0, 0.55, 0.2) * pow(1.0 - (d - uPlanetSize) / (uPlanetSize * 0.8), 3.0) * 0.8; // accretion glow
    }
  }

  // sun glow
  if (uSunSize > 0.0) {
    float sd = max(dot(dir, normalize(uSunDir)), 0.0);
    col += uSunColor * (pow(sd, 900.0 / uSunSize) * 3.0 + pow(sd, 24.0) * 0.35);
  }

  // clouds on a virtual plane
  if (uClouds.a > 0.0 && y > 0.0) {
    vec2 cp = dir.xz / (y + 0.08) * 1.5 + vec2(uTime * uCloudSpeed, uTime * uCloudSpeed * 0.3);
    float c = smoothstep(0.45, 0.85, fbm(cp));
    col = mix(col, uClouds.rgb, c * uClouds.a * smoothstep(0.0, 0.25, y));
  } else if (uClouds.a > 0.0 && y <= 0.0) {
    vec2 cp = dir.xz / (-y + 0.08) * 1.2 + vec2(uTime * uCloudSpeed * 2.0, 0.0);
    float c = smoothstep(0.3, 0.75, fbm(cp));
    col = mix(col, uClouds.rgb * 0.8, c * uClouds.a);
  }
  outColor = vec4(col, 1.0);
}`;

export const spriteVS = /* glsl */ `#version 300 es
layout(location=0) in vec2 aCorner;     // x in [-0.5,0.5], y in [0,1]
layout(location=1) in vec3 iPos;
layout(location=2) in vec2 iSize;
layout(location=3) in vec4 iUV;
layout(location=4) in vec4 iTint;
layout(location=5) in vec4 iGlow;
layout(location=6) in vec4 iParams;     // hueShift, rotation, anchorY, fullbright
layout(location=7) in vec4 iExtra;      // dissolve, saturation, sectorLight, billboardMode
uniform mat4 uViewProj;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamPos;
uniform vec4 uLightPos[${MAX_LIGHTS}];
uniform vec4 uLightCol[${MAX_LIGHTS}];
uniform int uLightCount;
out vec2 vUV;
out vec4 vTint;
out vec4 vGlow;
out vec4 vParams;
out vec4 vExtra;
out vec3 vDyn;
out float vDist;
out vec2 vLocal;
void main() {
  vec3 right = uCamRight;
  vec3 up = iExtra.w > 0.5 ? uCamUp : vec3(0.0, 1.0, 0.0);
  if (iExtra.w < 0.5) {   // cylindrical: right vector stays horizontal
    right = normalize(vec3(right.x, 0.0, right.z));
  } else if (iExtra.w > 1.5) {   // fixed-axis decals: 2 floor, 3 wall facing +-x, 4 wall facing +-z
    if (iExtra.w < 2.5) { right = vec3(1.0, 0.0, 0.0); up = vec3(0.0, 0.0, 1.0); }
    else if (iExtra.w < 3.5) { right = vec3(0.0, 0.0, 1.0); up = vec3(0.0, 1.0, 0.0); }
    else { right = vec3(1.0, 0.0, 0.0); up = vec3(0.0, 1.0, 0.0); }
  }
  float c = cos(iParams.y), s = sin(iParams.y);
  vec2 local = vec2(aCorner.x * iSize.x, (aCorner.y - iParams.z) * iSize.y);
  local = vec2(local.x * c - local.y * s, local.x * s + local.y * c);
  vec3 wp = iPos + right * local.x + up * local.y;
  gl_Position = uViewProj * vec4(wp, 1.0);
  vUV = vec2(mix(iUV.x, iUV.z, aCorner.x + 0.5), mix(iUV.w, iUV.y, aCorner.y));
  vTint = iTint;
  vGlow = iGlow;
  vParams = iParams;
  vExtra = iExtra;
  vLocal = vec2(aCorner.x + 0.5, aCorner.y);
  vDist = length(iPos - uCamPos);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uLightCount) break;
    float dl = length(uLightPos[i].xyz - iPos);
    float att = clamp(1.0 - dl / uLightPos[i].w, 0.0, 1.0);
    acc += uLightCol[i].rgb * att * att;
  }
  vDyn = acc;
}`;

export const spriteFS = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform int uMode;          // 0 cutout, 1 additive, 2 alpha blend
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uAmbient;
uniform vec3 uGrade;
uniform float uTime;
in vec2 vUV;
in vec4 vTint;
in vec4 vGlow;
in vec4 vParams;
in vec4 vExtra;
in vec3 vDyn;
in float vDist;
in vec2 vLocal;
out vec4 outColor;

vec3 hueShift(vec3 col, float h) {
  const mat3 toYIQ = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);
  const mat3 toRGB = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);
  vec3 yiq = toYIQ * col;
  float hue = atan(yiq.z, yiq.y) + h;
  float chroma = length(yiq.yz);
  return toRGB * vec3(yiq.x, chroma * cos(hue), chroma * sin(hue));
}
float h21(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }

void main() {
  vec4 t = texture(uTex, vUV);
  if (uMode == 0 && t.a < 0.45) discard;
  if (uMode != 0 && t.a < 0.01) discard;
  vec3 col = t.rgb;
  if (vParams.x != 0.0) col = hueShift(col, vParams.x);
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, vExtra.y);
  col *= vTint.rgb;
  // dissolve (death / teleport); negative = gory dissolve with blood-red edges
  if (vExtra.x != 0.0) {
    float dv = abs(vExtra.x);
    float n = h21(floor(vLocal * 48.0));
    if (n < dv) discard;
    if (n < dv + 0.08) col = vExtra.x < 0.0 ? mix(col, vec3(0.42, 0.0, 0.0), 0.9) : mix(col, vGlow.rgb * 2.0 + vec3(1.0, 0.5, 0.2), 0.8);
  }
  if (uMode == 0) {
    float light = vParams.w > 0.5 ? 1.0 : vExtra.z * clamp(1.3 - vDist * 0.045, 0.28, 1.0) + uAmbient;
    col = col * light * uGrade + t.rgb * vDyn * 0.8;
    col += vGlow.rgb * t.a;
    col = mix(col, vec3(1.0), vGlow.a);
    float f = 1.0 - exp(-vDist * uFogDensity);
    col = mix(col, uFogColor, clamp(f, 0.0, 1.0));
    outColor = vec4(col, 1.0);
  } else if (uMode == 1) {
    float f = exp(-vDist * uFogDensity);
    outColor = vec4(col * t.a * vTint.a * f + vGlow.rgb * t.a * f, 1.0);
  } else {
    float light = vParams.w > 0.5 ? 1.0 : vExtra.z * clamp(1.3 - vDist * 0.045, 0.28, 1.0) + uAmbient;
    col = col * light * uGrade + vDyn * 0.5 * col;
    float f = 1.0 - exp(-vDist * uFogDensity);
    col = mix(col, uFogColor, clamp(f, 0.0, 1.0));
    outColor = vec4(col, t.a * vTint.a);
  }
}`;

// Screen-space textured quads (first-person weapon, overlays).
export const quadVS = /* glsl */ `#version 300 es
layout(location=0) in vec2 aCorner;   // 0..1
uniform vec4 uRect;    // x0, y0, x1, y1 in NDC
uniform vec4 uUV;      // u0, v0, u1, v1
out vec2 vUV;
void main() {
  vec2 p = mix(uRect.xy, uRect.zw, aCorner);
  vUV = vec2(mix(uUV.x, uUV.z, aCorner.x), mix(uUV.w, uUV.y, aCorner.y));
  gl_Position = vec4(p, 0.0, 1.0);
}`;

export const quadFS = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec4 uTint;
uniform vec3 uAdd;
uniform float uHue;
uniform int uAdditive;     // 0 cutout, 1 additive, 2 alpha blend
in vec2 vUV;
out vec4 outColor;
vec3 hueShift(vec3 col, float h) {
  const mat3 toYIQ = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);
  const mat3 toRGB = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);
  vec3 yiq = toYIQ * col;
  float hue = atan(yiq.z, yiq.y) + h;
  float chroma = length(yiq.yz);
  return toRGB * vec3(yiq.x, chroma * cos(hue), chroma * sin(hue));
}
void main() {
  vec4 t = texture(uTex, vUV);
  if (uAdditive == 0 && t.a < 0.4) discard;
  if (uAdditive == 2 && t.a < 0.01) discard;
  vec3 c = t.rgb;
  if (uHue != 0.0) c = hueShift(c, uHue);
  c = c * uTint.rgb + uAdd * t.a;
  if (uAdditive == 1) outColor = vec4(c * t.a * uTint.a, 1.0);
  else if (uAdditive == 2) outColor = vec4(c, t.a * uTint.a);   // alpha blend (lens blood, overlays)
  else outColor = vec4(c, 1.0);
}`;

export const postVS = /* glsl */ `#version 300 es
const vec2 P[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));
out vec2 vUV;
void main() { vUV = P[gl_VertexID] * 0.5 + 0.5; gl_Position = vec4(P[gl_VertexID], 0.0, 1.0); }`;

export const postFS = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform vec2 uRes;           // low-res size
uniform float uTime;
uniform vec4 uFlash;         // rgb + amount (damage / pickup flash)
uniform float uVignette;
uniform float uLevelUp;      // 0..1 level-up blood-red pulse
uniform float uQuantize;     // 1 = 15-bit colour + ordered dither
uniform float uBrightness;
uniform float uWarp;         // teleport warp amount
uniform float uLowHealth;
in vec2 vUV;
out vec4 outColor;
float bayer(vec2 p) {
  int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0));
  int i = x + y * 4;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return float(m[i]) / 16.0 - 0.5;
}
void main() {
  vec2 uv = vUV;
  if (uWarp > 0.0) {
    vec2 c = uv - 0.5;
    float r = length(c);
    float a = uWarp * 6.0 * (1.0 - r);
    uv = 0.5 + mat2(cos(a), -sin(a), sin(a), cos(a)) * c * (1.0 - uWarp * 0.3);
  }
  vec3 col;
  if (uLevelUp > 0.0) {
    float off = uLevelUp * 2.5 / uRes.x;
    col = vec3(texture(uScene, uv + vec2(off, 0.0)).r, texture(uScene, uv).g, texture(uScene, uv - vec2(off, 0.0)).b);
  } else {
    col = texture(uScene, uv).rgb;
  }
  col *= uBrightness;
  vec2 c = vUV - 0.5;
  float vig = 1.0 - dot(c, c) * uVignette;
  col *= vig;
  // low health: pulsing red edges
  if (uLowHealth > 0.0) {
    float edge = smoothstep(0.15, 0.55, length(c));
    col = mix(col, vec3(0.6, 0.0, 0.0), edge * uLowHealth * (0.55 + 0.45 * sin(uTime * 5.0)));
  }
  if (uLevelUp > 0.0) {
    float pulse = 0.5 + 0.5 * sin(uTime * 9.0);
    float edge = smoothstep(0.1, 0.7, length(c));
    col = mix(col, vec3(0.9, 0.02, 0.02), uLevelUp * (0.06 + 0.5 * edge) * (0.5 + 0.5 * pulse));
    col.r += uLevelUp * 0.08 * pulse;
  }
  col = mix(col, uFlash.rgb, uFlash.a);
  if (uQuantize > 0.5) {
    vec2 px = floor(vUV * uRes);
    col += bayer(px) / 31.0;
    col = floor(clamp(col, 0.0, 1.0) * 31.0 + 0.5) / 31.0;
  }
  outColor = vec4(col, 1.0);
}`;
