export const STRING_COUNT = 6;
export const STRING_SPACING = 28;
// Tall enough for two things that never get their own row: a string-1 note's bend+vibrato
// stack never collides with the chord label above it (string 1 IS tabTopY, unlike every
// other string row), and the "Capo N" label (drawn once, top-left) clears beat 0's own
// chord label when both are present — a common combination, not a rare edge case.
// Grew from 80 to 96 to make room for the rows Guitar Pro prints above the staff: section
// label and tempo (top), then free text, then the existing chord names.
export const TAB_TOP_MARGIN = 96;
/** Offsets above the top string (tabTopY) for the measure-header rows. */
export const SECTION_ROW_TOP = 95; // top edge of the section box
export const TEMPO_ROW_OFFSET = 69; // vertical center of the "♩ = N" marker
export const TEXT_ROW_OFFSET = 58; // vertical center of beat text
export const BEAT_MARK_OFFSET = 16; // center of accent/staccato/fermata/pick-stroke glyphs
export const MEASURE_NUMBER_OFFSET = 6; // baseline of the small measure number
export const CAPO_LABEL_OFFSET = 36; // top of the "Capo N" label above the first string
export const CHORD_LABEL_OFFSET = 40;
export const TUNING_LABEL_WIDTH = 26;
export const BEAT_WIDTH = 68;
export const MEASURE_BARLINE_GAP = 22;
export const STEM_LENGTH = 30;
export const STEM_GAP_BELOW_TAB = 10;
export const FLAG_GAP = 7;
export const FLAG_WIDTH = 10;
export const BOTTOM_MARGIN = 16;
export const EFFECT_ROW_GAP = 10;
export const EFFECT_ROW_HEIGHT = 15;
export const LINE_GAP = 24;

export const FRET_NUMBER_FONT = "bold 16px sans-serif";
export const TUNING_LABEL_FONT = "bold 13px sans-serif";
export const CHORD_LABEL_FONT = "bold 18px sans-serif";
export const EFFECT_LABEL_FONT = "bold 12px sans-serif";
export const ARTICULATION_FONT = "bold 13px sans-serif";
export const MEASURE_NUMBER_FONT = "10px sans-serif";
export const SECTION_FONT = "bold 13px sans-serif";
export const TEMPO_FONT = "bold 13px sans-serif";
export const TIME_SIGNATURE_FONT = "bold 20px sans-serif";
export const BEAT_TEXT_FONT = "italic 12px sans-serif";

/**
 * Section 10's "two completely independent theme systems": the app's own look (section
 * 10.1) and the exported tab's look (section 10.2) never share colors. TabPalette is the
 * seam between them — drawTab.ts's primitives take one explicitly rather than importing a
 * fixed color constant, so nothing here can leak into the other.
 */
export interface TabPalette {
  background: string;
  stringLine: string;
  barline: string;
  fretNumber: string;
  tuningLabel: string;
  rhythmStem: string;
  chordLabel: string;
  cursor: string;
  cursorColumnFill: string;
  selectionFill: string;
  pendingDigitBorder: string;
  articulation: string;
  vibrato: string;
  effectRow: string;
}

/** Section 10.2's default "temiz ve okunaklı" render theme — used for the export/preview
 * canvas only. Independent of the app's own (section 10.1) theme below. */
export const LIGHT_PALETTE: TabPalette = {
  background: "#FFFFFF",
  stringLine: "#999999",
  barline: "#333333",
  fretNumber: "#111111",
  tuningLabel: "#666666",
  rhythmStem: "#333333",
  chordLabel: "#111111",
  cursor: "#2563EB",
  cursorColumnFill: "rgba(37, 99, 235, 0.10)",
  selectionFill: "rgba(37, 99, 235, 0.18)",
  pendingDigitBorder: "#D4372B",
  articulation: "#1D4ED8",
  vibrato: "#EA580C",
  effectRow: "#555555",
};

/**
 * Section 10.1: "Tab canvas'ı cihazın ekranıdır" — a dark embedded screen with light-drawn
 * content, live editor only. Kept monochrome (matching the app chrome's "gövde tamamen
 * akromatik" rule extended to the screen) with red reserved for the cursor — the one accent
 * color the section allows, and only for "aktif ve kayıt durumları".
 */
export const SCREEN_PALETTE: TabPalette = {
  background: "#171717",
  stringLine: "#3A3A3A",
  barline: "#4A4A4A",
  fretNumber: "#F2F2F2",
  tuningLabel: "#8A8A8A",
  rhythmStem: "#B5B5B5",
  chordLabel: "#F2F2F2",
  cursor: "#D4372B",
  cursorColumnFill: "rgba(212, 55, 43, 0.20)",
  selectionFill: "rgba(212, 55, 43, 0.30)",
  pendingDigitBorder: "#D4372B",
  articulation: "#B5B5B5",
  vibrato: "#F97316",
  effectRow: "#8A8A8A",
};

/** Export "black theme" (section 14 output theme): white-on-black print/overlay look, the
 * inverse of LIGHT_PALETTE. Only ever used for the export/preview canvas, never the app UI. */
export const DARK_EXPORT_PALETTE: TabPalette = {
  background: "#000000",
  stringLine: "#8A8A8A",
  barline: "#D4D4D8",
  fretNumber: "#FFFFFF",
  tuningLabel: "#A1A1AA",
  rhythmStem: "#D4D4D8",
  chordLabel: "#FFFFFF",
  cursor: "#60A5FA",
  cursorColumnFill: "rgba(96, 165, 250, 0.10)",
  selectionFill: "rgba(96, 165, 250, 0.18)",
  pendingDigitBorder: "#F87171",
  articulation: "#60A5FA",
  vibrato: "#FB923C",
  effectRow: "#BBBBC2",
};

export const WATERMARK_TEXT = "Tab2Share";
export const WATERMARK_FONT = "12px sans-serif";
export const WATERMARK_MARGIN = 8;
export const WATERMARK_OPACITY = 0.35;
