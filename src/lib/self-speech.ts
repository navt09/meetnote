import type { TranscriptSegment } from "./schema";

/**
 * Who is talking, without a name and without a model.
 *
 * The recorder holds two streams before it mixes them: the microphone, which
 * is the person using the product, and the shared window's audio, which is
 * everyone else. Sampling their loudness side by side says when the user is
 * the one speaking. That timeline rides along with the recording, and after
 * transcription it stamps their lines with their name.
 *
 * Why loudness rather than diarisation or a name: diarisation labels voices
 * "Speaker 0" and cannot know which one is you; listening for a name only
 * catches the moments someone says it. The microphone is a physical fact.
 *
 * The one weak spot is laptop speakers. Other people's voices leak into the
 * mic, so a plain "mic is loud" test would count them. Hence the margin: the
 * mic has to be clearly louder than the meeting audio, and that is only true
 * of the person sitting at it. With no meeting audio at all (mic only), every
 * voice in the room counts as the user; nothing better is possible there.
 *
 * Everything in this file is pure and shared by the browser and the server.
 */

/** [start, end] in seconds from the beginning of the recording. */
export type Window = [number, number];

export const SAMPLE_MS = 200;
/**
 * How long one sample is allowed to stand for. The browser clamps timers in a
 * background tab to about a second, and the recorder tab is backgrounded
 * whenever someone is actually looking at their meeting, so the real gap
 * between samples is routinely five times the nominal one. Beyond this, we
 * admit we do not know what happened rather than stretching a 20ms reading
 * across it.
 */
export const MAX_SAMPLE_SPAN_S = 1.5;
/** Below this the mic is background noise, whatever the meeting audio is doing. */
export const SELF_MIN_DB = -50;
/** The mic must beat the meeting audio by this much: bleed never does, a person at the mic always does. */
export const SELF_MARGIN_DB = 6;
/** Hard cap on stored windows, so a hostile client cannot pad a row. */
export const MAX_WINDOWS = 5000;

/**
 * Below this there is no signal at all, as opposed to a quiet room. A muted
 * microphone or a shared window with no audio reads near -100; even a silent
 * office reads well above this. Used to catch a recording that is capturing
 * nothing, which is the only kind of long recording worth stopping - it costs
 * real money to transcribe and cannot produce anything.
 */
export const SIGNAL_FLOOR_DB = -70;

/**
 * Above this somebody is talking; below it for long enough, nobody is.
 *
 * SIGNAL_FLOOR_DB cannot answer this question, and its own comment above says
 * why: a silent office reads well above it. That is exactly right for "is
 * anything being captured at all" and exactly wrong for "is anyone speaking".
 * Using it to find a lull meant an open microphone kept the room permanently
 * loud, so no silence was ever trimmed and the still-there prompt could never
 * fire, on any recording with a live mic. Which is all of them.
 *
 * The same -50 that decides the microphone is a person rather than background
 * noise decides it here, for the same reason.
 */
export const SPEECH_FLOOR_DB = SELF_MIN_DB;

/**
 * True when either side is loud enough to be somebody speaking.
 *
 * Read over a long window, never one sample: a single quiet moment is a breath,
 * and it takes 45 seconds of these in a row before anything is trimmed.
 */
export function isHeard(micDb: number, meetingDb: number): boolean {
  return Math.max(micDb, meetingDb) > SPEECH_FLOOR_DB;
}

/** RMS loudness in dBFS of one analyser frame. Floors at -100 rather than -Infinity. */
export function rmsDb(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  const rms = Math.sqrt(sum / Math.max(1, frame.length));
  return rms > 0 ? Math.max(-100, 20 * Math.log10(rms)) : -100;
}

export function isSelfSample(micDb: number, meetingDb: number, hasMeetingAudio: boolean): boolean {
  if (micDb < SELF_MIN_DB) return false;
  if (!hasMeetingAudio) return true;
  return micDb - meetingDb >= SELF_MARGIN_DB;
}

/**
 * One reading, stamped with when it was taken. `self` is whether the user was
 * the one speaking; `sound` is whether there was any signal at all, from
 * either source, which is a different and much cruder question.
 */
export type Mark = { t: number; self: boolean; sound: boolean };

/**
 * Turns timestamped readings into merged windows.
 *
 * Timestamps come from the audio clock, not from counting samples: an earlier
 * version multiplied a sample count by the nominal interval, which silently
 * compressed the whole timeline whenever the browser throttled the timer.
 *
 * Each "self" reading stands for the span until the next reading, capped at
 * MAX_SAMPLE_SPAN_S. Runs shorter than minMs are dropped (a cough, a chair)
 * and gaps shorter than joinMs are bridged (the pause between two words).
 */
