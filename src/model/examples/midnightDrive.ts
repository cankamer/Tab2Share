import { CHORDS, chordToNotes } from "../chords";
import type { Beat, BendPreset, Duration, Measure, Note, Project } from "../types";

// An original piece written for Tab2Share's welcome screen: E minor, 24 bars, with a clean
// arpeggiated intro, a palm-muted verse riff, a strummed chorus, two guitar solos and a quiet
// outro — enough to show off sections, repeats, tempo changes, bends, slides, vibrato,
// hammer/pull-offs, triplets, harmonics, fermata and the notation staff.

type StringFret = [string: number, fret: number];

function note(string: number, fret: number, extra: Partial<Note> = {}): Note {
  return { string: string as Note["string"], fret, ...extra };
}

function beat(duration: Duration, notes: Note[], extra: Partial<Beat> = {}): Beat {
  return { duration, dotted: false, isRest: false, notes, ...extra };
}

function rest(duration: Duration): Beat {
  return { duration, dotted: false, isRest: true, notes: [] };
}

/** Eight eighth notes picked one string at a time. */
function arpeggio(chord: string, picks: StringFret[], extra: Partial<Beat> = {}): Beat[] {
  return picks.map(([string, fret], index) =>
    beat(8, [note(string, fret)], { ...(index === 0 ? { chordRef: chord } : {}), ...extra }),
  );
}

/** Eight palm-muted eighth notes (the verse riff); the off-beat pushes carry an accent. */
function mutedRiff(chord: string, picks: StringFret[]): Beat[] {
  return picks.map(([string, fret], index) =>
    beat(8, [note(string, fret)], {
      palmMute: true,
      ...(index === 0 ? { chordRef: chord } : {}),
      ...(index === 2 || index === 6 ? { accent: "normal" as const } : {}),
    }),
  );
}

function chord(name: string) {
  const definition = CHORDS.find((candidate) => candidate.name === name);
  if (!definition) throw new Error(`Unknown chord ${name}`);
  return chordToNotes(definition);
}

/** One strummed bar: down-strum on 1, then a push on the "and" of 2 and of 4. */
function strumBar(name: string): Beat[] {
  const strum = (duration: Duration, extra: Partial<Beat> = {}) => beat(duration, chord(name), extra);
  return [
    strum(4, { chordRef: name, pickStroke: "down", accent: "normal" }),
    strum(8),
    strum(8),
    strum(4),
    strum(8),
    strum(8),
  ];
}

function bend(fret: number, string: number, preset: BendPreset, vibrato?: "normal" | "wide"): Note {
  return note(string, fret, { bend: preset, ...(vibrato ? { vibrato } : {}) });
}

const TRIPLET = { count: 3, over: 2 };

function triplets(groups: StringFret[][]): Beat[] {
  return groups.flat().map(([string, fret]) => beat(8, [note(string, fret)], { tuplet: TRIPLET }));
}

/** Sixteenth-note pull-off pairs: fret `high` pulled off to `low`, four times over. */
function pullOffRun(string: number, high: number, low: number): Beat[] {
  return Array.from({ length: 4 }, () => [
    beat(16, [note(string, high, { hammer: true })]),
    beat(16, [note(string, low)]),
  ]).flat();
}

