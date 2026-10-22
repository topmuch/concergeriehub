#!/bin/sh
# =============================================================
# v5.3 — Wrapper de couche Dockerfile avec télémetrie.
# Exécute une étape du build ; en cas d'échec, le log est
# téléversé vers /api/errors (lisible /admin/logs) AVANT de
# propager le code de sortie → le build Coolify échoue comme
# avant, MAIS la cause est diagnostiquable sans accès SSH.
#
# Usage : sh scripts/step.sh <nom-étape> <commande...>
# =============================================================
set -e
NAME="$1"
shift
LOG="/tmp/step-${NAME}.log"

echo "[step:${NAME}] démarrage…"
set +e
sh -c "$*" > "$LOG" 2>&1
EXIT=$?
set -e

if [ "$EXIT" -ne 0 ]; then
  echo "[step:${NAME}] ══ ÉCHEC (exit $EXIT) — 40 dernières lignes ══"
  tail -n 40 "$LOG" || true
  node /app/scripts/report-build-failure.mjs "$NAME" "$EXIT" "$LOG" || true
  exit "$EXIT"
fi
echo "[step:${NAME}] OK"
