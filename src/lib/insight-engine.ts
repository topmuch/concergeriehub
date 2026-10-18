// =============================================================
// COACH ROOMSCAN (v5.4) — MOTEUR D'INTELLIGENCE DÉCISIONNELLE
// =============================================================
// Analyse les données RÉELLES d'un bien (séjours, stocks, avis,
// commandes, ménage, comportement invité) et génère des conseils
// actionnables, scorés par priorité (0-100).
//
// 4 niveaux de détection :
//   N1 Urgences critiques      → conflit ménage-arrivée, rupture stock,
//                                dégâts non traités, réassorts en attente
//   N2 Opportunités de revenus → gros consommateurs, séjours longs sans
//                                commande, météo, départs tardifs
//   N3 Amélioration continue   → patterns négatifs récurrents, invité
//                                mécontent, timing de demande d'avis
//   N4 Prédictions             → risque d'annulation, VIP, optimisation
//                                ménage, produit star, saisonnalité
//
// Le moteur est PUR (aucune écriture, aucune notification) : l'API
// route /api/airbnb/insights persiste le top 10 et notifie les
// insights CRITICAL via sendNotificationToMany.
// =============================================================

import { db } from '@/lib/db';

// -------------------------------------------------------------
// Types publics
// -------------------------------------------------------------

export type InsightType =
  | 'STOCK'
  | 'REVENUE'
  | 'REVIEW'
  | 'UPSELL'
  | 'OPERATION'
  | 'QUALITY'
  | 'BEHAVIOR';

export type InsightPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface Insight {
  type: InsightType;
  priority: InsightPriority;
  /** Calculé par calculatePriority() (0-100). */
  score: number;
  title: string;
  message: string;
  actionLabel: string;
  /** Chemin RELATIF de la page d'action (deep-link cloche/push). */
  actionUrl: string;
  /** Expire sous 24 h si true (opportunités / urgences horaires). */
  timeSensitive?: boolean;
  /** Revenu additionnel estimé en € (impacte le score). */
  revenueImpact?: number;
  riskLevel?: 'HIGH' | 'MEDIUM' | 'LOW';
}

export const INSIGHT_TYPES: InsightType[] = [
  'STOCK',
  'REVENUE',
  'REVIEW',
  'UPSELL',
  'OPERATION',
  'QUALITY',
  'BEHAVIOR',
];

// -------------------------------------------------------------
// Formes allégées des lignes DB (selects ciblés)
// -------------------------------------------------------------

interface BookingLite {
  id: string;
  guestName: string;
  guestEmail: string | null;
  checkIn: Date;
  checkOut: Date;
  guests: number;
  status: string;
  cleaningStatus: string;
  lateCheckoutStatus: string | null;
  lateCheckOutUntil: Date | null;
  createdAt: Date;
}

interface MinibarOrderLite {
  id: string;
  bookingId: string | null;
  guestName: string | null;
  itemsJson: string;
  totalEur: number;
  status: string;
  createdAt: Date;
}

interface ServiceOrderLite {
  id: string;
  bookingId: string | null;
  guestName: string;
  guestEmail: string | null;
  totalAmount: number;
  status: string;
  paymentStatus: string;
  createdAt: Date;
}

interface LaundryOrderLite {
  id: string;
  bookingId: string | null;
  guestEmail: string | null;
  serviceType: string;
  amountEur: number;
  status: string;
  createdAt: Date;
}

interface SouvenirOrderLite {
  id: string;
  bookingId: string | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  status: string;
  createdAt: Date;
}

interface InventoryAlertLite {
  id: string;
  item: string;
  status: string;
  note: string | null;
  reportedBy: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
}

interface ProductLite {
  id: string;
  name: string;
  currentStock: number;
  minStockThreshold: number;
  isOnShoppingList: boolean;
}

interface CleaningReportLite {
  id: string;
  staffName: string | null;
  createdAt: Date;
}

interface InspectionLite {
  id: string;
  guestName: string;
  type: string;
  entranceStatus: string;
  kitchenStatus: string;
  livingRoomStatus: string;
  bedroomsStatus: string;
  bathroomStatus: string;
  damages: string | null;
  issues: string | null;
  status: string;
  resolvedAt: Date | null;
  createdAt: Date;
}

interface MemoryLite {
  id: string;
  bookingId: string | null;
  guestName: string;
  guestEmail: string | null;
  rating: number;
  message: string | null;
  createdAt: Date;
}

interface FeedbackLite {
  id: string;
  bookingId: string | null;
  guestName: string | null;
  rating: number;
  comment: string | null;
  isResolved: boolean;
  createdAt: Date;
}

interface ComplaintLite {
  id: string;
  category: string;
  description: string;
  isUrgent: boolean;
  status: string;
  guestName: string | null;
  createdAt: Date;
}

interface RestockLite {
  id: string;
  guestName: string | null;
  status: string;
  createdAt: Date;
}

interface MiddleStayLite {
  id: string;
  guestName: string;
  requestType: string;
  details: string | null;
  status: string;
  createdAt: Date;
}

