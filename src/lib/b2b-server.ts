// =============================================================
// Helpers serveur B2B — accès DB (NE PAS importer côté client)
// =============================================================
import { db } from '@/lib/db';

/** Métadonnées minimales d'un bien pour les interfaces hôte. */
export interface UserPropertyLite {
  id: string;
  name: string;
  propertyType: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}

const PROPERTY_SELECT = {
  id: true,
  name: true,
  propertyType: true,
  address: true,
  latitude: true,
  longitude: true,
} as const;

/**
 * Propriétés accessibles par l'utilisateur : celles qu'il possède
 * + celles où il est membre de l'équipe (co-hôte, staff…).
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
      where: { userId },
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

/** Vérifie que l'utilisateur peut accéder au bien (owner ou membre). */
export async function canAccessProperty(userId: string, propertyId: string): Promise<boolean> {
  const [owned, member] = await Promise.all([
    db.property.findFirst({ where: { id: propertyId, ownerId: userId }, select: { id: true } }),
    db.propertyMember.findFirst({
      where: { propertyId, userId },
      select: { id: true },
    }),
  ]);
  return Boolean(owned || member);
}
