import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { captureError } from '@/lib/error-monitor';
import { resolveHubPropertyId } from '@/lib/hub-resolve';
import {
  sendNotificationToMany,
  notifySuperadmins,
  propertyOwnerAndManagers,
} from '@/lib/notifications';
import { renderHubAlertEmail } from '@/lib/email-template-render';
import { siteUrl } from '@/lib/site';
import { parseMinibar } from '@/lib/concierge';
import { requireHubAccess } from '@/lib/hub-access';

// =============================================================
// v4.50 « RECHARGER LE FRIGO » (Restock en 1 clic)
// POST /api/public/hub/[slug]/minibar-restock
//
// Si l'invité a consommé l'essentiel du minibar, un bouton lui permet
// de demander un réapprovisionnement automatique pour le lendemain
// matin lors du passage de l'équipe d'entretien. Effets :
//   1. MinibarRestockRequest (PENDING) — visible dans le dashboard
//      hôte (liste « Réapprovisionnements à traiter ») ;
//   2. Notification hôte UNIFIÉE (cloche + email + push) ;
//   3. L'onglet Check-in/Check-out de l'invité affiche « Recharge
//      demandée ✅ » (payload hub).
//
// Sécurité : garde verrouillage (requireHubAccess) ; rate limit
// 3/h (anti-spam ménage) ; mode démo = succès sans écriture.
// =============================================================

const DEMO_SLUG = 'demo-hub';
const isDemo = (slug: string) => slug === DEMO_SLUG;

const restockSchema = z.object({
  guestName: z.string().trim().max(80).optional().nullable(),
  note: z.string().trim().max(200).optional().nullable(),
});

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;

    // 3 demandes / heure / slug+IP — largement suffisant, anti-spam.
    if (!(await rateLimit(`hubmbrestock:${slug}:${clientIp(req)}`, 3))) {
      return NextResponse.json(
        { error: 'Demande déjà envoyée récemment. Votre hôte s’en occupe.' },
        { status: 429 },
      );
    }

    const rawBody = await req.json().catch(() => ({}));
    const parsed = restockSchema.safeParse(rawBody ?? {});
    const guestName = parsed.success ? parsed.data.guestName?.trim().slice(0, 80) || null : null;
    const note = parsed.success ? parsed.data.note?.trim().slice(0, 200) || null : null;

    // ── DEMO MODE : succès sans écriture ──
    if (isDemo(slug)) {
      return NextResponse.json({
        success: true,
        message: 'Recharge demandée (mode démo) — votre minibar sera rechargé demain matin.',
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
      select: { id: true, name: true, premiumFeatures: true, owner: { select: { id: true } } },
    });
    if (!property?.owner?.id) {
      return NextResponse.json({ error: 'Ce hub est introuvable.' }, { status: 404 });
    }

    const minibar = parseMinibar(property.premiumFeatures);
    if (!minibar.enabled) {
      return NextResponse.json({ error: 'Le minibar n’est pas actif pour ce logement.' }, { status: 403 });
    }

    // Idempotence douce : une demande PENDING de moins de 12 h → OK
    // (on confirme sans dupliquer la notification ménage).
    const existing = await db.minibarRestockRequest.findFirst({
      where: {
        propertyId: property.id,
        status: 'PENDING',
        createdAt: { gte: new Date(Date.now() - 12 * 3_600_000) },
      },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({
        success: true,
        duplicated: true,
        message: 'Une recharge est déjà prévue — votre minibar sera rechargé demain matin.',
      });
    }

    const request = await db.minibarRestockRequest.create({
      data: {
        propertyId: property.id,
        bookingId: access.bookingId,
        guestName,
      },
      select: { id: true },
    });

    // Notification hôte UNIFIÉE.
    const audience = await propertyOwnerAndManagers(property.id);
    const hubEmail = await renderHubAlertEmail({
      heading: '🧊 Recharge minibar demandée',
      propertyName: property.name,
      guestName,
      rows: [
        { label: 'Quand', value: 'Demain matin (passage équipe d’entretien)' },
        { label: 'Catalogue', value: `${minibar.items.length} article(s) à réapprovisionner` },
        ...(note ? [{ label: 'Message', value: note }] : []),
      ],
      totalLabel: 'Statut',
      totalValue: 'À planifier',
      introNote: 'L’invité a consommé l’essentiel du minibar et demande un réapprovisionnement automatique.',
      ctaLabel: 'Ouvrir le tableau de bord',
      ctaUrl: `${siteUrl}/airbnb/dashboard`,
      footerNote: 'Email envoyé automatiquement depuis le Hub invité.',
    }).catch(() => null);
    const customEmail = hubEmail
      ? { subject: hubEmail.subject, html: hubEmail.html, text: hubEmail.text }
      : undefined;
    if (audience.length > 0) {
      // WP-BACK v4.61 — `force: true` : le réassort est une demande
      // COMMERCIALE/OPÉRATIONNELLE, l'hôte ne doit jamais la manquer —
      // email + push partent MÊME si les préférences notificationPrefs
      // coupaient ce type (cause du « je ne reçois pas d'alerte »).
      await sendNotificationToMany(audience, 'minibar_restock', {
        title: `🧊 Recharge minibar demandée — ${property.name}`,
        body: `${guestName ?? 'Un invité'} demande un réapprovisionnement pour demain matin (passage entretien).`,
        propertyId: property.id,
        propertyName: property.name,
        url: '/airbnb/dashboard',
        force: true,
        ...(customEmail ? { email: customEmail } : {}),
        meta: {
          source: 'hub',
          minibarRestock: true,
          restockId: request.id,
          hubSlug: slug,
          guestName,
          note,
        },
      });
    } else {
      await db.notification.create({
        data: {
          userId: property.owner.id,
          type: 'minibar_restock',
          title: `🧊 Recharge minibar — ${property.name}`,
          body: `${guestName ?? 'Un invité'} demande un réapprovisionnement pour demain matin.`,
          dataJson: JSON.stringify({ source: 'hub', restockId: request.id, hubSlug: slug }),
        },
      });
      // WP-BACK v4.61 — audience vide (bien sans owner résolu) : relais
      // Superadmin pour que la demande ne se perde jamais (miroir de la
      // route complaint). Fire-and-forget, jamais bloquant.
      if (customEmail) {
        void notifySuperadmins('minibar_restock', {
          title: `🧊 [Plateforme] Recharge minibar — ${property.name}`,
          body: `${guestName ?? 'Un invité'} demande un réapprovisionnement pour demain matin.`,
          propertyId: property.id,
          propertyName: property.name,
          url: '/airbnb/dashboard',
          email: customEmail,
          meta: { source: 'hub', relay: 'superadmin', restockId: request.id, hubSlug: slug },
        }).catch(() => undefined);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Demande envoyée — votre minibar sera rechargé demain matin ✨',
    });
  } catch (error) {
    await captureError('hub.minibar-restock', error, undefined, req);
    return NextResponse.json({ error: 'Erreur serveur. Réessayez dans un instant.' }, { status: 500 });
  }
}

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0].trim() : null) || 'local';
}
