import { useState } from "react";
import type { StringNumber } from "./state";

const MIN_FRET = 0;
const MAX_FRET = 24;
const INLAY_FRETS = new Set([3, 5, 7, 9, 12, 15, 17, 19, 21]);
const STRING_ROWS: StringNumber[] = [1, 2, 3, 4, 5, 6];

interface GuitarFretboardProps {
  tuning: string[];
  onFretClick: (string: StringNumber, fret: number, chordMode: boolean) => void;
}

/**
 * Section 10.1: "Klavye ... modern bir dijital kontrol yüzeyi gibi görünür, akustik gitar
 * taklidi değil." Each fret is its own small neumorphic chip (`.fret-cell` / `.fret-cell-active`
 * in index.css) rather than a plain bordered square — same light/dark shadow pair as the rest
 * of the control language, so it follows the app's light/dark theme automatically. The active
 * string is marked with the red accent plus a clear border and a sunken (pressed) chip, not
 * just a shade shift (section 10.1's accessibility note).
 */
export function GuitarFretboard({ tuning, onFretClick }: GuitarFretboardProps) {
  const [hoveredString, setHoveredString] = useState<StringNumber | null>(null);
  const frets = Array.from({ length: MAX_FRET - MIN_FRET + 1 }, (_, i) => MIN_FRET + i);

  return (
    <div className="raised overflow-x-auto rounded-lg p-2">
      <table>
        <tbody>
          {STRING_ROWS.map((string) => (
            <tr key={string} onMouseEnter={() => setHoveredString(string)} onMouseLeave={() => setHoveredString(null)}>
              <td
                className="w-6 pr-2 text-right text-xs"
                style={{ color: string === hoveredString ? "var(--accent)" : "var(--label)" }}
              >
                {tuning[6 - string]}
              </td>
              {frets.map((fret) => {
                const isHovered = string === hoveredString;
                const isInlay = INLAY_FRETS.has(fret);
                const cellClass = isInlay ? "fret-cell-inlay" : "fret-cell";

                return (
                  <td key={fret} className="p-1.5">
                    <button
                      type="button"
                      onClick={(event) => onFretClick(string, fret, event.shiftKey)}
                      className={`${cellClass} relative flex h-8 w-14 items-center justify-center text-xs`}
                      style={{
                        border: isHovered ? "1.5px solid var(--accent)" : "1px solid transparent",
                        color: isHovered ? "var(--accent)" : "var(--control-text)",
                      }}
                    >
                      <span className="relative font-medium">{fret}</span>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
