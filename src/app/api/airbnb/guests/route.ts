// =============================================================
// v4.69 — PHASE 2 · ONGLET « INVITÉS » (mini-CRM)
// GET /api/airbnb/guests?propertyId=?
//
// Historique COMPLET par séjour : pour chaque Booking (100 plus
// récents, checkIn desc), on agrège toutes les interactions invité :
//   • minibarOrders  → commandes minibar (itemsJson parsé serveur —
//     jamais renvoyé brut), total, paiement, statut OPEN/PAID ;
//   • laundryOrders  → pressing/lessive (type, pièces, montant…);
//   • checkOutInspections → états des lieux signés (token public ;
//     AUCUNE donnée lourde : photos/roomsData/signature exclus) ;
//   • checkoutReports → récapitulatifs auto du départ ;
//   • guestMemories  → livre d'or (note, message, réponse hôte) ;
//   • middleStayRequests → demandes en cours de séjour.
// Les ménages (CleaningReport) ne portent PAS de bookingId : ils sont
// renvoyés à part, groupés par bien (cleaningByProperty, take 200,
// AUCUNE photo dataURL — juste les counts), et le client les associe
// par fenêtre de dates [checkIn − 1 j ; checkOut + 1 j].
//
// Sécurité : session + resolveUserProperties (possédé + équipe
// acceptée). `?propertyId=` optionnel : filtre un bien, refusé (403)
// s'il n'appartient pas à l'utilisateur (anti-IDOR).
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { resolveUserProperties } from '@/lib/b2b-server';

/** Ligne minibar parsée (résumé léger — jamais itemsJson brut). */
interface MinibarItemLite {
  name: string;
  qty: number;
}

interface SerializedMinibarOrder {
  id: string;
  items: MinibarItemLite[];
  totalEur: number;
  payment: string;
  status: string;
  createdAt: string;
}

