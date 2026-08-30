// =============================================================
// /api/airbnb/plaques — ÉTAPE 6 : les plaques QR physiques
//
// GET  : liste des plaques de l'hôte (claimées par lui ou liées à
//        ses biens) avec statut, bien, slug hub, code d'activation.
// POST : génère une nouvelle plaque "numérique" pour un bien
//        (hubSlug public, code d'activation, batch dédié).
//        La plaque est immédiatement active et imprimable.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { resolveUserProperties, canAccessProperty } from '@/lib/b2b-server';

interface PlaqueDTO {
  id: string;
  hubSlug: string | null;
  status: string;
  activationCode: string;
  createdAt: string;
  claimedAt: string | null;
  property: { id: string; name: string } | null;
}

const INCLUDE = {
  property: { select: { id: true, name: true } },
} as const;

type PlaqueWithProperty = {
  id: string;
  hubSlug: string | null;
  status: string;
  activationCode: string;
  createdAt: Date;
  claimedAt: Date | null;
  property: { id: string; name: string } | null;
};

function toDTO(p: PlaqueWithProperty): PlaqueDTO {
  return {
    id: p.id,
    hubSlug: p.hubSlug,
    status: p.status,
    activationCode: p.activationCode,
    createdAt: p.createdAt.toISOString(),
    claimedAt: p.claimedAt?.toISOString() ?? null,
    property: p.property ? { id: p.property.id, name: p.property.name } : null,
  };
}

// ── Générateurs de codes (alphabet sans ambiguïté 0/O, 1/I) ──
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomCode(length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

/** "Loft Canal Saint-Martin" → "loft-canal-saint-martin" (max 28 car.) */
function slugifyName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 28)
    .replace(/-$/, '');
}

// ── GET : liste des plaques de l'hôte ──
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;

    const properties = await resolveUserProperties(userId);
    const propertyIds = properties.map((p) => p.id);

    const plaques = await db.physicalQrCode.findMany({
      where: {
        OR: [{ claimedByUserId: userId }, { propertyId: { in: propertyIds } }],
      },
      orderBy: { createdAt: 'desc' },
      include: INCLUDE,
    });

    return NextResponse.json({
      plaques: plaques.map(toDTO),
      properties: properties.map((p) => ({ id: p.id, name: p.name })),
    });
  } catch (error) {
    console.error('Plaques GET error:', error);
    return NextResponse.json(
      { error: 'Erreur serveur. Réessayez dans un instant.' },
      { status: 500 }
    );
  }
}

// ── POST : générer une nouvelle plaque pour un bien ──
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;

    const body = (await req.json().catch(() => null)) as { propertyId?: string } | null;
    if (!body?.propertyId) {
      return NextResponse.json({ error: 'Bien requis' }, { status: 400 });
    }
    if (!(await canAccessProperty(userId, body.propertyId))) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const property = await db.property.findUnique({
      where: { id: body.propertyId },
      select: { id: true, name: true },
    });
    if (!property) {
      return NextResponse.json({ error: 'Bien introuvable' }, { status: 404 });
    }

    // hubSlug unique (slug du nom du bien + suffixe aléatoire)
    const base = slugifyName(property.name) || 'plaque';
    let hubSlug = `${base}-${randomCode(4).toLowerCase()}`;
    for (let i = 0; i < 5; i += 1) {
      const exists = await db.physicalQrCode.findUnique({ where: { hubSlug } });
      if (!exists) break;
      hubSlug = `${base}-${randomCode(4).toLowerCase()}`;
    }

    const batch = await db.qrBatch.create({
      data: { quantity: 1, createdBy: userId },
    });

    const plaque = await db.physicalQrCode.create({
      data: {
        batchId: batch.id,
        activationCode: `PLQ-${randomCode(4)}-${randomCode(4)}`,
        setupToken: `SETUP-${randomCode(8)}`,
        status: 'active',
        isClaimed: true,
        claimedByUserId: userId,
        claimedAt: new Date(),
        activatedByUserId: userId,
        activatedAt: new Date(),
        propertyId: property.id,
        hubSlug,
      },
      include: INCLUDE,
    });

    return NextResponse.json({ plaque: toDTO(plaque) }, { status: 201 });
  } catch (error) {
    console.error('Plaques POST error:', error);
    return NextResponse.json(
      { error: 'Erreur serveur. Réessayez dans un instant.' },
      { status: 500 }
    );
  }
}
