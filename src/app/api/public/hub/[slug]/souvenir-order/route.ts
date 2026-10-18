// =============================================================
// POST /api/public/hub/[slug]/souvenir-order
//
// v4.74 « BOUTIQUE DE SOUVENIRS » — commande d'un souvenir par
// l'invité depuis le hub (produit actif uniquement, prix snapshot).
// → crée SouvenirOrder (status PENDING) + notifie l'hôte (in-app
//   + email via sendNotificationToMany, même mécanique que minibar).
// 🔒 requireHubAccess + rate limit 6/min.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clientIp } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';
import { resolveHubPropertyId } from '@/lib/hub-resolve';
import { requireHubAccess } from '@/lib/hub-access';
import { sendNotificationToMany, propertyOwnerAndManagers } from '@/lib/notifications';
import { souvenitOrderSchema } from '@/lib/smart-notifications';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    if (!(await rateLimit(`hubsouvenir:${slug}:${clientIp(req.headers)}`, 6))) {
      return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });
    }
    const access = await requireHubAccess(slug, req);
    if (!access.ok) {
      return NextResponse.json({ error: access.code, message: access.message }, { status: access.status });
    }
    const resolved = await resolveHubPropertyId(slug);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.message }, { status: resolved.status });
    }

    const parsed = souvenitOrderSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Formulaire invalide — vérifiez le produit et la quantité.' }, { status: 400 });
    }
    const { productId, quantity, deliveryMode, guestNote } = parsed.data;

    const product = await db.souvenirProduct.findFirst({
      where: { id: productId, propertyId: resolved.propertyId, isActive: true },
      select: { id: true, name: true, price: true },
    });
    if (!product) {
      return NextResponse.json({ error: 'Ce souvenir n\'est plus disponible.' }, { status: 404 });
    }

    const order = await db.souvenirOrder.create({
      data: {
        propertyId: resolved.propertyId,
        bookingId: access.bookingId ?? null,
        productId: product.id,
        productName: product.name,
        quantity,
        unitPrice: product.price,
        deliveryMode,
        guestNote: guestNote ? guestNote : null,
      },
    });

    // Notification hôte (in-app + email selon prefs) — jamais bloquante.
    sendNotificationToMany(
      await propertyOwnerAndManagers(resolved.propertyId),
      'new_order',
      {
        title: `🛍️ Nouvelle commande souvenir — ${product.name}`,
        body: `${quantity} × ${product.name} (${(product.price * quantity).toFixed(2).replace('.', ',')} €) — ${
          deliveryMode === 'in_lodging' ? 'à livrer au logement' : 'à remettre au check-out'
        }.`,
        propertyId: resolved.propertyId,
        url: '/airbnb/souvenirs',
        meta: { kind: 'souvenir_order', orderId: order.id, productId: product.id, quantity },
      },
    ).catch(() => undefined);

    return NextResponse.json({
      ok: true,
      order: { id: order.id, total: product.price * quantity },
    });
  } catch (error) {
    console.error('[public/hub souvenir-order POST] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
