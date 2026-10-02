import { useTranslation } from "react-i18next";
import type { Duration } from "../model/types";
import { SkeuButton } from "./ui/SkeuButton";
import { Toggle } from "./ui/Toggle";
import { Icon, type IconName } from "./ui/Icons";

const DURATIONS: { duration: Duration; key: string; icon: IconName }[] = [
  { duration: 1, key: "F1", icon: "noteWhole" },
  { duration: 2, key: "F2", icon: "noteHalf" },
  { duration: 4, key: "F3", icon: "noteQuarter" },
  { duration: 8, key: "F4", icon: "noteEighth" },
  { duration: 16, key: "F5", icon: "noteSixteenth" },
  { duration: 32, key: "F6", icon: "noteThirtySecond" },
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

const ICON_BUTTON = "flex h-9 w-10 items-center justify-center !px-0 !py-0";

/** Duration row (F1-F6): Guitar Pro-style note icons; the tooltip still names the value and its key. */
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
      {DURATIONS.map(({ duration, key, icon }) => {
        const label = `${t(`durationSelector.durations.${duration}`)} (${key})`;
        return (
          <SkeuButton
            key={duration}
            title={label}
            aria-label={label}
            onClick={() => onSetDuration(duration)}
            active={activeDuration === duration}
            className={ICON_BUTTON}
          >
            <Icon name={icon} size={22} />
          </SkeuButton>
        );
      })}
      <SkeuButton
        title={`${t("durationSelector.dotted")} (.)`}
        aria-label={t("durationSelector.dotted")}
        onClick={onToggleDotted}
        active={dotted}
        className={ICON_BUTTON}
      >
        <Icon name="dotted" size={22} />
      </SkeuButton>
      <SkeuButton
        title={`${t("durationSelector.triplet")} (/)`}
        aria-label={t("durationSelector.triplet")}
        onClick={onToggleTuplet}
        active={hasTuplet}
        className={ICON_BUTTON}
      >
        <Icon name="triplet" size={22} />
      </SkeuButton>
      <span className="ml-2">
        <Toggle checked={autoAdvance} onChange={onToggleAutoAdvance} label={t("durationSelector.autoAdvance")} />
      </span>
    </div>
  );
}
