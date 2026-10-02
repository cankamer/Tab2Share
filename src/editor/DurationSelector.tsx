import { useTranslation } from "react-i18next";
import type { Duration } from "../model/types";
import { SkeuButton } from "./ui/SkeuButton";
import { Toggle } from "./ui/Toggle";

const DURATIONS: { duration: Duration; key: string }[] = [
  { duration: 1, key: "F1" },
  { duration: 2, key: "F2" },
  { duration: 4, key: "F3" },
  { duration: 8, key: "F4" },
  { duration: 16, key: "F5" },
  { duration: 32, key: "F6" },
];

interface DurationSelectorProps {
  activeDuration: Duration;
  dotted: boolean;
  hasTuplet: boolean;
  autoAdvance: boolean;
  onSetDuration: (duration: Duration) => void;
  onToggleDotted: () => void;
  onToggleTuplet: () => void;
  onToggleAutoAdvance: () => void;
}

export function DurationSelector({
  activeDuration,
  dotted,
  hasTuplet,
  autoAdvance,
  onSetDuration,
  onToggleDotted,
  onToggleTuplet,
  onToggleAutoAdvance,
}: DurationSelectorProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center gap-2 rounded p-2" style={{ background: "var(--body)" }}>
      {DURATIONS.map(({ duration, key }) => (
        <SkeuButton
          key={duration}
          title={key}
          onClick={() => onSetDuration(duration)}
          active={activeDuration === duration}
        >
          {t(`durationSelector.durations.${duration}`)}
        </SkeuButton>
      ))}
      <SkeuButton title="." onClick={onToggleDotted} active={dotted}>
        {t("durationSelector.dotted")}
      </SkeuButton>
      <SkeuButton title="/" onClick={onToggleTuplet} active={hasTuplet}>
        {t("durationSelector.triplet")}
      </SkeuButton>
      <span className="ml-2">
        <Toggle checked={autoAdvance} onChange={onToggleAutoAdvance} label={t("durationSelector.autoAdvance")} />
      </span>
    </div>
  );
}
