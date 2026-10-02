import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../editor/ui/Modal";
import { SkeuInput } from "../editor/ui/SkeuInput";

type Category = "navigation" | "noteEntry" | "bar" | "effects" | "playback" | "editing" | "file" | "view";

interface ShortcutEntry {
  category: Category;
  labelKey: string;
  shortcut: string;
}

const ENTRIES: ShortcutEntry[] = [
  { category: "navigation", labelKey: "shortcuts.items.moveCursor", shortcut: "↑ ↓ ← →" },
  { category: "navigation", labelKey: "shortcuts.items.extendSelection", shortcut: "Shift + ↑ ↓ ← →" },
  { category: "navigation", labelKey: "shortcuts.items.measureHome", shortcut: "Home" },
  { category: "navigation", labelKey: "shortcuts.items.measureEnd", shortcut: "End" },
  { category: "navigation", labelKey: "shortcuts.items.confirmDigit", shortcut: "Enter" },
  { category: "navigation", labelKey: "shortcuts.items.firstBar", shortcut: "Ctrl + Home" },
  { category: "navigation", labelKey: "shortcuts.items.lastBar", shortcut: "Ctrl + End" },
  { category: "navigation", labelKey: "shortcuts.items.goToBar", shortcut: "Ctrl + G" },
  { category: "navigation", labelKey: "shortcuts.items.previousSection", shortcut: "Alt + ←" },
  { category: "navigation", labelKey: "shortcuts.items.nextSection", shortcut: "Alt + →" },

  { category: "noteEntry", labelKey: "shortcuts.items.fretNumber", shortcut: "0-9" },
  { category: "noteEntry", labelKey: "shortcuts.items.chordModeDigit", shortcut: "Shift + 0-9" },
  { category: "noteEntry", labelKey: "shortcuts.items.insertBeat", shortcut: "Insert" },
  { category: "noteEntry", labelKey: "shortcuts.items.deleteNote", shortcut: "Delete" },
  { category: "noteEntry", labelKey: "shortcuts.items.deleteBeat", shortcut: "Shift + Delete" },
  { category: "noteEntry", labelKey: "shortcuts.items.rest", shortcut: "R" },
  { category: "noteEntry", labelKey: "menu.note.duration", shortcut: "F1-F6" },
  { category: "noteEntry", labelKey: "shortcuts.items.dotted", shortcut: "." },
  { category: "noteEntry", labelKey: "shortcuts.items.triplet", shortcut: "/" },
  { category: "noteEntry", labelKey: "shortcuts.items.durationStep", shortcut: "+ / -" },
  { category: "noteEntry", labelKey: "shortcuts.items.text", shortcut: "T" },

  { category: "bar", labelKey: "menu.edit.insertMeasure", shortcut: "Ctrl + Insert" },
  { category: "bar", labelKey: "menu.edit.deleteMeasure", shortcut: "Ctrl + Delete" },
  { category: "bar", labelKey: "menu.edit.duplicateMeasure", shortcut: "Ctrl + D" },
  { category: "bar", labelKey: "shortcuts.items.timeSignature", shortcut: "Ctrl + T" },
  { category: "bar", labelKey: "shortcuts.items.repeatOpen", shortcut: "[" },
  { category: "bar", labelKey: "shortcuts.items.repeatClose", shortcut: "]" },
  { category: "bar", labelKey: "shortcuts.items.section", shortcut: "Shift + Insert" },

  { category: "effects", labelKey: "shortcuts.items.bendFull", shortcut: "B" },
  { category: "effects", labelKey: "shortcuts.items.vibratoNormal", shortcut: "V" },
  { category: "effects", labelKey: "shortcuts.items.vibratoWide", shortcut: "Alt + V" },
  { category: "effects", labelKey: "shortcuts.items.slideLegato", shortcut: "S" },
  { category: "effects", labelKey: "shortcuts.items.slideShift", shortcut: "Alt + S" },
  { category: "effects", labelKey: "shortcuts.items.hammerPull", shortcut: "H" },
  { category: "effects", labelKey: "shortcuts.items.deadNote", shortcut: "X" },
  { category: "effects", labelKey: "shortcuts.items.ghostNote", shortcut: "O" },
  { category: "effects", labelKey: "shortcuts.items.palmMute", shortcut: "P" },
  { category: "effects", labelKey: "shortcuts.items.tie", shortcut: "L" },
  { category: "effects", labelKey: "shortcuts.items.harmonic", shortcut: "Y" },
  { category: "effects", labelKey: "shortcuts.items.accent", shortcut: ";" },
  { category: "effects", labelKey: "shortcuts.items.heavyAccent", shortcut: "Shift + ;" },
  { category: "effects", labelKey: "shortcuts.items.staccato", shortcut: "!" },
  { category: "effects", labelKey: "shortcuts.items.fermata", shortcut: "F" },
  { category: "effects", labelKey: "shortcuts.items.trill", shortcut: "N" },
  { category: "effects", labelKey: "shortcuts.items.pickDown", shortcut: "Shift + D" },
  { category: "effects", labelKey: "shortcuts.items.pickUp", shortcut: "Shift + U" },
  { category: "effects", labelKey: "shortcuts.items.letRing", shortcut: "I" },
  { category: "effects", labelKey: "shortcuts.items.clearEffects", shortcut: "Ctrl + Shift + X" },

  { category: "playback", labelKey: "shortcuts.items.playPause", shortcut: "Space" },
  { category: "playback", labelKey: "transport.playFromStart", shortcut: "Ctrl + Space" },

  { category: "editing", labelKey: "menu.edit.undo", shortcut: "Ctrl + Z" },
  { category: "editing", labelKey: "menu.edit.redo", shortcut: "Ctrl + Y" },
  { category: "editing", labelKey: "menu.edit.cut", shortcut: "Ctrl + X" },
  { category: "editing", labelKey: "menu.edit.copy", shortcut: "Ctrl + C" },
  { category: "editing", labelKey: "menu.edit.paste", shortcut: "Ctrl + V" },
  { category: "editing", labelKey: "menu.edit.selectAll", shortcut: "Ctrl + A" },
  { category: "editing", labelKey: "menu.edit.transposeUp", shortcut: "Ctrl + ↑" },
  { category: "editing", labelKey: "menu.edit.transposeDown", shortcut: "Ctrl + ↓" },
  { category: "editing", labelKey: "menu.edit.preferences", shortcut: "Ctrl + ," },

  { category: "file", labelKey: "menu.file.newProject", shortcut: "Ctrl + N" },
  { category: "file", labelKey: "menu.file.open", shortcut: "Ctrl + O" },
  { category: "file", labelKey: "menu.file.save", shortcut: "Ctrl + S" },
  { category: "file", labelKey: "menu.file.saveAs", shortcut: "Ctrl + Shift + S" },
  { category: "file", labelKey: "menu.file.exportPng", shortcut: "Ctrl + E" },
  { category: "file", labelKey: "menu.file.copyPng", shortcut: "Ctrl + Shift + C" },

  { category: "view", labelKey: "menu.view.zoomIn", shortcut: "Ctrl + +" },
  { category: "view", labelKey: "menu.view.zoomOut", shortcut: "Ctrl + -" },
  { category: "view", labelKey: "menu.view.resetZoom", shortcut: "Ctrl + 0" },
  { category: "view", labelKey: "menu.view.togglePreview", shortcut: "Ctrl + P" },
  { category: "view", labelKey: "menu.view.toggleFretboard", shortcut: "Ctrl + B" },
  { category: "view", labelKey: "menu.view.toggleNotation", shortcut: "Ctrl + Shift + N" },
  { category: "view", labelKey: "menu.view.toggleChordPicker", shortcut: "Ctrl + K" },
  { category: "view", labelKey: "menu.view.toggleEffectPalette", shortcut: "Ctrl + J" },
  { category: "view", labelKey: "menu.help.keyboardShortcuts", shortcut: "Ctrl + /" },
];

