import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

// Hub démo (vitrine landing) — même convention que /api/public/hub/[slug].
const DEMO_SLUG = 'demo-hub';
import {
  parseOrderLines,
  itemsTotal,
  computeSplit,
  type OrderItem,
} from '@/lib/orders';
import { rateLimit } from '@/lib/rate-limit';
import { isFlagEnabled } from '@/lib/feature-flags';
import {
  ensureDefaultRules,
  runAutomationTrigger,
} from '@/lib/automations-server';
// AUDIT PRÉ-PROD (Module 5.2) — le PRESTATAIRE est notifié à chaque
// nouvelle commande + webhooks sortants du bien déclenchés.
import {
  sendNotification,
  sendNotificationToMany,
  notifySuperadmins,
  propertyOwnerAndManagers,
} from '@/lib/notifications';
// v4.46 — EMAIL hôte structuré pour chaque commande Services & Expériences.
import { renderHubAlertEmail } from '@/lib/email-template-render';
import { siteUrl } from '@/lib/site';
import { dispatchWebhooks } from '@/lib/webhook-dispatcher';

// =============================================================
// ÉTAPE 17.2 (V3) — Moteur de transaction côté INVITÉ :
//   POST /api/public/service-orders?slug=<slug>
//     { providerId, items[{offerId?|name, qty}], bookingId?, guestName?, guestEmail? }
//     → crée une commande PENDING (prix & split recalculés SERVEUR)
//   GET  /api/public/service-orders?slug=<slug>&b=<bookingId>
//     → "Mes commandes" du séjour (SANS commission/hostEarning —
//       la séparation financière n'est jamais exposée à l'invité)
//
// slug en QUERY PARAM (règle sandbox). Moteur never-throw.
// Sécurité : le bien est résolu par slug (plaque V1 → hub V2) ;
// le booking est filtré par propertyId (pas de cross-bien) ;
// guestName/guestEmail font FOI depuis le Booking si fourni.
// ÉTAPE 17.3 : une commande déclenche le moteur d'automatisations
// (rule ORDER_CREATED → notification hôte). Le moteur avale ses
// erreurs : le flux invité n'échoue JAMAIS à cause de la notif.
// ÉTAPE 17.5 : le prix n'est JAMAIS cru côté client — chaque ligne
// est re-prixée serveur : offre catalogue (offerId, restreinte à
// propertyId+providerId+active) sinon offre standard (hourlyRate).
// ÉTAPE 17.6 : POST /[id]/pay encaisse la commande (Checkout Session
// Stripe ou mode démo dev) — GET expose paymentStatus à l'invité.
// =============================================================

interface ResolvedProperty {
  id: string;
  name: string;
}

