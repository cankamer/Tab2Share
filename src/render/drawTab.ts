import type { Beat, BendPreset, Note, Project, SlideType } from "../model/types";
import { isStandardTuning } from "../model/tunings";
import type { TabLayout } from "./layout";
import {
  ARTICULATION_FONT,
  BEAT_WIDTH,
  CAPO_LABEL_OFFSET,
  CHORD_LABEL_FONT,
  CHORD_LABEL_OFFSET,
  EFFECT_LABEL_FONT,
  FLAG_GAP,
  FLAG_WIDTH,
  FRET_NUMBER_FONT,
  STEM_LENGTH,
  TUNING_LABEL_FONT,
  TUNING_LABEL_WIDTH,
  type TabPalette,
} from "./constants";
import { drawBeatMarks, drawBeatText, drawMeasureHeader, drawTies } from "./drawMeasureMarks";

export interface EditorVisual {
  cursor: { flatIndex: number; string: 1 | 2 | 3 | 4 | 5 | 6 };
  /** Inclusive [lo, hi] flatIndex selection range, or null when nothing is selected. */
  selectionRange: [number, number] | null;
  /** First digit of a two-digit fret still waiting for its second digit, or null. */
  pendingDigit: number | null;
}

function drawStringLines(ctx: CanvasRenderingContext2D, project: Project, layout: TabLayout, palette: TabPalette) {
  const lastMeasure = layout.measures[layout.measures.length - 1];
  const endX = lastMeasure ? lastMeasure.endX : TUNING_LABEL_WIDTH;

  ctx.strokeStyle = palette.stringLine;
  ctx.lineWidth = 1;
  layout.stringY.forEach((y) => {
    ctx.beginPath();
    ctx.moveTo(TUNING_LABEL_WIDTH, y);
    ctx.lineTo(endX, y);
    ctx.stroke();
  });

  ctx.font = TUNING_LABEL_FONT;
  ctx.fillStyle = palette.tuningLabel;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  layout.stringY.forEach((y, row) => {
    const openStringName = project.track.tuning[5 - row];
    ctx.fillText(openStringName, 2, y);
  });
}

function drawBarlines(ctx: CanvasRenderingContext2D, layout: TabLayout, palette: TabPalette) {
  ctx.strokeStyle = palette.barline;
  ctx.lineWidth = 1;

  const drawBarline = (x: number) => {
    ctx.beginPath();
    ctx.moveTo(x, layout.tabTopY);
    ctx.lineTo(x, layout.tabBottomY);
    ctx.stroke();
  };

  layout.measures.forEach((measure) => drawBarline(measure.startX));
  const lastMeasure = layout.measures[layout.measures.length - 1];
  if (lastMeasure) drawBarline(lastMeasure.endX);
}

