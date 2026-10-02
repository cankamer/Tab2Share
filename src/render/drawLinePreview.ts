import type { Beat, Project } from "../model/types";
import { isStandardTuning } from "../model/tunings";
import type { LineLayoutLine } from "./lineLayout";
import { beamGroupLength, drawMeasureRhythm } from "./drawRhythm";
import { buildNotationContext, drawMeasureNotation, drawStaffLines, drawTrebleClef, staffBottomY } from "./drawNotation";
import { resolveEffectiveSettings } from "../editor/effectiveSettings";
import { drawBeatMarks, drawBeatText, drawMeasureHeader, drawTies } from "./drawMeasureMarks";
import { drawCapoLabel, drawChordLabel, drawFlagRuns, drawNote, resolveHammerDirection } from "./drawTab";
import {
  BOTTOM_MARGIN,
  CAPO_LABEL_OFFSET,
  EFFECT_ROW_GAP,
  NOTATION_HEADROOM,
  EFFECT_ROW_HEIGHT,
  LIGHT_PALETTE,
  LINE_GAP,
  STEM_GAP_BELOW_TAB,
  STEM_LENGTH,
  STAFF_SPACING,
  STRING_COUNT,
  STRING_SPACING,
  TAB_TOP_MARGIN,
  tabTopMargin,
  TUNING_LABEL_FONT,
  WATERMARK_FONT,
  WATERMARK_MARGIN,
  WATERMARK_OPACITY,
  WATERMARK_TEXT,
  type TabPalette,
} from "./constants";

export function singleLineHeight(showNotation = false): number {
  const tabBottomY = tabTopMargin(showNotation) + (STRING_COUNT - 1) * STRING_SPACING;
  const stemBaselineY = tabBottomY + STEM_GAP_BELOW_TAB;
  const palmMuteRowY = stemBaselineY + STEM_LENGTH + EFFECT_ROW_GAP;
  const letRingRowY = palmMuteRowY + EFFECT_ROW_HEIGHT;
  return letRingRowY + EFFECT_ROW_HEIGHT + BOTTOM_MARGIN;
}

export function computePreviewSize(
  lines: LineLayoutLine[],
  topOffset = 0,
  showNotation = false,
): { width: number; height: number } {
  const width = lines.reduce((max, line) => Math.max(max, line.width), 0);
  const lineHeight = singleLineHeight(showNotation);
  const contentHeight =
    lines.length === 0 ? lineHeight : lines.length * lineHeight + (lines.length - 1) * LINE_GAP;
  return { width, height: topOffset + contentHeight };
}

export interface DrawLinePreviewOptions {
  /** Live editor preview wants an opaque page behind the tab; export defaults to opaque too
   * now (section 14 revision: exported PNGs keep their alpha channel but are never a blank
   * cutout by default) — pass "transparent" to fall back to the old knocked-out background. */
  background?: "opaque" | "transparent";
  /** Which ink/background colors to draw with — "For Video"/"Tab Sheet" output theme
   * (section 14 revision). Defaults to the light/white theme. */
  palette?: TabPalette;
  /** Reserved blank space above the first line — where a future title block would go, so
   * `availableLines` (fewer lines when it's on) has somewhere to point. */
  topOffset?: number;
  /** Horizontal page margin (A4 tab-sheet mode) — shifts every drawn element right by this
   * many px without affecting the line-breaking width budget the caller already accounted for. */
  leftOffset?: number;
  /** The full page's pixel size to paint the background over — defaults to the natural content
   * size when omitted. Needed for fixed-size pages (Tab Sheet's A4, Reel's 1080x1920) whose
   * canvas is larger than the content that happens to be on it. */
  pageWidth?: number;
  pageHeight?: number;
  /** "For Video" design option: fades the top and/or bottom edge out to full transparency so
   * the strip blends into an underlying video clip instead of showing a hard-edged box. Chosen
   * independently — a strip can fade only its top, only its bottom, both, or neither. */
  fadeTop?: boolean;
  fadeBottom?: boolean;
  /** Height (px) of each fade band. */
  edgeFadeSize?: number;
  /** Standard-notation staff above each tab line (Guitar Pro's score + tab view). */
  showNotation?: boolean;
}

