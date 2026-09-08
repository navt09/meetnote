# Meetnote

Meeting-notes SaaS. Read PLAN.md first for product, stack, phases, and the account checklist.

## Hard rules
- This product is separate from Protegion Life. Never deploy to the "Protegion Life's projects" Vercel team or create resources in the "Protegion" Supabase organization.
- Secrets live only in `.env.local` (git-ignored). Template: `.env.example`.

## Layout
- `src/app/record/page.tsx` — browser recorder (screen-share audio + mic mixed with Web Audio, MediaRecorder).
- `src/app/api/transcribe/route.ts` — Deepgram, returns speaker-labeled segments.
- `src/app/api/extract/route.ts` + `src/lib/extract.ts` — Claude structured output using the Zod schema in `src/lib/schema.ts`.

## Commands
- `npm run dev` — local server on http://localhost:3000
- `npm run build` — must pass before pushing
- `npm run lint`

## Conventions
- Anthropic SDK only for LLM calls; default model `claude-opus-5`; structured output via `client.messages.parse` + `zodOutputFormat`.
- Dark theme tokens in `src/app/globals.css`; reuse `.glass`, `.btn`, `.pill` classes.
