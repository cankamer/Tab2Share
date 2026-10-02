import { bendAmount, type ScheduledNote } from "./schedule";
import type { SampleBank } from "./sampler";

/** Samples in the Karplus-Strong delay line. Fixed: each buffer's own sample rate is set to freq * N, so it plays at exactly the right pitch. */
const LOOP_LENGTH = 72;

type Style = "normal" | "muted" | "ring" | "dead";

const STYLE_SETTINGS: Record<Style, { t60: number; seconds: number; brightness: number }> = {
  normal: { t60: 2.6, seconds: 3.2, brightness: 0.5 },
  muted: { t60: 0.22, seconds: 0.7, brightness: 0.62 },
  ring: { t60: 6, seconds: 6.5, brightness: 0.5 },
  dead: { t60: 0.07, seconds: 0.25, brightness: 0.8 },
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Plucked-string model: a noise burst circulating through a delay line with a gentle low-pass in
 * the loop, so high partials die first — the same physics a real string has. The buffer's sample
 * rate is freq * LOOP_LENGTH, which tunes the note exactly with no fractional-delay filter.
 */
function renderPluck(ctx: BaseAudioContext, freq: number, style: Style): AudioBuffer {
  const { t60, seconds, brightness } = STYLE_SETTINGS[style];
  const sampleRate = freq * LOOP_LENGTH;
  const length = Math.max(LOOP_LENGTH * 4, Math.round(seconds * sampleRate));
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const out = buffer.getChannelData(0);

  // Excitation: noise through a pick-position comb, then smoothed.
  const random = mulberry32(Math.round(freq * 1000));
  const delay = new Float32Array(LOOP_LENGTH);
  const raw = new Float32Array(LOOP_LENGTH);
  for (let i = 0; i < LOOP_LENGTH; i++) raw[i] = random() * 2 - 1;
  const pick = Math.max(1, Math.round(LOOP_LENGTH * 0.14));
  let smoothed = 0;
  let peak = 0;
  for (let i = 0; i < LOOP_LENGTH; i++) {
    const comb = raw[i] - raw[(i + pick) % LOOP_LENGTH];
    smoothed += (comb - smoothed) * 0.55;
    delay[i] = smoothed;
    peak = Math.max(peak, Math.abs(smoothed));
  }
  for (let i = 0; i < LOOP_LENGTH; i++) delay[i] /= peak || 1;

  // Per-period loop gain that gives the requested 60 dB decay time at this pitch.
  const gain = Math.pow(10, -3 / (t60 * freq));
  let index = 0;
  for (let n = 0; n < length; n++) {
    const current = delay[index];
    const next = delay[(index + 1) % LOOP_LENGTH];
    out[n] = current;
    delay[index] = gain * ((1 - brightness) * current + brightness * next);
    index = (index + 1) % LOOP_LENGTH;
  }
  return buffer;
}

function frequencyOf(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const ratio = (semitones: number) => Math.pow(2, semitones / 12);

/**
 * Shapes the playback rate for bends, pre-bends, slides and glides. `base` is the constant
 * pitch correction for the buffer in use (1 for the string model, the sample's shift for recordings).
 */
function automatePitch(rate: AudioParam, note: ScheduledNote, when: number, duration: number, base: number): void {
  const bendSemitones = bendAmount(note.bend);
  const startsBent = note.bend === "preBend" || note.bend === "preBendRelease";

  if (startsBent) {
    rate.setValueAtTime(base * ratio(bendSemitones), when);
    if (note.bend === "preBendRelease") {
      rate.setValueAtTime(base * ratio(bendSemitones), when + duration * 0.5);
      rate.linearRampToValueAtTime(base, when + duration * 0.8);
    }
  } else if (note.bend === "bendRelease") {
    rate.setValueAtTime(base, when);
    rate.linearRampToValueAtTime(base * ratio(bendSemitones), when + duration * 0.35);
    rate.setValueAtTime(base * ratio(bendSemitones), when + duration * 0.55);
    rate.linearRampToValueAtTime(base, when + duration * 0.85);
  } else if (bendSemitones > 0) {
    rate.setValueAtTime(base, when);
    rate.linearRampToValueAtTime(base * ratio(bendSemitones), when + Math.min(0.22, duration * 0.45));
  } else if (note.slideIn) {
    rate.setValueAtTime(base * ratio(note.slideIn === "below" ? -4 : 4), when);
    rate.linearRampToValueAtTime(base, when + Math.min(0.1, duration * 0.4));
  } else if (note.slideOut) {
    rate.setValueAtTime(base, when + duration * 0.55);
    rate.linearRampToValueAtTime(base * ratio(note.slideOut === "up" ? 5 : -5), when + duration);
  } else if (note.glideToMidi !== undefined) {
    rate.setValueAtTime(base, when + duration * 0.55);
    rate.linearRampToValueAtTime(base * ratio(note.glideToMidi - note.midi), when + duration * 0.95);
  } else {
    rate.setValueAtTime(base, when);
  }
}

/** Guitar voice: real recorded samples when a bank is loaded, otherwise a plucked-string model. */
export class GuitarSynth {
  private cache = new Map<string, AudioBuffer>();
  private bank: SampleBank | null = null;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly output: AudioNode,
  ) {}

  /** Use recorded samples (a ready bank) or fall back to the string model (null). */
  useBank(bank: SampleBank | null): void {
    this.bank = bank && bank.ready ? bank : null;
  }

  private buffer(midi: number, style: Style): AudioBuffer {
    const key = `${midi}|${style}`;
    let buffer = this.cache.get(key);
    if (!buffer) {
      buffer = renderPluck(this.ctx, frequencyOf(midi), style);
      this.cache.set(key, buffer);
    }
    return buffer;
  }

  /** Sounds `note` starting at audio-clock time `when`. */
  trigger(note: ScheduledNote, when: number): void {
    const { ctx } = this;
    const sample = this.bank?.nearest(note.midi) ?? null;
    const style: Style = note.dead ? "dead" : note.palmMute ? "muted" : note.letRing ? "ring" : "normal";

    const source = ctx.createBufferSource();
    let base = 1;
    if (sample) {
      source.buffer = sample.buffer;
      base = ratio(note.midi - sample.midi);
    } else {
      source.buffer = this.buffer(note.midi, style);
    }

    // Palm-muted and dead notes are damped by the hand: shorter and duller than an open string.
    const damped = sample !== null && (note.palmMute || note.dead);
    const duration = note.dead ? Math.min(note.duration, sample ? 0.1 : 0.12) : damped ? Math.min(note.duration, 0.24) : note.duration;
    const level = note.velocity * (note.dead ? (sample ? 0.7 : 0.5) : 1);

    const voice = ctx.createGain();
    voice.gain.setValueAtTime(level, when);
    // Hold for the written length, then damp like a fretting-hand release.
    const releaseAt = when + (note.letRing ? Math.max(duration, 1.6) : duration);
    voice.gain.setValueAtTime(level, releaseAt);
    voice.gain.setTargetAtTime(0, releaseAt, damped || note.palmMute ? 0.03 : 0.08);

    automatePitch(source.playbackRate, note, when, duration, base);

    let lfo: OscillatorNode | null = null;
    if (note.vibrato) {
      lfo = ctx.createOscillator();
      lfo.frequency.value = note.vibrato === "wide" ? 5.2 : 5.8;
      const depth = ctx.createGain();
      const cents = note.vibrato === "wide" ? 55 : 22;
      depth.gain.setValueAtTime(0, when);
      depth.gain.linearRampToValueAtTime(cents, when + Math.min(0.35, duration * 0.6));
      lfo.connect(depth).connect(source.detune);
      lfo.start(when);
      lfo.stop(releaseAt + 0.6);
    }

    let tail: AudioNode = voice;
    source.connect(voice);
    if (damped) {
      const damper = ctx.createBiquadFilter();
      damper.type = "lowpass";
      damper.frequency.value = note.dead ? 650 : 1500;
      voice.connect(damper);
      tail = damper;
    }
    tail.connect(this.output);

    // Slurred notes (hammer-on, pull-off, legato slide) skip the pick attack at the start of the recording.
    const skip = sample && note.legato ? 0.045 : 0;
    source.start(when, skip);
    source.stop(releaseAt + 0.6);
  }
}
