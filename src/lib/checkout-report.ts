// =============================================================
// v4.53 « RAPPORT DE CONSOMMATION AUTOMATIQUE AU CHECK-OUT »
// SERVER ONLY — agrégation + persistance du récapitulatif net du
// séjour pour l'hôte :
//   « Consommations Minibar : 2 eaux, 1 vin — 12,50 €.
//     Signalements : Aucun. Preuve Ménage : Validée à 14h15. »
//
// Le rapport est :
//   1. CRÉÉ au moment où le compte à rebours expire (fin de séjour
//      EFFECTIVE = lateCheckOutUntil ?? checkOut) — via la génération
//      paresseuse `generateMissingCheckoutReports` appelée à la
//      lecture du dashboard hôte ;
//   2. RAFRAÎCHI à chaque événement du séjour :
//      - départ définitif confirmé (checkout-final) → departedAt ;
//      - validation du ménage de rotation (cleaning) → preuve ménage
//        horodatée + GPS ;
//      - nouvelle consommation / restock → agrégats minibar.
// Jamais-throw : un échec de rapport ne doit JAMAIS casser le flux
// invité (feux d'artifice try/catch aux call sites).
// =============================================================
import { db } from '@/lib/db';
import { captureError } from '@/lib/error-monitor';
import { bookingStayEnd } from '@/lib/hub-access';
import { sendNotificationToMany, propertyOwnerAndManagers } from '@/lib/notifications';

// ----- Types publics (miroirs du contrat API) -----

export interface ReportMinibarLine {
  name: string;
  emoji: string;
  qty: number;
  total: number;
  free: boolean;
}

export interface ReportSignalement {
  category: string;
  label: string;
  description: string;
  isUrgent: boolean;
  status: string;
  createdAt: string;
}

/** Libellés lisibles des catégories de signalements (miroir Messages). */
const SIGNALEMENT_LABELS: Record<string, string> = {
  PLUMBING: 'Plomberie',
  ELECTRICAL: 'Électricité',
  CLEANING: 'Ménage',
  BREAKAGE: 'Casse / objet abîmé',
  OTHER: 'Autre',
};

// ----- Agrégation minibar -----

/** Parse une ligne itemsJson d'un MinibarOrder (serveur = source de vérité). */
function parseOrderLines(itemsJson: string): ReportMinibarLine[] {
  try {
    const parsed: unknown = JSON.parse(itemsJson);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
      .map((l) => ({
        name: String(l.name ?? ''),
        emoji: String(l.emoji ?? '🍷'),
        qty: Number(l.qty ?? 0),
        total: Number(l.lineTotal ?? l.total ?? 0),
        free: l.free === true,
      }))
      .filter((l) => l.qty > 0);
  } catch {
    return [];
  }
}

/** Fusionne les commandes du séjour en agrégat par produit (2 eaux, 1 vin). */
export function aggregateMinibarLines(itemsJsonList: string[]): {
  lines: ReportMinibarLine[];
  total: number;
} {
  const byName = new Map<string, ReportMinibarLine>();
  let total = 0;
  for (const json of itemsJsonList) {
    for (const line of parseOrderLines(json)) {
      const key = `${line.emoji}|${line.name}`;
      const prev = byName.get(key);
      if (prev) {
        prev.qty += line.qty;
        prev.total += line.total;
      } else {
        byName.set(key, { ...line });
      }
      if (!line.free) total += line.total;
    }
  }
  return { lines: [...byName.values()], total: Math.round(total * 100) / 100 };
}

// ----- Construction / rafraîchissement du rapport -----

interface BookingLike {
  id: string;
  guestName: string | null;
  checkIn: Date;
  checkOut: Date;
  lateCheckOutUntil: Date | null;
}

/**
 * Construit (ou met à jour) le CheckoutReport d'un séjour.
 * Idempotent : upsert unique (propertyId, bookingId).
 */
