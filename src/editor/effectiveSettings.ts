import type { Measure, Project } from "../model/types";

/**
 * tempo/timeSignature are only written on a Measure when they change (section 5), so the
 * "current" value at any measure is whatever was last set at or before it, falling back to
 * the project defaults.
 */
export function resolveEffectiveSettings(project: Project, measureIndex: number) {
  let tempo = project.defaultTempo;
  let timeSignature = project.defaultTimeSignature;

  for (let i = 0; i <= measureIndex && i < project.track.measures.length; i++) {
    const measure = project.track.measures[i];
    if (measure.tempo !== undefined) tempo = measure.tempo;
    if (measure.timeSignature !== undefined) timeSignature = measure.timeSignature;
  }

  return { tempo, timeSignature };
}

/** What the renderer prints above/inside a measure: set only where a marker belongs. */
export interface MeasureMarks {
  /** BPM to print as "♩ = N" — measure 1 always, later measures only when the tempo changes. */
  tempo: number | null;
  /** Time signature to print inside the staff — measure 1 always, later only on a change. */
  timeSignature: { num: number; den: number } | null;
}

/** Per-measure marker visibility, mirroring how Guitar Pro only prints tempo/meter on a change. */
export function resolveMeasureMarks(project: Project): MeasureMarks[] {
  let tempo = project.defaultTempo;
  let timeSignature = project.defaultTimeSignature;

  return project.track.measures.map((measure, index) => {
    const nextTempo = measure.tempo ?? tempo;
    const nextTimeSignature = measure.timeSignature ?? timeSignature;
    const marks: MeasureMarks = {
      tempo: index === 0 || nextTempo !== tempo ? nextTempo : null,
      timeSignature:
        index === 0 ||
        nextTimeSignature.num !== timeSignature.num ||
        nextTimeSignature.den !== timeSignature.den
          ? nextTimeSignature
          : null,
    };
    tempo = nextTempo;
    timeSignature = nextTimeSignature;
    return marks;
  });
}

/** Horizontal room a measure needs before its first beat for a repeat sign and/or time signature. */
export const TIME_SIGNATURE_WIDTH = 28;
export const REPEAT_START_WIDTH = 16;

export function measureLeadWidth(marks: MeasureMarks, measure: Measure): number {
  return (marks.timeSignature ? TIME_SIGNATURE_WIDTH : 0) + (measure.repeatStart ? REPEAT_START_WIDTH : 0);
}
