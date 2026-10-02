import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { TabCanvas } from "./render/TabCanvas";
import { AM_C_G_F_EXAMPLE } from "./model/examples";
import { createBlankProject } from "./model/examples/blank";
import { isStandardTuning } from "./model/tunings";
import { useEditor } from "./editor/useEditor";
import { flattenBeats } from "./editor/beats";
import { resolveEffectiveSettings } from "./editor/effectiveSettings";
import { DurationSelector } from "./editor/DurationSelector";
import { GuitarFretboard } from "./editor/GuitarFretboard";
import { MeasureControls } from "./editor/MeasureControls";
import { ChordPicker } from "./editor/ChordPicker";
import { EffectPalette } from "./editor/EffectPalette";
import { TuningCapoControls } from "./editor/TuningCapoControls";
import { computeLayout } from "./render/layout";
import type { LineBreakMode } from "./render/lineLayout";
import { applyThemeChoice, readStoredChoice, type ThemeChoice } from "./theme";
import { setLanguage, type AppLanguage } from "./i18n";
import { useProjectFile } from "./file/useProjectFile";
import { CURRENT_PROJECT_VERSION } from "./file/project";
import { WelcomeScreen } from "./onboarding/WelcomeScreen";
import { TourOverlay } from "./onboarding/TourOverlay";
import { hasSeenTour, markTourSeen } from "./onboarding/tourStorage";
import { MenuBar, MenuBarAltKeys, MenuItem, MenuRoot, MenuSeparator, MenuSubmenu } from "./menu/Menu";
import { ShortcutsModal } from "./menu/ShortcutsModal";
import { ProjectSettingsModal } from "./menu/ProjectSettingsModal";
import { PreferencesModal } from "./menu/PreferencesModal";
import { AboutModal } from "./menu/AboutModal";
import { InfoModal } from "./menu/InfoModal";
import { ExportModal } from "./editor/ExportModal";
import { PromptModal } from "./editor/ui/PromptModal";
import { NeumorphicScrollbar } from "./editor/ui/NeumorphicScrollbar";
import type { BendPreset, Duration, SlideType } from "./model/types";

type PromptKind = "section" | "text" | "gotoBar";

type ModalKind = "shortcuts" | "projectSettings" | "preferences" | "about" | "gettingStarted" | "notationGuide" | "exportPng" | null;

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.1;

const DURATION_KEYS: Duration[] = [1, 2, 4, 8, 16, 32];
const BEND_PRESETS: BendPreset[] = ["half", "full", "oneAndHalf", "bendRelease", "preBend"];
const SLIDE_TYPES: SlideType[] = ["legato", "shift", "inFromBelow", "inFromAbove", "outUp", "outDown"];
const MEASURES_PER_LINE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];

