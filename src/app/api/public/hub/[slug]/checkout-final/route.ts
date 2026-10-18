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
// v4.50 — garde serveur du verrouillage du hub (403 SESSION_EXPIRED).
import { requireHubAccess } from '@/lib/hub-access';
// v4.53 « RAPPORT DE CHECK-OUT » — récapitulatif auto au départ.
import { refreshCheckoutReportForBooking } from '@/lib/checkout-report';

// =============================================================
// v4.44 « DÉPART DÉFINITIF » — bouton rouge du Hub Invité
//
// POST /api/public/hub/[slug]/checkout-final
//   body: { guestName?, bookingId? }
//
// Le voyageur confirme son départ DÉFINITIF depuis son Hub :
//   1. L'heure EXACTE du départ est enregistrée en base
//      (CheckoutFinalEvent.departedAt) ;
//   2. Alerte AUTOMATIQUE à l'équipe de ménage (hôte + managers,
//      cloche + EMAIL + PUSH selon préférences, type
//      « guest_departed ») : « Les voyageurs ont quitté le
//      logement. Vous pouvez intervenir. » — même déclencheur
//      qu'un SMS/WhatsApp, prêt à être branché sur un canal
//      externe dès qu'un numéro d'équipe est configuré ;
//   3. Le Hub redirige le voyageur vers le recueil d'avis
//      (Review Booster 5 étoiles — côté client).
//
// Sécurité : rate limit 3/min par slug+IP ; zod ; never-throw ;
// bookingId re-validé par bien (anti IDOR) ; mode démo = écho.
// =============================================================

const DEMO_SLUG = 'demo-hub';
const isDemo = (slug: string) => slug === DEMO_SLUG;

