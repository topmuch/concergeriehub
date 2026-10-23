// =============================================================
// MONITORING ENGINE — « TOUR DE CONTRÔLE » (v5.6, Phase 2)
//
// Le cerveau du monitoring maison RoomScan. Appelé par le cron
// externe (toutes les 5 min) via /api/admin/monitoring-tick et par
// le bouton « Contrôle immédiat » de la page superadmin.
//
// runMonitoringTick() :
//   1. Mesure la santé (fetchHealthData — DB, Stripe, SMTP, disque)
//      ; apiResponseTime mesuré par un self-fetch de /api/health
//      (repli : durée interne) ;
//   2. Compte les métriques métier : erreurs 500 (AuditLog
//      runtime.error, 5 min), paiements Stripe échoués (1 h),
//      emails en échec (outbox FAILED, 1 h) ;
//   3. Enregistre une ligne SystemMetric ;
//   4. DÉTECTION PRÉDICTIVE (dédupliquée par titre non résolu) :
//        - DB > 500 ms                        → WARNING DATABASE
//        - tendance DB (6 derniers ticks)     → WARNING PREDICTIVE
//        - erreurs 500 > 10 / 5 min           → CRITICAL SERVER
//        - paiements échoués > 3 / 1 h        → WARNING PAYMENT
//        - emails FAILED > 20 / 1 h           → WARNING EMAIL
//        - Stripe/SMTP injoignable            → CRITICAL PAYMENT/EMAIL
//        - disque > 80 % / > 90 %             → WARNING/CRITICAL SERVER
//        - cron en retard (intervals/job)     → CRITICAL SERVER
//   5. Nouveau incident WARNING/CRITICAL → email au(x) superadmin(s)
//      (objet « 🚨 [RoomScan] Alerte Système : … », outbox).
//
// runMonitoringCleanup() : purge métriques + cron logs > 30 j,
// archive les incidents non résolus > 7 j.
// Ne lève JAMAIS : chaque étape est isolée (le tick doit toujours
// écrire sa métrique, même si un détecteur échoue).
// =============================================================

import { db } from '@/lib/db';
import { siteUrl } from '@/lib/site';
import { fetchHealthData, type HealthReport } from '@/lib/health-check';
import { queueEmail } from '@/lib/email';

export type IncidentSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type IncidentCategory = 'SERVER' | 'DATABASE' | 'PAYMENT' | 'EMAIL' | 'PREDICTIVE';

export interface DetectedAnomaly {
  severity: IncidentSeverity;
  category: IncidentCategory;
  title: string;
  description: string;
}

export interface MonitoringTickSummary {
  ok: boolean;
  metricId: string | null;
  status: 'OK' | 'DEGRADED' | 'DOWN';
  dbResponseTime: number | null;
  apiResponseTime: number | null;
  anomalies: DetectedAnomaly[];
  newIncidents: { id: string; title: string; severity: IncidentSeverity }[];
  emailsSent: number;
  // v4.98 — escalades (rappels d'incidents toujours actifs) + retentées
  // de la file d'emails en échec + incidents « cron rétabli » clôturés.
  escalatedEmails: number;
  emailsRetried: number;
  recoveredIncidents: string[];
  errors: string[];
}

/** Interval d'exécution attendu par job (ms) — détection « cron bloqué ». */
const CRON_EXPECTED_INTERVALS: Record<string, number> = {
  'monitoring-tick': 5 * 60 * 1000, // toutes les 5 min
  'monitoring-cleanup': 26 * 60 * 60 * 1000, // 1×/jour (+ marge)
  'daily-automations': 26 * 60 * 60 * 1000, // 1×/jour (idempotent, rattrapage)
  // v4.105 — le cron officiel coach-reports passe toutes les 15 min
  // (Coolify */15) + scheduler interne horaire → tolérer 2 h sans
  // passage avant alerte (anti-faux positifs, détection rapide).
  'coach-reports': 2 * 60 * 60 * 1000,
};
const CRON_GRACE_FACTOR = 1.5; // alerte si retard > interval × 1.5

const DISK_WARN = 80;
const DISK_CRITICAL = 90;

// -------------------------------------------------------------
// Mesure apiResponseTime : self-fetch de /api/health (6 s max).
// -------------------------------------------------------------

