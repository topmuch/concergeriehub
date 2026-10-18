import { NextResponse } from 'next/server';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { checkDailyAutomations } from '@/lib/automations-server';
import { captureError } from '@/lib/error-monitor';
import { logCronRun } from '@/lib/monitoring-engine';

// =============================================================
// PREMIUM V5 — ÉTAPE 3.2 : DÉCLENCHEUR DES AUTOMATISATIONS QUOTIDIENNES
//   POST /api/admin/trigger-daily-automations
//
// Tick global checkDailyAutomations() : rappels arrivée/départ du
// jour + ⭐ Bouclier d'avis aux départs (REVIEW_SHIELD_TODAY — lien
// tokenisé /app/hub/[slug]/guest/feedback?token=…).
//
// Double authentification (spéc Étape 3) :
//   1. CRON EXTERNE (Cron-job.org, Coolify scheduled task…) :
//      header `Authorization: Bearer <CRON_SECRET>` (env serveur).
//      Sans CRON_SECRET configuré → ce mode est désactivé (fail-closed).
//   2. SUPERADMIN connecté (test manuel depuis la Console).
//
// IDEMPOTENT : lastRunAt garantit 1 exécution réelle/jour/règle —
// appeler la route plusieurs fois par jour sert de rattrapage sûr.
//
// CONFIGURATION CRON-JOB.ORG (MVP) :
//   URL    : https://<votre-domaine>/api/admin/trigger-daily-automations
//   Méthode: POST
//   Headers: Authorization: Bearer <CRON_SECRET>
//   Crontab: 0 8 * * *  (tous les matins à 8 h — heure du marché)
// =============================================================

export async function POST(req: Request) {
  const startedAt = Date.now();
  try {
    const bearer = req.headers.get('authorization') ?? '';
    const cronSecret = process.env.CRON_SECRET?.trim();
    const isCron = Boolean(cronSecret) && bearer === `Bearer ${cronSecret}`;

    if (!isCron) {
      const admin = await requireSuperadmin();
      if (!admin) return adminUnauthorized();
    }

    const report = await checkDailyAutomations();
    // TOUR DE CONTRÔLE (v5.6) — journalisation du cron.
    await logCronRun('daily-automations', 'SUCCESS', Date.now() - startedAt);
    return NextResponse.json({
      ok: true,
      mode: isCron ? 'cron' : 'superadmin',
      ...report,
    });
  } catch (error) {
    await logCronRun(
      'daily-automations',
      'FAILED',
      Date.now() - startedAt,
      error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
    );
    await captureError('admin.trigger-daily-automations', error, undefined, req);
    return NextResponse.json(
      { ok: false, error: 'Erreur serveur. Réessayez dans un instant.' },
      { status: 500 },
    );
  }
}

// GET = alias pratique pour les moniteurs de disponibilité (uptime
// checks GET-only) — même authentification que le POST.
export async function GET(req: Request) {
  return POST(req);
}
