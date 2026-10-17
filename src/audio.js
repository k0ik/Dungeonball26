import * as THREE from 'three';
import { AUDIO } from './config.js';

// Non-positional SFX through THREE.Audio. The clips are synthesized placeholders until
// a CC0 pack (e.g. Kenney) is dropped in — swapping a clip doesn't change any hookups.
export function createAudio(camera) {
  const listener = new THREE.AudioListener();
  camera.add(listener);
  listener.setMasterVolume(AUDIO.masterVolume);
  const ctx = listener.context;

  const clips = {
    launch: synth(ctx, 0.22, (t, d) => {
      // Soft "thock" plus a short airy whoosh.
      const thock = Math.sin(2 * Math.PI * (180 - 260 * t) * t) * Math.exp(-t * 40);
      const whoosh = (Math.random() * 2 - 1) * Math.exp(-t * 14) * 0.25 * (t / d < 0.1 ? t / (0.1 * d) : 1);
      return thock * 0.9 + whoosh;
    }),
    bounce: synth(ctx, 0.12, (t) => {
      // Dull wooden knock.
      const body = Math.sin(2 * Math.PI * 140 * t) * Math.exp(-t * 55);
      const click = (Math.random() * 2 - 1) * Math.exp(-t * 400) * 0.6;
      return body + click;
    }),
  };

  const voices = (clip, n) =>
    Array.from({ length: n }, () => new THREE.Audio(listener).setBuffer(clip));
  const pools = { launch: voices(clips.launch, 2), bounce: voices(clips.bounce, AUDIO.bouncePoolSize) };
  const next = { launch: 0, bounce: 0 };

  function play(name, volume = 1, rate = 1) {
    if (ctx.state !== 'running') return;
    const pool = pools[name];
    const voice = pool[next[name]++ % pool.length];
    if (voice.isPlaying) voice.stop();
    voice.setVolume(volume);
    voice.setPlaybackRate(rate);
    voice.play();
  }

  return {
    // Browsers keep audio suspended until a user gesture.
    unlock() {
      if (ctx.state !== 'running') ctx.resume();
    },
    launch(power) {
      play('launch', 0.4 + 0.6 * power, 0.9 + 0.3 * power);
    },
    bounce(speed, maxSpeed) {
      if (speed < AUDIO.bounceMinSpeed) return;
      const k = Math.min(1, speed / maxSpeed);
      play('bounce', 0.15 + 0.85 * k, 0.85 + 0.4 * k + Math.random() * 0.08);
    },
  };
}

function synth(ctx, duration, fn) {
  const len = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = fn(i / ctx.sampleRate, duration);
  // Short fade-out to avoid a click at the end.
  const fade = Math.min(len, Math.floor(ctx.sampleRate * 0.01));
  for (let i = 0; i < fade; i++) data[len - 1 - i] *= i / fade;
  return buffer;
}
