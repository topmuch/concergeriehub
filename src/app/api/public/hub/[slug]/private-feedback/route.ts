import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { captureError } from '@/lib/error-monitor';
import { sendNotificationToMany, notifySuperadmins, propertyOwnerAndManagers } from '@/lib/notifications';
import { siteUrl } from '@/lib/site';
// =============================================================
// PREMIUM « CONCIERGERIE 5 ÉTOILES » (V5) — ÉTAPE 3.4 (upgradée)
// BOUCLIER D'AVIS — 2.3 RETOUR PRIVÉ + ALERTE CRITIQUE HÔTE
//
// POST /api/public/hub/[slug]/private-feedback
//   body: { rating: 1..5, comment?, guestName?, token?, bookingId? }
//
// Un invité mécontent (1-3 étoiles dans le Hub Invité) écrit son
// retour EN PRIVÉ :
//   1. Sauvegarde DB (table PrivateFeedback — audit + suivi isResolved) ;
//   2. Notification UNIFIÉE à l'hôte (et managers) via sendNotificationToMany :
//      • 1-3 ★ → 🚨 ALERTE CRITIQUE in-app + Email + Push IMMÉDIATS
//        (force=true court-circuite les préférences — urgence) ;
//      • 4-5 ★ → in-app + Email + Push selon préférences
//        (type « guest_feedback ») — FIX-32 : avant, 4-5 ★ ne
//        déclenchaient QUE la cloche.
//
// Traçabilité (Étape 3.2) : si `token` est fourni (lien SMS/email
// du matin du départ), il est VALIDÉ serveur contre booking.
// feedbackToken → rattachement bookingId + nom réel. Un bookingId
// direct est aussi accepté mais TOUJOURS re-validé par bien (anti IDOR).
//
// Sécurité : rate limit 5/min par slug+IP (anti-spam) ; validation
// zod ; never-throw (captureError) ; mode démo = succès sans écriture.
// =============================================================

const DEMO_SLUG = 'demo-hub';
const isDemo = (slug: string) => slug === DEMO_SLUG;

const MAX_COMMENT = 2000;

const feedbackSchema = z.object({
  rating: z
    .number({ message: 'Note invalide.' })
    .int({ message: 'Note invalide.' })
    .min(1, { message: 'Note invalide (1 à 5 étoiles).' })
    .max(5, { message: 'Note invalide (1 à 5 étoiles).' }),
  comment: z.string().trim().max(MAX_COMMENT, { message: `Message trop long (max ${MAX_COMMENT} caractères).` }).optional().nullable(),
  guestName: z.string().trim().max(80).optional().nullable(),
  token: z.string().trim().max(64).optional().nullable(),
  bookingId: z.string().trim().max(60).optional().nullable(),
});

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0].trim() : null) || 'local';
}

/** Résout le bien derrière un slug (plaque V1 OU hub du bien) — même pattern que complaint. */
async function resolveProperty(
  slug: string,
): Promise<{ ok: true; propertyId: string; ownerId: string; propertyName: string } | { ok: false; status: number; message: string }> {
  if (isDemo(slug)) {
    return { ok: true, propertyId: 'demo-home-001', ownerId: 'demo', propertyName: 'Le Petit Nid' };
  }

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
    return { ok: false, status: 404, message: 'Ce hub est introuvable ou a été désactivé.' };
  }

  const property = await db.property.findUnique({
    where: { id: propertyId },
    select: { id: true, name: true, owner: { select: { id: true } } },
  });
  if (!property?.owner?.id) {
    return { ok: false, status: 404, message: 'Ce hub est introuvable.' };
  }

  return { ok: true, propertyId: property.id, ownerId: property.owner.id, propertyName: property.name };
}