export function windowsFromMarks(marks: Mark[], minMs = 400, joinMs = 300): Window[] {
  const raw: Window[] = [];
  for (let i = 0; i < marks.length; i++) {
    if (!marks[i].self) continue;
    const start = marks[i].t;
    const next = marks[i + 1]?.t;
    // The last reading has nothing after it to bound it, so it stands only for
    // its own nominal interval. The generous cap is for bridging between two
    // readings; there is no such evidence at the tail of a recording.
    const span = next === undefined ? SAMPLE_MS / 1000 : Math.min(next - start, MAX_SAMPLE_SPAN_S);
    if (span <= 0) continue;
    const prev = raw[raw.length - 1];
    if (prev && start <= prev[1]) prev[1] = Math.max(prev[1], start + span);
    else raw.push([start, start + span]);
  }

  const joined: Window[] = [];
  for (const w of raw) {
    const prev = joined[joined.length - 1];
    if (prev && w[0] - prev[1] <= joinMs / 1000) prev[1] = w[1];
    else joined.push([w[0], w[1]]);
  }

  // Compared with a tolerance: these are floating-point seconds off an audio
  // clock, and a window of exactly minMs can measure a hair under it purely
  // by where it sits on the timeline (30.4 - 30 is 0.39999999999999858).
  return joined.filter((w) => (w[1] - w[0]) * 1000 >= minMs - 1e-6);
}

/** Seconds of the recording in which anything at all was audible. */
export function audibleSeconds(marks: Mark[]): number {
  let total = 0;
  for (let i = 0; i < marks.length; i++) {
    if (!marks[i].sound) continue;
    const next = marks[i + 1]?.t;
    total += next === undefined ? SAMPLE_MS / 1000 : Math.min(next - marks[i].t, MAX_SAMPLE_SPAN_S);
  }
  return total;
}

/**
 * How long it has been silent at the end of the run. This is the live signal:
 * a minute of nothing means the capture is wrong, not that the room went
 * quiet, and it is worth interrupting someone over before they record an hour
 * of it.
 */
export function trailingSilenceSeconds(marks: Mark[]): number {
  if (marks.length === 0) return 0;
  const last = marks[marks.length - 1].t;
  for (let i = marks.length - 1; i >= 0; i--) {
    if (marks[i].sound) return last - marks[i].t;
  }
  return last - marks[0].t;
}

/**
 * Validates windows sent by a browser. Anything malformed is dropped rather
 * than rejected, because a bad timeline should cost the user their "for you"
 * notes, not their recording.
 */
export function parseSelfSpeech(input: unknown, maxSeconds: number): Window[] {
  if (!Array.isArray(input)) return [];
  const cap = Number.isFinite(maxSeconds) && maxSeconds > 0 ? maxSeconds : 4 * 3600;
  const out: Window[] = [];
  for (const item of input.slice(0, MAX_WINDOWS)) {
    if (!Array.isArray(item) || item.length !== 2) continue;
    const a = Number(item[0]);
    const b = Number(item[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const start = Math.max(0, Math.min(cap, a));
    const end = Math.max(0, Math.min(cap, b));
    if (end > start) out.push([start, end]);
  }
  out.sort((x, y) => x[0] - y[0]);
  const merged: Window[] = [];
  for (const w of out) {
    const prev = merged[merged.length - 1];
    if (prev && w[0] <= prev[1]) prev[1] = Math.max(prev[1], w[1]);
    else merged.push([w[0], w[1]]);
  }
  return merged;
}

/** Seconds of a segment that fall inside the windows. Windows must be sorted and non-overlapping. */
function overlapSeconds(start: number, end: number, windows: Window[]): number {
  let total = 0;
  for (const [a, b] of windows) {
    if (b <= start) continue;
    if (a >= end) break;
    total += Math.min(b, end) - Math.max(a, start);
  }
  return total;
}

/**
 * Relabels the segments that are the user's. A segment counts when at least
 * minOverlap of its duration sits inside the self windows; a zero-length
 * segment counts when its instant does.
 *
 * Neighbouring self segments are merged, since diarisation may have split one
 * person's turn across two speaker ids and the mic says it was one person.
 */
export function tagSelf(segments: TranscriptSegment[], windows: Window[], label = "You", minOverlap = 0.5): TranscriptSegment[] {
  if (windows.length === 0) return segments;
  const out: TranscriptSegment[] = [];
  for (const s of segments) {
    const dur = s.end - s.start;
    const inside = dur > 0 ? overlapSeconds(s.start, s.end, windows) / dur >= minOverlap : overlapSeconds(s.start, s.start + 0.001, windows) > 0;
    const seg: TranscriptSegment = inside ? { ...s, speaker: label } : { ...s };
    const prev = out[out.length - 1];
    if (prev && inside && prev.speaker === label && seg.start - prev.end <= 1.0) {
      prev.text = `${prev.text} ${seg.text}`;
      prev.end = seg.end;
    } else {
      out.push(seg);
    }
  }
  return out;
}
