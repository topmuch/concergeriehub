import { db } from '@/lib/db';

// =============================================================
// v4.42 — RÉSOLUTION UNIFIÉE DES HUBS PUBLICS
//
// BUG CORRIGÉ : toutes les routes POST/GET sous /api/public/hub/[slug]
// ne résolvaient le slug QUE via Property.qrHubSlug, alors que le
// payload principal (GET /api/public/hub/[slug]) supporte DEUX flux :
//   1a. Plaque V1  → PhysicalQrCode.hubSlug → propertyId
//   1b. Hub du bien → Property.qrHubSlug
// Résultat : sur un hub créé via une PLAQUE (QR physique), la page
// s'ouvrait mais SOS, Shop the Stay, ménage, réclamations… renvoyaient
// « Ce hub est introuvable » (404).
//
// resolveHubPropertyId() reproduit EXACTEMENT la logique du payload
// principal et doit être utilisé par toutes les sous-routes.
// =============================================================

export type HubResolve =
  | { ok: true; propertyId: string; via: 'plaque' | 'slug' }
  | { ok: false; status: number; message: string };

export async function resolveHubPropertyId(slug: string): Promise<HubResolve> {
  // ── 1a. La plaque (QR physique) derrière ce slug — flux V1 ──
  const plaque = await db.physicalQrCode.findUnique({
    where: { hubSlug: slug },
    select: { propertyId: true, isClaimed: true, status: true },
  });

  if (plaque) {
    if (!plaque.isClaimed || !plaque.propertyId) {
      return {
        ok: false,
        status: 404,
        message:
          'Ce hub est introuvable ou la plaque n’a pas encore été activée par son hôte.',
      };
    }
    if (plaque.status !== 'active') {
      return {
        ok: false,
        status: 410,
        message:
          plaque.status === 'lost'
            ? 'Cette plaque a été signalée perdue par son hôte.'
            : 'Cette plaque QR a été désactivée par son hôte.',
      };
    }
    return { ok: true, propertyId: plaque.propertyId, via: 'plaque' };
  }

  // ── 1b. Fallback Hub QR du BIEN (Property.qrHubSlug) ──
  const property = await db.property.findUnique({
    where: { qrHubSlug: slug },
    select: { id: true, isActive: true },
  });
  if (!property) {
    return { ok: false, status: 404, message: 'Ce hub est introuvable.' };
  }
  if (!property.isActive) {
    return {
      ok: false,
      status: 410,
      message: 'Ce bien a été désactivé par son hôte.',
    };
  }
  return { ok: true, propertyId: property.id, via: 'slug' };
}
