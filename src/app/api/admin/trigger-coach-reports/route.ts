import { NextResponse } from 'next/server';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { runCoachDailyReports } from '@/lib/coach-report';
import { captureError } from '@/lib/error-monitor';
import { logCronRun } from '@/lib/monitoring-engine';

// =============================================================
// COACH ROOMSCAN — PHASE 3 : DÉCLENCHEUR DES RAPPORTS EMAIL (v5.4)
//   POST /api/admin/trigger-coach-reports
//
// Envoie le briefing Coach Roomscan à chaque utilisateur abonné
// (CoachPreferences.reportFrequency 'daily' | 'weekly') dont
// l'heure reportTime est atteinte — anti-doublon 1 email/jour.
//
// Double authentification (même spec que trigger-daily-automations) :
//   1. CRON EXTERNE (Cron-job.org, Coolify scheduled task…) :
//      header `Authorization: Bearer <CRON_SECRET>` (env serveur).
//      Sans CRON_SECRET configuré → ce mode est désactivé (fail-closed).
//   2. SUPERADMIN connecté (test manuel depuis la Console).
//
// CONFIGURATION CRON-JOB.ORG (reportTime par utilisateur) :
//   URL    : https://<votre-domaine>/api/admin/trigger-coach-reports
//   Méthode: POST
//   Headers: Authorization: Bearer <CRON_SECRET>
//   Crontab: 0 * * * *  (toutes les heures — chaque utilisateur est
//            servi dès que l'heure serveur atteint SON reportTime ;
//            appel manqué = rattrapage au tick suivant)
//
// ?force=1 (superadmin uniquement) : envoie immédiatement un rapport
// de test à tous les abonnés, sans tenir compte de l'heure ni de
// l'anti-doublon.
// =============================================================

export async function POST(req: Request) {
  const startedAt = Date.now();
  const bearer = req.headers.get('authorization') ?? '';
  const cronSecret = process.env.CRON_SECRET?.trim();
  const isCron = Boolean(cronSecret) && bearer === `Bearer ${cronSecret}`;

  try {
    let mode: 'cron' | 'superadmin' = 'superadmin';
    if (!isCron) {
      const admin = await requireSuperadmin();
      if (!admin) return adminUnauthorized();
    } else {
      mode = 'cron';
    }

    const force = new URL(req.url).searchParams.get('force') === '1' && !isCron;
    const summary = await runCoachDailyReports({ force });
    // TOUR DE CONTRÔLE (v5.6) — journalisation du cron (horaires).
    await logCronRun('coach-reports', 'SUCCESS', Date.now() - startedAt);
    return NextResponse.json({ ok: true, mode, force, ...summary });
  } catch (error) {
    await logCronRun(
      'coach-reports',
      'FAILED',
      Date.now() - startedAt,
      error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
    );
    await captureError('admin.trigger-coach-reports', error, undefined, req);
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
