#!/bin/sh
# =============================================================
# Build wrapper for Coolify/Nixpacks deployment.
#
# ── v4.97 « BUILD SOUS CONTRAINTE MÉMOIRE » ──────────────────
# Le serveur Coolify a une RAM limitée : le build v4.96 était
# tué par l'OOM killer (exit 137) car Turbopack + le
# type-checker tournaient avec des pics cumulés (> 2,3 Go).
#
# Correctif (3 leviers) :
#   1. SÉQUENTIEL : `tsc --noEmit` passe ICI, AVANT next build
#      (et next.config.ts passe ignoreBuildErrors:true pour
#      que next build NE relance PAS son propre type-check).
#      → La garantie de types est INTACTE (le build échoue sur
#        la moindre erreur TS), mais les pics mémoire ne se
#        chevauchent plus (max ≈ 1,9 Go au lieu de la somme).
#   2. `next build --webpack` : opt-out officiel au bundler
#      Turbopack (défaut Next 16). Profil mémoire borné.
#   3. Heap V8 plafonnée à 2048 Mo (tsc a besoin de ~1,9 Go ;
#      1024 Mo suffisaient à webpack mais font aborter tsc).
#
# ── v4.100 « WEBPACK SOUS PLAFOND BASSE MÉMOIRE » ────────────
# v4.99 a re-OOMé (SIGKILL du worker webpack à ~5 min) : le heap
# 2048 Mo s'applique à CHAQUE processus Node — or next build lance
# un process PARENT + un WORKER de compilation (cpus:1) → 2 × 2 Go
# potentiels sur un serveur de 4 Go. v4.98 passait juste ; la
# vitrine Showcase a fait basculer le pic. Correctif :
#   - tsc : heap 2048 conservée (besoin ~1,9 Go) ;
#   - next build : heap ramenée à 1280 Mo par process (v4.97 :
#     1024 suffisait à webpack) → parent+worker ≤ 2,6 Go.
# =============================================================

set -e

# Force Node.js memory limit (2GB) — ignored by Bun, respected by Node.
# (Historique : 4096 ne plafonnait rien d'utile — le kernel tuait le
# process avant que la heap V8 n'atteigne le plafond.)
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}"

# Ensure Prisma client is generated
npx prisma generate

# ── Type check SÉQUENTIEL (remplace le type-check in-build) ──
echo "[build] Type check (tsc --noEmit)..."
npx tsc --noEmit
echo "[build] Type check OK (0 erreur)"

# Build Next.js with Node.js (not Bun) to respect NODE_OPTIONS
# --webpack : voir en-tête (Turbopack OOM sur le serveur de build).
# v4.101 : webpackBuildWorker:false (next.config.ts) → webpack tourne
# DANS ce process : UNE seule heap. 1536 Mo → RSS ≈ 2,1 Go max
# (au lieu de parent+worker ≈ 2,6-3,4 Go avec 1280-2048 × 2).
NODE_OPTIONS="--max-old-space-size=1536" npx next build --webpack

echo "[build] Next.js build complete"
