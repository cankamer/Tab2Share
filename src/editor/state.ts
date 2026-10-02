import type { BendPreset, Duration, Beat, Note, Project, SlideType } from "../model/types";
import { chordToNotes, type ChordDefinition } from "../model/chords";
import {
  clampFlatIndex,
  flattenBeats,
  measureFlatBounds,
  type BeatPosition,
} from "./beats";
import {
  applyBend,
  applySlide,
  applyVibrato,
  clearNoteEffects,
  clearNotesInRange,
  copyBeats,
  deleteBeatAt,
  deleteMeasureAt,
  duplicateMeasureAt,
  insertEmptyBeatAt,
  insertMeasureAt,
  pasteBeatsAt,
  removeNoteAtPosition,
  setBeatDuration,
  setBeatText,
  setCapo,
  setChordAtPosition,
  setChordLabel,
  setNoteAtPosition,
  setProjectArtist,
  setProjectTitle,
  setRepeatCount,
  setSectionLabel,
  setDefaultTempo,
  setDefaultTimeSignature,
  setRestAtPosition,
  setTempoFrom,
  setTimeSignatureFrom,
  setTuning,
  setTuningString,
  toggleAccent,
  toggleBeatFlag,
  toggleBeatMark,
  toggleDeadNote,
  toggleDotted,
  toggleGhostNote,
  toggleHammer,
  toggleHarmonic,
  togglePickStroke,
  toggleRepeatEnd,
  toggleRepeatStart,
  toggleTie,
  toggleTuplet,
  transposeProject,
} from "./mutations";

export type StringNumber = Note["string"];

export interface Cursor {
  flatIndex: number;
  string: StringNumber;
}

export interface EditorState {
  project: Project;
  cursor: Cursor;
  /** flatIndex of the selection anchor; range is [min(anchor, cursor.flatIndex), max(...)]. */
  selectionAnchor: number | null;
  /** First digit of a two-digit fret (10-19 or 20-24) waiting for its second digit. */
  pendingDigit: number | null;
  activeDuration: Duration;
  autoAdvance: boolean;
  clipboard: Beat[] | null;
  history: Project[];
  future: Project[];
  /** Set when an action fails in a user-visible way (currently: transpose out of fret range, or "READ_ONLY" — section 17). */
  lastError: string | null;
  /** Section 17: the loaded file's `version` is newer than this app writes — no mutation is allowed. */
  readOnly: boolean;
}

export function createEditorState(project: Project, readOnly = false): EditorState {
  return {
    project,
    cursor: { flatIndex: 0, string: 1 },
    selectionAnchor: null,
    pendingDigit: null,
    activeDuration: 4,
    autoAdvance: false,
    clipboard: null,
    history: [],
    future: [],
    lastError: null,
    readOnly,
  };
}

