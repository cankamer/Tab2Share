import type { Beat, Duration } from "../model/types";
import { beamGroupLength, drawRestSymbol, type RhythmBeat } from "./drawRhythm";
import { type TabPalette } from "./constants";

/** Where one five-line staff sits: `topY` is the top line, lines are `spacing` apart. */
export interface StaffGeometry {
  topY: number;
  spacing: number;
}

export function staffBottomY(staff: StaffGeometry): number {
  return staff.topY + staff.spacing * 4;
}

// ---- pitch -----------------------------------------------------------------------------------

const NOTE_PITCH_CLASS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const LETTER_INDEX: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

/** MIDI number of a note name like "E", "Eb", "F#", placed in [lowest, lowest + 11]. */
function midiAtOrAbove(name: string, lowest: number): number {
  const letter = name[0].toUpperCase();
  let pitchClass = NOTE_PITCH_CLASS[letter] ?? 0;
  if (name.includes("#") || name.includes("♯")) pitchClass += 1;
  if (name.includes("b") || name.includes("♭")) pitchClass -= 1;
  pitchClass = ((pitchClass % 12) + 12) % 12;
  let midi = lowest - (lowest % 12) + pitchClass;
  while (midi < lowest) midi += 12;
  return midi;
}

/**
 * Open-string MIDI numbers, low string first (Track.tuning's own order). The tuning only stores
 * note names, so octaves are inferred: the lowest string lands in D2..C#3, and every string
 * above it is the next occurrence of its note above the previous string — which reproduces
 * E2 A2 D3 G3 B3 E4 for standard tuning and all common alternates.
 */
export function openStringMidi(tuning: string[]): number[] {
  const result: number[] = [];
  tuning.forEach((name, index) => {
    if (index === 0) {
      result.push(midiAtOrAbove(name, 38));
    } else {
      result.push(midiAtOrAbove(name, result[index - 1] + 1));
    }
  });
  return result;
}

interface Spelled {
  /** Diatonic step: octave * 7 + letter (C = 0). E4 = 30, the bottom line of a treble staff. */
  diatonic: number;
  accidental: -1 | 0 | 1;
}

const SHARP_SPELLING: [number, 0 | 1][] = [
  [0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [3, 0], [3, 1], [4, 0], [4, 1], [5, 0], [5, 1], [6, 0],
];
const FLAT_SPELLING: [number, 0 | -1][] = [
  [0, 0], [1, -1], [1, 0], [2, -1], [2, 0], [3, 0], [4, -1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0],
];

/** Written pitch for a sounding MIDI number. Guitar music is written an octave above where it sounds. */
function spellWritten(midi: number, preferFlats: boolean): Spelled {
  const written = midi + 12;
  const octave = Math.floor(written / 12) - 1;
  const [letter, accidental] = (preferFlats ? FLAT_SPELLING : SHARP_SPELLING)[written % 12];
  return { diatonic: octave * 7 + letter, accidental };
}

// Keep LETTER_INDEX referenced for tuning names that start with a lowercase letter.
void LETTER_INDEX;

// ---- drawing ---------------------------------------------------------------------------------

const STEM_LENGTH_SPACES = 3.5;
const BOTTOM_LINE_DIATONIC = 30; // E4
const MIDDLE_LINE_DIATONIC = 34; // B4
/** Sizes scale with the staff's line spacing (designed at 7px: head 4.6x3.3, beam 3px thick, 5px apart). */
const headRx = (sp: number) => sp * 0.66;
const headRy = (sp: number) => sp * 0.47;
const beamThickness = (sp: number) => sp * 0.43;
const beamSpacing = (sp: number) => sp * 0.72;

export function drawStaffLines(ctx: CanvasRenderingContext2D, staff: StaffGeometry, x0: number, x1: number, palette: TabPalette) {
  ctx.save();
  ctx.strokeStyle = palette.stringLine;
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const y = staff.topY + i * staff.spacing;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
  }
  ctx.restore();
}