export function drawRhythmStem(
  ctx: CanvasRenderingContext2D,
  x: number,
  baselineY: number,
  beat: Beat,
  palette: TabPalette,
) {
  if (beat.duration === 1) return; // whole note: no stem

  const stemBottomY = baselineY + STEM_LENGTH;
  ctx.strokeStyle = palette.rhythmStem;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, baselineY);
  ctx.lineTo(x, stemBottomY);
  ctx.stroke();

  const flagCount = beat.duration === 8 ? 1 : beat.duration === 16 ? 2 : beat.duration === 32 ? 3 : 0;
  for (let i = 0; i < flagCount; i++) {
    const flagY = stemBottomY - i * FLAG_GAP;
    ctx.beginPath();
    ctx.moveTo(x, flagY);
    ctx.quadraticCurveTo(
      x + FLAG_WIDTH,
      flagY + FLAG_GAP / 2,
      x + FLAG_WIDTH * 0.6,
      flagY + FLAG_GAP,
    );
    ctx.stroke();
  }

  if (beat.dotted) {
    ctx.fillStyle = palette.rhythmStem;
    ctx.beginPath();
    ctx.arc(x + 5, stemBottomY - 4, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

const BEND_LABELS: Record<BendPreset, string> = {
  half: "½",
  full: "full",
  oneAndHalf: "1½",
  bendRelease: "b/r",
  preBend: "pre",
  preBendRelease: "p/r",
};

const SLIDE_GLYPHS: Record<SlideType, string> = {
  legato: "/",
  shift: "/",
  inFromBelow: "/",
  inFromAbove: "\\",
  outUp: "/",
  outDown: "\\",
};

/** Fret number/x/(ghost), plus the bend arrow, vibrato squiggle, and slide/hammer glyphs (section 7). */
export function drawNote(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  note: Note,
  hammerDirection: "h" | "p" | null,
  palette: TabPalette,
  tabTopY?: number,
) {
  const label = note.dead
    ? "x"
    : note.harmonic
      ? `<${note.fret}>`
      : note.ghost || note.tie
        ? `(${note.fret})`
        : String(note.fret);
  ctx.font = FRET_NUMBER_FONT;
  const width = ctx.measureText(label).width;

  ctx.fillStyle = palette.background;
  ctx.fillRect(x - width / 2 - 4, y - 9, width + 8, 18);

  ctx.fillStyle = palette.fretNumber;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x, y);

  if (note.slide) {
    ctx.font = ARTICULATION_FONT;
    ctx.fillStyle = palette.articulation;
    ctx.textBaseline = "middle";
    const glyph = SLIDE_GLYPHS[note.slide.type];
    const isSlideIn = note.slide.type === "inFromBelow" || note.slide.type === "inFromAbove";

    if (isSlideIn) {
      ctx.textAlign = "right";
      ctx.fillText(glyph, x - width / 2 - 3, y);
    } else {
      ctx.textAlign = "left";
      ctx.fillText(glyph, x + width / 2 + 3, y);
    }
  }

  let glyphX = x + width / 2 + 8;
  if (note.hammer && hammerDirection) {
    ctx.font = ARTICULATION_FONT;
    ctx.fillStyle = palette.articulation;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(hammerDirection, glyphX, y);
  }

  if (note.bend) drawBendArrow(ctx, x, y, tabTopY ?? y, note.bend, palette);
  if (note.vibrato) drawVibrato(ctx, x, y, tabTopY ?? y, Boolean(note.bend), note.vibrato === "wide", palette);
}

function drawBendArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tabTopY: number,
  preset: BendPreset,
  palette: TabPalette,
) {
  const startX = x + 8;
  const baseY = y;
  const tipY = Math.min(y - 24, tabTopY - 24);
  const tipX = startX + 14;

  ctx.strokeStyle = palette.articulation;
  ctx.fillStyle = palette.articulation;
  ctx.lineWidth = 1.6;

  if (preset === "preBend") {
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(startX, baseY);
    ctx.lineTo(startX, tipY);
    ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.moveTo(startX, tipY);
    ctx.lineTo(startX - 4, tipY + 6);
    ctx.lineTo(startX + 4, tipY + 6);
    ctx.closePath();
    ctx.fill();

    ctx.font = EFFECT_LABEL_FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(BEND_LABELS[preset], startX, tipY - 3);
  } else if (preset === "bendRelease") {
    // Bend curve: right first, then upward
    ctx.beginPath();
    ctx.moveTo(startX, baseY);
    ctx.quadraticCurveTo(tipX, baseY, tipX, tipY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - 4, tipY + 6);
    ctx.lineTo(tipX + 4, tipY + 6);
    ctx.closePath();
    ctx.fill();

    const releaseEndX = tipX + 22;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.quadraticCurveTo(releaseEndX, tipY, releaseEndX, baseY);
    ctx.stroke();

    // Downward arrowhead at the end of release curve
    ctx.beginPath();
    ctx.moveTo(releaseEndX, baseY);
    ctx.lineTo(releaseEndX - 3.5, baseY - 6);
    ctx.lineTo(releaseEndX + 3.5, baseY - 6);
    ctx.closePath();
    ctx.fill();

    ctx.font = EFFECT_LABEL_FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(BEND_LABELS[preset], (tipX + releaseEndX) / 2, tipY - 3);
  } else if (preset === "preBendRelease") {
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(startX, baseY);
    ctx.lineTo(startX, tipY);
    ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.moveTo(startX, tipY);
    ctx.lineTo(startX - 4, tipY + 6);
    ctx.lineTo(startX + 4, tipY + 6);
    ctx.closePath();
    ctx.fill();

    const releaseEndX = startX + 22;
    ctx.beginPath();
    ctx.moveTo(startX, tipY);
    ctx.quadraticCurveTo(releaseEndX, tipY, releaseEndX, baseY);
    ctx.stroke();

    // Downward arrowhead at the end of release curve
    ctx.beginPath();
    ctx.moveTo(releaseEndX, baseY);
    ctx.lineTo(releaseEndX - 3.5, baseY - 6);
    ctx.lineTo(releaseEndX + 3.5, baseY - 6);
    ctx.closePath();
    ctx.fill();

    ctx.font = EFFECT_LABEL_FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(BEND_LABELS[preset], (startX + releaseEndX) / 2, tipY - 3);
  } else {
    // Bend curve: right first, then upward to tipX, tipY
    ctx.beginPath();
    ctx.moveTo(startX, baseY);
    ctx.quadraticCurveTo(tipX, baseY, tipX, tipY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - 4, tipY + 6);
    ctx.lineTo(tipX + 4, tipY + 6);
    ctx.closePath();
    ctx.fill();

    ctx.font = EFFECT_LABEL_FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(BEND_LABELS[preset], tipX, tipY - 3);
  }
}

