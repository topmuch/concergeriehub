// =============================================================
// Helpers serveur B2B — accès DB (NE PAS importer côté client)
// ÉTAPE 12 V2 : multi-propriétés & équipe (rôles, invitations,
// limites de plan pour la création de biens).
// =============================================================
import { db } from '@/lib/db';
import { normalizeMemberRole, type MemberRole } from '@/lib/team';
import { getHostPlan } from '@/lib/billing';

/** Métadonnées minimales d'un bien pour les interfaces hôte. */
export interface UserPropertyLite {
  id: string;
  name: string;
  propertyType: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  qrHubSlug: string | null;
}

const PROPERTY_SELECT = {
  id: true,
  name: true,
  propertyType: true,
  address: true,
  latitude: true,
  longitude: true,
  qrHubSlug: true,
} as const;

export interface UserMembership {
  id: string;
  role: MemberRole; // normalisé V2
  acceptedAt: Date | null;
  invitedAt: Date;
  property: UserPropertyLite;
}

/**
 * Toutes les adhésions d'équipe de l'utilisateur (acceptées ET en
 * attente) — la vue hôte filtre sur acceptedAt, la bannière
 * d'invitations affiche les autres.
 */
export async function resolveUserMemberships(userId: string): Promise<UserMembership[]> {
  const memberships = await db.propertyMember.findMany({
    where: { userId },
    include: { property: { select: PROPERTY_SELECT } },
    orderBy: { invitedAt: 'desc' },
  });
  return memberships
    .filter((m) => Boolean(m.property))
    .map((m) => ({
      id: m.id,
      role: normalizeMemberRole(m.role),
      acceptedAt: m.acceptedAt,
      invitedAt: m.invitedAt,
      property: m.property,
    }));
}

/**
 * Propriétés accessibles par l'utilisateur : celles qu'il possède
 * + celles où il est membre de l'équipe (invitation ACCEPTÉE).
 * Les biens possédés arrivent en premier.
 */
export async function resolveUserProperties(userId: string): Promise<UserPropertyLite[]> {
  const [owned, memberships] = await Promise.all([
    db.property.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: 'asc' },
      select: PROPERTY_SELECT,
    }),
    db.propertyMember.findMany({
      where: { userId, acceptedAt: { not: null } },
      select: { property: { select: PROPERTY_SELECT } },
    }),
  ]);

  const byId = new Map<string, UserPropertyLite>();
  for (const p of owned) byId.set(p.id, p);
  for (const m of memberships) {
    if (m.property && !byId.has(m.property.id)) byId.set(m.property.id, m.property);
  }
  return Array.from(byId.values());
}

/** Vérifie que l'utilisateur peut accéder au bien (owner ou membre accepté). */
export async function canAccessProperty(userId: string, propertyId: string): Promise<boolean> {
  const [owned, member] = await Promise.all([
    db.property.findFirst({ where: { id: propertyId, ownerId: userId }, select: { id: true } }),
    db.propertyMember.findFirst({
      where: { propertyId, userId, acceptedAt: { not: null } },
      select: { id: true },
    }),
  ]);
  return Boolean(owned || member);
}

/**
 * Rôle de l'utilisateur sur un bien : 'OWNER' si propriétaire,
 * sinon son rôle d'équipe normalisé (membre accepté uniquement).
 * null = aucun accès.
 */
export async function getUserRoleForProperty(
  userId: string,
  propertyId: string,
): Promise<MemberRole | null> {
  const property = await db.property.findUnique({
    where: { id: propertyId },
    select: { ownerId: true },
  });
  if (property?.ownerId === userId) return 'OWNER';

  const member = await db.propertyMember.findFirst({
    where: { propertyId, userId, acceptedAt: { not: null } },
    select: { role: true },
  });
  return member ? normalizeMemberRole(member.role) : null;
}

// =============================================================
// AUDIT PRÉ-PROD — Séparation financière par rôle d'équipe :
//   CLEANER / MAINTENANCE n'ont accès à AUCUNE donnée financière
//   (commandes, CA, commission, tarifs) — uniquement leur planning.
//   OWNER / MANAGER ont accès aux commandes et revenus (la
//   « facturation » Stripe du COMPTE reste owner-only côté page).
// =============================================================

/** L'utilisateur peut-il voir/gérer le financier de CE bien ? (OWNER ou MANAGER) */
export async function canManageFinance(userId: string, propertyId: string): Promise<boolean> {
  const role = await getUserRoleForProperty(userId, propertyId);
  return role === 'OWNER' || role === 'MANAGER';
}

/**
 * Ids des biens où l'utilisateur a un rôle financier (OWNER/MANAGER).
 * Utilisé pour scoper 'all' : les biens CLEANER/MAINTENANCE sont exclus.
 */
export async function resolveManagedPropertyIds(userId: string): Promise<string[]> {
  const [owned, memberships] = await Promise.all([
    db.property.findMany({ where: { ownerId: userId }, select: { id: true } }),
    db.propertyMember.findMany({
      where: {
        userId,
        acceptedAt: { not: null },
        role: { in: ['OWNER', 'MANAGER', 'owner', 'cohost', 'member'] },
      },
      select: { propertyId: true },
    }),
  ]);
  return Array.from(new Set([...owned.map((p) => p.id), ...memberships.map((m) => m.propertyId)]));
}

export interface HostPlanLimits {
  planId: string | null; // 'airbnb_solo' | 'airbnb_pro' | null (découverte)
  planName: string;
  maxProperties: number;
  /** True si l'utilisateur bénéficie de la multi-propriété équipe (Pro). */
  isPro: boolean;
}

/**
 * Limites du plan actif de l'hôte (dernier abonnement actif).
 * Sans abonnement payant → palier Découverte : 1 bien, sans équipe.
 */
export async function getHostPlanLimits(userId: string): Promise<HostPlanLimits> {
  const subscription = await db.subscription.findFirst({
    where: { userId, subscriberType: 'user', status: 'active' },
    orderBy: { createdAt: 'desc' },
    select: { plan: true },
  });

  const plan = subscription ? getHostPlan(subscription.plan) : undefined;
  if (!plan) {
    return { planId: null, planName: 'Découverte (gratuit)', maxProperties: 1, isPro: false };
  }
  return {
    planId: plan.id,
    planName: plan.name,
    maxProperties: plan.maxProperties,
    isPro: plan.id === 'airbnb_pro',
  };
}

/** Nombre de biens POSÉDÉS par l'utilisateur (les limites de plan s'appliquent au possédé). */
export async function countOwnedProperties(userId: string): Promise<number> {
  return db.property.count({ where: { ownerId: userId } });
}

// -------------------------------------------------------------
// Slug du Hub QR du bien (ÉTAPE 12) — /hub/[qrHubSlug]
// -------------------------------------------------------------

/** "Loft Paris 11" → "loft-paris-11" (accents retirés, max 40). */
export function slugifyPropertyName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

/** Slug unique en base : base slugifiée + suffixe aléatoire si collision. */
export async function generateUniquePropertySlug(name: string): Promise<string> {
  const base = slugifyPropertyName(name) || 'bien';
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate =
      attempt === 0
        ? `${base}-${Math.random().toString(36).slice(2, 6)}`
        : `${base}-${Math.random().toString(36).slice(2, 8)}`;
    const exists = await db.property.findUnique({
      where: { qrHubSlug: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
  }
  // Improbable : fallback horodaté
  return `${base}-${Date.now().toString(36)}`;
}