/** Treble clef. Drawn with the system's musical-symbol font; a plain "G" is the fallback glyph. */
export function drawTrebleClef(ctx: CanvasRenderingContext2D, staff: StaffGeometry, x: number, palette: TabPalette) {
  ctx.save();
  ctx.fillStyle = palette.fretNumber;
  ctx.font = `${Math.round(staff.spacing * 6.6)}px "Segoe UI Symbol", "Noto Music", "Apple Symbols", serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  // The G line (second from the bottom) is the clef's curl: anchor the glyph baseline just below it.
  ctx.fillText("\u{1D11E}", x, staff.topY + staff.spacing * 3.55);
  ctx.restore();
}

interface HeadInfo {
  diatonic: number;
  accidental: -1 | 0 | 1;
  dead: boolean;
  /** Pixel shift for a note a second above its neighbor in a chord, so heads don't overlap. */
  displaced: boolean;
  showAccidental: boolean;
}

interface BeatNotation {
  heads: HeadInfo[];
  stemUp: boolean;
}

function levelOf(duration: Duration): number {
  return duration === 8 ? 1 : duration === 16 ? 2 : duration === 32 ? 3 : 0;
}

function yOfDiatonic(staff: StaffGeometry, diatonic: number): number {
  return staffBottomY(staff) - (diatonic - BOTTOM_LINE_DIATONIC) * (staff.spacing / 2);
}

function beatLength(beat: Beat): number {
  let length = 1 / beat.duration;
  if (beat.dotted) length *= 1.5;
  if (beat.tuplet) length *= beat.tuplet.over / beat.tuplet.count;
  return length;
}

export interface NotationContext {
  /** Open-string MIDI numbers, low string first, with the capo already added. */
  stringMidi: number[];
  preferFlats: boolean;
}

export function buildNotationContext(tuning: string[], capo: number): NotationContext {
  return {
    stringMidi: openStringMidi(tuning).map((midi) => midi + capo),
    preferFlats: tuning.some((name) => name.length > 1 && (name.includes("b") || name.includes("♭"))),
  };
}

/**
 * Standard notation for one measure, aligned to the tab columns above/below it: noteheads at the
 * pitch the tab's string+fret produces, stems/beams/flags, dots, rests, accidentals and ledger lines.
 */
export function drawMeasureNotation(
  ctx: CanvasRenderingContext2D,
  beats: RhythmBeat[],
  staff: StaffGeometry,
  notation: NotationContext,
  timeSignature: { num: number; den: number },
  palette: TabPalette,
): void {
  const sp = staff.spacing;
  const groupLength = beamGroupLength(timeSignature);

  // Accidentals already shown in this bar, so a repeated C# isn't re-marked.
  const accidentalState = new Map<number, number>();

  const built: (BeatNotation | null)[] = beats.map(({ beat }) => {
    if (beat.isRest || beat.notes.length === 0) return null;
    const sorted = beat.notes
      .map((note) => ({
        note,
        spelled: spellWritten(notation.stringMidi[6 - note.string] + note.fret, notation.preferFlats),
      }))
      .sort((a, b) => a.spelled.diatonic - b.spelled.diatonic);

    const heads: HeadInfo[] = [];
    sorted.forEach(({ note, spelled }, index) => {
      const previous = heads[index - 1];
      const displaced = Boolean(previous && !previous.displaced && spelled.diatonic - previous.diatonic <= 1);
      const known = accidentalState.get(spelled.diatonic) ?? 0;
      const showAccidental = known !== spelled.accidental && !note.dead;
      if (showAccidental) accidentalState.set(spelled.diatonic, spelled.accidental);
      heads.push({ diatonic: spelled.diatonic, accidental: spelled.accidental, dead: Boolean(note.dead), displaced, showAccidental });
    });

    const low = heads[0].diatonic;
    const high = heads[heads.length - 1].diatonic;
    return { heads, stemUp: (low + high) / 2 < MIDDLE_LINE_DIATONIC };
  });

  // Beam groups: same rule as the tab's rhythm row (consecutive short notes inside one beat).
  const groups: number[][] = [];
  const groupOf: number[] = new Array(beats.length).fill(-1);
  let position = 0;
  let currentKey = -1;
  beats.forEach(({ beat }, index) => {
    const key = Math.floor(position / groupLength + 1e-6);
    if (built[index] && levelOf(beat.duration) > 0) {
      const previousInGroup = index > 0 && groupOf[index - 1] >= 0;
      if (previousInGroup && key === currentKey) {
        groups[groups.length - 1].push(index);
      } else {
        groups.push([index]);
      }
      groupOf[index] = groups.length - 1;
      currentKey = key;
    }
    position += beatLength(beat);
  });

  // A beamed group shares one stem direction (the majority), and one beam height.
  const groupStemUp = groups.map((group) => {
    const up = group.filter((index) => built[index]!.stemUp).length;
    return up * 2 >= group.length;
  });
  const stemLength = sp * STEM_LENGTH_SPACES;

  ctx.save();
  ctx.strokeStyle = palette.fretNumber;
  ctx.fillStyle = palette.fretNumber;
  ctx.lineCap = "round";

  const beamY: number[] = groups.map((group, g) => {
    const up = groupStemUp[g];
    const tips = group.map((index) => {
      const heads = built[index]!.heads;
      return up ? yOfDiatonic(staff, heads[heads.length - 1].diatonic) - stemLength : yOfDiatonic(staff, heads[0].diatonic) + stemLength;
    });
    return up ? Math.min(...tips) : Math.max(...tips);
  });

  beats.forEach(({ beat, x }, index) => {
    const info = built[index];
    if (beat.isRest) {
      drawRestSymbol(ctx, x, staff.topY + sp * 2, beat);
      return;
    }
    if (!info) return;

    const group = groupOf[index] >= 0 ? groupOf[index] : -1;
    const up = group >= 0 ? groupStemUp[group] : info.stemUp;
    drawBeatHeads(ctx, x, info, staff, beat, up, group >= 0 ? beamY[group] : null, groups[group]?.length === 1, palette);
  });

  groups.forEach((group, g) => {
    if (group.length < 2) return;
    drawNotationBeams(
      ctx,
      group.map((index) => ({ x: beats[index].x, level: levelOf(beats[index].beat.duration) })),
      beamY[g],
      groupStemUp[g],
      sp,
    );
  });

  ctx.restore();
}

function drawBeatHeads(
  ctx: CanvasRenderingContext2D,
  x: number,
  info: BeatNotation,
  staff: StaffGeometry,
  beat: Beat,
  stemUp: boolean,
  beamTipY: number | null,
  lone: boolean,
  palette: TabPalette,
) {
  const sp = staff.spacing;
  const HEAD_RX = headRx(sp);
  const HEAD_RY = headRy(sp);
  const BEAM_SPACING = beamSpacing(sp);
  const hollow = beat.duration <= 2;
  const ys = info.heads.map((head) => yOfDiatonic(staff, head.diatonic));
  const topY = Math.min(...ys);
  const bottomY = Math.max(...ys);

  // Ledger lines first, so heads paint over them.
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = palette.stringLine;
  for (const head of info.heads) {
    if (head.diatonic < BOTTOM_LINE_DIATONIC) {
      const first = head.diatonic % 2 === 0 ? head.diatonic : head.diatonic + 1;
      for (let d = first; d < BOTTOM_LINE_DIATONIC; d += 2) {
        const y = yOfDiatonic(staff, d);
        ctx.beginPath();
        ctx.moveTo(x - HEAD_RX - 3, y);
        ctx.lineTo(x + HEAD_RX + 3, y);
        ctx.stroke();
      }
    } else if (head.diatonic > BOTTOM_LINE_DIATONIC + 8) {
      const last = head.diatonic % 2 === 0 ? head.diatonic : head.diatonic - 1;
      for (let d = BOTTOM_LINE_DIATONIC + 10; d <= last; d += 2) {
        const y = yOfDiatonic(staff, d);
        ctx.beginPath();
        ctx.moveTo(x - HEAD_RX - 3, y);
        ctx.lineTo(x + HEAD_RX + 3, y);
        ctx.stroke();
      }
    }
  }
  ctx.restore();

  // Stem. Up-stems hang off the right of the head, down-stems off the left.
  const stemX = stemUp ? x + HEAD_RX - 0.6 : x - HEAD_RX + 0.6;
  if (beat.duration !== 1) {
    const tip = beamTipY ?? (stemUp ? topY - sp * STEM_LENGTH_SPACES : bottomY + sp * STEM_LENGTH_SPACES);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(stemX, stemUp ? bottomY : topY);
    ctx.lineTo(stemX, tip);
    ctx.stroke();

    if (lone && levelOf(beat.duration) > 0) {
      ctx.lineWidth = 1.8;
      for (let i = 0; i < levelOf(beat.duration); i++) {
        const dir = stemUp ? 1 : -1;
        const y = tip + dir * i * BEAM_SPACING;
        ctx.beginPath();
        ctx.moveTo(stemX, y);
        ctx.lineTo(stemX + sp, y + dir * sp * 1.15);
        ctx.stroke();
      }
    }
  }

  // Accidentals, staggered leftward so stacked ones don't collide.
  let accidentalSlot = 0;
  ctx.font = `${Math.round(sp * 2.1)}px "Segoe UI Symbol", serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  [...info.heads].reverse().forEach((head) => {
    if (!head.showAccidental) return;
    const y = yOfDiatonic(staff, head.diatonic);
    const glyph = head.accidental === 1 ? "♯" : head.accidental === -1 ? "♭" : "♮";
    ctx.fillStyle = palette.fretNumber;
    ctx.fillText(glyph, x - HEAD_RX - 3 - accidentalSlot * sp, y);
    accidentalSlot += 1;
  });

  // Heads.
  info.heads.forEach((head) => {
    const y = yOfDiatonic(staff, head.diatonic);
    const headX = x + (head.displaced ? (stemUp ? 1 : -1) * HEAD_RX * 2 - (stemUp ? 0 : 0) : 0);

    if (head.dead) {
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(headX - HEAD_RY - 1, y - HEAD_RY - 1);
      ctx.lineTo(headX + HEAD_RY + 1, y + HEAD_RY + 1);
      ctx.moveTo(headX + HEAD_RY + 1, y - HEAD_RY - 1);
      ctx.lineTo(headX - HEAD_RY - 1, y + HEAD_RY + 1);
      ctx.stroke();
      return;
    }

    ctx.beginPath();
    ctx.ellipse(headX, y, HEAD_RX, HEAD_RY, -0.35, 0, Math.PI * 2);
    if (hollow) {
      ctx.lineWidth = 1.4;
      ctx.stroke();
    } else {
      ctx.fill();
    }
  });

  // Augmentation dot: in the space above a note that sits on a line.
  if (beat.dotted) {
    for (const head of info.heads) {
      const onLine = head.diatonic % 2 === 0;
      const y = yOfDiatonic(staff, head.diatonic) - (onLine ? sp / 2 : 0);
      ctx.beginPath();
      ctx.arc(x + HEAD_RX * 2 + 3, y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawNotationBeams(ctx: CanvasRenderingContext2D, group: { x: number; level: number }[], beamTipY: number, stemUp: boolean, sp: number) {
  const HEAD_RX = headRx(sp);
  const BEAM_THICKNESS = beamThickness(sp);
  const BEAM_SPACING = beamSpacing(sp);
  // Beams run between the stems, which sit at the same side offset for every note in the group.
  const offset = stemUp ? HEAD_RX - 0.6 : -HEAD_RX + 0.6;
  ctx.lineWidth = BEAM_THICKNESS;
  ctx.lineCap = "butt";
  const maxLevel = Math.max(...group.map((entry) => entry.level));

  for (let level = 1; level <= maxLevel; level++) {
    const y = beamTipY + (stemUp ? 1 : -1) * ((level - 1) * BEAM_SPACING + BEAM_THICKNESS / 2);
    let runStart: number | null = null;
    for (let i = 0; i <= group.length; i++) {
      const has = i < group.length && group[i].level >= level;
      if (has && runStart === null) runStart = i;
      if (!has && runStart !== null) {
        const runEnd = i - 1;
        ctx.beginPath();
        if (runEnd > runStart) {
          ctx.moveTo(group[runStart].x + offset - 0.7, y);
          ctx.lineTo(group[runEnd].x + offset + 0.7, y);
        } else {
          const direction = runStart === group.length - 1 ? -1 : 1;
          ctx.moveTo(group[runStart].x + offset, y);
          ctx.lineTo(group[runStart].x + offset + direction * sp, y);
        }
        ctx.stroke();
        runStart = null;
      }
    }
  }
  ctx.lineCap = "round";
}
