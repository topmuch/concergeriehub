// =============================================================
// COACH ROOMSCAN — PHASE 3 : RAPPORT EMAIL QUOTIDIEN (v5.4)
//
// runCoachDailyReports() — appelée par le cron externe (route
// /api/admin/trigger-coach-reports) et le test manuel superadmin :
//
//   1. Pour chaque utilisateur ayant des CoachPreferences actives
//      (reportFrequency 'daily' | 'weekly') :
//        • échéance = l'heure serveur a atteint l'heure reportTime
//          (daily tous les jours, weekly le lundi uniquement) ;
//        • anti-doublon : 1 email/jour/utilisateur (outbox
//          template 'coach_daily_report', sauf FAILED retentable) ;
//   2. Collecte des insights ACTIFS de tous les biens de
//      l'utilisateur (non résolus, non expirés), filtrés par ses
//      enabledInsightTypes — SANS régénération moteur (le rapport
//      reflète ce que le Coach a déjà détecté, cache API 1 h) ;
//   3. Construction d'un email HTML sobre RoomScan (zéro icône,
//      points colorés par priorité, liens absolus vers les pages
//      d'action) + version texte — envoi via queueEmail (outbox).
//
// Ne lève JAMAIS : chaque utilisateur est isolé (try/catch), le
// résumé d'exécution agrège sent / skipped / failed.
// =============================================================

import { db } from '@/lib/db';
import { resolveUserProperties } from '@/lib/b2b-server';
import { INSIGHT_TYPES } from '@/lib/insight-engine';
import { queueEmail } from '@/lib/email';
import { siteUrl } from '@/lib/site';

export interface CoachReportRunSummary {
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  details: { userId: string; status: 'SENT' | 'SKIPPED' | 'FAILED'; reason?: string }[];
}

interface ReportInsight {
  id: string;
  propertyId: string;
  type: string;
  priority: string;
  title: string;
  message: string;
  actionLabel: string;
  actionUrl: string;
}

const PRIORITY_META: Record<string, { label: string; color: string }> = {
  CRITICAL: { label: 'URGENT', color: '#f07d6a' },
  HIGH: { label: 'IMPORTANT', color: '#e9c47c' },
  MEDIUM: { label: 'À NOTER', color: '#5cadf0' },
  LOW: { label: 'INFO', color: '#94a3b8' },
};

const TYPE_LABELS: Record<string, string> = {
  STOCK: 'Stock',
  REVENUE: 'Revenu',
  REVIEW: 'Avis',
  UPSELL: 'Upsell',
  OPERATION: 'Opération',
  QUALITY: 'Qualité',
  BEHAVIOR: 'Comportement',
};

const fmtDay = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Heure du reportTime ("07:00") → entier 0-23 (défaut 7 si invalide). */
function reportHourOf(reportTime: string): number {
  const m = /^([01]?\d|2[0-3]):[0-5]\d$/.exec(reportTime?.trim() ?? '');
  return m ? parseInt(m[1], 10) : 7;
}

/** Types d'insights activés par l'utilisateur (JSON string → liste). */
function enabledTypesOf(enabledInsightTypes: string): string[] {
  try {
    const parsed = JSON.parse(enabledInsightTypes) as unknown;
    if (Array.isArray(parsed)) {
      const valid = parsed.filter(
        (t): t is (typeof INSIGHT_TYPES)[number] =>
          typeof t === 'string' && (INSIGHT_TYPES as string[]).includes(t),
      );
      if (valid.length > 0) return valid;
    }
  } catch {
    // JSON invalide → tous les types
  }
  return [...INSIGHT_TYPES];
}

// -------------------------------------------------------------
// Construction de l'email (HTML sobre + texte brut)
// -------------------------------------------------------------

interface BuildArgs {
  firstName: string;
  propertyNameOf: (propertyId: string) => string | null;
  insights: ReportInsight[];
  frequency: string;
}

