import { useState } from "react";
import type { StringNumber } from "./state";

const MAX_FRET = 24;
const STRING_ROWS: StringNumber[] = [1, 2, 3, 4, 5, 6];
const SINGLE_INLAYS = [3, 5, 7, 9, 15, 17, 19, 21];
const DOUBLE_INLAYS = [12, 24];
const ROW_HEIGHT = 30;
const NUT_ZONE_WIDTH = 40;

/** Real fret spacing: each fret sits at 1 - 2^(-n/12) of the scale, normalized so fret 24 is the right edge. */
function fretPosition(fret: number): number {
  return ((1 - Math.pow(2, -fret / 12)) / (1 - Math.pow(2, -MAX_FRET / 12))) * 100;
}

/** Thicker strings toward the bass side, like the real thing. */
function stringThickness(string: StringNumber): number {
  return [1, 1.2, 1.6, 2.2, 2.8, 3.4][string - 1];
}

interface GuitarNeckProps {
  tuning: string[];
  onFretClick: (string: StringNumber, fret: number, chordMode: boolean) => void;
}

/**
 * Guitar Pro-style horizontal fretboard: six strings across, real (shrinking) fret spacing,
 * inlay dots, and a hover chip that previews the exact note under the pointer. Follows the
 * same soft-UI language as the rest of the app — a recessed `.inset` well, chips raised out of
 * it — and keeps red for the one thing the pointer is on, like the number-grid fretboard.
 */
