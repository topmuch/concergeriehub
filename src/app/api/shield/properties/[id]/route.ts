// =============================================================
// /api/shield/properties/[id] — ROOMSCAN BOUCLIER AUTOMATISÉ
// GET : détail d'un logement onboardé — bibliothèque de référence
// (appareils + QR + hash), zones (photos fantômes) et historique
// des sessions (check-in / check-out) avec liens PDF + vidéo.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveShieldAccess, shieldPropertyOwned } from '@/lib/shield-access';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await resolveShieldAccess();
    if (!access.ok) {
      return NextResponse.json(
        { error: access.error, message: access.message },
        { status: access.status },
      );
    }
    const { id } = await params;

    const property = await shieldPropertyOwned(id, access.subscriptionId);
    if (!property) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const sessions = await db.shieldSession.findMany({
      where: { propertyId: property.id },
      orderBy: { completedAt: 'desc' },
      take: 100,
      include: {
        video: { select: { publicToken: true, sha256: true, durationSec: true } },
        shots: { select: { status: true } },
      },
    });

    return NextResponse.json({
      property: {
        id: property.id,
        propertyName: property.propertyName,
        propertyAddress: property.propertyAddress,
        city: property.city,
        ownerName: property.ownerName,
        onboardingRef: property.onboardingRef,
        onboardedAt: property.onboardedAt.toISOString(),
      },
      zones: property.zones.map((z) => ({
        id: z.id,
        name: z.name,
        referencePhoto: z.referencePhoto,
        sortOrder: z.sortOrder,
      })),
      devices: (await db.shieldDevice.findMany({
        where: { propertyId: property.id },
        orderBy: { sortOrder: 'asc' },
      })).map((d) => ({
        id: d.id,
        name: d.name,
        kind: d.kind,
        referenceCode: d.referenceCode,
        referenceHash: d.referenceHash,
        referencePhoto: d.referencePhoto,
        referenceDate: d.referenceDate.toISOString(),
        sortOrder: d.sortOrder,
      })),
      sessions: sessions.map((s) => ({
        id: s.id,
        type: s.type,
        agentName: s.agentName,
        sessionRef: s.sessionRef,
        linkedSessionId: s.linkedSessionId, // v4.120 — verrouillage lecture seule côté UI
        completedAt: s.completedAt.toISOString(),
        videoToken: s.video?.publicToken ?? null,
        videoSha256: s.video?.sha256 ?? null,
        durationSec: s.video?.durationSec ?? null,
        impeccableCount: s.shots.filter((x) => x.status === 'IMPECCABLE').length,
        degradationCount: s.shots.filter((x) => x.status === 'DEGRADATION').length,
        shotsCount: s.shots.length,
      })),
    });
  } catch (err) {
    console.error('[shield/properties/:id] GET failed:', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
