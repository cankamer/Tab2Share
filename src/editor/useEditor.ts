import { useCallback, useEffect, useReducer } from "react";
import type { BendPreset, Duration, Project, SlideType } from "../model/types";
import type { ChordDefinition } from "../model/chords";
import { createEditorState, editorReducer, type StringNumber } from "./state";

const DURATION_BY_FUNCTION_KEY: Record<string, Duration> = {
  F1: 1,
  F2: 2,
  F3: 4,
  F4: 8,
  F5: 16,
  F6: 32,
};

export function useEditor(initialProject: Project) {
  const [state, dispatch] = useReducer(editorReducer, initialProject, createEditorState);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      const isTextInput =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (isTextInput) return;

      const { key, shiftKey, ctrlKey, metaKey, altKey } = event;
      const mod = ctrlKey || metaKey;

      if (mod && key.toLowerCase() === "z") {
        event.preventDefault();
        dispatch({ type: shiftKey ? "REDO" : "UNDO" });
        return;
      }
      if (mod && key.toLowerCase() === "y") {
        event.preventDefault();
        dispatch({ type: "REDO" });
        return;
      }
      if (mod && !shiftKey && key.toLowerCase() === "c") {
        event.preventDefault();
        dispatch({ type: "COPY" });
        return;
      }
      // Ctrl+Shift+C is reserved for the export panel's clipboard-image copy (section 14);
      // let that event through unhandled here rather than also treating it as beat-copy.
      if (mod && shiftKey && key.toLowerCase() === "x") {
        event.preventDefault();
        dispatch({ type: "CLEAR_EFFECTS" });
        return;
      }
      if (mod && key.toLowerCase() === "x") {
        event.preventDefault();
        dispatch({ type: "CUT" });
        return;
      }
      if (mod && key.toLowerCase() === "v") {
        event.preventDefault();
        dispatch({ type: "PASTE" });
        return;
      }
      if (mod && key.toLowerCase() === "a") {
        event.preventDefault();
        dispatch({ type: "SELECT_ALL" });
        return;
      }
      if (mod && (key === "ArrowUp" || key === "ArrowDown")) {
        event.preventDefault();
        dispatch({ type: "TRANSPOSE", direction: key === "ArrowUp" ? "up" : "down" });
        return;
      }
      if (mod && key.toLowerCase() === "m") {
        event.preventDefault();
        dispatch({ type: shiftKey ? "DELETE_MEASURE" : "INSERT_MEASURE" });
        return;
      }
      if (mod && key.toLowerCase() === "d") {
        event.preventDefault();
        dispatch({ type: "DUPLICATE_MEASURE" });
        return;
      }
      // Guitar Pro: Ctrl+Insert / Ctrl+Delete insert / delete a bar (Ctrl+M / Ctrl+Shift+M stay as aliases).
      if (mod && key === "Insert") {
        event.preventDefault();
        dispatch({ type: "INSERT_MEASURE" });
        return;
      }
      if (mod && key === "Delete") {
        event.preventDefault();
        dispatch({ type: "DELETE_MEASURE" });
        return;
      }
      if (mod && (key === "Home" || key === "End")) {
        event.preventDefault();
        dispatch({ type: "GOTO_MEASURE", measureIndex: key === "Home" ? 0 : Number.MAX_SAFE_INTEGER });
        return;
      }
      if (mod) return;

      if (altKey && (key === "ArrowLeft" || key === "ArrowRight")) {
        event.preventDefault();
        dispatch({ type: "GOTO_SECTION", direction: key === "ArrowLeft" ? "previous" : "next" });
        return;
      }

      if (key in DURATION_BY_FUNCTION_KEY) {
        event.preventDefault();
        dispatch({ type: "SET_DURATION", duration: DURATION_BY_FUNCTION_KEY[key] });
        return;
      }

      if (key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown") {
        event.preventDefault();
        const direction =
          key === "ArrowLeft" ? "left" : key === "ArrowRight" ? "right" : key === "ArrowUp" ? "up" : "down";
        dispatch({ type: "MOVE_CURSOR", direction, extendSelection: shiftKey });
        return;
      }
      if (key === "Home" || key === "End") {
        event.preventDefault();
        dispatch({ type: "MOVE_CURSOR", direction: key === "Home" ? "home" : "end", extendSelection: shiftKey });
        return;
      }
      if (key === "Delete") {
        event.preventDefault();
        // Guitar Pro: Shift+Delete removes the beat(s) itself, Delete only clears the note.
        dispatch({ type: shiftKey ? "DELETE_BEAT" : "DELETE" });
        return;
      }
      if (key === "Insert") {
        // Shift+Insert is the section prompt (App.tsx owns it).
        if (shiftKey) return;
        event.preventDefault();
        dispatch({ type: "INSERT_BEAT" });
        return;
      }
      if (key === "Enter") {
        event.preventDefault();
        dispatch({ type: "CONFIRM" });
        return;
      }
      if (key === ".") {
        event.preventDefault();
        dispatch({ type: "TOGGLE_DOTTED" });
        return;
      }
      if (key === "/") {
        event.preventDefault();
        dispatch({ type: "TOGGLE_TUPLET" });
        return;
      }
      if (key === "+" || key === "=") {
        event.preventDefault();
        dispatch({ type: "STEP_DURATION", direction: "longer" });
        return;
      }
      if (key === "-" || key === "_") {
        event.preventDefault();
        dispatch({ type: "STEP_DURATION", direction: "shorter" });
        return;
      }
      if (key.toLowerCase() === "r") {
        event.preventDefault();
        dispatch({ type: "INSERT_REST" });
        return;
      }
      if (key.toLowerCase() === "b") {
        event.preventDefault();
        dispatch({ type: "APPLY_BEND", preset: "full" });
        return;
      }
      if (key.toLowerCase() === "v") {
        event.preventDefault();
        dispatch({ type: "APPLY_VIBRATO", intensity: altKey ? "wide" : "normal" });
        return;
      }
      if (key.toLowerCase() === "s") {
        event.preventDefault();
        dispatch({ type: "APPLY_SLIDE", slideType: altKey ? "shift" : "legato" });
        return;
      }
      if (key.toLowerCase() === "h") {
        event.preventDefault();
        dispatch({ type: "TOGGLE_HAMMER" });
        return;
      }
      if (key.toLowerCase() === "x") {
        event.preventDefault();
        dispatch({ type: "TOGGLE_DEAD" });
        return;
      }
      if (key.toLowerCase() === "o") {
        event.preventDefault();
        dispatch({ type: "TOGGLE_GHOST" });
        return;
      }
      if (key === "[") {
        event.preventDefault();
        dispatch({ type: "TOGGLE_REPEAT_START" });
        return;
      }
      if (key === "]") {
        event.preventDefault();
        dispatch({ type: "TOGGLE_REPEAT_END" });
        return;
      }
      if (key.toLowerCase() === "p") {
        event.preventDefault();
        dispatch({ type: "TOGGLE_PALM_MUTE" });
        return;
      }
      if (key.toLowerCase() === "l") {
        event.preventDefault();
        dispatch({ type: "TOGGLE_TIE" });
        return;
      }
      if (key.toLowerCase() === "y") {
        event.preventDefault();
        dispatch({ type: "TOGGLE_HARMONIC" });
        return;
      }
      if (key.toLowerCase() === "f") {
        event.preventDefault();
        dispatch({ type: "TOGGLE_BEAT_MARK", mark: "fermata" });
        return;
      }
      if (key.toLowerCase() === "n") {
        event.preventDefault();
        dispatch({ type: "TOGGLE_BEAT_MARK", mark: "trill" });
        return;
      }
      if (key === "!") {
        event.preventDefault();
        dispatch({ type: "TOGGLE_BEAT_MARK", mark: "staccato" });
        return;
      }
      if (key === ";") {
        event.preventDefault();
        dispatch({ type: "TOGGLE_ACCENT", level: "normal" });
        return;
      }
      if (key === ":") {
        event.preventDefault();
        dispatch({ type: "TOGGLE_ACCENT", level: "heavy" });
        return;
      }
      if (shiftKey && (key === "D" || key === "U")) {
        event.preventDefault();
        dispatch({ type: "TOGGLE_PICK_STROKE", direction: key === "D" ? "down" : "up" });
        return;
      }
      if (key.toLowerCase() === "i") {
        event.preventDefault();
        dispatch({ type: "TOGGLE_LET_RING" });
        return;
      }
      if (/^[0-9]$/.test(key)) {
        event.preventDefault();
        dispatch({ type: "TYPE_DIGIT", digit: Number(key), chordMode: shiftKey });
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const clickCell = useCallback(
    (flatIndex: number, string: StringNumber) => dispatch({ type: "CLICK_CELL", flatIndex, string }),
    [],
  );

  const clickFret = useCallback(
    (string: StringNumber, fret: number, chordMode: boolean) =>
      dispatch({ type: "CLICK_FRET", string, fret, chordMode }),
    [],
  );

  const toggleAutoAdvance = useCallback(() => dispatch({ type: "TOGGLE_AUTO_ADVANCE" }), []);
  const setDuration = useCallback(
    (duration: Duration) => dispatch({ type: "SET_DURATION", duration }),
    [],
  );
  const toggleDotted = useCallback(() => dispatch({ type: "TOGGLE_DOTTED" }), []);
  const toggleTuplet = useCallback(() => dispatch({ type: "TOGGLE_TUPLET" }), []);

  const insertMeasure = useCallback(() => dispatch({ type: "INSERT_MEASURE" }), []);
  const duplicateMeasure = useCallback(() => dispatch({ type: "DUPLICATE_MEASURE" }), []);
  const deleteMeasure = useCallback((measureIndex?: number) => dispatch({ type: "DELETE_MEASURE", measureIndex }), []);
  const transposeUp = useCallback(() => dispatch({ type: "TRANSPOSE", direction: "up" }), []);
  const transposeDown = useCallback(() => dispatch({ type: "TRANSPOSE", direction: "down" }), []);
  const setTempoFrom = useCallback((tempo: number) => dispatch({ type: "SET_TEMPO_FROM", tempo }), []);
  const setTimeSignatureFrom = useCallback(
    (num: number, den: number) => dispatch({ type: "SET_TIME_SIGNATURE_FROM", timeSignature: { num, den } }),
    [],
  );
  const insertChord = useCallback(
    (chord: ChordDefinition) => dispatch({ type: "INSERT_CHORD", chord }),
    [],
  );

  const applyBend = useCallback((preset: BendPreset) => dispatch({ type: "APPLY_BEND", preset }), []);
  const applySlide = useCallback(
    (slideType: SlideType) => dispatch({ type: "APPLY_SLIDE", slideType }),
    [],
  );
  const applyVibrato = useCallback(
    (intensity: "normal" | "wide") => dispatch({ type: "APPLY_VIBRATO", intensity }),
    [],
  );
  const toggleHammer = useCallback(() => dispatch({ type: "TOGGLE_HAMMER" }), []);
  const toggleDead = useCallback(() => dispatch({ type: "TOGGLE_DEAD" }), []);
  const toggleGhost = useCallback(() => dispatch({ type: "TOGGLE_GHOST" }), []);
  const togglePalmMute = useCallback(() => dispatch({ type: "TOGGLE_PALM_MUTE" }), []);
  const toggleLetRing = useCallback(() => dispatch({ type: "TOGGLE_LET_RING" }), []);
  const clearEffects = useCallback(() => dispatch({ type: "CLEAR_EFFECTS" }), []);

  const setTuning = useCallback((tuning: string[]) => dispatch({ type: "SET_TUNING", tuning }), []);
  const setTuningString = useCallback(
    (arrayIndex: number, note: string) => dispatch({ type: "SET_TUNING_STRING", arrayIndex, note }),
    [],
  );
  const setCapo = useCallback((capo: number) => dispatch({ type: "SET_CAPO", capo }), []);
  const setChordLabel = useCallback((label: string) => dispatch({ type: "SET_CHORD_LABEL", label }), []);

  const toggleTie = useCallback(() => dispatch({ type: "TOGGLE_TIE" }), []);
  const toggleHarmonic = useCallback(() => dispatch({ type: "TOGGLE_HARMONIC" }), []);
  const toggleBeatMark = useCallback(
    (mark: "fermata" | "staccato" | "trill") => dispatch({ type: "TOGGLE_BEAT_MARK", mark }),
    [],
  );
  const toggleAccent = useCallback(
    (level: "normal" | "heavy") => dispatch({ type: "TOGGLE_ACCENT", level }),
    [],
  );
  const togglePickStroke = useCallback(
    (direction: "down" | "up") => dispatch({ type: "TOGGLE_PICK_STROKE", direction }),
    [],
  );
  const setBeatText = useCallback((text: string) => dispatch({ type: "SET_BEAT_TEXT", text }), []);
  const toggleRepeatStart = useCallback(() => dispatch({ type: "TOGGLE_REPEAT_START" }), []);
  const toggleRepeatEnd = useCallback(() => dispatch({ type: "TOGGLE_REPEAT_END" }), []);
  const setRepeatCount = useCallback((count: number) => dispatch({ type: "SET_REPEAT_COUNT", count }), []);
  const setSectionLabel = useCallback((label: string) => dispatch({ type: "SET_SECTION_LABEL", label }), []);
  const gotoMeasure = useCallback((measureIndex: number) => dispatch({ type: "GOTO_MEASURE", measureIndex }), []);

  const undo = useCallback(() => dispatch({ type: "UNDO" }), []);
  const redo = useCallback(() => dispatch({ type: "REDO" }), []);
  const cut = useCallback(() => dispatch({ type: "CUT" }), []);
  const copy = useCallback(() => dispatch({ type: "COPY" }), []);
  const paste = useCallback(() => dispatch({ type: "PASTE" }), []);
  const deleteSelection = useCallback(() => dispatch({ type: "DELETE" }), []);
  const selectAll = useCallback(() => dispatch({ type: "SELECT_ALL" }), []);
  const insertRest = useCallback(() => dispatch({ type: "INSERT_REST" }), []);
  const setTitle = useCallback((title: string) => dispatch({ type: "SET_TITLE", title }), []);
  const setArtist = useCallback((artist: string) => dispatch({ type: "SET_ARTIST", artist }), []);
  const setDefaultTempo = useCallback((tempo: number) => dispatch({ type: "SET_DEFAULT_TEMPO", tempo }), []);
  const setDefaultTimeSignature = useCallback(
    (num: number, den: number) => dispatch({ type: "SET_DEFAULT_TIME_SIGNATURE", timeSignature: { num, den } }),
    [],
  );
  const loadProject = useCallback(
    (project: Project, readOnly?: boolean) => dispatch({ type: "LOAD_PROJECT", project, readOnly }),
    [],
  );

  return {
    state,
    dispatch,
    clickCell,
    clickFret,
    toggleAutoAdvance,
    setDuration,
    toggleDotted,
    toggleTuplet,
    insertMeasure,
    duplicateMeasure,
    deleteMeasure,
    transposeUp,
    transposeDown,
    setTempoFrom,
    setTimeSignatureFrom,
    insertChord,
    applyBend,
    applySlide,
    applyVibrato,
    toggleHammer,
    toggleDead,
    toggleGhost,
    togglePalmMute,
    toggleLetRing,
    clearEffects,
    toggleTie,
    toggleHarmonic,
    toggleBeatMark,
    toggleAccent,
    togglePickStroke,
    setBeatText,
    toggleRepeatStart,
    toggleRepeatEnd,
    setRepeatCount,
    setSectionLabel,
    gotoMeasure,
    setTuning,
    setTuningString,
    setCapo,
    setChordLabel,
    undo,
    redo,
    cut,
    copy,
    paste,
    deleteSelection,
    selectAll,
    insertRest,
    setTitle,
    setArtist,
    setDefaultTempo,
    setDefaultTimeSignature,
    loadProject,
  };
}
