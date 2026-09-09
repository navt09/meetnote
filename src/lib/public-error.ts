// Turns internal failures into something safe and useful to show a customer.
// Vendor names, status codes, storage paths and stack detail stay server-side.
// Pure functions, unit-tested.

export type PublicFailure = {
  /** Stable code we can log and branch on. */
  code:
    | "no_speech"
    | "no_audio"
    | "upload_incomplete"
    | "too_long"
    | "transcription_failed"
    | "notes_failed"
    | "notes_declined"
    | "storage_failed"
    | "unknown";
  /** Shown to the user. Says what happened and what to do. */
  message: string;
  /** Whether "Try again" is worth offering. */
  retryable: boolean;
};

const RULES: Array<[RegExp, PublicFailure]> = [
  [
    /no speech was detected/i,
    { code: "no_speech", message: "We couldn't hear any speech in this recording. Check that “Share audio” was ticked when you picked the window.", retryable: false },
  ],
  [
    /no recording uploaded|no audio for this meeting|has no storage path/i,
    { code: "no_audio", message: "This meeting has no audio attached.", retryable: false },
  ],
  [
    /hasn't finished uploading|recording not found in storage/i,
    { code: "upload_incomplete", message: "The audio didn't finish uploading. Record again, or re-upload this meeting.", retryable: true },
  ],
  [
    /too long to summarize|transcript has \d+ words|is too long/i,
    { code: "too_long", message: "This meeting is too long to summarise in one go. Try splitting it into shorter recordings.", retryable: false },
  ],
  [
    /declined to process/i,
    { code: "notes_declined", message: "We couldn't write notes for this recording. If it contains sensitive content, that may be why.", retryable: false },
  ],
  [
    /deepgram|transcription failed|listen\?/i,
    { code: "transcription_failed", message: "Transcription didn't finish. This is usually temporary, so try again in a minute.", retryable: true },
  ],
  [
    /anthropic|claude|malformed notes|did not match the expected shape|max_tokens/i,
    { code: "notes_failed", message: "We couldn't write the notes for this recording. Try again in a minute.", retryable: true },
  ],
  [
    /storage|bucket|signed url/i,
    { code: "storage_failed", message: "We couldn't reach the stored audio. Try again in a minute.", retryable: true },
  ],
];

export function toPublicFailure(err: unknown): PublicFailure {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  for (const [re, out] of RULES) if (re.test(raw)) return out;
  return { code: "unknown", message: "Something went wrong while processing this meeting. Try again in a minute.", retryable: true };
}

/** Message safe to store on the row and show in the UI. */
export function publicErrorMessage(err: unknown): string {
  return toPublicFailure(err).message;
}
