import type { Beat, BendPreset, Measure, Project } from "../model/types";
import { measureLeadWidth, resolveMeasureMarks, type MeasureMarks } from "../editor/effectiveSettings";

export type LineBreakMode =
  | { kind: "auto" }
  | { kind: "fixed"; measuresPerLine: number }
  /** Single-strip export (section 14): every measure on one line, natural width, never
   * stretched — there is no target width to justify against. */
  | { kind: "natural" };

const CHAR_WIDTH_ESTIMATE = 6.5; // px; rough estimate for the small sans-serif fonts used throughout
const BASE_BEAT_WIDTH = 36;
const LABEL_PADDING = 8;

function textWidthEstimate(text: string): number {
  return text.length * CHAR_WIDTH_ESTIMATE;
}

// Mirrors drawTab.ts's BEND_LABELS, kept separately so this module stays canvas-free and
// importable from a pure layout context (no CanvasRenderingContext2D needed for estimation).
const BEND_LABEL_TEXT: Record<BendPreset, string> = {
  half: "½",
  full: "full",
  oneAndHalf: "1½",
  bendRelease: "bend/release",
  preBend: "pre-bend",
  preBendRelease: "pre/release",
};

const PALM_MUTE_LABEL_WIDTH = textWidthEstimate("PM");
const LET_RING_LABEL_WIDTH = textWidthEstimate("let ring");

/** Section 14: width depends on beat content, not just a fixed per-beat slot — chord labels
 * and bend amount labels can be wider than a plain fret number. */
export function estimateBeatWidth(beat: Beat): number {
  let width = BASE_BEAT_WIDTH;
  if (beat.chordRef) {
    width = Math.max(width, textWidthEstimate(beat.chordRef) + LABEL_PADDING);
  }
  if (beat.text) {
    width = Math.max(width, textWidthEstimate(beat.text) * 0.85 + LABEL_PADDING);
  }
  for (const note of beat.notes) {
    if (note.bend) {
      width = Math.max(width, textWidthEstimate(BEND_LABEL_TEXT[note.bend]) + LABEL_PADDING);
    }
  }
  return width;
}

export function estimateMeasureWidth(measure: Measure, leadWidth = 0): number {
  let width = leadWidth + measure.beats.reduce((sum, beat) => sum + estimateBeatWidth(beat), 0);
  if (measure.beats.some((beat) => beat.palmMute)) width += PALM_MUTE_LABEL_WIDTH;
  if (measure.beats.some((beat) => beat.letRing)) width += LET_RING_LABEL_WIDTH;
  return width;
}

export interface LineLayoutBeat {
  beat: Beat;
  width: number;
  x: number;
  /** Index into the whole track's beat sequence (measure order), for hammer-direction lookups
   * that must see past this line's own boundary. */
  flatIndex: number;
}

export interface LineLayoutMeasure {
  measure: Measure;
  /** Index into the whole track's measures — for the measure number and section/tempo rows. */
  measureIndex: number;
  marks: MeasureMarks;
  startX: number;
  endX: number;
  /** Where the closing barline goes — a line's measures are flush, so this is just endX. */
  closeX: number;
  beats: LineLayoutBeat[];
}

export interface LineLayoutLine {
  measures: LineLayoutMeasure[];
  width: number;
}

/** One export "page" — one PNG's worth of lines (section 14's multi-PNG split unit). */
export interface LineLayoutPage {
  lines: LineLayoutLine[];
}

const LEFT_MARGIN = 24;

/**
 * Section 14's two rules: a line break always falls on a measure boundary — never mid-measure
 * — and the default is auto width/density-based, with 1-8 fixed measures/line as an override.
 * Whole measures are always the unit assigned to a line, so a split mid-measure is structurally
 * impossible here, not just avoided by convention.
 *
 * `availableLines` says how many lines fit in one export "page" (e.g. 4 for a reel square,
 * or 3 with the title block reserving a line — the caller computes that, this function just
 * paginates on it). Content needing more lines than that becomes multiple pages, which the
 * exporter turns into `{proje}_part1.png`, `_part2.png`, etc. — always split at a line boundary,
 * which is already measure-aligned.
 */
