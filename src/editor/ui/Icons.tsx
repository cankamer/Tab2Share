import type { ReactNode } from "react";

export type IconName =
  // durations
  | "noteWhole"
  | "noteHalf"
  | "noteQuarter"
  | "noteEighth"
  | "noteSixteenth"
  | "noteThirtySecond"
  | "dotted"
  | "triplet"
  // bends
  | "bendHalf"
  | "bendFull"
  | "bendOneAndHalf"
  | "bendRelease"
  | "preBend"
  // vibrato
  | "vibrato"
  | "vibratoWide"
  // slides
  | "slideLegato"
  | "slideShift"
  | "slideInBelow"
  | "slideInAbove"
  | "slideOutUp"
  | "slideOutDown"
  // note / beat marks
  | "hammer"
  | "dead"
  | "ghost"
  | "palmMute"
  | "letRing"
  | "tie"
  | "harmonic"
  | "accent"
  | "heavyAccent"
  | "staccato"
  | "fermata"
  | "trill"
  | "pickDown"
  | "pickUp"
  | "text"
  // actions
  | "clear"
  | "more"
  | "insertMeasure"
  | "duplicateMeasure"
  | "deleteMeasure"
  | "section"
  | "transposeUp"
  | "transposeDown"
  // transport
  | "play"
  | "pause"
  | "stop"
  | "playFromStart"
  | "mic"
  | "record";

interface IconProps {
  name: IconName;
  size?: number;
}

const FILLED = { fill: "currentColor", stroke: "none" } as const;

/** Slanted oval notehead, centered at (cx, cy). */
function Head({ cx, cy, hollow = false }: { cx: number; cy: number; hollow?: boolean }) {
  return (
    <ellipse
      cx={cx}
      cy={cy}
      rx="3.9"
      ry="2.8"
      transform={`rotate(-22 ${cx} ${cy})`}
      {...(hollow ? { fill: "none", strokeWidth: 1.6 } : FILLED)}
    />
  );
}

/** Stem rising from a notehead at (headX, headY), with `flags` flag strokes at the top. */
function StemmedNote({ hollow = false, flags = 0, x = 9 }: { hollow?: boolean; flags?: number; x?: number }) {
  const stemX = x + 3.5;
  return (
    <>
      <Head cx={x} cy={17.5} hollow={hollow} />
      <path d={`M${stemX} 16.5 V4`} />
      {Array.from({ length: flags }, (_, i) => (
        <path key={i} d={`M${stemX} ${4 + i * 3.4} q5.5 1.6 5 7.2`} />
      ))}
    </>
  );
}