interface GuestSessionLite {
  id: string;
  bookingId: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

interface PropertyLite {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  premiumFeatures: unknown;
}

export interface PropertyData {
  property: PropertyLite;
  bookings: BookingLite[];
  minibarOrders: MinibarOrderLite[];
  serviceOrders: ServiceOrderLite[];
  laundryOrders: LaundryOrderLite[];
  souvenirOrders: SouvenirOrderLite[];
  inventoryAlerts: InventoryAlertLite[];
  products: ProductLite[];
  cleaningReports: CleaningReportLite[];
  inspections: InspectionLite[];
  memories: MemoryLite[];
  privateFeedbacks: FeedbackLite[];
  complaints: ComplaintLite[];
  restockRequests: RestockLite[];
  middleStayRequests: MiddleStayLite[];
  guestSessions: GuestSessionLite[];
}

// -------------------------------------------------------------
// Constantes
// -------------------------------------------------------------

const HOUR = 3_600_000;
const DAY = 86_400_000;
const WINDOW_90D = 90 * DAY;
const WINDOW_30D = 30 * DAY;

/** Postes de stock suivis par l'équipe (libellés fr). */
const ITEM_LABELS: Record<string, string> = {
  serviettes: 'serviettes',
  papier_toilette: 'papier toilette',
  savon_shampooing: 'savon / shampooing',
  capsules_cafe: 'capsules de café',
};

/** Mots-clés négatifs cherchés dans les avis & souvenirs. */
const NEGATIVE_KEYWORDS = [
  'bruit',
  'froid',
  'douche',
  'wifi',
  'propret',
  'odeur',
  'chauffage',
  'matelas',
  'voisin',
  'casseroles',
];

// -------------------------------------------------------------
// Fonction principale
// -------------------------------------------------------------

export async function generateInsights(propertyId: string): Promise<Insight[]> {
  const data = await fetchPropertyData(propertyId);
  const insights: Insight[] = [];

  // ── NIVEAU 1 : Alertes critiques ──
  insights.push(...detectCheckInCleaningConflict(data));
  insights.push(...detectStockRupture(data));
  insights.push(...detectUnresolvedDamage(data));
  insights.push(...detectPendingRestock(data));

  // ── NIVEAU 2 : Opportunités de revenus ──
  insights.push(...detectHighSpender(data));
  insights.push(...detectLongStayNoOrder(data));
  insights.push(...(await detectWeatherOpportunity(data)));
  insights.push(...detectLateCheckoutOpportunity(data));

  // ── NIVEAU 3 : Amélioration continue ──
  insights.push(...detectNegativePattern(data));
  insights.push(...detectUnhappyGuest(data));
  insights.push(...detectReviewTiming(data));

  // ── NIVEAU 4 : Prédictions comportementales ──
  insights.push(...detectCancellationRisk(data));
  insights.push(...detectVIPGuest(data));
  insights.push(...detectCleaningOptimization(data));
  insights.push(...detectPopularProduct(data));
  insights.push(...detectSeasonality(data));

  // Scorer et trier (décroissant).
  return insights
    .map((i) => ({ ...i, score: calculatePriority(i) }))
    .sort((a, b) => b.score - a.score);
}

// -------------------------------------------------------------
// DÉTECTEURS — NIVEAU 1 : alertes critiques
// -------------------------------------------------------------

/** 1. Arrivée sous 3 h alors que le ménage du séjour n'est pas fait. */
function detectCheckInCleaningConflict(data: PropertyData): Insight[] {
  const now = new Date();
  const in3Hours = new Date(now.getTime() + 3 * HOUR);
  const insights: Insight[] = [];

  const upcoming = data.bookings.filter(
    (b) =>
      b.status !== 'CANCELLED' &&
      b.checkIn >= now &&
      b.checkIn <= in3Hours,
  );

  for (const booking of upcoming) {
    if (booking.cleaningStatus !== 'PENDING') continue;
    const hoursLeft = Math.max(
      0,
      Math.round((booking.checkIn.getTime() - now.getTime()) / HOUR),
    );
    const hhmm = booking.checkIn.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    insights.push({
      type: 'OPERATION',
      priority: 'CRITICAL',
      score: 95,
      title: 'Conflit ménage-arrivée',
      message: `${booking.guestName} arrive à ${hhmm} mais le ménage n'est pas encore validé. Il reste environ ${hoursLeft} h — relancez l'équipe ou prévenez l'invité d'un léger retard.`,
      actionLabel: "Relancer l'équipe",
      actionUrl: '/airbnb/menage',
      timeSensitive: true,
      riskLevel: 'HIGH',
    });
  }
  return insights;
}

/** 2. Signalements stock « bas / épuisé » non résolus + arrivées sous 7 j. */
function detectStockRupture(data: PropertyData): Insight[] {
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * DAY);
  const insights: Insight[] = [];

  const upcoming = data.bookings.filter(
    (b) => b.status !== 'CANCELLED' && b.checkIn <= in7Days && b.checkOut >= now,
  );
  if (upcoming.length === 0) return insights;

  const openAlerts = data.inventoryAlerts.filter(
    (a) => !a.resolvedAt && (a.status === 'low' || a.status === 'empty'),
  );

  // 1 seul insight par poste de stock (le plus urgent : empty > low,
  // puis le plus récent) — jamais de doublon « capsules de café » ×2.
  const worstByItem = new Map<string, InventoryAlertLite>();
  for (const alert of openAlerts) {
    const current = worstByItem.get(alert.item);
    const worse =
      !current ||
      (alert.status === 'empty' && current.status !== 'empty') ||
      (alert.status === current.status && alert.createdAt > current.createdAt);
    if (worse) worstByItem.set(alert.item, alert);
  }

  for (const alert of [...worstByItem.values()].slice(0, 3)) {
    const label = ITEM_LABELS[alert.item] ?? alert.item;
    const isUrgent = alert.status === 'empty';
    // Estimation simple des besoins à venir.
    let needs = '';
    if (alert.item === 'serviettes') {
      const towels = upcoming.reduce((s, b) => s + b.guests * 4, 0);
      needs = ` Besoin estimé : ${towels} serviettes.`;
    } else if (alert.item === 'capsules_cafe') {
      const nights = upcoming.reduce(
        (s, b) => s + Math.max(1, Math.ceil((b.checkOut.getTime() - b.checkIn.getTime()) / DAY)),
        0,
      );
      needs = ` Besoin estimé : ${nights * 10} capsules (10 / jour).`;
    }
    insights.push({
      type: 'STOCK',
      priority: isUrgent ? 'HIGH' : 'MEDIUM',
      score: isUrgent ? 80 : 60,
      title: isUrgent ? `Stock épuisé : ${label}` : `Stock bas : ${label}`,
      message: `L'équipe a signalé ${alert.status === 'empty' ? 'une RUPTURE' : 'un stock bas'} de ${label}${
        alert.reportedBy ? ` (${alert.reportedBy})` : ''
      }. ${upcoming.length} séjour(s) à venir sous 7 jours.${needs}`,
      actionLabel: 'Voir le ménage & les stocks',
      actionUrl: '/airbnb/menage',
      riskLevel: isUrgent ? 'HIGH' : 'MEDIUM',
      timeSensitive: true,
    });
  }
  return insights;
}

