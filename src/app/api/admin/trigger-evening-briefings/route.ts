import { NextResponse } from 'next/server';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { runEveningBriefings } from '@/lib/evening-briefing';
import { captureError } from '@/lib/error-monitor';
import { logCronRun } from '@/lib/monitoring-engine';

// =============================================================
// BRIEFING DU SOIR — DÉCLENCHEUR (v5.19)
//   POST /api/admin/trigger-evening-briefings
//
// Envoie le « Bilan de la journée » (email enrichi : préparatifs de
// demain, points d'attention, revenus du jour, KPIs, motivation) à
// chaque hôte — activé PAR DÉFAUT (désactivable via Paramètres →
// Notifications → « 🌇 Briefing du soir »), anti-doublon
// 1 email/jour/utilisateur, échéance = heure serveur ≥ 18 h
// (Dakar = UTC+0).
//
// Double authentification (même spec que trigger-coach-reports) :
//   1. CRON EXTERNE (Coolify scheduled task, Cron-job.org…) :
//      header `Authorization: Bearer <CRON_SECRET>` (env serveur).
//      Sans CRON_SECRET configuré → ce mode est désactivé (fail-closed).
//   2. SUPERADMIN connecté (test manuel depuis la Console).
//
// CONFIGURATION CRON EXTERNE :
//   URL    : https://<votre-domaine>/api/admin/trigger-evening-briefings
//   Méthode: POST
//   Headers: Authorization: Bearer <CRON_SECRET>
//   Crontab: 0 * * * *  (toutes les heures — chaque hôte est servi
//            dès que l'heure serveur atteint 18 h ; appel manqué =
//            rattrapage au tick suivant. Le scheduler interne
//            embarqué (instrumentation.ts) tourne aussi chaque
//            heure → le cron externe est une redondance optionnelle.)
//
// ?force=1 (superadmin uniquement) : envoie immédiatement un bilan
// de test à tous les hôtes, sans tenir compte de l'heure ni de
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
    const summary = await runEveningBriefings({ force });
    // TOUR DE CONTRÔLE — journalisation du cron (horaires).
    await logCronRun('evening-briefings', 'SUCCESS', Date.now() - startedAt);
    return NextResponse.json({ ok: true, mode, force, ...summary });
  } catch (error) {
    await logCronRun(
      'evening-briefings',
      'FAILED',
      Date.now() - startedAt,
      error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
    );
    await captureError('admin.trigger-evening-briefings', error, undefined, req);
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
