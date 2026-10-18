import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { captureError } from '@/lib/error-monitor';
import { resolveHubPropertyId } from '@/lib/hub-resolve';
import {
  sendNotificationToMany,
  propertyOwnerAndManagers,
} from '@/lib/notifications';
import { renderHubAlertEmail } from '@/lib/email-template-render';
import { siteUrl } from '@/lib/site';
import { requireHubAccess } from '@/lib/hub-access';

// =============================================================
// v4.52 « MIDDLE-STAY CARE » — réassort / ménage en cours de séjour
// POST /api/public/hub/[slug]/middle-stay
//
// Séjours longs (≥ 7 nuits, détecté côté client via stay.nights du
// payload) : l'invité demande un réassort (serviettes, papier
// toilette…) ou un ménage intermédiaire. Effets :
//   1. MiddleStayRequest (pending) — file visible dans l'espace hôte ;
//   2. Notification hôte UNIFIÉE (cloche + email + push).
// Sécurité : garde verrouillage (requireHubAccess), rate limit 3/h,
// mode démo = succès sans écriture.
// =============================================================

const DEMO_SLUG = 'demo-hub';
const isDemo = (slug: string) => slug === DEMO_SLUG;

const middleStaySchema = z.object({
  requestType: z.enum(['restock', 'cleaning']),
  details: z.string().trim().max(500).optional().nullable(),
  guestName: z.string().trim().max(80).optional().nullable(),
});

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;

    // 3 demandes / heure / slug+IP — anti-spam ménage.
    if (!(await rateLimit(`hubmiddlestay:${slug}:${clientIp(req)}`, 3))) {
      return NextResponse.json(
        { error: 'Demande déjà envoyée récemment. Votre hôte s’en occupe.' },
        { status: 429 },
      );
    }

    const rawBody = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = middleStaySchema.safeParse(rawBody ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: 'Demande invalide.' }, { status: 400 });
    }
    const d = parsed.data;
    const guestName = d.guestName?.trim().slice(0, 80) || null;

    // ── DEMO MODE : succès sans écriture ──
    if (isDemo(slug)) {
      return NextResponse.json({
        ok: true,
        demo: true,
        message:
          d.requestType === 'cleaning'
            ? 'Demande de ménage envoyée (mode démo) — votre hôte revient vers vous très vite.'
            : 'Réassort demandé (mode démo) — votre hôte revient vers vous très vite.',
      });
    }

    // Garde verrouillage (session hub valide si le hub est protégé).
    const access = await requireHubAccess(slug, req);
    if (!access.ok) {
      return NextResponse.json({ error: access.code, message: access.message }, { status: access.status });
    }

    const resolved = await resolveHubPropertyId(slug);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.message }, { status: resolved.status });
    }
    const property = await db.property.findUnique({
      where: { id: resolved.propertyId },
      select: { id: true, name: true, owner: { select: { id: true } } },
    });
    if (!property?.owner?.id) {
      return NextResponse.json({ error: 'Ce hub est introuvable.' }, { status: 404 });
    }

    const request = await db.middleStayRequest.create({
      data: {
        propertyId: property.id,
        bookingId: access.bookingId,
        guestName: guestName ?? 'Invité',
        requestType: d.requestType,
        details: d.details || null,
      },
      select: { id: true },
    });

    const isCleaning = d.requestType === 'cleaning';
    // Notification hôte UNIFIÉE.
    const audience = await propertyOwnerAndManagers(property.id);
    const hubEmail = await renderHubAlertEmail({
      heading: isCleaning ? '🧺 Ménage intermédiaire demandé' : '📦 Réassort demandé',
      propertyName: property.name,
      guestName,
      rows: [
        { label: 'Type', value: isCleaning ? 'Ménage en cours de séjour' : 'Réassort (serviettes, consommables…)' },
        ...(d.details ? [{ label: 'Détails', value: d.details }] : []),
      ],
      totalLabel: 'Statut',
      totalValue: 'À planifier',
      introNote: 'Séjour long en cours — l’invité demande un passage Middle-Stay Care depuis le Hub.',
      ctaLabel: 'Ouvrir le tableau de bord',
      ctaUrl: `${siteUrl}/airbnb/dashboard`,
      footerNote: 'Email envoyé automatiquement depuis le Hub invité.',
    }).catch(() => null);
    const customEmail = hubEmail
      ? { subject: hubEmail.subject, html: hubEmail.html, text: hubEmail.text }
      : undefined;
    if (audience.length > 0) {
      await sendNotificationToMany(audience, 'middle_stay_request', {
        title: `${isCleaning ? '🧺 Ménage intermédiaire' : '📦 Réassort'} demandé — ${property.name}`,
        body: `${guestName ?? 'Un invité'} (séjour long) demande ${isCleaning ? 'un ménage intermédiaire' : 'un réassort'}.`,
        propertyId: property.id,
        propertyName: property.name,
        url: '/airbnb/dashboard',
        ...(customEmail ? { email: customEmail } : {}),
        meta: {
          source: 'hub',
          middleStay: true,
          requestId: request.id,
          hubSlug: slug,
          guestName,
          requestType: d.requestType,
        },
      });
    } else {
      await db.notification.create({
        data: {
          userId: property.owner.id,
          type: 'middle_stay_request',
          title: `${isCleaning ? '🧺 Ménage intermédiaire' : '📦 Réassort'} — ${property.name}`,
          body: `${guestName ?? 'Un invité'} demande ${isCleaning ? 'un ménage intermédiaire' : 'un réassort'}.`,
          dataJson: JSON.stringify({ source: 'hub', requestId: request.id, hubSlug: slug }),
        },
      });
    }

    return NextResponse.json({
      ok: true,
      message: isCleaning
        ? 'Demande envoyée — votre hôte organise le ménage et revient vers vous ✨'
        : 'Demande envoyée — votre hôte organise le réassort et revient vers vous ✨',
    });
  } catch (error) {
    await captureError('hub.middle-stay', error, undefined, req);
    return NextResponse.json({ error: 'Erreur serveur. Réessayez dans un instant.' }, { status: 500 });
  }
}

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0].trim() : null) || 'local';
}
