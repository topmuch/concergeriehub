import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { captureError } from '@/lib/error-monitor';
import { rateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/audit';

// =============================================================
// RÉPONSES VOCALES DE L'HÔTE — GET /api/public/hub/[slug]/voice-replies
//
// Le Hub Invité affiche les réponses vocales ENREGISTRÉES PAR
// L'HÔTE (VoiceMessage.senderType='HOST') : ce sont des messages
// destinés aux invités par définition → consultation publique
// volontaire, STRICTEMENT limitée aux messages de type HOST (jamais
// les vocaux des autres invités — vie privée).
//
// v4.71 « MESSAGERIE PAR RÉSERVATION » — les réponses sont scopées à la
// FENÊTRE DE SÉJOUR COURANTE (réservation active : arrivée − 1 j →
// départ + 1 j). Un nouvel invité démarre avec une messagerie VIERGE :
// les vocaux des réservations précédentes ne fuient plus jamais dans le
// hub du suivant (demande client explicite). L'hôte garde tout
// l'historique dans son dashboard.
//
// Sécurité : rate limit 30/min par slug+IP ; take 20 ; select
// minimal ; never-throw (captureError).
// =============================================================

const DEMO_SLUG = 'demo-hub';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    if (
      !(await rateLimit(`hubvoicereplies:${slug}:${clientIp(req.headers) ?? 'local'}`, 30))
    ) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Réessayez dans un instant.' },
        { status: 429 },
      );
    }

    // ── DEMO MODE : aucune écriture ni lecture DB (pas de bien réellement lié) ──
    if (slug === DEMO_SLUG) {
      return NextResponse.json({ replies: [] });
    }

    // ── Résolution du bien : plaque V1 OU hub du bien (property.qrHubSlug) ──
    let propertyId: string | null = null;
    let isActive = true;
    const plaque = await db.physicalQrCode.findUnique({
      where: { hubSlug: slug },
      select: { propertyId: true, isClaimed: true },
    });
    if (plaque) {
      if (!plaque.isClaimed || !plaque.propertyId) {
        return NextResponse.json({ error: 'Hub non trouvé' }, { status: 404 });
      }
      propertyId = plaque.propertyId;
    } else {
      const propertyBySlug = await db.property.findUnique({
        where: { qrHubSlug: slug },
        select: { id: true, isActive: true },
      });
      if (!propertyBySlug) {
        return NextResponse.json({ error: 'Hub non trouvé' }, { status: 404 });
      }
      propertyId = propertyBySlug.id;
      isActive = propertyBySlug.isActive;
    }
    if (!isActive) {
      return NextResponse.json(
        { error: 'Ce bien a été désactivé par son hôte.' },
        { status: 410 },
      );
    }

    // ── v4.71 — fenêtre de séjour courante (partagée par les 2 modes) :
    // réservation NON ANNULÉE qui couvre « maintenant » (arrivée − 1 j →
    // départ + 1 j), sinon la prochaine à venir, sinon null.
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const currentBooking = (await db.booking.findFirst({
      where: {
        propertyId,
        status: { not: 'CANCELLED' },
        checkIn: { lte: new Date(Date.now() + 86_400_000) },
        checkOut: { gte: startOfToday },
      },
      orderBy: { checkIn: 'desc' },
      select: { checkIn: true, checkOut: true },
    })) ?? null;
    // Bornes de visibilité : messages créés PENDANT ce séjour uniquement.
    const stayWindow = currentBooking
      ? {
          from: new Date(currentBooking.checkIn.getTime() - 86_400_000),
          to: new Date(currentBooking.checkOut.getTime() + 86_400_000),
        }
      : null;

    // ── v4.35 « ALERTE NOUVEAU MESSAGE » — mode léger ?meta=1 :
    // uniquement ids + dates (SANS audioData) pour le polling de la
    // page hub (pastille rouge clignotante + bip sonore). ──
    if (new URL(req.url).searchParams.get('meta') === '1') {
      const metas = await db.voiceMessage.findMany({
        where: {
          propertyId,
          senderType: { in: ['HOST', 'host'] },
          // v4.71 — jamais de message d'un ancien séjour.
          ...(stayWindow
            ? { createdAt: { gte: stayWindow.from, lte: stayWindow.to } }
            : { createdAt: { gte: new Date(Date.now() - 86_400_000) } }),
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, createdAt: true, senderName: true },
      });
      return NextResponse.json({ replies: metas });
    }

    // ── v4.77 « MESSAGERIE THREADÉE » — vocaux de l'HÔTE + réponses
    // THREADÉES de l'invité (senderType='guest' attachées à un vocal hôte
    // via replyToId). Les messages invités SANS replyToId (répondeur
    // « Contacter l'hôte ») restent privés — seule la conversation
    // threadée remonte. Ordre ASC : les réponses se regroupent sous leur
    // vocal hôte côté client.
    const replies = await db.voiceMessage.findMany({
      where: {
        propertyId,
        OR: [
          { senderType: { in: ['HOST', 'host'] } },
          { senderType: 'guest', replyToId: { not: null } },
        ],
        // v4.71 — messagerie réinitialisée à chaque nouvelle réservation :
        // seuls les vocaux de la fenêtre de séjour courante remontent.
        ...(stayWindow
          ? { createdAt: { gte: stayWindow.from, lte: stayWindow.to } }
          : { createdAt: { gte: new Date(Date.now() - 86_400_000) } }),
      },
      orderBy: { createdAt: 'asc' },
      take: 40,
      select: {
        id: true,
        senderName: true,
        senderType: true,
        audioUrl: true,
        audioData: true,
        durationSec: true,
        createdAt: true,
        replyToId: true,
      },
    });

    return NextResponse.json({ replies });
  } catch (error) {
    await captureError('hub.voice-replies', error, undefined, req);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
