import type { Beat, BendPreset, Duration, Measure, Note, Project, SlideType } from "../model/types";
import type { BeatPosition } from "./beats";

function cloneProject(project: Project): Project {
  return structuredClone(project);
}

function beatAt(project: Project, position: BeatPosition): Beat {
  return project.track.measures[position.measureIndex].beats[position.beatIndex];
}

function noteAt(beat: Beat, string: Note["string"]): Note | undefined {
  return beat.notes.find((note) => note.string === string);
}

const MIN_FRET = 0;
const MAX_FRET = 24;

/** Sets/replaces the note on `string` within the beat at `position`; un-rests the beat. */
export function setNoteAtPosition(
  project: Project,
  position: BeatPosition,
  string: Note["string"],
  fret: number,
): Project {
  const next = cloneProject(project);
  const beat = beatAt(next, position);
  const clampedFret = Math.max(MIN_FRET, Math.min(MAX_FRET, fret));
  beat.isRest = false;
  const existing = beat.notes.find((note) => note.string === string);
  if (existing) {
    existing.fret = clampedFret;
  } else {
    beat.notes.push({ string, fret: clampedFret });
  }
  return next;
}

/**
 * Chord picker selection (section 9): replaces the beat's notes with the chord's fret
 * pattern and sets chordRef, so the name is drawn above the tab. Duration is left as-is.
 */
export function setChordAtPosition(
  project: Project,
  position: BeatPosition,
  chordName: string,
  notes: Note[],
): Project {
  const next = cloneProject(project);
  const beat = beatAt(next, position);
  beat.isRest = false;
  beat.notes = notes.map((note) => ({ ...note }));
  beat.chordRef = chordName;
  return next;
}

/** Removes only the note on `string` (section 9.3: "Notayı sil, beat yerinde kalır"). */
export function removeNoteAtPosition(
  project: Project,
  position: BeatPosition,
  string: Note["string"],
): Project {
  const next = cloneProject(project);
  const beat = beatAt(next, position);
  beat.notes = beat.notes.filter((note) => note.string !== string);
  return next;
}

export function setBeatDuration(project: Project, position: BeatPosition, duration: Duration): Project {
  const next = cloneProject(project);
  beatAt(next, position).duration = duration;
  return next;
}

export function toggleDotted(project: Project, position: BeatPosition): Project {
  const next = cloneProject(project);
  const beat = beatAt(next, position);
  beat.dotted = !beat.dotted;
  return next;
}

export function toggleTuplet(project: Project, position: BeatPosition): Project {
  const next = cloneProject(project);
  const beat = beatAt(next, position);
  beat.tuplet = beat.tuplet ? undefined : { count: 3, over: 2 };
  return next;
}

export function setRestAtPosition(project: Project, position: BeatPosition, duration: Duration): Project {
  const next = cloneProject(project);
  const beat = beatAt(next, position);
  beat.isRest = true;
  beat.notes = [];
  beat.duration = duration;
  return next;
}

/** Insert key (section 9.3): inserts an empty rest beat at `position`, shifting the rest right. */
export function insertEmptyBeatAt(project: Project, position: BeatPosition, duration: Duration): Project {
  const next = cloneProject(project);
  const beats = next.track.measures[position.measureIndex].beats;
  const empty: Beat = { duration, dotted: false, isRest: true, notes: [] };
  beats.splice(position.beatIndex, 0, empty);
  return next;
}

/** Ctrl+Delete (section 9.3): removes the beat entirely, "sonrası sola kayar". */
export function deleteBeatAt(project: Project, position: BeatPosition): Project {
  const next = cloneProject(project);
  next.track.measures[position.measureIndex].beats.splice(position.beatIndex, 1);
  return next;
}

/** Delete key over a selection: clears notes for every beat in the range, beats stay in place. */
export function clearNotesInRange(project: Project, positions: BeatPosition[]): Project {
  const next = cloneProject(project);
  for (const position of positions) {
    beatAt(next, position).notes = [];
  }
  return next;
}

export function copyBeats(project: Project, positions: BeatPosition[]): Beat[] {
  return positions.map((position) => structuredClone(beatAt(project, position)));
}

/** Paste overwrites beats starting at `positions[0]`; stops at the end of the track. */
export function pasteBeatsAt(project: Project, positions: BeatPosition[], clipboard: Beat[]): Project {
  const next = cloneProject(project);
  positions.forEach((position, i) => {
    if (i >= clipboard.length) return;
    next.track.measures[position.measureIndex].beats[position.beatIndex] = structuredClone(clipboard[i]);
  });
  return next;
}

