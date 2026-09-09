# Meetnote

Meeting-notes SaaS. Read PLAN.md first for product, stack, phases, and the account checklist.

## Hard rules
- This product is separate from Protegion Life. Never deploy to the "Protegion Life's projects" Vercel team or create resources in the "Protegion" Supabase organization. Meetnote's Supabase project and Vercel project live in separate accounts that are not reachable from the MCP connectors in this session.
- Secrets live only in `.env.local` (git-ignored). Template: `.env.example`. Never write real values into `.env.example`.
- Plain code wherever possible; the LLM is only used to understand language (extracting tasks from a transcript, drafting text). Explain every new AI call.
- Every API route checks auth via `getAuth(req)` (cookie session or `Authorization: Bearer`). Row Level Security on `meetings` is the real boundary; the service role is only used for storage signing and the post-response pipeline, always scoped by `user_id`.

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

## Conventions
- Anthropic SDK only for LLM calls; default model `claude-opus-5`; structured output via `zodOutputFormat` and Zod validation of the parsed JSON.
- Every vendor call logs one JSON line (`event`, sizes, usage, `costUsd`) so spend is visible in Vercel logs.
- Dark theme tokens in `src/app/globals.css`; reuse `.glass`, `.btn`, `.pill` classes.
- Storage bucket is `recordings` (private). Object paths are `<user_id>/<yyyy-mm>/<meeting_id>.<ext>`; ownership is checked with `pathBelongsTo()`.
- Meeting status machine: recorded → uploaded → transcribing → transcribed → extracting → done, or error (retryable; finished steps are skipped).