/** 3. Dégâts constatés (EDL signé / SOS casse) jamais traités. */
function detectUnresolvedDamage(data: PropertyData): Insight[] {
  const insights: Insight[] = [];

  const damagedInspections = data.inspections.filter((i) => {
    if (i.status === 'resolved' || i.resolvedAt) return false;
    const roomDamaged =
      i.entranceStatus === 'damaged' ||
      i.kitchenStatus === 'damaged' ||
      i.livingRoomStatus === 'damaged' ||
      i.bedroomsStatus === 'damaged' ||
      i.bathroomStatus === 'damaged';
    return roomDamaged || (i.damages && i.damages.trim().length > 0);
  });

  for (const insp of damagedInspections.slice(0, 2)) {
    insights.push({
      type: 'QUALITY',
      priority: 'HIGH',
      score: 78,
      title: 'Dégâts non traités',
      message: `L'état des lieux de ${insp.guestName} (${insp.type === 'checkin' ? 'entrée' : 'sortie'}) signale des dégâts${insp.damages ? ` : « ${insp.damages.slice(0, 140)} »` : ''}. Traitez-le avant la prochaine arrivée pour éviter un litige.`,
      actionLabel: "Voir l'état des lieux",
      actionUrl: '/airbnb/guest-experience',
      riskLevel: 'HIGH',
      timeSensitive: true,
    });
  }

  const openBreakage = data.complaints.filter(
    (c) => c.status === 'OPEN' && c.category === 'BREAKAGE',
  );
  if (openBreakage.length > 0) {
    const c = openBreakage[0];
    insights.push({
      type: 'QUALITY',
      priority: 'HIGH',
      score: 74,
      title: 'Casse signalée non résolue',
      message: `${c.guestName ?? 'Un invité'} a signalé une casse${c.description ? ` : « ${c.description.slice(0, 140)} »` : ''}. Fiche assurance disponible dans les messages — à traiter rapidement.`,
      actionLabel: 'Voir le signalement',
      actionUrl: '/airbnb/messages',
      riskLevel: 'HIGH',
      timeSensitive: true,
    });
  }
  return insights;
}

/** 4. Demandes « Recharger le frigo » / middle-stay en attente. */
function detectPendingRestock(data: PropertyData): Insight[] {
  const insights: Insight[] = [];

  const pending = data.restockRequests.filter((r) => r.status === 'PENDING');
  if (pending.length > 0) {
    const r = pending[0];
    insights.push({
      type: 'OPERATION',
      priority: 'HIGH',
      score: 72,
      title: 'Réassort minibar demandé',
      message: `${r.guestName ?? 'Un invité'} a demandé un réassort du minibar${pending.length > 1 ? ` (+${pending.length - 1} autre(s) demande(s))` : ''}. Prévoyez le réapprovisionnement lors du prochain passage de l'équipe.`,
      actionLabel: 'Traiter la demande',
      actionUrl: '/airbnb/concierge',
      timeSensitive: true,
      riskLevel: 'MEDIUM',
    });
  }

  const middleStay = data.middleStayRequests.filter(
    (m) => m.status === 'pending' || m.status === 'in_progress',
  );
  if (middleStay.length > 0) {
    const m = middleStay[0];
    insights.push({
      type: 'OPERATION',
      priority: 'MEDIUM',
      score: 58,
      title: m.requestType === 'cleaning' ? 'Ménage en cours de séjour demandé' : 'Réassort en cours de séjour demandé',
      message: `${m.guestName} a demandé ${m.requestType === 'cleaning' ? 'un ménage' : 'un réassort'}${m.details ? ` : « ${m.details.slice(0, 120)} »` : ''}. Les séjours longs bien suivis génèrent de meilleurs avis.`,
      actionLabel: 'Voir la demande',
      actionUrl: '/airbnb/orders',
      timeSensitive: true,
      riskLevel: 'MEDIUM',
    });
  }
  return insights;
}

// -------------------------------------------------------------
// DÉTECTEURS — NIVEAU 2 : opportunités de revenus
// -------------------------------------------------------------