import { resolveEffectiveSettings } from "./effectiveSettings";

/** Edit menu / + button "Insert measure": creates a new measure with rest beats matching the effective time signature (num/den). */
export function insertMeasureAt(
  project: Project,
  measureIndex: number,
  timeSignature?: { num: number; den: number },
): Project {
  const next = cloneProject(project);
  const targetIndex = measureIndex >= 0 ? measureIndex : Math.max(0, next.track.measures.length - 1);
  const effectiveTS = timeSignature ?? resolveEffectiveSettings(project, targetIndex).timeSignature;

  const numBeats = Math.max(1, effectiveTS.num);
  const beatDuration = (effectiveTS.den as Duration) || 4;

  const beats: Beat[] = Array.from({ length: numBeats }, () => ({
    duration: beatDuration,
    dotted: false,
    isRest: true,
    notes: [],
  }));

  const newMeasure: Measure = { beats };
  const insertIndex = measureIndex >= 0 ? measureIndex + 1 : next.track.measures.length;
  const clampedIndex = Math.max(0, Math.min(next.track.measures.length, insertIndex));
  next.track.measures.splice(clampedIndex, 0, newMeasure);
  return next;
}

/** "Ölçüyü çoğalt" (section 9.4): a full deep copy of the measure, inserted right after it. */
export function duplicateMeasureAt(project: Project, measureIndex: number): Project {
  if (measureIndex < 0 || measureIndex >= project.track.measures.length) return project;
  const next = cloneProject(project);
  const duplicate = structuredClone(next.track.measures[measureIndex]);
  next.track.measures.splice(measureIndex + 1, 0, duplicate);
  return next;
}

export function deleteMeasureAt(project: Project, measureIndex: number): Project {
  if (measureIndex < 0 || measureIndex >= project.track.measures.length) return project;
  const next = cloneProject(project);
  next.track.measures.splice(measureIndex, 1);
  return next;
}

/** Time signature change "bu ölçüden itibaren" (section 9.4): only written on the measure it starts at. */
export function setTimeSignatureFrom(
  project: Project,
  measureIndex: number,
  timeSignature: { num: number; den: number },
): Project {
  if (measureIndex < 0 || measureIndex >= project.track.measures.length) return project;
  const next = cloneProject(project);
  next.track.measures[measureIndex].timeSignature = timeSignature;
  return next;
}

/** Tempo change "bu ölçüden itibaren" (section 9.4): only written on the measure it starts at. */
export function setTempoFrom(project: Project, measureIndex: number, tempo: number): Project {
  if (measureIndex < 0 || measureIndex >= project.track.measures.length) return project;
  const next = cloneProject(project);
  next.track.measures[measureIndex].tempo = tempo;
  return next;
}

export type TransposeResult = { ok: true; project: Project } | { ok: false; measureIndex: number };

/**
 * Transpose all notes by `semitones` (section 9.4, karar #30): if any note would leave the
 * 0-24 fret range, the whole operation is cancelled and the offending measure is reported —
 * never a partial transpose.
 */
export function transposeProject(project: Project, semitones: number): TransposeResult {
  for (let measureIndex = 0; measureIndex < project.track.measures.length; measureIndex++) {
    for (const beat of project.track.measures[measureIndex].beats) {
      for (const note of beat.notes) {
        const nextFret = note.fret + semitones;
        if (nextFret < MIN_FRET || nextFret > MAX_FRET) {
          return { ok: false, measureIndex };
        }
      }
    }
  }

  const next = cloneProject(project);
  for (const measure of next.track.measures) {
    for (const beat of measure.beats) {
      for (const note of beat.notes) {
        note.fret += semitones;
      }
    }
  }
  return { ok: true, project: next };
}

export interface EffectResult {
  project: Project;
  /** True when applying this effect silently replaced a conflicting one (section 7's rule). */
  hadConflict: boolean;
}

function noEffectChange(project: Project): EffectResult {
  return { project, hadConflict: false };
}

/** B (section 7): bend and slide can't coexist on a note — applying a bend clears any slide. Toggle off if same preset. */
export function applyBend(
  project: Project,
  position: BeatPosition,
  string: Note["string"],
  preset: BendPreset,
): EffectResult {
  const next = cloneProject(project);
  const note = noteAt(beatAt(next, position), string);
  if (!note) return noEffectChange(project);

  if (note.bend === preset) {
    note.bend = undefined;
    return { project: next, hadConflict: false };
  }

  const hadConflict = note.slide !== undefined;
  note.slide = undefined;
  note.bend = preset;
  return { project: next, hadConflict };
}

