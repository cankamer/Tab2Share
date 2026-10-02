import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Beat, BendPreset, Note, SlideType } from "../model/types";
import { SkeuButton } from "./ui/SkeuButton";
import { Icon, type IconName } from "./ui/Icons";

const BEND_PRESETS: BendPreset[] = ["half", "full", "oneAndHalf", "bendRelease", "preBend"];
const SLIDE_TYPES: SlideType[] = ["legato", "shift", "inFromBelow", "inFromAbove", "outUp", "outDown"];

const BEND_ICONS: Partial<Record<BendPreset, IconName>> = {
  half: "bendHalf",
  full: "bendFull",
  oneAndHalf: "bendOneAndHalf",
  bendRelease: "bendRelease",
  preBend: "preBend",
};

const SLIDE_ICONS: Record<SlideType, IconName> = {
  legato: "slideLegato",
  shift: "slideShift",
  inFromBelow: "slideInBelow",
  inFromAbove: "slideInAbove",
  outUp: "slideOutUp",
  outDown: "slideOutDown",
};

interface EffectPaletteProps {
  note: Note | undefined;
  beat: Beat | undefined;
  onApplyBend: (preset: BendPreset) => void;
  onApplySlide: (type: SlideType) => void;
  onApplyVibrato: (intensity: "normal" | "wide") => void;
  onToggleHammer: () => void;
  onToggleDead: () => void;
  onToggleGhost: () => void;
  onTogglePalmMute: () => void;
  onToggleLetRing: () => void;
  onToggleTie: () => void;
  onToggleHarmonic: () => void;
  onToggleBeatMark: (mark: "fermata" | "staccato" | "trill") => void;
  onToggleAccent: (level: "normal" | "heavy") => void;
  onTogglePickStroke: (direction: "down" | "up") => void;
  onEditText: () => void;
  onClearEffects: () => void;
}

/** One icon button: the tooltip carries the name and shortcut that used to be the label. */
function IconButton({
  icon,
  title,
  active,
  onClick,
}: {
  icon: IconName;
  title: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <SkeuButton
      title={title}
      aria-label={title}
      onClick={onClick}
      active={active}
      className="flex h-8 w-9 items-center justify-center !px-0 !py-0"
    >
      <Icon name={icon} />
    </SkeuButton>
  );
}