/** 5. Gros consommateur qui arrive aujourd'hui → upsell ciblé. */
function detectHighSpender(data: PropertyData): Insight[] {
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const insights: Insight[] = [];

  const emailOfBooking = new Map<string, string>();
  for (const b of data.bookings) {
    if (b.guestEmail) emailOfBooking.set(b.id, b.guestEmail.toLowerCase());
  }
  const spentByEmail = new Map<string, number>();
  const addSpend = (email: string | null | undefined, amount: number, before: Date) => {
    if (!email || amount <= 0) return;
    const key = email.toLowerCase();
    // Seules les commandes ANTÉRIEURES à aujourd'hui comptent (historique).
    if (before >= startOfDay) return;
    spentByEmail.set(key, (spentByEmail.get(key) ?? 0) + amount);
  };

  for (const o of data.minibarOrders) {
    if (o.status !== 'PAID') continue;
    addSpend(o.bookingId ? emailOfBooking.get(o.bookingId) : null, o.totalEur, o.createdAt);
  }
  for (const o of data.serviceOrders) {
    if (o.paymentStatus !== 'PAID') continue;
    addSpend(o.guestEmail, o.totalAmount, o.createdAt);
  }
  for (const o of data.laundryOrders) {
    if (o.status !== 'PAID') continue;
    addSpend(o.guestEmail, o.amountEur, o.createdAt);
  }

  const todayCheckIns = data.bookings.filter(
    (b) =>
      b.status !== 'CANCELLED' &&
      b.checkIn >= startOfDay &&
      b.checkIn < new Date(startOfDay.getTime() + DAY),
  );

  for (const booking of todayCheckIns) {
    const email = booking.guestEmail?.toLowerCase();
    if (!email) continue;
    const totalSpent = spentByEmail.get(email) ?? 0;
    if (totalSpent > 100) {
      insights.push({
        type: 'UPSELL',
        priority: 'MEDIUM',
        score: 70,
        title: 'Client gros consommateur détecté',
        message: `${booking.guestName} a dépensé ${eur(totalSpent)} en services lors de ses séjours précédents. C'est le moment de proposer le petit-déjeuner, le pressing express ou une excursion — activez les Smart Prompts.`,
        actionLabel: 'Programmer le Smart Prompt',
        actionUrl: '/airbnb/concierge',
        revenueImpact: 50,
        riskLevel: 'LOW',
        timeSensitive: true,
      });
    }
  }
  return insights;
}

/** 6. Séjour en cours ≥ 5 nuits sans AUCUNE commande → proposer. */
function detectLongStayNoOrder(data: PropertyData): Insight[] {
  const now = new Date();
  const insights: Insight[] = [];

  const currentStays = data.bookings.filter(
    (b) => b.status !== 'CANCELLED' && b.checkIn <= now && b.checkOut > now,
  );

  for (const booking of currentStays) {
    const nightsElapsed = Math.floor((now.getTime() - booking.checkIn.getTime()) / DAY);
    if (nightsElapsed < 5) continue;

    const hasMinibar = data.minibarOrders.some(
      (o) => o.bookingId === booking.id || (o.createdAt >= booking.checkIn && o.createdAt <= now),
    );
    const hasLaundry = data.laundryOrders.some(
      (o) => o.bookingId === booking.id || (booking.guestEmail && o.guestEmail?.toLowerCase() === booking.guestEmail.toLowerCase()),
    );
    const hasService = data.serviceOrders.some(
      (o) => o.bookingId === booking.id || (booking.guestEmail && o.guestEmail?.toLowerCase() === booking.guestEmail.toLowerCase()),
    );
    const hasSouvenir = data.souvenirOrders.some((o) => o.bookingId === booking.id);
    const hasMiddleStay = data.middleStayRequests.some((m) => m.createdAt >= booking.checkIn);

    if (!hasMinibar && !hasLaundry && !hasService && !hasSouvenir && !hasMiddleStay) {
      insights.push({
        type: 'UPSELL',
        priority: 'MEDIUM',
        score: 62,
        title: 'Long séjour sans aucune commande',
        message: `${booking.guestName} est présent depuis ${nightsElapsed} nuits sans avoir rien commandé. Un Smart Prompt au bon moment (petit-déjeuner, dîner, pressing) génère en moyenne 25-40 € de revenu additionnel par séjour.`,
        actionLabel: 'Programmer le Smart Prompt',
        actionUrl: '/airbnb/concierge',
        revenueImpact: 35,
        riskLevel: 'LOW',
        timeSensitive: true,
      });
      break; // 1 conseil suffit par génération
    }
  }
  return insights;
}

/** 7. Météo de demain → Smart Prompt opportun (non bloquant). */
async function detectWeatherOpportunity(data: PropertyData): Promise<Insight[]> {
  const { latitude, longitude } = data.property;
  if (latitude == null || longitude == null) return [];

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=weather_code,temperature_2m_max&forecast_days=2&timezone=auto`;
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    clearTimeout(timer);
    if (!res.ok) return [];
    const json = (await res.json()) as {
      daily?: { weather_code?: number[]; temperature_2m_max?: number[] };
    };
    const code = json.daily?.weather_code?.[1];
    const tMax = json.daily?.temperature_2m_max?.[1];
    if (typeof code !== 'number' || typeof tMax !== 'number') return [];

    const isSunny = code <= 2 && tMax >= 24;
    const isRainy = (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
    const tMaxTxt = `${Math.round(tMax)}°C`;

    if (isSunny) {
      return [
        {
          type: 'REVENUE',
          priority: 'LOW',
          score: 40,
          title: `Belle journée demain (${tMaxTxt})`,
          message: `Demain s'annonce ensoleillé (${tMaxTxt}). Proposez le petit-déjeuner en terrasse, un apéro local ou une box pique-nique via un Smart Prompt — les commandes « plein soleil » convertissent 2× mieux.`,
          actionLabel: 'Programmer le Smart Prompt',
          actionUrl: '/airbnb/concierge',
          revenueImpact: 25,
          timeSensitive: true,
          riskLevel: 'LOW',
        },
      ];
    }
    if (isRainy) {
      return [
        {
          type: 'REVENUE',
          priority: 'LOW',
          score: 38,
          title: 'Pluie demain — offre cocooning',
          message: `Demain sera pluvieux. C'est le jour idéal pour proposer un petit-déjeuner en chambre, un pressing gratuit de bienvenue ou la boutique de souvenirs — vos invités resteront au logement.`,
          actionLabel: 'Programmer le Smart Prompt',
          actionUrl: '/airbnb/concierge',
          revenueImpact: 20,
          timeSensitive: true,
          riskLevel: 'LOW',
        },
      ];
    }
    return [];
  } catch {
    // Météo indisponible (timeout / réseau) → aucun insight. Jamais bloquant.
    return [];
  }
}

