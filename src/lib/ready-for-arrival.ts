// =============================================================
// v4.53 « NOTIFICATION PRÊT POUR L'ARRIVÉE » (Early Check-in Alert)
// SERVER ONLY — dès que la femme de ménage termine sa session,
// valide ses preuves et ferme le hub Clean, le système envoie
// AUTOMATIQUEMENT un message au futur voyageur :
//   « Bonne nouvelle ! Votre logement est propre et prêt à vous
//     accueillir plus tôt que prévu. »
//
// Canaux :
//   1. EMAIL invité (Booking.guestEmail via EmailOutbox — template
//      'ready_for_arrival', fallback codé) ;
//   2. BANNIÈRE HUB : Booking.readyNotificationSentAt (flag horodaté,
//      dédupe 1 envoi / séjour) → payload public du hub → bandeau vert
//      dans le Hub du voyageur (même sans email connu) ;
//   3. NOTIFICATION HÔTE : trace « message envoyé à X » (cloche +
//      email + push selon préférences, type 'ready_for_arrival').
//
// Fenêtre de déclenchement : arrivée à venir DANS LES 72 h (au-delà,
// un ménage anticipé ne devrait pas déclencher un message d'accueil
// prématuré). Jamais-throw (fire-and-forget aux call sites).
// =============================================================
import { db } from '@/lib/db';
import { captureError } from '@/lib/error-monitor';
import { queueEmail } from '@/lib/email';
import { renderReadyForArrivalEmail } from '@/lib/email-template-render';
import { siteUrl } from '@/lib/site';
import {
  sendNotificationToMany,
  propertyOwnerAndManagers,
} from '@/lib/notifications';

/** Fenêtre max entre la validation du ménage et l'arrivée : 72 h. */
const READY_WINDOW_MS = 72 * 60 * 60 * 1000;

export interface ReadyForArrivalResult {
  triggered: boolean;
  bookingId: string | null;
  guestName: string | null;
  emailed: boolean;
  reason?: 'none' | 'already_sent' | 'no_email' | 'error';
}

/**
 * Cherche le PROCHAIN voyageur du bien (arrivée dans les 72 h, jamais
 * notifié) et lui envoie la bonne nouvelle. Idempotent via le flag
 * Booking.readyNotificationSentAt.
 */
export async function notifyNextGuestReadyForArrival(
  propertyId: string,
  /** Slug du hub pour le CTA email (optionnel). */
  hubSlug?: string | null,
): Promise<ReadyForArrivalResult> {
  const base: ReadyForArrivalResult = {
    triggered: false,
    bookingId: null,
    guestName: null,
    emailed: false,
  };
  try {
    const now = new Date();

    // 1) Prochain séjour éligible (arrivée à venir ≤ 72 h, pas encore notifié).
    const next = await db.booking.findFirst({
      where: {
        propertyId,
        status: { notIn: ['CANCELLED'] },
        checkIn: { gt: now, lte: new Date(now.getTime() + READY_WINDOW_MS) },
        readyNotificationSentAt: null,
      },
      orderBy: { checkIn: 'asc' },
      select: {
        id: true,
        guestName: true,
        guestEmail: true,
        checkIn: true,
      },
    });
    if (!next) return { ...base, reason: 'none' };

    // 2) Dédupe IMMÉDIAT (un seul envoi par séjour, même si l'email
    //    échoue ensuite — la bannière hub prend le relais).
    const sentAt = new Date();
    await db.booking.update({
      where: { id: next.id },
      data: { readyNotificationSentAt: sentAt },
    });

    // 3) Email invité (si l'adresse est connue).
    const firstName = (next.guestName ?? '').trim().split(/\s+/)[0]?.slice(0, 40) || null;
    const checkInLabel = next.checkIn.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    let emailed = false;
    if (next.guestEmail) {
      try {
        const property = await db.property.findUnique({
          where: { id: propertyId },
          select: { name: true, qrHubSlug: true },
        });
        const propertyName = property?.name ?? 'votre logement';
        const slug = hubSlug ?? property?.qrHubSlug ?? null;
        const final = await renderReadyForArrivalEmail({
          guestName: firstName,
          propertyName,
          checkInLabel,
          hubUrl: slug ? `/hub/${slug}` : undefined,
        });
        await queueEmail({
          to: next.guestEmail,
          subject: final.subject,
          html: final.html,
          text: final.text,
          template: 'custom',
          propertyId,
          referenceType: 'booking',
          referenceId: next.id,
          meta: { source: 'hub', kind: 'ready_for_arrival' },
        });
        emailed = true;
      } catch (error) {
        await captureError('ready-for-arrival.email', error);
      }
    }

    // 4) Trace hôte (cloche + email + push selon préférences).
    try {
      const property = await db.property.findUnique({
        where: { id: propertyId },
        select: { name: true },
      });
      if (property) {
        const audience = await propertyOwnerAndManagers(propertyId);
        if (audience.length > 0) {
          await sendNotificationToMany(audience, 'ready_for_arrival', {
            title: `🔔 « Prêt pour l'arrivée » envoyé — ${property.name}`,
            body:
              `Le ménage vient d'être validé avant l'arrivée de ` +
              `${next.guestName ?? 'votre prochain voyageur'} ` +
              `(${checkInLabel}). ` +
              (emailed
                ? `Un email « Bonne nouvelle ! » vient de lui être envoyé${next.guestEmail ? ` (${next.guestEmail})` : ''}.`
                : 'Aucun email connu pour ce séjour : la bannière est affichée dans son Hub.'),
            propertyId,
            propertyName: property.name,
            url: '/airbnb/calendar',
            meta: {
              source: 'hub',
              kind: 'ready_for_arrival',
              bookingId: next.id,
              guestEmail: next.guestEmail ?? null,
            },
          });
        }
      }
    } catch (error) {
      await captureError('ready-for-arrival.notify-host', error);
    }

    return {
      triggered: true,
      bookingId: next.id,
      guestName: next.guestName,
      emailed,
    };
  } catch (error) {
    await captureError('ready-for-arrival', error);
    return { ...base, reason: 'error' };
  }
}
