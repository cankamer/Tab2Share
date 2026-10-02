/** In-place iterative radix-2 FFT on separate real/imaginary arrays (length must be a power of two). */
function fft(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const angle = ((inverse ? 2 : -2) * Math.PI) / size;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    for (let start = 0; start < n; start += size) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < size / 2; k++) {
        const a = start + k;
        const b = a + size / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const next = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = next;
      }
    }
  }
}

export interface PitchEstimate {
  frequency: number;
  /** 0..1 — how periodic the frame is (NSDF peak height). Noise and chords score low. */
  clarity: number;
}

/**
 * McLeod Pitch Method: the normalized square difference function (computed with an FFT
 * autocorrelation) makes octave errors rarer than plain autocorrelation, which matters on a
 * guitar where the 2nd harmonic is often louder than the fundamental.
 * Reference: McLeod & Wyvill, "A Smarter Way to Find Pitch" (2005).
 */
export class PitchDetector {
  private readonly fftSize: number;
  private readonly re: Float64Array;
  private readonly im: Float64Array;
  private readonly nsdf: Float64Array;

  constructor(private readonly size = 2048) {
    this.fftSize = size * 2;
    this.re = new Float64Array(this.fftSize);
    this.im = new Float64Array(this.fftSize);
    this.nsdf = new Float64Array(size);
  }

  detect(frame: Float32Array, sampleRate: number, minHz = 65, maxHz = 1400): PitchEstimate | null {
    const n = this.size;
    const { re, im, nsdf } = this;

    re.fill(0);
    im.fill(0);
    for (let i = 0; i < n; i++) re[i] = frame[i];
    fft(re, im, false);
    for (let k = 0; k < this.fftSize; k++) {
      re[k] = re[k] * re[k] + im[k] * im[k];
      im[k] = 0;
    }
    fft(re, im, true);

    const maxLag = Math.min(n - 2, Math.floor(sampleRate / minHz));
    const minLag = Math.max(2, Math.floor(sampleRate / maxHz));

    let m = 2 * (re[0] / this.fftSize);
    nsdf[0] = 1;
    for (let tau = 1; tau <= maxLag + 1; tau++) {
      m -= frame[tau - 1] * frame[tau - 1] + frame[n - tau] * frame[n - tau];
      nsdf[tau] = m > 1e-9 ? (2 * (re[tau] / this.fftSize)) / m : 0;
    }

    // Key maxima: the highest point of each positive lobe of the NSDF.
    const peaks: { tau: number; value: number }[] = [];
    let tau = 1;
    while (tau < maxLag && nsdf[tau] > 0) tau++; // skip the lobe around lag 0
    while (tau < maxLag) {
      while (tau < maxLag && nsdf[tau] <= 0) tau++;
      let bestTau = -1;
      let bestValue = -Infinity;
      while (tau < maxLag && nsdf[tau] > 0) {
        if (nsdf[tau] > bestValue) {
          bestValue = nsdf[tau];
          bestTau = tau;
        }
        tau++;
      }
      if (bestTau >= minLag) peaks.push({ tau: bestTau, value: bestValue });
    }
    if (peaks.length === 0) return null;

    const highest = Math.max(...peaks.map((peak) => peak.value));
    if (highest < 0.5) return null;
    // 0.85 (a bit under the paper's 0.93): guitar strings are slightly inharmonic, and the stricter value often skipped
    // the true first period for the next multiple, reading a note an octave low.
    const chosen = peaks.find((peak) => peak.value >= 0.85 * highest) ?? peaks[0];

    // Parabolic interpolation around the chosen lag for sub-sample accuracy.
    const a = nsdf[chosen.tau - 1];
    const b = nsdf[chosen.tau];
    const c = nsdf[chosen.tau + 1];
    const denominator = a - 2 * b + c;
    const shift = denominator !== 0 ? (0.5 * (a - c)) / denominator : 0;
    const refinedTau = chosen.tau + Math.max(-1, Math.min(1, shift));
    return { frequency: sampleRate / refinedTau, clarity: Math.min(1, b - 0.25 * (a - c) * shift) };
  }
}

export function midiFromFrequency(frequency: number): number {
  return 69 + 12 * Math.log2(frequency / 440);
}

export function frequencyFromMidi(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
