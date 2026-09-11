# From the Call — build plan

Working name: **fromthecall** (rename any time). Started 2026-09-08.

## What it is

A web app that records the audio of any meeting you are in (Zoom, Teams, Google Meet, anything), transcribes it, pulls out what matters, and then *does the follow-up work* with your approval.

First niche: **engineering teams**. Standups, sprint planning, and bug triage produce action items that never get written down. From the Call turns them into draft Jira/Linear tickets the user approves with one click.

Differentiator vs Otter / Fireflies / Fathom / Granola: the agent that acts on the tasks, plus bring-your-own-LLM.

## How recording works (no bot)

The user clicks **Record**, picks the window or tab of their meeting app, and ticks "Share audio". The browser hands us that audio plus the microphone. We mix both, record locally, and upload when the meeting ends.

- Works today in Chrome and Edge on Windows with no install. Firefox and Safari do not expose system audio this way, so v1 is Chrome/Edge only.
- Later: a small desktop app (Tauri) for one-click recording and Mac support.
- Nothing joins the call. Nobody else sees a bot.

## Pipeline

```
browser recorder (5s chunks, backed up to IndexedDB as you go)
   --> upload straight to Supabase Storage via one-time signed URL
   --> /api/transcribe   Deepgram fetches the file by link; speaker labels
   --> /api/extract      Claude, strict JSON schema, streamed
   --> notes + action items + decisions + people + questions (+ cost of this meeting)
   --> approval queue  -->  connectors (Jira / Linear / Gmail / Slack)   [Phase 3]
```

Why the audio goes straight to storage: Vercel rejects request bodies over 4.5 MB, and an hour of audio is ~14 MB at our bitrate. The browser asks our server for a signed URL, then PUTs the file to Supabase itself. Deepgram then downloads it by link (2 GB limit).

Robustness built in:
- Chunks saved every 5 seconds to the browser's IndexedDB. A crashed tab or closed laptop leaves a recoverable recording; the page offers "Recover" on next visit.
- Warns before you leave the tab while recording or processing.
- 32 kbps opus keeps a 3.5-hour meeting under the 50 MB free-tier upload cap; auto-stops at 3.5 h.
- Uploads and Deepgram calls retry with backoff on network blips and 5xx.
- Each step (upload, transcribe, extract) can be retried alone; nothing is redone.
- Browser support is checked up front (Chrome/Edge desktop; phones and Firefox/Safari get a clear message).
- Every meeting shows what it cost, computed from real token and duration counts.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Web app | Next.js 16 (App Router, TypeScript, Tailwind) | One codebase for UI and API routes; Vercel deploys it natively |
| Hosting | Vercel (Hobby now, Pro later) | Zero-config deploys from GitHub |
| Database, auth, file storage | Supabase (new organization, free tier) | Postgres + login + audio storage in one place, with per-user row security |
| Transcription | Deepgram (nova-3, diarize) | Fast, cheap (~$0.25/hr), speaker labels built in |
| Extraction & agent | Claude Opus 5 via Anthropic SDK | Structured JSON output, tool use for the agent step |
| Background jobs | Inngest (add in Phase 2) | Transcription can exceed a web request's time limit |
| Billing | Stripe (Phase 3) | Subscriptions |

## Account checklist (you do these; I cannot create accounts)

1. **GitHub**: create an empty repo named `fromthecall` under your personal account. Do not add a README. Send me the URL and I will push the code.
2. **Vercel (Hobby)**: sign in with the GitHub account from step 1 at vercel.com, click *Add New > Project*, import `fromthecall`. Leave the settings as they are. Hobby is free; upgrade to Pro (creates a team, ~$20/mo) when you take on paying users. You can move the project into the team then.
3. **Supabase**: at supabase.com, *New organization* (free plan), then *New project* inside it, region `us-east-1` (or nearest you). Copy the Project URL and the anon/publishable key from *Project Settings > API*. If you use the same Supabase login as Protegion, the new org still shows up separately and I can manage it from here.
4. **Deepgram**: console.deepgram.com, create an API key. Comes with free credit.
5. **Anthropic**: console.anthropic.com, create an API key.

Put the keys in `.env.local` (copy `.env.example`). Never commit that file; it is already git-ignored.

## Phases

**Phase 1 (done 2026-09-08): record → transcript → structured notes, single user, no login.**
Recorder with crash recovery, direct-to-storage upload, transcription, extraction, results view with Markdown export and per-meeting cost. Unit tests for the pure helpers. Deployed on Vercel Hobby.