/**
 * Read-only multi-line render for the export preview (section 14): each LineLayoutLine gets
 * its own string lines, barlines, tuning labels, and effect rows, stacked with LINE_GAP
 * between them. Reuses drawTab.ts's per-note/beat primitives — cursor/selection don't apply
 * to a read-only preview, so this is simpler than the live editor canvas.
 */
export function drawLinePreview(
  ctx: CanvasRenderingContext2D,
  project: Project,
  lines: LineLayoutLine[],
  options: DrawLinePreviewOptions = {},
): void {
  const topOffset = options.topOffset ?? 0;
  const leftOffset = options.leftOffset ?? 0;
  const palette = options.palette ?? LIGHT_PALETTE;
  const showNotation = options.showNotation ?? false;
  const natural = computePreviewSize(lines, topOffset, showNotation);
  const width = options.pageWidth ?? natural.width;
  const height = options.pageHeight ?? natural.height;

  if ((options.background ?? "opaque") === "opaque") {
    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.clearRect(0, 0, width, height);
  }

  ctx.save();
  ctx.translate(leftOffset, 0);

  const nonStandardTuning = !isStandardTuning(project.track.tuning);
  const lineHeight = singleLineHeight(showNotation);
  // Hammer direction must see past a line's own boundary, into the track's true musical order.
  const globalFlatBeats: { beat: Beat }[] = project.track.measures.flatMap((measure) =>
    measure.beats.map((beat) => ({ beat })),
  );

  lines.forEach((line, lineIndex) => {
    drawSingleLine(
      ctx,
      project,
      line,
      topOffset + lineIndex * (lineHeight + LINE_GAP),
      nonStandardTuning,
      globalFlatBeats,
      palette,
      showNotation,
    );
  });

  drawCapoLabel(ctx, project.track.capo, palette, topOffset + TAB_TOP_MARGIN - CAPO_LABEL_OFFSET);
  ctx.restore();

  if (options.fadeTop || options.fadeBottom) {
    applyEdgeFade(ctx, width, height, options.edgeFadeSize ?? Math.round(height * 0.12), {
      top: options.fadeTop ?? false,
      bottom: options.fadeBottom ?? false,
    });
  }
}

/** "For Video" edge fade: dissolves the chosen top and/or bottom band of the already-painted
 * page to transparent via a destination-out gradient, so background *and* content fade
 * together. */
function applyEdgeFade(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  fadeSize: number,
  edges: { top: boolean; bottom: boolean },
): void {
  const size = Math.max(0, Math.min(fadeSize, height / 2));
  if (size <= 0) return;

  ctx.save();
  ctx.globalCompositeOperation = "destination-out";

  if (edges.top) {
    const top = ctx.createLinearGradient(0, 0, 0, size);
    top.addColorStop(0, "rgba(0,0,0,1)");
    top.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, width, size);
  }

  if (edges.bottom) {
    const bottom = ctx.createLinearGradient(0, height - size, 0, height);
    bottom.addColorStop(0, "rgba(0,0,0,0)");
    bottom.addColorStop(1, "rgba(0,0,0,1)");
    ctx.fillStyle = bottom;
    ctx.fillRect(0, height - size, width, size);
  }

  ctx.restore();
}

