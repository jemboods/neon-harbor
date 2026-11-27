// Sound, all synthesized: an engine hum that follows the tachometer, wind that
// follows the airspeed, and small chimes for rings, refuels and arrivals. The context
// is created lazily on the first user gesture, as browsers require; M mutes.
import { AUDIO } from './config.js';

export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineSub = null;
  let engineGain = null;
  let engineFilter = null;
  let windGain = null;
  let windFilter = null;
  let noiseBuffer = null;
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
    engineFilter = ctx.createBiquadFilter();
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
    noiseBuffer = ctx.createBuffer(1, noiseLength, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let index = 0; index < noiseLength; index += 1) data[index] = Math.random() * 2 - 1;
    const windSource = ctx.createBufferSource();
    windSource.buffer = noiseBuffer;
    windSource.loop = true;
    windFilter = ctx.createBiquadFilter();
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
      // The note opens up as the engine works: the filter follows the tach,
      // so spooling up the takeoff roll brightens as well as rises.
      engineFilter.frequency.setTargetAtTime(230 + rpmFrac * 430, t, 0.12);
      // The rush builds on a curve and climbs in pitch with the speed, so a
      // dive sounds fast and a final stays calm.
      const windFrac = Math.max(0, Math.min(1, state.speed / 95));
      const windLevel = muted || state.onGround ? 0 : 0.075 * Math.pow(windFrac, 1.35);
      windGain.gain.setTargetAtTime(windLevel, t, 0.15);
      windFilter.frequency.setTargetAtTime(360 + state.speed * 9.5, t, 0.2);
    },
    ring() {
      tone(880, 0, 0.16, 0.09);
      tone(1318, 0.09, 0.22, 0.08);
    },
    /**
     * The wheels meeting the strip, scaled by how hard they met it: a low
     * thud that drops away under the airframe, and a short chirp of tyre
     * noise. A greaser (severity near 0) is barely a whisper of either.
     */
    touchdown(severity = 0.5) {
      if (!ctx || muted) return;
      const sev = Math.max(0, Math.min(1, severity));
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(105, t);
      osc.frequency.exponentialRampToValueAtTime(42, t + 0.22);
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(0.05 + 0.24 * sev, t + 0.012);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      osc.connect(env);
      env.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.35);
      if (noiseBuffer && sev > 0.05) {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer;
        const band = ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = 840;
        band.Q.value = 1.6;
        const chirpEnv = ctx.createGain();
        chirpEnv.gain.setValueAtTime(0.0001, t);
        chirpEnv.gain.exponentialRampToValueAtTime(0.09 * sev, t + 0.01);
        chirpEnv.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
        src.connect(band);
        band.connect(chirpEnv);
        chirpEnv.connect(ctx.destination);
        src.start(t, 0.3, 0.12);
        src.stop(t + 0.12);
      }
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