/** 8. Départs sous 48 h sans départ tardif → le proposer. */
function detectLateCheckoutOpportunity(data: PropertyData): Insight[] {
  const now = new Date();
  const in48h = new Date(now.getTime() + 2 * DAY);
  const insights: Insight[] = [];

  const premium = (data.property.premiumFeatures ?? null) as
    | { enableLateCheckout?: boolean; lateCheckoutPrice?: number }
    | null;
  const price = typeof premium?.lateCheckoutPrice === 'number' ? premium.lateCheckoutPrice : 20;

  const departures = data.bookings.filter(
    (b) =>
      b.status !== 'CANCELLED' &&
      b.checkOut > now &&
      b.checkOut <= in48h &&
      !b.lateCheckOutUntil &&
      b.lateCheckoutStatus !== 'PAID',
  );

  if (departures.length > 0) {
    const b = departures[0];
    insights.push({
      type: 'REVENUE',
      priority: 'MEDIUM',
      score: 66,
      title: 'Départ tardif à proposer',
      message: `${departures.length} séjour(s) se termine(nt) sous 48 h sans départ tardif validé. ${b.guestName} part le ${b.checkOut.toLocaleDateString('fr-FR')} — proposez le départ tardif (${eur(price)}) depuis son Hub : revenu net, zéro travail.`,
      actionLabel: 'Voir le calendrier',
      actionUrl: '/airbnb/calendar',
      revenueImpact: price,
      timeSensitive: true,
      riskLevel: 'LOW',
    });
  }
  return insights;
}

// -------------------------------------------------------------
// DÉTECTEURS — NIVEAU 3 : amélioration continue
// -------------------------------------------------------------

/** 9. Mot-clé négatif récurrent dans les avis / souvenirs (90 j). */
function detectNegativePattern(data: PropertyData): Insight[] {
  const insights: Insight[] = [];
  const keywordCounts = new Map<string, number>();

  const collect = (text: string | null | undefined) => {
    if (!text) return;
    const lower = text.toLowerCase();
    for (const keyword of NEGATIVE_KEYWORDS) {
      if (lower.includes(keyword)) {
        keywordCounts.set(keyword, (keywordCounts.get(keyword) ?? 0) + 1);
      }
    }
  };

  for (const m of data.memories) if (m.rating <= 3) collect(m.message);
  for (const f of data.privateFeedbacks) if (f.rating <= 2) collect(f.comment);

  const top = [...keywordCounts.entries()].sort(([, a], [, b]) => b - a)[0];
  if (top && top[1] >= 2) {
    insights.push({
      type: 'QUALITY',
      priority: 'HIGH',
      score: 75,
      title: 'Pattern négatif récurrent',
      message: `Le mot « ${top[0]} » est apparu ${top[1]} fois dans les avis négatifs récents. Vérifiez ce point avant le prochain check-in — c'est la cause n°1 des mauvaises notes évitables.`,
      actionLabel: 'Voir les avis',
      actionUrl: '/airbnb/guest-experience',
      riskLevel: 'HIGH',
    });
  }
  return insights;
}

/** 10. Invité en séjour qui a signalé un problème ouvert. */
function detectUnhappyGuest(data: PropertyData): Insight[] {
  const now = new Date();
  const insights: Insight[] = [];

  const currentStays = data.bookings.filter(
    (b) => b.status !== 'CANCELLED' && b.checkIn <= now && b.checkOut > now,
  );
  if (currentStays.length === 0) return insights;

  const openComplaints = data.complaints.filter((c) => c.status === 'OPEN' && c.category !== 'BREAKAGE');
  for (const complaint of openComplaints) {
    const duringStay = currentStays.some(
      (b) => complaint.createdAt >= b.checkIn && complaint.createdAt <= b.checkOut,
    );
    if (!duringStay) continue;
    insights.push({
      type: 'QUALITY',
      priority: complaint.isUrgent ? 'CRITICAL' : 'HIGH',
      score: complaint.isUrgent ? 90 : 76,
      title: complaint.isUrgent ? 'Invité mécontent — problème URGENT' : 'Invité mécontent en cours de séjour',
      message: `${complaint.guestName ?? 'Un invité'} a signalé ${complaint.description ? `« ${complaint.description.slice(0, 140)} »` : 'un problème'} pendant son séjour. Un problème résolu en moins de 2 h évite 90 % des mauvais avis.`,
      actionLabel: 'Répondre maintenant',
      actionUrl: '/airbnb/messages',
      riskLevel: 'HIGH',
      timeSensitive: true,
    });
    break;
  }

  // Avis privé très négatif déposé PENDANT un séjour en cours.
  const badInStay = data.privateFeedbacks.find(
    (f) => f.rating <= 2 && !f.isResolved && currentStays.some((b) => f.bookingId === b.id),
  );
  if (badInStay) {
    insights.push({
      type: 'REVIEW',
      priority: 'HIGH',
      score: 82,
      title: 'Avis privé négatif pendant le séjour',
      message: `${badInStay.guestName ?? 'Votre invité actuel'} a laissé une note de ${badInStay.rating}/5${badInStay.comment ? ` : « ${badInStay.comment.slice(0, 140)} »` : ''}. Intervenez MAINTENANT pour redresser le séjour avant le départ — le Bouclier d'avis transformera l'essai.`,
      actionLabel: 'Voir le retour privé',
      actionUrl: '/airbnb/guest-experience',
      riskLevel: 'HIGH',
      timeSensitive: true,
    });
  }
  return insights;
}

