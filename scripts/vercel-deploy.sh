#!/usr/bin/env bash
# Publicatie via GitHub Actions. Geheimen: VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID.
# Gebruik: scripts/vercel-deploy.sh preview|production
set -euo pipefail

omgeving="${1:-}"
if [ "$omgeving" != "preview" ] && [ "$omgeving" != "production" ]; then
  echo "Gebruik: $0 preview|production" >&2
  exit 2
fi

ontbreekt=()
[ -n "${VERCEL_TOKEN:-}" ] || ontbreekt+=(VERCEL_TOKEN)
[ -n "${VERCEL_ORG_ID:-}" ] || ontbreekt+=(VERCEL_ORG_ID)
[ -n "${VERCEL_PROJECT_ID:-}" ] || ontbreekt+=(VERCEL_PROJECT_ID)
if [ "${#ontbreekt[@]}" -gt 0 ]; then
  echo "::error::Zet GitHub Secrets (repo → Settings → Secrets and variables → Actions): ${ontbreekt[*]}"
  echo "VERCEL_TOKEN: Vercel → Account Settings → Tokens (scope: de team van het project)."
  echo "VERCEL_ORG_ID en VERCEL_PROJECT_ID: Vercel → Project → Settings → General."
  echo "AUTH_* en BLOB_READ_WRITE_TOKEN blijven in Vercel Environment Variables, niet in GitHub."
  exit 1
fi

npx --yes vercel@65 pull --yes --environment="$omgeving" --token="$VERCEL_TOKEN"

if [ "$omgeving" = "production" ]; then
  npx --yes vercel@65 build --prod --token="$VERCEL_TOKEN"
  url="$(npx --yes vercel@65 deploy --prebuilt --prod --yes --token="$VERCEL_TOKEN")"
else
  npx --yes vercel@65 build --token="$VERCEL_TOKEN"
  url="$(npx --yes vercel@65 deploy --prebuilt --yes --token="$VERCEL_TOKEN")"
fi

url="$(printf '%s\n' "$url" | tail -n 1 | tr -d '\r')"
if [ -z "$url" ] || [ "${url#https://}" = "$url" ]; then
  echo "Vercel gaf geen deployment-URL terug." >&2
  exit 1
fi

echo "$url"
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "url=$url" >> "$GITHUB_OUTPUT"
fi
