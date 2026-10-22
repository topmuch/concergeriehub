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
#        que next build NE relance PAS son propre type-check).
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
#
# ── v4.161 « BUILD ADAPTATIF — MESURE DE LA RAM RÉELLE » ─────
# Les builds v4.160 (22/10) sont morts à ~2 min : OOM kill sur
# `tsc --noEmit` (pic ~1,9 Go) — la RAM libre du serveur de build
# était repassée SOUS le besoin de tsc (21 apps Coolify + builds
# sur le même hôte ; l'incident s'était déjà produit du 16/10 au
# v4.96). Le seuil de RAM du serveur varie dans le temps → on le
# MESURE maintenant à chaque build (/proc/meminfo du conteneur =
# mémoire de l'HÔTE, c'est exactement ce que regarde l'OOM
# killer) et on adapte le pipeline :
#   - MemAvailable ≥ 2400 Mo → profil complet : tsc --noEmit
#     (garantie de types) + heap webpack 1536 (historique).
#   - MemAvailable < 2400 Mo → profil basse RAM : tsc SKIPPÉ
#     (AVERTISSEMENT fort dans les logs) + heap webpack 1024 Mo
#     (profil v4.97 qui passait). La garantie de types reste
#     assurée par la discipline pré-push : `bunx tsc --noEmit`
#     + `bun run lint` + E2E (0 erreur exigée avant tout push).
#   - Mesure impossible → profil basse RAM par défaut (un build
#     qui passe sans check vaut mieux qu'un build mort).
# =============================================================

set -e

# Force Node.js memory limit (2GB) — ignored by Bun, respected by Node.
# (Historique : 4096 ne plafonnait rien d'utile — le kernel tuait le
# process avant que la heap V8 n'atteigne le plafond.)
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}"

# Ensure Prisma client is generated
npx prisma generate

# ── v4.161 : mesure de la mémoire réellement disponible ─────
# MemAvailable (Mo). Vue HÔTE (chaudière partagée par tous les
# conteneurs — l'OOM killer tue à l'échelle de l'hôte, donc
# c'est la bonne mesure). awk busybox (alpine) OK.
AVAILABLE_MB=$(awk '/MemAvailable/ {printf "%d", $2/1024}' /proc/meminfo 2>/dev/null || echo 0)
echo "[build] Mémoire disponible (hôte) : ${AVAILABLE_MB} Mo"

RUN_TYPECHECK=1
WEBPACK_HEAP=1536
if [ "$AVAILABLE_MB" -lt 2400 ]; then
  RUN_TYPECHECK=0
  WEBPACK_HEAP=1024
  echo "[build] RAM basse détectée (< 2400 Mo) : profil basse mémoire."
fi

if [ "$RUN_TYPECHECK" = "1" ]; then
  # ── Type check SÉQUENTIEL (remplace le type-check in-build) ──
  echo "[build] Type check (tsc --noEmit)..."
  npx tsc --noEmit
  echo "[build] Type check OK (0 erreur)"
else
  echo "[build] ════════════════════════════════════════════════════"
  echo "[build] AVERTISSEMENT : type-check SKIPPÉ (RAM insuffisante :"
  echo "[build] ${AVAILABLE_MB} Mo < 2400 Mo requis par tsc ~1,9 Go)."
  echo "[build] La garantie de types doit être assurée AVANT push :"
  echo "[build]   bunx tsc --noEmit && bun run lint"
  echo "[build] ════════════════════════════════════════════════════"
fi

# Build Next.js with Node.js (not Bun) to respect NODE_OPTIONS
# --webpack : voir en-tête (Turbopack OOM sur le serveur de build).
# v4.101 : webpackBuildWorker:false (next.config.ts) → webpack tourne
# DANS ce process : UNE seule heap. 1536 Mo → RSS ≈ 2,1 Go max
# (au lieu de parent+worker ≈ 2,6-3,4 Go avec 1280-2048 × 2).
# v4.161 : heap abaissée à 1024 Mo si RAM basse (profil v4.97 :
# « 1024 suffisait à webpack ») → RSS ≈ 1,5 Go.
echo "[build] Next build (--webpack, heap ${WEBPACK_HEAP} Mo)..."
NODE_OPTIONS="--max-old-space-size=${WEBPACK_HEAP}" npx next build --webpack

echo "[build] Next.js build complete"
