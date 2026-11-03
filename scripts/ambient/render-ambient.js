// Usage: node render-ambient.js <dir-with-playwright-core> <output-dir>
const { chromium } = require(process.argv[2] + '/node_modules/playwright-core');
const fs = require('fs');
const out = process.argv[3];
(async () => {
  const src = fs.readFileSync(__dirname + '/ambient-generator.js', 'utf8');
  const cls = src.slice(src.indexOf('  class AmbientMusic {'), src.indexOf('if (typeof module'));
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  const p = await b.newPage();
  await p.goto('about:blank');
  const n = await p.evaluate(async (cls) => {
    const LOOP = 300, TAIL = 20, SR = 44100;
    const off = new OfflineAudioContext(2, (LOOP + TAIL) * SR, SR);
    const AmbientMusic = new Function('return (' + cls.trim() + ')')();
    const m = new AmbientMusic();
    window.AudioContext = function () { return off; };
    off.resume = () => Promise.resolve();
    m.ensureGraph();
    m.volume = 1; m.playing = true;
    m.master.gain.setValueAtTime(m.targetGain(), 0);
    m.nextChordAt = 0; m.nextBellAt = 9;
    // schedule exactly one 5-minute cycle (4 chords) + bells within it
    for (let i = 0; i < 4; i++) { m.playChord(m.CHORDS[i], i * m.CHORD_SECONDS); }
    for (let t = 9, k = 0; t < LOOP - 7; k++) { m.playBell(m.BELLS[(k * 3) % m.BELLS.length], t); t += 11 + ((k * 7) % 9); }
    const buf = await off.startRendering();
    // Fold the tail (chord 4 fade-out + reverb) onto the start -> seamless loop
    const L = LOOP * SR, chans = [];
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c), o = new Float32Array(L);
      o.set(d.subarray(0, L));
      for (let i = 0; i < TAIL * SR; i++) o[i] += d[L + i];
      chans.push(o);
    }
    // But chord 1 at t=0 fades in from silence while in a loop the previous
    // chord (4) is fading out — the fold supplies exactly that overlap.
    const pcm = new Int16Array(L * 2);
    let peak = 0; for (const o of chans) for (let i = 0; i < L; i++) peak = Math.max(peak, Math.abs(o[i]));
    const g = 0.89 / peak;
    for (let i = 0; i < L; i++) { pcm[2 * i] = Math.round(chans[0][i] * g * 32767); pcm[2 * i + 1] = Math.round(chans[1][i] * g * 32767); }
    window.__pcm = new Uint8Array(pcm.buffer);
    return window.__pcm.length;
  }, cls);
  // pull in chunks
  const fd = fs.openSync(out + '/ambient.raw', 'w');
  const CH = 4 * 1024 * 1024;
  for (let off = 0; off < n; off += CH) {
    const b64 = await p.evaluate(([o, c]) => { const s = window.__pcm.subarray(o, o + c); let bin = ''; for (let i = 0; i < s.length; i += 0x8000) bin += String.fromCharCode.apply(null, s.subarray(i, i + 0x8000)); return btoa(bin); }, [off, CH]);
    fs.writeSync(fd, Buffer.from(b64, 'base64'));
  }
  fs.closeSync(fd);
  console.log('bytes', n);
  await b.close();
})();
