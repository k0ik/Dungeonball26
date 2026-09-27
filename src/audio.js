// Non-positional SFX through THREE.AudioListener / THREE.Audio.
// Sounds are synthesized placeholders for now; to swap in CC0 files later,
// load them with THREE.AudioLoader and hand the buffers to register() under the
// same event names. Gameplay code only ever calls sfx.play(name, volume).

import * as THREE from 'three';
import { CONFIG } from './config.js';

const VOICES = 6;

function synth(ctx, seconds, fn) {
  const rate = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, Math.ceil(seconds * rate), rate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = fn(i / rate);
  return buffer;
}

const SYNTHS = {
  // Rising three-note chime.
  exit: (ctx) =>
    synth(ctx, 0.6, (t) => {
      const note = t < 0.12 ? 523 : t < 0.24 ? 659 : 784;
      const local = t % 0.12;
      const env = t < 0.24 ? Math.exp(-local * 12) : Math.exp(-(t - 0.24) * 5);
      return Math.sin(2 * Math.PI * note * t) * env * 0.5;
    }),
  // Soft thump plus a short breathy noise swish.
  launch: (ctx) =>
    synth(ctx, 0.22, (t) => {
      const thump = Math.sin(2 * Math.PI * (90 - 120 * t) * t) * Math.exp(-t * 30);
      const swish = (Math.random() * 2 - 1) * Math.exp(-t * 18) * 0.35 * Math.min(1, t * 60);
      return (thump + swish) * 0.8;
    }),
  // Knocky stone clack: a quick click on top of a low body.
  wall: (ctx) =>
    synth(ctx, 0.12, (t) => {
      const click = (Math.random() * 2 - 1) * Math.exp(-t * 400);
      const body = Math.sin(2 * Math.PI * 170 * t) * Math.exp(-t * 45);
      const ring = Math.sin(2 * Math.PI * 610 * t) * Math.exp(-t * 70) * 0.3;
      return (click * 0.5 + body + ring) * 0.8;
    }),
  // Two billiard balls: bright and short.
  ball: (ctx) =>
    synth(ctx, 0.08, (t) => {
      const tone = Math.sin(2 * Math.PI * 1900 * t) * 0.6 + Math.sin(2 * Math.PI * 2750 * t) * 0.4;
      return tone * Math.exp(-t * 90) * 0.7;
    }),
};

export function createAudio(camera) {
  const listener = new THREE.AudioListener();
  camera.add(listener);
  listener.setMasterVolume(CONFIG.audio.masterVolume);

  const pools = {};
  const lastPlayed = {};

  function register(name, buffer) {
    pools[name] = { next: 0, voices: [] };
    for (let i = 0; i < VOICES; i++) {
      const a = new THREE.Audio(listener);
      a.setBuffer(buffer);
      pools[name].voices.push(a);
    }
  }

  for (const [name, make] of Object.entries(SYNTHS)) register(name, make(listener.context));

  return {
    register,
    /** Browsers start audio suspended until a user gesture. */
    unlock() {
      if (listener.context.state !== 'running') listener.context.resume();
    },
    play(name, volume = 1, { pitch = 1, minInterval = 0 } = {}) {
      const pool = pools[name];
      if (!pool || listener.context.state !== 'running') return;
      const now = listener.context.currentTime;
      if (minInterval && now - (lastPlayed[name] ?? -Infinity) < minInterval) return;
      lastPlayed[name] = now;
      const voice = pool.voices[pool.next];
      pool.next = (pool.next + 1) % pool.voices.length;
      if (voice.isPlaying) voice.stop();
      voice.setVolume(Math.max(0, Math.min(1, volume)));
      voice.setPlaybackRate(pitch);
      voice.play();
    },
  };
}
