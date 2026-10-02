import { PitchDetector, midiFromFrequency } from "./pitch";

/** One detected note, as heard (before it is assigned a string/fret or snapped to a grid). */
export interface RawNote {
  /** Seconds on the tracker's clock. */
  start: number;
  end: number;
  /** Pitch as a (fractional) MIDI number, already corrected for the guitar's calibrated tuning offset. */
  midi: number;
  /** Highest the pitch rose above where the note settled, in cents (a bend shows up here). */
  bendCents: number;
  level: number;
}

export interface TrackerOptions {
  /** RMS below this is silence. Comes from the noise-floor measurement in the calibration step. */
  gate: number;
  /** How far the guitar sits from concert pitch on average, in cents (from the open-string calibration). */
  offsetCents: number;
}

export interface TrackerFrame {
  time: number;
  rms: number;
  frequency: number | null;
  /** Fractional MIDI number of the current pitch, or null when there isn't a clear one. */
  midi: number | null;
  clarity: number;
}

const WINDOW = 2048;
const HOP = 512;
const MIN_CLARITY = 0.82;
const ONSET_RATIO = 1.75;
const MIN_ONSET_GAP = 0.075;
const JUMP_SEMITONES = 0.85;
const SILENT_FRAMES_TO_END = 4;
/** Readings are ignored until this long after the attack, once the window is mostly the new note. */
const SETTLE_SECONDS = 0.055;

interface ActiveNote {
  start: number;
  peak: number;
  pitches: number[];
  locked: number | null;
  maxBend: number;
  silentFrames: number;
  lastValid: number | null;
  jumpCandidate: { time: number; midi: number; count: number } | null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * The note's pitch is the biggest group of agreeing readings (within half a semitone). Right after
 * a pick attack the analysis window still holds the previous note's tail, so single early readings
 * are often a wrong octave or harmonic; a majority vote over later frames is not.
 */
function lockPitch(pitches: number[], minAgreeing: number): number | null {
  let bestCluster: number[] = [];
  for (const candidate of pitches) {
    const cluster = pitches.filter((other) => Math.abs(other - candidate) <= 0.5);
    if (cluster.length > bestCluster.length) bestCluster = cluster;
  }
  if (bestCluster.length < minAgreeing) return null;
  // `pitches` is in time order, so the cluster's first readings are its earliest ones.
  return median(bestCluster.slice(0, 3));
}

/**
 * Turns a stream of single-note guitar audio into notes. Fed in blocks; every HOP samples it looks at
 * the latest WINDOW samples: loudness decides when a note starts or stops, the pitch detector decides
 * which note it is, and a sudden pitch jump with no new pick attack is read as a hammer-on/pull-off.
 */
export class NoteTracker {
  private readonly detector = new PitchDetector(WINDOW);
  private readonly ring = new Float32Array(WINDOW);
  private readonly frame = new Float32Array(WINDOW);
  private filled = 0;
  private sinceHop = 0;
  private lastTime = 0;
  private prevLevel = 0;
  private lastOnset = -Infinity;
  private active: ActiveNote | null = null;
  private finished: RawNote[] = [];

  constructor(
    private readonly sampleRate: number,
    private options: TrackerOptions,
    private readonly onFrame?: (frame: TrackerFrame) => void,
  ) {}

  setOptions(options: TrackerOptions): void {
    this.options = options;
  }

  /** Feeds audio; `blockStartTime` is the clock time (seconds) of the block's first sample. */
  feed(block: Float32Array, blockStartTime: number): void {
    for (let i = 0; i < block.length; i++) {
      this.ring[this.filled % WINDOW] = block[i];
      this.filled++;
      this.sinceHop++;
      if (this.sinceHop >= HOP && this.filled >= WINDOW) {
        this.sinceHop -= HOP;
        this.analyse(blockStartTime + (i + 1) / this.sampleRate);
      }
    }
  }

