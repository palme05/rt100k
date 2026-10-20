#!/bin/bash
# Richtet eine frische Claude-Code-Cloud-Sitzung ein (läuft nur dort, synchron,
# beliebig oft wiederholbar): Abhängigkeiten + Git-Hooks, gitleaks, lokales
# Postgres für `pnpm test:db` und E2E, Chromium-Pfad für Playwright.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Abhängigkeiten exakt nach Lockfile; installiert über lefthook auch die Git-Hooks
pnpm install --frozen-lockfile

# gitleaks für den Pre-Commit-Hook – gleiche Version und Prüfsumme wie in der CI
GITLEAKS_VERSION=$(sed -n "s/^  GITLEAKS_VERSION: '\(.*\)'$/\1/p" .github/workflows/ci.yml)
GITLEAKS_SHA256=$(sed -n "s/^  GITLEAKS_SHA256: '\(.*\)'$/\1/p" .github/workflows/ci.yml)
if [ "$(gitleaks version 2>/dev/null || true)" != "$GITLEAKS_VERSION" ]; then
  tmp=$(mktemp -d)
  curl -sSfL -o "$tmp/gitleaks.tgz" \
    "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz"
  echo "${GITLEAKS_SHA256}  $tmp/gitleaks.tgz" | sha256sum --check --strict --quiet
  tar xzf "$tmp/gitleaks.tgz" -C "$tmp" gitleaks
  install -m 0755 "$tmp/gitleaks" /usr/local/bin/gitleaks
  rm -rf "$tmp"
fi

# Lokales Postgres aus dem Basis-Image (nur Testdaten). Passwort entspricht dem
# Standard in src/test/db-setup.ts.
pg_ctlcluster 16 main status >/dev/null 2>&1 || pg_ctlcluster 16 main start
su postgres -c "psql -qXc \"ALTER ROLE postgres PASSWORD 'postgres'\"" >/dev/null

# Vorinstalliertes Chromium für Playwright (kein `playwright install` im Container)
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export PW_CHROMIUM_PATH=/opt/pw-browsers/chromium' >> "$CLAUDE_ENV_FILE"
fi
