import type { Beat, Duration } from "../model/types";
import { STEM_LENGTH, type TabPalette } from "./constants";

export interface RhythmBeat {
  beat: Beat;
  x: number;
}

/** Whole-note length of one beam group: a dotted quarter in 6/8-style meters, otherwise a quarter. */
export function beamGroupLength(timeSignature: { num: number; den: number }): number {
  return timeSignature.den === 8 && timeSignature.num % 3 === 0 ? 3 / 8 : 1 / 4;
}

function beatLength(beat: Beat): number {
  let length = 1 / beat.duration;
  if (beat.dotted) length *= 1.5;
  if (beat.tuplet) length *= beat.tuplet.over / beat.tuplet.count;
  return length;
}

/** Number of beams/flags: 8th = 1, 16th = 2, 32nd = 3, longer notes = 0. */
function flagLevel(duration: Duration): number {
  return duration === 8 ? 1 : duration === 16 ? 2 : duration === 32 ? 3 : 0;
}

function isBeamable(beat: Beat): boolean {
  return !beat.isRest && flagLevel(beat.duration) > 0;
}

const BEAM_THICKNESS = 3;
const BEAM_SPACING = 5;
const FLAG_LENGTH_X = 8;
const FLAG_LENGTH_Y = 8;
const STUB_LENGTH = 8;

/**
 * Rhythm notation under one measure of tab, Guitar Pro style: stems hang down from the staff,
 * consecutive eighth/16th/32nd notes inside a beat are joined by beams (lone ones get flags),
 * half and whole notes get a hollow head, rests get their own symbols, and triplets get a "3".
 */
export function drawMeasureRhythm(
  ctx: CanvasRenderingContext2D,
  beats: RhythmBeat[],
  baselineY: number,
  groupLength: number,
  palette: TabPalette,
): void {
  const stemBottomY = baselineY + STEM_LENGTH;

  // Split into beam groups: consecutive beamable beats that start inside the same beat of the bar.
  const groupOf: number[] = new Array(beats.length).fill(-1);
  const groups: number[][] = [];
  let position = 0;
  let currentGroupKey = -1;
  beats.forEach(({ beat }, index) => {
    const key = Math.floor(position / groupLength + 1e-6);
    if (isBeamable(beat)) {
      const previousInGroup = index > 0 && groupOf[index - 1] >= 0;
      if (previousInGroup && key === currentGroupKey) {
        groups[groups.length - 1].push(index);
        groupOf[index] = groups.length - 1;
      } else {
        groups.push([index]);
        groupOf[index] = groups.length - 1;
      }
      currentGroupKey = key;
    }
    position += beatLength(beat);
  });

  ctx.save();
  ctx.strokeStyle = palette.rhythmStem;
  ctx.fillStyle = palette.rhythmStem;
  ctx.lineCap = "round";

  beats.forEach(({ beat, x }, index) => {
    if (beat.isRest) {
      drawRestSymbol(ctx, x, baselineY + STEM_LENGTH / 2, beat);
      return;
    }
    drawStemAndHead(ctx, x, baselineY, stemBottomY, beat);

    const group = groups[groupOf[index]];
    if (group && group.length === 1) drawFlags(ctx, x, stemBottomY, flagLevel(beat.duration));
  });

  for (const group of groups) {
    if (group.length > 1) drawBeams(ctx, group.map((index) => ({ x: beats[index].x, level: flagLevel(beats[index].beat.duration) })), stemBottomY);
  }

  drawTupletNumbers(ctx, beats, stemBottomY, palette);
  ctx.restore();
}