export function GuitarNeck({ tuning, onFretClick }: GuitarNeckProps) {
  const [hover, setHover] = useState<{ string: StringNumber; fret: number } | null>(null);
  const frets = Array.from({ length: MAX_FRET }, (_, i) => i + 1);
  const boardHeight = ROW_HEIGHT * STRING_ROWS.length;

  const cellBounds = (fret: number) => {
    const left = fretPosition(fret - 1);
    return { left: `${left}%`, width: `${fretPosition(fret) - left}%` };
  };

  return (
    <div className="inset rounded-lg p-3 select-none">
      <div className="flex">
        {/* Tuning labels */}
        <div className="flex w-6 shrink-0 flex-col pr-1 text-right text-xs" style={{ height: boardHeight, color: "var(--label)" }}>
          {STRING_ROWS.map((string) => (
            <div
              key={string}
              className="flex items-center justify-end"
              style={{ height: ROW_HEIGHT, color: hover?.string === string ? "var(--accent)" : undefined }}
            >
              {tuning[6 - string]}
            </div>
          ))}
        </div>

        {/* Open-string zone (fret 0) */}
        <div className="relative shrink-0" style={{ width: NUT_ZONE_WIDTH, height: boardHeight }}>
          {STRING_ROWS.map((string, row) => (
            <button
              key={string}
              type="button"
              aria-label={`${tuning[6 - string]} 0`}
              onMouseEnter={() => setHover({ string, fret: 0 })}
              onMouseLeave={() => setHover(null)}
              onClick={(event) => onFretClick(string, 0, event.shiftKey)}
              className="neck-cell absolute left-0 right-0 cursor-pointer"
              style={{ top: row * ROW_HEIGHT, height: ROW_HEIGHT }}
            />
          ))}
          {STRING_ROWS.map((string, row) => (
            <div
              key={`line-${string}`}
              className="pointer-events-none absolute left-0 right-0"
              style={{
                top: row * ROW_HEIGHT + ROW_HEIGHT / 2 - stringThickness(string) / 2,
                height: stringThickness(string),
                background: hover?.string === string ? "var(--accent)" : "var(--control-text)",
                opacity: hover?.string === string ? 1 : 0.45,
              }}
            />
          ))}
          {hover?.fret === 0 ? <NeckChip row={hover.string - 1} left="50%" fret={0} /> : null}
        </div>

        {/* Fretted area */}
        <div
          className="relative min-w-0 flex-1 rounded-r"
          style={{ height: boardHeight, background: "color-mix(in srgb, var(--shadow-dark) 22%, transparent)" }}
        >
          {/* Nut + fret wires */}
          <div
            className="pointer-events-none absolute inset-y-0 left-0"
            style={{ width: 5, background: "var(--control-text)", opacity: 0.7, borderRadius: 2 }}
          />
          {frets.map((fret) => (
            <div
              key={`wire-${fret}`}
              className="pointer-events-none absolute inset-y-0"
              style={{
                left: `${fretPosition(fret)}%`,
                width: 2,
                background: "color-mix(in srgb, var(--control-text) 38%, transparent)",
              }}
            />
          ))}

          {/* Inlay dots */}
          {SINGLE_INLAYS.map((fret) => {
            const { left, width } = cellBounds(fret);
            return (
              <div
                key={`inlay-${fret}`}
                className="pointer-events-none absolute"
                style={{ left, width, top: boardHeight / 2 - 5 }}
              >
                <div className="mx-auto h-2.5 w-2.5 rounded-full" style={{ background: "color-mix(in srgb, var(--control-text) 45%, transparent)" }} />
              </div>
            );
          })}
          {DOUBLE_INLAYS.map((fret) => {
            const { left, width } = cellBounds(fret);
            return [boardHeight / 3, (boardHeight * 2) / 3].map((y) => (
              <div key={`inlay-${fret}-${y}`} className="pointer-events-none absolute" style={{ left, width, top: y - 5 }}>
                <div className="mx-auto h-2.5 w-2.5 rounded-full" style={{ background: "color-mix(in srgb, var(--control-text) 45%, transparent)" }} />
              </div>
            ));
          })}

          {/* Strings */}
          {STRING_ROWS.map((string, row) => (
            <div
              key={`string-${string}`}
              className="pointer-events-none absolute left-0 right-0"
              style={{
                top: row * ROW_HEIGHT + ROW_HEIGHT / 2 - stringThickness(string) / 2,
                height: stringThickness(string),
                background: hover?.string === string ? "var(--accent)" : "var(--control-text)",
                opacity: hover?.string === string ? 1 : 0.45,
              }}
            />
          ))}

          {/* Hit cells */}
          {STRING_ROWS.map((string, row) =>
            frets.map((fret) => (
              <button
                key={`${string}-${fret}`}
                type="button"
                aria-label={`${tuning[6 - string]} ${fret}`}
                onMouseEnter={() => setHover({ string, fret })}
                onMouseLeave={() => setHover(null)}
                onClick={(event) => onFretClick(string, fret, event.shiftKey)}
                className="neck-cell absolute cursor-pointer"
                style={{ ...cellBounds(fret), top: row * ROW_HEIGHT, height: ROW_HEIGHT }}
              />
            )),
          )}

          {hover && hover.fret > 0 ? (
            <NeckChip
              row={hover.string - 1}
              left={`${(fretPosition(hover.fret - 1) + fretPosition(hover.fret)) / 2}%`}
              fret={hover.fret}
            />
          ) : null}
        </div>
      </div>

      {/* Fret numbers */}
      <div className="flex text-[10px]" style={{ color: "var(--label)" }}>
        <div className="shrink-0" style={{ width: 24 + NUT_ZONE_WIDTH }} />
        <div className="relative min-w-0 flex-1" style={{ height: 16 }}>
          {frets.map((fret) => {
            const { left, width } = cellBounds(fret);
            return (
              <div
                key={fret}
                className="absolute top-1 text-center"
                style={{ left, width, color: hover?.fret === fret ? "var(--accent)" : undefined }}
              >
                {fret}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** The raised disc that follows the pointer, showing the fret that will be entered. */
function NeckChip({ row, left, fret }: { row: number; left: string; fret: number }) {
  return (
    <div
      className="raised pointer-events-none absolute z-10 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold"
      style={{
        left,
        top: row * ROW_HEIGHT + ROW_HEIGHT / 2 - 12,
        transform: "translateX(-50%)",
        border: "1.5px solid var(--accent)",
        color: "var(--accent)",
      }}
    >
      {fret}
    </div>
  );
}
