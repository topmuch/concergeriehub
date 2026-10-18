// =============================================================
// /api/health — « TOUR DE CONTRÔLE » (v5.6, Phase 1)
//
// Health-check production robuste : DB (ping mesuré) + Stripe +
// SMTP (pings 3 s max) + disque (best effort). Public — utilisé
// par les sondes Coolify/UptimeRobot/K8s ET par le moteur de
// monitoring (tick 5 min). Aucune donnée sensible exposée.
//
// Réponse : { status: "OK" | "DEGRADED" | "DOWN", checks: { db,
// stripe, smtp, disk }, version, totalMs, timestamp }
//   • DOWN     → HTTP 503 (DB injoignable = site inutilisable)
//   • DEGRADED → HTTP 200 (Stripe/SMTP en échec ou DB lente)
//   • OK       → HTTP 200
// Compatibilité historique : champs `database` + `latencyMs`
// conservés pour les anciennes sondes.
// `version` : contenu de VERSION.txt (gravé dans l'image Docker au
// build) — discriminateur fiable de « quel code tourne réellement ».
// =============================================================
import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import path from 'path';
import { fetchHealthData } from '@/lib/health-check';

export const dynamic = 'force-dynamic';

// Version applicative — lue UNE fois puis mémoïsée (VERSION.txt est
// écrit dans l'image au build, jamais au runtime).
let APP_VERSION: string | null = null;
function appVersion(): string {
  if (APP_VERSION) return APP_VERSION;
  try {
    APP_VERSION = readFileSync(path.join(process.cwd(), 'VERSION.txt'), 'utf8').trim();
  } catch {
    APP_VERSION = 'dev';
  }
  return APP_VERSION;
}

export async function GET() {
  let report;
  try {
    report = await fetchHealthData();
  } catch (error) {
    // Le rapport lui-même a échoué (ex. process HS) → DOWN franc.
    console.error('[health] fetchHealthData failed:', error);
    return NextResponse.json(
      {
        status: 'DOWN',
        database: 'down',
        version: appVersion(),
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }

  const httpStatus = report.status === 'DOWN' ? 503 : 200;
  return NextResponse.json(
    {
      // Nouvelle forme canonique (Tour de Contrôle).
      status: report.status,
      checks: report.checks,
      version: appVersion(),
      totalMs: report.totalMs,
      timestamp: report.timestamp,
      // Alias historiques (sondes existantes).
      database: report.checks.db.status === 'up' ? 'up' : 'down',
      latencyMs: report.checks.db.latencyMs,
    },
    { status: httpStatus },
  );
}
