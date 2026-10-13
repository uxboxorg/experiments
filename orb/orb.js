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
              uSatR, uSatAng, uSatDist, uLayers, uJitter, uGlow, uHue, uCool;

float h1(float n){ return fract(sin(n) * 43758.5453); }
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f*f*(3. - 2.*f);
  return mix(mix(h2(i), h2(i + vec2(1., 0.)), f.x),
             mix(h2(i + vec2(0., 1.)), h2(i + vec2(1., 1.)), f.x), f.y) * 2. - 1.;
}
float adiff(float a, float b){ return atan(sin(a - b), cos(a - b)); }
float smin(float a, float b, float k){
  float h = clamp(.5 + .5*(b - a)/k, 0., 1.);
  return mix(b, a, h) - k*h*(1. - h);
}

// Silhouette radius at screen angle th: slow wobble, one-sided bulge, shiver.
float radiusAt(float th){
  vec2 c = vec2(cos(th), sin(th));
  float w = vn(c*1.4 + vec2(uTime*.31, 1.7)) + .5*vn(c*2.9 + vec2(4.1, -uTime*.43));
  float b = exp(-pow(adiff(th, uBulgeAng)/.5, 2.));
  float j = vn(c*7. + vec2(uTime*7., 0.));
  return uR * (1. + uWob*w + uBulge*b + uJitter*.012*j);
}
float sdMain(vec2 p){ return length(p) - radiusAt(atan(p.y, p.x)); }
float sdSat(vec2 p){ return length(p - vec2(cos(uSatAng), sin(uSatAng))*uSatDist) - uSatR; }
float sdf(vec2 p){
  float d = sdMain(p);
  if (uSatR > .001) d = smin(d, sdSat(p), .07);
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
  if (uSatR > .001) Rloc = mix(Rloc, uSatR, clamp(.5 + .5*(sdMain(p) - sdSat(p))/.07, 0., 1.));
  float q = clamp(1. + min(d, 0.)/Rloc, 0., 1.);
  float inside = smoothstep(px, -px, d);

  float a = atan(n.y, n.x) + .3*vn(n*1.8 + vec2(t*.15, 0.));
  float qq = q + .03*vn(n*3. + vec2(t*.2, 2.));

  // Back wall: a wide warm crescent on the right that thins over the top, a
  // small warm patch lower left and a violet edge top left (the refs' rest frame).
  float right = smoothstep(-.1, .9, cos(a + .2));
  float top = smoothstep(.3, 1., cos(a - 1.5));
  float lowLeft = smoothstep(.6, 1., cos(a - 3.6));
  float band = smoothstep(mix(.87, .64, right), .95, qq) * (1. - .55*smoothstep(.975, 1., q));
  band *= band;
  float warmM = right + .6*top + 1.2*lowLeft;
  vec3 warmMid = vec3(1., .42, .05), warmOut = vec3(1., .78, .35);
  vec3 warm = mix(vec3(.7, .08, .02), warmMid, smoothstep(.72, .87, qq));
  warm = mix(warm, warmOut, smoothstep(.9, .99, qq));
  warm = mix(warm, vec3(1., .12, .22), uHue);
  warm = mix(warm, vec3(.35, .65, 1.), uCool);
  vec3 viol = mix(vec3(.45, .25, 1.), vec3(.25, .5, 1.), uCool);
  float violM = smoothstep(.55, 1., cos(a - 2.2)) + .3*smoothstep(.8, 1., cos(a + 1.75));
  float violBand = smoothstep(.8, .86, qq) * (1. - smoothstep(.88, .93, qq));
  vec3 col = warm*warmM*band*1.9 + viol*violM*violBand*1.1;
  col += film(.3 + .5*q + .3*vn(p*2.5 + t*.2) + uHue*.3) * pow(q, 24.) * .3;
  // Front wall: a cyan-white film band just inside the edge, widest top left,
  // breaking into iridescent colour along the bottom.
  vec3 fCol = mix(vec3(.55, .9, 1.), film(atan(n.y, n.x)*.5 + q*2. + t*.05), .3 + .45*smoothstep(.2, -.9, n.y));
  col += fCol * smoothstep(.9, .985, q) * (.3 + .7*smoothstep(-.3, .9, cos(a - 2.))) * .7;
  // Hot highlight on the outer part of the crescent, upper right.
  col += mix(vec3(1., .93, .75), warm, .3) * smoothstep(.55, 1., cos(a - .8)) * smoothstep(.88, .965, q) * (1. - smoothstep(.975, 1., q)) * .9;

  // Meridian folds (ref 008d): pole-to-pole creases on a turning sphere. A
  // meridian at longitude phi projects to x = R sin(phi) sqrt(1 - y^2), so the
  // lines start as vertical streaks and open into rings as they turn.
  if (uRibs > .001) {
    float yy = clamp(p.y/uR, -1., 1.);
    float wy = sqrt(max(1. - yy*yy, 1e-3));
    float u = p.x / (uR*wy);
    vec3 rc = vec3(0.);
    for (int k = 0; k < 6; k++) {
      float fk = float(k);
      float phi = uRibPhase*(1. + .17*fk) + fk*1.05;
      float x0 = sin(phi);
      float dist = abs(u - x0) * uR * wy;
      float w = max(px, .003 + .006*abs(cos(phi)));
      float L = exp(-dist*dist/(w*w)) + .3*exp(-dist*dist/(16.*w*w));
      vec3 lc = mix(vec3(.6, .35, 1.), warmMid, smoothstep(-.6, .6, x0));
      rc += mix(lc, warmOut, L*.5) * L * (.5 + .5*cos(phi));
    }
    col += rc * uRibs * 1.4 * smoothstep(1., .8, abs(yy));
  }

  // Bright swell where the surface bulges (ref 1074).
  col += warmOut * exp(-pow(adiff(a, uBulgeAng)/.35, 2.)) * smoothstep(.6, .97, q) * min(uBulge*14., 1.2);

  // Small dents drifting over the film (ref 0e18).
  float hw = max(px*1.1, .0035);
  if (uDimples > .001) {
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float ang = t*(.21 + .05*fi)*(mod(fi, 2.)*2. - 1.) + fi*1.26;
      float rad = uR*(.76 + .18*(.5 + .5*sin(t*(.37 + .07*fi) + fi*2.)));
      float r = (.014 + .012*h1(fi + 1.)) * uDimples * (.6 + .4*sin(t*1.7 + fi));
      float dd = length(p - vec2(cos(ang), sin(ang))*rad) - r;
      col *= 1. - .85*smoothstep(px, -px, dd);
      col += film(fi*.2 + t*.1) * exp(-pow(dd/(hw*1.2), 2.)) * .9 * smoothstep(0., .004, r);
    }
  }

  col *= inside;

  // Front wall: hairline rims in white-cyan with a little iridescence.
  // More colour along the bottom of the rim, near-white on the top and left.
  vec3 rimCol = mix(vec3(.7, .95, 1.), film(atan(n.y, n.x)*.32 + t*.07), .25 + .5*smoothstep(.2, -.9, n.y));
  col += rimCol * (1.3*exp(-pow((d + .006)/hw, 2.)) + .5*exp(-pow((d + .02)/(hw*1.4), 2.)));

  // Extra offset rims while the film is busy (ref f4c6 swell).
  if (uLayers > .001) {
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      vec2 o = .022*uLayers*vec2(cos(t*1.3 + fi*2.1), sin(t*1.1 + fi*2.7));
      vec2 po = p - o;
      float dl = length(po) - radiusAt(atan(po.y, po.x))*(1. + .012*uLayers*(fi + 1.));
      col += rimCol * .45 * uLayers * exp(-pow(dl/hw, 2.));
    }
  }

  col *= uGlow;
  col = 1. - exp(-col*1.2);
  gl_FragColor = vec4(col, max(col.r, max(col.g, col.b)));
}`;

  // Shape targets per state. The orb eases toward the active state's values.
  const BASE = {
    radius: 1, wobble: .008, ribs: 0, ribSpd: 1, ribPulse: 0, dimples: 0, bulge: 0,
    sat: 0, layers: 0, jitter: 0, glow: 1, hue: 0, cool: 0, speed: 1,
  };
  const STATES = {
    idle:        { label: 'Idle',        hint: 'Ready, nothing happening', speed: .6 },
    listening:   { label: 'Listening',   hint: 'User is typing or speaking',
                   radius: 1.03, wobble: .01, dimples: 1, glow: 1.08, speed: .9 },
    thinking:    { label: 'Thinking',    hint: 'Reasoning before answering',
                   wobble: .01, ribs: 1, ribSpd: .9, ribPulse: 1 },
    researching: { label: 'Researching', hint: 'Searching the web, reading sources',
                   radius: 1.03, wobble: .01, sat: 1, layers: .6 },
    working:     { label: 'Working',     hint: 'Running tools, editing files',
                   wobble: .012, ribs: .8, ribSpd: 2.6, layers: 1, glow: 1.08, speed: 1.2 },
    typing:      { label: 'Responding',  hint: 'Streaming the answer', bulge: 1 },
    waiting:     { label: 'Needs you',   hint: 'Waiting for approval or input',
                   radius: .96, wobble: .005, glow: .75, cool: .75, speed: .45 },
    error:       { label: 'Error',       hint: 'Something failed',
                   radius: .95, wobble: .012, jitter: 1, glow: .9, hue: 1 },
  };
  const UNIFORMS = ['uRes', 'uTime', 'uR', 'uWob', 'uRibs', 'uRibPhase', 'uDimples', 'uBulge',
    'uBulgeAng', 'uSatR', 'uSatAng', 'uSatDist', 'uLayers', 'uJitter', 'uGlow', 'uHue', 'uCool'];
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
    let t = 0, ribPhase = 0, satAng = -Math.PI / 2, satLife = 0;
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
      ribPhase += dt * sp * cur.ribSpd;
      popV += (-pop * 90 - popV * 9) * dt;
      pop += popV * dt;
      flash = Math.max(0, flash - dt * .7);
      shake = Math.max(0, shake - dt * 1.2);

      // Thinking: folds sweep in and fade out on a ~5 s cycle, like the ref clip.
      const wave = Math.pow(.5 - .5 * Math.cos(t * 2 * Math.PI / 5.2), 1.5);
      const ribs = cur.ribs * (1 - cur.ribPulse + cur.ribPulse * wave);

      const voice = level ?? speech(dt);
      const bulge = cur.bulge * (.012 + .07 * voice);

      // Researching: a droplet buds off the rim, travels round and merges back.
      satAng += dt * sp * cur.sat * 1.2;
      satLife = (satLife + dt * sp * .22) % 1;
      const life = Math.sin(Math.PI * satLife);
      const r = R * cur.radius * (1 + .012 * Math.sin(t * 1.3)) + pop * .06
        + (active === 'listening' && level != null ? level * .04 : 0);

      resize();
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform1f(U.uTime, t);
      gl.uniform1f(U.uR, r);
      gl.uniform1f(U.uWob, cur.wobble + Math.abs(pop) * .03);
      gl.uniform1f(U.uRibs, ribs);
      gl.uniform1f(U.uRibPhase, ribPhase);
      gl.uniform1f(U.uDimples, cur.dimples * (level != null && active === 'listening' ? .4 + level * 1.6 : 1));
      gl.uniform1f(U.uBulge, bulge);
      gl.uniform1f(U.uBulgeAng, -.15 + .5 * Math.sin(t * .35));
      gl.uniform1f(U.uSatR, cur.sat * .15 * R * Math.pow(life, .6));
      gl.uniform1f(U.uSatAng, satAng);
      gl.uniform1f(U.uSatDist, r * (.93 + .17 * life));
      gl.uniform1f(U.uLayers, cur.layers * (.6 + .4 * Math.sin(t * 1.7)) + Math.abs(pop) * 2);
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