function glyph(name: IconName): ReactNode {
  switch (name) {
    // ---- durations ----
    case "noteWhole":
      return (
        <>
          <ellipse cx="12" cy="12" rx="6.4" ry="4.4" fill="none" strokeWidth="1.8" />
          <ellipse cx="12" cy="12" rx="2.4" ry="3.8" fill="none" strokeWidth="1.6" transform="rotate(-30 12 12)" />
        </>
      );
    case "noteHalf":
      return <StemmedNote hollow x={10} />;
    case "noteQuarter":
      return <StemmedNote x={10} />;
    case "noteEighth":
      return <StemmedNote flags={1} x={8} />;
    case "noteSixteenth":
      return <StemmedNote flags={2} x={8} />;
    case "noteThirtySecond":
      return <StemmedNote flags={3} x={8} />;
    case "dotted":
      return (
        <>
          <StemmedNote x={8} />
          <circle cx="17.5" cy="17.5" r="1.6" {...FILLED} />
        </>
      );
    case "triplet":
      return (
        <>
          <path d="M4 9 V5.5 H20 V9" />
          <text x="12" y="19" textAnchor="middle" fontSize="13" fontWeight="700" fontStyle="italic" {...FILLED}>
            3
          </text>
        </>
      );

    // ---- bends ----
    case "bendHalf":
    case "bendFull":
    case "bendOneAndHalf": {
      const label = name === "bendHalf" ? "½" : name === "bendFull" ? "1" : "1½";
      return (
        <>
          <path d="M3 20 C11 20 13 14 13 6" />
          <path d="M9.5 8.5 L13 4.5 L16.5 8.5" />
          <text x="21" y="21" textAnchor="end" fontSize="8.5" fontWeight="700" {...FILLED}>
            {label}
          </text>
        </>
      );
    }
    case "bendRelease":
      return (
        <>
          <path d="M2 20 C7 20 8 12 10 5.5 C12 12 13 20 22 20" />
          <path d="M6.8 8.5 L10 4.5 L13.2 8.5" />
        </>
      );
    case "preBend":
      return (
        <>
          <path d="M9 20 V6" strokeDasharray="2.6 2.6" />
          <path d="M5.5 8.5 L9 4.5 L12.5 8.5" />
        </>
      );

    // ---- vibrato ----
    case "vibrato":
      return <path d="M1.5 12 q2.6 -6.4 5.2 0 t5.2 0 t5.2 0 t5.2 0" />;
    case "vibratoWide":
      return <path d="M1.5 12 q3.1 -10.5 6.2 0 t6.2 0 t6.2 0" />;

    // ---- slides ----
    case "slideLegato":
      return (
        <>
          <path d="M5 17.5 L19 6.5" />
          <path d="M4 12 Q12 4 20 12" strokeWidth="1.3" />
        </>
      );
    case "slideShift":
      return (
        <>
          <path d="M4 18 L19 7" />
          <path d="M14.5 5.5 L19.5 6.5 L18.3 11.5" />
        </>
      );
    case "slideInBelow":
      return (
        <>
          <path d="M3 20 L11 13.5" />
          <circle cx="16" cy="11" r="2.4" {...FILLED} />
        </>
      );
    case "slideInAbove":
      return (
        <>
          <path d="M3 5 L11 10.5" />
          <circle cx="16" cy="13" r="2.4" {...FILLED} />
        </>
      );
    case "slideOutUp":
      return (
        <>
          <circle cx="7" cy="15" r="2.4" {...FILLED} />
          <path d="M12 12.5 L21 4.5" />
        </>
      );
    case "slideOutDown":
      return (
        <>
          <circle cx="7" cy="9" r="2.4" {...FILLED} />
          <path d="M12 11.5 L21 19.5" />
        </>
      );

    // ---- note / beat marks ----
    case "hammer":
      return (
        <>
          <path d="M5.5 15 A6.5 6.5 0 0 1 18.5 15" />
          <circle cx="5.5" cy="17" r="2" {...FILLED} />
          <circle cx="18.5" cy="17" r="2" {...FILLED} />
        </>
      );
    case "dead":
      return <path d="M6.5 6.5 L17.5 17.5 M17.5 6.5 L6.5 17.5" strokeWidth="2" />;
    case "ghost":
      return (
        <>
          <path d="M8.5 4.5 Q3.5 12 8.5 19.5" />
          <path d="M15.5 4.5 Q20.5 12 15.5 19.5" />
          <circle cx="12" cy="12" r="2" {...FILLED} />
        </>
      );
    case "palmMute":
      return (
        <>
          <text x="12" y="12" textAnchor="middle" fontSize="9.5" fontWeight="800" {...FILLED}>
            P.M.
          </text>
          <path d="M3 17 H21 M3 14.5 V19.5 M21 14.5 V19.5" strokeDasharray="0" strokeWidth="1.3" />
        </>
      );
    case "letRing":
      return (
        <>
          <text x="12" y="12" textAnchor="middle" fontSize="9.5" fontWeight="800" fontStyle="italic" {...FILLED}>
            LR
          </text>
          <path d="M3 17 H21" strokeDasharray="2.6 2.4" strokeWidth="1.3" />
          <path d="M21 14.5 V19.5" strokeWidth="1.3" />
        </>
      );
    case "tie":
      return <path d="M3.5 9 Q12 21 20.5 9" />;
    case "harmonic":
      return <path d="M12 4.5 L19.5 12 L12 19.5 L4.5 12 Z" />;
    case "accent":
      return <path d="M4.5 7 L19.5 12 L4.5 17" />;
    case "heavyAccent":
      return <path d="M5 19 L12 4.5 L19 19" />;
    case "staccato":
      return <circle cx="12" cy="12" r="2.6" {...FILLED} />;
    case "fermata":
      return (
        <>
          <path d="M3.5 16.5 A8.5 9 0 0 1 20.5 16.5" />
          <circle cx="12" cy="14" r="1.8" {...FILLED} />
        </>
      );
    case "trill":
      return (
        <text x="12" y="16.5" textAnchor="middle" fontSize="14" fontWeight="800" fontStyle="italic" {...FILLED}>
          tr
        </text>
      );
    case "pickDown":
      return <path d="M6.5 19 V6 H17.5 V19" />;
    case "pickUp":
      return <path d="M6 5.5 L12 19 L18 5.5" />;
    case "text":
      return <path d="M5 6 H19 M12 6 V19 M9 19 H15" />;

    // ---- actions ----
    case "clear":
      return (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M8.5 8.5 L15.5 15.5 M15.5 8.5 L8.5 15.5" />
        </>
      );
    case "more":
      return (
        <>
          <circle cx="5.5" cy="12" r="1.8" {...FILLED} />
          <circle cx="12" cy="12" r="1.8" {...FILLED} />
          <circle cx="18.5" cy="12" r="1.8" {...FILLED} />
        </>
      );
    case "insertMeasure":
      return (
        <>
          <rect x="3.5" y="5" width="17" height="14" rx="1.5" />
          <path d="M12 8.5 V15.5 M8.5 12 H15.5" />
        </>
      );
    case "duplicateMeasure":
      return (
        <>
          <rect x="8.5" y="8.5" width="12" height="11" rx="1.5" />
          <path d="M15.5 8.5 V6 a1.5 1.5 0 0 0 -1.5 -1.5 H5 A1.5 1.5 0 0 0 3.5 6 V14 A1.5 1.5 0 0 0 5 15.5 H8.5" />
        </>
      );
    case "deleteMeasure":
      return (
        <>
          <path d="M4.5 7 H19.5 M9.5 7 V4.5 H14.5 V7" />
          <path d="M6.5 7 L7.5 19.5 H16.5 L17.5 7" />
          <path d="M10 10.5 V16 M14 10.5 V16" />
        </>
      );
    case "section":
      return <path d="M6.5 20 V4.5 H18 L15 9 L18 13.5 H6.5" />;
    case "transposeUp":
      return <path d="M12 19.5 V5 M6 11 L12 4.5 L18 11" />;
    case "transposeDown":
      return <path d="M12 4.5 V19 M6 13 L12 19.5 L18 13" />;

    // ---- transport ----
    case "play":
      return <path d="M8 5 L19 12 L8 19 Z" {...FILLED} />;
    case "pause":
      return (
        <>
          <rect x="6.5" y="5" width="4" height="14" rx="1" {...FILLED} />
          <rect x="13.5" y="5" width="4" height="14" rx="1" {...FILLED} />
        </>
      );
    case "stop":
      return <rect x="6" y="6" width="12" height="12" rx="1.5" {...FILLED} />;
    case "mic":
      return (
        <>
          <rect x="9" y="3.5" width="6" height="10.5" rx="3" />
          <path d="M5.5 11.5 a6.5 6.5 0 0 0 13 0 M12 18 V21 M8.5 21 H15.5" />
        </>
      );
    case "record":
      return <circle cx="12" cy="12" r="6.5" {...FILLED} />;
    case "playFromStart":
      return (
        <>
          <path d="M5.5 5 V19" />
          <path d="M10 5 L20 12 L10 19 Z" {...FILLED} />
        </>
      );
  }
}

/**
 * Guitar Pro-style toolbar glyphs: one shared 24px grid, drawn with `currentColor` so they
 * pick up the neumorphic buttons' own text/accent color (including the red active state).
 */
export function Icon({ name, size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="pointer-events-none shrink-0"
    >
      {glyph(name)}
    </svg>
  );
}
