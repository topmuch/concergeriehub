// =============================================================
// /api/shield/notifications — v4.167 · CLOCHE DE NOTIFICATIONS 🔔
// (master prompt client — Problème 12 : badge rouge si un check-out
// est en retard, une anomalie a été détectée, l'équipe a uploadé les
// photos de référence / une délégation attend).
//
// GET : agrégats RÉELS de l'abonnement courant, calculés à la volée
// (zéro cron) :
//   · late     — sessions planifiées (check-in / check-out) dont la
//                date est dépassée sans validation (EN_RETARD) ;
//   · anomalies — zones « À nettoyer » / « Dégradation » détectées
//                dans les sessions terminées des 7 derniers jours ;
//   · photos   — biens en délégation dont les photos de référence
//                sont attendues de l'équipe (PENDING_PHOTOS).
// =============================================================
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveShieldAccess } from '@/lib/shield-access';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const access = await resolveShieldAccess();
    if (!access.ok) {
      return NextResponse.json({ error: access.error, message: access.message }, { status: access.status });
    }

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [lateSessions, pendingPhotos, recentAnomalies] = await Promise.all([
      db.shieldSession.findMany({
        where: {
          status: 'A_VENIR',
          scheduledDate: { lt: now },
          property: { subscriptionId: access.subscriptionId },
        },
        orderBy: { scheduledDate: 'asc' },
        take: 20,
        select: {
          id: true,
          type: true,
          guestName: true,
          scheduledDate: true,
          sessionRef: true,
          property: { select: { propertyName: true } },
        },
      }),
      db.shieldProperty.findMany({
        where: { subscriptionId: access.subscriptionId, onboardingStatus: 'PENDING_PHOTOS' },
        select: { id: true, propertyName: true, onboardedAt: true },
        take: 10,
      }),
      db.shieldZoneShot.findMany({
        where: {
          status: { not: 'IMPECCABLE' },
          session: {
            status: 'TERMINE',
            completedAt: { gte: weekAgo },
            property: { subscriptionId: access.subscriptionId },
          },
        },
        orderBy: { capturedAt: 'desc' },
        take: 20,
        select: {
          id: true,
          zoneName: true,
          status: true,
          comment: true,
          capturedAt: true,
          session: {
            select: {
              id: true,
              sessionRef: true,
              type: true,
              guestName: true,
              property: { select: { propertyName: true } },
            },
          },
        },
      }),
    ]);

    const late = lateSessions.map((s) => ({
      id: s.id,
      kind: 'late' as const,
      type: s.type,
      guestName: s.guestName,
      sessionRef: s.sessionRef,
      scheduledDate: (s.scheduledDate ?? now).toISOString(),
      propertyName: s.property.propertyName,
    }));

    const anomalies = recentAnomalies.map((z) => ({
      id: z.id,
      kind: 'anomaly' as const,
      zoneName: z.zoneName,
      shotStatus: z.status,
      comment: z.comment,
      capturedAt: z.capturedAt.toISOString(),
      sessionId: z.session.id,
      sessionRef: z.session.sessionRef,
      sessionType: z.session.type,
      guestName: z.session.guestName,
      propertyName: z.session.property.propertyName,
    }));

    const photos = pendingPhotos.map((p) => ({
      id: p.id,
      kind: 'photos' as const,
      propertyName: p.propertyName,
      since: p.onboardedAt.toISOString(),
    }));

    return NextResponse.json({
      late,
      anomalies,
      photos,
      checkoutLateCount: late.filter((l) => l.type === 'CHECK_OUT').length,
      total: late.length + anomalies.length + photos.length,
    });
  } catch (err) {
    console.error('[shield/notifications] error:', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
