// =============================================================
// GET /api/public/hub/[slug]/souvenirs
//
// v4.74 « BOUTIQUE DE SOUVENIRS » — produits ACTIFS du bien pour le
// hub invité. ?meta=1 → { ok, count } uniquement (utilisé par le hub
// pour décider d'afficher ou non la tuile Souvenirs).
// Lecture publique : nom, description, prix, image, catégorie
// (aucune donnée personnelle).
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveHubPropertyId } from '@/lib/hub-resolve';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const resolved = await resolveHubPropertyId(slug);
    if (!resolved.ok) {
      return NextResponse.json({ ok: false, error: resolved.message }, { status: resolved.status });
    }

    const products = await db.souvenirProduct.findMany({
      where: { propertyId: resolved.propertyId, isActive: true },
      orderBy: [{ sort: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        imageUrl: true,
        category: true,
      },
    });

    if (req.nextUrl.searchParams.get('meta') === '1') {
      return NextResponse.json({ ok: true, count: products.length });
    }

    return NextResponse.json({ ok: true, products, count: products.length });
  } catch (error) {
    console.error('[public/hub souvenirs GET] Error:', error);
    return NextResponse.json({ ok: false, error: 'Erreur serveur' }, { status: 500 });
  }
}
