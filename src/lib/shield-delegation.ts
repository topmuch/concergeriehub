// =============================================================
// SHIELD DÉLÉGATION (TASK 39, v4.154) — SERVER ONLY
//
// Chargement du lien magique /upload/[delegationToken] : l'hôte a
// configuré son logement SANS photos (mode délégation) ; son équipe
// sur place ouvre ce lien pour photographier zones + appareils.
//
//   · token inconnu                → 'invalid'   (écran « Lien invalide »)
//   · photos déjà envoyées         → 'completed' (écran « déjà réalisé »)
//   · lien de plus de 7 jours      → 'expired'   (écran « lien expiré »)
//   · bien en attente + lien valide → ok + données de capture
//
// AUCUNE donnée sensible (email/téléphone du propriétaire) ne sort
// par cette fonction — uniquement le nom/adresse/ref et la liste des
// pièces + équipements à photographier.
// =============================================================
import { db } from '@/lib/db';

export interface DelegationUploadData {
  propertyName: string;
  propertyAddress: string;
  city: string;
  ownerName: string;
  onboardingRef: string;
  zones: { id: string; name: string }[];
  devices: { id: string; name: string; kind: string }[];
  expiresAt: string | null;
}

export type DelegationLoadResult =
  | { ok: true; data: DelegationUploadData }
  | { ok: false; reason: 'invalid' | 'expired' | 'completed' };

export async function loadDelegationUpload(token: string): Promise<DelegationLoadResult> {
  const clean = token.trim();
  if (!clean || clean.length > 128) return { ok: false, reason: 'invalid' };

  const property = await db.shieldProperty.findUnique({
    where: { delegationToken: clean },
    select: {
      propertyName: true,
      propertyAddress: true,
      city: true,
      ownerName: true,
      onboardingRef: true,
      onboardingStatus: true,
      delegationTokenExpiresAt: true,
      zones: { orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } },
      devices: { orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, kind: true } },
    },
  });
  if (!property) return { ok: false, reason: 'invalid' };
  if (property.onboardingStatus !== 'PENDING_PHOTOS') return { ok: false, reason: 'completed' };
  if (
    property.delegationTokenExpiresAt &&
    property.delegationTokenExpiresAt.getTime() < Date.now()
  ) {
    return { ok: false, reason: 'expired' };
  }

  return {
    ok: true,
    data: {
      propertyName: property.propertyName,
      propertyAddress: property.propertyAddress,
      city: property.city,
      ownerName: property.ownerName,
      onboardingRef: property.onboardingRef,
      zones: property.zones.map((z) => ({ id: z.id, name: z.name })),
      devices: property.devices.map((d) => ({ id: d.id, name: d.name, kind: d.kind })),
      expiresAt: property.delegationTokenExpiresAt?.toISOString() ?? null,
    },
  };
}
