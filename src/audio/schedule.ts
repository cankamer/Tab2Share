import type { BendPreset, Note, Project } from "../model/types";
import { openStringMidi } from "../render/drawNotation";
import { resolveEffectiveSettings } from "../editor/effectiveSettings";
import { beatLengthInWholeNotes } from "../model/validate";

/** One string being sounded, with everything the synth needs to shape it. Pitches are sounding MIDI numbers. */
export interface ScheduledNote {
  string: number;
  midi: number;
  /** Seconds after the beat's start (a chord is strummed, not struck all at once). */
  offset: number;
  /** How long the string is held before it is damped, in seconds. */
  duration: number;
  velocity: number;
  palmMute: boolean;
  letRing: boolean;
  dead: boolean;
  /** Hammer-on / pull-off / legato-slide target: played softly, without a fresh pick attack. */
  legato: boolean;
  vibrato?: "normal" | "wide";
  bend?: BendPreset;
  /** Slide into the next note on this string (sounding MIDI of the target). */
  glideToMidi?: number;
  slideIn?: "below" | "above";
  slideOut?: "up" | "down";
}

export interface ScheduledBeat {
  /** Seconds from the start of the piece. */
  time: number;
  seconds: number;
  /** Index into the track's flat beat list — what the editor's playhead follows. */
  flatIndex: number;
  notes: ScheduledNote[];
}

export interface Schedule {
  beats: ScheduledBeat[];
  totalSeconds: number;
}

/** Order in which measures are played, following repeat signs (`repeatEnd` is the total number of passes). */
export function playbackOrder(project: Project): number[] {
  const measures = project.track.measures;
  const order: number[] = [];
  const passes = new Map<number, number>();
  let repeatStart = 0;
  let index = 0;

  while (index < measures.length && order.length < 5000) {
    const measure = measures[index];
    if (measure.repeatStart) repeatStart = index;
    order.push(index);

    if (measure.repeatEnd) {
      const done = (passes.get(index) ?? 0) + 1;
      if (done < measure.repeatEnd) {
        passes.set(index, done);
        index = repeatStart;
        continue;
      }
      passes.delete(index);
    }
    index += 1;
  }
  return order;
}

const BEND_SEMITONES: Record<BendPreset, number> = {
  half: 1,
  full: 2,
  oneAndHalf: 3,
  bendRelease: 2,
  preBend: 2,
  preBendRelease: 2,
};

/** Where a natural harmonic at `fret` actually sounds, in semitones above the open string. */
function harmonicSemitones(fret: number): number {
  const nodes: Record<number, number> = { 12: 12, 7: 19, 19: 19, 5: 24, 24: 24, 4: 28, 9: 28, 16: 28 };
  return nodes[fret] ?? fret + 12;
}

const STRUM_GAP_SECONDS = 0.011;

export function buildSchedule(project: Project): Schedule {
  const open = openStringMidi(project.track.tuning).map((midi) => midi + project.track.capo);
  const measures = project.track.measures;

  const flatStart: number[] = [];
  let flat = 0;
  for (const measure of measures) {
    flatStart.push(flat);
    flat += measure.beats.length;
  }

  const beats: ScheduledBeat[] = [];
  const lastOnString = new Map<number, ScheduledNote>();
  const legatoNext = new Set<number>();
  const glidePending = new Map<number, ScheduledNote>();
  let time = 0;

  for (const measureIndex of playbackOrder(project)) {
    const measure = measures[measureIndex];
    const tempo = resolveEffectiveSettings(project, measureIndex).tempo;
    const bpm = tempo >= 20 ? tempo : 120;

    measure.beats.forEach((beat, beatIndex) => {
      const seconds = beatLengthInWholeNotes(beat) * 4 * (60 / bpm);
      const scheduled: ScheduledBeat = { time, seconds, flatIndex: flatStart[measureIndex] + beatIndex, notes: [] };

      if (!beat.isRest && beat.notes.length > 0) {
        // Low strings first, so a down-stroke sweeps bass to treble (an up-stroke reverses it).
        const ordered: Note[] = [...beat.notes].sort((a, b) => b.string - a.string);
        if (beat.pickStroke === "up") ordered.reverse();

        ordered.forEach((note, strumIndex) => {
          const previous = lastOnString.get(note.string);
          if (note.tie && previous) {
            previous.duration += seconds;
            return;
          }

          const base = open[6 - note.string] + (note.harmonic ? harmonicSemitones(note.fret) : note.fret);
          const legato = legatoNext.has(note.string);
          legatoNext.delete(note.string);

          let velocity = 0.8;
          if (beat.accent === "normal") velocity *= 1.2;
          if (beat.accent === "heavy") velocity *= 1.45;
          if (note.ghost) velocity *= 0.55;
          if (legato) velocity *= 0.6;

          const sounding: ScheduledNote = {
            string: note.string,
            midi: base,
            offset: ordered.length > 1 ? strumIndex * STRUM_GAP_SECONDS : 0,
            duration: seconds * (beat.staccato ? 0.4 : 1),
            velocity: Math.min(velocity, 1.3),
            palmMute: Boolean(beat.palmMute),
            letRing: Boolean(beat.letRing),
            dead: Boolean(note.dead),
            legato,
            vibrato: note.vibrato,
            bend: note.bend,
          };

          if (note.slide) {
            if (note.slide.type === "inFromBelow") sounding.slideIn = "below";
            else if (note.slide.type === "inFromAbove") sounding.slideIn = "above";
            else if (note.slide.type === "outUp") sounding.slideOut = "up";
            else if (note.slide.type === "outDown") sounding.slideOut = "down";
            else {
              glidePending.set(note.string, sounding);
              if (note.slide.type === "legato") legatoNext.add(note.string);
            }
          }
          if (note.hammer) legatoNext.add(note.string);

          // A pending slide ends on this note: the previous one glides up/down to it.
          const gliding = glidePending.get(note.string);
          if (gliding && gliding !== sounding) {
            gliding.glideToMidi = base;
            glidePending.delete(note.string);
          }

          scheduled.notes.push(sounding);
          lastOnString.set(note.string, sounding);
        });
      }

      beats.push(scheduled);
      time += seconds;
    });
  }

  return { beats, totalSeconds: time };
}

/** Semitones a bend raises the pitch by (0 when the note isn't bent). */
export function bendAmount(preset: BendPreset | undefined): number {
  return preset ? BEND_SEMITONES[preset] : 0;
}
