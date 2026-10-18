// =============================================================
// v4.69 — PHASE 5 « COMMISSION, CRM SUPERADMIN & FACTURATION MENSUELLE »
// SERVER ONLY — moteur d'agrégation des commandes « encaissées par
// l'hôte » et gestion des HostSettings (config paiement + taux).
//
// Modèle économique : l'hôte encaisse les paiements (son propre Stripe
// ou paiement sur place), RoomScan prélève une commission (10 % ou
// 20 %, configurable par hôte) facturée à la fin du mois via
// MonthlyCommissionInvoice.
//
// Base de calcul (par bien de l'hôte, fenêtre mois UTC) :
//   • ServiceOrder  status DELIVERED  → totalAmount
//   • MinibarOrder  status PAID       → totalEur
//   • LaundryOrder  status PAID / IN_PROGRESS / READY / DELIVERED → amountEur
// =============================================================
import { db } from '@/lib/db';

/** Taux de commission par défaut (20 %) si l'hôte n'a pas de config. */
export const DEFAULT_HOST_COMMISSION_RATE = 0.20;

export interface HostMonthlyTotals {
  minibar: number;
  services: number;
  laundry: number;
  total: number;
  count: number;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Fenêtre UTC [début, fin) du mois demandé. */
export function monthWindow(month: number, year: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  return { start, end };
}

/** « Octobre 2026 » (fr-FR). */
export function monthLabel(month: number, year: number): string {
  return new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  });
}

/** Échéance = dernier jour du mois suivant (ex: facture d'octobre due le 30 nov.). */
export function monthDueDate(month: number, year: number): Date {
  return new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
}

/** Settings de l'hôte (créés à la volée avec le taux par défaut). */
export async function getOrCreateHostSettings(userId: string) {
  const existing = await db.hostSettings.findUnique({ where: { userId } });
  if (existing) return existing;
  return db.hostSettings.create({ data: { userId, commissionRate: DEFAULT_HOST_COMMISSION_RATE } });
}

/**
 * Agrège les commandes « encaissées par l'hôte » sur le mois demandé
 * (toutes les propriétés dont il est owner). Jamais throw.
 */
export async function computeHostMonthlyTotals(
  ownerId: string,
  month: number,
  year: number,
): Promise<HostMonthlyTotals> {
  const zeros: HostMonthlyTotals = { minibar: 0, services: 0, laundry: 0, total: 0, count: 0 };
  try {
    const props = await db.property.findMany({ where: { ownerId }, select: { id: true } });
    if (props.length === 0) return zeros;
    const propertyIds = props.map((p) => p.id);
    const { start, end } = monthWindow(month, year);

    const [svc, mnb, ldr] = await Promise.all([
      db.serviceOrder.aggregate({
        where: { propertyId: { in: propertyIds }, status: 'DELIVERED', createdAt: { gte: start, lt: end } },
        _sum: { totalAmount: true },
        _count: true,
      }),
      db.minibarOrder.aggregate({
        where: { propertyId: { in: propertyIds }, status: 'PAID', createdAt: { gte: start, lt: end } },
        _sum: { totalEur: true },
        _count: true,
      }),
      db.laundryOrder.aggregate({
        where: {
          propertyId: { in: propertyIds },
          status: { in: ['PAID', 'IN_PROGRESS', 'READY', 'DELIVERED'] },
          createdAt: { gte: start, lt: end },
        },
        _sum: { amountEur: true },
        _count: true,
      }),
    ]);

    const services = round2(svc._sum.totalAmount ?? 0);
    const minibar = round2(mnb._sum.totalEur ?? 0);
    const laundry = round2(ldr._sum.amountEur ?? 0);
    const count = (svc._count ?? 0) + (mnb._count ?? 0) + (ldr._count ?? 0);
    return { minibar, services, laundry, total: round2(minibar + services + laundry), count };
  } catch {
    return zeros;
  }
}

/** Owner ids ayant eu AU MOINS une commande sur la fenêtre (pour la génération de masse). */
export async function findActiveOwnerIds(month: number, year: number): Promise<string[]> {
  const { start, end } = monthWindow(month, year);
  const [svc, mnb, ldr] = await Promise.all([
    db.serviceOrder.findMany({
      where: { status: 'DELIVERED', createdAt: { gte: start, lt: end } },
      select: { propertyId: true },
      distinct: ['propertyId'],
    }),
    db.minibarOrder.findMany({
      where: { status: 'PAID', createdAt: { gte: start, lt: end } },
      select: { propertyId: true },
      distinct: ['propertyId'],
    }),
    db.laundryOrder.findMany({
      where: { status: { in: ['PAID', 'IN_PROGRESS', 'READY', 'DELIVERED'] }, createdAt: { gte: start, lt: end } },
      select: { propertyId: true },
      distinct: ['propertyId'],
    }),
  ]);
  const propertyIds = [...new Set([...svc, ...mnb, ...ldr].map((r) => r.propertyId))];
  if (propertyIds.length === 0) return [];
  const props = await db.property.findMany({
    where: { id: { in: propertyIds } },
    select: { ownerId: true },
    distinct: ['ownerId'],
  });
  return [...new Set(props.map((p) => p.ownerId))];
}