/** Effect palette (section 7 & section 10.1): one horizontal bar of icon buttons above the fretboard, like Guitar Pro's. */
export function EffectPalette({
  note,
  beat,
  onApplyBend,
  onApplySlide,
  onApplyVibrato,
  onToggleHammer,
  onToggleDead,
  onToggleGhost,
  onTogglePalmMute,
  onToggleLetRing,
  onToggleTie,
  onToggleHarmonic,
  onToggleBeatMark,
  onToggleAccent,
  onTogglePickStroke,
  onEditText,
  onClearEffects,
}: EffectPaletteProps) {
  const { t } = useTranslation();
  const [showMore, setShowMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMore) return;
    function onPointerDown(event: PointerEvent) {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) setShowMore(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [showMore]);

  const hasMoreActive = Boolean(
    note?.tie ||
      note?.harmonic ||
      beat?.accent ||
      beat?.staccato ||
      beat?.fermata ||
      beat?.trill ||
      beat?.pickStroke ||
      beat?.text,
  );

  const separator = <span className="text-[var(--body-edge)]">|</span>;

  return (
    <div className="raised flex w-full flex-wrap items-center gap-2 rounded-2xl p-3 text-xs">
      {/* Bend */}
      <div className="flex flex-wrap items-center gap-1.5">
        {BEND_PRESETS.map((preset) => (
          <IconButton
            key={preset}
            icon={BEND_ICONS[preset] ?? "bendFull"}
            title={`${t("menu.note.bend")} ${t(`effectPalette.bendPresets.${preset}`)} (B)`}
            active={note?.bend === preset}
            onClick={() => onApplyBend(preset)}
          />
        ))}
      </div>

      {separator}

      {/* Vibrato */}
      <div className="flex items-center gap-1.5">
        <IconButton
          icon="vibrato"
          title={`${t("menu.note.vibrato")} (V)`}
          active={note?.vibrato === "normal"}
          onClick={() => onApplyVibrato("normal")}
        />
        <IconButton
          icon="vibratoWide"
          title={`${t("menu.note.wideVibrato")} (Alt+V)`}
          active={note?.vibrato === "wide"}
          onClick={() => onApplyVibrato("wide")}
        />
      </div>

      {separator}

      {/* Slide */}
      <div className="flex flex-wrap items-center gap-1.5">
        {SLIDE_TYPES.map((type) => (
          <IconButton
            key={type}
            icon={SLIDE_ICONS[type]}
            title={`${t("menu.note.slide")} — ${t(`effectPalette.slideTypes.${type}`)}${
              type === "legato" ? " (S)" : type === "shift" ? " (Alt+S)" : ""
            }`}
            active={note?.slide?.type === type}
            onClick={() => onApplySlide(type)}
          />
        ))}
      </div>

      {separator}

      {/* Articulations */}
      <div className="flex flex-wrap items-center gap-1.5">
        <IconButton icon="hammer" title={`${t("menu.note.hammer")} (H)`} active={Boolean(note?.hammer)} onClick={onToggleHammer} />
        <IconButton icon="dead" title={`${t("menu.note.dead")} (X)`} active={Boolean(note?.dead)} onClick={onToggleDead} />
        <IconButton icon="ghost" title={`${t("menu.note.ghost")} (O)`} active={Boolean(note?.ghost)} onClick={onToggleGhost} />
        <IconButton icon="palmMute" title={`${t("menu.note.palmMute")} (P)`} active={Boolean(beat?.palmMute)} onClick={onTogglePalmMute} />
        <IconButton icon="letRing" title={`${t("menu.note.letRing")} (I)`} active={Boolean(beat?.letRing)} onClick={onToggleLetRing} />
      </div>

      {separator}

      {/* Guitar Pro style notation marks live in a popover so the palette stays one row tall */}
      <div ref={moreRef} className="relative">
        <IconButton
          icon="more"
          title={t("effectPalette.moreTitle")}
          active={showMore || hasMoreActive}
          onClick={() => setShowMore((value) => !value)}
        />
        {showMore ? (
          <div
            className="raised absolute bottom-full left-0 z-30 mb-2 flex w-max max-w-[24rem] flex-wrap items-center gap-1.5 rounded-2xl p-3"
            style={{ background: "var(--body)" }}
          >
            <IconButton icon="tie" title={`${t("menu.note.tie")} (L)`} active={Boolean(note?.tie)} onClick={onToggleTie} />
            <IconButton icon="harmonic" title={`${t("menu.note.harmonic")} (Y)`} active={Boolean(note?.harmonic)} onClick={onToggleHarmonic} />
            <IconButton icon="accent" title={`${t("menu.note.accent")} (;)`} active={beat?.accent === "normal"} onClick={() => onToggleAccent("normal")} />
            <IconButton icon="heavyAccent" title={`${t("menu.note.heavyAccent")} (Shift+;)`} active={beat?.accent === "heavy"} onClick={() => onToggleAccent("heavy")} />
            <IconButton icon="staccato" title={`${t("menu.note.staccato")} (!)`} active={Boolean(beat?.staccato)} onClick={() => onToggleBeatMark("staccato")} />
            <IconButton icon="fermata" title={`${t("menu.note.fermata")} (F)`} active={Boolean(beat?.fermata)} onClick={() => onToggleBeatMark("fermata")} />
            <IconButton icon="trill" title={`${t("menu.note.trill")} (N)`} active={Boolean(beat?.trill)} onClick={() => onToggleBeatMark("trill")} />
            <IconButton icon="pickDown" title={`${t("menu.note.pickDown")} (Shift+D)`} active={beat?.pickStroke === "down"} onClick={() => onTogglePickStroke("down")} />
            <IconButton icon="pickUp" title={`${t("menu.note.pickUp")} (Shift+U)`} active={beat?.pickStroke === "up"} onClick={() => onTogglePickStroke("up")} />
            <IconButton icon="text" title={`${t("menu.note.text")} (T)`} active={Boolean(beat?.text)} onClick={onEditText} />
          </div>
        ) : null}
      </div>

      {separator}

      {/* Clear */}
      <IconButton icon="clear" title={`${t("effectPalette.clearEffects")} (Ctrl+Shift+X)`} onClick={onClearEffects} />
    </div>
  );
}