function drawSingleLine(
  ctx: CanvasRenderingContext2D,
  project: Project,
  line: LineLayoutLine,
  offsetY: number,
  nonStandardTuning: boolean,
  globalFlatBeats: { beat: Beat }[],
  palette: TabPalette,
  showNotation: boolean,
) {
  const stringY = Array.from({ length: STRING_COUNT }, (_, row) => offsetY + tabTopMargin(showNotation) + row * STRING_SPACING);
  const headerY = offsetY + TAB_TOP_MARGIN;
  const staff = showNotation ? { topY: headerY + NOTATION_HEADROOM, spacing: STAFF_SPACING } : undefined;
  const tabTopY = stringY[0];
  const tabBottomY = stringY[STRING_COUNT - 1];
  const stemBaselineY = tabBottomY + STEM_GAP_BELOW_TAB;
  const palmMuteRowY = stemBaselineY + STEM_LENGTH + EFFECT_ROW_GAP;
  const letRingRowY = palmMuteRowY + EFFECT_ROW_HEIGHT;

  const lineEndX = line.measures.length > 0 ? line.measures[line.measures.length - 1].endX : 0;

  ctx.strokeStyle = palette.stringLine;
  ctx.lineWidth = 1;
  stringY.forEach((y) => {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(lineEndX, y);
    ctx.stroke();
  });

  ctx.font = TUNING_LABEL_FONT;
  ctx.fillStyle = palette.tuningLabel;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  stringY.forEach((y, row) => ctx.fillText(project.track.tuning[5 - row], 2, y));

  ctx.strokeStyle = palette.barline;
  ctx.lineWidth = 1;
  const drawBarline = (x: number) => {
    ctx.beginPath();
    ctx.moveTo(x, tabTopY);
    ctx.lineTo(x, tabBottomY);
    ctx.stroke();
  };
  line.measures.forEach((measure) => drawBarline(measure.startX));
  if (line.measures.length > 0) drawBarline(lineEndX);

  if (staff) {
    drawStaffLines(ctx, staff, 0, lineEndX, palette);
    drawTrebleClef(ctx, staff, 3, palette);
    ctx.strokeStyle = palette.barline;
    ctx.lineWidth = 1;
    const drawStaffBarline = (x: number) => {
      ctx.beginPath();
      ctx.moveTo(x, staff.topY);
      ctx.lineTo(x, staffBottomY(staff));
      ctx.stroke();
    };
    line.measures.forEach((measure) => drawStaffBarline(measure.startX));
    if (line.measures.length > 0) {
      drawStaffBarline(lineEndX);
      ctx.beginPath();
      ctx.moveTo(line.measures[0].startX, staffBottomY(staff));
      ctx.lineTo(line.measures[0].startX, tabTopY);
      ctx.stroke();
    }
  }

  const flatBeats = line.measures.flatMap((measure) => measure.beats);

  const geometry = { stringY, tabTopY, tabBottomY, headerY: showNotation ? headerY : tabTopY, staff };
  const notationContext = staff ? buildNotationContext(project.track.tuning, project.track.capo) : null;
  for (const measure of line.measures) {
    drawMeasureHeader(ctx, measure, geometry, palette);
    const groupLength = beamGroupLength(resolveEffectiveSettings(project, measure.measureIndex).timeSignature);
    drawMeasureRhythm(ctx, measure.beats, stemBaselineY, groupLength, palette);
    if (staff && notationContext) {
      drawMeasureNotation(
        ctx,
        measure.beats,
        staff,
        notationContext,
        resolveEffectiveSettings(project, measure.measureIndex).timeSignature,
        palette,
      );
    }
    for (const { beat, x, flatIndex } of measure.beats) {
      if (beat.chordRef) drawChordLabel(ctx, x, geometry.headerY, beat.chordRef, nonStandardTuning, palette);
      if (beat.text) drawBeatText(ctx, x, geometry.headerY, beat.text, palette);
      drawBeatMarks(ctx, beat, x, tabTopY, palette);

      if (beat.isRest) continue;
      for (const note of beat.notes) {
        const y = stringY[note.string - 1];
        const hammerDirection = note.hammer
          ? resolveHammerDirection(globalFlatBeats, flatIndex, note.string, note.fret)
          : null;
        drawNote(ctx, x, y, note, hammerDirection, palette);
      }
    }
  }

  drawTies(ctx, flatBeats, stringY, palette);
  drawFlagRuns(ctx, flatBeats, palmMuteRowY, "PM", (beat) => Boolean(beat.palmMute), palette);
  drawFlagRuns(ctx, flatBeats, letRingRowY, "let ring", (beat) => Boolean(beat.letRing), palette);
}

/** Section 14: small, low-opacity mark in a corner of the exported image, default on. */
export function drawWatermark(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  palette: TabPalette = LIGHT_PALETTE,
): void {
  ctx.save();
  ctx.globalAlpha = WATERMARK_OPACITY;
  ctx.font = WATERMARK_FONT;
  ctx.fillStyle = palette.tuningLabel;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillText(WATERMARK_TEXT, canvasWidth - WATERMARK_MARGIN, canvasHeight - WATERMARK_MARGIN);
  ctx.restore();
}