export function computeLineBreaks(
  project: Project,
  mode: LineBreakMode,
  lineWidthBudget: number,
  availableLines: number,
): LineLayoutPage[] {
  const measures = project.track.measures;
  if (measures.length === 0) return [{ lines: [] }];

  const allMarks = resolveMeasureMarks(project);
  const leads = measures.map((measure, i) => measureLeadWidth(allMarks[i], measure));

  const groups: number[][] =
    mode.kind === "fixed"
      ? chunkFixed(measures.length, mode.measuresPerLine)
      : mode.kind === "natural"
        ? [measures.map((_, i) => i)]
        : chunkAuto(measures, leads, lineWidthBudget - LEFT_MARGIN);

  let flatIndexCursor = 0;
  const measureStartFlatIndex: number[] = measures.map((measure) => {
    const start = flatIndexCursor;
    flatIndexCursor += measure.beats.length;
    return start;
  });

  const lines = groups.map((measureIndices) =>
    buildLine(measures, allMarks, leads, measureIndices, measureStartFlatIndex, mode, lineWidthBudget),
  );

  const linesPerPage = Math.max(1, availableLines);
  const pages: LineLayoutPage[] = [];
  for (let i = 0; i < lines.length; i += linesPerPage) {
    pages.push({ lines: lines.slice(i, i + linesPerPage) });
  }
  return pages;
}

function chunkFixed(measureCount: number, measuresPerLine: number): number[][] {
  const groups: number[][] = [];
  for (let i = 0; i < measureCount; i += measuresPerLine) {
    groups.push(
      Array.from({ length: Math.min(measuresPerLine, measureCount - i) }, (_, j) => i + j),
    );
  }
  return groups;
}

function chunkAuto(measures: Measure[], leads: number[], availableWidth: number): number[][] {
  const naturalWidths = measures.map((measure, i) => estimateMeasureWidth(measure, leads[i]));
  const groups: number[][] = [];
  let current: number[] = [];
  let currentWidth = 0;

  for (let i = 0; i < measures.length; i++) {
    const w = naturalWidths[i];
    if (current.length > 0 && currentWidth + w > availableWidth) {
      groups.push(current);
      current = [];
      currentWidth = 0;
    }
    current.push(i);
    currentWidth += w;
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

function buildLine(
  measures: Measure[],
  allMarks: MeasureMarks[],
  leads: number[],
  measureIndices: number[],
  measureStartFlatIndex: number[],
  mode: LineBreakMode,
  lineWidthBudget: number,
): LineLayoutLine {
  const availableWidth = lineWidthBudget - LEFT_MARGIN;
  let beatWidths: number[][];

  if (mode.kind === "fixed") {
    // "Ölçüler eşit genişlikte çizilir": every measure gets an equal share of the line, and
    // every beat within it an equal share of that measure.
    const perMeasure = availableWidth / measureIndices.length;
    beatWidths = measureIndices.map((mi) => {
      const beatCount = measures[mi].beats.length || 1;
      return measures[mi].beats.map(() => Math.max(1, perMeasure - leads[mi]) / beatCount);
    });
  } else if (mode.kind === "natural") {
    // No budget to fill — the strip is exactly as wide as its content, unstretched.
    beatWidths = measureIndices.map((mi) => measures[mi].beats.map(estimateBeatWidth));
  } else {
    const naturalPerBeat = measureIndices.map((mi) => measures[mi].beats.map(estimateBeatWidth));
    const totalLead = measureIndices.reduce((sum, mi) => sum + leads[mi], 0);
    const totalNatural = naturalPerBeat.reduce((sum, ws) => sum + ws.reduce((a, b) => a + b, 0), 0);
    // "Kalan boşluk ölçüler arasında orantılı dağıtılır": scale every beat by the same factor
    // so the line fills the budget exactly, proportions preserved. Never shrink — an
    // unbreakable, over-budget single measure is left at its natural width instead.
    const scale = totalNatural > 0 ? Math.max(1, (availableWidth - totalLead) / totalNatural) : 1;
    beatWidths = naturalPerBeat.map((widths) => widths.map((w) => w * scale));
  }

  let x = LEFT_MARGIN;
  const lineMeasures: LineLayoutMeasure[] = measureIndices.map((mi, i) => {
    const measure = measures[mi];
    const startX = x;
    x += leads[mi];
    const beats: LineLayoutBeat[] = measure.beats.map((beat, bi) => {
      const width = beatWidths[i][bi];
      const beatX = x + width / 2;
      x += width;
      return { beat, width, x: beatX, flatIndex: measureStartFlatIndex[mi] + bi };
    });
    return { measure, measureIndex: mi, marks: allMarks[mi], startX, endX: x, closeX: x, beats };
  });

  return { measures: lineMeasures, width: x };
}
