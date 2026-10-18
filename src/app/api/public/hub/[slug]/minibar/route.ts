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
import { resolveOrigin, siteUrl } from '@/lib/site';
import { parseMinibar } from '@/lib/concierge';
// v4.50 — garde serveur du verrouillage du hub (403 SESSION_EXPIRED).
import { requireHubAccess } from '@/lib/hub-access';

// =============================================================
// v4.44 « MINIBAR NUMÉRIQUE » (Honesty Bar)
//
// POST /api/public/hub/[slug]/minibar
//   body: { items: [{ id, qty }], guestName? }
//
// Demande client : « Les hôtels ont des minibars, apportez ce concept
// aux Airbnb. L'hôte laisse à disposition des snacks, du vin, des
// bières locales ou même des câbles de recharge neufs. Le voyageur
// ouvre la section dédiée, coche ce qu'il a consommé et paie
// instantanément via Stripe ou Apple Pay. »
//
// Fonctionnement :
//   1. L'invité coche ses consommations (panier local) ;
//   2. Le serveur RETROUVE chaque article dans le catalogue du bien
//      (premiumFeatures.minibar.items) et RECALCULE le total
//      (prix jamais cru côté client) ;
//   3. Paiement :
//      • STRIPE_SECRET_KEY configurée → Stripe Checkout Session
//        (Apple Pay / Google Pay / CB inclus automatiquement) →
//        { url } renvoyé, le Hub redirige l'invité ;
//      • sinon → commande « à régler sur place », l'hôte est
//        notifié et encaisse à la remise des clés.
//   4. Notification hôte UNIFIÉE (cloche + email + push selon
//      préférences, type « minibar_order ») avec le détail.
//
// Sécurité : rate limit 6/min par slug+IP ; zod ; never-throw ;
// mode démo = écho sans écriture.
// =============================================================

const DEMO_SLUG = 'demo-hub';
const isDemo = (slug: string) => slug === DEMO_SLUG;

const orderSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(40),
        qty: z.number().int().min(1).max(9),
      }),
    )
    .min(1, 'Sélectionnez au moins un article.')
    .max(20, 'Trop d’articles dans la commande.'),
  guestName: z.string().trim().max(80).optional().nullable(),
  // v4.50 « SYSTÈME DE CONFIANCE » — 'now' (payer maintenant, défaut)
  // ou 'departure' (facturer au départ — ajouté à la facture de fin de
  // séjour, réglable avec l'hôte).
  payment: z.enum(['now', 'departure']).optional(),
});

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0].trim() : null) || 'local';
}

