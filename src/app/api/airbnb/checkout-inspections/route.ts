// =============================================================
// /api/airbnb/checkout-inspections — ÉTATS DES LIEUX DE SORTIE (v5.0)
//
// GET  ?propertyId=<id|all> : 20 dernières inspections des biens
//        accessibles (session obligatoire). Liste LÉGÈRE : statuts
//        par pièce, dégâts, auto-évaluation, compteur de photos —
//        jamais les dataURL (photos/signature restent côté preuve).
// PATCH { id, status } : traitement hôte — 'reviewed' (consultée)
//        ou 'resolved' (traitée → resolvedAt horodaté). L'inspection
//        doit appartenir à un bien de l'utilisateur (anti IDOR).
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { resolveUserProperties } from '@/lib/b2b-server';

/** Statuts par pièce depuis roomsData (fallback colonnes dénormalisées). */
function roomFlags(raw: unknown): { damaged: string[]; dirty: string[] } {
  const damaged: string[] = [];
  const dirty: string[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const r = item as Record<string, unknown>;
      const label = typeof r.label === 'string' ? r.label : typeof r.id === 'string' ? r.id : '';
      if (!label) continue;
      if (r.status === 'damaged') damaged.push(label);
      else if (r.status === 'dirty') dirty.push(label);
    }
  }
  return { damaged, dirty };
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const properties = await resolveUserProperties(userId);
    if (properties.length === 0) {
      return NextResponse.json({ inspections: [], properties: [] });
    }

    const { searchParams } = new URL(req.url);
    const requestedId = searchParams.get('propertyId');
    const ids =
      requestedId && requestedId !== 'all' && properties.some((p) => p.id === requestedId)
        ? [requestedId]
        : properties.map((p) => p.id);
    const names = new Map(properties.map((p) => [p.id, p.name]));

    const inspections = await db.checkOutInspection.findMany({
      where: { propertyId: { in: ids } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        propertyId: true,
        guestName: true,
        guestEmail: true,
        entranceStatus: true,
        kitchenStatus: true,
        livingRoomStatus: true,
        bedroomsStatus: true,
        bathroomStatus: true,
        roomsData: true,
        damages: true,
        selfAssessment: true,
        status: true,
        publicToken: true,
        signedAt: true,
        createdAt: true,
        bookingId: true,
      },
    });

    return NextResponse.json({
      properties: properties.map((p) => ({ id: p.id, name: p.name })),
      inspections: inspections.map((i) => {
        const flags = roomFlags(i.roomsData);
        return {
          id: i.id,
          propertyId: i.propertyId,
          propertyName: names.get(i.propertyId) ?? null,
          guestName: i.guestName,
          hasDamages: flags.damaged.length > 0,
          damagedRooms: flags.damaged,
          dirtyRooms: flags.dirty,
          selfAssessment: i.selfAssessment,
          status: i.status,
          signedAt: i.signedAt.toISOString(),
          createdAt: i.createdAt.toISOString(),
          publicUrl: `/public/inspection/${i.publicToken}`,
        };
      }),
    });
  } catch (error) {
    console.error('[airbnb/checkout-inspections GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as { id?: string; status?: string } | null;
    const id = typeof body?.id === 'string' ? body.id.trim() : '';
    const status = typeof body?.status === 'string' ? body.status.trim() : '';
    if (!id || !['reviewed', 'resolved'].includes(status)) {
      return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
    }

    const inspection = await db.checkOutInspection.findUnique({
      where: { id },
      select: { id: true, propertyId: true },
    });
    if (!inspection) {
      return NextResponse.json({ error: 'Inspection introuvable.' }, { status: 404 });
    }

    const properties = await resolveUserProperties(userId);
    if (!properties.some((p) => p.id === inspection.propertyId)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    await db.checkOutInspection.update({
      where: { id },
      data: {
        status,
        ...(status === 'resolved' ? { resolvedAt: new Date() } : {}),
      },
    });

    return NextResponse.json({ ok: true, status });
  } catch (error) {
    console.error('[airbnb/checkout-inspections PATCH] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
