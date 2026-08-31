// =============================================================
// Rôles d'équipe — ÉTAPE 12 V2 (Conciergerie Hub)
// Canonique : 'OWNER' | 'MANAGER' | 'CLEANER' | 'MAINTENANCE'
// (Prisma/SQLite : champ String — valeurs documentées ici.)
// Partagé client + serveur — aucune dépendance DB.
// =============================================================

export const MEMBER_ROLES = ['OWNER', 'MANAGER', 'CLEANER', 'MAINTENANCE'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export interface MemberRoleMeta {
  emoji: string;
  label: string;
  /** Ce que voit concrètement le membre avec ce rôle */
  description: string;
  /** Secteurs visibles dans le dashboard */
  views: Array<'overview' | 'bookings' | 'cleaning' | 'maintenance' | 'team' | 'modules'>;
}

export const MEMBER_ROLE_META: Record<MemberRole, MemberRoleMeta> = {
  OWNER: {
    emoji: '👑',
    label: 'Propriétaire',
    description: 'Accès total : biens, équipe, facturation, modules.',
    views: ['overview', 'bookings', 'cleaning', 'maintenance', 'team', 'modules'],
  },
  MANAGER: {
    emoji: '🧑‍💼',
    label: 'Co-hôte / Gestionnaire',
    description: 'Gère les bookings, les messages et les prestataires.',
    views: ['overview', 'bookings', 'cleaning', 'maintenance', 'team', 'modules'],
  },
  CLEANER: {
    emoji: '🧹',
    label: 'Personnel de ménage',
    description: 'Voit uniquement le planning ménage des biens assignés.',
    views: ['cleaning'],
  },
  MAINTENANCE: {
    emoji: '🔧',
    label: 'Maintenance',
    description: 'Voit uniquement les réclamations techniques des biens assignés.',
    views: ['maintenance'],
  },
};

/** Fallback si la valeur en base est inconnue. */
export function memberRoleMeta(role: string): MemberRoleMeta {
  return MEMBER_ROLE_META[normalizeMemberRole(role)];
}

/**
 * Mappe les valeurs legacy V1 vers les rôles canoniques V2 :
 * 'owner'→OWNER, 'cohost'→MANAGER, 'member'→MANAGER,
 * 'staff'→MAINTENANCE, 'cleaner'→CLEANER.
 */
export function normalizeMemberRole(role: string | null | undefined): MemberRole {
  const raw = (role ?? '').trim();
  switch (raw.toUpperCase()) {
    // --- canonique V2 ---
    case 'OWNER':
      return 'OWNER';
    case 'MANAGER':
      return 'MANAGER';
    case 'CLEANER':
      return 'CLEANER';
    case 'MAINTENANCE':
      return 'MAINTENANCE';
    // --- legacy V1 (valeurs d'origine en minuscules) ---
    case 'COHOST':
    case 'MEMBER':
      return 'MANAGER';
    case 'STAFF':
      return 'MAINTENANCE';
    default:
      return 'MANAGER';
  }
}

/** OWNER + MANAGER peuvent gérer l'équipe et les infos du bien. */
export function canManageTeam(role: MemberRole): boolean {
  return role === 'OWNER' || role === 'MANAGER';
}

/** Le rôle peut-il voir la vue "planning & occupation" ? */
export function canViewBookings(role: MemberRole): boolean {
  return MEMBER_ROLE_META[role].views.includes('bookings') ||
    MEMBER_ROLE_META[role].views.includes('cleaning');
}