const eur = (v: number) => v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;

    // Anti-spam : 6 commandes / minute / slug+IP
    if (!(await rateLimit(`hubminibar:${slug}:${clientIp(req)}`, 6))) {
      return NextResponse.json(
        { error: 'Trop de commandes rapprochées. Réessayez dans un instant.' },
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

    const guestName = parsed.data.guestName?.trim().slice(0, 80) || null;
    const payMode = parsed.data.payment === 'departure' ? 'departure' : 'now';

    // ── DEMO MODE : succès sans écriture ──
    if (isDemo(slug)) {
      const total = parsed.data.items.reduce((acc, it) => acc + it.qty * 2.5, 0);
      return NextResponse.json({
        success: true,
        totalEur: Math.round(total * 100) / 100,
        payment: payMode === 'departure' ? 'departure' : 'demo',
        message:
          payMode === 'departure'
            ? `Ajouté à la facture de départ (${Math.round(total * 100) / 100} €) — merci d’avoir tout déclaré !`
            : 'Commande envoyée (mode démo) — merci d’avoir tout déclaré !',
      });
    }

    // ── v4.50 — GARDE SERVOEUR du verrouillage (hubLock) : l'invité
    // doit avoir une session valide ; au-delà de la fin de séjour,
    // toute commande est refusée (403 SESSION_EXPIRED). ──
    const access = await requireHubAccess(slug, req);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.code, message: access.message },
        { status: access.status },
      );
    }
    const bookingId = access.bookingId;

    // ── Résolution du bien (plaque V1 OU hub du bien) ──
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

    // ── Module activé ? (garde serveur, jamais cru client) ──
    const minibar = parseMinibar(property.premiumFeatures);
    if (!minibar.enabled || minibar.items.length === 0) {
      return NextResponse.json(
        { error: 'Le minibar n’est pas proposé pour ce logement.' },
        { status: 403 },
      );
    }

    // ── Total RECALCULÉ côté serveur (prix du catalogue, jamais cru) ──
    // v4.50 « PACK DE BIENVENUE » — un article marqué OFFERT par l'hôte
    // est facturé 0 € (le prix serveur prime, jamais le client).
    const lines: { id: string; name: string; emoji: string; qty: number; unitPrice: number; lineTotal: number; free: boolean }[] = [];
    for (const raw of parsed.data.items) {
      const item = minibar.items.find((i) => i.id === raw.id);
      if (!item) {
        return NextResponse.json(
          { error: 'Un article n’est plus disponible dans le minibar.' },
          { status: 404 },
        );
      }
      const free = item.free === true;
      const unitPrice = free ? 0 : item.price;
      lines.push({
        id: item.id,
        name: item.name,
        emoji: item.emoji,
        qty: raw.qty,
        unitPrice,
        lineTotal: Math.round(unitPrice * raw.qty * 100) / 100,
        free,
      });
    }
    const total = Math.round(lines.reduce((acc, l) => acc + l.lineTotal, 0) * 100) / 100;
    const summary = lines.map((l) => `${l.emoji} ${l.name} ×${l.qty}${l.free ? ' 🎁' : ''}`).join(', ');
    // Tout le panier est offert → aucune facturation nécessaire.
    const allFree = total === 0;

    // ── v4.50 — PERSISTANCE de la commande (onglet Check-in/Check-out
    // + « Facturer au départ » + suivi hôte). ──
    const order = await db.minibarOrder.create({
      data: {
        propertyId: property.id,
        bookingId,
        guestName,
        itemsJson: JSON.stringify(lines),
        totalEur: total,
        payment: allFree ? 'free' : payMode === 'departure' ? 'departure' : 'onsite',
        // 'departure' → OPEN (réglable à la sortie) ; 'onsite' → OPEN
        // aussi (l'hôte encaisse à la remise des clés) ; Stripe passera
        // la commande en PAID au succès du paiement (url renvoyée).
        status: 'OPEN',
      },
      select: { id: true },
    });

    // ── Notification hôte UNIFIÉE (cloche + email + push) ──
    // v4.46 — email STRUCTURÉ (hub_alert) + relais SUPERADMIN.
    const freeLabel = lines.some((l) => l.free) ? ' (inclut pack de bienvenue offert 🎁)' : '';
    const audience = await propertyOwnerAndManagers(property.id);
    const hubEmail = await renderHubAlertEmail({
      heading: '🍷 Commande minibar (Honesty Bar)',
      propertyName: property.name,
      guestName,
      rows: lines.map((l) => ({
        label: `${l.emoji} ${l.name}`.trim(),
        value: l.free ? '🎁 Offert' : `×${l.qty} — ${eur(l.lineTotal)}`,
      })),
      totalLabel: allFree ? 'Total (tout offert)' : payMode === 'departure' ? 'Total à facturer au départ' : 'Total déclaré',
      totalValue: eur(total),
      introNote:
        payMode === 'departure'
          ? 'L’invité a choisi « Facturer au départ » : ces consommations sont à régler à la fin du séjour.'
          : 'Ajoutez ces consommations au règlement du séjour ou encaissez via le paiement Stripe du minibar.',
      ctaLabel: 'Ouvrir le tableau de bord',
      ctaUrl: `${siteUrl}/airbnb/dashboard`,
      footerNote: 'Email envoyé automatiquement depuis le Hub invité.',
    }).catch(() => null);
    const customEmail = hubEmail
      ? { subject: hubEmail.subject, html: hubEmail.html, text: hubEmail.text }
      : undefined;
    if (audience.length > 0) {
      // WP-BACK v4.61 — `force: true` : une COMMANDE est commerciale —
      // l'hôte doit toujours être alerté (email + push), les
      // préférences notificationPrefs ne peuvent pas couper ce type.
      await sendNotificationToMany(audience, 'minibar_order', {
        title: `🍷 Minibar — ${eur(total)}${payMode === 'departure' && !allFree ? ' (au départ)' : ''}`,
        body: `${guestName ?? 'Un invité'} a déclaré : ${summary} (${eur(total)})${freeLabel}.`,
        propertyId: property.id,
        propertyName: property.name,
        url: '/airbnb/dashboard',
        force: true,
        ...(customEmail ? { email: customEmail } : {}),
        meta: {
          source: 'hub',
          minibar: true,
          orderId: order.id,
          payment: allFree ? 'free' : payMode,
          lines,
          totalEur: total,
          hubSlug: slug,
          guestName,
        },
      });
    } else {
      await db.notification.create({
        data: {
          userId: property.owner.id,
          type: 'guest_minibar_order',
          title: `🍷 Minibar — ${property.name}`,
          body: `${guestName ?? 'Un invité'} a déclaré : ${summary} (${eur(total)})${freeLabel}.`,
          dataJson: JSON.stringify({ source: 'hub', orderId: order.id, lines, totalEur: total, hubSlug: slug }),
        },
      });
    }

    // v4.46 — relais SUPERADMIN (audit plateforme, fire-and-forget).
    if (customEmail) {
      void notifySuperadmins('minibar_order', {
        title: `🍷 [Plateforme] Commande minibar — ${property.name}`,
        body: `${guestName ?? 'Un invité'} a déclaré : ${summary} (${eur(total)}).`,
        propertyId: property.id,
        propertyName: property.name,
        url: '/airbnb/dashboard',
        email: customEmail,
        force: true,
        meta: { source: 'hub', relay: 'superadmin', totalEur: total, hubSlug: slug },
      }).catch(() => undefined);
    }

    // ── Paiement instantané : Stripe Checkout si configuré ──
    // (uniquement « Payer maintenant » ET total > 0 ; « Facturer au
    // départ » et panier 100 % offert passent directement ici). ──
    if (payMode === 'now' && !allFree && process.env.STRIPE_SECRET_KEY) {
      try {
        const origin = resolveOrigin(req);
        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          // Apple Pay / Google Pay sont proposés automatiquement par
          // Stripe Checkout en plus de la carte.
          payment_method_types: ['card'],
          line_items: lines.map((l) => ({
            quantity: l.qty,
            price_data: {
              currency: 'eur',
              unit_amount: Math.round(l.unitPrice * 100),
              product_data: { name: `${l.emoji} ${l.name} — minibar` },
            },
          })),
          success_url: `${origin}/hub/${encodeURIComponent(slug)}?minibar=paid`,
          cancel_url: `${origin}/hub/${encodeURIComponent(slug)}?minibar=cancel`,
          metadata: {
            type: 'minibar_order',
            propertyId: property.id,
            hubSlug: slug,
            orderId: order.id,
            ...(guestName ? { guestName } : {}),
          },
        });
        if (session.url) {
          return NextResponse.json({
            success: true,
            totalEur: total,
            payment: 'stripe',
            url: session.url,
            message: 'Redirection vers le paiement sécurisé…',
          });
        }
      } catch (error) {
        // Stripe indisponible → repli « à régler sur place », jamais de throw.
        console.error('[minibar] Stripe session failed:', error);
        await captureError('minibar.stripe_session', error, undefined, req);
      }
    }

    if (allFree) {
      return NextResponse.json({
        success: true,
        totalEur: 0,
        payment: 'free',
        message: '🎁 Tout était offert — merci d’avoir tout déclaré !',
      });
    }
    if (payMode === 'departure') {
      return NextResponse.json({
        success: true,
        totalEur: total,
        payment: 'departure',
        message: `Parfait ! ${eur(total)} seront ajoutés à la facture de départ — votre hôte est prévenu.`,
      });
    }

    return NextResponse.json({
      success: true,
      totalEur: total,
      payment: 'onsite',
      message: `Merci ! ${eur(total)} à régler sur place — votre hôte a été prévenu.`,
    });
  } catch (error) {
    await captureError('hub.minibar', error, undefined, req);
    return NextResponse.json(
      { error: 'Erreur serveur. Réessayez dans un instant.' },
      { status: 500 },
    );
  }
}
