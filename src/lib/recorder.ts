// Browser-only. Captures the audio of a chosen window/tab plus the microphone,
// mixes them, and hands back compressed chunks every few seconds.
//
// It also keeps a timeline of when the microphone is the loud one, which is
// how the notes know which lines were the user's. See self-speech.ts.

import { audibleSeconds, isHeard, isSelfSample, rmsDb, SAMPLE_MS, SIGNAL_FLOOR_DB, windowsFromMarks, type Mark, type Window } from "./self-speech";

export const CHUNK_MS = 5000;
export const AUDIO_BITRATE = 32_000; // opus at 32 kbps: clear speech, ~14 MB per hour
export const MAX_RECORDING_SECONDS = 3.5 * 3600; // keeps a recording under the 50 MB upload cap
export const WARN_RECORDING_SECONDS = 3 * 3600;

/**
 * How long nothing may be heard before capture is paused.
 *
 * Transcription is billed by the length of the audio, not by what is in it, so
 * a meeting with a twenty-minute break in it costs twenty minutes of nothing.
 * Pausing the recorder simply leaves that stretch out of the file; there is no
 * re-encoding and no cutting afterwards.
 *
 * The floor this measures against is digital silence (-70 dBFS), not a speech
 * threshold. Room tone through an open microphone sits far above it, so this
 * only fires when nothing at all is arriving: a muted mic and a silent
 * meeting. That matters, because capture resumes on the first sample above the
 * floor, and a sample is 200ms: room noise wakes it well before anybody
 * speaks. On a truly silent line the first fifth of a second could be lost,
 * which is why the threshold is generous rather than eager.
 */
export const TRIM_AFTER_SILENT_SECONDS = 45;

/** Long enough to ask whether the meeting is still going. */
export const SILENCE_PROMPT_SECONDS = 180;
/** And how long the question waits for an answer before recording is stopped. */
export const SILENCE_GRACE_SECONDS = 120;

export type SilenceAction = "none" | "ask" | "stop";

/**
 * What a stretch of silence calls for. Pure, so the thresholds can be checked
 * without a microphone, and shared, so the banner and the stop can never
 * disagree about when each one happens.
 *
 * `answered` is someone having said the meeting is still going. It holds only
 * until something is heard again, at which point the caller clears it: one
 * answer should not license an hour of silence later on.
 */
export function silenceAction(silentSeconds: number, answered: boolean): SilenceAction {
  if (answered || !Number.isFinite(silentSeconds)) return "none";
  if (silentSeconds >= SILENCE_PROMPT_SECONDS + SILENCE_GRACE_SECONDS) return "stop";
  if (silentSeconds >= SILENCE_PROMPT_SECONDS) return "ask";
  return "none";
}

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
  /** Wall-clock moment the current silent run began, null while anything is audible. */
  private silentSince: number | null = null;
  /** Total seconds left out of the file so far. */
  private trimmed = 0;
  private pausedAt: number | null = null;

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
      const now = ctx.currentTime;
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
      // Two different questions, and they need two different floors.
      // `sound` asks whether anything is arriving, which is what catches a
      // recording that is capturing nothing. `heard` asks whether anyone is
      // speaking, which is what a lull means. An open microphone answers yes
      // to the first at all times, so the second is the one silence hangs off.
      const sound = Math.max(micDb, meetingDb) > SIGNAL_FLOOR_DB;
      const heard = isHeard(micDb, meetingDb);

      if (heard) {
        this.silentSince = null;
        this.resumeCapture(now);
      } else {
        if (this.silentSince === null) this.silentSince = now;
        if (now - this.silentSince >= TRIM_AFTER_SILENT_SECONDS) this.pauseCapture(now);
      }

      // Nothing is being written while paused, so nothing is marked: the marks
      // have to describe the file, not the room, or the timeline they carry
      // would no longer line up with the transcript's.
      if (this.pausedAt !== null) return;

      this.marks.push({
        t: now - t0 - this.trimmed,
        self: this.micAnalyser ? isSelfSample(micDb, meetingDb, !!this.sysAnalyser) : false,
        sound,
      });
    }, SAMPLE_MS);
  }

  /** Stops writing audio. Safe to call when already paused. */
  private pauseCapture(now: number): void {
    if (this.pausedAt !== null) return;
    const r = this.recorder;
    if (!r || r.state !== "recording") return;
    r.pause();
    this.pausedAt = now;
  }

  /** Starts writing again, and remembers how much was left out. */
  private resumeCapture(now: number): void {
    if (this.pausedAt === null) return;
    this.trimmed += now - this.pausedAt;
    this.pausedAt = null;
    const r = this.recorder;
    if (r && r.state === "paused") r.resume();
  }

  /** Seconds of silence left out of the file. Counts the current pause too. */
  trimmedSeconds(): number {
    const live = this.pausedAt !== null && this.ctx ? this.ctx.currentTime - this.pausedAt : 0;
    return this.trimmed + live;
  }

  /** True while nothing is being written because nothing is being heard. */
  isTrimming(): boolean {
    return this.pausedAt !== null;
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

  /**
   * How long it has been silent right now, in real time.
   *
   * Read from the wall clock rather than from the marks: while capture is
   * paused no marks are written, so a marks-based answer would freeze at the
   * moment trimming began and the "still there?" prompt would never fire.
   */
  silentForSeconds(): number {
    if (this.silentSince === null || !this.ctx) return 0;
    return this.ctx.currentTime - this.silentSince;
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    // Close an open pause so the trimmed total is right, and so the recorder
    // is in a state that can actually be stopped.
    if (this.ctx) this.resumeCapture(this.ctx.currentTime);
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
