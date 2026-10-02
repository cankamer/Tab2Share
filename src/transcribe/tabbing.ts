import type { Beat, BendPreset, Duration, Note } from "../model/types";
import type { RawNote } from "./tracker";

export interface Position {
  string: number;
  fret: number;
}

/** A heard note that has been given a place on the neck. */
export interface PlacedNote extends Position {
  start: number;
  end: number;
  bend?: BendPreset;
}

/** Every string/fret that sounds `midi`, given the open-string MIDI numbers (low string first) and capo. */
export function positionsFor(midi: number, openStrings: number[], capo: number): Position[] {
  const result: Position[] = [];
  for (let string = 1; string <= 6; string++) {
    const fret = midi - (openStrings[6 - string] + capo);
    if (Number.isInteger(fret) && fret >= 0 && fret <= 24) result.push({ string, fret });
  }
  return result;
}

/**
 * The same pitch can usually be played in several places. Pick the one a player would most likely
 * use. The key idea is the fretting-hand position: fretted notes should stay near the last fretted
 * note, while open strings cost the hand nothing, so they are cheap wherever it is. Small extras:
 * stay near the previous string, avoid the high neck, prefer low frets when there is no history.
 * `lockedString` forces one string when the player has chosen to stay on it.
 */
export function choosePosition(
  candidates: Position[],
  previous: Position | null,
  lockedString: number | null,
  hand: number | null = previous && previous.fret > 0 ? previous.fret : null,
): Position | null {
  const pool = lockedString ? candidates.filter((candidate) => candidate.string === lockedString) : candidates;
  if (pool.length === 0) return null;

  let best = pool[0];
  let bestCost = Infinity;
  for (const candidate of pool) {
    const stringJump = previous ? Math.abs(candidate.string - previous.string) : 0;
    let cost: number;
    if (candidate.fret === 0) {
      cost = 0.6 + stringJump * 0.15;
      // Deep in the neck, dropping to an open string means leaving the hand position: unlikely mid-phrase.
      if (hand !== null && hand > 4) cost += (hand - 4) * 0.35;
    } else {
      const reach = hand === null ? candidate.fret * 0.25 : Math.abs(candidate.fret - hand);
      cost = reach + stringJump * 0.5;
    }
    if (candidate.fret > 12) cost += 1.5 + (candidate.fret - 12) * 0.3;
    if (cost < bestCost) {
      bestCost = cost;
      best = candidate;
    }
  }
  return best;
}

function bendPreset(cents: number): BendPreset | undefined {
  if (cents < 75) return undefined;
  if (cents < 140) return "half";
  if (cents < 240) return "full";
  return "oneAndHalf";
}

/** Gives every heard note a string and fret. Notes outside the guitar's range are dropped. */
export function placeNotes(
  notes: RawNote[],
  openStrings: number[],
  capo: number,
  lockedString: number | null,
): PlacedNote[] {
  const placed: PlacedNote[] = [];
  let previous: Position | null = null;
  let hand: number | null = null; // fret of the last fretted (non-open) note
  for (const note of notes) {
    const position = choosePosition(positionsFor(Math.round(note.midi), openStrings, capo), previous, lockedString, hand);
    if (!position) continue;
    placed.push({ ...position, start: note.start, end: note.end, bend: bendPreset(note.bendCents) });
    previous = position;
    if (position.fret > 0) hand = position.fret;
  }
  return placed;
}

export interface QuantizeOptions {
  /** Tempo the player followed (the slowed-down practice tempo), quarter notes per minute. */
  bpm: number;
  timeSignature: { num: number; den: number };
  /** Seconds the audio path runs behind the player's hands; subtracted from every start time. */
  latency: number;
}

/** Silence (in sixteenths) after a note that is folded into the note instead of becoming a rest. */
const MAX_ABSORBED_GAP_UNITS = 4;

/** Lengths in sixteenths that can be written as one note, longest first. */
const WRITABLE: { units: number; duration: Duration; dotted: boolean }[] = [
  { units: 16, duration: 1, dotted: false },
  { units: 12, duration: 2, dotted: true },
  { units: 8, duration: 2, dotted: false },
  { units: 6, duration: 4, dotted: true },
  { units: 4, duration: 4, dotted: false },
  { units: 3, duration: 8, dotted: true },
  { units: 2, duration: 8, dotted: false },
  { units: 1, duration: 16, dotted: false },
];

interface Segment {
  start: number;
  length: number;
  note: PlacedNote | null;
}

/**
 * Snaps heard notes to a sixteenth-note grid and writes them as measures of beats: gaps become
 * rests, notes that run across a barline are split and tied, and long notes are broken into
 * writable values (a quarter, a dotted half, ...).
 *
 * `totalSeconds`, when given, pads the last measure so the draft always ends on a barline.
 */
export function buildMeasures(placed: PlacedNote[], options: QuantizeOptions): Beat[][] {
  const unitSeconds = 60 / options.bpm / 4;
  const measureUnits = Math.max(1, Math.round((options.timeSignature.num * 16) / options.timeSignature.den));
  const toUnit = (seconds: number) => Math.round((seconds - options.latency) / unitSeconds);

  const sorted = [...placed].sort((a, b) => a.start - b.start);
  const segments: Segment[] = [];
  let cursor = 0;

  sorted.forEach((note, index) => {
    const start = Math.max(cursor, toUnit(note.start));
    const nextStart = index + 1 < sorted.length ? Math.max(start + 1, toUnit(sorted[index + 1].start)) : Infinity;
    let end = Math.max(start + 1, toUnit(note.end));
    end = Math.min(end, nextStart);
    // A guitar note rings and fades by itself, so silence up to a quarter note after it usually means
    // "still ringing", not a rest the player meant. Longer gaps are written as rests.
    if (nextStart !== Infinity && nextStart - end <= MAX_ABSORBED_GAP_UNITS) end = nextStart;

    if (start > cursor) segments.push({ start: cursor, length: start - cursor, note: null });
    segments.push({ start, length: end - start, note });
    cursor = end;
  });

  if (segments.length === 0) return [];
  const totalUnits = Math.ceil(cursor / measureUnits) * measureUnits;
  if (totalUnits > cursor) segments.push({ start: cursor, length: totalUnits - cursor, note: null });

  const measures: Beat[][] = Array.from({ length: totalUnits / measureUnits }, () => []);

  for (const segment of segments) {
    let position = segment.start;
    let remaining = segment.length;
    let firstPiece = true;

    while (remaining > 0) {
      const measureIndex = Math.floor(position / measureUnits);
      const roomInMeasure = measureUnits - (position % measureUnits);
      let piece = Math.min(remaining, roomInMeasure);

      // Break the piece into writable values; every part after the first of a note is tied.
      while (piece > 0) {
        const value = WRITABLE.find((candidate) => candidate.units <= piece) ?? WRITABLE[WRITABLE.length - 1];
        const beat: Beat = { duration: value.duration, dotted: value.dotted, isRest: segment.note === null, notes: [] };
        if (segment.note) {
          const note: Note = { string: segment.note.string as Note["string"], fret: segment.note.fret };
          if (firstPiece && segment.note.bend) note.bend = segment.note.bend;
          if (!firstPiece) note.tie = true;
          beat.notes.push(note);
        }
        measures[measureIndex].push(beat);
        firstPiece = false;
        piece -= value.units;
        position += value.units;
        remaining -= value.units;
      }
    }
  }
  return measures;
}