const RATING_LABELS: Record<number, string> = {
  1: 'Très déçu',
  2: 'Déçu',
  3: 'Moyen',
  4: 'Très bien',
  5: 'Excellent',
};

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;

    // Anti-spam : 5 retours / minute / slug+IP
    if (!(await rateLimit(`hubfeedback:${slug}:${clientIp(req)}`, 5))) {
      return NextResponse.json(
        { error: 'Trop de messages rapprochés. Réessayez dans un instant.' },
        { status: 429 },
      );
    }

    const rawBody = await req.json().catch(() => null);
    if (!rawBody || typeof rawBody !== 'object') {
      return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
    }
    const parsed = feedbackSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Requête invalide.' },
        { status: 400 },
      );
    }

    const rating = parsed.data.rating;
    const comment = (parsed.data.comment || '').trim().slice(0, MAX_COMMENT);
    const guestName = parsed.data.guestName?.trim().slice(0, 80) || null;
    const rawToken = parsed.data.token?.trim().slice(0, 64) || null;

    const resolved = await resolveProperty(slug);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.message }, { status: resolved.status });
    }

    // ── DEMO MODE : succès sans écriture ──
    if (isDemo(slug)) {
      return NextResponse.json({
        success: true,
        message: 'Feedback envoyé (mode démo) — votre hôte a été prévenu.',
      });
    }

    // ── Traçabilité : token validé serveur OU bookingId re-validé ──
    let bookingId: string | null = null;
    let validatedGuestName = guestName;
    if (rawToken) {
      const booking = await db.booking.findFirst({
        where: { feedbackToken: rawToken, propertyId: resolved.propertyId },
        select: { id: true, guestName: true },
      });
      if (booking) {
        bookingId = booking.id;
        validatedGuestName = validatedGuestName ?? booking.guestName.slice(0, 80);
      }
    } else if (parsed.data.bookingId) {
      const booking = await db.booking.findFirst({
        where: { id: parsed.data.bookingId, propertyId: resolved.propertyId, status: { not: 'CANCELLED' } },
        select: { id: true, guestName: true },
      });
      if (booking) {
        bookingId = booking.id;
        validatedGuestName = validatedGuestName ?? booking.guestName.slice(0, 80);
      }
    }

    // ── 1. Sauvegarde DB (audit + suivi de résolution) ──
    await db.privateFeedback.create({
      data: {
        propertyId: resolved.propertyId,
        bookingId,
        rating,
        comment: comment || null,
        guestName: validatedGuestName,
        token: rawToken,
      },
    });

    // ── 2-3. Notifications hôte UNIFIÉES (hôte + managers) — FIX-32 ──
    // Cloche (in-app) TOUJOURS, pour TOUTES les notes (avant, 4-5 ★
    // ne déclenchaient QUE la cloche — l'hôte n'était pas notifié en
    // temps réel). Email + push :
    //   • 1-3 ★ → ALERTE CRITIQUE force=true (court-circuite les prefs)
    //   • 4-5 ★ → selon les préférences (type « guest_feedback »)
    const audience = await propertyOwnerAndManagers(resolved.propertyId);
    const firstName = validatedGuestName?.trim().split(/\s+/)[0] || null;
    if (rating <= 3) {
      await sendNotificationToMany(audience, 'guest_feedback_alert', {
        title: `🚨 Alerte Guest : Avis négatif détecté pour ${resolved.propertyName}`,
        body:
          `${RATING_LABELS[rating]} (${rating}/5)${firstName ? ` — ${firstName}` : ''}. ` +
          (comment ? `Message : « ${comment.slice(0, 300)} » ` : 'Sans message écrit. ') +
          'Agissez vite pour corriger le tir avant un avis public négatif.',
        propertyId: resolved.propertyId,
        propertyName: resolved.propertyName,
        url: '/airbnb/dashboard',
        force: true,
        email: {
          subject: `🚨 Alerte Guest : Avis négatif détecté pour ${resolved.propertyName}`,
          html:
            `<p style="margin:0 0 12px;font-size:15px"><strong>🚨 Alerte Guest</strong></p>` +
            `<p style="margin:0 0 12px">Un invité de <strong>${escapeHtml(resolved.propertyName)}</strong> ` +
            `vient de laisser un retour privé de <strong>${rating}/5 étoiles (${RATING_LABELS[rating]})</strong>${firstName ? ` — ${escapeHtml(firstName)}` : ''}.</p>` +
            (comment
              ? `<div style="margin:0 0 16px;padding:12px 16px;background:#fef2f2;border:1px solid #fecaca;border-radius:12px;color:#7f1d1d;font-size:14px">« ${escapeHtml(comment).replace(/\n/g, '<br>')} »</div>`
              : `<p style="margin:0 0 16px;color:#64748b">L'invité n'a pas écrit de message détaillé.</p>`) +
            `<p style="margin:0 0 16px">👉 Contactez-le rapidement pour corriger le tir <strong>avant</strong> qu'il ne publie un avis public négatif.</p>` +
            `<p style="margin:0"><a href="${siteUrl}/airbnb/dashboard" style="display:inline-block;background:#0f766e;color:#fff;padding:12px 20px;border-radius:12px;font-weight:700;text-decoration:none">Ouvrir mon tableau de bord</a></p>`,
          text:
            `ALERTE GUEST — Avis privé ${rating}/5 (${RATING_LABELS[rating]}) pour ${resolved.propertyName}` +
            `${firstName ? ` — ${firstName}` : ''}. ${comment ? `Message : ${comment}` : 'Sans message.'} Agissez vite avant un avis public.`,
        },
        meta: {
          source: 'review_shield',
          rating,
          comment: comment || null,
          bookingId,
          hubSlug: slug,
        },
      });

      // v4.46 — relais SUPERADMIN (alerte critique : risque d'avis
      // public négatif). Même email, fire-and-forget.
      void notifySuperadmins('guest_feedback_alert', {
        title: `🚨 [Plateforme] Avis négatif — ${resolved.propertyName}`,
        body:
          `${RATING_LABELS[rating]} (${rating}/5)${firstName ? ` — ${firstName}` : ''}. ` +
          (comment ? `« ${comment.slice(0, 300)} »` : 'Sans message écrit.'),
        propertyId: resolved.propertyId,
        propertyName: resolved.propertyName,
        url: '/airbnb/dashboard',
        email: {
          subject: `🚨 [Plateforme] Avis négatif (${rating}/5) — ${resolved.propertyName}`,
          html:
            `<p style="margin:0 0 12px;font-size:15px"><strong>🚨 Relais Superadmin — Alerte Guest</strong></p>` +
            `<p style="margin:0 0 12px">Un invité de <strong>${escapeHtml(resolved.propertyName)}</strong> a laissé un retour privé de <strong>${rating}/5</strong>${firstName ? ` — ${escapeHtml(firstName)}` : ''}.</p>` +
            (comment
              ? `<div style="margin:0 0 16px;padding:12px 16px;background:#fef2f2;border:1px solid #fecaca;border-radius:12px;color:#7f1d1d;font-size:14px">« ${escapeHtml(comment).replace(/\n/g, '<br>')} »</div>`
              : `<p style="margin:0 0 16px;color:#64748b">Sans message écrit.</p>`) +
            `<p style="margin:0"><a href="${siteUrl}/airbnb/dashboard" style="display:inline-block;background:#0f766e;color:#fff;padding:12px 20px;border-radius:12px;font-weight:700;text-decoration:none">Ouvrir le tableau de bord</a></p>`,
          text:
            `[Plateforme] Avis privé ${rating}/5 (${RATING_LABELS[rating]}) pour ${resolved.propertyName}` +
            `${firstName ? ` — ${firstName}` : ''}. ${comment ? `Message : ${comment}` : 'Sans message.'}`,
        },
        meta: { source: 'review_shield', relay: 'superadmin', rating, hubSlug: slug },
      }).catch(() => undefined);
    } else {
      await sendNotificationToMany(audience, 'guest_feedback', {
        title: `⭐ Avis privé ${rating}/5 — ${resolved.propertyName}`,
        body: comment
          ? `${RATING_LABELS[rating]}${firstName ? ` — ${firstName}` : ''} : « ${comment.slice(0, 480)} »`
          : `Un invité a évalué son séjour « ${RATING_LABELS[rating]} »${firstName ? ` (${firstName})` : ''} sans message.`,
        propertyId: resolved.propertyId,
        propertyName: resolved.propertyName,
        url: '/airbnb/dashboard',
        meta: {
          source: 'review_shield',
          propertyId: resolved.propertyId,
          propertyName: resolved.propertyName,
          rating,
          comment: comment || null,
          guestName: validatedGuestName,
          bookingId,
          hubSlug: slug,
        },
      });
    }

    return NextResponse.json({ success: true, message: 'Merci, votre hôte a été prévenu.' });
  } catch (error) {
    await captureError('hub.private-feedback', error, undefined, req);
    return NextResponse.json(
      { error: 'Erreur serveur. Réessayez dans un instant.' },
      { status: 500 },
    );
  }
}

/** Échappe les caractères HTML d'un fragment texte (email alerte). */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
