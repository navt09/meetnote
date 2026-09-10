// Browser-only. Captures the audio of a chosen window/tab plus the microphone,
// mixes them, and hands back compressed chunks every few seconds.
//
// It also keeps a timeline of when the microphone is the loud one, which is
// how the notes know which lines were the user's. See self-speech.ts.

import { audibleSeconds, isSelfSample, rmsDb, SAMPLE_MS, SIGNAL_FLOOR_DB, trailingSilenceSeconds, windowsFromMarks, type Mark, type Window } from "./self-speech";

export const CHUNK_MS = 5000;
export const AUDIO_BITRATE = 32_000; // opus at 32 kbps: clear speech, ~14 MB per hour
export const MAX_RECORDING_SECONDS = 3.5 * 3600; // keeps a recording under the 50 MB upload cap
export const WARN_RECORDING_SECONDS = 3 * 3600;

export type SupportCheck = {
  ok: boolean;
  reason?: string;
  chromium: boolean;
};

export function checkSupport(): SupportCheck {
  if (typeof window === "undefined") return { ok: false, reason: "Not in a browser", chromium: false };
  const ua = navigator.userAgent;
  const chromium = /Chrome\/|Edg\//.test(ua) && !/Firefox\//.test(ua);
  if (!navigator.mediaDevices?.getDisplayMedia) {
    return { ok: false, chromium, reason: "This browser can't capture screen audio. Use Chrome or Edge on a desktop." };
  }
  if (typeof MediaRecorder === "undefined") {
    return { ok: false, chromium, reason: "This browser can't record audio. Use Chrome or Edge on a desktop." };
  }
  if (/Mobi|Android|iPhone|iPad/.test(ua)) {
    return { ok: false, chromium, reason: "Screen audio capture isn't available on phones or tablets. Use a desktop browser." };
  }
  return { ok: true, chromium };
}

export function pickMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  for (const c of candidates) if (MediaRecorder.isTypeSupported(c)) return c;
  return "";
}

export type RecorderCallbacks = {
  onChunk: (blob: Blob, index: number) => void;
  onStop: () => void;
  onSourceEnded: () => void; // user hit the browser's own "Stop sharing"
  onError: (message: string) => void;
};

export class MeetingRecorder {
  readonly mimeType: string;
  hasSystemAudio = false;
  hasMic = false;
  analyser: AnalyserNode | null = null;

  private streams: MediaStream[] = [];
  private ctx: AudioContext | null = null;
  private recorder: MediaRecorder | null = null;
  private index = 0;
  private stopped = false;

  // One analyser per source, so the two can be compared. The public analyser
  // above hears the mix and only drives the waveform on screen.
  private micAnalyser: AnalyserNode | null = null;
  private sysAnalyser: AnalyserNode | null = null;
  private marks: Mark[] = [];
  private sampler: number | null = null;

  constructor(private cb: RecorderCallbacks) {
    this.mimeType = pickMimeType();
  }

