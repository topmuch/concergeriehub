// =============================================================
// /api/airbnb/properties/[id]/souvenirs/[productId]
//
// v4.74 « BOUTIQUE DE SOUVENIRS » — édition / activation / suppression
// d'un produit par le propriétaire / co-hôte.
//   PATCH  { name?, description?, price?, imageUrl?, category?, isActive? }
//   DELETE → suppression définitive (les commandes gardent le snapshot
//            productName / unitPrice → aucune perte d'historique).
// 🔒 Session + OWNER/MANAGER + mutation guard.
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

type Ctx = { params: Promise<{ id: string; productId: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1, 'Nom du produit requis.').max(60, '60 caractères maximum.').optional(),
  description: z.string().trim().max(280, '280 caractères maximum.').nullable().optional(),
  price: z.number().min(0, 'Prix invalide.').max(10_000, 'Prix trop élevé.').optional(),
  imageUrl: z.string().trim().max(500, 'URL trop longue.').nullable().optional(),
  category: z.enum(SOUVENIR_CATEGORIES).optional(),
  isActive: z.boolean().optional(),
  sort: z.number().int().min(0).max(1000).optional(),
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

export async function PATCH(
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

    const { id, productId } = await params;
    const guard = await requireManager(id, userId);
    if (!guard.ok) {
      return NextResponse.json({ error: guard.message }, { status: guard.status });
    }

    const existing = await db.souvenirProduct.findFirst({
      where: { id: productId, propertyId: id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Produit introuvable.' }, { status: 404 });
    }

    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? 'Formulaire invalide.';
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    const d = parsed.data;
    const data: Record<string, unknown> = {};
    if (d.name !== undefined) data.name = d.name;
    if (d.description !== undefined) data.description = d.description || null;
    if (d.price !== undefined) data.price = Math.round(d.price * 100) / 100;
    if (d.imageUrl !== undefined) data.imageUrl = d.imageUrl || null;
    if (d.category !== undefined) data.category = d.category;
    if (d.isActive !== undefined) data.isActive = d.isActive;
    if (d.sort !== undefined) data.sort = d.sort;

    const product = await db.souvenirProduct.update({ where: { id: productId }, data });
    return NextResponse.json({ ok: true, product });
  } catch (error) {
    console.error('[airbnb souvenirs PATCH] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(
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

    const { id, productId } = await params;
    const guard = await requireManager(id, userId);
    if (!guard.ok) {
      return NextResponse.json({ error: guard.message }, { status: guard.status });
    }

    const existing = await db.souvenirProduct.findFirst({
      where: { id: productId, propertyId: id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Produit introuvable.' }, { status: 404 });
    }

    await db.souvenirProduct.delete({ where: { id: productId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[airbnb souvenirs DELETE] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
