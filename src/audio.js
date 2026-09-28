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

/** A little melody of sine notes, each `step` seconds long. */
function notes(ctx, freqs, step, volume) {
  return synth(ctx, step * freqs.length + 0.25, (t) => {
    const i = Math.min(freqs.length - 1, Math.floor(t / step));
    const local = t - i * step;
    const env = Math.min(1, local * 60) * Math.exp(-local * (i === freqs.length - 1 ? 5 : 10));
    return Math.sin(2 * Math.PI * freqs[i] * t) * env * volume;
  });
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
  // Cue strike: a sharp tip click over a short woody "tock", with a little
  // low body. Lower and drier than the glassy ball-on-ball clack.
  launch: (ctx) =>
    synth(ctx, 0.14, (t) => {
      const click = (Math.random() * 2 - 1) * Math.exp(-t * 900);
      const tock =
        Math.sin(2 * Math.PI * 850 * t) * Math.exp(-t * 55) * 0.6 +
        Math.sin(2 * Math.PI * 1650 * t) * Math.exp(-t * 80) * 0.35 +
        Math.sin(2 * Math.PI * 2900 * t) * Math.exp(-t * 140) * 0.15;
      const body = Math.sin(2 * Math.PI * 140 * t) * Math.exp(-t * 40) * 0.35;
      return (click * 0.5 + tock + body) * 0.75; // peaks just under 1
    }),
  // Knocky stone clack: a quick click on top of a low body.
  wall: (ctx) =>
    synth(ctx, 0.12, (t) => {
      const click = (Math.random() * 2 - 1) * Math.exp(-t * 400);
      const body = Math.sin(2 * Math.PI * 170 * t) * Math.exp(-t * 45);
      const ring = Math.sin(2 * Math.PI * 610 * t) * Math.exp(-t * 70) * 0.3;
      return (click * 0.5 + body + ring) * 0.8;
    }),
  // Hero hits an enemy: a punchy, rubbery thock with a pitch drop.
  hit: (ctx) =>
    synth(ctx, 0.18, (t) => {
      const punch = Math.sin(2 * Math.PI * (320 - 900 * t) * t) * Math.exp(-t * 28);
      const smack = (Math.random() * 2 - 1) * Math.exp(-t * 300) * 0.5;
      const knock = Math.sin(2 * Math.PI * 1200 * t) * Math.exp(-t * 90) * 0.3;
      return (punch + smack + knock) * 0.6;
    }),
  // Enemy-on-enemy combo: two quick bright clacks.
  combo: (ctx) =>
    synth(ctx, 0.2, (t) => {
      const clack = (u) =>
        u < 0 ? 0 : (Math.sin(2 * Math.PI * 1500 * u) * 0.6 + Math.sin(2 * Math.PI * 2300 * u) * 0.4) * Math.exp(-u * 70);
      return (clack(t) + clack(t - 0.07) * 0.8) * 0.5;
    }),
  // Enemy defeated: a falling "bloop" with a puff of noise.
  kill: (ctx) =>
    synth(ctx, 0.35, (t) => {
      const bloop = Math.sin(2 * Math.PI * (700 - 1400 * t) * t) * Math.exp(-t * 9);
      const puff = (Math.random() * 2 - 1) * Math.exp(-t * 25) * 0.25;
      return (bloop + puff) * 0.55;
    }),
  // Enemy lunge: a short rising growl-whoosh, so you hear an attack coming.
  lunge: (ctx) =>
    synth(ctx, 0.3, (t) => {
      const env = Math.min(1, t * 20) * Math.exp(-t * 7);
      const growl = Math.sign(Math.sin(2 * Math.PI * (70 + 160 * t) * t)) * 0.25;
      const whoosh = (Math.random() * 2 - 1) * 0.35 * Math.sin(Math.PI * Math.min(1, t / 0.3));
      return (growl + whoosh) * env * 0.8;
    }),
  // You take damage: a heavy thud with a falling buzz.
  hurt: (ctx) =>
    synth(ctx, 0.3, (t) => {
      const thud = Math.sin(2 * Math.PI * (160 - 260 * t) * t) * Math.exp(-t * 16);
      const buzz = Math.sign(Math.sin(2 * Math.PI * (420 - 700 * t) * t)) * Math.exp(-t * 14) * 0.2;
      return (thud + buzz) * 0.7;
    }),
  // Combo kill: a quick bright rising arpeggio.
  comboKill: (ctx) => notes(ctx, [523, 659, 784, 1047], 0.08, 0.45),
  // Knocked out: three falling notes.
  down: (ctx) => notes(ctx, [523, 392, 262], 0.16, 0.5),
  // Back at the start: two soft rising notes.
  respawn: (ctx) => notes(ctx, [392, 587], 0.12, 0.35),
  // Out of lives: a slow low fall.
  gameover: (ctx) => notes(ctx, [330, 262, 196, 131], 0.22, 0.5),
  // Barrel crack: a dry wooden knock (pitched up per stage when played).
  crack: (ctx) =>
    synth(ctx, 0.14, (t) => {
      const knock = Math.sin(2 * Math.PI * 330 * t) * Math.exp(-t * 40) + Math.sin(2 * Math.PI * 740 * t) * Math.exp(-t * 60) * 0.4;
      const splinter = (Math.random() * 2 - 1) * Math.exp(-t * 90) * 0.5;
      return (knock + splinter) * 0.6;
    }),
  // Barrel breaks: a splintering crash.
  break: (ctx) =>
    synth(ctx, 0.45, (t) => {
      const crash = (Math.random() * 2 - 1) * Math.exp(-t * 9) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 23 * t));
      const thump = Math.sin(2 * Math.PI * (140 - 120 * t) * t) * Math.exp(-t * 14);
      return (crash * 0.6 + thump * 0.6) * 0.8;
    }),
  // Chest opens: a creak, then coins.
  chest: (ctx) =>
    synth(ctx, 0.6, (t) => {
      const creak = t < 0.18 ? Math.sign(Math.sin(2 * Math.PI * (180 + 260 * t) * t)) * 0.12 * Math.sin((Math.PI * t) / 0.18) : 0;
      const coin = (u) => (u < 0 ? 0 : (Math.sin(2 * Math.PI * 2100 * u) + Math.sin(2 * Math.PI * 3150 * u) * 0.5) * Math.exp(-u * 30));
      return creak + (coin(t - 0.2) + coin(t - 0.28) * 0.8 + coin(t - 0.36) * 0.6) * 0.25;
    }),
  // Red barrel: a low boom with a noisy blast.
  explode: (ctx) =>
    synth(ctx, 0.8, (t) => {
      const boom = Math.sin(2 * Math.PI * (70 - 40 * t) * t) * Math.exp(-t * 5);
      const blast = (Math.random() * 2 - 1) * Math.exp(-t * 7);
      return (boom * 0.7 + blast * 0.5) * 0.85;
    }),
  // Gold or coins picked up: two bright pings.
  coin: (ctx) => notes(ctx, [1568, 2093], 0.06, 0.35),
  // Potion: a quick bubbly rise.
  potion: (ctx) =>
    synth(ctx, 0.3, (t) => Math.sin(2 * Math.PI * (500 + 900 * t + 60 * Math.sin(2 * Math.PI * 30 * t)) * t) * Math.exp(-t * 7) * 0.4),
  // Sword or shield picked up: a metallic shing.
  gear: (ctx) =>
    synth(ctx, 0.5, (t) => {
      const ring = Math.sin(2 * Math.PI * 1760 * t) * 0.5 + Math.sin(2 * Math.PI * 2640 * t) * 0.3 + Math.sin(2 * Math.PI * 3700 * t) * 0.2;
      const scrape = (Math.random() * 2 - 1) * Math.exp(-t * 40) * 0.3;
      return (ring * Math.exp(-t * 6) + scrape) * 0.4;
    }),
  // 1-up: a cheerful rising run.
  oneUp: (ctx) => notes(ctx, [523, 659, 784, 1047, 1319], 0.07, 0.4),
  // The shield takes a hit: a flat metal clang.
  blocked: (ctx) =>
    synth(ctx, 0.35, (t) => {
      const clang = Math.sin(2 * Math.PI * 620 * t) * 0.5 + Math.sin(2 * Math.PI * 1370 * t) * 0.35 + Math.sin(2 * Math.PI * 2210 * t) * 0.2;
      return (clang * Math.exp(-t * 10) + (Math.random() * 2 - 1) * Math.exp(-t * 80) * 0.4) * 0.55;
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
