// =============================================================
// EDL BILLING — Droits d'accès au module « États des Lieux »
// standalone (v4.107).
//
// L'offre EDL (299 €/an, achat PayPal sur la page d'accueil) crée
// un compte limité au SEUL tableau de bord EDL — jamais au Hub
// classique (/airbnb).
//
// Règles d'accès au module EDL (dashboard + API create/list) :
//   1. abonnement EDL actif (InspectionSubscription active et non
//      expirée) — les acheteurs standalone ET les créations
//      antérieures ;
//   2. OU propriétaire d'au moins un bien (le module reste inclus
//      pour les hôtes du Hub — décision produit v4.97) ;
//   3. OU manager accepté d'au moins un bien ;
//   4. OU superadmin (support / démonstration).
// Tout autre compte connecté est renvoyé vers /edl/abonnement.
// =============================================================
import { db } from '@/lib/db';

/** Abonnement EDL actif (status + date de fin) ? */
export async function hasActiveEdlSubscription(userId: string): Promise<boolean> {
  const sub = await db.inspectionSubscription.findUnique({
    where: { userId },
    select: { status: true, endDate: true },
  });
  return Boolean(sub && sub.status === 'active' && sub.endDate.getTime() > Date.now());
}

/**
 * Entitlement complet au module EDL (les 4 règles ci-dessus).
 * Un seul round-trip DB dans le cas courant.
 */
export async function hasEdlAccess(
  userId: string,
  role?: string | null,
): Promise<boolean> {
  if (role === 'superadmin') return true;
  const sub = await db.inspectionSubscription.findUnique({
    where: { userId },
    select: { status: true, endDate: true },
  });
  if (sub && sub.status === 'active' && sub.endDate.getTime() > Date.now()) return true;
  const [ownedCount, memberships] = await Promise.all([
    db.property.count({ where: { ownerId: userId } }),
    db.propertyMember.count({ where: { userId, acceptedAt: { not: null } } }),
  ]);
  return ownedCount > 0 || memberships > 0;
}

/**
 * Compte « Hub » : superadmin, propriétaire d'au moins un bien, ou
 * membre accepté d'au moins un bien. Ces comptes gardent l'accès au
 * module EDL inclus (décision produit v4.97) — l'abonnement EDL est
 * alors créé/renouvelé à la volée comme avant. Un compte SANS cela
 * (ex : acheteur EDL avant activation, inscrit gratuit) doit passer
 * par l'achat PayPal (/edl/abonnement).
 */
export async function isHubAccount(
  userId: string,
  role?: string | null,
): Promise<boolean> {
  if (role === 'superadmin') return true;
  const [ownedCount, memberCount] = await Promise.all([
    db.property.count({ where: { ownerId: userId } }),
    db.propertyMember.count({ where: { userId, acceptedAt: { not: null } } }),
  ]);
  return ownedCount > 0 || memberCount > 0;
}

/**
 * Compte « EDL seul » : abonnement EDL actif SANS aucun bien ni
 * équipe → doit être tenu à l'écart du Hub classique (/airbnb/*)
 * et redirigé vers son tableau de bord EDL.
 */
export async function isEdlOnlyAccount(userId: string): Promise<boolean> {
  const [ownedCount, memberships] = await Promise.all([
    db.property.count({ where: { ownerId: userId } }),
    db.propertyMember.count({ where: { userId, acceptedAt: { not: null } } }),
  ]);
  if (ownedCount > 0 || memberships > 0) return false;
  return hasActiveEdlSubscription(userId);
}