/** 11. Départ il y a 2-7 j sans aucun avis recueilli → relancer. */
function detectReviewTiming(data: PropertyData): Insight[] {
  const now = new Date();
  const insights: Insight[] = [];

  const recent = data.bookings.filter((b) => {
    if (b.status === 'CANCELLED') return false;
    const days = (now.getTime() - b.checkOut.getTime()) / DAY;
    return days >= 2 && days <= 7;
  });

  for (const booking of recent) {
    const hasFeedback = data.privateFeedbacks.some((f) => f.bookingId === booking.id);
    const hasMemory = data.memories.some((m) => m.bookingId === booking.id);
    if (!hasFeedback && !hasMemory) {
      insights.push({
        type: 'REVIEW',
        priority: 'MEDIUM',
        score: 55,
        title: "Avis non sollicité — c'est le moment",
        message: `${booking.guestName} est parti depuis ${Math.floor((now.getTime() - booking.checkOut.getTime()) / DAY)} jours sans laisser d'avis. Le taux de réponse est 3× supérieur dans les 7 jours qui suivent le départ — relancez-le.`,
        actionLabel: 'Voir le séjour',
        actionUrl: '/airbnb/guests',
        riskLevel: 'LOW',
      });
      break;
    }
  }
  return insights;
}

// -------------------------------------------------------------
// DÉTECTEURS — NIVEAU 4 : prédictions comportementales
// -------------------------------------------------------------

/** 12. Arrivée sous 48 h et le hub n'a jamais été ouvert → risque. */
function detectCancellationRisk(data: PropertyData): Insight[] {
  const now = new Date();
  const in48h = new Date(now.getTime() + 2 * DAY);
  const insights: Insight[] = [];

  const upcoming = data.bookings.filter(
    (b) => b.status !== 'CANCELLED' && b.checkIn > now && b.checkIn <= in48h,
  );

  for (const booking of upcoming) {
    const openedHub = data.guestSessions.some(
      (s) => s.bookingId === booking.id || s.lastSeenAt >= booking.createdAt,
    );
    if (!openedHub && booking.createdAt <= new Date(now.getTime() - 12 * HOUR)) {
      const hhmm = booking.checkIn.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      });
      insights.push({
        type: 'BEHAVIOR',
        priority: 'MEDIUM',
        score: 57,
        title: "L'invité n'a pas encore ouvert son Hub",
        message: `${booking.guestName} arrive demain (${hhmm}) mais n'a jamais ouvert le Hub ni vérifié son code d'accès. Un message de bienvenue avec le code réduit fortement les frictions à l'arrivée (et les annulations de dernière minute).`,
        actionLabel: 'Voir la réservation',
        actionUrl: '/airbnb/calendar',
        riskLevel: 'MEDIUM',
        timeSensitive: true,
      });
      break;
    }
  }
  return insights;
}

/** 13. Fidèle à fort panier + excellentes notes → VIP à chouchouter. */
function detectVIPGuest(data: PropertyData): Insight[] {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const insights: Insight[] = [];

  const emailOfBooking = new Map<string, string>();
  for (const b of data.bookings) {
    if (b.guestEmail) emailOfBooking.set(b.id, b.guestEmail.toLowerCase());
  }

  const todayCheckIns = data.bookings.filter(
    (b) =>
      b.status !== 'CANCELLED' &&
      b.guestEmail &&
      b.checkIn >= startOfDay &&
      b.checkIn < new Date(startOfDay.getTime() + DAY),
  );

  for (const booking of todayCheckIns) {
    const email = booking.guestEmail!.toLowerCase();

    const pastStays = data.bookings.filter(
      (b) => b.guestEmail?.toLowerCase() === email && b.checkOut < now,
    ).length;

    let totalSpent = 0;
    for (const o of data.minibarOrders) {
      if (o.status === 'PAID' && o.bookingId && emailOfBooking.get(o.bookingId) === email) {
        totalSpent += o.totalEur;
      }
    }
    for (const o of data.serviceOrders) {
      if (o.paymentStatus === 'PAID' && o.guestEmail?.toLowerCase() === email) totalSpent += o.totalAmount;
    }
    for (const o of data.laundryOrders) {
      if (o.status === 'PAID' && o.guestEmail?.toLowerCase() === email) totalSpent += o.amountEur;
    }

    const guestMemories = data.memories.filter((m) => m.guestEmail?.toLowerCase() === email);
    const avgRating =
      guestMemories.length > 0
        ? guestMemories.reduce((s, m) => s + m.rating, 0) / guestMemories.length
        : 0;

    if (pastStays >= 3 && totalSpent > 200 && avgRating >= 4.5) {
      insights.push({
        type: 'BEHAVIOR',
        priority: 'MEDIUM',
        score: 65,
        title: 'Cliente VIP à chouchouter',
        message: `${booking.guestName} revient pour la ${pastStays + 1}ᵉ fois (${eur(totalSpent)} dépensés, note moyenne ${avgRating.toFixed(1)}/5). Offrez-lui un accueil personnalisé ou un produit du minibar en cadeau — la fidélité vaut de l'or.`,
        actionLabel: 'Voir le minibar',
        actionUrl: '/airbnb/concierge',
        revenueImpact: 30,
        riskLevel: 'LOW',
        timeSensitive: true,
      });
    }
  }
  return insights;
}

/** 14. Rotations serrées à venir (< 3 h entre départ et arrivée). */
function detectCleaningOptimization(data: PropertyData): Insight[] {
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * DAY);
  const insights: Insight[] = [];

  const relevant = data.bookings.filter(
    (b) => b.status !== 'CANCELLED' && b.checkOut >= now && b.checkOut <= in7Days,
  );

  for (const out of relevant) {
    const sameDay = data.bookings.find(
      (b) =>
        b.id !== out.id &&
        b.status !== 'CANCELLED' &&
        b.checkIn >= out.checkOut &&
        b.checkIn <= new Date(out.checkOut.getTime() + 3 * HOUR),
    );
    if (!sameDay) continue;
    const gapH = Math.round((sameDay.checkIn.getTime() - out.checkOut.getTime()) / HOUR);
    const tight = gapH <= 1;
    insights.push({
      type: 'OPERATION',
      priority: tight ? 'HIGH' : 'MEDIUM',
      score: tight ? 68 : 52,
      title: tight ? 'Rotation très serrée' : 'Rotation à préparer',
      message: `${out.guestName} part le ${out.checkOut.toLocaleDateString('fr-FR')} et ${sameDay.guestName} arrive seulement ${gapH} h après. Prévenez l'équipe de ménage dès maintenant${tight ? ' — le créneau est critique, prévoyez un renfort.' : '.'}`,
      actionLabel: 'Voir le planning ménage',
      actionUrl: '/airbnb/menage',
      riskLevel: tight ? 'HIGH' : 'MEDIUM',
      timeSensitive: true,
    });
    break;
  }
  return insights;
}

