# From the Call

Meeting-notes SaaS. Read PLAN.md first for product, stack, phases, and the account checklist.

## Hard rules
- This product is separate from Protegion Life. Never deploy to the "Protegion Life's projects" Vercel team or create resources in the "Protegion" Supabase organization. From the Call's Supabase project and Vercel project live in separate accounts that are not reachable from the MCP connectors in this session.
- Secrets live only in `.env.local` (git-ignored). Template: `.env.example`. Never write real values into `.env.example`.
- Plain code wherever possible; the LLM is only used to understand language (extracting tasks from a transcript, drafting text). Explain every new AI call.
- Every API route checks auth via `getAuth(req)` (cookie session or `Authorization: Bearer`). Row Level Security on `meetings` is the real boundary; the service role is only used for storage signing and the post-response pipeline, always scoped by `user_id`.

## Navigation
Tabs when signed in, in order: **Home** (`/dashboard`), **Notes** (`/notes`, the meeting list with summary previews), **Tasks** (`/tasks`, every action item across meetings), **Approvals** (`/approvals`), **Record** (`/record`), **Settings** (`/settings`), and **Owner** (`/owner`) for owner accounts only. Record sits before Settings because it is what people come to do. Signing in lands on `/dashboard`. `/meetings` redirects to `/notes`; `/meetings/[id]` is still the single-meeting page. Tab state lives in `src/components/nav-tabs.tsx`.

## Charts
- Series colours are `--chart-1` / `--chart-2` in `globals.css`, in that fixed order, never cycled. Each surface has its own validated pair: the app's (`#1f6fd0` / `#b4460f`) pass all six checks against the light card `#fdfcfa`, which is the only ground a chart is drawn on, the marketing surface keeps the dark-mode steps. **The UI accents fail the lightness band; do not use them for chart marks.**
- Before changing or adding a series colour, run the validator in the `dataviz` skill (`node scripts/validate_palette.js "<hex,...>" --mode dark --surface "#121214"`) and fix any FAIL. Don't eyeball it.
- One axis only, never two y-scales. Bars: 4px rounded ends anchored to the baseline, 2px gap between adjacent bars, solid hairline gridlines (never dashed). Two or more series always get a legend. Every chart ships a hover tooltip and a "View as table" fallback.
- Dashboard aggregation lives in `src/lib/stats.ts`, all pure and time-injectable so tests aren't date-dependent.

## Tasks
Action items are mirrored from `meetings.notes` into a real `tasks` table by `syncTasks()` in `src/lib/pipeline.ts`, keyed on `(meeting_id, idx)`. Re-running extraction upserts the same rows, so a person's "done" tick survives; rows beyond the new count are pruned. Only `status` is editable through the API. Deleting a meeting cascades to its tasks.

## Layout
- `src/proxy.ts` — Next 16 request proxy: refreshes the Supabase session cookie, redirects signed-out users away from `/record` and `/meetings`.
- `src/lib/supabase/{client,server}.ts` — browser client; cookie server client; `getAuth()`.
- `src/lib/supabase-admin.ts`, `src/lib/storage.ts` — service-role client, signed upload/download URLs, object existence check.
- `src/lib/recorder.ts`, `src/lib/recording-store.ts` — browser capture (screen-share audio + mic, 32 kbps opus, 5 s chunks) and IndexedDB backup/recovery.
- `src/lib/upload.ts` — browser side of the save flow: create meeting → PUT audio to signed URL (progress, retries) → start processing.
- `src/app/api/meetings/*` — CRUD + `process` (runs `runPipeline` in `after()` so it survives the tab closing) + `upload-url` + `audio`.
- `src/lib/pipeline.ts` — transcribe (Deepgram by signed link) → extract (Claude) with status written to the row; resumable via `nextStep()`.
- `src/lib/extract.ts` — Claude structured output (streamed, Zod-validated) + token usage and cost.
- `src/lib/{cost,retry,transcript,markdown,paths,meeting}.ts` — pure helpers, unit-tested in `src/lib/__tests__/`.
- `src/app/{login,meetings,meetings/[id],record}` — pages. `src/components/notes.tsx` renders notes/transcript.
- `supabase/migrations/*.sql` — schema; applied with `npm run migrate` (needs `SUPABASE_DB_URL`).
- `scripts/e2e.mjs` — signed-in end-to-end test using a throwaway user (no email needed).

## Commands
- `npm run dev` — local server on http://localhost:3000
- `npm test` — unit tests (vitest)
- `npm run migrate` — apply pending SQL migrations
- `npm run e2e [baseUrl]` — full pipeline test against local or production
- `npm run build` — must pass before pushing
- `npm run lint`