function drawStemAndHead(ctx: CanvasRenderingContext2D, x: number, baselineY: number, stemBottomY: number, beat: Beat) {
  const hollow = beat.duration <= 2;
  let headWidth = 0;

  if (hollow) {
    headWidth = 3.6;
    ctx.save();
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(x, baselineY + 3, headWidth, 2.6, -0.3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  if (beat.duration !== 1) {
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, baselineY + (hollow ? 5.5 : 0));
    ctx.lineTo(x, stemBottomY);
    ctx.stroke();
  }

  if (beat.dotted) {
    ctx.beginPath();
    ctx.arc(x + headWidth + 5, baselineY + (hollow ? 3 : 7), 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Single (unbeamed) eighth/16th/32nd: short diagonal flags off the end of the stem. */
function drawFlags(ctx: CanvasRenderingContext2D, x: number, stemBottomY: number, level: number) {
  ctx.lineWidth = 1.8;
  for (let i = 0; i < level; i++) {
    const y = stemBottomY - i * BEAM_SPACING;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + FLAG_LENGTH_X, y - FLAG_LENGTH_Y);
    ctx.stroke();
  }
}

function drawBeams(ctx: CanvasRenderingContext2D, group: { x: number; level: number }[], stemBottomY: number) {
  ctx.lineWidth = BEAM_THICKNESS;
  ctx.lineCap = "butt";

  const maxLevel = Math.max(...group.map((entry) => entry.level));
  for (let level = 1; level <= maxLevel; level++) {
    // Beam level 1 sits at the stem end; deeper levels stack toward the staff.
    const y = stemBottomY - (level - 1) * BEAM_SPACING - BEAM_THICKNESS / 2;
    let runStart: number | null = null;

    for (let i = 0; i <= group.length; i++) {
      const has = i < group.length && group[i].level >= level;
      if (has && runStart === null) runStart = i;
      if (!has && runStart !== null) {
        const runEnd = i - 1;
        if (runEnd > runStart) {
          ctx.beginPath();
          ctx.moveTo(group[runStart].x, y);
          ctx.lineTo(group[runEnd].x, y);
          ctx.stroke();
        } else {
          // A lone short note inside a longer group: a stub pointing at its neighbor.
          const x = group[runStart].x;
          const direction = runStart === group.length - 1 ? -1 : 1;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + direction * STUB_LENGTH, y);
          ctx.stroke();
        }
        runStart = null;
      }
    }
  }
  ctx.lineCap = "round";
}

export function drawRestSymbol(ctx: CanvasRenderingContext2D, x: number, centerY: number, beat: Beat) {
  ctx.lineWidth = 1.6;

  switch (beat.duration) {
    case 1: // whole rest: block hanging from a line
      ctx.beginPath();
      ctx.moveTo(x - 7, centerY - 3);
      ctx.lineTo(x + 7, centerY - 3);
      ctx.stroke();
      ctx.fillRect(x - 5, centerY - 3, 10, 4.5);
      break;
    case 2: // half rest: block sitting on a line
      ctx.beginPath();
      ctx.moveTo(x - 7, centerY + 2);
      ctx.lineTo(x + 7, centerY + 2);
      ctx.stroke();
      ctx.fillRect(x - 5, centerY - 2.5, 10, 4.5);
      break;
    case 4: // quarter rest: the classic zig-zag
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(x - 2, centerY - 10);
      ctx.lineTo(x + 3, centerY - 4);
      ctx.lineTo(x - 2.5, centerY + 1);
      ctx.lineTo(x + 3, centerY + 7);
      ctx.quadraticCurveTo(x - 4, centerY + 6, x - 2, centerY + 12);
      ctx.stroke();
      break;
    default: {
      // 8th/16th/32nd rest: a slanted stem with one dot per flag.
      const level = flagLevel(beat.duration);
      const topX = x + 3;
      const topY = centerY - 10;
      const bottomX = x - 1 - level;
      const bottomY = centerY + 10;
      ctx.beginPath();
      ctx.moveTo(topX, topY);
      ctx.lineTo(bottomX, bottomY);
      ctx.stroke();
      for (let i = 0; i < level; i++) {
        const t = 0.2 + i * 0.28;
        const px = topX + (bottomX - topX) * t;
        const py = topY + (bottomY - topY) * t;
        ctx.beginPath();
        ctx.arc(px - 3.2, py + 1.5, 1.9, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  if (beat.dotted) {
    ctx.beginPath();
    ctx.arc(x + 9, centerY - 2, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A small "3" (or n) under each run of tuplet beats, centered on the group. */
function drawTupletNumbers(ctx: CanvasRenderingContext2D, beats: RhythmBeat[], stemBottomY: number, palette: TabPalette) {
  ctx.font = "italic bold 11px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = palette.rhythmStem;

  let index = 0;
  while (index < beats.length) {
    const tuplet = beats[index].beat.tuplet;
    if (!tuplet) {
      index += 1;
      continue;
    }
    let end = index;
    while (end + 1 < beats.length && end + 1 - index < tuplet.count && beats[end + 1].beat.tuplet?.count === tuplet.count) end += 1;
    const centerX = (beats[index].x + beats[end].x) / 2;
    ctx.fillText(String(tuplet.count), centerX, stemBottomY + 9);
    index = end + 1;
  }
}