/** Parse itemsJson (format hub : [{id,name,emoji,qty,lineTotal,free}]) en résumé. */
function parseMinibarItems(itemsJson: string): MinibarItemLite[] {
  try {
    const parsed: unknown = JSON.parse(itemsJson);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
      .map((l) => ({
        name: String(l.name ?? 'Article'),
        qty: Number(l.qty ?? 0),
      }))
      .filter((l) => l.qty > 0);
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const properties = await resolveUserProperties(userId);
    const propertyIds = properties.map((p) => p.id);

    // Filtre optionnel par bien (anti-IDOR : doit être accessible).
    const { searchParams } = new URL(req.url);
    const requestedId = searchParams.get('propertyId');
    if (requestedId && !propertyIds.includes(requestedId)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }
    const scopeIds = requestedId ? [requestedId] : propertyIds;

    if (scopeIds.length === 0) {
      return NextResponse.json({ bookings: [], cleaningByProperty: {} });
    }

    const [bookings, cleaningReports] = await Promise.all([
      db.booking.findMany({
        where: { propertyId: { in: scopeIds } },
        orderBy: { checkIn: 'desc' },
        take: 100,
        include: {
          property: { select: { id: true, name: true } },
          minibarOrders: {
            orderBy: { createdAt: 'desc' },
            select: { id: true, itemsJson: true, totalEur: true, payment: true, status: true, createdAt: true },
          },
          laundryOrders: {
            orderBy: { createdAt: 'desc' },
            select: { id: true, serviceType: true, pieces: true, pickupSlot: true, amountEur: true, payment: true, status: true, createdAt: true },
          },
          checkOutInspections: {
            orderBy: { signedAt: 'desc' },
            select: { id: true, publicToken: true, signedAt: true, guestName: true, status: true, selfAssessment: true, type: true, damages: true },
          },
          checkoutReports: {
            orderBy: { generatedAt: 'desc' },
            select: { id: true, minibarTotal: true, signalementsCount: true, departedAt: true, cleaningValidatedAt: true, restockPending: true },
          },
          guestMemories: {
            orderBy: { createdAt: 'desc' },
            select: { id: true, guestName: true, rating: true, message: true, isApproved: true, isPublic: true, hostReply: true, createdAt: true },
          },
          middleStayRequests: {
            orderBy: { createdAt: 'desc' },
            select: { id: true, requestType: true, status: true, details: true, createdAt: true },
          },
        },
      }),
      // Ménages du/des biens — sans bookingId dans le schéma, le client
      // les associe par fenêtre de dates autour du séjour.
      db.cleaningReport.findMany({
        where: { propertyId: { in: scopeIds } },
        orderBy: { startedAt: 'desc' },
        take: 200,
        select: { id: true, propertyId: true, staffName: true, startedAt: true, endedAt: true, checklistJson: true, photos: true },
      }),
    ]);

    // ── Groupage des ménages par bien (counts uniquement, jamais les photos) ──
    const cleaningByProperty: Record<
      string,
      {
        id: string;
        staffName: string | null;
        startedAt: string | null;
        endedAt: string | null;
        checklistDone: number;
        checklistTotal: number;
        photosCount: number;
      }[]
    > = {};
    for (const r of cleaningReports) {
      let checklistDone = 0;
      let checklistTotal = 0;
      try {
        const checklist: unknown = JSON.parse(r.checklistJson);
        if (Array.isArray(checklist)) {
          checklistTotal = checklist.length;
          checklistDone = checklist.filter(
            (c) => !!c && typeof c === 'object' && (c as { done?: unknown }).done === true,
          ).length;
        }
      } catch {
        // checklist illisible → compteurs à 0, non bloquant
      }
      let photosCount = 0;
      try {
        const photos: unknown = JSON.parse(r.photos);
        if (Array.isArray(photos)) photosCount = photos.length;
      } catch {
        // photos illisibles → count 0, non bloquant
      }
      const list = cleaningByProperty[r.propertyId] ?? [];
      list.push({
        id: r.id,
        staffName: r.staffName,
        startedAt: r.startedAt?.toISOString() ?? null,
        endedAt: r.endedAt?.toISOString() ?? null,
        checklistDone,
        checklistTotal,
        photosCount,
      });
      cleaningByProperty[r.propertyId] = list;
    }

    // ── Sérialisation ISO (dates JSON-safe) ──
    const serialized = bookings.map((b) => ({
      id: b.id,
      propertyId: b.propertyId,
      propertyName: b.property?.name ?? null,
      guestName: b.guestName,
      guestEmail: b.guestEmail,
      checkIn: b.checkIn.toISOString(),
      checkOut: b.checkOut.toISOString(),
      guests: b.guests,
      source: b.source,
      status: b.status,
      accessCode: b.accessCode,
      minibarOrders: b.minibarOrders.map(
        (o): SerializedMinibarOrder => ({
          id: o.id,
          items: parseMinibarItems(o.itemsJson),
          totalEur: o.totalEur,
          payment: o.payment,
          status: o.status,
          createdAt: o.createdAt.toISOString(),
        }),
      ),
      laundryOrders: b.laundryOrders.map((o) => ({
        id: o.id,
        serviceType: o.serviceType,
        pieces: o.pieces,
        pickupSlot: o.pickupSlot,
        amountEur: o.amountEur,
        payment: o.payment,
        status: o.status,
        createdAt: o.createdAt.toISOString(),
      })),
      checkOutInspections: b.checkOutInspections.map((i) => ({
        id: i.id,
        publicToken: i.publicToken,
        signedAt: i.signedAt.toISOString(),
        guestName: i.guestName,
        status: i.status,
        selfAssessment: i.selfAssessment,
        // v4.80 — type d'état des lieux (checkin = entrée | checkout = sortie)
        // + présence de dégâts signalés (badge ⚠️ côté dashboard).
        type: i.type === 'checkin' ? 'checkin' : 'checkout',
        hasDamages: !!i.damages,
      })),
      checkoutReports: b.checkoutReports.map((r) => ({
        id: r.id,
        minibarTotal: r.minibarTotal,
        signalementsCount: r.signalementsCount,
        departedAt: r.departedAt?.toISOString() ?? null,
        cleaningValidatedAt: r.cleaningValidatedAt?.toISOString() ?? null,
        restockPending: r.restockPending,
      })),
      guestMemories: b.guestMemories.map((m) => ({
        id: m.id,
        guestName: m.guestName,
        rating: m.rating,
        message: m.message,
        isApproved: m.isApproved,
        isPublic: m.isPublic,
        hostReply: m.hostReply,
        createdAt: m.createdAt.toISOString(),
      })),
      middleStayRequests: b.middleStayRequests.map((r) => ({
        id: r.id,
        requestType: r.requestType,
        status: r.status,
        details: r.details,
        createdAt: r.createdAt.toISOString(),
      })),
    }));

    return NextResponse.json({ bookings: serialized, cleaningByProperty });
  } catch (error) {
    console.error('[airbnb/guests] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
