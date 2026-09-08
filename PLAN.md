# Meetnote — build plan

Working name: **meetnote** (rename any time). Started 2026-09-08.

## What it is

A web app that records the audio of any meeting you are in (Zoom, Teams, Google Meet, anything), transcribes it, pulls out what matters, and then *does the follow-up work* with your approval.

First niche: **engineering teams**. Standups, sprint planning, and bug triage produce action items that never get written down. Meetnote turns them into draft Jira/Linear tickets the user approves with one click.

Differentiator vs Otter / Fireflies / Fathom / Granola: the agent that acts on the tasks, plus bring-your-own-LLM.

## How recording works (no bot)

The user clicks **Record**, picks the window or tab of their meeting app, and ticks "Share audio". The browser hands us that audio plus the microphone. We mix both, record locally, and upload when the meeting ends.

- Works today in Chrome and Edge on Windows with no install. Firefox and Safari do not expose system audio this way, so v1 is Chrome/Edge only.
- Later: a small desktop app (Tauri) for one-click recording and Mac support.
- Nothing joins the call. Nobody else sees a bot.

## Pipeline

```
browser recorder  -->  /api/transcribe (Deepgram, speaker labels)
                  -->  /api/extract   (Claude, strict JSON schema)
                  -->  notes + action items + decisions + people + questions
                  -->  approval queue  -->  connectors (Jira / Linear / Gmail / Slack)
```

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

1. **GitHub**: create an empty repo named `meetnote` under your personal account. Do not add a README. Send me the URL and I will push the code.
2. **Vercel (Hobby)**: sign in with the GitHub account from step 1 at vercel.com, click *Add New > Project*, import `meetnote`. Leave the settings as they are. Hobby is free; upgrade to Pro (creates a team, ~$20/mo) when you take on paying users. You can move the project into the team then.
3. **Supabase**: at supabase.com, *New organization* (free plan), then *New project* inside it, region `us-east-1` (or nearest you). Copy the Project URL and the anon/publishable key from *Project Settings > API*. If you use the same Supabase login as Protegion, the new org still shows up separately and I can manage it from here.
4. **Deepgram**: console.deepgram.com, create an API key. Comes with free credit.
5. **Anthropic**: console.anthropic.com, create an API key.

Put the keys in `.env.local` (copy `.env.example`). Never commit that file; it is already git-ignored.

## Phases

**Phase 1 (now): record → transcript → structured notes, single user, no login.**
Recorder page, transcription route, extraction route, results view. Runs locally and on Vercel.

**Phase 2: accounts and persistence.**
Supabase login, save meetings, audio in storage, meeting list and detail pages, background job for long recordings.

**Phase 3: the agent.**
Approval queue, Linear and Jira connectors (create tickets), Gmail draft follow-ups, Slack summary post. Bring-your-own-LLM setting.

**Phase 4: money and polish.**
Stripe plans, team workspaces, search across meetings, desktop recorder, consent notice and retention settings.

## Legal notes

Recording consent laws vary (all-party consent in several US states and most of Europe). The app must show a consent reminder before recording and let users delete recordings. Store audio encrypted at rest (Supabase does), never train on customer data, say so publicly.
