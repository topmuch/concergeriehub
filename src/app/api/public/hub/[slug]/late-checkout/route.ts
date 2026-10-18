import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { captureError } from '@/lib/error-monitor';
import { resolveHubPropertyId } from '@/lib/hub-resolve';
import { parsePremiumFeatures } from '@/lib/concierge';
// v4.50 — garde serveur du verrouillage du hub (403 SESSION_EXPIRED).
import { requireHubAccess } from '@/lib/hub-access';
// FIX-32 — notification UNIFIÉE : cloche + EMAIL + PUSH (selon
// préférences) au lieu de la seule cloche. Le propriétaire doit être
// prévenu en temps réel quand un invité demande un départ tardif.
import {
  sendNotificationToMany,
  propertyOwnerAndManagers,
} from '@/lib/notifications';

// =============================================================
// PREMIUM « CONCIERGERIE 5 ÉTOILES » (V5) — 2.4 LATE CHECK-OUT
//
// POST /api/public/hub/[slug]/late-checkout
//   body: { guestName?, bookingId? }
//
// L'invité demande un départ tardif (14 h au lieu de 11 h) proposé
// par l'hôte (premiumFeatures.enableLateCheckout). Le serveur
// VÉRIFIE que le service est bien activé sur CE bien (jamais cru
// côté client) et crée une notification hôte (type
// 'guest_latecheckout'). Le règlement se fait ensuite avec l'hôte.
//
// v4.44 « DÉPART TARDIF DYNAMIQUE » — GET /api/public/hub/[slug]/late-checkout
//   → { enabled, price, lateUntilHour, available, stayCheckOut, nextArrival }
// Le bouton devient DYNAMIQUE et apparaît stratégiquement 24-48 h
// avant la fin du séjour : le serveur VÉRIFIE LE CALENDRIER — si le
// logement est LOUÉ le jour même (autre réservation qui arrive), le
// départ tardif est indisponible ; si le calendrier est LIBRE, on
// propose de prolonger le séjour jusqu'à l'heure choisie par l'hôte
// (lateCheckoutHour, ex. 15 h) moyennant les frais configurés.
//
// Sécurité : rate limit 3/min par slug+IP ; zod ; never-throw ;
// mode démo = succès sans écriture.
// =============================================================

const DEMO_SLUG = 'demo-hub';
const isDemo = (slug: string) => slug === DEMO_SLUG;

