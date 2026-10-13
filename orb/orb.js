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
uniform float uTime, uR, uWob, uRibs, uRibPhase, uDimples, uBulge, uBulgeAng,
              uSatR, uSatAng, uSatDist, uLayers, uJitter, uGlow, uHue, uCool, uCurl, uBloom;

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
  float rib = uRibs * .006 * sin(8.*th + uRibPhase*3.);
  return uR * (1. + uWob*w + uBulge*b + uJitter*.012*j + rib);
}
float sdMain(vec2 p){ return length(p) - radiusAt(atan(p.y, p.x)); }
// Droplet: an ellipse stretched along the rim (about 2:1).
float sdSat(vec2 p){
  vec2 dir = vec2(cos(uSatAng), sin(uSatAng));
  vec2 l = p - dir*uSatDist;
  return length(vec2(dot(l, vec2(-dir.y, dir.x))*.5, dot(l, dir)*1.15)) - uSatR;
}
float sdf(vec2 p){
  float d = sdMain(p);
  if (uSatR > .001) d = smin(d, sdSat(p), .13);
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

void main(){
  float scale = .5 * min(uRes.x, uRes.y);
  vec2 p = (gl_FragCoord.xy - .5*uRes) / scale;
  float px = 1. / scale;
  if (length(p) > uR*1.55) { gl_FragColor = vec4(0.); return; }
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
  float q = clamp(1. + min(d, 0.)/Rloc, 0., 1.);
  float inside = smoothstep(px, -px, d);

  // Screen angle of the surface (0 = 3 o'clock, pi/2 = 12 o'clock), with a
  // slow shimmer so the colour bands drift like a real film.
  float a = atan(n.y, n.x) + .12*vn(n*1.8 + vec2(t*.15, 0.));
  float qq = q + .02*vn(n*3. + vec2(t*.2, 2.));
  // Soft angular range [a0, a1] (radians, may wrap) with edge softness sf.
  #define AR(a0, a1, sf) arange(a, a0, a1, sf)
  #define QB(a0, a1, b0, b1) (smoothstep(a0, a1, qq) * (1. - smoothstep(b0, b1, qq)))

  // Colour map measured from the reference rest frame, unwrapped to angle x
  // depth (q = r/R). Angles: 0 = 3 o'clock, counter-clockwise.
  vec3 cyan = vec3(.35, .85, 1.);
  vec3 vi = mix(vec3(.5, .22, 1.), vec3(.3, .5, 1.), uCool);
  vec3 gold = vec3(1., .86, .45), orange = vec3(1., .58, .12), ember = vec3(.8, .16, .03);
  vec3 col = vec3(0.);

  // Warm crescent on the inner side, 1 to 5 o'clock only, widest at 2-4 and
  // thinning to nothing near 12 and 6. Across its width: yellow-white at the
  // rim, amber, then deep red-orange fading softly into the black centre.
  float crW = exp(-pow(adiff(a, .05)/.75, 2.));
  float crIn = .86 - .15*crW;
  vec3 cr = mix(ember, orange, smoothstep(crIn, crIn + .1, qq));
  cr = mix(cr, gold, smoothstep(.86, .93, qq));
  cr = mix(cr, vec3(1., .95, .8), smoothstep(.93, .97, qq) * .6);
  col += cr * AR(-1.1, 1.15, .3) * smoothstep(crIn - .02, crIn + .08, qq) * (1. - smoothstep(.95, .985, qq))
       * (.6 + 2.5*crW);
  // Broad cyan-white sheen across the top, 11 to 1 o'clock, warming towards 1.
  vec3 sheen = mix(mix(cyan, vec3(1.), .5), vec3(1., .92, .7), smoothstep(1.6, 1.0, a));
  col += sheen * AR(.95, 2.3, .3) * QB(.87, .91, .955, .98) * 1.5;
  // Soft violet band under the sheen at 10-11 o'clock.
  col += vi * AR(1.85, 2.75, .3) * QB(.78, .84, .87, .9) * 1.;
  // Faint amber ember at 8-9 o'clock.
  col += mix(ember, orange, .5) * AR(3.2, 3.75, .2) * QB(.78, .84, .88, .92) * .4;

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
    for (int k = 0; k < 6; k++) {
      float fk = float(k);
      float phi = mix(uRibPhase*(1. + .11*fk) + fk*.8, .55 + .17*fk, uCurl);
      vec2 off = uCurl * vec2(.05, .03) * fk / 3.;
      float x0 = sin(phi);
      float u = (p.x - off.x)/(uR*clamp(sqrt(max(1. - pow((p.y - off.y)/uR, 2.), 1e-3)), .03, 1.));
      float dist = min(abs(u - x0), abs(u + x0)) * uR * wy;   // both halves of the great circle
      float w = max(px, mix(.016 + .02*abs(cos(phi)), .007, uCurl));
      float L = exp(-pow(dist/w, 4.));
      // Curl: the folds close into concentric rings offset towards 2 o'clock.
      vec2 rp = (p - vec2(.12 + .04*fk, .05)) / vec2(.88, 1.);
      float ringD = abs(length(rp) - uR*(.4 + .13*fk));
      float arc = smoothstep(-.35, .45, rp.x/max(length(rp), 1e-3));   // brighter on the right, open on the left
      L = mix(L, exp(-pow(ringD/(.007 + .006*arc), 2.)) * arc, uCurl);
      // Warm on the right, violet on the left, a thin pale core; folds crowd
      // towards the sides, so the ones crossing the middle stay dim.
      float side = (p.x - off.x) / uR;
      vec3 lc = mix(vi, mix(orange, gold, .45), smoothstep(-.3, .3, side));
      lc = mix(lc, vec3(1., .93, .8), .75*exp(-dist*dist/(.2*w*w)));
      float keep = 1. - uCurl*step(2.5, fk);   // only 3 rings remain once curled
      rc += lc * L * mix(.45 + .55*abs(x0), 1., uCurl) * keep;
    }
    col += rc * uRibs * 2.8 * smoothstep(1., .8, abs(yy));
  }

  // Responding (ref 1074): pink-lavender to near-white flare where it swells.
  vec3 bloom = mix(vec3(1., .72, .95), vec3(1.), .35);
  col += bloom * exp(-pow(adiff(a, uBulgeAng)/.5, 2.)) * QB(.84, .89, .955, .98) * uBloom * .8;

  // Droplet (ref f4c6): filled with the same film, not hollow.
  col *= 1. - .8*satW;   // the droplet is a clear lens: dark inside, lit by its rim
  col += vi * satW * smoothstep(.5, .95, q) * .25;

  // Listening (ref 0e18): small dark dents drifting along the bright band,
  // each fading in and out with a thin bright edge; 1-2 visible at a time.
  if (uDimples > .001) {
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      float cyc = t*.23 + fi*.25;
      float life = pow(max(0., sin(6.2832*fract(cyc))), .7);
      float slot = floor(mod(fi + floor(cyc), 3.));
      float ang = (slot < .5 ? 1.75 : slot < 1.5 ? .05 : 3.6) + (fract(cyc) - .5)*(mod(fi, 2.) < .5 ? .6 : -.6);
      vec2 c = vec2(cos(ang), sin(ang)) * uR * (slot < .5 ? .93 : .82);
      float r = (.026 + .006*h1(fi + 4.)) * uDimples * life;
      float dd = length(p - c) - r;
      col *= 1. - .9*smoothstep(px, -px, dd);
      vec2 rd = normalize(p - c + 1e-5);
      col += vec3(.9, .97, 1.) * exp(-pow(dd/(1.2*px + .0015), 2.)) * smoothstep(.2, .9, dot(rd, vec2(-.6, .8))) * 1.3 * life;
    }
  }

  col *= inside;

  // Front wall: crisp white-cyan hairlines with black gaps, brightest and
  // stacked apart at 7-11 o'clock, fading out at 2-5 o'clock, with a thin
  // violet-teal fringe along the bottom.
  float hw = max(px*.8, .0021);
  float ra = atan(n.y, n.x);
  float rimI = .3 + 1.5*arange(ra, 2.3, 4.2, .35) + .6*arange(ra, 1.1, 2.3, .3) + .35*arange(ra, 4.2, 5.4, .2);
  vec3 tint = vec3(.88, .97, 1.);
  tint = mix(tint, film(ra*1.4 + .2), arange(ra, 4.1, 5.4, .2));
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 o = vec2(-.02, -.007) * fi * (1. + uLayers*1.5)
           + uLayers * .01 * vec2(cos(t*1.3 + fi*2.1), sin(t*1.1 + fi*2.7));
    vec2 po = p - o;
    float ta = atan(po.y, po.x);
    float dl = length(po) - radiusAt(ta) * (1. - .008*fi + .012*uLayers*fi);
    if (uSatR > .001 && i == 0) dl = smin(dl, sdSat(p), .13);
    float sp = hw*.5;
    vec3 g = vec3(exp(-pow((dl - sp)/hw, 2.)), exp(-pow(dl/hw, 2.)), exp(-pow((dl + sp)/hw, 2.)));
    float side = i == 0 ? rimI : arange(ta, 2.4, 4.4, .3) * (1.1 - .25*fi) * (1. + uLayers);
    col += g * tint * side * 1.5;
  }

  col *= uGlow;
  // Hue-preserving tone curve keeps the film saturated where it is bright.
  float mx = max(col.r, max(col.g, col.b));
  col *= (1. - exp(-mx*1.25)) / max(mx, 1e-4);
  gl_FragColor = vec4(col, max(col.r, max(col.g, col.b)));
}`;

  // Shape targets per state. The orb eases toward the active state's values.
  const BASE = {
    radius: 1, wobble: .006, ribs: 0, ribSpd: 1, ribPulse: 0, dimples: 0, bulge: 0,
    sat: 0, layers: 0, jitter: 0, glow: 1, hue: 0, cool: 0, speed: 1,
  };
  const STATES = {
    idle:        { label: 'Idle',        hint: 'Ready, nothing happening', wobble: .004, speed: .6 },
    listening:   { label: 'Listening',   hint: 'User is typing or speaking',
                   radius: 1.02, wobble: .016, dimples: 1, glow: 1.08, speed: .9 },
    thinking:    { label: 'Thinking',    hint: 'Reasoning before answering',
                   wobble: .01, ribs: 1, ribSpd: 1, ribPulse: 1 },
    researching: { label: 'Researching', hint: 'Searching the web, reading sources',
                   wobble: .012, sat: 1 },
    working:     { label: 'Working',     hint: 'Running tools, editing files',
                   wobble: .012, ribs: .7, ribSpd: 2.6, layers: .5, glow: 1.08, speed: 1.2 },
    typing:      { label: 'Responding',  hint: 'Streaming the answer', bulge: 1 },
    waiting:     { label: 'Needs you',   hint: 'Waiting for approval or input',
                   radius: .96, wobble: .005, glow: .75, cool: .75, speed: .45 },
    error:       { label: 'Error',       hint: 'Something failed',
                   radius: .95, wobble: .012, jitter: 1, glow: .9, hue: 1 },
  };
  const UNIFORMS = ['uRes', 'uTime', 'uR', 'uWob', 'uRibs', 'uRibPhase', 'uDimples', 'uBulge',
    'uBulgeAng', 'uSatR', 'uSatAng', 'uSatDist', 'uLayers', 'uJitter', 'uGlow', 'uHue', 'uCool', 'uCurl', 'uBloom'];
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
      const ph = (t % 5.2) / 5.2;
      const ss = (a, b, x) => { const v = Math.min(1, Math.max(0, (x - a) / (b - a))); return v * v * (3 - 2 * v); };
      const burst = ss(.06, .16, ph) * (1 - ss(.38, .55, ph));
      const curl = cur.ribPulse * ss(.22, .38, ph);
      const ribs = cur.ribs * (1 - cur.ribPulse + cur.ribPulse * burst);
      ribPhase += dt * sp * cur.ribSpd * (1 - cur.ribPulse + cur.ribPulse * (.3 + 2.5 * burst));

      // Responding (ref 1074): a swell that blooms on the right (2-4 o'clock),
      // drifts up to the top and relaxes; speech loudness rides on top of it.
      const voice = level ?? speech(dt);
      const tp = (t % 5.2) / 5.2;
      const swellT = Math.sin(Math.PI * tp);
      let bulge = cur.bulge * (.006 + .022 * swellT + .01 * voice);
      let bulgeAng = .45 - .5 * ss(.3, .8, tp);   // eases from 2 o'clock to 3

      // Researching (ref f4c6): the bubble swells with layered rims, then a
      // droplet buds off near 1 o'clock, travels counter-clockwise to about
      // 7 o'clock and merges back.
      satLife = (satLife + dt * sp * .2) % 1;
      const swell = cur.sat * Math.sin(Math.PI * Math.min(1, satLife / .35));
      const drop = Math.min(1, Math.max(0, (satLife - .25) / .75));
      const life = Math.sin(Math.PI * drop);
      satAng = 1.05 + 3.1 * drop;
      if (cur.sat > .01) {            // the swell is lopsided, with a lobe at ~5 o'clock
        bulge += cur.sat * .04 * swell;
        if (cur.bulge < .01) bulgeAng = -1.6;   // soft lobe at 5-7 o'clock
      }
      const r = R * (cur.radius + .09 * swell) * (1 + .012 * Math.sin(t * 1.3)) + pop * .06
        + (active === 'listening' && level != null ? level * .04 : 0);

      resize();
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform1f(U.uTime, t);
      gl.uniform1f(U.uR, r);
      gl.uniform1f(U.uWob, cur.wobble + Math.abs(pop) * .03 + swell * .04);
      gl.uniform1f(U.uRibs, ribs);
      gl.uniform1f(U.uRibPhase, ribPhase);
      gl.uniform1f(U.uDimples, cur.dimples * (level != null && active === 'listening' ? .4 + level * 1.6 : 1));
      gl.uniform1f(U.uBulge, bulge);
      gl.uniform1f(U.uBulgeAng, bulgeAng);
      gl.uniform1f(U.uCurl, curl);
      gl.uniform1f(U.uBloom, cur.bulge * (.25 + .9 * swellT + .4 * voice));
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