export type EditorAction =
  | { type: "MOVE_CURSOR"; direction: "left" | "right" | "up" | "down" | "home" | "end"; extendSelection: boolean }
  | { type: "TYPE_DIGIT"; digit: number; chordMode: boolean }
  | { type: "CONFIRM" }
  | { type: "SET_DURATION"; duration: Duration }
  | { type: "TOGGLE_DOTTED" }
  | { type: "TOGGLE_TUPLET" }
  | { type: "INSERT_REST" }
  | { type: "DELETE" }
  | { type: "DELETE_BEAT" }
  | { type: "INSERT_BEAT" }
  | { type: "COPY" }
  | { type: "CUT" }
  | { type: "PASTE" }
  | { type: "TOGGLE_AUTO_ADVANCE" }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "CLICK_CELL"; flatIndex: number; string: StringNumber }
  | { type: "CLICK_FRET"; string: StringNumber; fret: number; chordMode: boolean }
  | { type: "INSERT_MEASURE" }
  | { type: "DUPLICATE_MEASURE" }
  | { type: "DELETE_MEASURE"; measureIndex?: number }
  | { type: "TRANSPOSE"; direction: "up" | "down" }
  | { type: "SET_TIME_SIGNATURE_FROM"; timeSignature: { num: number; den: number } }
  | { type: "SET_TEMPO_FROM"; tempo: number }
  | { type: "INSERT_CHORD"; chord: ChordDefinition }
  | { type: "APPLY_BEND"; preset: BendPreset }
  | { type: "APPLY_SLIDE"; slideType: SlideType }
  | { type: "APPLY_VIBRATO"; intensity: "normal" | "wide" }
  | { type: "TOGGLE_HAMMER" }
  | { type: "TOGGLE_DEAD" }
  | { type: "TOGGLE_GHOST" }
  | { type: "TOGGLE_PALM_MUTE" }
  | { type: "TOGGLE_LET_RING" }
  | { type: "CLEAR_EFFECTS" }
  | { type: "SET_TUNING"; tuning: string[] }
  | { type: "SET_TUNING_STRING"; arrayIndex: number; note: string }
  | { type: "SET_CAPO"; capo: number }
  | { type: "SET_CHORD_LABEL"; label: string }
  | { type: "SELECT_ALL" }
  | { type: "TOGGLE_TIE" }
  | { type: "TOGGLE_HARMONIC" }
  | { type: "TOGGLE_BEAT_MARK"; mark: "fermata" | "staccato" | "trill" }
  | { type: "TOGGLE_ACCENT"; level: "normal" | "heavy" }
  | { type: "TOGGLE_PICK_STROKE"; direction: "down" | "up" }
  | { type: "SET_BEAT_TEXT"; text: string }
  | { type: "TOGGLE_REPEAT_START" }
  | { type: "TOGGLE_REPEAT_END" }
  | { type: "SET_REPEAT_COUNT"; count: number }
  | { type: "SET_SECTION_LABEL"; label: string }
  | { type: "STEP_DURATION"; direction: "longer" | "shorter" }
  | { type: "GOTO_MEASURE"; measureIndex: number }
  | { type: "GOTO_SECTION"; direction: "previous" | "next" }
  | { type: "SET_TITLE"; title: string }
  | { type: "SET_ARTIST"; artist: string }
  | { type: "SET_DEFAULT_TEMPO"; tempo: number }
  | { type: "SET_DEFAULT_TIME_SIGNATURE"; timeSignature: { num: number; den: number } }
  | { type: "LOAD_PROJECT"; project: Project; readOnly?: boolean };

function currentPosition(state: EditorState): BeatPosition {
  const flat = flattenBeats(state.project);
  const ref = flat[state.cursor.flatIndex];
  return { measureIndex: ref.measureIndex, beatIndex: ref.beatIndex };
}

/** Falls back to measure 0 when the track has no beats to derive a cursor position from. */
function currentMeasureIndex(state: EditorState): number {
  const flat = flattenBeats(state.project);
  if (flat.length === 0) return 0;
  return flat[clampFlatIndex(state.cursor.flatIndex, flat.length)].measureIndex;
}

function selectionPositions(state: EditorState): BeatPosition[] {
  if (state.selectionAnchor === null) return [currentPosition(state)];
  const flat = flattenBeats(state.project);
  const lo = Math.min(state.selectionAnchor, state.cursor.flatIndex);
  const hi = Math.max(state.selectionAnchor, state.cursor.flatIndex);
  return flat.slice(lo, hi + 1).map(({ measureIndex, beatIndex }) => ({ measureIndex, beatIndex }));
}

/**
 * Section 17's read-only lock funnels through here: every mutating action in the reducer
 * (note entry, effects, structural edits, project settings) ends in withEdit, so gating it in
 * this one place blocks all of them at once rather than checking `readOnly` in each case.
 */
function withEdit(state: EditorState, nextProject: Project): EditorState {
  if (state.readOnly) {
    return { ...state, lastError: "READ_ONLY" };
  }
  const flatLength = flattenBeats(nextProject).length;
  return {
    ...state,
    project: nextProject,
    history: [...state.history, state.project],
    future: [],
    cursor: { ...state.cursor, flatIndex: clampFlatIndex(state.cursor.flatIndex, flatLength) },
    selectionAnchor: null,
  };
}

/** Commits a pending first digit as a single-digit fret — used when any non-digit key dismisses it. */
function commitPendingDigit(state: EditorState): EditorState {
  if (state.pendingDigit === null) return state;
  const position = currentPosition(state);
  const project = setNoteAtPosition(state.project, position, state.cursor.string, state.pendingDigit);
  return { ...withEdit(state, project), pendingDigit: null };
}

