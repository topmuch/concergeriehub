// =============================================================
// ROOMSCAN BOUCLIER AUTOMATISÉ — Garde d'accès partagée (v5.1).
//
// Même entitlement que le module EDL classique (v4.107) :
//   · abonnement InspectionSubscription actif → OK ;
//   · compte Hub (superadmin / propriétaire / équipe) → abonnement
//     auto-créé à la volée (module inclus, comportement v4.97) ;
//   · sinon → 403 { error:'abonnement_requis' } → /edl/abonnement.
// =============================================================
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { isHubAccount } from '@/lib/edl-billing';

export type ShieldAccessResult =
  | { ok: true; userId: string; subscriptionId: string }
  | { ok: false; status: 401 | 403; error: string; message?: string };

/**
 * Résout la session + l'entitlement et renvoie l'id d'abonnement à
 * utiliser comme propriétaire des données Shield. AUCUN accès DB
 * spécifique n'est vérifié ici (les routes vérifient ensuite que la
 * ressource demandée appartient bien à CET abonnement).
 */
export async function resolveShieldAccess(): Promise<ShieldAccessResult> {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!session?.user || !userId) {
    return { ok: false, status: 401, error: 'Non autorisé' };
  }
  const role = (session?.user as { role?: string } | undefined)?.role ?? null;

  const now = new Date();
  const sub = await db.inspectionSubscription.findUnique({ where: { userId } });
  if (sub && sub.status === 'active' && sub.endDate >= now) {
    return { ok: true, userId, subscriptionId: sub.id };
  }

  // Module INCLUS pour les comptes Hub — abonnement créé à la volée.
  if (await isHubAccount(userId, role)) {
    if (!sub) {
      const created = await db.inspectionSubscription.create({
        data: {
          userId,
          status: 'active',
          plan: 'edl_annual',
          endDate: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
        },
      });
      return { ok: true, userId, subscriptionId: created.id };
    }
    return {
      ok: false,
      status: 403,
      error: 'abonnement_requis',
      message: "Votre abonnement États des Lieux a expiré. Renouvelez-le pour continuer.",
    };
  }

  return {
    ok: false,
    status: 403,
    error: 'abonnement_requis',
    message: "L'offre États des Lieux (299 €/an, PDF illimités) est requise.",
  };
}

/** Vérifie qu'une propriété Shield appartient à l'abonnement donné. */
export async function shieldPropertyOwned(propertyId: string, subscriptionId: string) {
  return db.shieldProperty.findFirst({
    where: { id: propertyId, subscriptionId },
    include: { zones: { orderBy: { sortOrder: 'asc' } } },
  });
}

// ---------- Validation des dataURL photos / vidéo ----------

const PHOTO_RE = /^data:image\/(jpeg|jpg|png);base64,([\s\S]+)$/;
/** Taille max d'une photo décodée (~1,5 Mo après compression client). */
export const MAX_PHOTO_BYTES = 1_600_000;

/** Décode et valide un dataURL photo → Buffer (null si invalide). */
export function decodePhotoDataUrl(dataUrl: unknown): Buffer | null {
  if (typeof dataUrl !== 'string') return null;
  const m = dataUrl.match(PHOTO_RE);
  if (!m) return null;
  try {
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length === 0 || buf.length > MAX_PHOTO_BYTES) return null;
    return buf;
  } catch {
    return null;
  }
}

export const MAX_VIDEO_BYTES = 22_000_000; // ~22 Mo (30 s compressées)
const VIDEO_MIME_RE = /^(video\/(webm|mp4|quicktime|x-matroska))$/;

/** Décode et valide la charge vidéo base64 → Buffer (null si invalide). */
export function decodeVideoBase64(dataBase64: unknown, mimeType: unknown): Buffer | null {
  if (typeof dataBase64 !== 'string' || typeof mimeType !== 'string') return null;
  if (!VIDEO_MIME_RE.test(mimeType)) return null;
  if (dataBase64.length > Math.ceil(MAX_VIDEO_BYTES / 3) * 4 + 512) return null;
  try {
    const buf = Buffer.from(dataBase64, 'base64');
    if (buf.length < 1024 || buf.length > MAX_VIDEO_BYTES) return null;
    return buf;
  } catch {
    return null;
  }
}