**Phase 2 (built 2026-09-08, needs the two dashboard steps below): accounts and persistence.**
Magic-link login (Supabase Auth), `meetings` table with Row Level Security, audio stored per user, meetings list and detail pages, rename, delete (audio + row), Markdown export. Processing runs on the server after the upload and keeps going if the tab closes; the detail page polls until it's done and offers "Try again" on failure without redoing finished steps. Signed-in end-to-end test script (`npm run e2e`) that needs no inbox.

Deferred from Phase 2: a real job queue (Inngest). Vercel's `after()` gives us up to 5 minutes of background work per request, which covers meetings up to roughly 2–3 hours. Add a queue when longer meetings or higher volume make that a problem.

Dashboard steps for Phase 2 (once):
1. Apply the schema: put the database connection string in `.env.local` as `SUPABASE_DB_URL` and run `npm run migrate`, or paste `supabase/migrations/0001_meetings.sql` into Supabase's SQL Editor and run it.
2. Supabase → Authentication → URL Configuration. Done from the repo rather than the dashboard: `node scripts/supabase-auth-config.mjs` reports, `--apply` writes. Site URL is `https://fromthecall.com`; the allow list carries the apex, www, the Vercel host, its preview wildcard and localhost.

Email limits: Supabase's built-in mailer sends at most 2 auth emails an hour and only to your project's team members. That is fine for you now. Before inviting anyone else, configure custom SMTP (Resend has a free tier) under Authentication → SMTP Settings.

**Phase 3 (started 2026-09-08): the agent.**

Done: drafting and approval. Pressing "draft ticket" on a task writes a real engineering ticket from the meeting transcript; "draft email" on a flagged person writes the follow-up. Everything lands in **Approvals**, where it can be edited, approved, dismissed or copied out. Nothing leaves From the Call without a person approving it, and the model can only draft for people the notes actually named.

Done since (2026-09-09): all four connectors. Linear, Jira, Slack and Google are OAuth apps with one-click Connect buttons in Settings; approved tickets are created as real Linear or Jira issues, approved emails send through the user's Gmail, tasks can be blocked out on their calendar, and summaries post to Slack. Credentials are encrypted at rest and never returned to the browser. All four consent flows are verified working against production.

Also done since: the notes say what the meeting means for the person who recorded it. The recorder measures which voice is theirs from the microphone against the meeting audio, so their own lines carry their name and the notes carry a "for you" section drawn from what they actually said.

Bring-your-own-LLM was removed, not deferred: it asked customers for an API key, which is exactly the kind of setup friction the OAuth work was meant to eliminate.

**Not yet true of Phase 3:** no connector has ever delivered anything to a real Linear, Jira, Slack or Google account. The consent flows are proven; the send path is not.

**Phase 4: money and polish.** Not started.
Stripe plans, team workspaces, desktop recorder, consent notice and retention settings. Search across meetings is done (2026-09-09): a `search_meetings` function in Postgres, security invoker so row level security decides what is searchable, matching titles, notes and transcript text with a snippet showing where it matched.

### Before anyone else can sign up

These are ordered by what unblocks what, not by size.

1. ~~**Buy the domain.**~~ Done 2026-09-11: `fromthecall.com`, live on Vercel.
2. ~~**Point it at Vercel and update every callback.**~~ Done 2026-09-11. **The apex is canonical**, and that is load-bearing: the connectors build their `redirect_uri` from the request's own origin, so if www served the app instead of redirecting to the apex, every Connect button would answer `redirect_uri_mismatch` against callbacks registered on the apex. Vercel 308s www to `https://fromthecall.com`; keep it that way, and keep `NEXT_PUBLIC_SITE_URL` agreeing with it.
3. ~~**Set `OWNER_EMAILS` in Vercel.**~~ Done 2026-09-11, alongside `NEXT_PUBLIC_SITE_URL`. Environment variables only reach a new deployment, so both needed a redeploy.
4. ~~**Publish the Google app to production.**~~ Done 2026-09-11. It sat in Testing, where Google expires every refresh token after seven days, so Gmail and Calendar connections died weekly. The scopes are *sensitive*, not *restricted*: verification is needed past 100 users, the annual security assessment is not. Do not widen them.
5. **Make `hello@fromthecall.com` receive mail.** It is on the landing page and both legal pages today, and it bounces.
6. **Usage cap and Resend, in the same change.** Custom SMTP is what actually opens signup to the world. Shipping it without a cap means strangers can spend money without limit. Either is safe alone in the other order; the combination to avoid is Resend first.
7. **Stripe.** Both pricing buttons currently create a free account, so the shopfront quotes a price nothing can charge.

