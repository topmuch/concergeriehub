import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { isIpBlacklisted } from '@/lib/security';
import { captureError } from '@/lib/error-monitor';
import { requireHubAccess } from '@/lib/hub-access';
import {
  sendNotificationToMany,
  propertyOwnerAndManagers,
} from '@/lib/notifications';
import { renderHubAlertEmail } from '@/lib/email-template-render';
import { siteUrl } from '@/lib/site';
import {
  SPECIAL_REQUEST_ITEM_IDS,
  specialRequestItemMeta,
} from '@/lib/special-requests';

// =============================================================
// « DEMANDES PARTICULIÈRES » — API INVITÉ DU HUB
// GET  /api/public/hub/[slug]/special-requests
//        → liste des demandes du séjour courant (session hub).
// POST /api/public/hub/[slug]/special-requests
//        body: { itemType, quantity, note?, guestName? }
//        → crée une demande (SpecialRequest, source 'hub') rattachée
//          au bien + au séjour courant (booking de la session hub) et
//          notifie l'hôte (cloche + email + push) fire-and-forget.
//
// Authentification : MÊME mécanisme que les autres sous-routes hub —
// requireHubAccess() vérifie le verrouillage par code (x-hub-token ;
// 403 SESSION_* quand la session est absente/invalide/expirée, format
// identique aux routes existantes pour que hubFetch côté client
// déverrouille/efface la session correctement).
//
// Sécurité : blacklist IP + rate limit 6/min par slug+IP ; zod strict ;
// bookingId TOUJOURS pris de la session serveur (jamais du client) ;
// notification jamais bloquante ; mode démo (demo-hub) = succès sans
// écriture ; never-throw (captureError + 500 propre).
// =============================================================

const DEMO_SLUG = 'demo-hub';

const createSchema = z.object({
  itemType: z.enum(SPECIAL_REQUEST_ITEM_IDS as [string, ...string[]]),
  quantity: z.number().int().min(1).max(20).default(1),
  note: z.string().trim().max(500).optional().nullable(),
  guestName: z.string().trim().max(80).optional().nullable(),
});

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0].trim() : null) || 'local';
}

/** Sérialisation commune d'une demande pour l'invité (jamais de
 *  guestName : l'invité reconnaît ses propres demandes). */
function serializeGuestRequest(r: {
  id: string;
  itemType: string;
  quantity: number;
  note: string | null;
  status: string;
  requestedAt: Date;
}) {
  return {
    id: r.id,
    itemType: r.itemType,
    quantity: r.quantity,
    note: r.note,
    status: r.status,
    requestedAt: r.requestedAt.toISOString(),
  };
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;

    // ── MODE DÉMO (hub vitrine, pas de Property réelle) ──
    if (slug === DEMO_SLUG) {
      return NextResponse.json({ ok: true, demo: true, requests: [] });
    }

    // ── Garde hub-access (hub verrouillé par code → 403 SESSION_*) ──
    const access = await requireHubAccess(slug, req);
    if (!access.ok) {
      return NextResponse.json({ error: access.code, message: access.message }, { status: access.status });
    }

    // Session rattachée à un séjour → demandes de CE séjour uniquement
    // ; hub ouvert (sans réservation) → demandes récentes du bien,
    // SANS nom d'invité (aucune donnée personnelle exposée).
    const requests = await db.specialRequest.findMany({
      where: {
        propertyId: access.propertyId,
        ...(access.bookingId ? { bookingId: access.bookingId } : {}),
      },
      orderBy: { requestedAt: 'desc' },
      take: 20,
      select: {
        id: true,
        itemType: true,
        quantity: true,
        note: true,
        status: true,
        requestedAt: true,
      },
    });

    return NextResponse.json({
      ok: true,
      requests: requests.map(serializeGuestRequest),
      scopedToStay: Boolean(access.bookingId),
    });
  } catch (error) {
    await captureError('hub.special-requests.get', error, undefined, req);
    return NextResponse.json(
      { error: 'Erreur serveur. Réessayez dans un instant.' },
      { status: 500 },
    );
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;

    // Blacklist IP (Module 7 Sécurité)
    if (await isIpBlacklisted(clientIp(req))) {
      return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
    }

    // Anti-spam : 6 demandes / minute / slug+IP
    if (!(await rateLimit(`hubspecial:${slug}:${clientIp(req)}`, 6))) {
      return NextResponse.json(
        { error: 'Trop de demandes rapprochées. Réessayez dans un instant.' },
        { status: 429 },
      );
    }

    // ── Lecture + validation du body (zod) ──
    const rawBody = await req.json().catch(() => null);
    if (rawBody !== null && typeof rawBody !== 'object') {
      return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
    }
    const parsed = createSchema.safeParse(rawBody ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Requête invalide.' },
        { status: 400 },
      );
    }
    const { itemType, quantity } = parsed.data;
    const note = parsed.data.note?.trim().slice(0, 500) || null;
    const item = specialRequestItemMeta(itemType);

    // ── MODE DÉMO : succès sans écriture (AVANT la résolution du bien) ──
    if (slug === DEMO_SLUG) {
      return NextResponse.json({
        ok: true,
        demo: true,
        message: `Demande « ${item.label} » envoyée (mode démo) — votre hôte revient vers vous très vite.`,
      }, { status: 201 });
    }

    // ── Garde hub-access (hub verrouillé par code → 403 SESSION_*) ──
    const access = await requireHubAccess(slug, req);
    if (!access.ok) {
      return NextResponse.json({ error: access.code, message: access.message }, { status: access.status });
    }
    const propertyId = access.propertyId;

    // ── Bien actif + propriétaire (pour la notification) ──
    const property = await db.property.findUnique({
      where: { id: propertyId },
      select: { id: true, name: true, isActive: true, owner: { select: { id: true } } },
    });
    if (!property?.isActive) {
      return NextResponse.json({ error: 'Ce hub est introuvable ou a été désactivé.' }, { status: 404 });
    }

    // ── Invité : le booking vient de la SESSION SERVEUR (jamais du
    // client — anti IDOR) ; nom = réservation > body (hub ouvert). ──
    let booking: { id: string; guestName: string } | null = null;
    if (access.bookingId) {
      booking = await db.booking.findFirst({
        where: { id: access.bookingId, propertyId, status: { not: 'CANCELLED' } },
        select: { id: true, guestName: true },
      });
    }
    const guestName =
      booking?.guestName?.slice(0, 80) ?? parsed.data.guestName?.trim().slice(0, 80) ?? null;

    // ── Création de la demande (SpecialRequest, source 'hub') ──
    const request = await db.specialRequest.create({
      data: {
        propertyId,
        bookingId: booking?.id ?? null,
        guestName,
        itemType,
        quantity,
        note,
        status: 'pending',
        source: 'hub',
      },
      select: {
        id: true,
        itemType: true,
        quantity: true,
        note: true,
        status: true,
        requestedAt: true,
      },
    });

    // ── Notification hôte FIRE-AND-FORGET (jamais bloquante) ──
    void notifyHost(property, {
      request,
      guestName,
      hubSlug: slug,
    }).catch(() => undefined);

    return NextResponse.json(
      {
        ok: true,
        request: serializeGuestRequest(request),
        message: `${item.emoji} ${item.label} — demande envoyée à votre hôte !`,
      },
      { status: 201 },
    );
  } catch (error) {
    await captureError('hub.special-requests.post', error, undefined, req);
    return NextResponse.json(
      { error: 'Erreur serveur. Réessayez dans un instant.' },
      { status: 500 },
    );
  }
}