const measures: Measure[] = [
  // ---- Intro: clean, let ring -------------------------------------------------------------
  {
    tempo: 92,
    sectionLabel: "Intro",
    beats: arpeggio("Em", [[6, 0], [4, 2], [3, 0], [2, 0], [1, 0], [2, 0], [3, 0], [4, 2]], { letRing: true }).map(
      (b, i) => (i === 0 ? { ...b, text: "clean, let ring" } : b),
    ),
  },
  { beats: arpeggio("Cadd9", [[5, 3], [4, 2], [3, 0], [2, 3], [1, 0], [2, 3], [3, 0], [4, 2]], { letRing: true }) },
  { beats: arpeggio("G", [[6, 3], [4, 0], [3, 0], [2, 0], [1, 3], [2, 0], [3, 0], [4, 0]], { letRing: true }) },
  { beats: arpeggio("D/F#", [[6, 2], [4, 0], [3, 2], [2, 3], [1, 2], [2, 3], [3, 2], [4, 0]], { letRing: true }) },

  // ---- Verse: palm-muted riff, played twice -----------------------------------------------
  {
    tempo: 112,
    sectionLabel: "Verse",
    repeatStart: true,
    beats: mutedRiff("Em", [[6, 0], [6, 0], [6, 3], [6, 0], [6, 0], [5, 0], [6, 3], [6, 0]]).map((b, i) =>
      i === 0 ? { ...b, text: "palm mute" } : b,
    ),
  },
  { beats: mutedRiff("C", [[5, 3], [5, 3], [5, 5], [5, 3], [5, 3], [4, 2], [5, 5], [5, 3]]) },
  { beats: mutedRiff("G", [[6, 3], [6, 3], [6, 5], [6, 3], [6, 3], [5, 2], [6, 5], [6, 3]]) },
  { repeatEnd: 2, beats: mutedRiff("D", [[5, 5], [5, 5], [5, 7], [5, 5], [5, 5], [4, 4], [5, 7], [5, 5]]) },

  // ---- Chorus: open strums ----------------------------------------------------------------
  { sectionLabel: "Chorus", beats: strumBar("Em") },
  { beats: strumBar("C") },
  { beats: strumBar("G") },
  {
    beats: [
      beat(2, chord("D"), { chordRef: "D", pickStroke: "down", accent: "heavy" }),
      beat(4, chord("D")),
      rest(4),
    ],
  },

  // ---- Solo 1: E minor pentatonic around the 12th fret ------------------------------------
  {
    tempo: 116,
    sectionLabel: "Solo 1",
    beats: [
      beat(4, [bend(15, 2, "full", "normal")], { chordRef: "Em", text: "bend + vibrato" }),
      beat(8, [note(1, 12)]),
      beat(8, [note(2, 15)]),
      beat(4, [note(2, 12)]),
      beat(4, [note(3, 14)]),
    ],
  },
  {
    beats: [
      ...[[1, 15], [1, 12], [2, 15], [2, 12], [3, 14], [3, 12], [4, 14], [4, 12]].map(([s, f], i) =>
        beat(16, [note(s, f)], i === 0 ? { chordRef: "C" } : {}),
      ),
      beat(4, [note(4, 14, { vibrato: "wide" })]),
      beat(4, [note(5, 12)]),
    ],
  },
  {
    beats: [
      beat(8, [note(3, 12, { slide: { type: "legato" } })], { chordRef: "G" }),
      beat(8, [note(3, 14)]),
      beat(4, [note(2, 15, { vibrato: "normal" })]),
      beat(4, [note(1, 12, { vibrato: "wide" })]),
      beat(8, [note(2, 15)]),
      beat(8, [note(3, 14)]),
    ],
  },
  {
    beats: [
      beat(2, [bend(15, 1, "full", "wide")], { chordRef: "D" }),
      beat(4, [note(1, 12)]),
      beat(4, [note(2, 15)]),
    ],
  },

  // ---- Solo 2: higher octave, triplets ----------------------------------------------------
  {
    sectionLabel: "Solo 2",
    beats: triplets([
      [[1, 19], [1, 17], [1, 15]],
      [[2, 17], [2, 15], [2, 12]],
      [[1, 19], [1, 17], [1, 15]],
      [[2, 15], [2, 12], [3, 14]],
    ]).map((b, i) => (i === 0 ? { ...b, chordRef: "Em", text: "triplets" } : b)),
  },
  {
    beats: [
      beat(4, [bend(19, 1, "full", "normal")], { chordRef: "C" }),
      beat(4, [note(1, 17)]),
      beat(2, [note(1, 15, { vibrato: "wide" })]),
    ],
  },
  {
    beats: [
      ...pullOffRun(1, 15, 12).map((b, i) => (i === 0 ? { ...b, chordRef: "G" } : b)),
      beat(4, [note(2, 15)]),
      beat(4, [note(2, 12)]),
    ],
  },
  {
    beats: [
      beat(4, [bend(15, 1, "bendRelease")], { chordRef: "D" }),
      beat(4, [note(2, 15, { slide: { type: "outDown" } })]),
      beat(2, [note(2, 12, { vibrato: "wide" })], { fermata: true }),
    ],
  },

  // ---- Outro: back to clean, ending on harmonics ------------------------------------------
  {
    tempo: 80,
    sectionLabel: "Outro",
    beats: arpeggio("Em", [[6, 0], [4, 2], [3, 0], [2, 0], [1, 0], [2, 0], [3, 0], [4, 2]], { letRing: true }).map(
      (b, i) => (i === 0 ? { ...b, text: "back to clean" } : b),
    ),
  },
  { beats: arpeggio("Cadd9", [[5, 3], [4, 2], [3, 0], [2, 3], [1, 0], [2, 3], [3, 0], [4, 2]], { letRing: true }) },
  { beats: arpeggio("G", [[6, 3], [4, 0], [3, 0], [2, 0], [1, 3], [2, 0], [3, 0], [4, 0]], { letRing: true }) },
  {
    beats: [
      beat(1, [note(6, 12, { harmonic: true }), note(5, 12, { harmonic: true }), note(4, 12, { harmonic: true })], {
        chordRef: "Em",
        fermata: true,
        letRing: true,
      }),
    ],
  },
];

export const MIDNIGHT_DRIVE: Project = {
  version: "1",
  title: "Midnight Drive",
  artist: "Tab2Share demo",
  defaultTempo: 92,
  defaultTimeSignature: { num: 4, den: 4 },
  track: {
    tuning: ["E", "A", "D", "G", "B", "E"],
    capo: 0,
    measures,
  },
  renderTheme: {
    chordLabelColor: "#F2F2F2",
    bendArrowColor: "#F2F2F2",
    articulationColor: "#F2F2F2",
    fretNumberColor: "#F2F2F2",
    stringLineColor: "#F2F2F2",
    rhythmStemColor: "#F2F2F2",
    edgeFade: { enabled: false, ratio: 0 },
  },
};
