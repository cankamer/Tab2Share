export type Duration = 1 | 2 | 4 | 8 | 16 | 32; // whole, half, quarter, 8th, 16th, 32nd

export type BendPreset =
  | "half" // half step
  | "full" // whole step
  | "oneAndHalf" // one and a half steps
  | "bendRelease" // bend then release
  | "preBend" // bend before picking
  | "preBendRelease";

export type SlideType =
  | "legato" // slide without repicking
  | "shift" // slide to a specific target fret
  | "inFromBelow" // slide in from below
  | "inFromAbove" // slide in from above
  | "outUp" // slide out, ending upward
  | "outDown"; // slide out, ending downward

export interface Note {
  string: 1 | 2 | 3 | 4 | 5 | 6; // 1 = high E, 6 = low E
  fret: number; // 0-24
  bend?: BendPreset;
  slide?: { type: SlideType; targetFret?: number };
  vibrato?: "normal" | "wide";
  hammer?: boolean; // direction (hammer-on vs pull-off) is derived automatically
  dead?: boolean; // muted note, notated as "x"
  ghost?: boolean; // notated in parentheses
  tie?: boolean; // tied to the previous note on the same string; fret drawn in parentheses with an arc
  harmonic?: boolean; // natural harmonic, notated as <fret>
}

export interface Beat {
  duration: Duration;
  dotted: boolean;
  isRest: boolean;
  notes: Note[]; // more than one note = chord/double stop
  chordRef?: string; // "Am", "C7" — printed as a label above the beat
  tuplet?: { count: number; over: number }; // triplets, etc.
  palmMute?: boolean; // beat-level, drawn as a bracketed range
  letRing?: boolean;
  text?: string; // free text printed above the beat
  fermata?: boolean;
  accent?: "normal" | "heavy";
  staccato?: boolean;
  trill?: boolean; // drawn as "tr" above the beat
  pickStroke?: "down" | "up";
}

export interface Measure {
  beats: Beat[];
  timeSignature?: { num: number; den: number }; // only written when it changes
  tempo?: number; // only written when it changes
  repeatStart?: boolean;
  repeatEnd?: number; // repeat count
  sectionLabel?: string; // "Verse", "Chorus"
}

export interface Track {
  tuning: string[]; // ["E","A","D","G","B","E"] — changes for drop D, etc.
  capo: number;
  measures: Measure[];
}

export interface RenderTheme {
  chordLabelColor: string; // chord labels (Am, C7)
  bendArrowColor: string; // bend arrows
  articulationColor: string; // vibrato wave, slide line, h/p
  fretNumberColor: string; // fret numbers
  stringLineColor: string; // string lines
  rhythmStemColor: string; // rhythm stems
  edgeFade: { enabled: boolean; ratio: number }; // edge opacity fade
}

export interface Project {
  version: string;
  title: string;
  artist?: string;
  defaultTempo: number;
  defaultTimeSignature: { num: number; den: number };
  track: Track;
  renderTheme: RenderTheme;
}