/** S / Alt+S (section 7): applying a slide clears any bend on the note (same conflict rule). Toggle off if same type. */
export function applySlide(
  project: Project,
  position: BeatPosition,
  string: Note["string"],
  type: SlideType,
): EffectResult {
  const next = cloneProject(project);
  const note = noteAt(beatAt(next, position), string);
  if (!note) return noEffectChange(project);

  if (note.slide?.type === type) {
    note.slide = undefined;
    return { project: next, hadConflict: false };
  }

  const hadConflict = note.bend !== undefined;
  note.bend = undefined;
  note.slide = { type };
  return { project: next, hadConflict };
}

/** V / Alt+V: pressing the same intensity again clears the vibrato (toggle). */
export function applyVibrato(
  project: Project,
  position: BeatPosition,
  string: Note["string"],
  intensity: "normal" | "wide",
): Project {
  const next = cloneProject(project);
  const note = noteAt(beatAt(next, position), string);
  if (!note) return project;
  note.vibrato = note.vibrato === intensity ? undefined : intensity;
  return next;
}

export function toggleHammer(project: Project, position: BeatPosition, string: Note["string"]): Project {
  const next = cloneProject(project);
  const note = noteAt(beatAt(next, position), string);
  if (!note) return project;
  note.hammer = !note.hammer;
  return next;
}

/** X: dead/muted note. */
export function toggleDeadNote(project: Project, position: BeatPosition, string: Note["string"]): Project {
  const next = cloneProject(project);
  const note = noteAt(beatAt(next, position), string);
  if (!note) return project;
  note.dead = !note.dead;
  return next;
}

/** O: ghost note. */
export function toggleGhostNote(project: Project, position: BeatPosition, string: Note["string"]): Project {
  const next = cloneProject(project);
  const note = noteAt(beatAt(next, position), string);
  if (!note) return project;
  note.ghost = !note.ghost;
  return next;
}

/** [ (palm mute) and I (let ring) are beat-level, not per-note. */
export function toggleBeatFlag(
  project: Project,
  position: BeatPosition,
  flag: "palmMute" | "letRing",
): Project {
  const next = cloneProject(project);
  const beat = beatAt(next, position);
  beat[flag] = !beat[flag];
  return next;
}

/** Ctrl+Shift+X: clears every effect on the cursor's note and beat-level flags. */
export function clearNoteEffects(project: Project, position: BeatPosition, string: Note["string"]): Project {
  const next = cloneProject(project);
  const beat = beatAt(next, position);
  const note = noteAt(beat, string);
  if (note) {
    note.bend = undefined;
    note.slide = undefined;
    note.vibrato = undefined;
    note.hammer = undefined;
    note.dead = undefined;
    note.ghost = undefined;
    note.tie = undefined;
    note.harmonic = undefined;
  }
  beat.palmMute = undefined;
  beat.letRing = undefined;
  beat.fermata = undefined;
  beat.accent = undefined;
  beat.staccato = undefined;
  beat.trill = undefined;
  beat.pickStroke = undefined;
  return next;
}

/** Applies a tuning preset, or a manually-adjusted array, wholesale (section 9.2). */
export function setTuning(project: Project, tuning: string[]): Project {
  const next = cloneProject(project);
  next.track.tuning = [...tuning];
  return next;
}

/** "Kullanıcı ayrıca her teli tek tek ayarlayabilir" — arrayIndex matches Track.tuning's own order. */
export function setTuningString(project: Project, arrayIndex: number, note: string): Project {
  const next = cloneProject(project);
  next.track.tuning[arrayIndex] = note;
  return next;
}

export function setCapo(project: Project, capo: number): Project {
  const next = cloneProject(project);
  next.track.capo = Math.max(0, capo);
  return next;
}

/** "Kullanıcı isterse akor etiketini elle düzeltebilir" (section 9.2) — corrects a wrong chord name. */
export function setChordLabel(project: Project, position: BeatPosition, label: string): Project {
  const next = cloneProject(project);
  const beat = beatAt(next, position);
  const trimmed = label.trim();
  beat.chordRef = trimmed.length > 0 ? trimmed : undefined;
  return next;
}

/** Project settings dialog (section 8's File menu): document title. */
export function setProjectTitle(project: Project, title: string): Project {
  const next = cloneProject(project);
  next.title = title;
  return next;
}