### Known gaps worth naming

- ~~No account deletion.~~ Done 2026-09-09: Settings has a delete-account section guarded by typing your own email, checked on the server too. It clears `<user_id>/` from the bucket first and only then deletes the account, because the cascade does not reach storage. Verified against a real uploaded recording.
- **No usage cap, deliberately.** Decided 2026-09-09: a cap punishes the customer who uses the product most, and the exposure was never long meetings - it was recordings with nothing in them, since transcription is billed by length rather than content. The recorder already measures loudness, so it now says so at the time: a banner after 45 seconds of silence from both sources while recording, a refusal to save a recording with no audio in it at all, and a warning when a recording was almost entirely silence. That removes the waste without limiting anyone. A spend ceiling is still worth having before strangers can sign up, as a backstop rather than a cap.
- **Delivery untested end to end.** See Phase 3.

## Decisions and deferred work

Decided 2026-09-08:

- **No usage cap for now.** Nothing limits how much audio one account can process. Accepted knowingly. Revisit before the app is open to strangers; the natural shape is a monthly minutes allowance per account checked before transcription, plus a hard ceiling on total spend.
- **Custom SMTP (Resend) deferred.** Sign-in email still goes through Supabase's built-in mailer: 2 per hour, and only to addresses on the Supabase account's team.
- **Email verification stays on, revisit later.** Not turned off.

These three interact, and the order matters:

Because verification is on and the built-in mailer only reaches your own team, **nobody outside that team can finish signing up today**. Signup creates an unconfirmed account, the confirmation email never arrives, and without confirmation there is no session and therefore no access to any API route. That is currently what keeps the public URL from costing money, not anything we built.

So the day Resend is connected, signup genuinely opens to the world. **Add the usage cap in the same change**, or turn signups off (`disable_signup`) until the cap exists. Connecting Resend on its own, with no cap, is the one combination to avoid.

Resend also needs a domain you own (about $10-15/year); its free tier covers 3,000 emails a month, 100 a day, one domain.

## Google setup, and why connections expire

From the Call asks Google for exactly two permissions:

- `gmail.send` — send an approved email as you. Send only; it cannot read your mail.
- `calendar.events` — read your calendar and add events. Replaces the old read-only scope so tasks can be blocked out.

Both are **sensitive** scopes in Google's classification. Neither is **restricted**, and no Google Calendar scope is restricted at all, so none of this triggers the annual paid third-party security assessment. That assessment is the expensive one, and every broader Gmail scope (`compose`, `modify`, `readonly`) does trigger it. Do not widen these.

### The 7-day expiry, and how to stop it

A Google connection dies after 7 days when the OAuth app's **publishing status is "Testing"** and its user type is External. It is that setting, not verification, that causes it.

The fix is one button: Google Cloud Console → Google Auth Platform → Audience → **Publish app**, moving it from Testing to In production. The 7-day expiry stops.

What publishing costs while still unverified:

- Users see a "Google hasn't verified this app" screen and must click Advanced → Continue.
- A cap of **100 new users for the lifetime of the project**. It cannot be reset or raised, and it counts anyone who saw that warning screen. Do not burn it on test accounts.

Submitting for sensitive-scope verification (about 10 business days by Google's own estimate) removes both the warning and the cap. Publish first, verify in parallel.

If every user were inside one Google Workspace organisation, switching the user type to **Internal** avoids verification, the warning and the cap entirely. That is not an option for a public product, since only accounts in that one organisation could ever connect.

One caveat worth knowing: Google documents the 7-day rule as applying to Testing apps, but never states the converse outright. It is a sound inference and matches how the API behaves. Confirm it after publishing by checking whether the token response carries `refresh_token_expires_in`.

### Other reasons a Google connection dies

Design for reconnection rather than assuming a token is forever: the user revokes access, the token goes unused for six months, they change their Google password (this one kills Gmail scopes specifically), or a Workspace admin restricts the service. From the Call treats all of these as "reconnect" rather than retrying.

## Legal notes

Recording consent laws vary (all-party consent in several US states and most of Europe). The app must show a consent reminder before recording and let users delete recordings. Store audio encrypted at rest (Supabase does), never train on customer data, say so publicly.