/**
 * v4.98 — Base du self-fetch. En PROD : domaine siteUrl (comme avant).
 * En DEV : on reste LOCAL (127.0.0.1) — sans ça, le tick mesurait la
 * santé du site de PRODUCTION (fallback siteUrl = roomscan.pro) au
 * lieu de celle du serveur dev, et alertait à contre-sens.
 */
function selfBaseUrl(): string {
  if (process.env.NODE_ENV !== 'production') {
    return `http://127.0.0.1:${process.env.PORT ?? 3000}`;
  }
  return siteUrl.replace(/\/$/, '');
}

async function measureApiResponseTime(): Promise<{ ms: number; report: HealthReport | null }> {
  const base = selfBaseUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6_000);
  const startedAt = Date.now();
  try {
    const res = await fetch(`${base}/api/health`, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { 'User-Agent': 'roomscan-monitoring/1.0' },
    });
    const ms = Date.now() - startedAt;
    if (res.ok) {
      const report = (await res.json()) as HealthReport;
      return { ms, report };
    }
    return { ms, report: null };
  } catch {
    return { ms: Date.now() - startedAt, report: null };
  } finally {
    clearTimeout(timer);
  }
}

// -------------------------------------------------------------
// Métriques métier (fenêtres glissantes)
// -------------------------------------------------------------

async function countBusinessMetrics(now: Date) {
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const [error500Count, stripeErrors, failedTx, failedEmails] = await Promise.all([
    db.auditLog.count({
      where: { action: 'runtime.error', createdAt: { gte: fiveMinAgo } },
    }),
    // Erreurs capturées d'origine Stripe (webhook, checkout, billing…).
    db.auditLog.count({
      where: {
        action: 'runtime.error',
        entityType: { contains: 'stripe' },
        createdAt: { gte: oneHourAgo },
      },
    }),
    // Transactions explicitement en échec (statut 'failed' réservé).
    db.transaction.count({
      where: { status: 'failed', createdAt: { gte: oneHourAgo } },
    }),
    db.emailOutbox.count({
      where: { status: 'FAILED', createdAt: { gte: oneHourAgo } },
    }),
  ]);

  return {
    error500Count,
    failedPayments: failedTx + stripeErrors,
    failedEmails,
  };
}

// -------------------------------------------------------------
// Journal des crons (utilisé par toutes les routes cron)
// -------------------------------------------------------------

export async function logCronRun(
  jobName: string,
  status: 'SUCCESS' | 'FAILED' | 'TIMEOUT',
  durationMs: number,
  errorMessage?: string,
): Promise<void> {
  try {
    await db.cronLog.create({
      data: {
        jobName,
        status,
        duration: Math.max(0, Math.round(durationMs)),
        errorMessage: errorMessage ? errorMessage.slice(0, 300) : null,
      },
    });
  } catch (error) {
    // Le log ne doit jamais faire échouer le job lui-même.
    console.error('[monitoring] logCronRun failed:', error);
  }
}

// -------------------------------------------------------------
// Détection prédictive & création d'incidents (dédupliquée)
// -------------------------------------------------------------

/** Un incident non résolu du même titre existe déjà ? → on incrémente. */
async function upsertIncident(anomaly: DetectedAnomaly, now: Date): Promise<string | null> {
  const existing = await db.systemIncident.findFirst({
    where: { title: anomaly.title, isResolved: false },
    orderBy: { createdAt: 'desc' },
  });

  if (existing) {
    await db.systemIncident.update({
      where: { id: existing.id },
      data: {
        occurrences: { increment: 1 },
        lastSeenAt: now,
        // Montée en sévérité si la situation s'aggrave.
        severity:
          rank(anomaly.severity) > rank(existing.severity as IncidentSeverity)
            ? anomaly.severity
            : (existing.severity as IncidentSeverity),
        description: anomaly.description,
      },
    });
    return null; // déjà connu → pas de nouvel email (l'escalade s'en charge)
  }

  const created = await db.systemIncident.create({
    data: {
      severity: anomaly.severity,
      category: anomaly.category,
      title: anomaly.title,
      description: anomaly.description,
      // v4.98 — l'email d'alerte part juste après la création : on
      // date tout de suite pour ancrer l'escalade (rappel toutes les
      // 4 h tant que l'incident reste actif).
      lastEmailAt: now,
    },
  });
  return created.id;
}

function rank(severity: IncidentSeverity): number {
  return severity === 'CRITICAL' ? 3 : severity === 'WARNING' ? 2 : 1;
}

