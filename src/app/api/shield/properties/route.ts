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

    const [properties, subscription] = await Promise.all([
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
    ]);

    return NextResponse.json({
      properties: properties.map((p) => ({
        id: p.id,
        propertyName: p.propertyName,
        propertyAddress: p.propertyAddress,
        city: p.city,
        ownerName: p.ownerName,
        onboardingRef: p.onboardingRef,
        onboardedAt: p.onboardedAt.toISOString(),
        devicesCount: p._count.devices,
        zonesCount: p._count.zones,
        sessionsCount: p._count.sessions,
        lastSessionAt: p.sessions[0]?.completedAt?.toISOString() ?? null,
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
