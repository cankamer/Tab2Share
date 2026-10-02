/**
 * Real electric-guitar samples (public/samples/guitar-electric): one plucked note each, a minor
 * third apart from C#2 to C6, so any fret is at most ~1.5 semitones of pitch-shift away from a
 * recording. Samples: Karoryfer Samples via tonejs-instruments, CC BY 3.0 — see
 * public/samples/guitar-electric/LICENSE.txt and THIRD_PARTY_NOTICES.md.
 */
const SAMPLE_NAMES = [
  "Cs2", "E2", "Fs2", "A2", "C3", "Ds3", "Fs3", "A3", "C4", "Ds4", "Fs4", "A4", "C5", "Ds5", "Fs5", "A5", "C6",
] as const;

const SEMITONES: Record<string, number> = { C: 0, Cs: 1, D: 2, Ds: 3, E: 4, F: 5, Fs: 6, G: 7, Gs: 8, A: 9, As: 10, B: 11 };

function midiOfName(name: string): number {
  const match = name.match(/^([A-G]s?)(\d)$/);
  if (!match) throw new Error(`Bad sample name ${name}`);
  return SEMITONES[match[1]] + 12 * (Number(match[2]) + 1);
}

export interface Sample {
  buffer: AudioBuffer;
  midi: number;
}

export class SampleBank {
  private samples: Sample[] = [];
  private loading: Promise<void> | null = null;

  get ready(): boolean {
    return this.samples.length > 0;
  }

  /** Fetches and decodes every sample once; later calls reuse the result. Rejects if any file is missing. */
  load(context: BaseAudioContext): Promise<void> {
    if (!this.loading) {
      const base = `${import.meta.env.BASE_URL}samples/guitar-electric/`;
      this.loading = Promise.all(
        SAMPLE_NAMES.map(async (name) => {
          const response = await fetch(`${base}${name}.mp3`);
          if (!response.ok) throw new Error(`Sample ${name} failed to load (${response.status})`);
          const buffer = await context.decodeAudioData(await response.arrayBuffer());
          return { buffer, midi: midiOfName(name) } satisfies Sample;
        }),
      )
        .then((samples) => {
          this.samples = samples.sort((a, b) => a.midi - b.midi);
        })
        .catch((error) => {
          this.loading = null; // let a later play try again
          throw error;
        });
    }
    return this.loading;
  }

  /** The recording closest in pitch to `midi`. */
  nearest(midi: number): Sample | null {
    let best: Sample | null = null;
    for (const sample of this.samples) {
      if (!best || Math.abs(sample.midi - midi) < Math.abs(best.midi - midi)) best = sample;
    }
    return best;
  }
}
