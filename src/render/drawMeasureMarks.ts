import type { Beat, Measure } from "../model/types";
import { REPEAT_START_WIDTH, TIME_SIGNATURE_WIDTH, type MeasureMarks } from "../editor/effectiveSettings";
import {
  BEAT_MARK_OFFSET,
  BEAT_TEXT_FONT,
  MEASURE_NUMBER_FONT,
  MEASURE_NUMBER_OFFSET,
  SECTION_FONT,
  SECTION_ROW_TOP,
  TEMPO_FONT,
  TEMPO_ROW_OFFSET,
  TEXT_ROW_OFFSET,
  TIME_SIGNATURE_FONT,
  type TabPalette,
} from "./constants";

/** Vertical geometry of one tab line (the live canvas has one; an export page has one per line). */
export interface LineGeometry {
  stringY: number[];
  tabTopY: number;
  tabBottomY: number;
}

export interface MeasureHeaderInput {
  measure: Measure;
  measureIndex: number;
  marks: MeasureMarks;
  startX: number;
  closeX: number;
}

/**
 * Everything Guitar Pro prints around a bar: measure number, section box, "♩ = N" tempo, time
 * signature, and repeat signs (plus the "x2" count). The plain barlines themselves are drawn by
 * the caller; repeat signs overlay them with the thick/thin pair and dots.
 */
export function drawMeasureHeader(
  ctx: CanvasRenderingContext2D,
  input: MeasureHeaderInput,
  geometry: LineGeometry,
  palette: TabPalette,
): void {
  const { measure, measureIndex, marks, startX, closeX } = input;
  const { tabTopY, tabBottomY, stringY } = geometry;

  ctx.save();

  ctx.font = MEASURE_NUMBER_FONT;
  ctx.fillStyle = palette.tuningLabel;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(String(measureIndex + 1), startX + 3, tabTopY - MEASURE_NUMBER_OFFSET);

  if (measure.sectionLabel) {
    ctx.font = SECTION_FONT;
    const textWidth = ctx.measureText(measure.sectionLabel).width;
    const boxX = startX + 2;
    const boxY = tabTopY - SECTION_ROW_TOP;
    ctx.strokeStyle = palette.chordLabel;
    ctx.lineWidth = 1.4;
    ctx.strokeRect(boxX, boxY, textWidth + 12, 16);
    ctx.fillStyle = palette.chordLabel;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(measure.sectionLabel, boxX + 6, boxY + 8.5);
  }

  if (marks.tempo !== null) drawTempoMarker(ctx, startX + 4, tabTopY - TEMPO_ROW_OFFSET, marks.tempo, palette);

  const hasRepeatStart = Boolean(measure.repeatStart);
  if (marks.timeSignature) {
    const centerX = startX + (hasRepeatStart ? REPEAT_START_WIDTH : 0) + TIME_SIGNATURE_WIDTH / 2;
    drawTimeSignature(ctx, centerX, stringY, marks.timeSignature, palette);
  }

  ctx.strokeStyle = palette.barline;
  ctx.fillStyle = palette.barline;
  if (hasRepeatStart) {
    ctx.fillRect(startX - 1, tabTopY, 3, tabBottomY - tabTopY);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(startX + 5, tabTopY);
    ctx.lineTo(startX + 5, tabBottomY);
    ctx.stroke();
    drawRepeatDots(ctx, startX + 10, stringY);
  }
  if (measure.repeatEnd) {
    ctx.fillRect(closeX - 2, tabTopY, 3, tabBottomY - tabTopY);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(closeX - 6, tabTopY);
    ctx.lineTo(closeX - 6, tabBottomY);
    ctx.stroke();
    drawRepeatDots(ctx, closeX - 11, stringY);

    ctx.font = MEASURE_NUMBER_FONT;
    ctx.fillStyle = palette.tuningLabel;
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`x${measure.repeatEnd}`, closeX - 1, tabTopY - MEASURE_NUMBER_OFFSET);
  }

  ctx.restore();
}

