import { chromium } from 'playwright';
// Renders one seamless loop of shot.html frame by frame, then encode with:
//   ffmpeg -framerate 60 -i frames/f%04d.png -c:v libx264 -preset veryslow -crf 18 \
//     -tune animation -pix_fmt yuv420p -movflags +faststart -an burger-curl-1600x1200.mp4
// Usage: node render.mjs [frames-dir]
import { mkdirSync } from 'node:fs';
const OUT = process.argv[2] ?? 'frames';
mkdirSync(OUT, { recursive: true });
const FPS = 60, HOLD = 1400, FAST = 520, SLOW = 2080;
const phases = [false, false, true];               // slow?
const starts = []; let T = 0;
for (const s of phases) { starts.push(T); T += 2 * (HOLD + (s ? SLOW : FAST)); }
const total = T, frames = Math.round(total / 1000 * FPS);
console.log('loop ms', total, 'frames', frames);

function stateAt(t) {
  let p = starts.length - 1; while (starts[p] > t) p--;
  const slow = phases[p], prevSlow = phases[(p + phases.length - 1) % phases.length];
  const m = slow ? SLOW : FAST, local = t - starts[p];
  let open = false, prevOpen = null, since = null;
  for (let k = 0; k < 2; k++) {
    const tt = k * (HOLD + m) + HOLD;
    if (local >= tt) { open = k === 0; prevOpen = !open; since = local - tt; }
  }
  return { open, prevOpen, since, slow, prevSlow, sincePhase: local };
}

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1632, height: 1232 }, deviceScaleFactor: 1 });
await p.goto(new URL('../shot.html', import.meta.url).href);
await p.evaluate(async () => {
  setPlaying(false);
  document.body.classList.add('hide-help');
  const s = document.createElement('style');
  s.textContent = '.notrans, .notrans * { transition: none !important; } .help { display: none !important; }';
  document.head.append(s);
  await document.fonts.ready;
});
await p.waitForTimeout(300);
const box = await p.locator('#stage').boundingBox();
const clip = { x: Math.round(box.x), y: Math.round(box.y), width: 1600, height: 1200 };
console.log(box);

for (let i = 0; i < frames; i++) {
  const st = stateAt(i * 1000 / FPS);
  await p.evaluate(st => {
    const B = document.body, S = document.getElementById('stage');
    B.classList.add('notrans');
    B.classList.toggle('slow', st.slow);
    B.classList.toggle('show-track', st.prevSlow);
    S.classList.toggle('open', st.prevOpen ?? st.open);
    document.getElementById('speed').textContent = st.slow ? '0.25×' : '1×';
    B.offsetWidth;
    B.classList.remove('notrans');
    B.offsetWidth;
    B.classList.toggle('show-track', st.slow);
    S.classList.toggle('open', st.open);
    B.offsetWidth;
    for (const a of document.getAnimations()) {
      a.pause();
      const isTrack = a.effect?.target?.classList?.contains('track');
      a.currentTime = isTrack ? st.sincePhase : (st.since ?? 1e6);
    }
  }, st);
  await p.screenshot({ path: `${OUT}/f${String(i).padStart(4, '0')}.png`, clip });
  if (i % 120 === 0) console.log('frame', i);
}
await b.close();