## Keeping internals out of the browser
- API routes return `PublicMeeting` / `PublicMeetingSummary` (`src/lib/meeting.ts`), never the raw row. No `user_id`, `storage_path`, token counts or costs unless the caller is an owner (`OWNER_EMAILS`, checked by `src/lib/admin.ts`).
- Failures are translated by `src/lib/public-error.ts` before they reach a response or the `meetings.error` column. Vendor names, status codes and paths go to `console.error` only. There is a test asserting nothing leaks.
- Security headers and `poweredByHeader: false` are set in `next.config.ts`; `/api/*` is `no-store`.
- Deleting a user does NOT delete their audio: storage has no cascade. Any account-deletion feature must clear `<user_id>/` in the bucket first (see `--clean` in `scripts/seed-demo.mjs`).

## UI
- **The app has three grounds, and they must stay apart.** The page (`--bg` `#edeae4`) is warm paper you could not mistake for white, a card (`--panel` `#fdfcfa`) is a sheet laid on it, and anything recessed (`--bg-elev` / `--panel-hi` `#f2efe9`) drops back toward the page: fields, the waveform, hovers. An earlier palette set the page and the card to the same value and every card dissolved; do not collapse them again. Band rows sit on `--panel`, not `--bg`.
- **Figures are mono, never the serif.** Anything counted, timed or measured wears `.figure` (IBM Plex Mono, tabular digits, tight tracking) so columns line up and a ticking number does not jitter. Fraunces is for words. `.strip` is a row of facts divided by hairlines, one object read across; `.eyebrow-bare` is the eyebrow without its chevron, for a run of them.
- **Two surfaces, not one theme.** `layout.tsx` puts `marketing` or `app` on `<body>` and `globals.css` scopes every token to that class. Signed out is the shopfront: dark, animated, a top header, the landing page's live demo. Signed in is the tool: warm light paper, a sidebar, serif headings. They are deliberately different places; do not try to make one palette serve both.
- **The shopfront is a run of full-width bands**, ink then paper then ink (`src/app/page.tsx`). The marketing `<main>` has no width; each band carries its own ground and puts a `.wrap` (72rem) inside. A paper band is `section.light`, which redefines every token to the app's palette so the same `.btn`, `.glass`, `.pill` and `.band` classes work on either ground. Every band opens with `.sec-head`: a mono `.eyebrow`, a `.display` serif title (Fraunces 400) on the left, the one action on the right, a hairline under both. The primary button on the dark surface is paper on ink; the blue accent is for eyebrows, the logo and the live parts of the demo, not for buttons.
- Landing-page motion: `hero-in` staggers the hero on load; `src/components/reveal.tsx` fades sections up on scroll but only arms things that start off screen, so the page is whole at rest with no JavaScript; `src/components/how-it-works.tsx` cycles four tabs with a filling line and hand-drawn stage pictures (no fetches, fixed words). All three collapse under `prefers-reduced-motion`.
- **Three hues that mean something.** In the app, work is `--work` red, what was agreed is `--agreed` green, people to contact is `--people` blue, each rendered as a `.band` (tinted container, hue-coloured `.band-title`, rows on the page colour inside). The summary is deliberately uncoloured: it is the whole meeting, not one kind of thing in it.
- **The primary button is ink, not a colour.** A fourth hue would compete with the three that carry meaning, so `--btn-bg` is near-black on paper. `--accent` is the work hue and is for interactive text (draft ticket, add to calendar).
- Type: Fraunces for headings and the wordmark (`font-display`), IBM Plex Sans for body, IBM Plex Mono for counts and timestamps. Most of this product is small text, which is why the body face is Plex.
- **The two surfaces share their type, not their palette.** Both use `.display` (Fraunces 400, tight tracking) for titles and figures, and `.eyebrow` (mono, uppercase, letter-spaced, with a `›`) for small labels; in the app the eyebrow drops to `--faint` because a red label would claim a meaning it does not have. Every app page opens with `PageHead` (`src/components/ui.tsx`), which is `.sec-head`: title left, action right, hairline under both. Add a page, use `PageHead`; do not hand-roll an `<h1>`.
- Priority is a filled `.flag` (`flag-high` / `flag-med` / `flag-off`), never an outlined chip: on a light ground an outline reads as a disabled control. Shared in `src/components/priority.tsx`.
- Everything is disabled under `prefers-reduced-motion`; keep it that way.
- Shared pieces: `src/components/ui.tsx` (skeletons, status pill, stepper, empty state), `src/components/toast.tsx` (`useToast()`), `src/components/notes.tsx`, `src/components/sidebar.tsx`. Use a toast, never `alert()`.
- `npm run seed:demo` creates a demo account with a finished meeting for looking at the UI; `npm run seed:demo -- --clean` removes them and their audio.

