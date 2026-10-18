// =============================================================
// /api/admin/monitoring-cleanup — « TOUR DE CONTRÔLE » (v5.6, P4)
//
// Nettoyage quotidien du monitoring :
//   • SystemMetric > 30 jours → supprimées (DB légère) ;
//   • CronLog > 30 jours → supprimés ;
//   • SystemIncident non résolus créés il y a > 7 jours → archivés
//     (isResolved + note automatique) pour ne pas masquer les
//     nouvelles alertes.
//
// Double authentification (CRON_SECRET fail-closed / superadmin).
//
// CONFIGURATION CRON-JOB.ORG / COOLIFY :
//   URL    : https://<domaine>/api/admin/monitoring-cleanup
//   Méthode: POST   Headers: Authorization: Bearer <CRON_SECRET>
//   Crontab: 30 4 * * *   (une fois par jour, heure creuse)
// =============================================================
import { NextResponse } from 'next/server';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { runMonitoringCleanup, logCronRun } from '@/lib/monitoring-engine';
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
    const summary = await runMonitoringCleanup();
    await logCronRun('monitoring-cleanup', 'SUCCESS', Date.now() - startedAt);
    return NextResponse.json({ ok: true, mode: isCron ? 'cron' : 'superadmin', ...summary });
  } catch (error) {
    await logCronRun('monitoring-cleanup', 'FAILED', Date.now() - startedAt, String(error).slice(0, 300));
    await captureError('admin.monitoring-cleanup', error, undefined, req);
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
