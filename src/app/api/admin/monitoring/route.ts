// =============================================================
// GET   /api/admin/monitoring — « TOUR DE CONTRÔLE » (v5.6, Phase 3)
// PATCH /api/admin/monitoring — résolution d'un incident
//
// GET renvoie l'état complet pour la page superadmin :
//   • `current`  — dernière SystemMetric + rapport /api/health frais
//     (mesure à la demande, ~1 s) ;
//   • `kpis`     — moyennes API/DB (1 h), uptime DB 24 h, erreurs 500
//     24 h, paiements/emails en échec 24 h, incidents actifs ;
//   • `series`   — métriques des 24 h (API + DB ms, par tick) pour la
//     courbe recharts ;
//   • `hourly`   — 24 seaux horaires (erreurs 500 / paiements / emails
//     en échec cumulés) pour le graphique en barres ;
//   • `incidents` — incidents ACTIFS (50 derniers) ;
//   • `crons`    — 10 derniers CronLog.
// PATCH { incidentId, resolutionNote } → isResolved + note.
// Auth superadmin stricte (requireSuperadmin).
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { db } from '@/lib/db';
import { fetchHealthData } from '@/lib/health-check';
import { captureError } from '@/lib/error-monitor';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const admin = await requireSuperadmin();
    if (!admin) return adminUnauthorized();

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // ── Dernière métrique + rapport frais (mesure à la demande) ──
    const [latestMetric, freshHealth, openIncidents, resolvedCount] = await Promise.all([
      db.systemMetric.findFirst({ orderBy: { timestamp: 'desc' } }),
      fetchHealthData().catch(() => null),
      db.systemIncident.findMany({
        where: { isResolved: false },
        orderBy: [{ createdAt: 'desc' }],
        take: 50,
      }),
      db.systemIncident.count({ where: { isResolved: true } }),
    ]);

    // ── Agrégats 1 h & 24 h ─────────────────────────────────────
    const [metrics1h, metrics24h, errorLogs24h, failedTx24h, stripeErrors24h, failedEmails24h] =
      await Promise.all([
        db.systemMetric.findMany({
          where: { timestamp: { gte: oneHourAgo } },
          select: { apiResponseTime: true, dbResponseTime: true, status: true },
        }),
        db.systemMetric.findMany({
          where: { timestamp: { gte: since24h } },
          orderBy: { timestamp: 'asc' },
          select: {
            timestamp: true,
            apiResponseTime: true,
            dbResponseTime: true,
            status: true,
            error500Count: true,
            failedPayments: true,
            failedEmails: true,
            diskUsagePercent: true,
          },
        }),
        db.auditLog.count({
          where: { action: 'runtime.error', createdAt: { gte: since24h } },
        }),
        db.transaction.count({
          where: { status: 'failed', createdAt: { gte: since24h } },
        }),
        db.auditLog.count({
          where: {
            action: 'runtime.error',
            entityType: { contains: 'stripe' },
            createdAt: { gte: since24h },
          },
        }),
        db.emailOutbox.count({
          where: { status: 'FAILED', createdAt: { gte: since24h } },
        }),
      ]);

    const avg = (rows: { apiResponseTime: number; dbResponseTime: number }[]) => {
      const dbRows = rows.filter((r) => r.dbResponseTime >= 0);
      if (rows.length === 0) return { api: null as number | null, db: null as number | null };
      return {
        api: Math.round(rows.reduce((s, r) => s + r.apiResponseTime, 0) / rows.length),
        db:
          dbRows.length > 0
            ? Math.round(dbRows.reduce((s, r) => s + r.dbResponseTime, 0) / dbRows.length)
            : null,
      };
    };
    const avg1h = avg(metrics1h);

    const upMetrics24h = metrics24h.filter((m) => m.status !== 'DOWN').length;
    const dbUptime24h = metrics24h.length > 0 ? upMetrics24h / metrics24h.length : null;

    // ── Séries 24 h (échantillon toutes les ~5 min, max 288 pts) ──
    const series = metrics24h.slice(-288).map((m) => ({
      time: m.timestamp.toISOString(),
      api: Math.round(m.apiResponseTime),
      db: m.dbResponseTime >= 0 ? Math.round(m.dbResponseTime) : null,
      status: m.status,
    }));

    // ── Seaux horaires (24 h) ───────────────────────────────────
    const hourly: { hour: string; errors: number; payments: number; emails: number }[] = [];
    for (let i = 23; i >= 0; i -= 1) {
      const bucketStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        now.getHours() - i,
        0,
        0,
        0,
      );
      const bucketEnd = new Date(bucketStart.getTime() + 60 * 60 * 1000);
      const inBucket = metrics24h.filter(
        (m) => m.timestamp >= bucketStart && m.timestamp < bucketEnd,
      );
      hourly.push({
        hour: `${String(bucketStart.getHours()).padStart(2, '0')}h`,
        errors: inBucket.reduce((s, m) => s + m.error500Count, 0),
        payments: inBucket.reduce((s, m) => s + m.failedPayments, 0),
        emails: inBucket.reduce((s, m) => s + m.failedEmails, 0),
      });
    }

    const crons = await db.cronLog.findMany({
      orderBy: { executedAt: 'desc' },
      take: 10,
    });

    return NextResponse.json({
      current: {
        metric: latestMetric,
        health: freshHealth,
        activeIncidents: openIncidents.length,
      },
      kpis: {
        avgApiMs1h: avg1h.api,
        avgDbMs1h: avg1h.db,
        dbUptime24h,
        error500Count24h: errorLogs24h,
        failedPayments24h: failedTx24h + stripeErrors24h,
        failedEmails24h,
        activeIncidents: openIncidents.length,
        resolvedIncidentsTotal: resolvedCount,
      },
      series,
      hourly,
      incidents: openIncidents,
      crons,
    });
  } catch (error) {
    await captureError('admin.monitoring.GET', error);
    return NextResponse.json(
      { error: 'Erreur serveur. Réessayez dans un instant.' },
      { status: 500 },
    );
  }
}

/** Résolution d'un incident depuis la Tour de Contrôle. */
export async function PATCH(req: NextRequest) {
  try {
    const admin = await requireSuperadmin();
    if (!admin) return adminUnauthorized();

    const body = (await req.json().catch(() => ({}))) as {
      incidentId?: unknown;
      resolutionNote?: unknown;
    };
    if (typeof body.incidentId !== 'string' || body.incidentId.length === 0) {
      return NextResponse.json({ error: 'incidentId requis' }, { status: 400 });
    }

    const existing = await db.systemIncident.findUnique({ where: { id: body.incidentId } });
    if (!existing) {
      return NextResponse.json({ error: 'Incident introuvable' }, { status: 404 });
    }
    if (existing.isResolved) {
      return NextResponse.json({ ok: true, already: true });
    }

    await db.systemIncident.update({
      where: { id: body.incidentId },
      data: {
        isResolved: true,
        resolvedAt: new Date(),
        resolutionNote:
          typeof body.resolutionNote === 'string' && body.resolutionNote.trim().length > 0
            ? body.resolutionNote.trim().slice(0, 500)
            : `Résolu depuis la Tour de Contrôle (${admin.email ?? 'superadmin'}).`,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    await captureError('admin.monitoring.PATCH', error);
    return NextResponse.json(
      { error: 'Erreur serveur. Réessayez dans un instant.' },
      { status: 500 },
    );
  }
}