function drawVibrato(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tabTopY: number,
  stacked: boolean,
  wide: boolean,
  palette: TabPalette,
) {
  const rowY = Math.min(y - 18, tabTopY - (stacked ? 44 : 18));
  const waveWidth = wide ? 30 : 20;
  const startX = x - waveWidth / 2;
  const endX = startX + waveWidth;
  const amplitude = wide ? 3.0 : 2.2;

  ctx.strokeStyle = palette.vibrato;
  ctx.lineWidth = wide ? 2.2 : 1.8;
  ctx.beginPath();

  const frequency = wide ? 0.38 : 0.5;
  ctx.moveTo(startX, rowY);
  for (let px = startX; px <= endX; px += 1) {
    const py = rowY + amplitude * Math.sin((px - startX) * frequency);
    ctx.lineTo(px, py);
  }
  ctx.stroke();
}

/**
 * Section 7's auto direction rule: "aynı teldeki sonraki nota daha yüksek perdedeyse h,
 * düşükse p basılır." Scans forward for the next note on the same string; null (drawn as
 * nothing) when there isn't one or the frets are equal, since direction can't be determined.
 */
export function resolveHammerDirection(
  flatBeats: { beat: Beat }[],
  fromFlatIndex: number,
  string: Note["string"],
  currentFret: number,
): "h" | "p" | null {
  for (let i = fromFlatIndex + 1; i < flatBeats.length; i++) {
    const next = flatBeats[i].beat.notes.find((note) => note.string === string);
    if (!next) continue;
    if (next.fret > currentFret) return "h";
    if (next.fret < currentFret) return "p";
    return null;
  }
  return null;
}

function drawBracketRun(
  ctx: CanvasRenderingContext2D,
  rowY: number,
  startX: number,
  endX: number,
  startHalfWidth: number,
  endHalfWidth: number,
  label: string,
  palette: TabPalette,
) {
  const left = startX - startHalfWidth + 2;
  const right = endX + endHalfWidth - 2;

  ctx.strokeStyle = palette.effectRow;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(left, rowY);
  ctx.lineTo(right, rowY);
  ctx.stroke();
  ctx.setLineDash([]);

  for (const tickX of [left, right]) {
    ctx.beginPath();
    ctx.moveTo(tickX, rowY - 3);
    ctx.lineTo(tickX, rowY + 3);
    ctx.stroke();
  }

  ctx.font = EFFECT_LABEL_FONT;
  ctx.fillStyle = palette.effectRow;
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText(label, left + 2, rowY - 1);
}

/** Palm mute / let ring (section 7): one bracket per run of consecutive beats with the flag set. */
export function drawFlagRuns(
  ctx: CanvasRenderingContext2D,
  flatBeats: { x: number; width: number; beat: Beat }[],
  rowY: number,
  label: string,
  isActive: (beat: Beat) => boolean,
  palette: TabPalette,
) {
  let runStart: { x: number; width: number } | null = null;
  let runEnd: { x: number; width: number } | null = null;

  for (let i = 0; i <= flatBeats.length; i++) {
    const active = i < flatBeats.length && isActive(flatBeats[i].beat);
    if (active) {
      if (runStart === null) runStart = flatBeats[i];
      runEnd = flatBeats[i];
    } else if (runStart !== null && runEnd !== null) {
      drawBracketRun(ctx, rowY, runStart.x, runEnd.x, runStart.width / 2, runEnd.width / 2, label, palette);
      runStart = null;
    }
  }
}

export function drawChordLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  tabTopY: number,
  chordRef: string,
  showTuningWarning: boolean,
  palette: TabPalette,
) {
  const y = tabTopY - CHORD_LABEL_OFFSET;
  ctx.font = CHORD_LABEL_FONT;
  ctx.fillStyle = palette.chordLabel;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(chordRef, x, y);

  if (showTuningWarning) {
    const labelWidth = ctx.measureText(chordRef).width;
    ctx.fillStyle = palette.pendingDigitBorder;
    ctx.textAlign = "left";
    ctx.fillText("⚠", x + labelWidth / 2 + 3, y);
  }
}

/** Section 9.2: printed once at the start of the tab when a capo is set. */
export function drawCapoLabel(ctx: CanvasRenderingContext2D, capo: number, palette: TabPalette, y = 4) {
  if (capo <= 0) return;
  ctx.font = TUNING_LABEL_FONT;
  ctx.fillStyle = palette.tuningLabel;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(`Capo ${capo}`, 2, y);
}