/** Détecteurs principaux (conditions instantanées du tick). */
function detectAnomalies(
  report: HealthReport | null,
  metrics: { error500Count: number; failedPayments: number; failedEmails: number },
): DetectedAnomaly[] {
  const found: DetectedAnomaly[] = [];

  // 1. DB lente (> 500 ms alors que l'habituel est < 50 ms).
  if (report && report.checks.db.status === 'up' && report.checks.db.latencyMs > 500) {
    found.push({
      severity: 'WARNING',
      category: 'DATABASE',
      title: 'Base de données ralentit',
      description: `Le ping DB a répondu en ${report.checks.db.latencyMs} ms (seuil : 500 ms, habituel < 50 ms). Les requêtes de l'application peuvent être ralenties.`,
    });
  }

  // 2. DB injoignable.
  if (report && report.checks.db.status === 'down') {
    found.push({
      severity: 'CRITICAL',
      category: 'DATABASE',
      title: 'Base de données injoignable',
      description: `Le ping Prisma a échoué : ${report.checks.db.error ?? 'erreur inconnue'}. Le site est probablement indisponible pour tous les utilisateurs.`,
    });
  }

  // 3. Pic d'erreurs serveur.
  if (metrics.error500Count > 10) {
    found.push({
      severity: 'CRITICAL',
      category: 'SERVER',
      title: "Pic d'erreurs serveur",
      description: `${metrics.error500Count} erreurs runtime capturées en 5 minutes (seuil : 10). Une régression est probablement en cours — consultez Logs & Tickets.`,
    });
  }

  // 4. Paiements Stripe en échec.
  if (metrics.failedPayments > 3) {
    found.push({
      severity: 'WARNING',
      category: 'PAYMENT',
      title: 'Problème détecté sur Stripe',
      description: `${metrics.failedPayments} paiements/appels Stripe en échec sur la dernière heure (seuil : 3). Vérifiez les webhooks et les clés API.`,
    });
  }

  // 5. File d'emails en échec.
  if (metrics.failedEmails > 20) {
    found.push({
      severity: 'WARNING',
      category: 'EMAIL',
      title: "File d'emails en échec",
      description: `${metrics.failedEmails} emails en échec sur la dernière heure (seuil : 20). Le provider email refuse peut-être les envois — consultez la console Emails.`,
    });
  }

  // 6. Stripe injoignable (le ping externe échoue).
  if (report && report.checks.stripe.status === 'down') {
    found.push({
      severity: 'CRITICAL',
      category: 'PAYMENT',
      title: 'Stripe injoignable',
      description: `L'API Stripe ne répond pas (${report.checks.stripe.error ?? 'timeout'}). Les paiements hub et abonnements peuvent échouer.`,
    });
  }

  // 7. SMTP injoignable (v4.95 : Resend retiré, SMTP = seul provider email).
  if (report && report.checks.smtp.status === 'down') {
    found.push({
      severity: 'WARNING',
      category: 'EMAIL',
      title: 'SMTP injoignable',
      description: `Le serveur SMTP ne répond pas (${report.checks.smtp.error ?? 'timeout'}). Les emails sortants peuvent être retardés.`,
    });
  }

  // 8. Disque.
  if (report && report.checks.disk.usagePercent !== null) {
    const pct = report.checks.disk.usagePercent;
    if (pct > DISK_CRITICAL) {
      found.push({
        severity: 'CRITICAL',
        category: 'SERVER',
        title: 'Espace disque critique',
        description: `Le disque est rempli à ${pct} % (seuil critique : 90 %). Risque de panne en écriture (logs, DB) imminente.`,
      });
    } else if (pct > DISK_WARN) {
      found.push({
        severity: 'WARNING',
        category: 'SERVER',
        title: "Espace disque à surveiller",
        description: `Le disque est rempli à ${pct} % (seuil d'alerte : 80 %). Planifiez un nettoyage des logs/ artefacts.`,
      });
    }
  }

  return found;
}

/**
 * Détection prédictive : tendance de ralentissement DB + crons en retard.
 * v4.98 — retourne AUSSI les « recoveries » : les incidents « Cron job
 * bloqué : X » auto-résolus parce que le job a de nouveau tourné dans
 * son intervalle attendu (l'app envoie alors un email de rétablissement).
 */