/** Résolution bien par slug — même logique que /api/public/guest-app (duplication maîtrisée, flux V1 intouché). */
async function resolvePropertyBySlug(slug: string): Promise<ResolvedProperty | null> {
  const plaque = await db.physicalQrCode.findUnique({
    where: { hubSlug: slug },
    select: { propertyId: true, isClaimed: true, status: true },
  });
  if (plaque && plaque.isClaimed && plaque.propertyId && plaque.status === 'active') {
    const p = await db.property.findUnique({
      where: { id: plaque.propertyId },
      select: { id: true, name: true, isActive: true },
    });
    if (p?.isActive) return { id: p.id, name: p.name };
  }
  if (!plaque) {
    const p = await db.property.findUnique({
      where: { qrHubSlug: slug },
      select: { id: true, name: true, isActive: true },
    });
    if (p?.isActive) return { id: p.id, name: p.name };
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const slug = (url.searchParams.get('slug') || '').trim();
    if (!slug) {
      return NextResponse.json({ ok: false, message: 'Hub introuvable.' }, { status: 400 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, message: 'Requête invalide.' }, { status: 400 });
    }

    // ── HUB DÉMO (vitrine landing, aucun bien en DB) — REFONTE V4.14 ──
    // Simulation 100 % autonome : aucune écriture DB, aucun encaissement,
    // aucune dépendance Stripe. Le visiteur démo voit le parcours complet
    // (créneau, note, confirmation confettis) sans toucher aux données réelles.
    if (slug === DEMO_SLUG) {
      const demoName = typeof body.guestName === 'string' ? body.guestName.trim() : '';
      if (demoName.length < 2) {
        return NextResponse.json({ ok: false, message: 'Votre nom est requis.' }, { status: 400 });
      }
      return NextResponse.json(
        {
          ok: true,
          mode: 'demo',
          order: {
            id: `demo-order-${Date.now()}`,
            status: 'CONFIRMED',
            paymentStatus: 'PAID',
          },
        },
        { status: 201 },
      );
    }

    const property = await resolvePropertyBySlug(slug);
    if (!property) {
      return NextResponse.json(
        { ok: false, message: 'Ce hub est introuvable ou désactivé.' },
        { status: 404 },
      );
    }

    // Anti-spam léger par bien (fenêtre glissante en mémoire)
    if (!(await rateLimit(`order:${property.id}`, 10))) {
      return NextResponse.json(
        { ok: false, message: 'Trop de commandes rapprochées. Réessayez dans un instant.' },
        { status: 429 },
      );
    }

    // Feature flags réels (Module 7) : marketplace / maintenance.
    if (!(await isFlagEnabled('marketplace_enabled')) || (await isFlagEnabled('maintenance_mode'))) {
      return NextResponse.json(
        { ok: false, message: 'Les commandes sont temporairement suspendues. Réessayez plus tard.' },
        { status: 503 },
      );
    }

    // ── 1. Prestataire : actif + expérience invité ──
    const providerId = typeof body.providerId === 'string' ? body.providerId : '';
    const provider = providerId
      ? await db.provider.findFirst({
          where: { id: providerId, isActive: true, audience: 'GUEST_EXPERIENCE' },
          select: { id: true, businessName: true, hourlyRate: true, userId: true },
        })
      : null;
    if (!provider) {
      return NextResponse.json(
        { ok: false, message: 'Ce service n’est pas disponible pour ce logement.' },
        { status: 400 },
      );
    }

    // ── 2. Lignes de commande : validées, puis prix RE-RÉSOLU SERVEUR ──
    // (ÉTAPE 17.5 : le unitPrice envoyé par le client est ignoré —
    //  une ligne "offre catalogue" est re-prixée depuis ServiceOffer
    //  restreinte au couple bien+prestataire actif, une ligne sans
    //  offerId est re-prixée sur l'offre standard hourlyRate.)
    const lines = parseOrderLines(body.items);
    if (!lines) {
      return NextResponse.json(
        { ok: false, message: 'Détail de la commande invalide.' },
        { status: 400 },
      );
    }

    const offerIds = [...new Set(lines.map((l) => l.offerId).filter((id): id is string => id !== null))];
    const offers = offerIds.length
      ? await db.serviceOffer.findMany({
          where: {
            id: { in: offerIds },
            propertyId: property.id,
            providerId: provider.id,
            isActive: true,
          },
          select: { id: true, name: true, unitPrice: true },
        })
      : [];
    const offerById = new Map(offers.map((o) => [o.id, o]));

    const items: (OrderItem & { offerId?: string })[] = [];
    for (const line of lines) {
      if (line.offerId) {
        const offer = offerById.get(line.offerId);
        if (!offer) {
          return NextResponse.json(
            { ok: false, message: 'Une offre sélectionnée n’est plus disponible. Actualisez la page.' },
            { status: 400 },
          );
        }
        items.push({ offerId: offer.id, name: offer.name, qty: line.qty, unitPrice: offer.unitPrice });
      } else {
        // Offre standard : prix serveur uniquement (le client n'a pas son mot à dire)
        if (provider.hourlyRate == null) {
          return NextResponse.json(
            { ok: false, message: 'Ce service est sur devis — demandez-le à votre hôte.' },
            { status: 400 },
          );
        }
        items.push({ name: line.name, qty: line.qty, unitPrice: provider.hourlyRate });
      }
    }

    const totalAmount = itemsTotal(items);
    if (totalAmount <= 0) {
      return NextResponse.json({ ok: false, message: 'Le montant de la commande est nul.' }, { status: 400 });
    }
    const { commission, hostEarning } = computeSplit(totalAmount);

    // ── 3. Invité : depuis le séjour (autorité serveur) ou saisi ──
    let guestName = typeof body.guestName === 'string' ? body.guestName.trim() : '';
    let guestEmail = typeof body.guestEmail === 'string' ? body.guestEmail.trim() : '';
    const bookingId = typeof body.bookingId === 'string' && body.bookingId ? body.bookingId : null;

    if (bookingId) {
      const stay = await db.booking.findFirst({
        where: { id: bookingId, propertyId: property.id, status: { not: 'CANCELLED' } },
        select: { guestName: true, guestEmail: true },
      });
      if (!stay) {
        return NextResponse.json(
          { ok: false, message: 'Séjour introuvable pour ce logement.' },
          { status: 400 },
        );
      }
      guestName = stay.guestName;
      guestEmail = stay.guestEmail || guestEmail;
    }
    if (guestName.length < 2 || guestName.length > 80) {
      return NextResponse.json({ ok: false, message: 'Votre nom est requis pour commander.' }, { status: 400 });
    }
    if (guestEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
      return NextResponse.json({ ok: false, message: 'Adresse email invalide.' }, { status: 400 });
    }

    // ── 4. Création (statut initial PENDING — cycle piloté côté hôte) ──
    // REFONTE SERVICES PREMIUM (V4.11) — créneau de livraison + note
    // invité : horodatage validé (entre maintenant et +31 jours) et
    // note bornée (500 car.) — jamais crus au-delà.
    let deliveryDate: Date | null = null;
    if (typeof body.deliveryDate === 'string' && body.deliveryDate.trim()) {
      const d = new Date(body.deliveryDate);
      if (!Number.isNaN(d.getTime()) && d.getTime() > Date.now() - 60_000 && d.getTime() < Date.now() + 31 * 86_400_000) {
        deliveryDate = d;
      }
    }
    const guestNote =
      typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 500) : null;

    const order = await db.serviceOrder.create({
      data: {
        bookingId,
        propertyId: property.id,
        providerId: provider.id,
        guestName,
        guestEmail: guestEmail || null,
        items: items as unknown as Prisma.InputJsonValue,
        guestNote,
        totalAmount,
        commission,
        hostEarning,
        status: 'PENDING',
        ...(deliveryDate ? { deliveryDate } : {}),
      },
      select: { id: true, status: true, createdAt: true },
    });

    // ── 5. ÉTAPE 17.3 : notification hôte via le moteur Étape 13 ──
    // ensureDefaultRules est idempotent : garantit que la règle
    // ORDER_CREATED existe même si le propriétaire n'a jamais ouvert
    // la page Automatisations (ne recrée JAMAIS une règle désactivée).
    await ensureDefaultRules(property.id);
    const itemsSummary = items
      .map((i) => `${i.qty}× ${i.name}`)
      .join(', ')
      .slice(0, 120);
    await runAutomationTrigger(property.id, 'ORDER_CREATED', {
      kind: 'order',
      order: {
        id: order.id,
        guestName,
        totalAmount,
        providerName: provider.businessName,
        itemsSummary: itemsSummary || 'commande service',
      },
    });

    // AUDIT PRÉ-PROD (Module 5.2) — notification PRESTATAIRE : le
    // prestataire (compte lié Provider.userId) apprend qu'une commande
    // le concerne, avec le détail et la mise en relation.
    if (provider.userId) {
      sendNotification(provider.userId, 'host_order', {
        title: `🥐 Nouvelle commande — ${property.name}`,
        body:
          `${guestName} a commandé « ${itemsSummary || 'commande service'} » (${totalAmount.toFixed(2).replace('.', ',')} €) ` +
          `via le Hub de ${property.name}. Suivez-la depuis vos commandes service.`,
        propertyId: property.id,
        propertyName: property.name,
        url: '/provider/dashboard',
        meta: { source: 'guest_app', orderId: order.id, providerId: provider.id },
      }).catch(() => undefined);
    }

    // AUDIT PRÉ-PROD (Module 5.2) — WEBHOOKS SORTANTS du bien
    // (lib/webhook-dispatcher, HMAC) : événement 'order' — le code
    // existait sans aucun call-site (morts).
    void dispatchWebhooks(property.id, 'order', {
      event: 'order.created',
      orderId: order.id,
      providerId: provider.id,
      providerName: provider.businessName,
      guestName,
      itemsSummary: itemsSummary || 'commande service',
      totalAmount,
      propertyName: property.name,
    });

    // ── v4.46 — EMAIL HÔTE (et managers) + relais SUPERADMIN ──
    // L'automatisation ORDER_CREATED (cloche + miroir email) reste la
    // voie principale ; on ajoute un email STRUCTURÉ (hub_alert) à
    // l'hôte — détail invité / prestataire / articles / créneau / note —
    // ainsi que le relais Superadmin (audit plateforme).
    try {
      const email = await renderHubAlertEmail({
        heading: '🥐 Nouvelle commande Room Service',
        propertyName: property.name,
        guestName,
        rows: [
          { label: 'Prestataire', value: provider.businessName },
          { label: 'Articles', value: itemsSummary || 'commande service' },
          ...(deliveryDate
            ? [{ label: 'Créneau souhaité', value: deliveryDate.toLocaleString('fr-FR') }]
            : []),
          ...(guestNote ? [{ label: 'Note de l’invité', value: guestNote.slice(0, 200) }] : []),
        ],
        totalLabel: 'Montant de la commande',
        totalValue: `${totalAmount.toFixed(2).replace('.', ',')} €`,
        introNote:
          'Confirmez la commande depuis votre tableau de bord (Upselling — Commandes) pour lancer la prestation.',
        ctaLabel: 'Ouvrir le tableau de bord',
        ctaUrl: `${siteUrl}/airbnb/dashboard`,
        footerNote: 'Email envoyé automatiquement depuis le Hub invité.',
      });
      const audience = await propertyOwnerAndManagers(property.id);
      if (audience.length > 0) {
        await sendNotificationToMany(audience, 'new_order', {
          title: `🥐 Nouvelle commande — ${property.name}`,
          body: `${guestName} a commandé « ${itemsSummary || 'commande service'} » (${totalAmount.toFixed(2).replace('.', ',')} €) chez ${provider.businessName}.`,
          propertyId: property.id,
          propertyName: property.name,
          url: '/airbnb/dashboard',
          email: { subject: email.subject, html: email.html, text: email.text },
          meta: { source: 'hub', orderId: order.id, providerId: provider.id },
        });
      }
      void notifySuperadmins('new_order', {
        title: `🥐 [Plateforme] Commande Room Service — ${property.name}`,
        body: `${guestName} — « ${itemsSummary || 'commande service'} » (${totalAmount.toFixed(2).replace('.', ',')} €) chez ${provider.businessName}.`,
        propertyId: property.id,
        propertyName: property.name,
        url: '/airbnb/dashboard',
        email: { subject: email.subject, html: email.html, text: email.text },
        meta: { source: 'hub', relay: 'superadmin', orderId: order.id },
      }).catch(() => undefined);
    } catch (error) {
      console.error('[service-orders] email host failed:', error);
    }

    return NextResponse.json({
      ok: true,
      order: {
        id: order.id,
        status: order.status,
        totalAmount,
        items,
        deliveryDate: null,
        createdAt: order.createdAt,
        providerName: provider.businessName,
      },
    });
  } catch (error) {
    console.error('[public/service-orders POST] Error:', error);
    return NextResponse.json(
      { ok: false, message: 'Erreur serveur. Réessayez dans un instant.' },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const slug = (url.searchParams.get('slug') || '').trim();
    const bookingId = (url.searchParams.get('b') || '').trim();

    if (!slug || !bookingId) {
      return NextResponse.json({ ok: false, message: 'Paramètres manquants.' }, { status: 400 });
    }

    const property = await resolvePropertyBySlug(slug);
    if (!property) {
      return NextResponse.json({ ok: false, message: 'Hub introuvable.' }, { status: 404 });
    }

    // Le séjour DOIT appartenir au bien du slug (anti cross-bien)
    const stay = await db.booking.findFirst({
      where: { id: bookingId, propertyId: property.id, status: { not: 'CANCELLED' } },
      select: { id: true },
    });
    if (!stay) {
      return NextResponse.json({ ok: false, message: 'Séjour introuvable.' }, { status: 404 });
    }

    // ⚠️ Jamais de commission/hostEarning côté invité — totalAmount uniquement.
    // ÉTAPE 17.6 : paymentStatus exposé (badge 💳 + « Payer maintenant »).
    const orders = await db.serviceOrder.findMany({
      where: { bookingId: stay.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        totalAmount: true,
        items: true,
        deliveryDate: true,
        createdAt: true,
        provider: { select: { businessName: true, category: true } },
      },
    });

    return NextResponse.json({ ok: true, orders });
  } catch (error) {
    console.error('[public/service-orders GET] Error:', error);
    return NextResponse.json(
      { ok: false, message: 'Erreur serveur. Réessayez dans un instant.' },
      { status: 500 },
    );
  }
}