const CATEGORY_ORDER: Category[] = ["navigation", "noteEntry", "bar", "effects", "playback", "editing", "file", "view"];

/**
 * Help > Keyboard shortcuts (section 8): a searchable, categorized modal. Keys are drawn as
 * physical keycaps using section 10.1's `.raised` shadow recipe — same design language as the
 * rest of the app's controls.
 */
export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const needle = query.trim().toLowerCase();
  const filtered = ENTRIES.filter((entry) => {
    if (!needle) return true;
    const label = t(entry.labelKey).toLowerCase();
    return label.includes(needle) || entry.shortcut.toLowerCase().includes(needle);
  });

  return (
    <Modal title={t("shortcuts.title")} onClose={onClose} width={520}>
      <SkeuInput
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("shortcuts.searchPlaceholder")}
      />

      <p style={{ color: "var(--label)" }}>{t("shortcuts.f1Note")}</p>

      {filtered.length === 0 ? (
        <p style={{ color: "var(--label)" }}>{t("shortcuts.noResults")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {CATEGORY_ORDER.map((category) => {
            const entries = filtered.filter((entry) => entry.category === category);
            if (entries.length === 0) return null;
            return (
              <div key={category}>
                <div className="mb-1 font-bold" style={{ color: "var(--control-text)" }}>
                  {t(`shortcuts.categories.${category}`)}
                </div>
                <div className="flex flex-col gap-1">
                  {entries.map((entry) => (
                    <div key={entry.labelKey + entry.shortcut} className="flex items-center justify-between gap-3">
                      <span style={{ color: "var(--control-text)" }}>{t(entry.labelKey)}</span>
                      <span className="raised rounded px-2 py-0.5 font-mono text-[11px]" style={{ color: "var(--control-text)" }}>
                        {entry.shortcut}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p style={{ color: "var(--label)" }}>{t("shortcuts.footnote")}</p>
    </Modal>
  );
}
