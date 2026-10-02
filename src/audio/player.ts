import type { Project } from "../model/types";
import { buildSchedule, type Schedule } from "./schedule";
import { GuitarSynth } from "./synth";
import { SampleBank } from "./sampler";

export type SoundMode = "samples" | "synth";

export interface PlaybackHandlers {
  /** Fires as each beat starts sounding; `flatIndex` is what the editor's playhead should show. */
  onBeat: (flatIndex: number) => void;
  /** Fires once when the piece reaches its end (not when stopped or paused). */
  onEnd: () => void;
}

const LOOKAHEAD_SECONDS = 0.4;
const TICK_MS = 40;
const START_DELAY_SECONDS = 0.1;

/**
 * Plays a Project through the Web Audio API. The schedule is built once up front (repeats
 * unrolled, tempo changes applied); a short look-ahead timer then hands notes to the audio clock
 * a fraction of a second early, which keeps timing sample-accurate even when the UI is busy.
 */
export class TabPlayer {
  private context: AudioContext | null = null;
  private synth: GuitarSynth | null = null;
  private bus: GainNode | null = null;
  private session: GainNode | null = null;
  private timer: number | null = null;
  private uiTimers = new Set<number>();
  private playing = false;
  private lowpass: BiquadFilterNode | null = null;
  private drive: WaveShaperNode | null = null;
  private readonly bank = new SampleBank();
  private sound: SoundMode = "samples";

  get isPlaying(): boolean {
    return this.playing;
  }

  /** Real recorded guitar samples (default) or the built-in string model. Takes effect on the next play. */
  setSound(mode: SoundMode): void {
    this.sound = mode;
  }

  /** The recordings are already a finished guitar tone, so they get a lighter touch than the string model. */
  private applyTone(usingSamples: boolean): void {
    if (this.lowpass) this.lowpass.frequency.value = usingSamples ? 9500 : 5200;
    if (this.drive) {
      const amount = usingSamples ? 1.15 : 1.7;
      const curve = new Float32Array(1024);
      for (let i = 0; i < curve.length; i++) {
        const x = (i / (curve.length - 1)) * 2 - 1;
        curve[i] = Math.tanh(amount * x) / Math.tanh(amount);
      }
      this.drive.curve = curve;
    }
  }

  private ensureContext(): AudioContext {
    if (this.context) return this.context;
    const context = new AudioContext({ latencyHint: "interactive" });

    // Tone shaping: roll off the harsh top, add a little amp-style saturation, then glue with a compressor.
    const lowpass = context.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 5200;
    lowpass.Q.value = 0.5;

    const drive = context.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(1.7 * x) / Math.tanh(1.7);
    }
    drive.curve = curve;
    drive.oversample = "2x";

    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.ratio.value = 4;

    const master = context.createGain();
    master.gain.value = 0.55;

    const bus = context.createGain();
    bus.connect(lowpass).connect(drive).connect(compressor).connect(master).connect(context.destination);

    this.context = context;
    this.lowpass = lowpass;
    this.drive = drive;
    this.bus = bus;
    this.synth = new GuitarSynth(context, bus);
    return context;
  }

  /** Starts (or restarts) playback at the first beat whose flat index is `fromFlatIndex`. */
  async play(project: Project, fromFlatIndex: number, handlers: PlaybackHandlers): Promise<void> {
    this.stop();
    const context = this.ensureContext();
    if (context.state === "suspended") await context.resume();

    let usingSamples = false;
    if (this.sound === "samples") {
      try {
        await this.bank.load(context);
        usingSamples = true;
      } catch (error) {
        console.warn("Guitar samples unavailable, falling back to the synthesized voice:", error);
      }
    }
    this.synth?.useBank(usingSamples ? this.bank : null);
    this.applyTone(usingSamples);

    const schedule: Schedule = buildSchedule(project);
    let first = schedule.beats.findIndex((beat) => beat.flatIndex >= fromFlatIndex);
    if (first < 0) first = 0;
    if (schedule.beats.length === 0) {
      handlers.onEnd();
      return;
    }

    const session = context.createGain();
    session.connect(this.bus as GainNode);
    this.session = session;
    this.playing = true;

    const origin = schedule.beats[first].time;
    const startAt = context.currentTime + START_DELAY_SECONDS;
    const lastBeat = schedule.beats[schedule.beats.length - 1];
    const endAt = startAt + (lastBeat.time + lastBeat.seconds - origin) + 0.35;
    let next = first;

    const tick = () => {
      if (!this.playing || this.session !== session) return;
      const horizon = context.currentTime + LOOKAHEAD_SECONDS;

      while (next < schedule.beats.length && startAt + (schedule.beats[next].time - origin) < horizon) {
        const beat = schedule.beats[next];
        const when = startAt + (beat.time - origin);
        for (const note of beat.notes) {
          this.synth?.trigger(note, when + note.offset);
        }
        const delayMs = Math.max(0, (when - context.currentTime) * 1000);
        const uiTimer = window.setTimeout(() => {
          this.uiTimers.delete(uiTimer);
          if (this.playing && this.session === session) handlers.onBeat(beat.flatIndex);
        }, delayMs);
        this.uiTimers.add(uiTimer);
        next += 1;
      }

      if (next >= schedule.beats.length && context.currentTime >= endAt) {
        this.finish();
        handlers.onEnd();
      }
    };

    tick();
    this.timer = window.setInterval(tick, TICK_MS);
  }

  /** Stops immediately (with a short fade so it doesn't click) and drops everything still scheduled. */
  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.uiTimers.forEach((timer) => window.clearTimeout(timer));
    this.uiTimers.clear();
    this.finish();
  }

  private finish(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.playing = false;
    const session = this.session;
    this.session = null;
    if (session && this.context) {
      session.gain.setTargetAtTime(0, this.context.currentTime, 0.02);
      window.setTimeout(() => session.disconnect(), 400);
    }
  }

  dispose(): void {
    this.stop();
    void this.context?.close();
    this.context = null;
    this.synth = null;
    this.bus = null;
    this.lowpass = null;
    this.drive = null;
  }
}