/** 15. Produit minibar star (30 j) + produits sous le seuil de stock. */
function detectPopularProduct(data: PropertyData): Insight[] {
  const now = new Date();
  const since30 = new Date(now.getTime() - WINDOW_30D);
  const insights: Insight[] = [];

  // a) Produits du stock (conciergerie) sous leur seuil.
  const lowProducts = data.products.filter(
    (p) => p.currentStock < p.minStockThreshold || p.isOnShoppingList,
  );
  if (lowProducts.length > 0) {
    const worst = [...lowProducts].sort((a, b) => a.currentStock - b.currentStock)[0];
    insights.push({
      type: 'STOCK',
      priority: worst.currentStock === 0 ? 'HIGH' : 'MEDIUM',
      score: worst.currentStock === 0 ? 70 : 54,
      title: worst.currentStock === 0 ? `Rupture : ${worst.name}` : `Stock bas : ${worst.name}`,
      message: `${worst.name} est${worst.currentStock === 0 ? ' ÉPUISÉ' : ` à ${worst.currentStock} unité(s) (seuil : ${worst.minStockThreshold})`}${lowProducts.length > 1 ? ` — ${lowProducts.length} produits à réapprovisionner au total` : ''}. Complétez la liste de courses avant la prochaine arrivée.`,
      actionLabel: 'Voir les produits',
      actionUrl: '/airbnb/concierge',
      riskLevel: worst.currentStock === 0 ? 'MEDIUM' : 'LOW',
    });
  }

  // b) Produit le plus consommé du minibar (30 j).
  const qtyByName = new Map<string, number>();
  for (const order of data.minibarOrders) {
    if (order.status !== 'PAID' || order.createdAt < since30) continue;
    try {
      const parsed: unknown = JSON.parse(order.itemsJson);
      if (!Array.isArray(parsed)) continue;
      for (const line of parsed) {
        const { name, qty } = line as { name?: unknown; qty?: unknown };
        if (typeof name === 'string' && typeof qty === 'number' && qty > 0) {
          qtyByName.set(name, (qtyByName.get(name) ?? 0) + qty);
        }
      }
    } catch {
      // ligne illisible → ignorée
    }
  }
  const topProduct = [...qtyByName.entries()].sort(([, a], [, b]) => b - a)[0];
  if (topProduct && topProduct[1] >= 8) {
    insights.push({
      type: 'STOCK',
      priority: 'MEDIUM',
      score: 50,
      title: `Produit star : ${topProduct[0]}`,
      message: `${topProduct[0]} est le produit le plus consommé du minibar ce mois-ci (${topProduct[1]} unités). Assurez le réassort et, si le stock suit, augmentez le prix de 0,50 € — la demande est là.`,
      actionLabel: 'Gérer le minibar',
      actionUrl: '/airbnb/concierge',
      riskLevel: 'LOW',
    });
  }
  return insights;
}

/** 16. Baisse d'occupation à 30 jours vs 30 jours précédents. */
function detectSeasonality(data: PropertyData): Insight[] {
  const now = new Date();
  const insights: Insight[] = [];

  const nightsIn = (from: Date, to: Date) =>
    data.bookings
      .filter((b) => b.status !== 'CANCELLED' && b.checkIn < to && b.checkOut > from)
      .reduce((sum, b) => {
        const start = Math.max(b.checkIn.getTime(), from.getTime());
        const end = Math.min(b.checkOut.getTime(), to.getTime());
        return sum + Math.max(0, Math.ceil((end - start) / DAY));
      }, 0);

  const next30 = nightsIn(now, new Date(now.getTime() + WINDOW_30D));
  const prev30 = nightsIn(new Date(now.getTime() - WINDOW_30D), now);

  if (prev30 >= 5 && next30 < prev30 * 0.7) {
    const drop = Math.round((1 - next30 / prev30) * 100);
    insights.push({
      type: 'REVENUE',
      priority: 'LOW',
      score: 45,
      title: `Baisse d'occupation de ${drop}%`,
      message: `Vos nuits réservées sur les 30 prochains jours (${next30}) sont en baisse de ${drop}% vs les 30 derniers (${prev30}). Lancez une offre sur votre annonce, activez les départs tardifs et proposez les services premium pour compenser.`,
      actionLabel: 'Voir le calendrier',
      actionUrl: '/airbnb/calendar',
      revenueImpact: 80,
      riskLevel: 'MEDIUM',
    });
  }
  return insights;
}

// -------------------------------------------------------------
// Scoring
// -------------------------------------------------------------

export function calculatePriority(insight: Omit<Insight, 'score'>): number {
  let score = 0;

  // Urgence temporelle
  if (insight.timeSensitive) score += 40;

  // Impact financier
  if (insight.revenueImpact && insight.revenueImpact > 50) score += 30;
  if (insight.revenueImpact && insight.revenueImpact > 100) score += 40;

  // Risque de litige
  if (insight.riskLevel === 'HIGH') score += 50;
  else if (insight.riskLevel === 'MEDIUM') score += 25;

  // Priorité explicite
  if (insight.priority === 'CRITICAL') score += 60;
  else if (insight.priority === 'HIGH') score += 40;
  else if (insight.priority === 'MEDIUM') score += 20;
  else score += 5;

  return Math.min(score, 100);
}

