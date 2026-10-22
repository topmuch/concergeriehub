// =============================================================
// /api/shield/properties — ROOMSCAN BOUCLIER AUTOMATISÉ (v5.1)
// GET : liste des logements onboardés de l'abonnement + état de
// l'abonnement (pour la bannière d'expiration du dashboard).
// =============================================================
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveShieldAccess } from '@/lib/shield-access';

export async function GET() {
  try {
    const access = await resolveShieldAccess();
    if (!access.ok) {
      return NextResponse.json(
        { error: access.error, message: access.message },
        { status: access.status },
      );
    }

    const [properties, subscription, upcoming] = await Promise.all([
      db.shieldProperty.findMany({
        where: { subscriptionId: access.subscriptionId },
        orderBy: { onboardedAt: 'desc' },
        select: {
          id: true,
          propertyName: true,
          propertyAddress: true,
          city: true,
          ownerName: true,
          onboardingRef: true,
          onboardedAt: true,
          onboardingStatus: true, // v4.167 — badge « Protégé / Onboarding partiel »
          _count: { select: { devices: true, zones: true, sessions: true } },
          sessions: {
            orderBy: { completedAt: 'desc' },
            take: 1,
            select: { completedAt: true },
          },
        },
      }),
      db.inspectionSubscription.findUnique({
        where: { id: access.subscriptionId },
        select: { status: true, endDate: true },
      }),
      // v4.167 — « Prochain séjour » par bien : première session
      // planifiée (toutes propriétés, tri global par date, 1re par bien).
      db.shieldSession.findMany({
        where: { status: 'A_VENIR', property: { subscriptionId: access.subscriptionId } },
        orderBy: { scheduledDate: 'asc' },
        take: 200,
        select: {
          propertyId: true,
          type: true,
          guestName: true,
          scheduledDate: true,
          createdAt: true,
        },
      }),
    ]);

    // 1er séjour planifié par bien (A_VENIR, date la plus proche).
    const nextVisitByProperty = new Map<string, { type: string; guestName: string | null; scheduledDate: string }>();
    for (const s of upcoming) {
      if (!nextVisitByProperty.has(s.propertyId)) {
        nextVisitByProperty.set(s.propertyId, {
          type: s.type,
          guestName: s.guestName,
          scheduledDate: (s.scheduledDate ?? s.createdAt).toISOString(),
        });
      }
    }

    return NextResponse.json({
      properties: properties.map((p) => ({
        id: p.id,
        propertyName: p.propertyName,
        propertyAddress: p.propertyAddress,
        city: p.city,
        ownerName: p.ownerName,
        onboardingRef: p.onboardingRef,
        onboardedAt: p.onboardedAt.toISOString(),
        onboardingStatus: p.onboardingStatus,
        devicesCount: p._count.devices,
        zonesCount: p._count.zones,
        sessionsCount: p._count.sessions,
        lastSessionAt: p.sessions[0]?.completedAt?.toISOString() ?? null,
        nextVisit: nextVisitByProperty.get(p.id) ?? null,
      })),
      subscription: subscription
        ? { status: subscription.status, endDate: subscription.endDate.toISOString() }
        : null,
    });
  } catch (err) {
    console.error('[shield/properties] GET failed:', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
