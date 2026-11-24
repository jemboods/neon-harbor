// Fully synthesized WebAudio: engine, shots, stings, siren, rain and three radio
// stations. No audio files. Everything starts lazily on the first user gesture.
import { RADIO } from './config.js';

export function createAudio() {
  let ctx = null, master, engineOsc, engineOsc2, engineGain, engineFilter;
  let sirenOsc, sirenGain, rainGain, radioGain, radioTimer = 0, radioStep = 0, station = -1;
  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
    engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth';
    engineOsc2 = ctx.createOscillator(); engineOsc2.type = 'square';
    engineFilter = ctx.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 400;
    engineGain = ctx.createGain(); engineGain.gain.value = 0;
    engineOsc.connect(engineFilter); engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain); engineGain.connect(master);
    engineOsc.start(); engineOsc2.start();
    sirenOsc = ctx.createOscillator(); sirenOsc.type = 'triangle'; sirenOsc.frequency.value = 700;
    sirenGain = ctx.createGain(); sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain); sirenGain.connect(master); sirenOsc.start();
    const rainBuf = noiseBuffer();
    const rain = ctx.createBufferSource(); rain.buffer = rainBuf; rain.loop = true;
    const rainFilter = ctx.createBiquadFilter(); rainFilter.type = 'lowpass'; rainFilter.frequency.value = 900;
    rainGain = ctx.createGain(); rainGain.gain.value = 0;
    rain.connect(rainFilter); rainFilter.connect(rainGain); rainGain.connect(master); rain.start();
    radioGain = ctx.createGain(); radioGain.gain.value = 0.16; radioGain.connect(master);
  }
  function noiseBuffer() {
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  function tone(freq, dur, type, vol, when = 0, slide = 0) {
    if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    const t = ctx.currentTime + when;
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, freq, when = 0) {
    if (!ctx) return;
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer();
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq;
    const g = ctx.createGain(); const t = ctx.currentTime + when;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur + 0.02);
  }
  const SCALES = [[0, 3, 5, 7, 10], [0, 2, 4, 7, 9], [0, 3, 5, 6, 10]];
  const BASES = [110, 98, 130.8];
  return {
    unlock,
    setEngine(on, rpm, load) {
      if (!ctx) return;
      const f = 55 + rpm * 165 + load * 30;
      engineOsc.frequency.value = f;
      engineOsc2.frequency.value = f * 0.5 + 2;
      engineFilter.frequency.value = 300 + rpm * 1400;
      engineGain.gain.value = on ? 0.05 + load * 0.05 : 0;
    },
    setSiren(on, vol, t) {
      if (!ctx) return;
      sirenGain.gain.value = on ? vol * 0.05 : 0;
      if (on) sirenOsc.frequency.value = 660 + Math.sin(t * 5.2) * 190;
    },
    setRain(on) { if (ctx) rainGain.gain.value = on ? 0.12 : 0; },
    setRadio(idx) { station = idx; radioStep = 0; },
    get radioName() { return station < 0 ? '' : RADIO[station]; },
    /** Radio sequencer, called every frame with dt. */
    update(dt) {
      if (!ctx || station < 0) return;
      radioTimer -= dt;
      if (radioTimer > 0) return;
      radioTimer = 0.21;
      const s = radioStep++, scale = SCALES[station], base = BASES[station];
      if (s % 2 === 0) tone(base * (s % 16 === 14 ? 0.75 : 1), 0.2, 'triangle', 0.5, 0);
      if (s % 4 === 2) tone(base * 2 * Math.pow(2, scale[s % scale.length] / 12), 0.16, 'sine', 0.32, 0);
      noise(0.03, 0.05, 6000);
    },
    shot() { noise(0.09, 0.5, 1800); tone(160, 0.08, 'square', 0.25, 0, -90); },
    reload() { tone(300, 0.05, 'square', 0.15); tone(420, 0.05, 'square', 0.15, 0.09); },
    horn() { tone(370, 0.4, 'square', 0.2); tone(466, 0.4, 'square', 0.16); },
    cash() { tone(1320, 0.09, 'sine', 0.3); tone(1760, 0.14, 'sine', 0.3, 0.07); },
    text() { tone(880, 0.07, 'sine', 0.22); tone(1174, 0.09, 'sine', 0.22, 0.09); },
    slam() { noise(0.25, 0.6, 220); tone(70, 0.3, 'sine', 0.5, 0, -30); },
    sting(kind) {
      if (kind === 'passed') [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.3, i * 0.1));
      else if (kind === 'busted') [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.16, i * 0.14));
      else if (kind === 'wasted') [220, 185, 147, 98].forEach((f, i) => tone(f, 0.42, 'triangle', 0.3, i * 0.18));
      else if (kind === 'level') [659, 880].forEach((f, i) => tone(f, 0.18, 'sine', 0.28, i * 0.09));
    },
  };
}
