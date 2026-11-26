// Sound, all synthesized: an engine hum that follows the tachometer, wind that
// follows the airspeed, and small chimes for rings, refuels and arrivals. The context
// is created lazily on the first user gesture, as browsers require; M mutes.
import { AUDIO } from './config.js';

export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineSub = null;
  let engineGain = null;
  let windGain = null;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return false;
    }
    const master = ctx.createGain();
    master.gain.value = AUDIO.masterGain;
    master.connect(ctx.destination);

    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineSub = ctx.createOscillator();
    engineSub.type = 'square';
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 320;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter);
    engineSub.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
    engineSub.start();

    const noiseLength = ctx.sampleRate * 1.5;
    const noiseBuffer = ctx.createBuffer(1, noiseLength, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let index = 0; index < noiseLength; index += 1) data[index] = Math.random() * 2 - 1;
    const windSource = ctx.createBufferSource();
    windSource.buffer = noiseBuffer;
    windSource.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 640;
    windFilter.Q.value = 0.6;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    windSource.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    windSource.start();
    return true;
  }

  function tone(freq, delay, seconds, gain = 0.1, type = 'sine') {
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const start = ctx.currentTime + delay;
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(gain, start + 0.015);
    env.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    osc.connect(env);
    env.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + seconds + 0.05);
  }

  return {
    ensure,
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (muted && engineGain && ctx) {
        engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
        windGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      }
      return muted;
    },
    /** Per frame: the engine note tracks RPM, the wind tracks airspeed. */
    update(state) {
      if (!ctx) return;
      const t = ctx.currentTime;
      const rpmFrac = state.rpm / 2700;
      const engineLevel = muted || state.end !== '' ? 0 : 0.012 + rpmFrac * 0.05;
      engineGain.gain.setTargetAtTime(engineLevel, t, 0.09);
      engineOsc.frequency.setTargetAtTime(38 + rpmFrac * 105, t, 0.09);
      engineSub.frequency.setTargetAtTime(19 + rpmFrac * 52, t, 0.09);
      const windLevel = muted || state.onGround ? 0 : Math.min(0.06, (state.speed / 95) * 0.055);
      windGain.gain.setTargetAtTime(windLevel, t, 0.15);
    },
    ring() {
      tone(880, 0, 0.16, 0.09);
      tone(1318, 0.09, 0.22, 0.08);
    },
    refuel() {
      tone(520, 0, 0.14, 0.08);
      tone(660, 0.1, 0.18, 0.08);
    },
    arrived() {
      tone(523, 0, 0.2, 0.09);
      tone(659, 0.13, 0.2, 0.09);
      tone(784, 0.26, 0.34, 0.09);
    },
    crash() {
      tone(110, 0, 0.5, 0.14, 'sawtooth');
      tone(55, 0.05, 0.6, 0.12, 'square');
    },
  };
}
