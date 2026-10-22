#!/bin/sh
# =============================================================
# v5.5 — Wrapper de couche Dockerfile avec télématrie.
# Exécute une étape du build DIRECTEMENT (pas de sh -c : l'appel
# précédent `sh -c "$*"` transformait le séparateur `--` en OPTION
# de sh → « sh: bad option '-- bun install' » → exit 2, la cause
# des échecs v5.4/v5.5).
#
# En cas d'échec, le log est téléversé vers /api/errors +
# webhook.site (lisible /admin/logs et sandbox) AVANT de propager
# le code de sortie → le build échoue comme avant, MAIS la cause
# est diagnostiquable sans accès SSH.
#
# Usage : sh scripts/step.sh <nom-étape> <commande...>
# =============================================================
set -e
NAME="$1"
shift
LOG="/tmp/step-${NAME}.log"

echo "[step:${NAME}] démarrage…"
set +e
"$@" > "$LOG" 2>&1
EXIT=$?
set -e

if [ "$EXIT" -ne 0 ]; then
  echo "[step:${NAME}] ══ ÉCHEC (exit $EXIT) — 40 dernières lignes ══"
  tail -n 40 "$LOG" || true
  node /app/scripts/report-build-failure.mjs "$NAME" "$EXIT" "$LOG" || true
  exit "$EXIT"
fi
echo "[step:${NAME}] OK"