function buildReportEmail({ firstName, propertyNameOf, insights, frequency }: BuildArgs) {
  const today = fmtDay.format(new Date());
  const criticals = insights.filter((i) => i.priority === 'CRITICAL');
  const perProperty = new Map<string, ReportInsight[]>();
  for (const i of insights) {
    const list = perProperty.get(i.propertyId) ?? [];
    list.push(i);
    perProperty.set(i.propertyId, list);
  }

  const subject =
    criticals.length > 0
      ? `Coach RoomScan · ${today} — ${criticals.length} urgence${criticals.length > 1 ? 's' : ''} à traiter`
      : `Coach RoomScan · Votre briefing du ${today}`;

  const insightRowHtml = (i: ReportInsight) => {
    const meta = PRIORITY_META[i.priority] ?? PRIORITY_META.LOW;
    return `
      <tr>
        <td style="padding:14px 16px;border-top:1px solid #e8edf6">
          <table style="width:100%;border-collapse:collapse">
            <tr>
              <td style="vertical-align:top;width:14px;padding-right:10px">
                <span style="display:inline-block;width:9px;height:9px;border-radius:9999px;background:${meta.color}"></span>
              </td>
              <td style="vertical-align:top">
                <p style="margin:0;font-size:15px;font-weight:600;color:#101b36">${escapeHtml(i.title)}
                  <span style="font-size:10px;font-weight:700;letter-spacing:0.08em;color:${meta.color}">&nbsp;${meta.label}</span>
                  <span style="font-size:11px;color:#5d6b8a">&nbsp;·&nbsp;${escapeHtml(TYPE_LABELS[i.type] ?? i.type)}</span>
                </p>
                <p style="margin:6px 0 10px;font-size:13px;line-height:1.55;color:#3f4c6b">${escapeHtml(i.message)}</p>
                <a href="${siteUrl}${i.actionUrl}"
                   style="display:inline-block;padding:8px 16px;border-radius:9999px;background:#101b36;color:#ffffff;font-size:12px;font-weight:600;text-decoration:none">
                  ${escapeHtml(i.actionLabel)} →
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
  };

  const propertyBlockHtml = Array.from(perProperty.entries())
    .map(([propertyId, list]) => {
      const name = propertyNameOf(propertyId) ?? 'Votre bien';
      return `
        <tr>
          <td style="padding:26px 0 8px">
            <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#5d6b8a">${escapeHtml(name)}</p>
          </td>
        </tr>
        <tr>
          <td>
            <table style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e8edf6;border-radius:14px;overflow:hidden">
              ${list.map(insightRowHtml).join('')}
            </table>
          </td>
        </tr>`;
    })
    .join('');

  const headline =
    insights.length === 0
      ? 'Aucune recommandation active — tout est sous contrôle.'
      : `${insights.length} recommandation${insights.length > 1 ? 's' : ''} active${insights.length > 1 ? 's' : ''}${
          criticals.length > 0 ? ` dont ${criticals.length} urgence${criticals.length > 1 ? 's' : ''}` : ''
        }.`;

  const html = `
    <div style="background:#f7f6f3;padding:32px 16px;font-family:Georgia,'Times New Roman',serif">
      <div style="max-width:560px;margin:0 auto">
        <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#8a94ad;text-align:center">RoomScan · Coach IA</p>
        <h1 style="margin:10px 0 4px;font-size:26px;font-weight:600;color:#101b36;text-align:center">Briefing du ${today}</h1>
        <p style="margin:0 0 26px;font-size:14px;color:#5d6b8a;text-align:center">Bonjour ${escapeHtml(firstName)}, ${headline}</p>
        ${propertyBlockHtml}
        <table style="width:100%;border-collapse:collapse;margin-top:30px">
          <tr>
            <td style="text-align:center;padding:18px;border-top:1px solid #e8edf6">
              <a href="${siteUrl}/airbnb/dashboard"
                 style="display:inline-block;padding:10px 22px;border-radius:9999px;background:#101b36;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none">
                Ouvrir mon tableau de bord
              </a>
              <p style="margin:14px 0 0;font-size:11px;color:#8a94ad">
                Rapport ${frequency === 'weekly' ? 'hebdomadaire' : 'quotidien'} ·
                <a href="${siteUrl}/airbnb/settings" style="color:#5d6b8a">Modifier mes préférences</a>
              </p>
              <p style="margin:6px 0 0;font-size:11px;color:#b6bdd0">Vous recevez cet email car le Coach Roomscan est activé sur votre compte.</p>
            </td>
          </tr>
        </table>
      </div>
    </div>`;

  const textParts: string[] = [`BRIEFING DU ${today.toUpperCase()} — Coach RoomScan`];
  if (insights.length === 0) {
    textParts.push('Aucune recommandation active — tout est sous contrôle.');
  } else {
    for (const [propertyId, list] of perProperty.entries()) {
      textParts.push(`\n— ${propertyNameOf(propertyId) ?? 'Votre bien'} —`);
      for (const i of list) {
        const meta = PRIORITY_META[i.priority] ?? PRIORITY_META.LOW;
        textParts.push(`[${meta.label}] ${i.title} (${TYPE_LABELS[i.type] ?? i.type})`);
        textParts.push(`  ${i.message}`);
        textParts.push(`  Action : ${siteUrl}${i.actionUrl}`);
      }
    }
  }
  textParts.push(`\nTableau de bord : ${siteUrl}/airbnb/dashboard`);
  textParts.push(`Préférences : ${siteUrl}/airbnb/settings`);

  return { subject, html, text: textParts.join('\n') };
}

// -------------------------------------------------------------
// Runner principal
// -------------------------------------------------------------

export async function runCoachDailyReports(
  opts?: { force?: boolean; now?: Date },
): Promise<CoachReportRunSummary> {
  const summary: CoachReportRunSummary = { processed: 0, sent: 0, skipped: 0, failed: 0, details: [] };
  const now = opts?.now ?? new Date();
  const force = opts?.force === true;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const isMonday = now.getDay() === 1;

  // Utilisateurs abonnés (jamais/absent de la table = pas de rapport).
  const prefs = await db.coachPreferences.findMany({
    where: { reportFrequency: { in: ['daily', 'weekly'] } },
    include: { user: { select: { id: true, email: true, fullName: true } } },
  });

  for (const pref of prefs) {
    const user = pref.user;
    const push = async (status: 'SENT' | 'SKIPPED' | 'FAILED', reason?: string) => {
      summary.processed += 1;
      summary[status === 'SENT' ? 'sent' : status === 'SKIPPED' ? 'skipped' : 'failed'] += 1;
      summary.details.push({ userId: pref.userId, status, reason });
    };

    try {
      if (!user?.email || !user.email.includes('@')) {
        await push('SKIPPED', 'email_manquant');
        continue;
      }

      // ── Échéance : l'heure serveur a atteint l'heure souhaitée. ──
      if (!force) {
        if (pref.reportFrequency === 'weekly' && !isMonday) {
          await push('SKIPPED', 'pas_lundi');
          continue;
        }
        if (now.getHours() < reportHourOf(pref.reportTime)) {
          await push('SKIPPED', 'trop_tot');
          continue;
        }

        // ── Anti-doublon : déjà envoyé (ou en file) aujourd'hui ? ──
        const already = await db.emailOutbox.count({
          where: {
            template: 'coach_daily_report',
            userId: pref.userId,
            createdAt: { gte: startOfToday },
            status: { not: 'FAILED' },
          },
        });
        if (already > 0) {
          await push('SKIPPED', 'deja_envoye');
          continue;
        }
      }

      // ── Biens de l'utilisateur + insights actifs ──
      const properties = await resolveUserProperties(pref.userId);
      if (properties.length === 0) {
        await push('SKIPPED', 'aucun_bien');
        continue;
      }
      const propertyIds = properties.map((p) => p.id);
      const propertyNameOf = (propertyId: string) =>
        properties.find((p) => p.id === propertyId)?.name ?? null;

      const enabledTypes = enabledTypesOf(pref.enabledInsightTypes);
      const rows = await db.dashboardInsight.findMany({
        where: {
          propertyId: { in: propertyIds },
          isResolved: false,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
        take: 24,
      });
      const filtered = rows
        .filter((r) => enabledTypes.includes(r.type))
        .slice(0, 10)
        .map((r) => ({
          id: r.id,
          propertyId: r.propertyId,
          type: r.type,
          priority: r.priority,
          title: r.title,
          message: r.message,
          actionLabel: r.actionLabel,
          actionUrl: r.actionUrl,
        })) as ReportInsight[];

      // ── Email (outbox fire-and-forget, jamais bloquant) ──
      const { subject, html, text } = buildReportEmail({
        firstName: user.fullName?.split(' ')[0] || 'hôte',
        propertyNameOf,
        insights: filtered,
        frequency: pref.reportFrequency,
      });
      const result = await queueEmail({
        to: user.email,
        subject,
        html,
        text,
        template: 'coach_daily_report',
        userId: pref.userId,
        referenceType: 'coach_report',
        meta: {
          frequency: pref.reportFrequency,
          insightsCount: filtered.length,
          criticals: filtered.filter((i) => i.priority === 'CRITICAL').length,
        },
      });

      if (result.status === 'SENT') await push('SENT');
      else await push('FAILED', result.error ?? result.status);
    } catch (error) {
      console.error('[coach-report] utilisateur échoué :', error);
      await push('FAILED', error instanceof Error ? error.message.slice(0, 120) : 'erreur');
    }
  }

  return summary;
}