/** Project settings dialog: document artist, optional. */
export function setProjectArtist(project: Project, artist: string): Project {
  const next = cloneProject(project);
  const trimmed = artist.trim();
  next.artist = trimmed.length > 0 ? trimmed : undefined;
  return next;
}

/** Project settings dialog: the document-level default tempo (measures may still override it). */
export function setDefaultTempo(project: Project, tempo: number): Project {
  const next = cloneProject(project);
  next.defaultTempo = Math.max(0, tempo);
  return next;
}

/** Project settings dialog: the document-level default time signature. */
export function setDefaultTimeSignature(
  project: Project,
  timeSignature: { num: number; den: number },
): Project {
  const next = cloneProject(project);
  next.defaultTimeSignature = timeSignature;
  return next;
}

/** [ (Guitar Pro "repeat open"): toggles the repeat-start sign on a measure. */
export function toggleRepeatStart(project: Project, measureIndex: number): Project {
  if (measureIndex < 0 || measureIndex >= project.track.measures.length) return project;
  const next = cloneProject(project);
  const measure = next.track.measures[measureIndex];
  measure.repeatStart = measure.repeatStart ? undefined : true;
  return next;
}

/** ] (Guitar Pro "repeat close"): toggles the repeat-end sign; a fresh one plays twice. */
export function toggleRepeatEnd(project: Project, measureIndex: number): Project {
  if (measureIndex < 0 || measureIndex >= project.track.measures.length) return project;
  const next = cloneProject(project);
  const measure = next.track.measures[measureIndex];
  measure.repeatEnd = measure.repeatEnd ? undefined : 2;
  return next;
}

export function setRepeatCount(project: Project, measureIndex: number, count: number): Project {
  if (measureIndex < 0 || measureIndex >= project.track.measures.length) return project;
  const next = cloneProject(project);
  next.track.measures[measureIndex].repeatEnd = Math.max(2, Math.min(99, Math.round(count)));
  return next;
}

/** Section marker ("Intro", "Chorus") printed in a box above the measure; empty text removes it. */
export function setSectionLabel(project: Project, measureIndex: number, label: string): Project {
  if (measureIndex < 0 || measureIndex >= project.track.measures.length) return project;
  const next = cloneProject(project);
  const trimmed = label.trim();
  next.track.measures[measureIndex].sectionLabel = trimmed.length > 0 ? trimmed : undefined;
  return next;
}

/** T (Guitar Pro "text"): free text above a beat; empty text removes it. */
export function setBeatText(project: Project, position: BeatPosition, text: string): Project {
  const next = cloneProject(project);
  const trimmed = text.trim();
  beatAt(next, position).text = trimmed.length > 0 ? trimmed : undefined;
  return next;
}

/** L: ties the note to the previous note on its string. */
export function toggleTie(project: Project, position: BeatPosition, string: Note["string"]): Project {
  const next = cloneProject(project);
  const note = noteAt(beatAt(next, position), string);
  if (!note) return project;
  note.tie = note.tie ? undefined : true;
  return next;
}

/** Y: natural harmonic, drawn as <fret>. */
export function toggleHarmonic(project: Project, position: BeatPosition, string: Note["string"]): Project {
  const next = cloneProject(project);
  const note = noteAt(beatAt(next, position), string);
  if (!note) return project;
  note.harmonic = note.harmonic ? undefined : true;
  return next;
}

export type BeatMark = "fermata" | "staccato" | "trill";

/** F (fermata), ! (staccato), N (trill): beat-level on/off marks. */
export function toggleBeatMark(project: Project, position: BeatPosition, mark: BeatMark): Project {
  const next = cloneProject(project);
  const beat = beatAt(next, position);
  beat[mark] = beat[mark] ? undefined : true;
  return next;
}

/** ; (accent) and Shift+; (heavy accent): pressing the same level again clears it. */
export function toggleAccent(project: Project, position: BeatPosition, level: "normal" | "heavy"): Project {
  const next = cloneProject(project);
  const beat = beatAt(next, position);
  beat.accent = beat.accent === level ? undefined : level;
  return next;
}

/** Shift+D / Shift+U: pick-stroke direction; pressing the same direction again clears it. */
export function togglePickStroke(project: Project, position: BeatPosition, direction: "down" | "up"): Project {
  const next = cloneProject(project);
  const beat = beatAt(next, position);
  beat.pickStroke = beat.pickStroke === direction ? undefined : direction;
  return next;
}
