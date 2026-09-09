# Meetnote

Meeting-notes SaaS. Read PLAN.md first for product, stack, phases, and the account checklist.

## Hard rules
- This product is separate from Protegion Life. Never deploy to the "Protegion Life's projects" Vercel team or create resources in the "Protegion" Supabase organization. Meetnote's Supabase project and Vercel project live in separate accounts that are not reachable from the MCP connectors in this session.
- Secrets live only in `.env.local` (git-ignored). Template: `.env.example`. Never write real values into `.env.example`.
- Plain code wherever possible; the LLM is only used to understand language (extracting tasks from a transcript, drafting text). Explain every new AI call.

## Layout
- `src/lib/recorder.ts` — browser capture: screen-share audio + mic mixed with Web Audio, MediaRecorder at 32 kbps, 5-second chunks.
- `src/lib/recording-store.ts` — IndexedDB backup of chunks while recording; recovery after a crash.
- `src/lib/upload.ts` — browser uploads straight to Supabase Storage via a one-time signed URL (bypasses Vercel's 4.5 MB body limit), with progress and retries.
- `src/app/api/upload-url/route.ts` — mints the signed upload URL (service role key, server only).
- `src/app/api/transcribe/route.ts` — gives Deepgram a signed download link; returns speaker-labeled segments + duration + cost.
- `src/app/api/extract/route.ts` + `src/lib/extract.ts` — Claude structured output (streamed, Zod-validated) + token usage and cost.
- `src/lib/{cost,retry,transcript,markdown}.ts` — pure helpers, unit-tested in `src/lib/__tests__/`.
- `src/app/record/page.tsx` — the recorder UI and the upload → transcribe → extract pipeline with per-step retry.

## Commands
- `npm run dev` — local server on http://localhost:3000
- `npm test` — unit tests (vitest)
- `npm run build` — must pass before pushing
- `npm run lint`

## Conventions
- Anthropic SDK only for LLM calls; default model `claude-opus-5`; structured output via `zodOutputFormat` and Zod validation of the parsed JSON.
- Every vendor call logs one JSON line (`event`, sizes, usage, `costUsd`) so spend is visible in Vercel logs.
- Dark theme tokens in `src/app/globals.css`; reuse `.glass`, `.btn`, `.pill` classes.
- Storage bucket is `recordings` (private). Object paths look like `2026-09/<uuid>.webm`.