/** Notification hôte unifiée (cloche + email + push) — never-throw. */
async function notifyHost(
  property: { id: string; name: string; owner?: { id: string } | null },
  ctx: {
    request: {
      id: string;
      itemType: string;
      quantity: number;
      note: string | null;
      requestedAt: Date;
    };
    guestName: string | null;
    hubSlug: string;
  },
): Promise<void> {
  try {
    const item = specialRequestItemMeta(ctx.request.itemType);
    const who = ctx.guestName ? `${ctx.guestName} ` : 'Un invité ';
    const qtyLabel = ctx.request.quantity > 1 ? ` ×${ctx.request.quantity}` : '';
    const body =
      `${who}demande : ${item.emoji} ${item.label}${qtyLabel}.` +
      (ctx.request.note ? ` Note : « ${ctx.request.note.slice(0, 200)} »` : '');

    const hubEmail = await renderHubAlertEmail({
      heading: `🛎️ Demande particulière — ${item.label}`,
      propertyName: property.name,
      guestName: ctx.guestName,
      rows: [
        { label: 'Article', value: `${item.emoji} ${item.label}` },
        { label: 'Quantité', value: String(ctx.request.quantity) },
        ...(ctx.request.note ? [{ label: 'Note', value: ctx.request.note }] : []),
      ],
      totalLabel: 'Statut',
      totalValue: 'À préparer',
      introNote: 'L’invité a envoyé une demande particulière depuis le Hub.',
      ctaLabel: 'Ouvrir le suivi (Ménage & stock)',
      ctaUrl: `${siteUrl}/airbnb/menage`,
      footerNote: 'Email envoyé automatiquement depuis le Hub invité.',
    }).catch(() => null);
    const customEmail = hubEmail
      ? { subject: hubEmail.subject, html: hubEmail.html, text: hubEmail.text }
      : undefined;

    const audience = await propertyOwnerAndManagers(property.id);
    if (audience.length > 0) {
      await sendNotificationToMany(audience, 'special_request', {
        title: `🛎️ Demande particulière — ${property.name}`,
        body,
        propertyId: property.id,
        propertyName: property.name,
        url: '/airbnb/menage',
        ...(customEmail ? { email: customEmail } : {}),
        meta: {
          source: 'hub',
          specialRequestId: ctx.request.id,
          itemType: ctx.request.itemType,
          quantity: ctx.request.quantity,
          hubSlug: ctx.hubSlug,
          guestName: ctx.guestName,
        },
      });
    } else if (property.owner?.id) {
      // Filet de sécurité : jamais sans trace (aucun manager trouvé).
      await db.notification
        .create({
          data: {
            userId: property.owner.id,
            type: 'special_request',
            title: `🛎️ Demande particulière — ${property.name}`,
            body,
            dataJson: JSON.stringify({
              source: 'hub',
              specialRequestId: ctx.request.id,
              hubSlug: ctx.hubSlug,
            }),
          },
        })
        .catch(() => undefined);
    }
  } catch (error) {
    console.error('[special-requests] Notification hôte échouée (non bloquant):', error);
  }
}