async function detectPredictive(
  now: Date,
): Promise<{ anomalies: DetectedAnomaly[]; recoveries: string[] }> {
  const found: DetectedAnomaly[] = [];
  const recoveries: string[] = [];

  // 1. Tendance DB : moyenne des 6 derniers ticks > 300 ms ET > 3× la
  // moyenne des 12 ticks précédents → dérive lente avant la casse.
  try {
    const recent = await db.systemMetric.findMany({
      orderBy: { timestamp: 'desc' },
      take: 18,
      select: { dbResponseTime: true, timestamp: true },
    });
    if (recent.length >= 12) {
      const last6 = recent.slice(0, 6);
      const prev12 = recent.slice(6, 18);
      const avg = (rows: typeof recent) =>
        rows.reduce((s, r) => s + r.dbResponseTime, 0) / rows.length;
      const recentAvg = avg(last6);
      const prevAvg = avg(prev12);
      if (recentAvg > 300 && recentAvg > prevAvg * 3) {
        found.push({
          severity: 'WARNING',
          category: 'PREDICTIVE',
          title: 'Tendance de ralentissement de la base de données',
          description: `Le ping DB dérive : ${Math.round(recentAvg)} ms en moyenne sur les 6 derniers contrôles, contre ${Math.round(prevAvg)} ms avant (×${(recentAvg / prevAvg).toFixed(1)}). Une saturation (connexions, verrous, disque) se prépare peut-être.`,
        });
      }
    }
  } catch {
    // best effort
  }

  // 2. Crons en retard (par interval attendu) + AUTO-RÉSOLUTION v4.98.
  for (const [jobName, intervalMs] of Object.entries(CRON_EXPECTED_INTERVALS)) {
    try {
      const last = await db.cronLog.findFirst({
        where: { jobName },
        orderBy: { executedAt: 'desc' },
      });
      if (!last) continue; // jamais exécuté → pas d'alerte tant que rien n'est configuré
      const lateBy = now.getTime() - last.executedAt.getTime();
      if (lateBy > intervalMs * CRON_GRACE_FACTOR) {
        const hours = Math.floor(lateBy / (60 * 60 * 1000));
        const minutes = Math.floor((lateBy % (60 * 60 * 1000)) / (60 * 1000));
        found.push({
          severity: 'CRITICAL',
          category: 'SERVER',
          title: `Cron job bloqué : ${jobName}`,
          description: `Le dernier passage de « ${jobName} » date de ${hours} h ${minutes} min (attendu toutes les ${Math.round(intervalMs / 60000)} min) — statut ${last.status}. Les traitements automatisés ne tournent plus : vérifiez le cron externe et les logs.`,
        });
      } else {
        // v4.98 — le job refonctionne : on clôt automatiquement tout
        // incident « Cron job bloqué » encore ouvert (rétablissement).
        const stale = await db.systemIncident.findFirst({
          where: { title: `Cron job bloqué : ${jobName}`, isResolved: false },
          orderBy: { createdAt: 'desc' },
        });
        if (stale) {
          await db.systemIncident.update({
            where: { id: stale.id },
            data: {
              isResolved: true,
              resolvedAt: now,
              resolutionNote:
                'Rétabli automatiquement : le job a de nouveau tourné dans son intervalle attendu (scheduler interne).',
            },
          });
          recoveries.push(stale.title);
        }
      }
    } catch {
      // best effort
    }
  }

  return { anomalies: found, recoveries };
}

// -------------------------------------------------------------
// Email d'alerte aux superadmins
// -------------------------------------------------------------

const SEVERITY_INK: Record<IncidentSeverity, string> = {
  CRITICAL: '#f07d6a',
  WARNING: '#e9c47c',
  INFO: '#5cadf0',
};

interface AlertEmailOptions {
  /** 'alert' (🚨 nouveau) | 'escalade' (🔁 rappel) | 'recovery' (✅ rétabli). */
  kind: 'alert' | 'escalade' | 'recovery';
  /** Ligne d'entête sous le titre (contexte escalade/rétablissement). */
  contextLine?: string;
}

