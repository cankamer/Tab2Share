import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { SkeuButton } from "./ui/SkeuButton";
import { SkeuInput } from "./ui/SkeuInput";
import { Knob } from "./ui/Knob";

interface MeasureControlsProps {
  measureIndex: number;
  tempo: number;
  timeSignature: { num: number; den: number };
  repeatStart: boolean;
  repeatEnd: number | undefined;
  sectionLabel: string | undefined;
  onToggleRepeatStart: () => void;
  onToggleRepeatEnd: () => void;
  onSetRepeatCount: (count: number) => void;
  onEditSection: () => void;
  onInsertMeasure: () => void;
  onDuplicateMeasure: () => void;
  onDeleteMeasure: () => void;
  onTransposeUp: () => void;
  onTransposeDown: () => void;
  onSetTempo: (tempo: number) => void;
  onSetTimeSignature: (num: number, den: number) => void;
}

const MIN_TEMPO = 0;
const MAX_TEMPO = 240;

/**
 * Temporary control surface for section 9.4's measure operations and transpose — section 9's
 * layout diagram keeps this as the permanent top bar; step 12's Edit menu adds a second,
 * discoverable entry point to the same actions rather than replacing this one.
 */
export function MeasureControls({
  measureIndex,
  tempo,
  timeSignature,
  repeatStart,
  repeatEnd,
  sectionLabel,
  onToggleRepeatStart,
  onToggleRepeatEnd,
  onSetRepeatCount,
  onEditSection,
  onInsertMeasure,
  onDuplicateMeasure,
  onDeleteMeasure,
  onTransposeUp,
  onTransposeDown,
  onSetTempo,
  onSetTimeSignature,
}: MeasureControlsProps) {
  const { t } = useTranslation();

  const [localTempo, setLocalTempo] = useState(tempo.toString());
  const [localNum, setLocalNum] = useState(timeSignature.num.toString());
  const [localDen, setLocalDen] = useState(timeSignature.den.toString());

  useEffect(() => {
    setLocalTempo(tempo.toString());
  }, [tempo]);

  useEffect(() => {
    setLocalNum(timeSignature.num.toString());
    setLocalDen(timeSignature.den.toString());
  }, [timeSignature.num, timeSignature.den]);

  const handleTimeSigChange = (newNumStr: string, newDenStr: string) => {
    setLocalNum(newNumStr);
    setLocalDen(newDenStr);
    const n = parseInt(newNumStr, 10);
    const d = parseInt(newDenStr, 10);
    if (!isNaN(n) && n >= 1 && n <= 32 && !isNaN(d) && d >= 1 && d <= 32) {
      onSetTimeSignature(n, d);
    }
  };

  return (
    <div
      key={measureIndex}
      className="raised flex flex-wrap items-center gap-3.5 sm:gap-4 rounded-2xl p-3 text-xs"
    >
      {/* Measure Badge */}
      <div className="flex flex-col gap-1 pr-2.5 border-r border-[var(--shadow-dark)]/15 shrink-0">
        <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--label)]/70">
          {t("measureControls.measureTitle", "Measure")}
        </span>
        <div className="inset flex h-7 items-center justify-center rounded-lg px-2.5 font-mono text-xs font-bold text-[var(--accent)] tracking-wider">
          #{measureIndex + 1}
        </div>
      </div>

      {/* Actions Group */}
      <div className="flex flex-col gap-1 shrink-0">
        <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--label)]/70">
          {t("measureControls.actions", "Actions")}
        </span>
        <div className="flex items-center gap-1.5 h-7">
          <SkeuButton
            title="Ctrl+M"
            onClick={onInsertMeasure}
            className="h-7 px-2.5 text-xs font-medium !py-0 flex items-center justify-center"
          >
            {t("measureControls.insertMeasure")}
          </SkeuButton>
          <SkeuButton
            title="Ctrl+D"
            onClick={onDuplicateMeasure}
            className="h-7 px-2.5 text-xs font-medium !py-0 flex items-center justify-center"
          >
            {t("measureControls.duplicateMeasure")}
          </SkeuButton>
          <SkeuButton
            title="Ctrl+Shift+M"
            onClick={onDeleteMeasure}
            className="h-7 px-2.5 text-xs font-medium !py-0 flex items-center justify-center text-red-400 hover:text-red-300"
          >
            {t("measureControls.deleteMeasure")}
          </SkeuButton>
        </div>
      </div>

      {/* Divider */}
      <div className="hidden sm:block h-6 w-px bg-[var(--shadow-dark)]/15 self-end mb-0.5 shrink-0" />

      {/* Transpose Group */}
      <div className="flex flex-col gap-1 shrink-0">
        <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--label)]/70">
          {t("measureControls.transposeGroup", "Transpose")}
        </span>
        <div className="flex items-center gap-1.5 h-7">
          <SkeuButton
            title={`${t("measureControls.transposeUp")} (Ctrl+Up)`}
            onClick={onTransposeUp}
            className="h-7 px-2.5 font-mono text-xs font-bold !py-0 flex items-center justify-center"
          >
            +1
          </SkeuButton>
          <SkeuButton
            title={`${t("measureControls.transposeDown")} (Ctrl+Down)`}
            onClick={onTransposeDown}
            className="h-7 px-2.5 font-mono text-xs font-bold !py-0 flex items-center justify-center"
          >
            -1
          </SkeuButton>
        </div>
      </div>

      {/* Divider */}
      <div className="hidden sm:block h-6 w-px bg-[var(--shadow-dark)]/15 self-end mb-0.5 shrink-0" />

      {/* Tempo Group */}
      <div className="flex flex-col gap-1 shrink-0">
        <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--label)]/70">
          {t("measureControls.tempoGroup", "Tempo")}
        </span>
        <div className="flex items-center gap-2 h-7">
          <Knob
            value={tempo}
            min={MIN_TEMPO}
            max={MAX_TEMPO}
            size={28}
            showMinMax={false}
            title={`Tempo: ${tempo} BPM (${MIN_TEMPO}-${MAX_TEMPO})`}
            onChange={onSetTempo}
          />
          <div className="flex items-center gap-1">
            <SkeuInput
              type="number"
              min={1}
              max={999}
              value={localTempo}
              onChange={(e) => {
                setLocalTempo(e.target.value);
                const value = parseInt(e.target.value, 10);
                if (!isNaN(value) && value >= MIN_TEMPO && value <= MAX_TEMPO) {
                  onSetTempo(value);
                }
              }}
              onBlur={() => {
                setLocalTempo(tempo.toString());
              }}
              className="h-7 w-14 text-center font-mono text-xs !py-0"
            />
            <span className="text-[10px] font-semibold text-[var(--label)]/80">BPM</span>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="hidden sm:block h-6 w-px bg-[var(--shadow-dark)]/15 self-end mb-0.5 shrink-0" />

      {/* Time Signature Group */}
      <div className="flex flex-col gap-1 shrink-0">
        <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--label)]/70">
          {t("measureControls.timeSigGroup", "Time Sig")}
        </span>
        <div className="flex items-center gap-1.5 h-7 text-[var(--label)] font-bold">
          <SkeuInput
            type="number"
            min={1}
            max={32}
            value={localNum}
            onChange={(e) => handleTimeSigChange(e.target.value, localDen)}
            onBlur={() => {
              setLocalNum(timeSignature.num.toString());
            }}
            id="time-signature-num"
            title="Ctrl+T"
            className="h-7 w-10 text-center font-mono text-xs !py-0"
          />
          <span className="text-xs text-[var(--label)]/80">/</span>
          <SkeuInput
            type="number"
            min={1}
            max={32}
            value={localDen}
            onChange={(e) => handleTimeSigChange(localNum, e.target.value)}
            onBlur={() => {
              setLocalDen(timeSignature.den.toString());
            }}
            className="h-7 w-10 text-center font-mono text-xs !py-0"
          />
        </div>
      </div>

      {/* Divider */}
      <div className="hidden sm:block h-6 w-px bg-[var(--shadow-dark)]/15 self-end mb-0.5 shrink-0" />

      {/* Repeat + Section Group (Guitar Pro: [ ] and Shift+Insert) */}
      <div className="flex flex-col gap-1 shrink-0">
        <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--label)]/70">
          {t("measureControls.repeatGroup", "Repeat")}
        </span>
        <div className="flex items-center gap-1.5 h-7">
          <SkeuButton
            title={`${t("measureControls.repeatStart")} ([)`}
            active={repeatStart}
            onClick={onToggleRepeatStart}
            className="h-7 px-2.5 font-mono text-xs font-bold !py-0 flex items-center justify-center"
          >
            |:
          </SkeuButton>
          <SkeuButton
            title={`${t("measureControls.repeatEnd")} (])`}
            active={repeatEnd !== undefined}
            onClick={onToggleRepeatEnd}
            className="h-7 px-2.5 font-mono text-xs font-bold !py-0 flex items-center justify-center"
          >
            :|
          </SkeuButton>
          {repeatEnd !== undefined ? (
            <SkeuInput
              type="number"
              min={2}
              max={99}
              title={t("measureControls.repeatCount")}
              value={repeatEnd}
              onChange={(e) => {
                const value = parseInt(e.target.value, 10);
                if (!isNaN(value)) onSetRepeatCount(value);
              }}
              className="h-7 w-12 text-center font-mono text-xs !py-0"
            />
          ) : null}
          <SkeuButton
            title={`${t("measureControls.section")} (Shift+Insert)`}
            active={sectionLabel !== undefined}
            onClick={onEditSection}
            className="h-7 max-w-[7rem] truncate px-2.5 text-xs font-medium !py-0 flex items-center justify-center"
          >
            {sectionLabel ?? t("measureControls.section")}
          </SkeuButton>
        </div>
      </div>
    </div>
  );
}