function columnBounds(layout: TabLayout, x: number) {
  return { left: x - BEAT_WIDTH / 2, top: layout.tabTopY - 4, width: BEAT_WIDTH, height: layout.tabBottomY - layout.tabTopY + 8 };
}

function drawSelection(
  ctx: CanvasRenderingContext2D,
  layout: TabLayout,
  range: [number, number],
  palette: TabPalette,
) {
  const [lo, hi] = range;
  ctx.fillStyle = palette.selectionFill;
  for (let i = lo; i <= hi; i++) {
    const placement = layout.flatBeats[i];
    if (!placement) continue;
    const { left, top, width, height } = columnBounds(layout, placement.x);
    ctx.fillRect(left, top, width, height);
  }
}

function drawCursor(
  ctx: CanvasRenderingContext2D,
  layout: TabLayout,
  visual: EditorVisual,
  palette: TabPalette,
) {
  const placement = layout.flatBeats[visual.cursor.flatIndex];
  if (!placement) return;

  const y = layout.stringY[visual.cursor.string - 1];
  ctx.strokeStyle = palette.cursor;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(placement.x - 12, y - 11, 24, 22);

  if (visual.pendingDigit !== null) {
    ctx.fillStyle = palette.background;
    ctx.fillRect(placement.x - 12, y - 11, 24, 22);
    ctx.strokeStyle = palette.pendingDigitBorder;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(placement.x - 12, y - 11, 24, 22);
    ctx.fillStyle = palette.pendingDigitBorder;
    ctx.font = FRET_NUMBER_FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(visual.pendingDigit), placement.x, y);
  }
}

/**
 * Paints a tab render for `project` onto `ctx`. `visual` adds the cursor/selection overlay
 * for the editor. `palette` is the seam between section 10.1's app-chrome screen theme (the
 * live editor) and section 10.2's independent render theme (export/preview) — callers must
 * pass the one that matches which canvas this is.
 */
export function drawTab(
  ctx: CanvasRenderingContext2D,
  project: Project,
  layout: TabLayout,
  palette: TabPalette,
  visual?: EditorVisual,
): void {
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, layout.width, layout.height);

  if (visual?.selectionRange) drawSelection(ctx, layout, visual.selectionRange, palette);
  if (visual) {
    const placement = layout.flatBeats[visual.cursor.flatIndex];
    if (placement) {
      const { left, top, width, height } = columnBounds(layout, placement.x);
      ctx.fillStyle = palette.cursorColumnFill;
      ctx.fillRect(left, top, width, height);
    }
  }

  drawStringLines(ctx, project, layout, palette);
  drawBarlines(ctx, layout, palette);
  drawCapoLabel(ctx, project.track.capo, palette, layout.tabTopY - CAPO_LABEL_OFFSET);
  const nonStandardTuning = !isStandardTuning(project.track.tuning);

  const geometry = { stringY: layout.stringY, tabTopY: layout.tabTopY, tabBottomY: layout.tabBottomY };
  for (const measure of layout.measures) {
    drawMeasureHeader(ctx, measure, geometry, palette);
    for (const { beat, x, flatIndex } of measure.beats) {
      drawRhythmStem(ctx, x, layout.stemBaselineY, beat, palette);
      if (beat.chordRef) drawChordLabel(ctx, x, layout.tabTopY, beat.chordRef, nonStandardTuning, palette);
      if (beat.text) drawBeatText(ctx, x, layout.tabTopY, beat.text, palette);
      drawBeatMarks(ctx, beat, x, layout.tabTopY, palette);

      if (beat.isRest) continue;
      for (const note of beat.notes) {
        const y = layout.stringY[note.string - 1];
        const hammerDirection = note.hammer
          ? resolveHammerDirection(layout.flatBeats, flatIndex, note.string, note.fret)
          : null;
        drawNote(ctx, x, y, note, hammerDirection, palette, layout.tabTopY);
      }
    }
  }

  drawTies(ctx, layout.flatBeats, layout.stringY, palette);
  drawFlagRuns(ctx, layout.flatBeats, layout.palmMuteRowY, "PM", (beat) => Boolean(beat.palmMute), palette);
  drawFlagRuns(ctx, layout.flatBeats, layout.letRingRowY, "let ring", (beat) => Boolean(beat.letRing), palette);

  // Cursor ring / pending-digit box paint last so they sit above string lines and fret numbers.
  if (visual) drawCursor(ctx, layout, visual, palette);
}
