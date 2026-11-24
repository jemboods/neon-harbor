// Synthesized audio: every sound is WebAudio oscillators and filtered noise,
// so the game ships no audio files. The context wakes on the first user
// gesture (a title-screen click), as browsers require.

import { RADIO_STATIONS } from './config.js';

const MASTER_VOLUME = 0.5;
const ENGINE_BASE_HZ = 55;
const ENGINE_RPM_HZ = 145;
// Minor-scale patterns per station: bass steps and lead steps (null = rest),
// one bar of 16 steps each, looped by the lookahead sequencer.
const PATTERNS = {
  pulse: { bass: [0, -1, 0, -1, 3, -1, 0, -1, 0, -1, 0, -1, 5, -1, 3, -1], lead: [12, -1, -1, 15, -1, -1, 12, -1, 10, -1, -1, 12, -1, -1, -1, -1], root: 110 },
  harbor: { bass: [0, -1, -1, 0, -1, -1, 8, -1, 0, -1, -1, 0, -1, 5, -1, -1], lead: [15, -1, 12, -1, -1, 10, -1, -1, 12, -1, -1, -1, -1, -1, -1, -1], root: 98 },
  neon: { bass: [0, 0, -1, 0, -1, 0, 10, -1, 0, 0, -1, 0, -1, 8, -1, 7], lead: [19, -1, 15, -1, 12, -1, 15, -1, 17, -1, 15, -1, 12, -1, -1, -1], root: 87.3 },
};
const SEMITONE = (root, steps) => root * Math.pow(2, steps / 12);

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineNodes = null;
  let rainGain = null;
  let radioTimer = null;
  let radioStep = 0;
  let radioNextTime = 0;
  let station = -1; // index into RADIO_STATIONS, -1 = off

  /** Create the context and the always-on beds (engine, rain). Safe to call repeatedly. */
  function wake() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = MASTER_VOLUME;
    master.connect(ctx.destination);

    // Engine bed: two detuned saws through a lowpass, gain follows throttle.
    const oscA = ctx.createOscillator();
    oscA.type = 'sawtooth';
    const oscB = ctx.createOscillator();
    oscB.type = 'square';
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    oscA.start();
    oscB.start();
    engineNodes = { oscA, oscB, filter, gain };

    // Rain bed: looped white noise through a bandpass, gain set by the weather.
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer();
    noise.loop = true;
    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'bandpass';
    rainFilter.frequency.value = 900;
    rainGain = ctx.createGain();
    rainGain.gain.value = 0;
    noise.connect(rainFilter);
    rainFilter.connect(rainGain);
    rainGain.connect(master);
    noise.start();
  }

  function noiseBuffer() {
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  /** A short oscillator blip; the workhorse behind stings and shots. */
  function blip(freq, seconds, type, volume, slideTo) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + seconds);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + seconds);
  }

  /** A burst of filtered noise: gunshots, impacts, splashes. */
  function burst(seconds, volume, freq) {
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
    src.stop(ctx.currentTime + seconds);
  }

  function scheduleRadio() {
    if (!ctx || station < 0) return;
    const def = RADIO_STATIONS[station];
    const pattern = PATTERNS[def.id];
    const stepSeconds = 60 / def.bpm / 2; // eighth notes
    while (radioNextTime < ctx.currentTime + 0.18) {
      const step = radioStep % 16;
      const bassNote = pattern.bass[step];
      const leadNote = pattern.lead[step];
      if (bassNote >= 0) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = SEMITONE(pattern.root, bassNote);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.16, radioNextTime);
        gain.gain.exponentialRampToValueAtTime(0.001, radioNextTime + stepSeconds * 1.8);
        osc.connect(gain);
        gain.connect(master);
        osc.start(radioNextTime);
        osc.stop(radioNextTime + stepSeconds * 2);
      }
      if (leadNote >= 0) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = SEMITONE(pattern.root * 2, leadNote);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.07, radioNextTime);
        gain.gain.exponentialRampToValueAtTime(0.001, radioNextTime + stepSeconds * 1.4);
        osc.connect(gain);
        gain.connect(master);
        osc.start(radioNextTime);
        osc.stop(radioNextTime + stepSeconds * 1.5);
      }
      radioNextTime += stepSeconds;
      radioStep++;
    }
  }

  return {
    wake,
    /** Engine loudness/pitch from throttle (0..1) and speed (0..1); silent when both are 0. */
    engine(throttle, speedNorm) {
      if (!engineNodes) return;
      const t = ctx.currentTime;
      const hz = ENGINE_BASE_HZ + speedNorm * ENGINE_RPM_HZ + throttle * 22;
      engineNodes.oscA.frequency.setTargetAtTime(hz, t, 0.06);
      engineNodes.oscB.frequency.setTargetAtTime(hz * 0.5 + 3, t, 0.06);
      engineNodes.filter.frequency.setTargetAtTime(320 + speedNorm * 900, t, 0.08);
      engineNodes.gain.gain.setTargetAtTime(0.02 + throttle * 0.075 + speedNorm * 0.03, t, 0.09);
    },
    engineOff() {
      if (engineNodes) engineNodes.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    },
    /** Rain loudness, 0 (dry) to 1 (front overhead). */
    rain(level) {
      if (rainGain) rainGain.gain.setTargetAtTime(level * 0.12, ctx.currentTime, 0.4);
    },
    shot(kind) {
      if (kind === 'scatter') burst(0.22, 0.5, 900);
      else if (kind === 'smg') burst(0.07, 0.3, 2400);
      else burst(0.11, 0.38, 1700);
    },
    reload() {
      blip(320, 0.07, 'square', 0.12);
      setTimeout(() => blip(520, 0.07, 'square', 0.12), 110);
    },
    hit() {
      burst(0.16, 0.42, 500);
    },
    cash() {
      blip(880, 0.09, 'sine', 0.16);
      setTimeout(() => blip(1318, 0.14, 'sine', 0.16), 80);
    },
    jobDone() {
      blip(523, 0.12, 'triangle', 0.2);
      setTimeout(() => blip(784, 0.2, 'triangle', 0.2), 110);
    },
    fail() {
      blip(220, 0.3, 'sawtooth', 0.14, 110);
    },
    horn() {
      blip(370, 0.28, 'square', 0.1);
      blip(466, 0.28, 'square', 0.08);
    },
    click() {
      blip(660, 0.05, 'sine', 0.1);
    },
    /** Cycle the radio: off -> station 0 -> 1 -> 2 -> off. Returns the station name or null. */
    cycleRadio() {
      station = station + 1 >= RADIO_STATIONS.length ? -1 : station + 1;
      if (radioTimer) {
        clearInterval(radioTimer);
        radioTimer = null;
      }
      if (station >= 0 && ctx) {
        radioStep = 0;
        radioNextTime = ctx.currentTime + 0.05;
        radioTimer = setInterval(scheduleRadio, 90);
        return RADIO_STATIONS[station].name;
      }
      return null;
    },
    radioName: () => (station >= 0 ? RADIO_STATIONS[station].name : null),
  };
}
