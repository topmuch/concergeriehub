// =============================================================
// /api/admin/monitoring-tick — « TOUR DE CONTRÔLE » (v5.6, Phase 4)
//
// Tick de surveillance toutes les 5 minutes (cron externe) :
//   1. Mesure la santé (DB / Stripe / SMTP / disque + latence API) ;
//   2. Enregistre une ligne SystemMetric ;
//   3. Détecte les anomalies (prédictif inclus) et crée/met à jour
//      les SystemIncident (dédupliqués) ;
//   4. Email aux superadmins pour tout NOUVEAU incident
//      WARNING/CRITICAL.
//
// Double authentification (même spec que trigger-daily-automations) :
//   1. CRON EXTERNE : header `Authorization: Bearer <CRON_SECRET>`
//      (sans CRON_SECRET → fail-closed) ;
//   2. SUPERADMIN connecté (bouton « Contrôle immédiat »).
//
// CONFIGURATION CRON-JOB.ORG / COOLIFY :
//   URL    : https://<domaine>/api/admin/monitoring-tick
//   Méthode: POST   Headers: Authorization: Bearer <CRON_SECRET>
//   Crontab: */5 * * * *
// GET = alias moniteurs de disponibilité.
// =============================================================
import { NextResponse } from 'next/server';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { runMonitoringTick, logCronRun } from '@/lib/monitoring-engine';
import { captureError } from '@/lib/error-monitor';

async function handle(req: Request) {
  const startedAt = Date.now();
  const bearer = req.headers.get('authorization') ?? '';
  const cronSecret = process.env.CRON_SECRET?.trim();
  const isCron = Boolean(cronSecret) && bearer === `Bearer ${cronSecret}`;

  if (!isCron) {
    const admin = await requireSuperadmin();
    if (!admin) return adminUnauthorized();
  }

  try {
    const summary = await runMonitoringTick();
    await logCronRun(
      'monitoring-tick',
      summary.ok ? 'SUCCESS' : 'FAILED',
      Date.now() - startedAt,
      summary.ok ? undefined : summary.errors.join(' | ').slice(0, 300),
    );
    return NextResponse.json({ mode: isCron ? 'cron' : 'superadmin', ...summary });
  } catch (error) {
    await logCronRun('monitoring-tick', 'FAILED', Date.now() - startedAt, String(error).slice(0, 300));
    await captureError('admin.monitoring-tick', error, undefined, req);
    return NextResponse.json(
      { ok: false, error: 'Erreur serveur. Réessayez dans un instant.' },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  return handle(req);
}

export async function GET(req: Request) {
  return handle(req);
}