function drawRepeatDots(ctx: CanvasRenderingContext2D, x: number, stringY: number[]) {
  for (const y of [(stringY[1] + stringY[2]) / 2, (stringY[3] + stringY[4]) / 2]) {
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTempoMarker(ctx: CanvasRenderingContext2D, x: number, y: number, tempo: number, palette: TabPalette) {
  ctx.fillStyle = palette.chordLabel;
  ctx.strokeStyle = palette.chordLabel;
  ctx.beginPath();
  ctx.ellipse(x + 4, y + 5, 3.6, 2.7, -0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(x + 7.3, y + 4);
  ctx.lineTo(x + 7.3, y - 8);
  ctx.stroke();

  ctx.font = TEMPO_FONT;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(`= ${tempo}`, x + 14, y);
}

function drawTimeSignature(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  stringY: number[],
  timeSignature: { num: number; den: number },
  palette: TabPalette,
) {
  ctx.font = TIME_SIGNATURE_FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const rows: [string, number][] = [
    [String(timeSignature.num), stringY[1]],
    [String(timeSignature.den), stringY[4]],
  ];
  for (const [label, y] of rows) {
    const width = ctx.measureText(label).width;
    ctx.fillStyle = palette.background;
    ctx.fillRect(centerX - width / 2 - 2, y - 11, width + 4, 22);
    ctx.fillStyle = palette.fretNumber;
    ctx.fillText(label, centerX, y);
  }
}

/** Free text above a beat (Guitar Pro's "T"), left-aligned from the beat like a text annotation. */
export function drawBeatText(ctx: CanvasRenderingContext2D, x: number, tabTopY: number, text: string, palette: TabPalette) {
  ctx.save();
  ctx.font = BEAT_TEXT_FONT;
  ctx.fillStyle = palette.chordLabel;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x - 10, tabTopY - TEXT_ROW_OFFSET);
  ctx.restore();
}

interface BeatGlyph {
  width: number;
  draw: (cx: number, cy: number) => void;
}

/** Accent, staccato, fermata, trill and pick-stroke glyphs, laid out in one row above the beat. */
export function drawBeatMarks(ctx: CanvasRenderingContext2D, beat: Beat, x: number, tabTopY: number, palette: TabPalette) {
  const glyphs: BeatGlyph[] = [];

  if (beat.pickStroke) {
    const down = beat.pickStroke === "down";
    glyphs.push({
      width: 10,
      draw: (cx, cy) => {
        ctx.beginPath();
        if (down) {
          ctx.moveTo(cx - 4, cy + 4);
          ctx.lineTo(cx - 4, cy - 4);
          ctx.lineTo(cx + 4, cy - 4);
          ctx.lineTo(cx + 4, cy + 4);
        } else {
          ctx.moveTo(cx - 4, cy - 4);
          ctx.lineTo(cx, cy + 4);
          ctx.lineTo(cx + 4, cy - 4);
        }
        ctx.stroke();
      },
    });
  }
  if (beat.accent) {
    const heavy = beat.accent === "heavy";
    glyphs.push({
      width: 10,
      draw: (cx, cy) => {
        ctx.beginPath();
        if (heavy) {
          ctx.moveTo(cx - 4, cy + 4);
          ctx.lineTo(cx, cy - 5);
          ctx.lineTo(cx + 4, cy + 4);
        } else {
          ctx.moveTo(cx - 5, cy - 4);
          ctx.lineTo(cx + 4, cy);
          ctx.lineTo(cx - 5, cy + 4);
        }
        ctx.stroke();
      },
    });
  }
  if (beat.staccato) {
    glyphs.push({
      width: 6,
      draw: (cx, cy) => {
        ctx.beginPath();
        ctx.arc(cx, cy, 1.9, 0, Math.PI * 2);
        ctx.fill();
      },
    });
  }
  if (beat.fermata) {
    glyphs.push({
      width: 16,
      draw: (cx, cy) => {
        ctx.beginPath();
        ctx.arc(cx, cy + 3, 7, Math.PI, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy + 2, 1.5, 0, Math.PI * 2);
        ctx.fill();
      },
    });
  }
  if (beat.trill) {
    glyphs.push({
      width: 14,
      draw: (cx, cy) => {
        ctx.font = "italic bold 12px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("tr", cx, cy);
      },
    });
  }
  if (glyphs.length === 0) return;

  const gap = 4;
  const total = glyphs.reduce((sum, glyph) => sum + glyph.width, 0) + gap * (glyphs.length - 1);
  let cursor = x - total / 2;
  const cy = tabTopY - BEAT_MARK_OFFSET;

  ctx.save();
  ctx.strokeStyle = palette.articulation;
  ctx.fillStyle = palette.articulation;
  ctx.lineWidth = 1.6;
  ctx.lineJoin = "round";
  for (const glyph of glyphs) {
    glyph.draw(cursor + glyph.width / 2, cy);
    cursor += glyph.width + gap;
  }
  ctx.restore();
}

/**
 * Arc from the previous note on the same string to each tied note. `beats` is just the beats
 * of the line being drawn: when the previous note is on an earlier line the arc is a short tail.
 */
export function drawTies(
  ctx: CanvasRenderingContext2D,
  beats: { beat: Beat; x: number }[],
  stringY: number[],
  palette: TabPalette,
): void {
  ctx.save();
  ctx.strokeStyle = palette.articulation;
  ctx.lineWidth = 1.4;

  beats.forEach(({ beat, x }, index) => {
    if (beat.isRest) return;
    for (const note of beat.notes) {
      if (!note.tie) continue;
      let fromX: number | null = null;
      for (let j = index - 1; j >= 0; j--) {
        if (beats[j].beat.notes.some((other) => other.string === note.string)) {
          fromX = beats[j].x;
          break;
        }
      }
      const y = stringY[note.string - 1] - 11;
      const startX = fromX === null ? x - 30 : fromX + 9;
      const endX = x - 9;
      if (endX <= startX) continue;
      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.quadraticCurveTo((startX + endX) / 2, y - 9, endX, y);
      ctx.stroke();
    }
  });

  ctx.restore();
}
