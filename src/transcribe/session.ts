import { Metronome } from "../audio/metronome";
import { NoteTracker, type RawNote, type TrackerFrame, type TrackerOptions } from "./tracker";

export interface InputDevice {
  id: string;
  label: string;
}

/**
 * Lists audio inputs. Browsers hide device names until microphone permission has been granted, so
 * this asks for access once (and releases it again) before listing.
 */
export async function listInputDevices(): Promise<InputDevice[]> {
  const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
  probe.getTracks().forEach((track) => track.stop());
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((device) => device.kind === "audioinput")
    .map((device, index) => ({ id: device.deviceId, label: device.label || `Input ${index + 1}` }));
}

// Posts the raw audio of the first channel to the main thread, together with the audio-clock time of each block.
const WORKLET_SOURCE = `
class Tap extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) this.port.postMessage({ block: channel.slice(), time: currentTime });
    return true;
  }
}
registerProcessor('tab2share-tap', Tap);
`;

export interface RecordingSettings {
  /** Tempo the player follows (already slowed down for practice, if the player chose that). */
  bpm: number;
  beatsPerBar: number;
  countInBars: number;
  metronome: boolean;
}

/** One open microphone/interface: live level + pitch, optional metronome, and note capture. */
export class ListenSession {
  private tracker: NoteTracker;
  private metronome: Metronome;
  private recordingStart: number | null = null;
  private latestFrame: TrackerFrame | null = null;

  private constructor(
    private readonly context: AudioContext,
    private readonly stream: MediaStream,
    private readonly node: AudioWorkletNode,
    private readonly gainNode: GainNode,
    private options: TrackerOptions,
    private readonly onFrame: (frame: TrackerFrame) => void,
  ) {
    this.metronome = new Metronome(context);
    this.tracker = this.makeTracker();
    node.port.onmessage = (event: MessageEvent<{ block: Float32Array; time: number }>) => {
      this.tracker.feed(event.data.block, event.data.time);
    };
  }

  static async open(
    deviceId: string | undefined,
    options: TrackerOptions,
    onFrame: (frame: TrackerFrame) => void,
    gainDb = 0,
  ): Promise<ListenSession> {
    // Raw signal: the browser's voice-call processing would squash a guitar's dynamics and attacks.
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    });
    const context = new AudioContext({ latencyHint: "interactive" });
    const moduleUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "application/javascript" }));
    try {
      await context.audioWorklet.addModule(moduleUrl);
    } finally {
      URL.revokeObjectURL(moduleUrl);
    }
    if (context.state === "suspended") await context.resume();

    const source = context.createMediaStreamSource(stream);
    // A quiet guitar signal (passive pickups into a mic input, a low interface gain) is boosted here, before analysis.
    const gainNode = context.createGain();
    gainNode.gain.value = Math.pow(10, gainDb / 20);
    const node = new AudioWorkletNode(context, "tab2share-tap", { numberOfInputs: 1, numberOfOutputs: 0 });
    source.connect(gainNode).connect(node);
    return new ListenSession(context, stream, node, gainNode, options, onFrame);
  }

  private makeTracker(): NoteTracker {
    return new NoteTracker(this.context.sampleRate, this.options, (frame) => {
      this.latestFrame = frame;
      this.onFrame(frame);
    });
  }

  get sampleRate(): number {
    return this.context.sampleRate;
  }

  /** Seconds of capture elapsed since the recording started (negative during the count-in). */
  get recordingTime(): number | null {
    return this.recordingStart === null ? null : this.context.currentTime - this.recordingStart;
  }

  setOptions(options: TrackerOptions): void {
    this.options = options;
    this.tracker.setOptions(options);
  }

  /** Input gain in dB (0 = unchanged). Applies instantly. */
  setGain(db: number): void {
    this.gainNode.gain.setTargetAtTime(Math.pow(10, db / 20), this.context.currentTime, 0.02);
  }

  /** Starts the click (with count-in) and begins capturing notes at the downbeat that follows it. */
  startRecording(settings: RecordingSettings): void {
    this.tracker = this.makeTracker();
    const beatSeconds = 60 / settings.bpm;
    const countInClicks = settings.countInBars * settings.beatsPerBar;
    const firstClick = this.context.currentTime + 0.35;
    this.recordingStart = firstClick + countInClicks * beatSeconds;
    if (settings.metronome || countInClicks > 0) {
      this.metronome.start({
        bpm: settings.bpm,
        beatsPerBar: settings.beatsPerBar,
        firstClickTime: firstClick,
        // Count-in clicks always play; the click continues under the take only if the player wants it.
        totalClicks: settings.metronome ? undefined : countInClicks,
      });
    }
  }

  /** Notes heard so far, relative to the recording's downbeat; a still-ringing note gets a provisional end. */
  snapshot(): RawNote[] {
    if (this.recordingStart === null) return [];
    const start = this.recordingStart;
    const now = this.latestFrame?.time ?? this.context.currentTime;
    return this.tracker
      .snapshot(now)
      .filter((note) => note.end > start)
      .map((note) => ({ ...note, start: Math.max(0, note.start - start), end: note.end - start }));
  }

  stopRecording(): RawNote[] {
    this.metronome.stop();
    if (this.recordingStart === null) return [];
    const start = this.recordingStart;
    const notes = this.tracker
      .finish()
      .filter((note) => note.end > start)
      .map((note) => ({ ...note, start: Math.max(0, note.start - start), end: note.end - start }));
    this.recordingStart = null;
    this.tracker = this.makeTracker();
    return notes;
  }

  cancelRecording(): void {
    this.metronome.stop();
    this.recordingStart = null;
    this.tracker = this.makeTracker();
  }

  close(): void {
    this.metronome.stop();
    this.node.port.onmessage = null;
    this.gainNode.disconnect();
    this.node.disconnect();
    this.stream.getTracks().forEach((track) => track.stop());
    void this.context.close();
  }
}
