import type { Beat, Measure, Project } from "../model/types";
import { measureLeadWidth, resolveMeasureMarks, type MeasureMarks } from "../editor/effectiveSettings";
import {
  BEAT_WIDTH,
  BOTTOM_MARGIN,
  EFFECT_ROW_GAP,
  EFFECT_ROW_HEIGHT,
  MEASURE_BARLINE_GAP,
  STEM_GAP_BELOW_TAB,
  STEM_LENGTH,
  STRING_COUNT,
  STRING_SPACING,
  TAB_TOP_MARGIN,
  TUNING_LABEL_WIDTH,
} from "./constants";

export interface BeatPlacement {
  beat: Beat;
  x: number;
  width: number;
  flatIndex: number;
}

export interface MeasurePlacement {
  measure: Measure;
  measureIndex: number;
  /** Tempo / time-signature markers this measure prints (null = none). */
  marks: MeasureMarks;
  /** Opening barline x. The first beat sits `leadWidth` further right (time signature / repeat sign). */
  startX: number;
  /** Right edge of the last beat. */
  endX: number;
  /** Where this measure's closing barline is drawn (the next measure's opening barline, or endX for the last). */
  closeX: number;
  beats: BeatPlacement[];
}

export interface TabLayout {
  width: number;
  height: number;
  /** Y-coordinate per string row; index 0 = string 1 (high e, top) .. index 5 = string 6 (low E, bottom). */
  stringY: number[];
  tabTopY: number;
  tabBottomY: number;
  stemBaselineY: number;
  /** Row Y-positions for the palm-mute and let-ring bracket annotations, below the stems. */
  palmMuteRowY: number;
  letRingRowY: number;
  measures: MeasurePlacement[];
  /** Every beat placement in track order, for hit-testing and cursor lookup. */
  flatBeats: BeatPlacement[];
}

/** Read-only geometry pass: turns a Project into pixel positions for drawTab to paint. */
export function computeLayout(project: Project): TabLayout {
  const stringY = Array.from(
    { length: STRING_COUNT },
    (_, row) => TAB_TOP_MARGIN + row * STRING_SPACING,
  );
  const tabTopY = stringY[0];
  const tabBottomY = stringY[STRING_COUNT - 1];
  const stemBaselineY = tabBottomY + STEM_GAP_BELOW_TAB;
  const palmMuteRowY = stemBaselineY + STEM_LENGTH + EFFECT_ROW_GAP;
  const letRingRowY = palmMuteRowY + EFFECT_ROW_HEIGHT;

  let x = TUNING_LABEL_WIDTH;
  let flatIndex = 0;
  const flatBeats: BeatPlacement[] = [];
  const allMarks = resolveMeasureMarks(project);
  const measures: MeasurePlacement[] = project.track.measures.map((measure, measureIndex) => {
    const startX = x;
    x += measureLeadWidth(allMarks[measureIndex], measure);
    const beats: BeatPlacement[] = measure.beats.map((beat) => {
      const beatX = x + BEAT_WIDTH / 2;
      x += BEAT_WIDTH;
      const placement = { beat, x: beatX, width: BEAT_WIDTH, flatIndex: flatIndex++ };
      flatBeats.push(placement);
      return placement;
    });
    const endX = x;
    x += MEASURE_BARLINE_GAP;
    return { measure, measureIndex, marks: allMarks[measureIndex], startX, endX, closeX: endX, beats };
  });
  measures.forEach((placement, index) => {
    if (index < measures.length - 1) placement.closeX = measures[index + 1].startX;
  });

  const width = x;
  const height = letRingRowY + EFFECT_ROW_HEIGHT + BOTTOM_MARGIN;

  return {
    width,
    height,
    stringY,
    tabTopY,
    tabBottomY,
    stemBaselineY,
    palmMuteRowY,
    letRingRowY,
    measures,
    flatBeats,
  };
}

/** Nearest beat column to a click's x, within half a beat width; string from nearest row. */
export function hitTest(
  layout: TabLayout,
  x: number,
  y: number,
): { flatIndex: number; string: 1 | 2 | 3 | 4 | 5 | 6 } | null {
  if (layout.flatBeats.length === 0) return null;

  let nearest = layout.flatBeats[0];
  let nearestDistance = Math.abs(nearest.x - x);
  for (const placement of layout.flatBeats) {
    const distance = Math.abs(placement.x - x);
    if (distance < nearestDistance) {
      nearest = placement;
      nearestDistance = distance;
    }
  }
  if (nearestDistance > BEAT_WIDTH / 2) return null;

  let row = 0;
  let rowDistance = Math.abs(layout.stringY[0] - y);
  for (let i = 1; i < layout.stringY.length; i++) {
    const distance = Math.abs(layout.stringY[i] - y);
    if (distance < rowDistance) {
      row = i;
      rowDistance = distance;
    }
  }

  return { flatIndex: nearest.flatIndex, string: (row + 1) as 1 | 2 | 3 | 4 | 5 | 6 };
}
