// Thinking orb: an iridescent soap-bubble status indicator for an AI chat bot.
// One WebGL fragment shader, no dependencies. Modelled on the clips in
// "Thinking orb ref". Usage:
//   const orb = ThinkingOrb.create(canvas);
//   orb.setState('thinking');   // see ThinkingOrb.states
//   orb.trigger('success');     // one-shot pop
//   orb.setLevel(0.6);          // 0..1 mic / TTS / typing level, null = simulated
(function () {
  'use strict';

  const VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';

  const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime, uR, uWob, uRibs, uRibPhase, uBulge, uBulgeAng,
              uSatR, uSatAng, uSatDist, uLayers, uJitter, uGlow, uHue, uCool, uCurl, uBloom, uDots;
uniform vec3 uDotY, uDotS;

float h1(float n){ return fract(sin(n) * 43758.5453); }
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f*f*(3. - 2.*f);
  return mix(mix(h2(i), h2(i + vec2(1., 0.)), f.x),
             mix(h2(i + vec2(0., 1.)), h2(i + vec2(1., 1.)), f.x), f.y) * 2. - 1.;
}
float adiff(float a, float b){ return atan(sin(a - b), cos(a - b)); }
float arange(float a, float a0, float a1, float sf){
  float m = .5*(a0 + a1);
  float x = m + adiff(a, m);
  return smoothstep(a0 - sf, a0 + sf, x) * (1. - smoothstep(a1 - sf, a1 + sf, x));
}
float smin(float a, float b, float k){
  float h = clamp(.5 + .5*(b - a)/k, 0., 1.);
  return mix(b, a, h) - k*h*(1. - h);
}

// Silhouette radius at screen angle th: slow wobble, one-sided bulge, shiver.
float radiusAt(float th){
  float w = .6*sin(2.*th - uTime*.5 + 1.) + .4*sin(3.*th + uTime*.7);
  float b = exp(-pow(adiff(th, uBulgeAng)/.8, 2.));
  float j = vn(vec2(cos(th), sin(th))*7. + vec2(uTime*7., 0.));
  float rib = uRibs * .008 * sin(8.*th + uRibPhase*3.) * smoothstep(.3, .9, sin(th));   // ripples at 11-1
  return uR * (1. + uWob*w + uBulge*b + uJitter*.012*j + rib);
}
float sdMain(vec2 p){ return length(p) - radiusAt(atan(p.y, p.x)); }
// Droplet: an ellipse stretched along the rim (about 2:1).
float sdSat(vec2 p){
  vec2 dir = vec2(cos(uSatAng), sin(uSatAng));
  vec2 l = p - dir*uSatDist;
  return length(vec2(dot(l, vec2(-dir.y, dir.x))*.5, dot(l, dir)*1.15)) - uSatR;
}
// Responding: three small orbs in a row. uDotY lifts each one; uDotS
// stretches it tall (> 0) or squashes it flat (< 0), keeping its volume and
// its bottom on the baseline.
const float DOT_GAP = .44, DOT_R = .13;
float sdDots(vec2 p){
  float d = 1e3;
  for (int i = 0; i < 3; i++) {
    float r = DOT_R*uDots;
    vec2 sc = vec2(1. / (1. + uDotS[i]), 1. + uDotS[i]);
    vec2 c = vec2((float(i) - 1.)*DOT_GAP*uDots, uDotY[i] + r*(sc.y - 1.));
    d = min(d, (length((p - c) / sc) - r) * min(sc.x, sc.y));
  }
  return d;
}
float sdf(vec2 p){
  float d = sdMain(p);
  if (uSatR > .001) d = smin(d, sdSat(p), .13);
  if (uDots > .001) d = smin(d, sdDots(p), .02 + .12*(1. - uDots));   // bud out, then separate
  return d;
}

// Thin-film colours: violet -> orange -> gold -> pale cyan.
vec3 film(float x){
  x = fract(x);
  vec3 c = mix(vec3(.5, .3, 1.), vec3(1., .5, .1), smoothstep(0., .3, x));
  c = mix(c, vec3(1., .82, .45), smoothstep(.3, .5, x));
  c = mix(c, vec3(.55, .95, 1.), smoothstep(.5, .75, x));
  return mix(c, vec3(.5, .3, 1.), smoothstep(.75, 1., x));
}

// Thin-film interference: reflected colour of a soap film d nm thick, seen
// at cos(angle) cosi. Each channel averages three nearby wavelengths so the
// bands are soft, as with white light.
// Film thickness (nm) over the sphere: thinner at the top as the film
// drains, with slow smooth swirls (sums of sines, so no grid artefacts).
float filmThickness(vec3 N, float t){
  vec2 u = N.xy;
  float s = sin(u.x*2.3 + u.y*1.1 + t*.31) + sin(u.y*2.9 - u.x*.7 - t*.23)
          + .5*sin((u.x - u.y)*4.1 + t*.47) + .5*sin(length(u + vec2(.3, -.2))*6. - t*.6);
                    // Drains fast near the top (white-cyan), thickens slowly below (gold -> red -> violet).
  return 205. + 26.*s - N.y*(N.y > 0. ? 145. : 50.);   // ~110 nm at the top (white-cyan), ~260 at the bottom (violet)
}
vec3 thinFilm(float d, float cosi){
  float sint = sqrt(max(1. - cosi*cosi, 0.)) / 1.33;
  float opd = 2. * 1.33 * d * sqrt(1. - sint*sint);   // optical path difference
  vec3 c = vec3(0.);
  for (int k = -1; k <= 1; k++) {
    vec3 lam = vec3(640., 535., 455.) + float(k)*22.;
    vec3 s = sin(3.14159 * opd / lam);
    c += s*s;
  }
  c /= 3.;
  return mix(vec3(dot(c, vec3(.333))), c, .8);   // white light is never fully saturated
}
// The room the bubble reflects: dark, with a warm softbox to the left (just
// below eye level, slightly behind), a cool strip light above and behind,
// and a faint backdrop glow behind the bubble that lights its edge. The back
// wall is concave, so it shows the softbox large (the crescent on the right);
// the convex front wall shows it small (the smear at 8-9 o'clock).
vec3 env(vec3 r, float back){
  vec3 c = vec3(0.);
  // Tall strip softbox to the left and behind (azimuth around the vertical axis).
  float az = atan(r.x, -r.z);
  float hw = mix(.2, .62, back);
  float key = smoothstep(hw, hw - .1, abs(az + 1.15)) * smoothstep(mix(.45, 1., back), mix(.2, .6, back), abs(r.y + mix(.1, .3, back)));
  c += vec3(1., .85, .65) * key * mix(3.5, 9., back);
  // Wide strip light overhead, behind.
  float top = smoothstep(.55, .7, r.y) * smoothstep(.75, .55, abs(r.x + .15)) * smoothstep(.05, -.25, r.z);
  c += vec3(.85, .95, 1.) * top * mix(3., .15, back);
  c += vec3(.85, .93, 1.) * smoothstep(-.88, -.98, r.z) * 1.4;   // backdrop: thin bright edge
  return c;
}

void main(){
  float scale = .5 * min(uRes.x, uRes.y);
  vec2 p = (gl_FragCoord.xy - .5*uRes) / scale;
  float px = 1. / scale;
  if (length(p) > max(uR*1.55, .75*step(.001, uDots))) { gl_FragColor = vec4(0.); return; }
  float d = sdf(p);
  if (d > .05) { gl_FragColor = vec4(0.); return; }

  float t = uTime;
  vec2 e = vec2(px, 0.);
  vec2 n = normalize(vec2(sdf(p + e.xy) - sdf(p - e.xy), sdf(p + e.yx) - sdf(p - e.yx)) + 1e-6);

  // Depth into the bubble: q ~ r/R, so 1 at the silhouette and 0 at the centre.
  float Rloc = radiusAt(atan(p.y, p.x));
  float satW = 0.;
  if (uSatR > .001) {
    satW = clamp(.5 + .5*(sdMain(p) - sdSat(p))/.1, 0., 1.);
    Rloc = mix(Rloc, uSatR*1.6, satW);
  }
  float dotW = 0.;
  if (uDots > .001) {
    dotW = clamp(.5 + .5*(sdMain(p) - sdDots(p))/.05, 0., 1.);
    Rloc = mix(Rloc, DOT_R*uDots, dotW);   // each small orb is shaded as its own bubble
  }
  float q = clamp(1. + min(d, 0.)/max(Rloc, 1e-3), 0., 1.);
  float inside = smoothstep(px, -px, d);

  float a = atan(n.y, n.x);
  vec3 vi = mix(vec3(.5, .22, 1.), vec3(.3, .5, 1.), uCool);
  vec3 gold = vec3(1., .86, .45), orange = vec3(1., .58, .12);

  // --- Soap film -----------------------------------------------------------
  // Treat each blob as a sphere: q = r/R gives the 3D normal. We see the
  // front wall reflecting the room, and through it the back wall's inside
  // reflecting it again (mirrored). Each reflection is tinted by thin-film
  // interference and weighted by Fresnel, so the face is nearly clear and
  // the colour gathers towards the edge, as on a real bubble.
  float nz = sqrt(max(1. - q*q, 0.));
  vec3 Nf = vec3(n*q, nz);                   // front wall, facing the viewer
  vec3 Rf = reflect(vec3(0., 0., -1.), Nf);
  vec3 Nb = vec3(-n*q, nz);                  // back wall, facing inwards
  vec3 Rb = reflect(vec3(0., 0., -1.), Nb);
  // Film thickness in nm: thin at the top, draining thicker towards the
  // bottom, with slow swirls; each wall gets its own pattern.
    // Thickness follows where each wall really is: the back wall's point sits
  // at the same height as the front one (outward normal (n q, -nz)).
  float dF = filmThickness(Nf, t), dB = filmThickness(vec3(n*q, -nz), t + 17.) - 20.;
  float F = .01 + .99*pow(1. - nz, 3.);      // reflectance: faint face-on, strong at the edge
  vec3 col = env(Rf, 0.) * thinFilm(dF, nz) * F * 4.
           + env(Rb, 1.) * thinFilm(dB, nz) * F * 3.4;

  // Error / waiting tints.
  col = mix(col, vec3(dot(col, vec3(.6, .3, .1))) * vec3(1., .15, .3), uHue);
  col = mix(col, vec3(dot(col, vec3(.3, .4, .3))) * vec3(.45, .7, 1.), uCool);

  // Meridian folds (ref 008d): broad pole-to-pole bands on a turning sphere.
  // A meridian at longitude phi projects to x = R sin(phi) sqrt(1 - y^2): the
  // bands sweep across, then uCurl gathers them near phi = 90 deg, where they
  // read as offset concentric rings inside the rim.
  if (uRibs > .001) {
    float yy = clamp(p.y/uR, -1., 1.);
    float wy = sqrt(max(1. - yy*yy, 1e-3));
    vec3 rc = vec3(0.);
    for (int k = 0; k < 8; k++) {
      float fk = float(k);
      float phi = mix(uRibPhase*(1. + .11*fk) + fk*.8, .55 + .17*fk, uCurl);
      vec2 off = uCurl * vec2(.05, .03) * fk / 3.;
      float x0 = sin(phi);
      float u = (p.x - off.x)/(uR*clamp(sqrt(max(1. - pow((p.y - off.y)/uR, 2.), 1e-3)), .03, 1.));
      float dist = min(abs(u - x0), abs(u + x0)) * uR * wy;   // both halves of the great circle
      float w = max(px, mix(.005 + .006*abs(cos(phi)), .006, uCurl));
      float L = exp(-pow(dist/w, 4.));
      // Curl: the folds close into concentric rings offset towards 2 o'clock.
      // Curl: the folds close into ellipses nested just inside the rim,
      // offset up and to the left, warmer and brighter on the right.
      vec2 rp = (p - vec2(-.03, .05) * (1. - fk/3.)) / vec2(.94, 1.);
      float ringD = abs(length(rp) - uR*(.9 - .07*fk));
      float arc = .35 + .65*smoothstep(-.6, .6, rp.x/max(length(rp), 1e-3));
      L = mix(L, exp(-pow(ringD/.006, 2.)) * arc, uCurl);
      // Warm on the right, violet on the left, a thin pale core; folds crowd
      // towards the sides, so the ones crossing the middle stay dim.
      float side = (p.x - off.x) / uR;
      vec3 lc = mix(vi, mix(orange, gold, .45), smoothstep(-.3, .3, side));
      lc = mix(lc, vec3(1., .93, .8), .75*exp(-dist*dist/(.2*w*w)));
      float keep = 1. - smoothstep(0., .5, uCurl)*step(2.5, fk);   // only 3 rings remain once curled
      rc += lc * L * mix(.45 + .55*abs(x0), 1., uCurl) * keep;
    }
    col += rc * uRibs * 2.2 * smoothstep(1., .85, abs(yy));
  }

  // Responding (ref 1074): pink-lavender to near-white flare where it swells.
  vec3 bloom = vec3(1., .45, .85);
  col += bloom * exp(-pow(adiff(a, .35)/.45, 2.)) * smoothstep(.72, .8, q) * (1. - smoothstep(.9, .95, q)) * uBloom * 1.3;

  // Droplet (ref f4c6): filled with the same film, not hollow.
  col *= 1. - .6*satW;   // the droplet is a glassy bead: clear inside, bright cyan-white lip
  col += mix(vec3(.85, .97, 1.), film(q + t*.1), .3) * satW * smoothstep(.6, .95, q) * 1.4;

  col *= inside;

  // Front wall: crisp white-cyan hairlines with black gaps, brightest and
  // stacked apart at 7-11 o'clock, fading out at 2-5 o'clock, with a thin
  // violet-teal fringe along the bottom.
  float hw = max(px*.8, .0021);
  float ra = atan(n.y, n.x);
  float rimI = .3 + 1.5*arange(ra, 2.3, 4.2, .35) + .6*arange(ra, 1.1, 2.3, .3) + .35*arange(ra, 4.2, 5.4, .2);
  vec3 tint = vec3(.88, .97, 1.);
  tint = mix(tint, film(ra*1.4 + .2), arange(ra, 4.1, 5.4, .2));
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 o = vec2(-.028, -.009) * fi * (1. + uLayers*1.5)
           + uLayers * .01 * vec2(cos(t*1.3 + fi*2.1), sin(t*1.1 + fi*2.7));
    vec2 po = p - o;
    float ta = atan(po.y, po.x);
    float dl = length(po) - radiusAt(ta) * (1. - .008*fi + .012*uLayers*fi);
    if (uSatR > .001 && i == 0) dl = smin(dl, sdSat(p), .13);
    if (uDots > .001 && i == 0) dl = smin(dl, sdDots(p), .02 + .12*(1. - uDots));
    float sp = hw*.25;
    vec3 g = vec3(exp(-pow((dl - sp)/hw, 2.)), exp(-pow(dl/hw, 2.)), exp(-pow((dl + sp)/hw, 2.)));
    float side = i == 0 ? rimI : arange(ta, 2.3, 4.5, .35) * (1.2 - .3*fi) * (1. + uLayers) * (1. - uDots);
    vec3 tc = i == 0 ? tint : vec3(.9, .97, 1.);
    col += g * tc * side * 1.6;
  }

  col *= uGlow;
  // Hue-preserving tone curve keeps the film saturated where it is bright.
  float mx = max(col.r, max(col.g, col.b));
  col *= (1. - exp(-mx*1.5)) / max(mx, 1e-4);
  gl_FragColor = vec4(col, max(col.r, max(col.g, col.b)));
}`;

  // Shape targets per state. The orb eases toward the active state's values.
  const BASE = {
    radius: 1, wobble: .006, ribs: 0, ribSpd: 1, ribPulse: 0, bulge: 0,
    sat: 0, layers: 0, dots: 0, jitter: 0, glow: 1, hue: 0, cool: 0, speed: 1,
  };
  const STATES = {
    idle:        { label: 'Idle',        hint: 'Ready, nothing happening', wobble: .004, speed: .6 },
    listening:   { label: 'Listening',   hint: 'User is typing or speaking',
                   radius: 1.02, wobble: .028, glow: 1.08, speed: .7 },
    thinking:    { label: 'Thinking',    hint: 'Reasoning before answering',
                   wobble: .01, ribs: 1, ribSpd: 1, ribPulse: 1 },
    researching: { label: 'Researching', hint: 'Searching the web, reading sources',
                   wobble: .012, sat: 1 },
    working:     { label: 'Working',     hint: 'Running tools, editing files',
                   wobble: .012, ribs: .7, ribSpd: 2.6, layers: .5, glow: 1.08, speed: 1.2 },
    typing:      { label: 'Responding',  hint: 'Streaming the answer', dots: 1 },
    waiting:     { label: 'Needs you',   hint: 'Waiting for approval or input',
                   radius: .96, wobble: .005, glow: .75, cool: .75, speed: .45 },
    error:       { label: 'Error',       hint: 'Something failed',
                   radius: .95, wobble: .012, jitter: 1, glow: .9, hue: 1 },
  };
  const UNIFORMS = ['uRes', 'uTime', 'uR', 'uWob', 'uRibs', 'uRibPhase', 'uBulge',
    'uBulgeAng', 'uSatR', 'uSatAng', 'uSatDist', 'uLayers', 'uJitter', 'uGlow', 'uHue', 'uCool', 'uCurl', 'uBloom', 'uDots', 'uDotY', 'uDotS'];
  const R = .78; // orb radius as a fraction of half the canvas' short side

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function create(canvas, opts = {}) {
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false });
    if (!gl) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const U = {};
    for (const name of UNIFORMS) U[name] = gl.getUniformLocation(prog, name);

    const maxDpr = opts.maxDpr || 2;
    function resize() {
      const dpr = Math.min(devicePixelRatio || 1, maxDpr);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
    }

    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let active = STATES[opts.state] ? opts.state : 'idle';
    const cur = { ...BASE, ...STATES[active] };
    let target = { ...cur };
    let level = null;
    let pop = 0, popV = 0, flash = 0, shake = 0;
    let t = 0, ribPhase = 0, satAng = 0, satLife = 0;
    let syl = 0, sylT = 0, sylDur = .2, sylAmp = .6;
    const HOP_PERIOD = 1.5;
    const dots = [0, 1, 2].map(() => ({ y: 0, s: 0, sv: 0 }));
    let last = performance.now(), raf = 0, visible = true;

    // Speech-like envelope for the responding bulge: syllables and pauses.
    function speech(dt) {
      sylT += dt;
      if (sylT > sylDur) {
        sylT = 0;
        sylDur = .09 + Math.random() * .22;
        sylAmp = Math.random() < .18 ? 0 : .35 + Math.random() * .65;
      }
      syl += (sylAmp * Math.sin(Math.PI * Math.min(1, sylT / sylDur)) - syl) * Math.min(1, dt * 18);
      return syl;
    }

    function frame(now) {
      raf = 0;
      const dt = Math.min(.05, (now - last) / 1000);
      last = now;
      const k = 1 - Math.exp(-dt * 3.2);
      for (const key in target) cur[key] += (target[key] - cur[key]) * k;

      const sp = reduceMotion ? cur.speed * .3 : cur.speed;
      t += dt * sp;
      popV += (-pop * 90 - popV * 9) * dt;
      pop += popV * dt;
      flash = Math.max(0, flash - dt * .7);
      shake = Math.max(0, shake - dt * 1.2);

      // Thinking (ref 008d): every 5.2 s a short ~1.5 s burst of folds sweeps
      // across, opens into rings and is gone; the orb rests in between.
      // Timeline per 5.2 s cycle: folds sweep in (8-25%), curl into rings
      // (22-38%), fade (38-55%), rest.
      const ph = (t % 6.5) / 6.5;   // a burst, then a long settled rest
      const ss = (a, b, x) => { const v = Math.min(1, Math.max(0, (x - a) / (b - a))); return v * v * (3 - 2 * v); };
      const burst = ss(.05, .12, ph) * (1 - ss(.3, .44, ph));
      const curl = cur.ribPulse * ss(.17, .3, ph);
      const ribs = cur.ribs * (1 - cur.ribPulse + cur.ribPulse * burst);
      ribPhase += dt * sp * cur.ribSpd * (1 - cur.ribPulse + cur.ribPulse * (.3 + 2.5 * burst));

      // Responding (ref 1074): a swell that blooms on the right (2-4 o'clock),
      // drifts up to the top and relaxes; speech loudness rides on top of it.
      const voice = level ?? speech(dt);
      const tp = (t % 5.2) / 5.2;
      const swellT = Math.sin(Math.PI * tp);
      let bulge = cur.bulge * (.006 + .04 * swellT + .012 * voice);
      let bulgeAng = .75;   // upper right, 12-2 o'clock

      // Researching (ref f4c6): the bubble swells with layered rims, then a
      // droplet buds off near 1 o'clock, travels counter-clockwise to about
      // 7 o'clock and merges back.
      satLife = (satLife + dt * sp * .2) % 1;
      const swell = cur.sat * Math.sin(Math.PI * Math.min(1, satLife / .35));
      const drop = Math.min(1, Math.max(0, (satLife - .25) / .75));
      const life = Math.sin(Math.PI * drop);
      satAng = 1.05 + 3.1 * drop;
      if (cur.sat > .01) {            // the swell is lopsided, with a lobe at ~5 o'clock
        bulge += cur.sat * .015 * swell;
        if (cur.bulge < .01) bulgeAng = -1.6;   // soft lobe at 5-7 o'clock
      }
      const r = (R * (cur.radius + .09 * swell) * (1 + .012 * Math.sin(t * 1.3)) + pop * .06) * (1 - cur.dots)
        + (active === 'listening' && level != null ? level * .04 : 0);

      resize();
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform1f(U.uTime, t);
      gl.uniform1f(U.uR, r);
      gl.uniform1f(U.uWob, cur.wobble + Math.abs(pop) * .03 + swell * .012);
      gl.uniform1f(U.uRibs, ribs);
      gl.uniform1f(U.uRibPhase, ribPhase);
      gl.uniform1f(U.uBulge, bulge);
      gl.uniform1f(U.uBulgeAng, bulgeAng);
      gl.uniform1f(U.uCurl, curl);
      // Responding: the orb shrinks into three small orbs that hop in turn,
      // like a typing indicator; speech loudness lifts them a little higher.
      gl.uniform1f(U.uDots, cur.dots);
      // Each orb crouches, launches on a ballistic arc (stretching with its
      // speed), lands and wobbles flat-to-round on a spring before the next wave.
      const sway = .012 * Math.sin(t * .9);
      for (let i = 0; i < 3; i++) {
        const d = dots[i];
        const u = ((t / HOP_PERIOD - i * .14) % 1 + 1) % 1;
        const air = .42;
        let y = 0, target = 0;
        if (u < air) {
          const k = u / air, amp = .1 * (1 + .4 * voice);
          y = 4 * amp * k * (1 - k);
          const vy = 4 * amp * (1 - 2 * k) / (air * HOP_PERIOD);
          target = Math.min(.2, Math.abs(vy) * .28);
        } else if (u > .9) {
          target = -.1 * Math.sin(Math.PI * (u - .9) / .1);   // crouch before take-off
        }
        d.sv += ((target - d.s) * 320 - d.sv * 13) * dt;
        d.s += d.sv * dt;
        d.y = (y + sway) * cur.dots;
      }
      gl.uniform3f(U.uDotY, dots[0].y, dots[1].y, dots[2].y);
      gl.uniform3f(U.uDotS, dots[0].s * cur.dots, dots[1].s * cur.dots, dots[2].s * cur.dots);
      gl.uniform1f(U.uBloom, cur.bulge * (.1 + 1.1 * swellT + .3 * voice));
      gl.uniform1f(U.uSatR, cur.sat * .15 * R * Math.pow(life, .6));
      gl.uniform1f(U.uSatAng, satAng);
      gl.uniform1f(U.uSatDist, r * (.97 + .1 * life));
      gl.uniform1f(U.uLayers, cur.layers * (.6 + .4 * Math.sin(t * 1.7)) + swell * 1.3 + cur.ribs * cur.ribPulse * burst * .6 + Math.abs(pop) * 2);
      gl.uniform1f(U.uJitter, cur.jitter * (.35 + shake * 1.5));
      gl.uniform1f(U.uGlow, cur.glow * (1 + flash * .5) * (active === 'waiting' ? .85 + .15 * Math.sin(t * 3) : 1));
      gl.uniform1f(U.uHue, cur.hue);
      gl.uniform1f(U.uCool, cur.cool);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (visible) raf = requestAnimationFrame(frame);
    }

    // Stop drawing while the orb is scrolled out of view.
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
    });
    io.observe(canvas);
    raf = requestAnimationFrame(frame);

    function setState(name) {
      if (name === 'success') return trigger(name);
      if (!STATES[name]) return;
      active = name;
      target = { ...BASE, ...STATES[name] };
      if (name === 'error') shake = 1;
    }
    function trigger(name) {
      if (name === 'success') { popV += 2.6; flash = 1; }
    }
    return {
      setState, trigger,
      setLevel(v) { level = v; },
      get state() { return active; },
      destroy() { cancelAnimationFrame(raf); io.disconnect(); gl.getExtension('WEBGL_lose_context')?.loseContext(); },
    };
  }

  window.ThinkingOrb = { create, states: STATES, events: ['success'] };
})();