  private analyse(time: number): void {
    // Unroll the ring buffer into a contiguous frame, oldest sample first.
    const start = this.filled % WINDOW;
    for (let i = 0; i < WINDOW; i++) this.frame[i] = this.ring[(start + i) % WINDOW];

    let sumSquares = 0;
    for (let i = WINDOW - HOP; i < WINDOW; i++) sumSquares += this.frame[i] * this.frame[i];
    const level = Math.sqrt(sumSquares / HOP);
    this.lastTime = time;

    const { gate, offsetCents } = this.options;
    let midi: number | null = null;
    let frequency: number | null = null;
    let clarity = 0;
    if (level > gate * 0.6) {
      const estimate = this.detector.detect(this.frame, this.sampleRate);
      if (estimate && estimate.clarity >= MIN_CLARITY) {
        frequency = estimate.frequency;
        clarity = estimate.clarity;
        midi = midiFromFrequency(estimate.frequency) - offsetCents / 100;
      }
    }
    this.onFrame?.({ time, rms: level, frequency, midi, clarity });

    const hopSeconds = HOP / this.sampleRate;
    const onsetTime = time - hopSeconds * 0.5;
    const rising =
      level > gate &&
      level > this.prevLevel * ONSET_RATIO &&
      onsetTime - this.lastOnset > MIN_ONSET_GAP;
    const slowAttack = !this.active && level > gate * 1.5 && this.prevLevel <= gate;

    if (rising || slowAttack) {
      this.endActive(onsetTime);
      this.lastOnset = onsetTime;
      this.active = {
        start: onsetTime,
        peak: level,
        pitches: [],
        locked: null,
        maxBend: 0,
        silentFrames: 0,
        lastValid: null,
        jumpCandidate: null,
      };
    }

    const note = this.active;
    if (note) {
      note.peak = Math.max(note.peak, level);
      if (level < Math.max(gate * 0.8, note.peak * 0.08)) {
        note.silentFrames++;
        if (note.silentFrames >= SILENT_FRAMES_TO_END) {
          this.endActive(time - hopSeconds * (SILENT_FRAMES_TO_END + 0.5));
        }
      } else {
        note.silentFrames = 0;
        if (midi !== null) this.trackPitch(note, midi, time);
      }
    }

    this.prevLevel = level;
  }

  private trackPitch(note: ActiveNote, midi: number, time: number): void {
    if (note.locked === null) {
      if (time - note.start < SETTLE_SECONDS) return;
      note.pitches.push(midi);
      if (note.pitches.length >= 3) {
        // Three agreeing readings lock it; if they disagree, keep listening a little longer.
        note.locked = lockPitch(note.pitches, 3) ?? (note.pitches.length >= 7 ? lockPitch(note.pitches, 2) : null);
      }
      note.lastValid = midi;
      return;
    }

    // A hammer-on / pull-off: the pitch jumps by a semitone or more without a new pick attack.
    const previous = note.lastValid ?? midi;
    if (Math.abs(midi - previous) > JUMP_SEMITONES) {
      const candidate = note.jumpCandidate;
      if (candidate && Math.abs(candidate.midi - midi) < 0.6) {
        candidate.count++;
        if (candidate.count >= 2) {
          this.endActive(candidate.time);
          this.active = {
            start: candidate.time,
            peak: note.peak * 0.7,
            pitches: [midi],
            locked: null,
            maxBend: 0,
            silentFrames: 0,
            lastValid: midi,
            jumpCandidate: null,
          };
        }
      } else {
        note.jumpCandidate = { time, midi, count: 1 };
      }
      return;
    }

    note.jumpCandidate = null;
    note.lastValid = midi;
    note.maxBend = Math.max(note.maxBend, (midi - note.locked) * 100);
  }

  private endActive(end: number): void {
    const note = this.active;
    this.active = null;
    if (!note) return;
    // A short note may end before three readings agree: settle for two.
    const locked = note.locked ?? lockPitch(note.pitches, 2);
    if (locked === null) return;
    this.finished.push({
      start: note.start,
      end: Math.max(end, note.start + 0.03),
      midi: locked,
      bendCents: note.maxBend,
      level: note.peak,
    });
  }

  /** Everything heard so far, including the note still sounding (given a provisional end at `now`). */
  snapshot(now = this.lastTime): RawNote[] {
    const notes = [...this.finished];
    const note = this.active;
    const locked = note ? (note.locked ?? lockPitch(note.pitches, 2)) : null;
    if (note && locked !== null) {
      notes.push({ start: note.start, end: Math.max(now, note.start + 0.03), midi: locked, bendCents: note.maxBend, level: note.peak });
    }
    return notes;
  }

  /** Ends any note still sounding and returns everything. */
  finish(): RawNote[] {
    this.endActive(this.lastTime);
    return [...this.finished];
  }

  reset(): void {
    this.filled = 0;
    this.sinceHop = 0;
    this.prevLevel = 0;
    this.lastOnset = -Infinity;
    this.active = null;
    this.finished = [];
  }
}
