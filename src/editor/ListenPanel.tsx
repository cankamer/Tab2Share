import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { useTranslation } from "react-i18next";
import type { Beat } from "../model/types";
import { openStringMidi } from "../render/drawNotation";
import { ListenSession, listInputDevices, type InputDevice } from "../transcribe/session";
import { buildMeasures, placeNotes } from "../transcribe/tabbing";
import type { TrackerFrame, TrackerOptions } from "../transcribe/tracker";
import { SkeuButton } from "./ui/SkeuButton";
import { Toggle } from "./ui/Toggle";
import { Icon } from "./ui/Icons";

export interface RecordingDraft {
  startMeasure: number;
  measures: Beat[][];
}

interface ListenPanelProps {
  tuning: string[];
  capo: number;
  /** Tempo and time signature at the cursor's measure — what the written tab will be counted in. */
  tempo: number;
  timeSignature: { num: number; den: number };
  startMeasure: number;
  onDraft: (draft: RecordingDraft | null) => void;
  onCommit: (startMeasure: number, measures: Beat[][]) => void;
  onApplyTuning: (tuning: string[]) => void;
  onRecordingChange: (active: boolean) => void;
  /** Lets the app's Space shortcut end a take. */
  stopRef: MutableRefObject<(() => void) | null>;
  onClose: () => void;
}

const CALIBRATION_KEY = "tab2share-listen-calibration";
const DEVICE_KEY = "tab2share-input-device";
const GAIN_KEY = "tab2share-input-gain-db";
const MAX_GAIN_DB = 40;
/** The audio path (interface buffer + analysis window) runs this far behind the player's hands. */
const LATENCY_SECONDS = 0.035;
const SPEEDS = [50, 60, 70, 80, 90, 100];

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

