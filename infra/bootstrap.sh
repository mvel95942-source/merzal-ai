#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════
# Merzal AI — bootstrap a NEW tenant (one college / school) end-to-end.
#
# Spins up the whole backend for a fresh Supabase project:
#   1. applies the schema (tables, RLS, triggers)
#   2. deploys the edge functions (chat, phone-auth)
#   3. seeds the first super admin
#
# Usage:
#   export SUPABASE_DB_URL="postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres"
#   export SUPABASE_PROJECT_REF="<ref>"          # for function deploys
#   export ADMIN_ENROLLMENT="975116"
#   export ADMIN_PASSWORD="change-me-123"
#   bash infra/bootstrap.sh
#
# Requires: psql, and the Supabase CLI (`supabase`) for function deploys.
# Idempotent — safe to re-run.
# ════════════════════════════════════════════════════════════════════════
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"

: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL (Project Settings → Database → Connection string)}"
: "${ADMIN_ENROLLMENT:?Set ADMIN_ENROLLMENT (e.g. 975116)}"
: "${ADMIN_PASSWORD:?Set ADMIN_PASSWORD}"

echo "▶ 1/3  Applying schema…"
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$HERE/schema.sql"

echo "▶ 2/3  Deploying edge functions…"
if command -v supabase >/dev/null 2>&1; then
  if [ -n "${SUPABASE_PROJECT_REF:-}" ]; then
    supabase functions deploy chat       --project-ref "$SUPABASE_PROJECT_REF" --no-verify-jwt=false --workdir "$ROOT" || true
    supabase functions deploy phone-auth --project-ref "$SUPABASE_PROJECT_REF" --no-verify-jwt        --workdir "$ROOT" || true
  else
    echo "  ⚠ SUPABASE_PROJECT_REF not set — skipping function deploy. Deploy manually:"
    echo "    supabase functions deploy chat --project-ref <ref>"
    echo "    supabase functions deploy phone-auth --project-ref <ref> --no-verify-jwt"
  fi
else
  echo "  ⚠ Supabase CLI not found — skipping function deploy. Install: https://supabase.com/docs/guides/cli"
fi

echo "▶ 3/3  Seeding super admin ($ADMIN_ENROLLMENT)…"
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
  -v enrollment="$ADMIN_ENROLLMENT" -v password="$ADMIN_PASSWORD" \
  -f "$HERE/seed_admin.sql"

cat <<EOF

✅ Tenant ready.
   Super admin → enrollment: $ADMIN_ENROLLMENT  (set its own password on first login if you left it blank)

Next:
  • Set the LLM provider secret on this project:
      supabase secrets set CAMPUS_PROVIDER=gemini GEMINI_API_KEY=... --project-ref <ref>
      supabase secrets set WORLD_PROVIDER=gemini
  • Build the web app pointed at this project (see infra/README.md / REBRAND.md):
      docker build -t merzal-<college> \\
        --build-arg VITE_SUPABASE_URL=https://<ref>.supabase.co \\
        --build-arg VITE_SUPABASE_ANON_KEY=<anon> \\
        --build-arg VITE_BRAND_JSON_URL=https://<host>/brand.json ./app
EOF