// -------------------------------------------------------------
// Récupération des données (90 jours glissants + à venir)
// -------------------------------------------------------------

async function fetchPropertyData(propertyId: string): Promise<PropertyData> {
  const now = new Date();
  const since90 = new Date(now.getTime() - WINDOW_90D);
  const since30 = new Date(now.getTime() - WINDOW_30D);

  const [
    property,
    bookings,
    minibarOrders,
    serviceOrders,
    laundryOrders,
    souvenirOrders,
    inventoryAlerts,
    products,
    cleaningReports,
    inspections,
    memories,
    privateFeedbacks,
    complaints,
    restockRequests,
    middleStayRequests,
    guestSessions,
  ] = await Promise.all([
    db.property.findUnique({
      where: { id: propertyId },
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        premiumFeatures: true,
      },
    }),
    db.booking.findMany({
      where: {
        propertyId,
        OR: [{ checkIn: { gte: since90 } }, { checkOut: { gte: now } }],
      },
      select: {
        id: true,
        guestName: true,
        guestEmail: true,
        checkIn: true,
        checkOut: true,
        guests: true,
        status: true,
        cleaningStatus: true,
        lateCheckoutStatus: true,
        lateCheckOutUntil: true,
        createdAt: true,
      },
      orderBy: { checkIn: 'asc' },
    }),
    db.minibarOrder.findMany({
      where: { propertyId, createdAt: { gte: since90 } },
      select: {
        id: true,
        bookingId: true,
        guestName: true,
        itemsJson: true,
        totalEur: true,
        status: true,
        createdAt: true,
      },
    }),
    db.serviceOrder.findMany({
      where: { propertyId, createdAt: { gte: since90 } },
      select: {
        id: true,
        bookingId: true,
        guestName: true,
        guestEmail: true,
        totalAmount: true,
        status: true,
        paymentStatus: true,
        createdAt: true,
      },
    }),
    db.laundryOrder.findMany({
      where: { propertyId, createdAt: { gte: since90 } },
      select: {
        id: true,
        bookingId: true,
        guestEmail: true,
        serviceType: true,
        amountEur: true,
        status: true,
        createdAt: true,
      },
    }),
    db.souvenirOrder.findMany({
      where: { propertyId, createdAt: { gte: since90 } },
      select: {
        id: true,
        bookingId: true,
        productName: true,
        quantity: true,
        unitPrice: true,
        status: true,
        createdAt: true,
      },
    }),
    db.inventoryAlert.findMany({
      where: { propertyId, createdAt: { gte: since30 } },
      select: {
        id: true,
        item: true,
        status: true,
        note: true,
        reportedBy: true,
        resolvedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    db.product.findMany({
      where: { propertyId },
      select: {
        id: true,
        name: true,
        currentStock: true,
        minStockThreshold: true,
        isOnShoppingList: true,
      },
    }),
    db.cleaningReport.findMany({
      where: { propertyId, createdAt: { gte: since30 } },
      select: { id: true, staffName: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    db.checkOutInspection.findMany({
      where: { propertyId, createdAt: { gte: since90 } },
      select: {
        id: true,
        guestName: true,
        type: true,
        entranceStatus: true,
        kitchenStatus: true,
        livingRoomStatus: true,
        bedroomsStatus: true,
        bathroomStatus: true,
        damages: true,
        issues: true,
        status: true,
        resolvedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    db.guestMemory.findMany({
      where: { propertyId, createdAt: { gte: since90 } },
      select: {
        id: true,
        bookingId: true,
        guestName: true,
        guestEmail: true,
        rating: true,
        message: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    db.privateFeedback.findMany({
      where: { propertyId, createdAt: { gte: since90 } },
      select: {
        id: true,
        bookingId: true,
        guestName: true,
        rating: true,
        comment: true,
        isResolved: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    db.guestComplaint.findMany({
      where: { propertyId, createdAt: { gte: since90 } },
      select: {
        id: true,
        category: true,
        description: true,
        isUrgent: true,
        status: true,
        guestName: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    db.minibarRestockRequest.findMany({
      where: { propertyId, createdAt: { gte: since30 } },
      select: { id: true, guestName: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    db.middleStayRequest.findMany({
      where: { propertyId, createdAt: { gte: since30 } },
      select: {
        id: true,
        guestName: true,
        requestType: true,
        details: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    db.guestSession.findMany({
      where: { propertyId, firstSeenAt: { gte: since30 } },
      select: { id: true, bookingId: true, firstSeenAt: true, lastSeenAt: true },
    }),
  ]);

  return {
    property: property ?? {
      id: propertyId,
      name: 'Bien',
      latitude: null,
      longitude: null,
      premiumFeatures: null,
    },
    bookings: bookings as BookingLite[],
    minibarOrders: minibarOrders as MinibarOrderLite[],
    serviceOrders: serviceOrders as ServiceOrderLite[],
    laundryOrders: laundryOrders as LaundryOrderLite[],
    souvenirOrders: souvenirOrders as SouvenirOrderLite[],
    inventoryAlerts: inventoryAlerts as InventoryAlertLite[],
    products: products as ProductLite[],
    cleaningReports: cleaningReports as CleaningReportLite[],
    inspections: inspections as InspectionLite[],
    memories: memories as MemoryLite[],
    privateFeedbacks: privateFeedbacks as FeedbackLite[],
    complaints: complaints as ComplaintLite[],
    restockRequests: restockRequests as RestockLite[],
    middleStayRequests: middleStayRequests as MiddleStayLite[],
    guestSessions: guestSessions as GuestSessionLite[],
  };
}

// -------------------------------------------------------------
// Helpers
// -------------------------------------------------------------

/** Montant formaté « 12,50 € ». */
function eur(amount: number): string {
  return `${amount.toFixed(2).replace('.', ',')} €`;
}