function advanceCursorAfterEntry(state: EditorState, chordMode: boolean): EditorState {
  if (chordMode || !state.autoAdvance) return state;
  const flatLength = flattenBeats(state.project).length;
  return { ...state, cursor: { ...state.cursor, flatIndex: clampFlatIndex(state.cursor.flatIndex + 1, flatLength) } };
}

function currentBeatDuration(state: EditorState): Duration {
  return flattenBeats(state.project)[state.cursor.flatIndex]?.beat.duration ?? state.activeDuration;
}

/** Moves the cursor to the first beat of `measureIndex` (clamped), keeping the current string. */
function gotoMeasure(state: EditorState, measureIndex: number): EditorState {
  const flat = flattenBeats(state.project);
  if (flat.length === 0) return state;
  const lastMeasure = state.project.track.measures.length - 1;
  const target = Math.max(0, Math.min(lastMeasure, measureIndex));
  const flatIndex = Math.max(0, flat.findIndex((ref) => ref.measureIndex >= target));
  return { ...state, cursor: { ...state.cursor, flatIndex }, selectionAnchor: null };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  if (action.type !== "TYPE_DIGIT" && state.pendingDigit !== null) {
    state = commitPendingDigit(state);
  }
  state = { ...state, lastError: null };

  switch (action.type) {
    case "MOVE_CURSOR": {
      const flat = flattenBeats(state.project);
      let flatIndex = state.cursor.flatIndex;
      let string = state.cursor.string;

      if (action.direction === "left") flatIndex = clampFlatIndex(flatIndex - 1, flat.length);
      else if (action.direction === "right") flatIndex = clampFlatIndex(flatIndex + 1, flat.length);
      else if (action.direction === "up") string = (Math.max(1, string - 1) as StringNumber);
      else if (action.direction === "down") string = (Math.min(6, string + 1) as StringNumber);
      else if (action.direction === "home") flatIndex = measureFlatBounds(flat, flatIndex)[0];
      else if (action.direction === "end") flatIndex = measureFlatBounds(flat, flatIndex)[1];

      const selectionAnchor = action.extendSelection
        ? (state.selectionAnchor ?? state.cursor.flatIndex)
        : null;

      return { ...state, cursor: { flatIndex, string }, selectionAnchor };
    }

    case "TYPE_DIGIT": {
      const position = currentPosition(state);

      if (state.pendingDigit !== null) {
        const fret = state.pendingDigit * 10 + action.digit;
        const project = setNoteAtPosition(state.project, position, state.cursor.string, fret);
        return advanceCursorAfterEntry({ ...withEdit(state, project), pendingDigit: null }, action.chordMode);
      }

      if (action.digit === 0 || action.digit >= 3) {
        const project = setNoteAtPosition(state.project, position, state.cursor.string, action.digit);
        return advanceCursorAfterEntry(withEdit(state, project), action.chordMode);
      }

      // 1 or 2: could still become a two-digit fret, wait for the next key.
      return { ...state, pendingDigit: action.digit };
    }

    case "CONFIRM":
      return state;

    case "SET_DURATION": {
      const project = setBeatDuration(state.project, currentPosition(state), action.duration);
      return { ...withEdit(state, project), activeDuration: action.duration };
    }

    case "TOGGLE_DOTTED":
      return withEdit(state, toggleDotted(state.project, currentPosition(state)));

    case "TOGGLE_TUPLET":
      return withEdit(state, toggleTuplet(state.project, currentPosition(state)));

    case "INSERT_REST":
      return withEdit(state, setRestAtPosition(state.project, currentPosition(state), state.activeDuration));

    case "DELETE": {
      const positions = selectionPositions(state);
      if (positions.length > 1) {
        return withEdit(state, clearNotesInRange(state.project, positions));
      }
      return withEdit(state, removeNoteAtPosition(state.project, positions[0], state.cursor.string));
    }

    case "DELETE_BEAT":
      return withEdit(state, deleteBeatAt(state.project, currentPosition(state)));

    case "INSERT_BEAT":
      return withEdit(state, insertEmptyBeatAt(state.project, currentPosition(state), state.activeDuration));

    case "COPY":
      return { ...state, clipboard: copyBeats(state.project, selectionPositions(state)) };

    case "CUT": {
      const positions = selectionPositions(state);
      const clipboard = copyBeats(state.project, positions);
      return { ...withEdit(state, clearNotesInRange(state.project, positions)), clipboard };
    }

    case "PASTE": {
      if (!state.clipboard) return state;
      const flat = flattenBeats(state.project);
      const positions = flat
        .slice(state.cursor.flatIndex, state.cursor.flatIndex + state.clipboard.length)
        .map(({ measureIndex, beatIndex }) => ({ measureIndex, beatIndex }));
      return withEdit(state, pasteBeatsAt(state.project, positions, state.clipboard));
    }

    case "TOGGLE_AUTO_ADVANCE":
      return { ...state, autoAdvance: !state.autoAdvance };

    case "UNDO": {
      if (state.history.length === 0) return state;
      const previous = state.history[state.history.length - 1];
      const flatLength = flattenBeats(previous).length;
      return {
        ...state,
        project: previous,
        history: state.history.slice(0, -1),
        future: [state.project, ...state.future],
        cursor: { ...state.cursor, flatIndex: clampFlatIndex(state.cursor.flatIndex, flatLength) },
        selectionAnchor: null,
      };
    }

    case "REDO": {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      const flatLength = flattenBeats(next).length;
      return {
        ...state,
        project: next,
        history: [...state.history, state.project],
        future: state.future.slice(1),
        cursor: { ...state.cursor, flatIndex: clampFlatIndex(state.cursor.flatIndex, flatLength) },
        selectionAnchor: null,
      };
    }

    case "CLICK_CELL":
      return { ...state, cursor: { flatIndex: action.flatIndex, string: action.string }, selectionAnchor: null };

    case "CLICK_FRET": {
      // Fretboard clicks always target the string just clicked, at the cursor's current column.
      const cursor: Cursor = { flatIndex: state.cursor.flatIndex, string: action.string };
      const position = currentPosition({ ...state, cursor });
      const project = setNoteAtPosition(state.project, position, action.string, action.fret);
      return advanceCursorAfterEntry(withEdit({ ...state, cursor }, project), action.chordMode);
    }

    case "INSERT_MEASURE":
      return withEdit(state, insertMeasureAt(state.project, currentMeasureIndex(state)));

    case "DUPLICATE_MEASURE":
      return withEdit(state, duplicateMeasureAt(state.project, currentMeasureIndex(state)));

    case "DELETE_MEASURE": {
      const idx = action.measureIndex ?? currentMeasureIndex(state);
      return withEdit(state, deleteMeasureAt(state.project, idx));
    }

    case "TRANSPOSE": {
      const semitones = action.direction === "up" ? 1 : -1;
      const result = transposeProject(state.project, semitones);
      if (!result.ok) {
        return {
          ...state,
          lastError: `Transpose stopped at measure ${result.measureIndex + 1}: a note would go outside fret 0-24.`,
        };
      }
      return withEdit(state, result.project);
    }

    case "SET_TIME_SIGNATURE_FROM":
      return withEdit(
        state,
        setTimeSignatureFrom(state.project, currentMeasureIndex(state), action.timeSignature),
      );

    case "SET_TEMPO_FROM":
      return withEdit(state, setTempoFrom(state.project, currentMeasureIndex(state), action.tempo));

    case "INSERT_CHORD":
      return withEdit(
        state,
        setChordAtPosition(state.project, currentPosition(state), action.chord.name, chordToNotes(action.chord)),
      );

    case "APPLY_BEND": {
      const result = applyBend(state.project, currentPosition(state), state.cursor.string, action.preset);
      const next = withEdit(state, result.project);
      return result.hadConflict
        ? { ...next, lastError: "Bend replaced this note's slide — they can't combine (section 7)." }
        : next;
    }

    case "APPLY_SLIDE": {
      const result = applySlide(state.project, currentPosition(state), state.cursor.string, action.slideType);
      const next = withEdit(state, result.project);
      return result.hadConflict
        ? { ...next, lastError: "Slide replaced this note's bend — they can't combine (section 7)." }
        : next;
    }

    case "APPLY_VIBRATO":
      return withEdit(
        state,
        applyVibrato(state.project, currentPosition(state), state.cursor.string, action.intensity),
      );

    case "TOGGLE_HAMMER":
      return withEdit(state, toggleHammer(state.project, currentPosition(state), state.cursor.string));

    case "TOGGLE_DEAD":
      return withEdit(state, toggleDeadNote(state.project, currentPosition(state), state.cursor.string));

    case "TOGGLE_GHOST":
      return withEdit(state, toggleGhostNote(state.project, currentPosition(state), state.cursor.string));

    case "TOGGLE_PALM_MUTE":
      return withEdit(state, toggleBeatFlag(state.project, currentPosition(state), "palmMute"));

    case "TOGGLE_LET_RING":
      return withEdit(state, toggleBeatFlag(state.project, currentPosition(state), "letRing"));

    case "CLEAR_EFFECTS":
      return withEdit(state, clearNoteEffects(state.project, currentPosition(state), state.cursor.string));

    case "SET_TUNING":
      return withEdit(state, setTuning(state.project, action.tuning));

    case "SET_TUNING_STRING":
      return withEdit(state, setTuningString(state.project, action.arrayIndex, action.note));

    case "SET_CAPO":
      return withEdit(state, setCapo(state.project, action.capo));

    case "SET_CHORD_LABEL":
      return withEdit(state, setChordLabel(state.project, currentPosition(state), action.label));

    case "SELECT_ALL": {
      const flat = flattenBeats(state.project);
      if (flat.length === 0) return state;
      return { ...state, selectionAnchor: 0, cursor: { ...state.cursor, flatIndex: flat.length - 1 } };
    }

    case "TOGGLE_TIE":
      return withEdit(state, toggleTie(state.project, currentPosition(state), state.cursor.string));

    case "TOGGLE_HARMONIC":
      return withEdit(state, toggleHarmonic(state.project, currentPosition(state), state.cursor.string));

    case "TOGGLE_BEAT_MARK":
      return withEdit(state, toggleBeatMark(state.project, currentPosition(state), action.mark));

    case "TOGGLE_ACCENT":
      return withEdit(state, toggleAccent(state.project, currentPosition(state), action.level));

    case "TOGGLE_PICK_STROKE":
      return withEdit(state, togglePickStroke(state.project, currentPosition(state), action.direction));

    case "SET_BEAT_TEXT":
      return withEdit(state, setBeatText(state.project, currentPosition(state), action.text));

    case "TOGGLE_REPEAT_START":
      return withEdit(state, toggleRepeatStart(state.project, currentMeasureIndex(state)));

    case "TOGGLE_REPEAT_END":
      return withEdit(state, toggleRepeatEnd(state.project, currentMeasureIndex(state)));

    case "SET_REPEAT_COUNT":
      return withEdit(state, setRepeatCount(state.project, currentMeasureIndex(state), action.count));

    case "SET_SECTION_LABEL":
      return withEdit(state, setSectionLabel(state.project, currentMeasureIndex(state), action.label));

    case "STEP_DURATION": {
      const order: Duration[] = [1, 2, 4, 8, 16, 32];
      const current = order.indexOf(currentBeatDuration(state));
      const next = order[Math.max(0, Math.min(order.length - 1, current + (action.direction === "longer" ? -1 : 1)))];
      const project = setBeatDuration(state.project, currentPosition(state), next);
      return { ...withEdit(state, project), activeDuration: next };
    }

    case "GOTO_MEASURE":
      return gotoMeasure(state, action.measureIndex);

    case "GOTO_SECTION": {
      const measures = state.project.track.measures;
      const here = currentMeasureIndex(state);
      let target = -1;
      if (action.direction === "next") {
        target = measures.findIndex((measure, index) => index > here && measure.sectionLabel);
      } else {
        for (let i = here - 1; i >= 0; i--) {
          if (measures[i].sectionLabel) {
            target = i;
            break;
          }
        }
      }
      return target < 0 ? state : gotoMeasure(state, target);
    }

    case "SET_TITLE":
      return withEdit(state, setProjectTitle(state.project, action.title));

    case "SET_ARTIST":
      return withEdit(state, setProjectArtist(state.project, action.artist));

    case "SET_DEFAULT_TEMPO":
      return withEdit(state, setDefaultTempo(state.project, action.tempo));

    case "SET_DEFAULT_TIME_SIGNATURE":
      return withEdit(state, setDefaultTimeSignature(state.project, action.timeSignature));

    case "LOAD_PROJECT":
      return createEditorState(action.project, action.readOnly ?? false);

    default:
      return state;
  }
}
