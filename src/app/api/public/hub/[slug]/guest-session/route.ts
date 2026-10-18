import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { captureError } from '@/lib/error-monitor';
import { sendNotificationToMany, propertyOwnerAndManagers } from '@/lib/notifications';

// =============================================================
// PREMIUM « CONCIERGERIE 5 ÉTOILES » (V5) — ÉTAPE 3.5
// NOTIFICATION DE PREMIER SCAN (Welcome)
//   POST /api/public/hub/[slug]/guest-session
//   body: { deviceId, bookingId? }
//
// Le Hub Invité PWA « ping » cette route à chaque ouverture avec un
// deviceId anonyme (UUID généré côté client, stocké en localStorage).
//
//  1re SESSION (création de la ligne GuestSession) :
//    → l'hôte (et managers) reçoivent :
//      « 👋 [Nom de l'invité] vient d'arriver et a scanné votre Hub ! »
//    (in-app + email + push selon préférences — event guest_arrival).
//    Rassure l'hôte : l'invité est bien entré dans le logement.
//  SESSIONS SUIVANTES : simple rafraîchissement lastSeenAt (silencieux).
//
// Le nom de l'invité est résolu SERVEUR via bookingId (re-validé par
// bien — anti IDOR) ; jamais cru côté client. Anonyme si sans séjour.
//
// Sécurité : rate limit 6/min par slug+IP ; zod ; never-throw ;
// mode démo = succès sans écriture. Aucune donnée personnelle n'est
// stockée (deviceId aléatoire + nom du booking public).
// =============================================================

const DEMO_SLUG = 'demo-hub';
const isDemo = (slug: string) => slug === DEMO_SLUG;

const sessionSchema = z.object({
  deviceId: z
    .string()
    .trim()
    .min(8, { message: 'Identifiant d’appareil invalide.' })
    .max(64, { message: 'Identifiant d’appareil invalide.' })
    .regex(/^[A-Za-z0-9_-]+$/, { message: 'Identifiant d’appareil invalide.' }),
  bookingId: z.string().trim().max(60).optional().nullable(),
});

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0].trim() : null) || 'local';
}

async function resolvePropertyBySlug(slug: string): Promise<{ id: string; name: string } | null> {
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

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;

    if (!(await rateLimit(`guestsession:${slug}:${clientIp(req)}`, 6))) {
      return NextResponse.json({ ok: true, silent: true });
    }

    const rawBody = await req.json().catch(() => null);
    if (!rawBody || typeof rawBody !== 'object') {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    const parsed = sessionSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    if (isDemo(slug)) {
      return NextResponse.json({ ok: true, mode: 'demo' });
    }

    const property = await resolvePropertyBySlug(slug);
    if (!property) {
      return NextResponse.json({ ok: false }, { status: 404 });
    }

    // Invité : nom résolu SERVEUR (booking re-validé par bien — anti IDOR)
    let bookingId: string | null = null;
    let guestName: string | null = null;
    if (parsed.data.bookingId) {
      const booking = await db.booking.findFirst({
        where: { id: parsed.data.bookingId, propertyId: property.id, status: { not: 'CANCELLED' } },
        select: { id: true, guestName: true },
      });
      if (booking) {
        bookingId = booking.id;
        guestName = booking.guestName.slice(0, 80);
      }
    }

    // Upsert idempotent (SQLite : pas de createMany skipDuplicates —
    // updateMany d'abord, create si 0 ligne modifiée).
    const updated = await db.guestSession.updateMany({
      where: { propertyId: property.id, deviceId: parsed.data.deviceId },
      data: { lastSeenAt: new Date() },
    });

    if (updated.count === 0) {
      // ── PREMIER SCAN ──
      try {
        await db.guestSession.create({
          data: {
            propertyId: property.id,
            deviceId: parsed.data.deviceId,
            bookingId,
            guestName,
          },
        });
      } catch {
        // Course concurrente (2 onglets simultanés) : session déjà créée
        // → simple refresh lastSeenAt, PAS une première visite.
        await db.guestSession
          .updateMany({
            where: { propertyId: property.id, deviceId: parsed.data.deviceId },
            data: { lastSeenAt: new Date() },
          })
          .catch(() => undefined);
        return NextResponse.json({ ok: true, firstScan: false });
      }

      const firstName = guestName?.trim().split(/\s+/)[0] || null;
      const audience = await propertyOwnerAndManagers(property.id);
      await sendNotificationToMany(audience, 'guest_arrival', {
        title: firstName
          ? `👋 ${firstName} vient d'arriver et a scanné votre Hub !`
          : '👋 Un invité vient d\'arriver et a scanné votre Hub !',
        body: firstName
          ? `${property.name} : ${firstName} a ouvert son Hub Invité pour la première fois — il est bien entré dans le logement. 🏡`
          : `${property.name} : un invité vient d'ouvrir le Hub Invité (sans séjour lié).`,
        propertyId: property.id,
        propertyName: property.name,
        url: '/airbnb/dashboard',
        meta: {
          source: 'guest_app',
          bookingId,
          guestName,
          hubSlug: slug,
        },
      });

      return NextResponse.json({ ok: true, firstScan: true });
    }

    return NextResponse.json({ ok: true, firstScan: false });
  } catch (error) {
    await captureError('hub.guest-session', error, undefined, req);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
