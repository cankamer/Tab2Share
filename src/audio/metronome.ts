export interface MetronomeOptions {
  /** Quarter notes per minute. */
  bpm: number;
  /** Clicks per bar (an accent on the first). */
  beatsPerBar: number;
  /** Audio-clock time of the first click. */
  firstClickTime: number;
  /** Number of clicks to play before stopping on its own (undefined = until `stop()`). */
  totalClicks?: number;
}

/** Click track on the Web Audio clock: scheduled slightly ahead from a timer, so it stays steady under UI load. */
export class Metronome {
  private timer: number | null = null;
  private nextClick = 0;
  private clickIndex = 0;

  constructor(
    private readonly context: AudioContext,
    private readonly output: AudioNode = context.destination,
  ) {}

  start(options: MetronomeOptions): void {
    this.stop();
    const interval = 60 / options.bpm;
    this.nextClick = options.firstClickTime;
    this.clickIndex = 0;

    const schedule = () => {
      const horizon = this.context.currentTime + 0.25;
      while (this.nextClick < horizon) {
        if (options.totalClicks !== undefined && this.clickIndex >= options.totalClicks) {
          this.stop();
          return;
        }
        this.click(this.nextClick, this.clickIndex % options.beatsPerBar === 0);
        this.nextClick += interval;
        this.clickIndex++;
      }
    };
    schedule();
    this.timer = window.setInterval(schedule, 40);
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private click(time: number, accent: boolean): void {
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = "square";
    oscillator.frequency.value = accent ? 1760 : 1175;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.35 : 0.22, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);
    oscillator.connect(gain).connect(this.output);
    oscillator.start(time);
    oscillator.stop(time + 0.06);
  }
}
