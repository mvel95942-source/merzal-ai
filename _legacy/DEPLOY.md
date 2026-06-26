# Deploy & rebrand — Merzal AI

## Run with Docker (on-prem)

```bash
cp .env.docker.example .env     # set VITE_SUPABASE_URL, anon key, student domain
docker compose up -d --build    # serves on http://<host>:8080
```

The image is a static nginx build of the SPA. Point `VITE_SUPABASE_URL` at your
Supabase (cloud or self-hosted). **The LLM provider key is never in this image** —
it lives as a secret in the Supabase `chat` edge function (see README). Rebuild
the image whenever the `VITE_*` build args change (Vite bakes them at build time).

## Rebrand in one place

All brand text, colors, and copy live in **`app/src/lib/brand.ts`**:

- `name`, `shortName`, `institution`, `logoLetter`
- `accentColor` (the single terracotta accent — change to re-theme)
- login hero copy, placeholders, disclaimer, empty-state text

Change those values, rebuild, and the whole app — login, sidebar, chat, share
viewer, exports — re-themes. The logo mark is `app/src/components/Logo.tsx`
(driven by `logoLetter` + `accentColor`).

To stand up a new tenant: copy `brand.ts`, set the values, point at that tenant's
Supabase, `docker compose up`.

## Self-hosted Supabase (optional, fully on-prem)

Follow Supabase's self-hosting compose (https://supabase.com/docs/guides/self-hosting/docker),
then set `VITE_SUPABASE_URL`/anon key to that instance and deploy the `chat`
edge function there. Student data never leaves your infrastructure.

## Provisioning students

Roll number + password accounts — see [AUTH_INVITES.md](AUTH_INVITES.md).

## Pre-deploy checks

See [DEPLOY_CHECKLIST.md](DEPLOY_CHECKLIST.md) and [SECURITY.md](SECURITY.md).
After switching to password auth, **enable Leaked Password Protection** in
Supabase Auth (it became relevant once we left OTP-only).