function noteLabel(midi: number): string {
  const rounded = Math.round(midi);
  const cents = Math.round((midi - rounded) * 100);
  return `${SHARP_NAMES[((rounded % 12) + 12) % 12]}${Math.floor(rounded / 12) - 1} ${cents >= 0 ? "+" : ""}${cents}¢`;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

interface Calibration {
  /** Noise gate as it would read with the input gain at 0 dB; the live gate is this times the gain. */
  gate: number;
  offsetCents: number;
}

const dbToLinear = (db: number) => Math.pow(10, db / 20);

function loadCalibration(): Calibration {
  try {
    const stored = JSON.parse(localStorage.getItem(CALIBRATION_KEY) ?? "null");
    if (stored && typeof stored.gate === "number" && typeof stored.offsetCents === "number") return stored;
  } catch {
    // fall through to defaults
  }
  return { gate: 0.004, offsetCents: 0 };
}

type Mode = "idle" | "noise" | "strings" | "autoLevel" | "countIn" | "recording";

/**
 * Listen mode: pick an input, (optionally) introduce the guitar by playing the open strings, then
 * record — the tab is written live into the editor and committed as one undoable edit when the
 * take ends. A slowed-down click helps while learning a part; the written tab keeps the song's own tempo.
 */
export function ListenPanel({
  tuning,
  capo,
  tempo,
  timeSignature,
  startMeasure,
  onDraft,
  onCommit,
  onApplyTuning,
  onRecordingChange,
  stopRef,
  onClose,
}: ListenPanelProps) {
  const { t } = useTranslation();
  const [devices, setDevices] = useState<InputDevice[]>([]);
  const [deviceId, setDeviceId] = useState(() => {
    try {
      return localStorage.getItem(DEVICE_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [status, setStatus] = useState<"off" | "opening" | "on">("off");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const [readout, setReadout] = useState<{ rms: number; midi: number | null; frequency: number | null }>({
    rms: 0,
    midi: null,
    frequency: null,
  });
  const [calibration, setCalibration] = useState<Calibration>(loadCalibration);
  const [gainDb, setGainDb] = useState(() => {
    try {
      const stored = Number(localStorage.getItem(GAIN_KEY));
      return Number.isFinite(stored) ? Math.max(0, Math.min(MAX_GAIN_DB, stored)) : 0;
    } catch {
      return 0;
    }
  });
  const [calibStep, setCalibStep] = useState(0);
  const [measured, setMeasured] = useState<(number | null)[]>([]);
  const [detectedTuning, setDetectedTuning] = useState<string[] | null>(null);
  const [speed, setSpeed] = useState(100);
  const [metronome, setMetronome] = useState(true);
  const [countIn, setCountIn] = useState(1);
  const [lockedString, setLockedString] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [recentPeak, setRecentPeak] = useState(0);

  const sessionRef = useRef<ListenSession | null>(null);
  const frameRef = useRef<TrackerFrame | null>(null);
  const modeRef = useRef<Mode>("idle");
  const gainDbRef = useRef(gainDb);
  gainDbRef.current = gainDb;
  /** What the tracker actually uses: the gate is measured before the gain stage, the audio it sees is after it. */
  const optionsRef = useRef<TrackerOptions>({
    gate: calibration.gate * dbToLinear(gainDb),
    offsetCents: calibration.offsetCents,
  });
  const autoLevelRef = useRef<number[]>([]);
  const recentLevelsRef = useRef<number[]>([]);
  const calibRef = useRef({ noise: [] as number[], held: [] as number[], waitSilence: false, step: 0, measured: [] as (number | null)[] });
  const takeTimerRef = useRef<number | null>(null);
  const settingsRef = useRef({ tempo, timeSignature, startMeasure, tuning, capo, speed, metronome, countIn, lockedString });
  settingsRef.current = { tempo, timeSignature, startMeasure, tuning, capo, speed, metronome, countIn, lockedString };
  const calibrationRef = useRef(calibration);
  calibrationRef.current = calibration;
  const callbacksRef = useRef({ onDraft, onCommit, onRecordingChange });
  callbacksRef.current = { onDraft, onCommit, onRecordingChange };

  const switchMode = useCallback((next: Mode) => {
    modeRef.current = next;
    setMode(next);
  }, []);

  const openStrings = useCallback(() => openStringMidi(settingsRef.current.tuning), []);

  // ---- calibration: the guitar introduces itself string by string ---------------------------------------
  const finishCalibration = useCallback(
    (results: (number | null)[]) => {
      const played = results.filter((value): value is number => value !== null);
      const noise = calibRef.current.noise;
      const gate = Math.max(0.0008, ((noise.length ? median(noise) : 0.001) * 4) / dbToLinear(gainDbRef.current));
      const deviations = played.map((midi) => (midi - Math.round(midi)) * 100);
      const offsetCents = deviations.length ? deviations.reduce((sum, value) => sum + value, 0) / deviations.length : 0;
      const next = { gate, offsetCents: Math.round(offsetCents * 10) / 10 };
      setCalibration(next);
      optionsRef.current = { gate: next.gate * dbToLinear(gainDbRef.current), offsetCents: next.offsetCents };
      sessionRef.current?.setOptions(optionsRef.current);
      try {
        localStorage.setItem(CALIBRATION_KEY, JSON.stringify(next));
      } catch {
        // Per-viewer convenience only.
      }

      // Which tuning did the guitar actually turn out to be in?
      const expected = openStrings();
      if (played.length === 6) {
        const names = results.map((midi) => FLAT_NAMES[(((Math.round(midi as number) % 12) + 12) % 12)]);
        const differs = results.some((midi, index) => Math.round(midi as number) !== expected[index]);
        setDetectedTuning(differs ? names : null);
      }
      switchMode("idle");
    },
    [openStrings, switchMode],
  );

  const advanceCalibration = useCallback(
    (midi: number | null) => {
      const calib = calibRef.current;
      calib.measured[calib.step] = midi;
      setMeasured([...calib.measured]);
      calib.step += 1;
      calib.held = [];
      calib.waitSilence = true;
      setCalibStep(calib.step);
      if (calib.step >= 6) finishCalibration(calib.measured);
    },
    [finishCalibration],
  );

  const onFrame = useCallback(
    (frame: TrackerFrame) => {
      frameRef.current = frame;
      const calib = calibRef.current;
      if (modeRef.current === "autoLevel") autoLevelRef.current.push(frame.rms);
      if (modeRef.current === "noise") {
        calib.noise.push(frame.rms);
      } else if (modeRef.current === "strings") {
        const { gate } = optionsRef.current;
        if (frame.rms < gate) {
          calib.held = [];
          calib.waitSilence = false;
        } else if (!calib.waitSilence && frame.midi !== null) {
          // The string being introduced: low E first. Anything within ~2.5 semitones counts, so a
          // guitar in a different tuning is recognised instead of rejected.
          const target = openStrings()[calib.step];
          if (Math.abs(frame.midi - target) <= 2.5) {
            calib.held.push(frame.midi);
            if (calib.held.length > 10) calib.held.shift();
            if (calib.held.length >= 8 && Math.max(...calib.held) - Math.min(...calib.held) < 0.3) {
              advanceCalibration(median(calib.held));
            }
          } else {
            calib.held = [];
          }
        }
      }
    },
    [advanceCalibration, openStrings],
  );

  const startCalibration = () => {
    calibRef.current = { noise: [], held: [], waitSilence: false, step: 0, measured: [] };
    setMeasured([]);
    setCalibStep(0);
    setDetectedTuning(null);
    switchMode("noise");
    // 1.5 s of silence measures the room/interface noise floor, then the strings follow.
    window.setTimeout(() => {
      if (modeRef.current !== "noise") return;
      const noise = calibRef.current.noise;
      const gate = Math.max(0.0008 * dbToLinear(gainDbRef.current), (noise.length ? median(noise) : 0.001) * 4);
      optionsRef.current = { ...optionsRef.current, gate };
      sessionRef.current?.setOptions(optionsRef.current);
      switchMode("strings");
    }, 1500);
  };

  const applyGain = useCallback((db: number) => {
    const clamped = Math.max(0, Math.min(MAX_GAIN_DB, Math.round(db)));
    setGainDb(clamped);
    gainDbRef.current = clamped;
    sessionRef.current?.setGain(clamped);
    // Keep the gate where it was relative to the (un-boosted) signal.
    optionsRef.current = { ...optionsRef.current, gate: calibrationRef.current.gate * dbToLinear(clamped) };
    sessionRef.current?.setOptions(optionsRef.current);
    try {
      localStorage.setItem(GAIN_KEY, String(clamped));
    } catch {
      // Per-viewer convenience only.
    }
  }, []);

  /** Listens for a few seconds of loud playing and sets the gain so the peaks land around -18 dBFS. */
  const startAutoLevel = () => {
    autoLevelRef.current = [];
    switchMode("autoLevel");
    window.setTimeout(() => {
      if (modeRef.current !== "autoLevel") return;
      const levels = [...autoLevelRef.current].sort((a, b) => a - b);
      const peak = levels.length ? levels[Math.floor(levels.length * 0.97)] : 0;
      const preGainPeak = peak / dbToLinear(gainDbRef.current);
      if (preGainPeak > 1e-5) applyGain(20 * Math.log10(0.125 / preGainPeak));
      switchMode("idle");
    }, 3500);
  };

  // ---- session lifecycle ----------------------------------------------------------------------------
  const startListening = async () => {
    setError(null);
    setStatus("opening");
    try {
      const list = await listInputDevices();
      setDevices(list);
      const chosen = list.find((device) => device.id === deviceId)?.id ?? list[0]?.id ?? "";
      setDeviceId(chosen);
      sessionRef.current?.close();
      sessionRef.current = await ListenSession.open(chosen || undefined, optionsRef.current, onFrame, gainDbRef.current);
      try {
        localStorage.setItem(DEVICE_KEY, chosen);
      } catch {
        // Per-viewer convenience only.
      }
      setStatus("on");
    } catch (failure) {
      setStatus("off");
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  const stopListening = useCallback(() => {
    if (takeTimerRef.current !== null) window.clearInterval(takeTimerRef.current);
    takeTimerRef.current = null;
    sessionRef.current?.close();
    sessionRef.current = null;
    callbacksRef.current.onDraft(null);
    callbacksRef.current.onRecordingChange(false);
    switchMode("idle");
    setStatus("off");
  }, [switchMode]);

  useEffect(() => () => stopListening(), [stopListening]);

  // UI meter: copy the latest frame into state a few times a second instead of on every audio frame.
  useEffect(() => {
    if (status !== "on") return;
    const timer = window.setInterval(() => {
      const frame = frameRef.current;
      if (!frame) return;
      setReadout({ rms: frame.rms, midi: frame.midi, frequency: frame.frequency });
      // Loudest reading over roughly the last three seconds: notes decay between plucks, so one quiet
      // moment says nothing about whether the input is too low.
      const window3s = recentLevelsRef.current;
      window3s.push(frame.rms);
      if (window3s.length > 38) window3s.shift();
      setRecentPeak(Math.max(...window3s));
    }, 80);
    return () => window.clearInterval(timer);
  }, [status]);

  // ---- recording --------------------------------------------------------------------------------------
  const draftNow = useCallback(
    (final: boolean) => {
      const session = sessionRef.current;
      if (!session) return null;
      const s = settingsRef.current;
      const notes = final ? session.stopRecording() : session.snapshot();
      const placed = placeNotes(notes, openStringMidi(s.tuning), s.capo, s.lockedString || null);
      const bpm = Math.max(20, Math.round((s.tempo * s.speed) / 100));
      return buildMeasures(placed, { bpm, timeSignature: s.timeSignature, latency: LATENCY_SECONDS });
    },
    [],
  );

  const finishTake = useCallback(
    (commit: boolean) => {
      if (takeTimerRef.current !== null) window.clearInterval(takeTimerRef.current);
      takeTimerRef.current = null;
      const session = sessionRef.current;
      if (commit) {
        const measures = draftNow(true);
        if (measures && measures.length > 0) callbacksRef.current.onCommit(settingsRef.current.startMeasure, measures);
      } else {
        session?.cancelRecording();
      }
      callbacksRef.current.onDraft(null);
      callbacksRef.current.onRecordingChange(false);
      switchMode("idle");
    },
    [draftNow, switchMode],
  );

  stopRef.current = modeRef.current === "countIn" || modeRef.current === "recording" ? () => finishTake(true) : null;

  const startTake = () => {
    const session = sessionRef.current;
    if (!session) return;
    const s = settingsRef.current;
    const bpm = Math.max(20, Math.round((s.tempo * s.speed) / 100));
    const beatsPerBar = Math.max(1, Math.round((s.timeSignature.num * 4) / s.timeSignature.den));
    session.startRecording({ bpm, beatsPerBar, countInBars: s.countIn, metronome: s.metronome });
    switchMode("countIn");
    callbacksRef.current.onRecordingChange(true);

    takeTimerRef.current = window.setInterval(() => {
      const time = session.recordingTime;
      if (time === null) return;
      if (time < 0) {
        setCountdown(Math.ceil((-time * bpm) / 60));
        return;
      }
      if (modeRef.current === "countIn") switchMode("recording");
      const measures = draftNow(false);
      callbacksRef.current.onDraft(
        measures && measures.length > 0 ? { startMeasure: s.startMeasure, measures } : null,
      );
    }, 150);
  };

  const listening = status === "on";
  const busy = mode === "countIn" || mode === "recording";
  const recBpm = Math.max(20, Math.round((tempo * speed) / 100));
  const levelPercent = Math.max(0, Math.min(100, ((20 * Math.log10(readout.rms + 1e-6) + 60) / 60) * 100));
  const liveGate = calibration.gate * dbToLinear(gainDb);
  const gatePercent = Math.max(0, Math.min(100, ((20 * Math.log10(liveGate) + 60) / 60) * 100));
  const levelDb = Math.round(20 * Math.log10(readout.rms + 1e-6));
  // Signal is present but never reaches the gate: say so instead of silently missing notes.
  const tooQuiet = listening && mode === "idle" && recentPeak < liveGate && recentPeak > liveGate * 0.2;
  const stringNames = [6, 5, 4, 3, 2, 1].map((string) => tuning[6 - string]);

  const selectClass = "inset rounded-lg px-2 py-1 text-xs";
  const selectStyle = { color: "var(--control-text)", border: "1px solid transparent", background: "var(--body)" };

  return (
    <div className="raised flex w-full flex-col gap-2.5 rounded-2xl p-3 text-xs" style={{ color: "var(--control-text)" }}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-1.5 font-bold" style={{ color: listening ? "var(--accent)" : "var(--label)" }}>
          <Icon name="mic" size={18} />
          {t("listen.title")}
        </span>

        {!listening ? (
          <SkeuButton onClick={startListening} disabled={status === "opening"} className="text-xs">
            {status === "opening" ? t("listen.opening") : t("listen.start")}
          </SkeuButton>
        ) : (
          <>
            <select
              value={deviceId}
              disabled={busy}
              onChange={(event) => {
                setDeviceId(event.target.value);
                void (async () => {
                  sessionRef.current?.close();
                  try {
                    sessionRef.current = await ListenSession.open(event.target.value || undefined, optionsRef.current, onFrame, gainDbRef.current);
                    localStorage.setItem(DEVICE_KEY, event.target.value);
                  } catch (failure) {
                    setError(failure instanceof Error ? failure.message : String(failure));
                    setStatus("off");
                  }
                })();
              }}
              className={selectClass}
              style={selectStyle}
              aria-label={t("listen.device")}
            >
              {devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.label}
                </option>
              ))}
            </select>

            {/* Level meter with the noise gate marked */}
            <div className="inset relative h-3 w-40 overflow-hidden rounded-full" title={t("listen.level")}>
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${levelPercent}%`, background: readout.rms > calibration.gate ? "var(--accent)" : "var(--label)", opacity: 0.8 }}
              />
              <div className="absolute inset-y-0 w-px" style={{ left: `${gatePercent}%`, background: "var(--control-text)", opacity: 0.6 }} />
            </div>

            <span className="font-mono" style={{ color: "var(--label)" }}>
              {levelDb} dB
            </span>

            <span className="inset min-w-[8.5rem] rounded-lg px-2 py-1 text-center font-mono" style={{ color: "var(--accent)" }}>
              {readout.midi !== null && readout.frequency !== null
                ? `${noteLabel(readout.midi)} · ${readout.frequency.toFixed(0)} Hz`
                : "—"}
            </span>

            <SkeuButton onClick={stopListening} disabled={busy} className="text-xs">
              {t("listen.stop")}
            </SkeuButton>
          </>
        )}

        <SkeuButton onClick={onClose} disabled={busy} className="ml-auto text-xs" title={t("listen.close")}>
          ✕
        </SkeuButton>
      </div>

      {error ? <div className="text-red-500">{t("listen.error", { message: error })}</div> : null}

      {listening ? (
        <>
          {/* Input level */}
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2">
              <span style={{ color: "var(--label)" }}>{t("listen.gain")}</span>
              <input
                type="range"
                min={0}
                max={MAX_GAIN_DB}
                step={1}
                value={gainDb}
                disabled={busy}
                onChange={(event) => applyGain(Number(event.target.value))}
                className="w-40 cursor-pointer"
                style={{ accentColor: "var(--accent)" }}
                aria-label={t("listen.gain")}
              />
              <span className="w-12 font-mono">+{gainDb} dB</span>
            </label>
            <SkeuButton onClick={startAutoLevel} disabled={busy || mode !== "idle"} className="text-xs" title={t("listen.autoLevelHint")}>
              {t("listen.autoLevel")}
            </SkeuButton>
            {mode === "autoLevel" ? <span style={{ color: "var(--accent)" }}>{t("listen.autoLevelPlaying")}</span> : null}
            {tooQuiet ? <span style={{ color: "var(--accent)" }}>{t("listen.tooQuiet")}</span> : null}
          </div>

          {/* Introduce the guitar */}
          <div className="flex flex-wrap items-center gap-3">
            <SkeuButton onClick={startCalibration} disabled={busy || mode !== "idle"} className="text-xs">
              {t("listen.calibrate")}
            </SkeuButton>

            {mode === "noise" ? <span style={{ color: "var(--label)" }}>{t("listen.calibNoise")}</span> : null}
            {mode === "strings" ? (
              <>
                <span style={{ color: "var(--accent)" }}>
                  {t("listen.calibString", { string: 6 - calibStep, note: stringNames[calibStep] })}
                </span>
                <SkeuButton onClick={() => advanceCalibration(null)} className="text-xs">
                  {t("listen.skip")}
                </SkeuButton>
              </>
            ) : null}

            <div className="flex items-center gap-1.5">
              {stringNames.map((name, index) => {
                const value = measured[index];
                const done = value !== undefined && value !== null;
                return (
                  <span
                    key={index}
                    className={`${done ? "inset" : "raised"} rounded-lg px-2 py-1 font-mono`}
                    style={{
                      border: mode === "strings" && calibStep === index ? "1.5px solid var(--accent)" : "1px solid transparent",
                      color: done ? "var(--control-text)" : "var(--label)",
                    }}
                    title={done ? noteLabel(value as number) : undefined}
                  >
                    {name}
                    {done ? ` ${Math.round(((value as number) - Math.round(value as number)) * 100) >= 0 ? "+" : ""}${Math.round(((value as number) - Math.round(value as number)) * 100)}¢` : ""}
                  </span>
                );
              })}
            </div>

            <span style={{ color: "var(--label)" }}>
              {t("listen.calibrationSummary", { offset: calibration.offsetCents, gate: Math.round(20 * Math.log10(liveGate)) })}
            </span>

            {detectedTuning ? (
              <span className="flex items-center gap-2" style={{ color: "var(--accent)" }}>
                {t("listen.detectedTuning", { tuning: detectedTuning.join(" ") })}
                <SkeuButton
                  onClick={() => {
                    onApplyTuning(detectedTuning);
                    setDetectedTuning(null);
                  }}
                  className="text-xs"
                >
                  {t("listen.applyTuning")}
                </SkeuButton>
              </span>
            ) : null}
          </div>

          {/* Take settings + record */}
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5">
              <span style={{ color: "var(--label)" }}>{t("listen.speed")}</span>
              <select value={speed} disabled={busy} onChange={(event) => setSpeed(Number(event.target.value))} className={selectClass} style={selectStyle}>
                {SPEEDS.map((value) => (
                  <option key={value} value={value}>
                    {value}%
                  </option>
                ))}
              </select>
              <span className="font-mono" style={{ color: "var(--label)" }}>
                {recBpm} BPM
              </span>
            </label>

            <Toggle checked={metronome} onChange={setMetronome} label={t("listen.metronome")} />

            <label className="flex items-center gap-1.5">
              <span style={{ color: "var(--label)" }}>{t("listen.countIn")}</span>
              <select value={countIn} disabled={busy} onChange={(event) => setCountIn(Number(event.target.value))} className={selectClass} style={selectStyle}>
                {[0, 1, 2].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-1.5">
              <span style={{ color: "var(--label)" }}>{t("listen.string")}</span>
              <select value={lockedString} disabled={busy} onChange={(event) => setLockedString(Number(event.target.value))} className={selectClass} style={selectStyle}>
                <option value={0}>{t("listen.auto")}</option>
                {[1, 2, 3, 4, 5, 6].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>

            <span style={{ color: "var(--label)" }}>{t("listen.fromMeasure", { n: startMeasure + 1 })}</span>

            {busy ? (
              <>
                <span className="font-bold" style={{ color: "var(--accent)" }}>
                  {mode === "countIn" ? t("listen.countingIn", { n: countdown }) : t("listen.recording")}
                </span>
                <SkeuButton active onClick={() => finishTake(true)} className="flex items-center gap-1.5 text-xs">
                  <Icon name="stop" size={14} />
                  {t("listen.finish")}
                </SkeuButton>
                <SkeuButton onClick={() => finishTake(false)} className="text-xs">
                  {t("listen.discard")}
                </SkeuButton>
              </>
            ) : (
              <SkeuButton onClick={startTake} disabled={mode !== "idle"} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--accent)" }}>
                <Icon name="record" size={14} />
                {t("listen.record")}
              </SkeuButton>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
