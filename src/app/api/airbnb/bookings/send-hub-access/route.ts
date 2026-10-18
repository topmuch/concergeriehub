// =============================================================
// /api/airbnb/bookings/send-hub-access — v4.83 « INFOS DE CONNEXION »
//
// POST body: { bookingId }
//   → l'hôte vient de créer (ou rouvre) une réservation : le système
//     envoie à l'invité un MESSAGE ENRICHI (email) réunissant toutes
//     les infos de connexion au hub :
//       • lien du hub (origin + /hub/[qrHubSlug]) ;
//       • code d'accès (Booking.accessCode) ;
//       • horaires d'arrivée et de départ ;
//       • contact hôte + note libre.
//
// Autorisation : session hôte OWNER/MANAGER du bien du séjour.
// Garde-fous : mutationGuard (anti-abus), séjour avec accessCode +
// guestEmail + qrHubSlug, statut ≠ CANCELLED. Fire-and-forget :
// queueEmail ne lève jamais (outbox + retry).
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getUserRoleForProperty } from '@/lib/b2b-server';
import { canManageTeam } from '@/lib/team';
import { mutationGuard, mutationKey } from '@/lib/mutation-guard';
import { queueEmail } from '@/lib/email';
import { hubAccessEmail } from '@/lib/email-templates';
import { siteUrl } from '@/lib/site';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    // Anti-abus : même quota que les autres mutations hôte.
    const mutGuard = await mutationGuard(mutationKey('airbnb-mut', req, userId));
    if (mutGuard) return mutGuard;

    const body = (await req.json().catch(() => null)) as { bookingId?: string } | null;
    const bookingId = body?.bookingId?.trim();
    if (!bookingId) {
      return NextResponse.json({ error: 'bookingId requis.' }, { status: 400 });
    }

    const booking = await db.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        propertyId: true,
        guestName: true,
        guestEmail: true,
        checkIn: true,
        checkOut: true,
        status: true,
        accessCode: true,
        notes: true,
        property: {
          select: {
            id: true,
            name: true,
            qrHubSlug: true,
            owner: {
              select: {
                fullName: true,
                email: true,
                profile: { select: { phone: true } },
              },
            },
          },
        },
      },
    });
    if (!booking) {
      return NextResponse.json({ error: 'Séjour introuvable.' }, { status: 404 });
    }
    // v5.6 — la propriété est résolue « à la plaque » ci-dessous quand
    // le slug du bien est absent (hub activé par plaque QR).
    let hubSlug = booking.property?.qrHubSlug ?? null;
    const property = booking.property;

    const myRole = await getUserRoleForProperty(userId, booking.propertyId);
    if (!myRole || !canManageTeam(myRole)) {
      return NextResponse.json(
        { error: 'Seuls le propriétaire et les gestionnaires peuvent envoyer les infos de connexion.' },
        { status: 403 },
      );
    }

    if (booking.status === 'CANCELLED') {
      return NextResponse.json(
        { error: 'Ce séjour est annulé — envoyez les infos depuis un séjour actif.' },
        { status: 400 },
      );
    }
    if (!booking.accessCode) {
      return NextResponse.json(
        { error: "Ce séjour n'a pas de code d'accès hub (iCal sans code ?). Définissez-le d'abord dans la fiche du séjour." },
        { status: 400 },
      );
    }
    if (!booking.guestEmail) {
      return NextResponse.json(
        { error: "Aucun email invité sur ce séjour — ajoutez-le dans la fiche, ou copiez les infos pour les envoyer vous-même (WhatsApp/SMS)." },
        { status: 400 },
      );
    }
    if (!booking.property?.qrHubSlug) {
      // v5.6 — RÉSOLUTION « À LA PLAQUE » : le hub d'un bien peut venir
      // d'une PLAQUE QR activée (PhysicalQrCode.hubSlug) même quand le
      // slug du bien est absent — c'est le flux d'activation des plaques
      // (hub « activé » aux yeux de l'hôte). On réplique la résolution
      // du hub public (src/lib/hub-resolve.ts) avant de renoncer.
      const plaque = await db.physicalQrCode.findFirst({
        where: {
          propertyId: booking.propertyId,
          isClaimed: true,
          status: 'active',
          hubSlug: { not: null },
        },
        orderBy: { activatedAt: 'asc' },
        select: { hubSlug: true },
      });
      if (plaque?.hubSlug) {
        hubSlug = plaque.hubSlug;
      }
    }
    if (!hubSlug) {
      return NextResponse.json(
        { error: "Ce bien n'a pas encore de hub actif — activez votre plaque QR (onglet Plaques QR) puis renvoyez les infos de connexion." },
        { status: 400 },
      );
    }

    // ── Construction du message enrichi ──
    // Format FR court : « vendredi 17 octobre à 15 h 00 ». Les heures
    // sont celles SAISIES par l'hôte (datetime-local → stockées telles
    // quelles avec un serveur en UTC) → rendu en UTC pour ne pas
    // décaler le créneau communiqué.
    const dateLabel = (d: Date): string =>
      d.toLocaleString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
      });
    const checkInLabel = dateLabel(booking.checkIn);
    const checkOutLabel = dateLabel(booking.checkOut);

    const origin = req.headers.get('origin')?.replace(/\/+$/, '') || siteUrl;
    const hubUrl = `${origin}/hub/${hubSlug}`;

    const tpl = hubAccessEmail({
      guestName: booking.guestName,
      propertyName: property.name,
      accessCode: booking.accessCode,
      hubUrl,
      checkInLabel,
      checkOutLabel,
      hostName: booking.property.owner?.fullName ?? null,
      hostPhone: booking.property.owner?.profile?.phone ?? null,
      note: booking.notes,
    });

    const result = await queueEmail({
      to: booking.guestEmail,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      template: 'hub_access',
      propertyId: booking.propertyId,
      referenceType: 'booking',
      referenceId: booking.id,
      meta: { hubUrl, accessCode: booking.accessCode, kind: 'send_hub_access', hubViaPlaque: hubSlug !== (property.qrHubSlug ?? null) },
    });

    if (result.status === 'SKIPPED' || result.status === 'FAILED') {
      return NextResponse.json(
        { error: "L'envoi a échoué (config email) — les infos restent copiables depuis la fiche." },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      sentTo: booking.guestEmail,
      hubUrl,
      emailStatus: result.status,
    });
  } catch (error) {
    console.error('[airbnb/bookings/send-hub-access POST] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