export async function upsertCheckoutReport(
  propertyId: string,
  booking: BookingLike,
): Promise<string | null> {
  try {
    const stayEnd = bookingStayEnd(booking);

    // 1) Consommations minibar rattachées au séjour.
    const orders = await db.minibarOrder.findMany({
      where: {
        propertyId,
        OR: [
          { bookingId: booking.id },
          // Filet : commandes sans bookingId créées PENDANT le séjour
          // (léguées d'avant v4.50) — on les matche par fenêtre temporelle.
          { bookingId: null, createdAt: { gte: booking.checkIn, lte: stayEnd } },
        ],
      },
      select: { itemsJson: true },
    });
    const { lines, total } = aggregateMinibarLines(orders.map((o) => o.itemsJson));

    // 2) Inventaire d'arrivée validé (preuve « tout est là »).
    const check = await db.minibarCheck.findFirst({
      where: { propertyId, bookingId: booking.id },
      orderBy: { checkedAt: 'desc' },
      select: { checkedAt: true },
    });

    // 3) Restock en attente (l'équipe n'a pas encore rechargé).
    const restock = await db.minibarRestockRequest.findFirst({
      where: { propertyId, bookingId: booking.id, status: 'PENDING' },
      select: { id: true },
    });

    // 4) Signalements du séjour (hors miroirs ménage CLEANING/RESOLVED
    //    créés par la route cleaning — ce ne sont pas des litiges).
    const signalements = await db.guestComplaint.findMany({
      where: {
        propertyId,
        category: { not: 'CLEANING' },
        createdAt: { gte: booking.checkIn, lte: stayEnd },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        category: true,
        description: true,
        isUrgent: true,
        status: true,
        createdAt: true,
      },
    });
    const signalementsJson: ReportSignalement[] = signalements.map((s) => ({
      category: s.category,
      label: SIGNALEMENT_LABELS[s.category] ?? 'Autre',
      description: s.description.slice(0, 400),
      isUrgent: s.isUrgent,
      status: s.status,
      createdAt: s.createdAt.toISOString(),
    }));

    // 5) Départ définitif confirmé depuis le Hub.
    const departure = await db.checkoutFinalEvent.findFirst({
      where: { propertyId, bookingId: booking.id },
      orderBy: { departedAt: 'desc' },
      select: { departedAt: true },
    });

    // 6) Preuve ménage POST-départ (rotation suivante) — le ménage
    //    validé APRÈS la fin du séjour = le « retour à l'état zéro ».
    const cleaning = await db.cleaningReport.findFirst({
      where: { propertyId, endedAt: { gte: stayEnd } },
      orderBy: { endedAt: 'asc' },
      select: { endedAt: true, staffName: true },
    });
    const cleaningProof =
      cleaning?.endedAt != null
        ? { endedAt: cleaning.endedAt, staffName: cleaning.staffName }
        : null;

    const data = {
      propertyId,
      bookingId: booking.id,
      guestName: booking.guestName,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      minibarJson: JSON.stringify(lines),
      minibarTotal: total,
      minibarCheckedAt: check?.checkedAt ?? null,
      signalementsJson: JSON.stringify(signalementsJson),
      signalementsCount: signalementsJson.length,
      cleaningValidatedAt: cleaningProof?.endedAt ?? null,
      cleaningStaffName: cleaningProof?.staffName ?? null,
      departedAt: departure?.departedAt ?? null,
      restockPending: !!restock,
    };

    const existing = await db.checkoutReport.findUnique({
      where: { propertyId_bookingId: { propertyId, bookingId: booking.id } },
      select: { id: true, minibarTotal: true, signalementsCount: true },
    });

    if (existing) {
      await db.checkoutReport.update({ where: { id: existing.id }, data });
      return existing.id;
    }

    const created = await db.checkoutReport.create({ data, select: { id: true } });

    // 7) Première génération → notification hôte (cloche + email + push
    //    selon préférences, type 'checkout_report'). Fire-and-forget.
    void notifyCheckoutReport(propertyId, {
      id: created.id,
      guestName: booking.guestName,
      lines,
      total,
      signalements: signalementsJson,
      cleaning: cleaningProof,
      departedAt: departure?.departedAt ?? null,
    }).catch(() => undefined);

    return created.id;
  } catch (error) {
    await captureError('checkout-report.upsert', error);
    return null;
  }
}

