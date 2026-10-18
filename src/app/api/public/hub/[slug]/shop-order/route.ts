import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { resolveHubPropertyId } from '@/lib/hub-resolve';
import { rateLimit } from '@/lib/rate-limit';
import { captureError } from '@/lib/error-monitor';
import {
  sendNotificationToMany,
  notifySuperadmins,
  propertyOwnerAndManagers,
} from '@/lib/notifications';
// v4.46 — email structuré hôte (hub_alert) + URL absolue du CTA.
import { renderHubAlertEmail } from '@/lib/email-template-render';
import { siteUrl } from '@/lib/site';
import { parseShopItems, SHOP_COMMISSION_RATE } from '@/lib/concierge';

// =============================================================
// v4.33 « SHOP THE STAY » — POST /api/public/hub/[slug]/shop-order
//
// Demande client : « Une section boutique où le voyageur peut acheter
// ces produits (ex: le café local, livré dans sa boîte aux lettres
// chez vous). L'hôte touche une commission d'affiliation. »
//
// POST (invité, libre) : { itemId, qty?, guestName? }
//   - L'item est RETROUVÉ CÔTÉ SERVEUR dans le catalogue du bien
//     (jamais cru côté client) → prix + commission vérifiés serveur.
//   Effet : notification hôte (cloche + email + push selon préférences)
//   « l'invité souhaite acheter X — commission ≈ Y € ». Le règlement
//   et l'expédition se font ensuite avec l'hôte (v1 sans paiement).
// Sécurité : rate limit 6/min par slug+IP ; zod ; never-throw ;
// mode démo = succès sans écriture.
// =============================================================

const DEMO_SLUG = 'demo-hub';
const isDemo = (slug: string) => slug === DEMO_SLUG;

const orderSchema = z.object({
  itemId: z.string().trim().min(1).max(40),
  qty: z.number().int().min(1).max(9).optional().nullable(),
  guestName: z.string().trim().max(80).optional().nullable(),
});

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0].trim() : null) || 'local';
}

const eur = (v: number) => v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

/** v4.42 — résolution unifiée : plaque V1 OU Property.qrHubSlug. */

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;

    // Anti-spam : 6 commandes / minute / slug+IP
    if (!(await rateLimit(`hubshop:${slug}:${clientIp(req)}`, 6))) {
      return NextResponse.json(
        { error: 'Trop de demandes rapprochées. Réessayez dans un instant.' },
        { status: 429 },
      );
    }

    const rawBody = await req.json().catch(() => null);
    if (!rawBody || typeof rawBody !== 'object') {
      return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
    }
    const parsed = orderSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Requête invalide.' },
        { status: 400 },
      );
    }

    const { itemId, guestName } = parsed.data;
    const qty = parsed.data.qty ?? 1;

    // ── DEMO MODE : succès sans écriture ──
    if (isDemo(slug)) {
      return NextResponse.json({
        success: true,
        message: 'Demande envoyée (mode démo) — votre hôte vous recontacte.',
      });
    }

    const resolved = await resolveHubPropertyId(slug);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.message }, { status: resolved.status });
    }

    const property = await db.property.findUnique({
      where: { id: resolved.propertyId },
      select: {
        id: true,
        name: true,
        premiumFeatures: true,
        owner: { select: { id: true } },
      },
    });
    if (!property?.owner?.id) {
      return NextResponse.json({ error: 'Ce hub est introuvable.' }, { status: 404 });
    }

    // Prix/commission TOUJOURS calculés côté serveur (jamais cru client).
    const item = parseShopItems(property.premiumFeatures).find((i) => i.id === itemId);
    if (!item) {
      return NextResponse.json({ error: 'Ce produit n’est plus disponible.' }, { status: 404 });
    }
    const total = Math.round(item.price * qty * 100) / 100;
    const commission = Math.round(total * SHOP_COMMISSION_RATE * 100) / 100;

    // Notification hôte unifiée (cloche + email + push selon préférences).
    // v4.46 — email STRUCTURÉ (hub_alert) + relais SUPERADMIN.
    const audience = await propertyOwnerAndManagers(property.id);
    const body =
      `${guestName ?? 'Un invité'} souhaite acheter « ${item.name} » ×${qty} (${eur(total)}). ` +
      `Commission d’affiliation ≈ ${eur(commission)}. Contactez l’invité pour le règlement et la livraison chez lui.`;
    const hubEmail = await renderHubAlertEmail({
      heading: '🛍️ Nouvelle commande — Shop the Stay',
      propertyName: property.name,
      guestName,
      rows: [
        { label: 'Produit', value: `${item.emoji ?? ''} ${item.name}`.trim() },
        { label: 'Quantité', value: `×${qty}` },
      ],
      totalLabel: 'Total à encaisser',
      totalValue: eur(total),
      introNote: `Commission d'affiliation estimée ≈ ${eur(commission)}. Contactez l'invité pour le règlement et la livraison.`,
      ctaLabel: 'Ouvrir le tableau de bord',
      ctaUrl: `${siteUrl}/airbnb/dashboard`,
      footerNote: 'Email envoyé automatiquement depuis le Hub invité.',
    }).catch(() => null);
    const customEmail = hubEmail
      ? { subject: hubEmail.subject, html: hubEmail.html, text: hubEmail.text }
      : undefined;
    if (audience.length > 0) {
      await sendNotificationToMany(audience, 'shop_order', {
        title: `🛍️ Shop the Stay — ${item.name}`,
        body,
        propertyId: property.id,
        propertyName: property.name,
        url: '/airbnb/dashboard',
        ...(customEmail ? { email: customEmail } : {}),
        meta: {
          source: 'hub',
          shop: true,
          itemId: item.id,
          itemName: item.name,
          qty,
          totalEur: total,
          commissionEur: commission,
          hubSlug: slug,
          guestName: guestName ?? null,
        },
      });
    } else {
      // Filet de sécurité : jamais sans trace.
      await db.notification.create({
        data: {
          userId: property.owner.id,
          type: 'guest_shop_order',
          title: `🛍️ Shop the Stay — ${item.name}`,
          body,
          dataJson: JSON.stringify({
            source: 'hub',
            itemId: item.id,
            itemName: item.name,
            qty,
            totalEur: total,
            commissionEur: commission,
            hubSlug: slug,
          }),
        },
      });
    }

    // v4.46 — relais SUPERADMIN (audit plateforme, fire-and-forget).
    if (customEmail) {
      void notifySuperadmins('shop_order', {
        title: `🛍️ [Plateforme] Commande boutique — ${property.name}`,
        body,
        propertyId: property.id,
        propertyName: property.name,
        url: '/airbnb/dashboard',
        email: customEmail,
        meta: { source: 'hub', relay: 'superadmin', itemId: item.id, hubSlug: slug },
      }).catch(() => undefined);
    }

    return NextResponse.json({
      success: true,
      item: { id: item.id, name: item.name, priceEur: total },
      commissionEur: commission,
      message: 'Demande envoyée — votre hôte vous recontacte pour la livraison.',
    });
  } catch (error) {
    await captureError('hub.shop-order', error, undefined, req);
    return NextResponse.json(
      { error: 'Erreur serveur. Réessayez dans un instant.' },
      { status: 500 },
    );
  }
}