function App() {
  const { t, i18n } = useTranslation();
  const {
    state,
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
    dispatch,
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
  } = useEditor(AM_C_G_F_EXAMPLE);

  const [hoveredFlatIndex, setHoveredFlatIndex] = useState<number | null>(null);
  const [themeChoice, setThemeChoiceState] = useState<ThemeChoice>(readStoredChoice);
  const [zoom, setZoom] = useState(1);
  const [showPreview, setShowPreview] = useState(true);
  const [showFretboard, setShowFretboard] = useState(true);
  const [showChordPicker, setShowChordPicker] = useState(true);
  const [showEffectPalette, setShowEffectPalette] = useState(true);
  const [lineBreakMode, setLineBreakMode] = useState<LineBreakMode>({ kind: "auto" });
  const [modal, setModal] = useState<ModalKind>(null);
  const [prompt, setPrompt] = useState<PromptKind | null>(null);
  const [showWelcome, setShowWelcome] = useState(true);
  const [showTour, setShowTour] = useState(false);
  const tabScrollContainerRef = useRef<HTMLDivElement>(null);
  const prevMeasuresCountRef = useRef(state.project.track.measures.length);

  useEffect(() => {
    applyThemeChoice(themeChoice);
  }, [themeChoice]);

  useEffect(() => {
    try {
      getCurrentWindow()
        .maximize()
        .catch(() => {
          // Ignore when running outside Tauri desktop container or lacking permission
        });
    } catch {
      // getCurrentWindow() throws synchronously outside a Tauri context (e.g. `vite dev` in a plain browser).
    }
  }, []);

  useEffect(() => {
    const currentCount = state.project.track.measures.length;
    if (currentCount > prevMeasuresCountRef.current) {
      if (tabScrollContainerRef.current) {
        requestAnimationFrame(() => {
          if (tabScrollContainerRef.current) {
            tabScrollContainerRef.current.scrollTo({
              left: tabScrollContainerRef.current.scrollWidth,
              behavior: "smooth",
            });
          }
        });
      }
    }
    prevMeasuresCountRef.current = currentCount;
  }, [state.project.track.measures.length]);

  useEffect(() => {
    const container = tabScrollContainerRef.current;
    if (!container) return;

    let targetScrollLeft = container.scrollLeft;
    let animationFrameId: number | null = null;

    const smoothScrollLoop = () => {
      if (!container) return;
      const current = container.scrollLeft;
      const diff = targetScrollLeft - current;
      if (Math.abs(diff) > 0.5) {
        container.scrollLeft = current + diff * 0.3;
        animationFrameId = requestAnimationFrame(smoothScrollLoop);
      } else {
        container.scrollLeft = targetScrollLeft;
        animationFrameId = null;
      }
    };

    const handleNativeWheel = (e: WheelEvent) => {
      // Whichever axis is actually dominant wins — a mouse's smooth-scroll driver (e.g. the MX
      // Master 3S's Logi Options+) can report a tiny nonzero deltaX alongside a real vertical
      // scroll, and picking deltaX just because it's nonzero made panning imperceptibly slow.
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;

      if (delta !== 0) {
        e.preventDefault();

        if (animationFrameId === null) {
          targetScrollLeft = container.scrollLeft;
        }

        const maxScroll = container.scrollWidth - container.clientWidth;
        if (maxScroll > 0) {
          targetScrollLeft = Math.max(0, Math.min(maxScroll, targetScrollLeft + delta));
          if (animationFrameId === null) {
            animationFrameId = requestAnimationFrame(smoothScrollLoop);
          }
        }
      }
    };

    container.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleNativeWheel);
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, []);

  const confirmDiscard = useCallback(
    (title: string) => window.confirm(t("app.confirmDiscard", { title: title || t("app.untitled") })),
    [t],
  );

  const projectFile = useProjectFile({
    project: state.project,
    loadProject,
    createBlankProject,
    confirmDiscard,
    readOnly: state.readOnly,
  });

  // Section 16: the welcome screen's three options funnel into the editor through the same
  // File-menu actions (step 12.5) — the only new piece is the first-ever-entry tour gate.
  const enterEditor = useCallback(() => {
    setShowWelcome(false);
    if (!hasSeenTour()) setShowTour(true);
  }, []);

  const handleWelcomeNew = useCallback(() => {
    projectFile.newProject();
    enterEditor();
  }, [enterEditor, projectFile]);

  const handleWelcomeOpen = useCallback(async () => {
    const opened = await projectFile.openProject();
    if (opened) enterEditor();
  }, [enterEditor, projectFile]);

  const handleWelcomeExample = useCallback(() => {
    projectFile.openExample(AM_C_G_F_EXAMPLE);
    enterEditor();
  }, [enterEditor, projectFile]);

  const finishTour = useCallback(() => {
    markTourSeen();
    setShowTour(false);
  }, []);

  const tabLayout = computeLayout(state.project);
  const flat = flattenBeats(state.project);
  const cursorBeat = flat[state.cursor.flatIndex]?.beat;
  const measureIndex = flat[state.cursor.flatIndex]?.measureIndex ?? 0;
  const effectiveSettings = resolveEffectiveSettings(state.project, measureIndex);
  const cursorNote = cursorBeat?.notes.find((note) => note.string === state.cursor.string);
  const cursorMeasure = state.project.track.measures[measureIndex];

  const nonStandardTuning = !isStandardTuning(state.project.track.tuning);
  const hoveredBeat = hoveredFlatIndex !== null ? flat[hoveredFlatIndex]?.beat : undefined;
  const showTuningWarning = nonStandardTuning && Boolean(hoveredBeat?.chordRef);

  const selectionRange: [number, number] | null =
    state.selectionAnchor === null
      ? null
      : [Math.min(state.selectionAnchor, state.cursor.flatIndex), Math.max(state.selectionAnchor, state.cursor.flatIndex)];

  const canUndo = state.history.length > 0;
  const canRedo = state.future.length > 0;
  const canPaste = state.clipboard !== null;

  const language = (i18n.language?.startsWith("tr") ? "tr" : "en") as AppLanguage;

  const documentTitle = `${state.project.title || t("app.untitled")}${projectFile.dirty ? t("app.unsavedMark") : ""}`;

  useEffect(() => {
    document.title = `${documentTitle} — Tab2Share`;
    try {
      getCurrentWindow()
        .setTitle(`${documentTitle} — Tab2Share`)
        .catch(() => {
          // Not running inside Tauri (e.g. `vite dev` in a plain browser) — document.title still updated above.
        });
    } catch {
      // getCurrentWindow() itself throws synchronously outside a Tauri context.
    }
  }, [documentTitle]);

  const handleExit = useCallback(async () => {
    if (projectFile.dirty && !confirmDiscard(state.project.title)) return;
    try {
      await getCurrentWindow().close();
    } catch {
      // Not running inside Tauri.
    }
  }, [confirmDiscard, projectFile.dirty, state.project.title]);

  const focusTimeSignature = useCallback(() => {
    const input = document.getElementById("time-signature-num");
    if (input instanceof HTMLInputElement) {
      input.focus();
      input.select();
    }
  }, []);

  // Section 8's chrome-level shortcuts (File/View/Help) — separate from useEditor's own
  // keydown handler, which owns note-entry and structural-editing shortcuts only.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (showWelcome) return;

      const target = event.target;
      const isTextInput =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (isTextInput) return;

      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      // Guitar Pro's prompt shortcuts: T = text, Shift+Insert = section, Ctrl+G = go to bar, Ctrl+T = time signature.
      if (!mod && !event.altKey && key === "t") {
        event.preventDefault();
        setPrompt("text");
        return;
      }
      if (!mod && !event.altKey && event.shiftKey && event.key === "Insert") {
        event.preventDefault();
        setPrompt("section");
        return;
      }
      if (mod && key === "g") {
        event.preventDefault();
        setPrompt("gotoBar");
        return;
      }
      if (mod && key === "t") {
        event.preventDefault();
        focusTimeSignature();
        return;
      }

      if (!mod) return;

      if (key === "n") {
        event.preventDefault();
        projectFile.newProject();
      } else if (key === "o") {
        event.preventDefault();
        projectFile.openProject();
      } else if (key === "s" && event.shiftKey) {
        event.preventDefault();
        projectFile.saveProjectAs();
      } else if (key === "s") {
        event.preventDefault();
        projectFile.saveProject();
      } else if (key === "e") {
        event.preventDefault();
        setModal("exportPng");
      } else if (key === "p") {
        event.preventDefault();
        setShowPreview((value) => !value);
      } else if (key === "b") {
        event.preventDefault();
        setShowFretboard((value) => !value);
      } else if (key === "k") {
        event.preventDefault();
        setShowChordPicker((value) => !value);
      } else if (key === "j") {
        event.preventDefault();
        setShowEffectPalette((value) => !value);
      } else if (key === "/") {
        event.preventDefault();
        setModal("shortcuts");
      } else if (key === ",") {
        event.preventDefault();
        setModal("preferences");
      } else if (key === "0") {
        event.preventDefault();
        setZoom(1);
      } else if (key === "+" || key === "=") {
        event.preventDefault();
        setZoom((value) => Math.min(MAX_ZOOM, Math.round((value + ZOOM_STEP) * 100) / 100));
      } else if (key === "-") {
        event.preventDefault();
        setZoom((value) => Math.max(MIN_ZOOM, Math.round((value - ZOOM_STEP) * 100) / 100));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusTimeSignature, projectFile, showWelcome]);

  if (showWelcome) {
    return (
      <WelcomeScreen
        onNewProject={handleWelcomeNew}
        onOpenProject={handleWelcomeOpen}
        onOpenExample={handleWelcomeExample}
      />
    );
  }

  return (
    <main className="flex h-screen w-screen flex-col gap-2.5 overflow-hidden p-3 select-none" style={{ background: "var(--body)" }}>
      <MenuBar>
        <MenuBarAltKeys />

        <MenuRoot id="file" label={t("menu.file.label")}>
          <MenuItem label={t("menu.file.newProject")} shortcut="Ctrl+N" onClick={projectFile.newProject} />
          <MenuItem label={t("menu.file.open")} shortcut="Ctrl+O" onClick={projectFile.openProject} />
          <MenuSubmenu label={t("menu.file.recentFiles")}>
            {projectFile.recentFiles.length === 0 ? (
              <MenuItem label={t("menu.file.noRecentFiles")} disabled />
            ) : (
              projectFile.recentFiles.map((path) => (
                <MenuItem key={path} label={path} onClick={() => projectFile.openRecent(path)} />
              ))
            )}
          </MenuSubmenu>
          <MenuSeparator />
          <MenuItem
            label={t("menu.file.save")}
            shortcut="Ctrl+S"
            onClick={projectFile.saveProject}
            disabled={state.readOnly}
            disabledReason={t("disabledReasons.readOnly")}
          />
          <MenuItem
            label={t("menu.file.saveAs")}
            shortcut="Ctrl+Shift+S"
            onClick={projectFile.saveProjectAs}
            disabled={state.readOnly}
            disabledReason={t("disabledReasons.readOnly")}
          />
          <MenuSeparator />
          <MenuItem
            label={t("menu.file.exportPng")}
            shortcut="Ctrl+E"
            onClick={() => setModal("exportPng")}
          />
          <MenuItem
            label={t("menu.file.copyPng")}
            shortcut="Ctrl+Shift+C"
            onClick={() => setModal("exportPng")}
          />
          <MenuSeparator />
          <MenuItem
            label={t("menu.file.projectSettings")}
            onClick={() => setModal("projectSettings")}
            disabled={state.readOnly}
            disabledReason={t("disabledReasons.readOnly")}
          />
          <MenuSeparator />
          <MenuItem label={t("menu.file.exit")} shortcut="Alt+F4" onClick={handleExit} />
        </MenuRoot>

        <MenuRoot id="edit" label={t("menu.edit.label")}>
          <MenuItem
            label={t("menu.edit.undo")}
            shortcut="Ctrl+Z"
            onClick={undo}
            disabled={!canUndo}
            disabledReason={t("disabledReasons.undo")}
          />
          <MenuItem
            label={t("menu.edit.redo")}
            shortcut="Ctrl+Y"
            onClick={redo}
            disabled={!canRedo}
            disabledReason={t("disabledReasons.redo")}
          />
          <MenuSeparator />
          <MenuItem
            label={t("menu.edit.cut")}
            shortcut="Ctrl+X"
            onClick={cut}
            disabled={state.readOnly}
            disabledReason={t("disabledReasons.readOnly")}
          />
          <MenuItem label={t("menu.edit.copy")} shortcut="Ctrl+C" onClick={copy} />
          <MenuItem
            label={t("menu.edit.paste")}
            shortcut="Ctrl+V"
            onClick={paste}
            disabled={!canPaste || state.readOnly}
            disabledReason={state.readOnly ? t("disabledReasons.readOnly") : t("disabledReasons.paste")}
          />
          <MenuItem
            label={t("menu.edit.delete")}
            shortcut="Delete"
            onClick={deleteSelection}
            disabled={state.readOnly}
            disabledReason={t("disabledReasons.readOnly")}
          />
          <MenuItem label={t("menu.edit.selectAll")} shortcut="Ctrl+A" onClick={selectAll} />
          <MenuSeparator />
          <MenuItem
            label={t("menu.edit.insertMeasure")}
            shortcut="Ctrl+Insert"
            onClick={insertMeasure}
            disabled={state.readOnly}
            disabledReason={t("disabledReasons.readOnly")}
          />
          <MenuItem
            label={t("menu.edit.duplicateMeasure")}
            shortcut="Ctrl+D"
            onClick={duplicateMeasure}
            disabled={state.readOnly}
            disabledReason={t("disabledReasons.readOnly")}
          />
          <MenuItem
            label={t("menu.edit.deleteMeasure")}
            shortcut="Ctrl+Delete"
            onClick={deleteMeasure}
            disabled={state.readOnly}
            disabledReason={t("disabledReasons.readOnly")}
          />
          <MenuSeparator />
          <MenuItem
            label={t("menu.edit.transposeUp")}
            shortcut="Ctrl+↑"
            onClick={transposeUp}
            disabled={state.readOnly}
            disabledReason={t("disabledReasons.readOnly")}
          />
          <MenuItem
            label={t("menu.edit.transposeDown")}
            shortcut="Ctrl+↓"
            onClick={transposeDown}
            disabled={state.readOnly}
            disabledReason={t("disabledReasons.readOnly")}
          />
          <MenuSeparator />
          <MenuItem label={t("menu.edit.preferences")} shortcut="Ctrl+," onClick={() => setModal("preferences")} />
        </MenuRoot>

        <MenuRoot
          id="note"
          label={t("menu.note.label")}
          disabled={state.readOnly}
          disabledReason={t("disabledReasons.readOnly")}
        >
          <MenuSubmenu label={t("menu.note.duration")}>
            {DURATION_KEYS.map((duration, index) => (
              <MenuItem
                key={duration}
                label={t(`durationSelector.durations.${duration}`)}
                shortcut={`F${index + 1}`}
                checked={state.activeDuration === duration}
                onClick={() => setDuration(duration)}
              />
            ))}
            <MenuSeparator />
            <MenuItem
              label={t("durationSelector.dotted")}
              shortcut="."
              checked={cursorBeat?.dotted ?? false}
              onClick={toggleDotted}
            />
            <MenuItem
              label={t("durationSelector.triplet")}
              shortcut="/"
              checked={Boolean(cursorBeat?.tuplet)}
              onClick={toggleTuplet}
            />
          </MenuSubmenu>
          <MenuItem label={t("menu.note.rest")} shortcut="R" onClick={insertRest} />
          <MenuSeparator />
          <MenuSubmenu label={t("menu.note.bend")}>
            {BEND_PRESETS.map((preset) => (
              <MenuItem
                key={preset}
                label={t(`effectPalette.bendPresets.${preset}`)}
                checked={cursorNote?.bend === preset}
                onClick={() => applyBend(preset)}
              />
            ))}
          </MenuSubmenu>
          <MenuItem
            label={t("menu.note.vibrato")}
            shortcut="V"
            checked={cursorNote?.vibrato === "normal"}
            onClick={() => applyVibrato("normal")}
          />
          <MenuItem
            label={t("menu.note.wideVibrato")}
            shortcut="Alt+V"
            checked={cursorNote?.vibrato === "wide"}
            onClick={() => applyVibrato("wide")}
          />
          <MenuSubmenu label={t("menu.note.slide")}>
            {SLIDE_TYPES.map((slideType) => (
              <MenuItem
                key={slideType}
                label={t(`effectPalette.slideTypes.${slideType}`)}
                checked={cursorNote?.slide?.type === slideType}
                onClick={() => applySlide(slideType)}
              />
            ))}
          </MenuSubmenu>
          <MenuItem
            label={t("menu.note.hammer")}
            shortcut="H"
            checked={Boolean(cursorNote?.hammer)}
            onClick={toggleHammer}
          />
          <MenuSeparator />
          <MenuItem
            label={t("menu.note.dead")}
            shortcut="X"
            checked={Boolean(cursorNote?.dead)}
            onClick={toggleDead}
          />
          <MenuItem
            label={t("menu.note.ghost")}
            shortcut="O"
            checked={Boolean(cursorNote?.ghost)}
            onClick={toggleGhost}
          />
          <MenuItem
            label={t("menu.note.palmMute")}
            shortcut="P"
            checked={Boolean(cursorBeat?.palmMute)}
            onClick={togglePalmMute}
          />
          <MenuItem
            label={t("menu.note.letRing")}
            shortcut="I"
            checked={Boolean(cursorBeat?.letRing)}
            onClick={toggleLetRing}
          />
          <MenuSeparator />
          <MenuItem label={t("menu.note.tie")} shortcut="L" checked={Boolean(cursorNote?.tie)} onClick={toggleTie} />
          <MenuItem
            label={t("menu.note.harmonic")}
            shortcut="Y"
            checked={Boolean(cursorNote?.harmonic)}
            onClick={toggleHarmonic}
          />
          <MenuItem
            label={t("menu.note.accent")}
            shortcut=";"
            checked={cursorBeat?.accent === "normal"}
            onClick={() => toggleAccent("normal")}
          />
          <MenuItem
            label={t("menu.note.heavyAccent")}
            shortcut="Shift+;"
            checked={cursorBeat?.accent === "heavy"}
            onClick={() => toggleAccent("heavy")}
          />
          <MenuItem
            label={t("menu.note.staccato")}
            shortcut="!"
            checked={Boolean(cursorBeat?.staccato)}
            onClick={() => toggleBeatMark("staccato")}
          />
          <MenuItem
            label={t("menu.note.fermata")}
            shortcut="F"
            checked={Boolean(cursorBeat?.fermata)}
            onClick={() => toggleBeatMark("fermata")}
          />
          <MenuItem
            label={t("menu.note.trill")}
            shortcut="N"
            checked={Boolean(cursorBeat?.trill)}
            onClick={() => toggleBeatMark("trill")}
          />
          <MenuItem
            label={t("menu.note.pickDown")}
            shortcut="Shift+D"
            checked={cursorBeat?.pickStroke === "down"}
            onClick={() => togglePickStroke("down")}
          />
          <MenuItem
            label={t("menu.note.pickUp")}
            shortcut="Shift+U"
            checked={cursorBeat?.pickStroke === "up"}
            onClick={() => togglePickStroke("up")}
          />
          <MenuItem
            label={t("menu.note.text")}
            shortcut="T"
            checked={Boolean(cursorBeat?.text)}
            onClick={() => setPrompt("text")}
          />
          <MenuSeparator />
          <MenuItem label={t("menu.note.clearEffects")} shortcut="Ctrl+Shift+X" onClick={clearEffects} />
        </MenuRoot>

        <MenuRoot
          id="bar"
          label={t("menu.bar.label")}
          disabled={state.readOnly}
          disabledReason={t("disabledReasons.readOnly")}
        >
          <MenuItem label={t("menu.edit.insertMeasure")} shortcut="Ctrl+Insert" onClick={insertMeasure} />
          <MenuItem label={t("menu.edit.duplicateMeasure")} shortcut="Ctrl+D" onClick={duplicateMeasure} />
          <MenuItem label={t("menu.edit.deleteMeasure")} shortcut="Ctrl+Delete" onClick={deleteMeasure} />
          <MenuSeparator />
          <MenuItem label={t("menu.bar.timeSignature")} shortcut="Ctrl+T" onClick={focusTimeSignature} />
          <MenuItem
            label={t("menu.bar.repeatOpen")}
            shortcut="["
            checked={Boolean(cursorMeasure?.repeatStart)}
            onClick={toggleRepeatStart}
          />
          <MenuItem
            label={t("menu.bar.repeatClose")}
            shortcut="]"
            checked={cursorMeasure?.repeatEnd !== undefined}
            onClick={toggleRepeatEnd}
          />
          <MenuItem
            label={t("menu.bar.section")}
            shortcut="Shift+Insert"
            checked={Boolean(cursorMeasure?.sectionLabel)}
            onClick={() => setPrompt("section")}
          />
          <MenuSeparator />
          <MenuItem label={t("menu.bar.goTo")} shortcut="Ctrl+G" onClick={() => setPrompt("gotoBar")} />
          <MenuItem label={t("menu.bar.firstBar")} shortcut="Ctrl+Home" onClick={() => gotoMeasure(0)} />
          <MenuItem
            label={t("menu.bar.lastBar")}
            shortcut="Ctrl+End"
            onClick={() => gotoMeasure(Number.MAX_SAFE_INTEGER)}
          />
          <MenuItem
            label={t("menu.bar.previousSection")}
            shortcut="Alt+←"
            onClick={() => dispatch({ type: "GOTO_SECTION", direction: "previous" })}
          />
          <MenuItem
            label={t("menu.bar.nextSection")}
            shortcut="Alt+→"
            onClick={() => dispatch({ type: "GOTO_SECTION", direction: "next" })}
          />
        </MenuRoot>

        <MenuRoot id="view" label={t("menu.view.label")}>
          <MenuItem
            label={t("menu.view.zoomIn")}
            shortcut="Ctrl++"
            onClick={() => setZoom((value) => Math.min(MAX_ZOOM, Math.round((value + ZOOM_STEP) * 100) / 100))}
            disabled={zoom >= MAX_ZOOM}
            disabledReason={t("disabledReasons.zoomIn")}
          />
          <MenuItem
            label={t("menu.view.zoomOut")}
            shortcut="Ctrl+-"
            onClick={() => setZoom((value) => Math.max(MIN_ZOOM, Math.round((value - ZOOM_STEP) * 100) / 100))}
            disabled={zoom <= MIN_ZOOM}
            disabledReason={t("disabledReasons.zoomOut")}
          />
          <MenuItem label={t("menu.view.resetZoom")} shortcut="Ctrl+0" onClick={() => setZoom(1)} />
          <MenuSeparator />
          <MenuItem
            label={t("menu.view.togglePreview")}
            shortcut="Ctrl+P"
            checked={showPreview}
            onClick={() => setShowPreview((value) => !value)}
          />
          <MenuItem
            label={t("menu.view.toggleFretboard")}
            shortcut="Ctrl+B"
            checked={showFretboard}
            onClick={() => setShowFretboard((value) => !value)}
          />
          <MenuItem
            label={t("menu.view.toggleChordPicker")}
            shortcut="Ctrl+K"
            checked={showChordPicker}
            onClick={() => setShowChordPicker((value) => !value)}
          />
          <MenuItem
            label={t("menu.view.toggleEffectPalette")}
            shortcut="Ctrl+J"
            checked={showEffectPalette}
            onClick={() => setShowEffectPalette((value) => !value)}
          />
          <MenuSeparator />
          <MenuSubmenu label={t("menu.view.measuresPerLine")}>
            <MenuItem
              label={t("exportPanel.auto")}
              checked={lineBreakMode.kind === "auto"}
              onClick={() => setLineBreakMode({ kind: "auto" })}
            />
            {MEASURES_PER_LINE_OPTIONS.map((n) => (
              <MenuItem
                key={n}
                label={String(n)}
                checked={lineBreakMode.kind === "fixed" && lineBreakMode.measuresPerLine === n}
                onClick={() => setLineBreakMode({ kind: "fixed", measuresPerLine: n })}
              />
            ))}
          </MenuSubmenu>
          <MenuSubmenu label={t("menu.view.theme")}>
            {(["light", "dark", "system"] as ThemeChoice[]).map((choice) => (
              <MenuItem
                key={choice}
                label={t(`theme.${choice}`)}
                checked={themeChoice === choice}
                onClick={() => setThemeChoiceState(choice)}
              />
            ))}
          </MenuSubmenu>
          <MenuSubmenu label={t("menu.view.language")}>
            {(["tr", "en"] as AppLanguage[]).map((lang) => (
              <MenuItem
                key={lang}
                label={t(`language.${lang}`)}
                checked={language === lang}
                onClick={() => setLanguage(lang)}
              />
            ))}
          </MenuSubmenu>
        </MenuRoot>

        <MenuRoot id="help" label={t("menu.help.label")}>
          <MenuItem label={t("menu.help.gettingStarted")} onClick={() => setModal("gettingStarted")} />
          <MenuItem label={t("menu.help.keyboardShortcuts")} shortcut="Ctrl+/" onClick={() => setModal("shortcuts")} />
          <MenuItem label={t("menu.help.notationGuide")} onClick={() => setModal("notationGuide")} />
          <MenuSeparator />
          <MenuItem label={t("menu.help.reportIssue")} disabled disabledReason={t("menu.help.notConfigured")} />
          <MenuItem label={t("menu.help.sourceCode")} disabled disabledReason={t("menu.help.notConfigured")} />
          <MenuSeparator />
          <MenuItem label={t("menu.help.checkUpdates")} disabled disabledReason={t("disabledReasons.notConfigured")} />
          <MenuItem label={t("menu.help.about")} onClick={() => setModal("about")} />
        </MenuRoot>
      </MenuBar>

      {state.lastError ? (
        <div className="border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700">
          {state.lastError === "READ_ONLY" ? t("errors.readOnlyBlocked") : state.lastError}
        </div>
      ) : null}

      {projectFile.error ? (
        <div className="border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700">
          {projectFile.error === "READ_ONLY_SAVE" ? t("errors.readOnlySave") : projectFile.error}
        </div>
      ) : null}

      {projectFile.versionWarning ? (
        <div className="border-2 border-amber-400 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
          {t("errors.versionNewer", { version: projectFile.versionWarning, current: CURRENT_PROJECT_VERSION })}
        </div>
      ) : null}

      {showTuningWarning ? (
        <div className="border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800">
          {t("tuningWarning")}
        </div>
      ) : null}

      {/* Section 17's read-only lock: dimming and disabling every editing surface here is the
          UI-level signal alongside the banner above; the actual enforcement is centralized in
          the reducer's withEdit() guard, so this wrapper is belt-and-suspenders, not the only
          line of defense — keyboard shortcuts and menu items are blocked independently too. */}
      <div
        className="shrink-0 flex flex-col gap-2.5"
        style={state.readOnly ? { opacity: 0.55, pointerEvents: "none" } : undefined}
        aria-disabled={state.readOnly}
      >
        <DurationSelector
          activeDuration={state.activeDuration}
          dotted={cursorBeat?.dotted ?? false}
          hasTuplet={Boolean(cursorBeat?.tuplet)}
          autoAdvance={state.autoAdvance}
          onSetDuration={setDuration}
          onToggleDotted={toggleDotted}
          onToggleTuplet={toggleTuplet}
          onToggleAutoAdvance={toggleAutoAdvance}
        />

        <div className="flex flex-wrap lg:flex-nowrap items-stretch gap-3">
          <div className="flex-1 min-w-0">
            <MeasureControls
              measureIndex={measureIndex}
              tempo={effectiveSettings.tempo}
              timeSignature={effectiveSettings.timeSignature}
              repeatStart={Boolean(cursorMeasure?.repeatStart)}
              repeatEnd={cursorMeasure?.repeatEnd}
              sectionLabel={cursorMeasure?.sectionLabel}
              onToggleRepeatStart={toggleRepeatStart}
              onToggleRepeatEnd={toggleRepeatEnd}
              onSetRepeatCount={setRepeatCount}
              onEditSection={() => setPrompt("section")}
              onInsertMeasure={insertMeasure}
              onDuplicateMeasure={duplicateMeasure}
              onDeleteMeasure={deleteMeasure}
              onTransposeUp={transposeUp}
              onTransposeDown={transposeDown}
              onSetTempo={setTempoFrom}
              onSetTimeSignature={setTimeSignatureFrom}
            />
          </div>
          <div className="shrink-0">
            <TuningCapoControls
              tuning={state.project.track.tuning}
              capo={state.project.track.capo}
              onSetTuning={setTuning}
              onSetTuningString={setTuningString}
              onSetCapo={setCapo}
            />
          </div>
        </div>
      </div>

      {/* Main Tab Canvas area with side-by-side ChordPicker on the left */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row items-stretch gap-3 overflow-hidden">
        {showChordPicker ? (
          <div className="shrink-0 flex flex-col py-3">
            <ChordPicker currentLabel={cursorBeat?.chordRef} onSelectChord={insertChord} onRenameLabel={setChordLabel} />
          </div>
        ) : null}

        <div className="flex-1 min-w-0 rounded-2xl p-3 w-full flex flex-col justify-stretch overflow-hidden relative" style={{ background: "var(--body)" }}>
          <div className="relative flex-1 min-h-0 w-full rounded-xl overflow-hidden tab-screen">
            <div
              ref={tabScrollContainerRef}
              className="w-full h-full flex flex-col justify-center items-start pl-3.5 sm:pl-4 py-1 pr-4 overflow-x-auto overflow-y-hidden tab-scrollbar"
            >
              <div
                style={{
                  width: `${(tabLayout.width + 70) * zoom}px`,
                  transform: `scale(${zoom})`,
                  transformOrigin: "left center",
                }}
                className="my-auto relative group flex items-center shrink-0"
              >
                <TabCanvas
                  project={state.project}
                  visual={{ cursor: state.cursor, selectionRange, pendingDigit: state.pendingDigit }}
                  onCellClick={clickCell}
                  onCellHover={setHoveredFlatIndex}
                  onDeleteMeasure={deleteMeasure}
                />
                <button
                  type="button"
                  onClick={insertMeasure}
                  title={t("measureControls.insertMeasure", "Ölçü Ekle")}
                  className="raised ml-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg font-bold opacity-0 transition-all duration-200 group-hover:opacity-100 hover:scale-110 active:scale-95"
                  style={{ color: "var(--control-text)" }}
                >
                  +
                </button>
              </div>
            </div>
            {/* Persistent Inset Shadow Rim - always on top of canvas, never buried */}
            <div className="pointer-events-none absolute inset-0 rounded-xl tab-screen-rim z-20" />
          </div>
          <NeumorphicScrollbar scrollRef={tabScrollContainerRef} />
        </div>
      </div>

      <div
        className="shrink-0 flex flex-col gap-2.5 w-full"
        style={state.readOnly ? { opacity: 0.55, pointerEvents: "none" } : undefined}
        aria-disabled={state.readOnly}
      >
        {showEffectPalette ? (
          <EffectPalette
            note={cursorNote}
            beat={cursorBeat}
            onApplyBend={applyBend}
            onApplySlide={applySlide}
            onApplyVibrato={applyVibrato}
            onToggleHammer={toggleHammer}
            onToggleDead={toggleDead}
            onToggleGhost={toggleGhost}
            onTogglePalmMute={togglePalmMute}
            onToggleLetRing={toggleLetRing}
            onToggleTie={toggleTie}
            onToggleHarmonic={toggleHarmonic}
            onToggleBeatMark={toggleBeatMark}
            onToggleAccent={toggleAccent}
            onTogglePickStroke={togglePickStroke}
            onEditText={() => setPrompt("text")}
            onClearEffects={clearEffects}
          />
        ) : null}
        {showFretboard ? (
          <GuitarFretboard
            tuning={state.project.track.tuning}
            activeString={state.cursor.string}
            onFretClick={clickFret}
          />
        ) : null}
      </div>

      {modal === "exportPng" ? (
        <ExportModal
          project={state.project}
          lineBreakMode={lineBreakMode}
          onLineBreakModeChange={setLineBreakMode}
          onClose={() => setModal(null)}
        />
      ) : null}
      {prompt === "section" ? (
        <PromptModal
          title={t("prompt.sectionTitle")}
          label={t("prompt.sectionLabel")}
          placeholder={t("prompt.sectionPlaceholder")}
          initialValue={cursorMeasure?.sectionLabel ?? ""}
          removeLabel={t("prompt.remove")}
          onSubmit={setSectionLabel}
          onClose={() => setPrompt(null)}
        />
      ) : null}
      {prompt === "text" ? (
        <PromptModal
          title={t("prompt.textTitle")}
          label={t("prompt.textLabel")}
          initialValue={cursorBeat?.text ?? ""}
          removeLabel={t("prompt.remove")}
          onSubmit={setBeatText}
          onClose={() => setPrompt(null)}
        />
      ) : null}
      {prompt === "gotoBar" ? (
        <PromptModal
          title={t("prompt.gotoTitle")}
          label={t("prompt.gotoLabel", { count: state.project.track.measures.length })}
          inputType="number"
          initialValue={String(measureIndex + 1)}
          onSubmit={(value) => {
            const bar = parseInt(value, 10);
            if (!isNaN(bar)) gotoMeasure(bar - 1);
          }}
          onClose={() => setPrompt(null)}
        />
      ) : null}
      {modal === "shortcuts" ? <ShortcutsModal onClose={() => setModal(null)} /> : null}
      {modal === "projectSettings" ? (
        <ProjectSettingsModal
          project={state.project}
          onClose={() => setModal(null)}
          onSetTitle={setTitle}
          onSetArtist={setArtist}
          onSetDefaultTempo={setDefaultTempo}
          onSetDefaultTimeSignature={setDefaultTimeSignature}
          onSetTuningString={setTuningString}
          onSetCapo={setCapo}
        />
      ) : null}
      {modal === "preferences" ? (
        <PreferencesModal
          onClose={() => setModal(null)}
          theme={themeChoice}
          onSetTheme={setThemeChoiceState}
          language={language}
          onSetLanguage={setLanguage}
        />
      ) : null}
      {modal === "about" ? <AboutModal onClose={() => setModal(null)} /> : null}
      {modal === "gettingStarted" ? (
        <InfoModal title={t("gettingStarted.title")} body={t("gettingStarted.body")} onClose={() => setModal(null)} />
      ) : null}
      {modal === "notationGuide" ? (
        <InfoModal title={t("notationGuide.title")} body={t("notationGuide.body")} onClose={() => setModal(null)} />
      ) : null}

      {showTour ? <TourOverlay onFinish={finishTour} /> : null}
    </main>
  );
}

export default App;