const requestSchema = z.object({
  guestName: z.string().trim().max(80).optional().nullable(),
  bookingId: z.string().trim().max(60).optional().nullable(),
});

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0].trim() : null) || 'local';
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;

    // Anti-spam : 3 demandes / minute / slug+IP
    if (!(await rateLimit(`hublatecheckout:${slug}:${clientIp(req)}`, 3))) {
      return NextResponse.json(
        { error: 'Trop de demandes rapprochées. Réessayez dans un instant.' },
        { status: 429 },
      );
    }

    const rawBody = await req.json().catch(() => null);
    if (rawBody !== null && typeof rawBody !== 'object') {
      return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
    }
    const parsed = requestSchema.safeParse(rawBody ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Requête invalide.' },
        { status: 400 },
      );
    }

    // ── DEMO MODE : succès sans écriture ──
    if (isDemo(slug)) {
      return NextResponse.json({
        success: true,
        message: 'Demande envoyée (mode démo) — votre hôte vous répondra rapidement.',
      });
    }

    // ── v4.50 — GARDE SERVEUR du verrouillage (hubLock) : la demande
    // de départ tardif (qui PROLONGE le verrouillage) exige une session
    // hub valide. ──
    const access = await requireHubAccess(slug, req);
    if (!access.ok) {
      return NextResponse.json({ error: access.code, message: access.message }, { status: access.status });
    }

    // ── Résolution du bien ──
    const plaque = await db.physicalQrCode.findUnique({
      where: { hubSlug: slug },
      select: { propertyId: true, isClaimed: true, status: true },
    });

    let propertyId: string | null = null;
    if (plaque && plaque.isClaimed && plaque.propertyId && plaque.status === 'active') {
      propertyId = plaque.propertyId;
    } else if (!plaque) {
      const bySlug = await db.property.findUnique({
        where: { qrHubSlug: slug },
        select: { id: true, isActive: true },
      });
      if (bySlug?.isActive) propertyId = bySlug.id;
    }

    if (!propertyId) {
      return NextResponse.json(
        { error: 'Ce hub est introuvable ou a été désactivé.' },
        { status: 404 },
      );
    }

    // ── Garde serveur : le service DOIT être activé sur CE bien ──
    const property = await db.property.findUnique({
      where: { id: propertyId },
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

    const premium = parsePremiumFeatures(property.premiumFeatures);
    if (!premium?.enableLateCheckout) {
      return NextResponse.json(
        { error: "Le départ tardif n'est pas proposé pour ce logement." },
        { status: 403 },
      );
    }

    // ── Invité : nom depuis le booking (?b= filtré par bien, jamais cru) ──
    let guestName = parsed.data.guestName?.trim().slice(0, 80) || null;
    const bookingId = parsed.data.bookingId?.trim().slice(0, 60) || null;
    if (bookingId) {
      const booking = await db.booking.findFirst({
        where: { id: bookingId, propertyId: property.id, status: { not: 'CANCELLED' } },
        select: { guestName: true },
      });
      if (booking?.guestName) guestName = booking.guestName.slice(0, 80);
    }

    const priceLabel = premium.lateCheckoutPrice
      ? `${premium.lateCheckoutPrice.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}`
      : 'à convenir';
    // v4.44 — heure de fin configurée par l'hôte (défaut 14 h).
    const lateHourLabel = `${premium.lateCheckoutHour ?? 14} h`;

    // ── FIX-32 : notification hôte UNIFIÉE (hôte + managers) ──
    // Cloche (in-app) TOUJOURS + email + push selon préférences
    // (type « late_checkout_requested » du catalogue). Le propriétaire
    // est ainsi prévenu en temps réel, pas seulement au prochain
    // passage sur le dashboard.
    const audience = await propertyOwnerAndManagers(property.id);
    const body = guestName
      ? `${guestName} souhaite partir à ${lateHourLabel} au lieu de 11 h (tarif : ${priceLabel}). Confirmez la disponibilité puis encaissez le supplément.`
      : `Un invité souhaite partir à ${lateHourLabel} au lieu de 11 h (tarif : ${priceLabel}). Confirmez la disponibilité puis encaissez le supplément.`;
    if (audience.length > 0) {
      await sendNotificationToMany(audience, 'late_checkout_requested', {
        title: `⏱️ Demande de départ tardif — ${property.name}`,
        body,
        propertyId: property.id,
        propertyName: property.name,
        url: '/airbnb/dashboard',
        meta: {
          source: 'hub',
          propertyId: property.id,
          propertyName: property.name,
          price: premium.lateCheckoutPrice ?? null,
          bookingId,
          guestName,
          hubSlug: slug,
        },
      });
    } else {
      // Filet de sécurité : jamais sans trace (hôte introuvable).
      await db.notification.create({
        data: {
          userId: property.owner.id,
          type: 'guest_latecheckout',
          title: `⏱️ Demande de late check-out — ${property.name}`,
          body,
          dataJson: JSON.stringify({
            source: 'guest_app',
            propertyId: property.id,
            propertyName: property.name,
            price: premium.lateCheckoutPrice ?? null,
            bookingId,
            guestName,
            hubSlug: slug,
          }),
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Demande envoyée — votre hôte vous répondra rapidement.',
    });
  } catch (error) {
    await captureError('hub.late-checkout', error, undefined, req);
    return NextResponse.json(
      { error: 'Erreur serveur. Réessayez dans un instant.' },
      { status: 500 },
    );
  }
}

// =============================================================
// GET — DISPONIBILITÉ AUTOMATIQUE (v4.44 « DÉPART TARDIF DYNAMIQUE »)
// Le serveur consulte le calendrier du bien :
//   • séjour en cours trouvé + calendrier LIBRE le jour du départ
//     → available: true (on propose la prolongation) ;
//   • autre réservation qui arrive le jour même → available: false
//     (le logement est loué — pas de prolongation possible) ;
//   • aucun séjour en cours → available: null (inconnu, bouton neutre).
// =============================================================
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;

    if (!(await rateLimit(`hublatecheckoutget:${slug}:${clientIp(req)}`, 10))) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Réessayez dans un instant.' },
        { status: 429 },
      );
    }

    // ── DEMO MODE : service activé + toujours disponible ──
    if (isDemo(slug)) {
      return NextResponse.json({
        enabled: true,
        price: 25,
        lateUntilHour: 14,
        available: true,
        stayCheckOut: null,
        nextArrival: null,
      });
    }

    const resolved = await resolveHubPropertyId(slug);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.message }, { status: resolved.status });
    }

    const property = await db.property.findUnique({
      where: { id: resolved.propertyId },
      select: { id: true, premiumFeatures: true },
    });
    if (!property) {
      return NextResponse.json({ error: 'Ce hub est introuvable.' }, { status: 404 });
    }

    const premium = parsePremiumFeatures(property.premiumFeatures);
    if (!premium?.enableLateCheckout) {
      return NextResponse.json({ enabled: false, available: null });
    }

    const now = new Date();
    const startOfTodayUtc = new Date(now.getTime() - (now.getTime() % 86_400_000));

    // Séjour en cours de l'invité (même logique que le payload hub).
    const coveringStays = await db.booking.findMany({
      where: {
        propertyId: property.id,
        checkIn: { lte: now },
        checkOut: { gte: startOfTodayUtc },
        status: { notIn: ['CANCELLED'] },
      },
      orderBy: { checkOut: 'desc' },
      take: 5,
      select: { id: true, checkIn: true, checkOut: true },
    });
    const stay = coveringStays[0] ?? null;
    if (!stay) {
      // Pas de séjour en cours : le bouton reste neutre (le module
      // peut être consulté par un invité entre deux séjours).
      return NextResponse.json({
        enabled: true,
        price: premium.lateCheckoutPrice ?? null,
        lateUntilHour: premium.lateCheckoutHour ?? 14,
        available: null,
        stayCheckOut: null,
        nextArrival: null,
      });
    }

    // ── Le logement est-il LOUÉ le jour du départ ? ──
    // Conflit = AUTRE réservation non annulée qui couvre le jour du
    // départ (arrive ce jour-là ou encore présente) — même règle UTC
    // en index de jours que le payload hub.
    const DAY = 86_400_000;
    const dayIdx = (d: Date) => Math.floor(d.getTime() / DAY);
    const stayEndDay = dayIdx(stay.checkOut);
    const conflict = await db.booking.findFirst({
      where: {
        propertyId: property.id,
        id: { not: stay.id },
        status: { notIn: ['CANCELLED'] },
        // chevauche le jour du départ (arrivée ≤ J et départ > J)
        checkIn: { lt: new Date((stayEndDay + 1) * DAY) },
        checkOut: { gt: new Date(stayEndDay * DAY) },
      },
      orderBy: { checkIn: 'asc' },
      select: { id: true, checkIn: true },
    });

    return NextResponse.json({
      enabled: true,
      price: premium.lateCheckoutPrice ?? null,
      lateUntilHour: premium.lateCheckoutHour ?? 14,
      available: !conflict,
      stayCheckOut: stay.checkOut.toISOString(),
      nextArrival: conflict ? conflict.checkIn.toISOString() : null,
    });
  } catch (error) {
    await captureError('hub.late-checkout.get', error, undefined, req);
    return NextResponse.json(
      { error: 'Erreur serveur. Réessayez dans un instant.' },
      { status: 500 },
    );
  }
}
