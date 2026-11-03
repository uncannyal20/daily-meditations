/**
 * Source of assets/audio/ambient-loop.m4a — the original ambient pad used as
 * background music. It is no longer run live in the app (iPhones interrupt
 * live Web Audio on screen lock and when the timer bell plays); instead it is
 * rendered offline to a seamless 5-minute file. See README.md in this folder.
 */
  // An original, slowly evolving pad: four chords of 75s each (a 5-minute
  // cycle that repeats), cross-faded, through a soft low-pass and reverb,
  // with occasional quiet bell tones. Nothing is downloaded.
  class AmbientMusic {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.input = null;
      this.playing = false;
      this.timer = null;
      this.startTime = 0;
      this.nextChordAt = 0;
      this.chordIndex = 0;
      this.nextBellAt = 0;
      this.bellStep = 0;
      this.volume = 0.6;
      this.CHORD_SECONDS = 75;
      this.FADE = 14;
      // D, Bm, G, Asus2 (Hz). Low root + open voicing for a calm, prayerful colour.
      this.CHORDS = [
        [73.42, 110.0, 146.83, 220.0, 293.66, 369.99],
        [61.74, 92.5, 123.47, 185.0, 246.94, 293.66],
        [49.0, 98.0, 146.83, 196.0, 246.94, 293.66],
        [55.0, 110.0, 164.81, 220.0, 246.94, 329.63]
      ];
      this.BELLS = [587.33, 659.25, 739.99, 880.0, 987.77, 1174.66]; // D major pentatonic
    }

    ensureGraph() {
      if (this.ctx) return true;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return false;
      const ctx = this.ctx = new AudioCtx();

      this.master = ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(ctx.destination);

      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 1400;
      lowpass.Q.value = 0.3;

      // Generated reverb impulse: decaying stereo noise (~5s).
      const len = Math.floor(ctx.sampleRate * 5);
      const impulse = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = impulse.getChannelData(c);
        let seed = c ? 7 : 3;
        for (let i = 0; i < len; i++) {
          seed = (seed * 16807) % 2147483647;
          d[i] = ((seed / 2147483647) * 2 - 1) * Math.pow(1 - i / len, 3);
        }
      }
      const reverb = ctx.createConvolver();
      reverb.buffer = impulse;
      const wet = ctx.createGain(); wet.gain.value = 0.55;
      const dry = ctx.createGain(); dry.gain.value = 0.6;

      this.input = ctx.createGain();
      this.input.connect(lowpass);
      lowpass.connect(dry); dry.connect(this.master);
      lowpass.connect(reverb); reverb.connect(wet); wet.connect(this.master);
      return true;
    }

    setVolume(v) {
      this.volume = Math.max(0, Math.min(1, v));
      if (this.ctx && this.playing) {
        const now = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(now);
        this.master.gain.setTargetAtTime(this.targetGain(), now, 0.3);
      }
    }

    targetGain() {
      return 1.2 * this.volume * this.volume; // perceptual curve; full volume peaks well below clipping
    }

    start() {
      if (this.playing || !this.ensureGraph()) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.playing = true;
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(this.targetGain(), now + 6);
      this.nextChordAt = now + 0.1;
      this.nextBellAt = now + 9;
      this.schedule();
      this.timer = setInterval(() => this.schedule(), 1000);
    }

    stop(fadeSeconds = 4) {
      if (!this.playing) return;
      this.playing = false;
      clearInterval(this.timer);
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(0, now + fadeSeconds);
      // Silence any voices already scheduled ahead.
      const gen = this.generation = (this.generation || 0) + 1;
      setTimeout(() => {
        if (this.generation === gen && !this.playing && this.ctx.state === 'running') this.ctx.suspend();
      }, (fadeSeconds + 0.5) * 1000);
    }

    // Schedule up to ~90s ahead so throttled background timers can't cause gaps.
    schedule() {
      if (!this.playing) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const horizon = this.ctx.currentTime + 90;
      while (this.nextChordAt < horizon) {
        this.playChord(this.CHORDS[this.chordIndex], this.nextChordAt);
        this.chordIndex = (this.chordIndex + 1) % this.CHORDS.length;
        this.nextChordAt += this.CHORD_SECONDS;
      }
      while (this.nextBellAt < horizon) {
        const step = this.bellStep++;
        this.playBell(this.BELLS[(step * 3) % this.BELLS.length], this.nextBellAt);
        this.nextBellAt += 11 + ((step * 7) % 9); // irregular 11–19s spacing
      }
    }

    playChord(freqs, t) {
      const ctx = this.ctx;
      const dur = this.CHORD_SECONDS + this.FADE;
      freqs.forEach((f, i) => {
        const g = ctx.createGain();
        const level = (i === 0 ? 0.16 : 0.1) / Math.sqrt(1 + i * 0.6);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(level, t + this.FADE);
        g.gain.setValueAtTime(level, t + dur - this.FADE);
        g.gain.linearRampToValueAtTime(0, t + dur);
        g.connect(this.input);

        // Two slightly detuned voices per note give a soft, choral shimmer.
        [-4, 4].forEach((cents, k) => {
          const o = ctx.createOscillator();
          o.type = k ? 'triangle' : 'sine';
          o.frequency.value = f;
          o.detune.value = cents;
          const vg = ctx.createGain();
          vg.gain.value = k ? 0.35 : 0.65;
          o.connect(vg); vg.connect(g);
          o.start(t); o.stop(t + dur + 0.1);
        });

        // Very slow "breathing" swell.
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = 0.05 + i * 0.013;
        lfoGain.gain.value = level * 0.3;
        lfo.connect(lfoGain); lfoGain.connect(g.gain);
        lfo.start(t); lfo.stop(t + dur + 0.1);
      });
    }

    playBell(f, t) {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.035, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 7);
      o.connect(g); g.connect(this.input);
      o.start(t); o.stop(t + 7.2);
    }
  }


if (typeof module !== "undefined") module.exports = { AmbientMusic };
