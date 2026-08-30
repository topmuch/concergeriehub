#!/bin/sh
# =============================================================
# Build wrapper for Coolify/Nixpacks deployment.
#
# Problem: Coolify runs "bun run build" which executes the
# package.json build script using Bun's runtime. Bun IGNORES
# NODE_OPTIONS, so the V8 heap memory limit has no effect.
# With 896 packages + Turbopack, Next.js OOMs without a limit.
#
# Fix: This shell script is called via "sh scripts/build.sh".
# Since it runs under /bin/sh (not bun), we can set NODE_OPTIONS
# and use Node.js directly, ensuring the 4GB heap limit works.
# =============================================================

set -e

# Force Node.js memory limit (4GB) — ignored by Bun, respected by Node
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"

# Ensure Prisma client is generated
npx prisma generate

# Build Next.js with Node.js (not Bun) to respect NODE_OPTIONS
npx next build

echo "[build] Next.js build complete"