/** Notifie l'hôte qu'un rapport de check-out est prêt (résumé net). */
async function notifyCheckoutReport(
  propertyId: string,
  report: {
    id: string;
    guestName: string | null;
    lines: ReportMinibarLine[];
    total: number;
    signalements: ReportSignalement[];
    cleaning: { endedAt: Date; staffName: string | null } | null;
    departedAt: Date | null;
  },
): Promise<void> {
  try {
    const property = await db.property.findUnique({
      where: { id: propertyId },
      select: { name: true },
    });
    if (!property) return;

    const eur = (v: number) =>
      v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
    const hhmm = (d: Date) =>
      d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    const minibarTxt = report.lines.length
      ? report.lines.map((l) => `${l.emoji} ${l.qty} ${l.name}`).join(', ') +
        ` — ${eur(report.total)}`
      : 'aucune';
    const signalementsTxt = report.signalements.length
      ? `${report.signalements.length} signalement(s)`
      : 'aucun';
    const cleaningTxt = report.cleaning
      ? `validée à ${hhmm(report.cleaning.endedAt)}`
      : 'en attente';

    const audience = await propertyOwnerAndManagers(propertyId);
    const title = `📋 Rapport de check-out — ${property.name}`;
    const body =
      `${report.guestName ? `${report.guestName} — ` : ''}` +
      `Consommations minibar : ${minibarTxt}. Signalements : ${signalementsTxt}. ` +
      `Preuve ménage : ${cleaningTxt}.`;
    if (audience.length === 0) return;
    await sendNotificationToMany(audience, 'checkout_report', {
      title,
      body,
      propertyId,
      propertyName: property.name,
      url: '/airbnb/guest-experience',
      meta: {
        source: 'auto',
        kind: 'checkout_report',
        checkoutReportId: report.id,
      },
    });
  } catch (error) {
    await captureError('checkout-report.notify', error);
  }
}

/**
 * Génération PARESSEUSE : crée les rapports manquants des séjours dont
 * la fin EFFECTIVE est passée (compte à rebours expiré), plafonné à
 * `max` séjours par appel (budget DB du GET dashboard).
 * Retourne le nombre de rapports créés.
 */
export async function generateMissingCheckoutReports(
  propertyId: string,
  max = 5,
): Promise<number> {
  try {
    const now = new Date();
    const bookings = await db.booking.findMany({
      where: {
        propertyId,
        status: { notIn: ['CANCELLED'] },
        checkOut: { lte: now }, // fini (au plus tard hier soir → départ passé)
      },
      orderBy: { checkOut: 'desc' },
      take: 60,
      select: {
        id: true,
        guestName: true,
        checkIn: true,
        checkOut: true,
        lateCheckOutUntil: true,
      },
    });

    let created = 0;
    for (const booking of bookings) {
      if (created >= max) break;
      const stayEnd = bookingStayEnd(booking);
      if (stayEnd.getTime() > now.getTime()) continue; // compte à rebours en cours
      const existing = await db.checkoutReport.findUnique({
        where: { propertyId_bookingId: { propertyId, bookingId: booking.id } },
        select: { id: true },
      });
      if (existing) continue;
      await upsertCheckoutReport(propertyId, booking);
      created += 1;
    }
    return created;
  } catch (error) {
    await captureError('checkout-report.generate-missing', error);
    return 0;
  }
}

/**
 * Rafraîchit le rapport d'un séjour précis (call sites : départ confirmé,
 * validation ménage, consommation). Ne-throw jamais, silencieux si le
 * booking est introuvable.
 */
export async function refreshCheckoutReportForBooking(
  propertyId: string,
  bookingId: string | null | undefined,
): Promise<void> {
  if (!bookingId) return;
  try {
    const booking = await db.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        guestName: true,
        checkIn: true,
        checkOut: true,
        lateCheckOutUntil: true,
      },
    });
    if (!booking || booking.checkIn > new Date()) return; // séjour à venir : rien à rapporter
    await upsertCheckoutReport(propertyId, booking);
  } catch (error) {
    await captureError('checkout-report.refresh', error);
  }
}