/** v4.98 — Envie un email d'alerte/rappel/rétablissement aux superadmins. */
async function alertSuperadmins(
  anomalies: DetectedAnomaly[],
  options: AlertEmailOptions = { kind: 'alert' },
): Promise<number> {
  if (anomalies.length === 0) return 0;
  const admins = await db.user.findMany({
    where: { role: 'superadmin', isActive: true },
    select: { id: true, email: true },
  });
  const recipients = admins.filter((a) => a.email?.includes('@'));
  if (recipients.length === 0) return 0;

  const criticals = anomalies.filter((a) => a.severity === 'CRITICAL');
  const prefix =
    options.kind === 'recovery' ? '✅ [RoomScan] Problème résolu' : options.kind === 'escalade' ? '🔁 [RoomScan] Rappel — toujours en cours' : '🚨 [RoomScan] Alerte Système';
  const subject =
    anomalies.length === 1
      ? `${prefix} : ${anomalies[0].title}`
      : `${prefix} : ${anomalies.length} anomalies${options.kind === 'alert' && criticals.length > 0 ? ` dont ${criticals.length} critique${criticals.length > 1 ? 's' : ''}` : ''}`;

  const rowsHtml = anomalies
    .map(
      (a) => `
      <tr>
        <td style="padding:14px 16px;border-top:1px solid #e8edf6">
          <p style="margin:0;font-size:15px;font-weight:600;color:#101b36">
            <span style="display:inline-block;width:9px;height:9px;border-radius:9999px;background:${SEVERITY_INK[a.severity]};margin-right:8px"></span>${escapeHtml(a.title)}
            <span style="font-size:10px;font-weight:700;letter-spacing:0.08em;color:${SEVERITY_INK[a.severity]}">&nbsp;${a.severity} · ${a.category}</span>
          </p>
          <p style="margin:6px 0 0;font-size:13px;line-height:1.55;color:#3f4c6b">${escapeHtml(a.description)}</p>
        </td>
      </tr>`,
    )
    .join('');

  const headline =
    options.kind === 'recovery' ? 'Problème résolu' : options.kind === 'escalade' ? 'Rappel — incident toujours actif' : 'Alerte système';
  const contextLine = options.contextLine ??
    (options.kind === 'recovery'
      ? 'La situation est revenue à la normale — clôturé automatiquement par la surveillance.'
      : options.kind === 'escalade'
        ? 'Cet incident reste actif depuis plusieurs heures : premier rappel toutes les 4 h jusqu\'à résolution.'
        : `${anomalies.length} anomalie${anomalies.length > 1 ? 's détectées' : ' détectée'} par la surveillance automatique.`);

  const html = `
    <div style="background:#f7f6f3;padding:32px 16px;font-family:Georgia,'Times New Roman',serif">
      <div style="max-width:560px;margin:0 auto">
        <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#8a94ad;text-align:center">RoomScan · Tour de Contrôle</p>
        <h1 style="margin:10px 0 4px;font-size:24px;font-weight:600;color:${options.kind === 'recovery' ? '#1a7a4a' : '#101b36'};text-align:center">${headline}</h1>
        <p style="margin:0 0 26px;font-size:14px;color:#5d6b8a;text-align:center">
          ${contextLine}
        </p>
        <table style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e8edf6;border-radius:14px;overflow:hidden">
          ${rowsHtml}
        </table>
        <table style="width:100%;border-collapse:collapse;margin-top:30px">
          <tr>
            <td style="text-align:center;padding:18px;border-top:1px solid #e8edf6">
              <a href="${siteUrl}/admin/monitoring"
                 style="display:inline-block;padding:10px 22px;border-radius:9999px;background:#101b36;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none">
                Ouvrir la Tour de Contrôle
              </a>
              <p style="margin:14px 0 0;font-size:11px;color:#8a94ad">
                Les incidents déjà connus ne génèrent pas de nouvel email — ils restent visibles dans la Tour de Contrôle.
              </p>
            </td>
          </tr>
        </table>
      </div>
    </div>`;

  const text = anomalies
    .map((a) => `[${a.severity} · ${a.category}] ${a.title}\n  ${a.description}`)
    .join('\n\n');

  let sent = 0;
  for (const admin of recipients) {
    try {
      const result = await queueEmail({
        to: admin.email,
        subject,
        html,
        text,
        template: 'system_alert',
        userId: admin.id,
        referenceType: 'system_alert',
        meta: {
          anomalies: anomalies.map((a) => ({ title: a.title, severity: a.severity, category: a.category })),
        },
      });
      if (result.status === 'SENT') sent += 1;
    } catch (error) {
      console.error('[monitoring] email alerte échoué :', error);
    }
  }
  return sent;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// -------------------------------------------------------------
// TICK PRINCIPAL
// -------------------------------------------------------------

export async function runMonitoringTick(): Promise<MonitoringTickSummary> {
  const now = new Date();
  const summary: MonitoringTickSummary = {
    ok: false,
    metricId: null,
    status: 'OK',
    dbResponseTime: null,
    apiResponseTime: null,
    anomalies: [],
    newIncidents: [],
    emailsSent: 0,
    escalatedEmails: 0,
    emailsRetried: 0,
    recoveredIncidents: [],
    errors: [],
  };

  // 1. Santé (self-fetch mesuré + rapport complet).
  const { ms: apiMs, report } = await measureApiResponseTime();
  let health = report;
  if (!health) {
    // Repli : appel interne direct (self-fetch impossible sur ce réseau).
    try {
      health = await fetchHealthData();
    } catch (error) {
      summary.errors.push(
        `health: ${error instanceof Error ? error.message.slice(0, 120) : 'échec'}`,
      );
    }
  }
  summary.apiResponseTime = apiMs;
  summary.dbResponseTime = health?.checks.db.latencyMs ?? null;
  summary.status = health?.status ?? 'DOWN';

  // 2. Métriques métier.
  let business: { error500Count: number; failedPayments: number; failedEmails: number } = {
    error500Count: 0,
    failedPayments: 0,
    failedEmails: 0,
  };
  try {
    business = await countBusinessMetrics(now);
  } catch (error) {
    summary.errors.push(
      `business: ${error instanceof Error ? error.message.slice(0, 120) : 'échec'}`,
    );
  }

  // 3. Persistance SystemMetric (toujours, même si l'étape 2 a échoué).
  try {
    const metric = await db.systemMetric.create({
      data: {
        apiResponseTime: Math.round(apiMs),
        dbResponseTime: health?.checks.db.latencyMs ?? -1, // -1 = DB injoignable
        diskUsagePercent: health?.checks.disk.usagePercent ?? null,
        externalChecks: JSON.stringify({
          stripe: health?.checks.stripe ?? { status: 'skipped' },
          smtp: health?.checks.smtp ?? { status: 'skipped' },
        }),
        status: health?.status ?? 'DOWN',
        error500Count: business.error500Count,
        failedPayments: business.failedPayments,
        failedEmails: business.failedEmails,
      },
    });
    summary.metricId = metric.id;
    summary.ok = true;
  } catch (error) {
    summary.errors.push(
      `metric: ${error instanceof Error ? error.message.slice(0, 120) : 'échec'}`,
    );
  }

  // 4. Détection (instantanée + prédictive + rétablissements crons).
  const predictive = await detectPredictive(now);
  const anomalies = [...detectAnomalies(health, business), ...predictive.anomalies];
  summary.anomalies = anomalies;
  summary.recoveredIncidents = predictive.recoveries;

  // 5. Incidents (dédupliqués) + emails sur les NOUVEAUX.
  const newOnes: { id: string; title: string; severity: IncidentSeverity }[] = [];
  for (const anomaly of anomalies) {
    try {
      const id = await upsertIncident(anomaly, now);
      if (id) {
        newOnes.push({ id, title: anomaly.title, severity: anomaly.severity });
      }
    } catch (error) {
      summary.errors.push(
        `incident: ${error instanceof Error ? error.message.slice(0, 120) : 'échec'}`,
      );
    }
  }
  summary.newIncidents = newOnes;

  if (newOnes.length > 0) {
    const newAnomalies = anomalies.filter((a) => newOnes.some((n) => n.title === a.title));
    try {
      summary.emailsSent = await alertSuperadmins(newAnomalies, { kind: 'alert' });
    } catch (error) {
      summary.errors.push(
        `email: ${error instanceof Error ? error.message.slice(0, 120) : 'échec'}`,
      );
    }
  }

  // 6. ESCALADE v4.98 — incidents TOUJOURS ACTIFS non notifiés depuis
  //    > 4 h : rappel email (le premier peut avoir été raté : SMTP en
  //    échec, incident créé par une version antérieure aux emails…).
  try {
    summary.escalatedEmails = await escalateUnresolvedIncidents(now);
  } catch (error) {
    summary.errors.push(
      `escalade: ${error instanceof Error ? error.message.slice(0, 120) : 'échec'}`,
    );
  }

  // 7. RÉTABLISSEMENT v4.98 — un incident « Cron job bloqué » vient
  //    d'être auto-résolu : email vert pour clore la boucle.
  if (summary.recoveredIncidents.length > 0) {
    try {
      await alertSuperadmins(
        summary.recoveredIncidents.map((title) => ({
          severity: 'INFO' as IncidentSeverity,
          category: 'SERVER' as IncidentCategory,
          title,
          description:
            'Le job a de nouveau tourné dans son intervalle attendu — l\'incident est clôturé automatiquement.',
        })),
        { kind: 'recovery' },
      );
    } catch (error) {
      summary.errors.push(
        `recovery: ${error instanceof Error ? error.message.slice(0, 120) : 'échec'}`,
      );
    }
  }

  // 8. SELF-HEALING v4.98 — retente les emails de l'outbox tombés en
  //    FAILED (max 3 tentatives, fenêtre 24 h, 8 par tick) : une fois
  //    le SMTP réparé, la file se vide TOUTE SEULE — et les alertes
  //    ratées finissent par partir.
  try {
    const { retryFailedOutboxEmails } = await import('@/lib/email');
    summary.emailsRetried = await retryFailedOutboxEmails();
  } catch (error) {
    summary.errors.push(
      `retry-emails: ${error instanceof Error ? error.message.slice(0, 120) : 'échec'}`,
    );
  }

  return summary;
}

// -------------------------------------------------------------
// ESCALADE v4.98 — rappels des incidents actifs non notifiés
// -------------------------------------------------------------

/** Un rappel toutes les 4 h tant que l'incident reste actif. */
const ESCALATION_INTERVAL_MS = 4 * 60 * 60 * 1000;

async function escalateUnresolvedIncidents(now: Date): Promise<number> {
  const unresolved = await db.systemIncident.findMany({
    where: { isResolved: false, severity: { in: ['WARNING', 'CRITICAL'] } },
    orderBy: { lastSeenAt: 'desc' },
    take: 20,
  });
  if (unresolved.length === 0) return 0;

  const due = unresolved.filter((incident) => {
    const lastEmail = incident.lastEmailAt ?? incident.createdAt;
    return now.getTime() - lastEmail.getTime() > ESCALATION_INTERVAL_MS;
  });
  if (due.length === 0) return 0;

  const anomalies: DetectedAnomaly[] = due.map((incident) => ({
    severity: incident.severity as IncidentSeverity,
    category: incident.category as IncidentCategory,
    title: incident.title,
    description: `${incident.description}\n\n⚠️ Rappel automatique : cet incident est toujours actif (détecté ${incident.occurrences} fois, dernière observation ${now.getTime() - incident.lastSeenAt.getTime() < 60_000 ? "à l'instant" : `il y a ${Math.max(1, Math.round((now.getTime() - incident.lastSeenAt.getTime()) / 60_000))} min`}). Résolvez-le depuis la Tour de Contrôle pour stopper les rappels.`,
  }));

  const sent = await alertSuperadmins(anomalies, { kind: 'escalade' });
  if (sent > 0) {
    // Date l'escalade MÊME si l'email part en FAILED dans l'outbox :
    // les retries (étape 8) s'en chargent, et on ne veut pas spammer
    // un rappel à chaque tick tant que SMTP est cassé.
    await db.systemIncident.updateMany({
      where: { id: { in: due.map((i) => i.id) } },
      data: { lastEmailAt: now },
    });
  }
  return sent;
}

// -------------------------------------------------------------
// NETTOYAGE QUOTIDIEN
// -------------------------------------------------------------

export interface CleanupSummary {
  metricsDeleted: number;
  cronLogsDeleted: number;
  incidentsArchived: number;
}

export async function runMonitoringCleanup(): Promise<CleanupSummary> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [metricsDeleted, cronLogsDeleted, incidentsArchived] = await Promise.all([
    db.systemMetric
      .deleteMany({ where: { timestamp: { lt: thirtyDaysAgo } } })
      .then((r) => r.count),
    db.cronLog
      .deleteMany({ where: { executedAt: { lt: thirtyDaysAgo } } })
      .then((r) => r.count),
    // Archivage : les incidents ouverts depuis > 7 j passent « résolus »
    // (note explicite) pour ne pas masquer les nouveaux.
    db.systemIncident
      .updateMany({
        where: { isResolved: false, createdAt: { lt: sevenDaysAgo } },
        data: {
          isResolved: true,
          resolvedAt: now,
          resolutionNote: 'Archivé automatiquement après 7 jours sans résolution.',
        },
      })
      .then((r) => r.count),
  ]);

  return { metricsDeleted, cronLogsDeleted, incidentsArchived };
}
