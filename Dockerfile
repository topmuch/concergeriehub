# syntax=docker/dockerfile:1
# ConcergerieHub — Dockerfile FINAL (v4.4 — + curl pour Scheduled Tasks Coolify)
#
# ═══════════════════════════════════════════════════════════════════
#  v4.3 (AUDIT 24-e / P0-3) : PLUS AUCUN NEXTAUTH_SECRET cuit dans
#  l'image (quiconque possède l'image pouvait forger des sessions).
#  Au boot : env Coolify si fournie, sinon génération UNE FOIS +
#  persistance dans /app/data (volume) → sessions stables et sûres.
#  Le code = app-update.tar.xz à la racine du repo GitHub.
#  ADD distant → invalidation automatique du cache à chaque commit
#  (zéro CACHEBUST). Mise à jour = pousser le tar sur GitHub → Deploy.
# ═══════════════════════════════════════════════════════════════════
FROM node:20-alpine

# v4.4 : + curl — les Scheduled Tasks Coolify exécutent les crons DANS
# ce conteneur (docker exec). Sans curl, chaque exécution échouait en
# « sh: curl: not found » (monitoring-tick, briefings Coach, automations,
# cleanup : jamais déclenchés depuis la création des tasks).
RUN apk add --no-cache libc6-compat sqlite curl \
  && npm install -g bun

WORKDIR /app

# ── Code applicatif : téléchargé depuis le repo GitHub ──────────────
# v4.116 : cache-buster ?cb= OBLIGATOIRE — raw.githubusercontent.com
# n'envoie PAS d'en-tête Last-Modified → Docker réutilisait la couche
# ADD en cache et extrait l'ANCIEN tar même après un build « réussi »
# (symptôme : déployé mais changements invisibles). .gh-sync.mjs
# remplace CACHEBUST par la version à CHAQUE push → URL différente →
# couche reconstruite à coup sûr.
ADD https://raw.githubusercontent.com/topmuch/concergeriehub/main/app-update.tar.xz?cb=v4.125%20(2026-10-18)%20%E2%80%94%20v4.126%20%E2%80%94%20Fusion%20complete%3A%20theme%20bleu%20luxe%20clair%2Fsombre%2C%20boutons%20rouges%2Fbleus%2Fgris%20standardises%2C%20PDF%20nouveau%20design%20partout%20%2B%20fusion%20entree%2Fsortie%2C%20factures%20EDL%20(facture%20payee%20PDF)%2C%20onglet%20Facturation%20%2B%20G%C3%A9rer%20mon%20abonnement%20(299%2F499%2Fdevis)%2C%20page%20Documents%20(filtres%2Bpoids)%2C%20page%20Sejours%20(recherche%20date%2Bnom%2C%20encarts%20check-in%2Fcheck-out%2C%20WhatsApp%2Bvideo)%2C%20KPIs%20lisibles%20%2B%20revenus%20proteges%20%2B%20temps%20gagne%20%2B%20prochains%20evenements%20%2B%20donut%2C%20cloche%20alertes%20degats%2C%20widgets%20Mes%20biens%2FBouclier%2C%20Parametres%204%20onglets%20%2B%20Assistance%20tickets%20%2B%20Mode%20d'emploi%20(fusion%20v4.125)%2C%20fix%20Inspection%20introuvable /tmp/app-update.tar.xz

RUN set -e; tar -xJf /tmp/app-update.tar.xz -C /app; rm /tmp/app-update.tar.xz; test -f /app/package.json; test -f /app/prisma/schema.prisma; test -f /app/scripts/create-admin.cjs; node --check /app/scripts/create-admin.cjs; grep -q "force-dynamic" /app/src/app/page.tsx; test -f "/app/src/app/api/uploads/voice/[file]/route.ts"; test -f /app/src/app/airbnb/messages/page.tsx; echo "[payload] OK version : $(cat /app/VERSION.txt)"

# Install dependencies + Prisma Client
RUN bun install
RUN npx prisma generate

# Build the application
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=file:/app/data/concergeriehub.db
ENV NEXT_PUBLIC_APP_URL=https://roomscan.pro

# Create data directory + sync schema BEFORE build
RUN mkdir -p /app/data && npx prisma db push --skip-generate --accept-data-loss

# AUDIT 24-e (P0-3) — l'ancien RUN qui écrivait NEXTAUTH_SECRET dans
# /app/.env.docker-secret (secret de session CUIT DANS L'IMAGE) est
# SUPPRIMÉ. Génération + persistance déplacées dans le CMD (volume).

RUN bun run build

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV DATABASE_URL=file:/app/data/concergeriehub.db

# ── Start command (exec-form : évalué par UN SEUL shell, sans échappement) ──
# PORT est forcé à 3000 = port déclaré dans Coolify (ports_exposes) :
# Coolify peut injecter PORT=80 au runtime, ce qui désalignait le proxy.
CMD ["sh","-c","mkdir -p /app/data /app/data/uploads/voice; echo '=== ConcergerieHub — version deployee : '$(cat /app/VERSION.txt 2>/dev/null || echo '?')' ==='; cp /app/data/concergeriehub.db /app/data/concergeriehub.db.bak 2>/dev/null; export DATABASE_URL=file:/app/data/concergeriehub.db; export PORT=3000; if [ -z \"$NEXTAUTH_SECRET\" ]; then if [ -s /app/data/.nextauth-secret ]; then export NEXTAUTH_SECRET=$(cat /app/data/.nextauth-secret); else export NEXTAUTH_SECRET=$(node -e \"console.log(require('crypto').randomBytes(32).toString('base64url'))\"); echo \"$NEXTAUTH_SECRET\" > /app/data/.nextauth-secret; chmod 600 /app/data/.nextauth-secret; echo '=== NEXTAUTH_SECRET genere une seule fois et persiste dans /app/data/.nextauth-secret (volume) ==='; fi; else echo '=== NEXTAUTH_SECRET fourni par les variables environnement Coolify ==='; fi; export BASE_URL=${COOLIFY_URL%%,*}; case $BASE_URL in https://*|http://*) : ;; '') BASE_URL=https://roomscan.pro ;; *) BASE_URL=https://$BASE_URL ;; esac; export NEXTAUTH_URL=${NEXTAUTH_URL:-$BASE_URL}; export NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL:-$NEXTAUTH_URL}; echo '=== Sync schema DB (backup: concergeriehub.db.bak) ==='; npx prisma db push --skip-generate --accept-data-loss || echo 'ATTENTION: db push a echoue - voir erreur ci-dessus'; echo '=== Seed comptes (superadmin CREATE-ONLY + client demo) ==='; node scripts/create-admin.cjs || echo 'ATTENTION: seed a echoue - voir erreur ci-dessus'; echo '=== Seed services demo (bootstrap CREATE-ONLY — existant preserve) ==='; SEED_MODE=bootstrap bun prisma/seed.ts || echo 'ATTENTION: seed services a echoue - voir erreur ci-dessus'; echo '=== Demarrage serveur sur port 3000 ==='; exec node .next/standalone/server.js"]