const requestSchema = z.object({
  guestName: z.string().trim().max(80).optional().nullable(),
  bookingId: z.string().trim().max(60).optional().nullable(),
  // v4.54 « ALERTE VOCALE & CHECKLIST DE DÉPART » — 5 vérifications
  // confirmées par l'invité avant le départ (traçable côté hôte).
  checklist: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(120),
        done: z.boolean(),
      }),
    )
    .max(12)
    .optional()
    .nullable(),
  // v4.77 « DÉPART D'URGENCE » — bouton rouge du jour J : l'invité part
  // IMMÉDIATEMENT (pas de checklist) et le montant estimé à régler
  // (minibar ouvert + départ tardif validé) accompagne l'alerte hôte.
  urgent: z.boolean().optional(),
  amountDueEur: z.number().min(0).max(100_000).optional().nullable(),
});

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0].trim() : null) || 'local';
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;

    // Anti-spam : 3 confirmations / minute / slug+IP
    if (!(await rateLimit(`hubcheckoutfinal:${slug}:${clientIp(req)}`, 3))) {
      return NextResponse.json(
        { error: 'Trop de confirmations rapprochées. Réessayez dans un instant.' },
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
        message: 'Départ enregistré (mode démo) — l’équipe de ménage a été prévenue.',
        redirectTo: 'avis',
      });
    }

    // ── v4.50 — GARDE SERVEUR du verrouillage (hubLock) : la
    // confirmation de départ est une action hub — session valide
    // exigée tant que le séjour n'est pas terminé. ──
    const access = await requireHubAccess(slug, req);
    if (!access.ok) {
      return NextResponse.json({ error: access.code, message: access.message }, { status: access.status });
    }

    // ── Résolution du bien (plaque V1 OU hub du bien) ──
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

    // ── Invité : nom depuis le booking (re-validé par bien — anti IDOR) ──
    let guestName = parsed.data.guestName?.trim().slice(0, 80) || null;
    let bookingId: string | null = null;
    const rawBookingId = parsed.data.bookingId?.trim().slice(0, 60) || null;
    if (rawBookingId) {
      const booking = await db.booking.findFirst({
        where: { id: rawBookingId, propertyId: property.id, status: { not: 'CANCELLED' } },
        select: { id: true, guestName: true },
      });
      if (booking) {
        bookingId = booking.id;
        if (booking.guestName) guestName = booking.guestName.slice(0, 80);
      }
    }

    const departedAt = new Date();
    const timeLabel = departedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const isUrgent = parsed.data.urgent === true;

    // ── 1. Heure exacte du départ en base ──
    // ── 2. Alerte ménage AUTOMATIQUE (cloche + email + push) ──
    const audience = await propertyOwnerAndManagers(property.id);
    // v4.77 — TEXTE VALIDÉ PAR LE CLIENT : futur (« vont quitter ») +
    // mention explicite du bien dans le corps. En urgence, le montant
    // estimé à régler (minibar ouvert + départ tardif) accompagne l'alerte.
    const amountLine =
      isUrgent && typeof parsed.data.amountDueEur === 'number' && parsed.data.amountDueEur > 0
        ? `\n💰 Montant estimé à régler : ${parsed.data.amountDueEur.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })} — départ immédiat signalé par l'invité.`
        : '';
    const body =
      `🧹 Les voyageurs vont quitter le logement à ${timeLabel}. ` +
      `Vous pouvez intervenir pour le ménage après le départ.\n` +
      `Bien concerné : ${property.name}` +
      (isUrgent ? `\n🚨 DÉPART D'URGENCE — l'invité signale qu'il part immédiatement.` : '') +
      amountLine;
    let staffAlertStatus = 'NO_AUDIENCE';
    if (audience.length > 0) {
      await sendNotificationToMany(audience, 'guest_departed', {
        title: `🚪 Départ définitif confirmé — ${property.name}`,
        body,
        propertyId: property.id,
        propertyName: property.name,
        url: '/airbnb/menage',
        force: true, // alerte opérationnelle ménage — court-circuite les préférences
        meta: {
          source: 'hub',
          propertyId: property.id,
          propertyName: property.name,
          bookingId,
          guestName,
          departedAt: departedAt.toISOString(),
          urgent: isUrgent,
          amountDueEur: parsed.data.amountDueEur ?? null,
          hubSlug: slug,
        },
      });
      staffAlertStatus = 'SENT';
    } else {
      // Filet de sécurité : jamais sans trace (hôte introuvable).
      await db.notification.create({
        data: {
          userId: property.owner.id,
          type: 'guest_departed',
          title: `🚪 Départ définitif confirmé — ${property.name}`,
          body,
          dataJson: JSON.stringify({
            source: 'hub',
            propertyId: property.id,
            propertyName: property.name,
            bookingId,
            guestName,
            departedAt: departedAt.toISOString(),
            hubSlug: slug,
          }),
        },
      });
      staffAlertStatus = 'SENT';
    }

    await db.checkoutFinalEvent.create({
      data: {
        propertyId: property.id,
        bookingId,
        guestName,
        departedAt,
        staffAlertStatus,
        // v4.54 — checklist finale confirmée (null = départ sans checklist,
        // notamment départ d'URGENCE v4.77 qui saute la checklist).
        ...(parsed.data.checklist && parsed.data.checklist.length > 0
          ? { checklistJson: JSON.stringify(parsed.data.checklist) }
          : {}),
      },
    });

    // v4.53 « RAPPORT DE CONSOMMATION AUTOMATIQUE AU CHECK-OUT » —
    // au moment du départ confirmé (compte à rebours consommé par
    // l'invité), le récapitulatif net de l'hôte est généré/complété :
    //   « Consommations Minibar : 2 eaux, 1 vin. Signalements : Aucun.
    //     Preuve Ménage : Validée à 14h15. »
    void refreshCheckoutReportForBooking(property.id, bookingId);

    return NextResponse.json({
      success: true,
      message: 'Départ enregistré — l’équipe de ménage a été prévenue. Merci !',
      redirectTo: 'avis',
    });
  } catch (error) {
    await captureError('hub.checkout-final', error, undefined, req);
    return NextResponse.json(
      { error: 'Erreur serveur. Réessayez dans un instant.' },
      { status: 500 },
    );
  }
}