## Conventions
- Anthropic SDK only for LLM calls; structured output via `zodOutputFormat` and Zod validation of the parsed JSON. Extraction (`src/lib/extract.ts`) runs `claude-sonnet-5`. Drafting (`src/lib/agent.ts`) runs `claude-haiku-4-5`; a bad draft is still read and approved by a person before anything is sent, which is what makes the cheaper model an acceptable trade here. `src/lib/cost.ts` prices each call by the exact model it used (`MODEL_PRICING`, keyed by model string), so the three never cost themselves at another's rate.
- Every vendor call logs one JSON line (`event`, sizes, usage, `costUsd`) so spend is visible in Vercel logs.

- Storage bucket is `recordings` (private). Object paths are `<user_id>/<yyyy-mm>/<meeting_id>.<ext>`; ownership is checked with `pathBelongsTo()`.
- Meeting status machine: recorded → uploaded → transcribing → transcribed → extracting → done, or error (retryable; finished steps are skipped).

## Who is talking, and notes for the user
- The recorder holds the microphone and the shared window's audio as separate streams before mixing them. Five times a second it compares their loudness (`src/lib/self-speech.ts`, pure and unit-tested): the mic is the user when it is above a floor **and** clearly louder than the meeting audio, which is what defeats speaker bleed. The result is a compact `[start, end]` timeline sent with the meeting and stored in `meetings.self_speech` (internal; never returned to the browser).
- After transcription, `tagSelf()` relabels the user's segments with their name (`user_settings.display_name`, else "You") by overlap arithmetic. No model is involved in deciding who spoke. Diarisation still labels everyone else "Speaker N".
- The name is optional and entered once in Settings. It is a supplement, not the mechanism: it lets the notes catch other people saying it and puts it on the user's lines.
- `notes.for_you` (committed, asked_of_you, heads_up, mentioned) comes from the **same single extraction call**, which is told the user's label. Empty lists are the honest answer. Notes written before this section existed have no `for_you`; the renderer treats it as absent.
- Mic-only recordings (no shared audio) count every voice in the room as the user; that is the documented limit, not a bug.

## The agent (Phase 3)
- `src/lib/agent.ts` is the only place the model writes text a person might send. It drafts a ticket from a task, or a follow-up email for someone the notes named. It rephrases the transcript and never invents facts; when something is missing it says so in the draft.
- Drafts land in the `drafts` table as `pending` and show on `/approvals`. A person edits, approves or dismisses. **Nothing is ever sent from From the Call without an explicit approval**, and there is no code path that sends without one.
- An email can only be drafted for a person already in that meeting's `people_to_contact`; free-text targets are refused.
- One live ticket draft per task (unique index on `drafts.task_id`; upsert replaces). Drafts cascade away with their meeting.
- Draft bodies keep their Markdown, because that is what Linear and Jira expect on paste. `src/lib/markdown-lite.ts` renders a preview as React elements, never HTML, so model output cannot inject markup.

## Connectors (Phase 3)
- Third-party credentials are encrypted with AES-256-GCM (`src/lib/crypto.ts`) before being stored, keyed by `CREDENTIALS_KEY`. They are **never** returned to the browser: `/api/connectors` selects only `provider,config,last_error,created_at`. `config` holds non-secret settings only (chosen team, project key, masked key hint).
- `src/lib/providers/{linear,jira,slack,google}.ts` are the API clients; `src/lib/deliver.ts` is the only place an approved draft is sent anywhere. It is reached solely from the approve branch of `PATCH /api/drafts/[id]`, and only when `external_url` is still null, so nothing is ever sent twice.
- A failed send does not undo the approval; the route returns 200 with a `warning` and `needsReconnect` so the UI can explain rather than silently lose the approval.
- Provider gotchas already handled, each verified against current docs: Linear takes the API key raw with **no** `Bearer` prefix and returns errors in a 200 body; Jira v3 needs Atlassian Document Format, not Markdown (`markdownToAdf`); Slack mrkdwn uses single asterisks for bold and must escape `&`, `<`, `>` or transcript text can forge `<!channel>`; Google needs `access_type=offline` **and** `prompt=consent` or no refresh token is issued.
- Slack uses an incoming webhook (paste a URL, no OAuth app). The tradeoff: one fixed channel, and messages cannot be edited later. Moving to an OAuth app with `chat.postMessage` is the upgrade path.
- **Google scope discipline matters commercially.** `gmail.send` and `calendar.events.readonly` are *sensitive* scopes: app verification is needed past 100 users, but not the annual third-party security assessment. Every broader Gmail scope (`compose`, `modify`, `readonly`) is *restricted* and does trigger that assessment. Do not widen them.
- Bring-your-own-LLM currently means the customer's own Anthropic key plus a model choice (`src/lib/llm.ts`). A broken stored key falls back to ours rather than breaking the pipeline.