  /** Throws with a user-facing message if capture can't start. */
  async start(): Promise<void> {
    if (!this.mimeType) throw new Error("No supported audio format for recording in this browser.");

    let display: MediaStream;
    try {
      display = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        // Chrome-only hints; ignored elsewhere
        ...({ systemAudio: "include", selfBrowserSurface: "exclude", surfaceSwitching: "include" } as object),
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError") throw new Error("Screen selection was cancelled.");
      throw new Error("Could not start screen capture. Check the browser's permission settings.");
    }
    this.streams.push(display);

    let mic: MediaStream | null = null;
    try {
      mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      this.streams.push(mic);
    } catch {
      mic = null; // Mic is optional; a denied mic just means we only get the other side.
    }

    const sysTracks = display.getAudioTracks();
    this.hasSystemAudio = sysTracks.length > 0;
    this.hasMic = !!mic;

    if (!this.hasSystemAudio && !this.hasMic) {
      this.dispose();
      throw new Error("No audio at all. Tick “Share audio” when choosing the window, or allow the microphone.");
    }

    const ctx = new AudioContext();
    this.ctx = ctx;
    await ctx.resume().catch(() => {});
    const dest = ctx.createMediaStreamDestination();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    this.analyser = analyser;

    if (this.hasSystemAudio) {
      const src = ctx.createMediaStreamSource(new MediaStream(sysTracks));
      src.connect(dest);
      src.connect(analyser);
      const own = ctx.createAnalyser();
      own.fftSize = 1024;
      src.connect(own);
      this.sysAnalyser = own;
    }
    if (mic) {
      const src = ctx.createMediaStreamSource(mic);
      src.connect(dest);
      src.connect(analyser);
      const own = ctx.createAnalyser();
      own.fftSize = 1024;
      src.connect(own);
      this.micAnalyser = own;
    }

    const recorder = new MediaRecorder(dest.stream, { mimeType: this.mimeType, audioBitsPerSecond: AUDIO_BITRATE });
    this.recorder = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.cb.onChunk(e.data, this.index++);
    };
    recorder.onerror = () => this.cb.onError("The recorder hit an error and stopped.");
    recorder.onstop = () => {
      this.dispose();
      this.cb.onStop();
    };

    // If the user ends the share from the browser's own bar, wrap up cleanly.
    for (const t of [...display.getVideoTracks(), ...sysTracks]) {
      t.addEventListener("ended", () => {
        if (!this.stopped) {
          this.cb.onSourceEnded();
          this.stop();
        }
      });
    }

    recorder.start(CHUNK_MS);

    // Who is talking, sampled against the audio clock rather than a count of
    // ticks. The browser clamps timers to about a second in a background tab,
    // and this tab IS backgrounded whenever someone is watching their meeting,
    // so ticks are not a reliable measure of elapsed time. ctx.currentTime is.
    const micFrame = new Float32Array(1024);
    const sysFrame = new Float32Array(1024);
    const t0 = ctx.currentTime;
    this.sampler = window.setInterval(() => {
      const t = ctx.currentTime - t0;
      let micDb = -100;
      if (this.micAnalyser) {
        this.micAnalyser.getFloatTimeDomainData(micFrame);
        micDb = rmsDb(micFrame);
      }
      let meetingDb = -100;
      if (this.sysAnalyser) {
        this.sysAnalyser.getFloatTimeDomainData(sysFrame);
        meetingDb = rmsDb(sysFrame);
      }
      this.marks.push({
        t,
        self: this.micAnalyser ? isSelfSample(micDb, meetingDb, !!this.sysAnalyser) : false,
        // Either source counts: this asks whether anything is being captured
        // at all, not who is talking.
        sound: Math.max(micDb, meetingDb) > SIGNAL_FLOOR_DB,
      });
    }, SAMPLE_MS);
  }

  /** When the user was the one speaking, as [start, end] seconds. Valid after stop. */
  selfSpeech(): Window[] {
    return windowsFromMarks(this.marks);
  }

  /** Seconds in which anything at all was audible. */
  audibleSeconds(): number {
    return audibleSeconds(this.marks);
  }

  /** Length of the recording as the audio clock measured it. */
  measuredSeconds(): number {
    return this.marks.length ? this.marks[this.marks.length - 1].t : 0;
  }

  /** How long it has been silent right now. Live, for warning mid-recording. */
  silentForSeconds(): number {
    return trailingSilenceSeconds(this.marks);
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    const r = this.recorder;
    if (r && r.state !== "inactive") {
      r.stop(); // triggers final ondataavailable, then onstop -> dispose
    } else {
      this.dispose();
      this.cb.onStop();
    }
  }

  dispose(): void {
    if (this.sampler !== null) window.clearInterval(this.sampler);
    this.sampler = null;
    for (const s of this.streams) for (const t of s.getTracks()) t.stop();
    this.streams = [];
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.analyser = null;
    this.micAnalyser = null;
    this.sysAnalyser = null;
  }
}
