import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { resolveHubPropertyId } from '@/lib/hub-resolve';
import { rateLimit } from '@/lib/rate-limit';
import { captureError } from '@/lib/error-monitor';
import {
  HUB_ACCESS_WINDOW_HOURS,
  bookingStayEnd,
  hubWindowOpensAt,
  newHubAccessToken,
  parseHubLock,
  sha256Hex,
} from '@/lib/hub-access';

// =============================================================
// v4.50 « VERROUILLAGE DU HUB PAR CODE » — /api/public/hub/[slug]/access
//
// POST body: { code }
//   → écran de verrouillage du hub : le voyageur scanne le QR, tombe
//     sur la page de saisie, entre son code d'activation (4 caractères,
//     unique par séjour — Booking.accessCode).
//
// Validation serveur :
//   1. le bien doit avoir le verrouillage ACTIVÉ (hubLock.enabled) ;
//   2. le code doit correspondre à un séjour NON ANNULÉ dont la
//      fenêtre d'accès est ouverte (checkIn - HUB_ACCESS_WINDOW_HOURS
//      = 2 h, v4.109 — aligné sur l'animation pré-arrivée du hub) et
//      NON EXPIRÉE (fin de séjour effective : lateCheckOutUntil ??
//      checkOut) ;
//   3. succès → session hub (token 48 hex, SHA-256 stocké) + endAt
//      renvoyés — le hub reste déverrouillé dans ce navigateur avec
//      le compte à rebours en tête d'écran.
//
// Sécurité : rate limit 8 essais/min par slug+IP (code 4 caractères),
// zod, never-throw. Un code expiré est REFUSÉ (le séjour est fini).
// =============================================================

const accessSchema = z.object({
  code: z
    .string()
    .trim()
    .min(4, 'Le code doit contenir 4 caractères.')
    .max(8, 'Le code doit contenir 4 caractères.')
    .regex(/^[A-Za-z0-9]{4,8}$/, 'Code invalide (lettres ou chiffres uniquement).'),
});

function clientIpReq(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0].trim() : null) || 'local';
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;

    // Anti brute-force : 8 essais/min par slug+IP (le quota global
    // slug serait un vecteur de DoS de l'invité légitime).
    if (!(await rateLimit(`hubaccess:${slug}:${clientIpReq(req)}`, 8))) {
      return NextResponse.json(
        { error: 'Trop de tentatives. Réessayez dans un instant.' },
        { status: 429 },
      );
    }

    const rawBody = await req.json().catch(() => null);
    if (!rawBody || typeof rawBody !== 'object') {
      return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
    }
    const parsed = accessSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Code invalide.' },
        { status: 400 },
      );
    }
    const code = parsed.data.code.toUpperCase();

    const resolved = await resolveHubPropertyId(slug);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.message }, { status: resolved.status });
    }

    const property = await db.property.findUnique({
      where: { id: resolved.propertyId },
      select: {
        id: true,
        isActive: true,
        premiumFeatures: true,
        owner: { select: { profile: { select: { phone: true } } } },
      },
    });
    if (!property?.isActive) {
      return NextResponse.json({ error: 'Ce hub est introuvable.' }, { status: 404 });
    }

    const lock = parseHubLock(property.premiumFeatures);
    if (!lock) {
      return NextResponse.json(
        { error: 'Ce hub n’est pas verrouillé — rafraîchissez la page.' },
        { status: 400 },
      );
    }

    const now = new Date();
    // Fenêtre d'accès : de (checkIn - HUB_ACCESS_WINDOW_HOURS — v4.109 :
    // 2 h avant l'arrivée, aligné sur l'écran d'animation pré-arrivée)
    // à la fin de séjour effective. v5.6 — on cherche TOUTES les
    // réservations portant ce code (sans filtre de fenêtre) pour
    // distinguer un code INCORRECT d'un code correct dont le séjour
    // n'a pas commencé / est déjà terminé.
    const candidates = await db.booking.findMany({
      where: {
        propertyId: property.id,
        accessCode: code,
        status: { notIn: ['CANCELLED'] },
      },
      select: {
        id: true,
        guestName: true,
        checkIn: true,
        checkOut: true,
        lateCheckOutUntil: true,
      },
      orderBy: { checkIn: 'desc' },
      take: 10,
    });

    const booking =
      candidates.find((b) => bookingStayEnd(b) > now && hubWindowOpensAt(b.checkIn) <= now) ?? null;
    if (!booking) {
      const frLong = (d: Date) =>
        d.toLocaleString('fr-FR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'UTC',
        });
      // Code correct mais séjour À VENIR : on annonce l'heure exacte
      // d'ouverture (HUB_ACCESS_WINDOW_HOURS avant l'arrivée la plus
      // proche — même seuil que l'animation pré-arrivée du hub).
      const upcoming = candidates
        .filter((b) => hubWindowOpensAt(b.checkIn) > now)
        .sort((a, b) => a.checkIn.getTime() - b.checkIn.getTime())[0];
      if (upcoming) {
        return NextResponse.json(
          {
            error: `Votre code est correct, mais le séjour n'a pas encore commencé : le hub se déverrouille à partir du ${frLong(
              hubWindowOpensAt(upcoming.checkIn),
            )} (${HUB_ACCESS_WINDOW_HOURS} h avant l'arrivée).`,
          },
          { status: 401 },
        );
      }
      if (candidates.some((b) => bookingStayEnd(b) <= now)) {
        return NextResponse.json(
          {
            error:
              'Ce séjour est terminé — le hub se verrouille après le départ. Contactez votre hôte.',
          },
          { status: 401 },
        );
      }
      return NextResponse.json(
        {
          error:
            'Code incorrect. Vérifiez votre code, ou vérifiez que vous avez scanné le QR du bon logement.',
        },
        { status: 401 },
      );
    }

    const token = newHubAccessToken();
    const endAt = bookingStayEnd(booking);
    await db.hubAccessSession.create({
      data: {
        propertyId: property.id,
        bookingId: booking.id,
        tokenHash: sha256Hex(token),
        // Plafond de sécurité : fin de séjour + 7 jours (la fin réelle
        // reste vérifiée EN DIRECT contre le booking à chaque action).
        hardExpiresAt: new Date(endAt.getTime() + 7 * 86_400_000),
      },
    });

    const guestFirstName = (booking.guestName ?? '').trim().split(/\s+/)[0]?.slice(0, 40) || null;

    return NextResponse.json({
      success: true,
      token,
      endAt: endAt.toISOString(),
      guestName: guestFirstName,
      message: 'Hub déverrouillé — bon séjour !',
    });
  } catch (error) {
    await captureError('hub.access', error, undefined, req);
    return NextResponse.json({ error: 'Erreur serveur. Réessayez dans un instant.' }, { status: 500 });
  }
}
