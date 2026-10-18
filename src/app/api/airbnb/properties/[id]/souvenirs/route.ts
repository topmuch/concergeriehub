// =============================================================
// /api/airbnb/properties/[id]/souvenirs
//
// v4.74 « BOUTIQUE DE SOUVENIRS » — gestion des produits par l'hôte.
//   GET  → { ok, products } (triés par sort puis createdAt)
//   POST → création { name, description?, price, imageUrl?, category? }
// 🔒 Session + OWNER/MANAGER (canManageTeam) + mutation guard.
// Édition/suppression : /api/airbnb/properties/[id]/souvenirs/[productId]
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getUserRoleForProperty } from '@/lib/b2b-server';
import { canManageTeam } from '@/lib/team';
import { mutationGuard, mutationKey } from '@/lib/mutation-guard';
import { z } from 'zod';
import { SOUVENIR_CATEGORIES } from '@/lib/smart-notifications';

type Ctx = { params: Promise<{ id: string }> };

const MAX_PRODUCTS = 40;

const productSchema = z.object({
  name: z.string().trim().min(1, 'Nom du produit requis.').max(60, '60 caractères maximum.'),
  description: z.string().trim().max(280, '280 caractères maximum.').optional().or(z.literal('')),
  price: z.number().min(0, 'Prix invalide.').max(10_000, 'Prix trop élevé.'),
  imageUrl: z
    .string()
    .trim()
    .max(500, 'URL trop longue.')
    .optional()
    .or(z.literal('')),
  category: z.enum(SOUVENIR_CATEGORIES).optional(),
});

async function requireManager(propertyId: string, userId: string) {
  const role = await getUserRoleForProperty(userId, propertyId);
  if (!role) return { ok: false as const, status: 403, message: 'Accès refusé' };
  if (!canManageTeam(role)) {
    return {
      ok: false as const,
      status: 403,
      message: 'Seuls le propriétaire et le co-hôte peuvent gérer la boutique.',
    };
  }
  return { ok: true as const };
}

export async function GET(
  _req: NextRequest,
  { params }: Ctx,
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const { id } = await params;
    const guard = await requireManager(id, userId);
    if (!guard.ok) {
      return NextResponse.json({ error: guard.message }, { status: guard.status });
    }

    const products = await db.souvenirProduct.findMany({
      where: { propertyId: id },
      orderBy: [{ sort: 'asc' }, { createdAt: 'desc' }],
    });
    return NextResponse.json({ ok: true, products });
  } catch (error) {
    console.error('[airbnb souvenirs GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: Ctx,
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const mutGuard = await mutationGuard(mutationKey('airbnb-mut', req, userId));
    if (mutGuard) return mutGuard;

    const { id } = await params;
    const guard = await requireManager(id, userId);
    if (!guard.ok) {
      return NextResponse.json({ error: guard.message }, { status: guard.status });
    }

    const parsed = productSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? 'Formulaire invalide.';
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const count = await db.souvenirProduct.count({ where: { propertyId: id } });
    if (count >= MAX_PRODUCTS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_PRODUCTS} souvenirs par bien.` },
        { status: 400 },
      );
    }

    const product = await db.souvenirProduct.create({
      data: {
        propertyId: id,
        name: parsed.data.name,
        description: parsed.data.description || null,
        price: Math.round(parsed.data.price * 100) / 100,
        imageUrl: parsed.data.imageUrl || null,
        category: parsed.data.category ?? 'food',
        sort: count,
      },
    });

    return NextResponse.json({ ok: true, product }, { status: 201 });
  } catch (error) {
    console.error('[airbnb souvenirs POST] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
