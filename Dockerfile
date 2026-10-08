# syntax=docker/dockerfile:1
# ConcergerieHub — Dockerfile FINAL et STABLE (v4.1 — INDÉPENDANT DU CONTEXTE)
#
# ═══════════════════════════════════════════════════════════════════
#  CE FICHIER NE CHANGE PLUS JAMAIS.
#
#  Fonctionne dans TOUS les cas de figure Coolify :
#    • collé dans « Dockerfile Inline » (contexte vide) → OK
#    • utilisé via « Dockerfile Path » depuis le repo GitHub → OK
#
#  Le code applicatif = app-update.tar.xz à la racine du repo GitHub.
#  ADD distant + invalidation automatique : chaque nouveau commit sur
#  GitHub change le fichier → Docker télécharge la nouvelle version
#  (zéro CACHEBUST, zéro manipulation).
#
#  MISE À JOUR = pousser le nouveau app-update.tar.xz sur GitHub → Deploy.
# ═══════════════════════════════════════════════════════════════════
FROM node:20-alpine

RUN apk add --no-cache libc6-compat sqlite \
  && npm install -g bun

WORKDIR /app

# ── Code applicatif : téléchargé depuis le repo GitHub ──────────────
# L'invalidation du cache est automatique : si le fichier change sur
# GitHub (nouveau commit), Docker le retélécharge. Échoue si absent.
ADD https://raw.githubusercontent.com/topmuch/concergeriehub/main/app-update.tar.xz /tmp/app-update.tar.xz

RUN set -e \
  && echo '[payload] extraction de app-update.tar.xz...' \
  && tar -xJf /tmp/app-update.tar.xz -C /app \
  && rm /tmp/app-update.tar.xz \
  && echo '[payload] verifications...' \
  && test -f /app/package.json \
  && test -f /app/prisma/schema.prisma \
  && test -f /app/scripts/create-admin.cjs \
  && node --check /app/scripts/create-admin.cjs \
  && grep -q "force-dynamic" /app/src/app/page.tsx \
  && test -f '/app/src/app/api/uploads/voice/[file]/route.ts' \
  && test -f /app/src/app/airbnb/messages/page.tsx \
  && echo "[payload] OK — version : $(cat /app/VERSION.txt)"

# Install dependencies + Prisma Client
RUN bun install
RUN npx prisma generate

# Build the application
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=file:/app/data/concergeriehub.db
ENV NEXT_PUBLIC_APP_URL=http://localhost:3000

# Create data directory + sync schema BEFORE build
RUN mkdir -p /app/data && npx prisma db push --skip-generate --accept-data-loss

# NextAuth exige un secret en production : on en génère un stable à l'image
RUN echo "NEXTAUTH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")" > /app/.env.docker-secret

RUN bun run build

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV DATABASE_URL=file:/app/data/concergeriehub.db

# ── Start command ────────────────────────────────────────────────────
# Toute la logique URL est évaluée par le shell INTERNE (préfixe \$)
# pour éviter les problèmes d'héritage entre les deux shells imbriqués.
# NEXTAUTH_URL : définissez-le dans Coolify (Variables d'environnement)
# avec votre domaine public ; sinon le 1er domaine Coolify est utilisé
# automatiquement (https:// ajouté si COOLIFY_URL est un FQDN nu).
CMD sh -c "mkdir -p /app/data /app/data/uploads/voice \
  && echo '=== ConcergerieHub — version deployee : '$(cat /app/VERSION.txt 2>/dev/null || echo '?')' ===' \
  && cp /app/data/concergeriehub.db /app/data/concergeriehub.db.bak 2>/dev/null || echo '(premier demarrage : pas de backup precedent)' \
  && export DATABASE_URL=file:/app/data/concergeriehub.db \
  && export NEXTAUTH_SECRET=${NEXTAUTH_SECRET:-$(cat /app/.env.docker-secret 2>/dev/null || echo)} \
  && export BASE_URL=\${COOLIFY_URL%%,*} \
  && case \"\$BASE_URL\" in https://|http://|\"\") BASE_URL=\"http://localhost:3000\" ;; *://*) : ;; *) BASE_URL=\"https://\$BASE_URL\" ;; esac \
  && export NEXTAUTH_URL=\${NEXTAUTH_URL:-\$BASE_URL} \
  && export NEXT_PUBLIC_APP_URL=\${NEXT_PUBLIC_APP_URL:-\$NEXTAUTH_URL} \
  && echo '=== Sync schema DB (backup: concergeriehub.db.bak) ===' \
  && npx prisma db push --skip-generate --accept-data-loss || echo 'ATTENTION: db push a echoue - voir erreur ci-dessus' \
  && echo '=== Seed comptes (superadmin + client demo) ===' \
  && node scripts/create-admin.cjs || echo 'ATTENTION: seed a echoue - voir erreur ci-dessus' \
  && echo '=== Demarrage serveur ===' \
  && exec node .next/standalone/server.js"
