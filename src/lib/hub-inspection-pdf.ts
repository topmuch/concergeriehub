// =============================================================
// HUB INSPECTION PDF — v4.165
//
// Le PDF « ATTESTATION D'ÉTAT DES LIEUX » (modèle ROUGE actuel,
// lib/inspection-standalone-pdf.ts) généré depuis les données du
// FLUX HUB (formulaire public /hub/<slug> → POST checkout-inspection).
//
// v4.164 avait joint aux emails le PDF de lib/inspection-pdf.ts
// (modèle BLEU « document de preuve horodaté ») — l'ANCIEN modèle
// que le site n'utilise plus. Cette lib remplace ce rendu PARTOUT
// (route PDF publique /api/public/inspection/[token]/pdf + pièces
// jointes des emails hôte/invité) : le site et les emails montrent
// désormais le MÊME document, au modèle actuel.
//
// Mapping des données hub → standalone :
//   · roomsData hub (5 pièces, statut global good/dirty/damaged,
//     commentaire, photos dataURL) → rooms standalone avec 1 item
//     « État de la pièce » + 1 item par photo (vignettes) ;
//   · selfAssessment (sortie, 1-5) → cleanlinessScore ;
//   · inventaire rendu + minibar → sections dédiées du renderer ;
//   · SHA-256 calculé sur le contenu canonique du document.
// Ne lève JAMAIS : échec de rendu → null (les appelants replient sur
// les liens, le flux métier n'est jamais bloqué).
// =============================================================

import { createHash } from 'crypto';
import { db } from '@/lib/db';
import { parseBranding } from '@/lib/branding';
import {
  renderStandaloneInspectionPdf,
  type StandaloneInspectionPdfData,
  type StandalonePdfRoom,
} from '@/lib/inspection-standalone-pdf';

/** Garde anti-rejet des serveurs mail (l'appelant décide du repli). */
export const HUB_PDF_MAX_BYTES = 7 * 1024 * 1024;

/** Structure d'une pièce telle que stockée par le hub (zod submit). */
interface HubRoom {
  id?: string;
  label?: string;
  status?: string; // 'good' | 'dirty' | 'damaged'
  comment?: string | null;
  photos?: string[] | null;
}

/** good→BON, dirty→MOYEN, damaged→MAUVAIS (états du renderer rouge). */
function mapStatus(status: string | undefined | null): string {
  if (status === 'damaged') return 'MAUVAIS';
  if (status === 'dirty') return 'MOYEN';
  return 'BON';
}

/** Auto-évaluation hub (1-5) → propreté du renderer rouge. */
function mapCleanliness(selfAssessment: number | null | undefined): string | null {
  if (!selfAssessment) return null;
  if (selfAssessment >= 5) return 'IMPECCABLE';
  if (selfAssessment === 4) return 'CORRECT';
  if (selfAssessment === 3) return 'A_NETTOYER';
  return 'TRES_SALE';
}

/** Nom de fichier normalisé (même convention que la route PDF publique). */
export function hubInspectionPdfFilename(
  type: string,
  guestName: string,
  id: string,
): string {
  const slug = guestName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60);
  const docKind = type === 'checkin' ? 'attestation-etat-des-lieux-entree' : 'rapport-de-sortie';
  return `${docKind}-${slug || 'invite'}-${id.slice(-6)}.pdf`;
}

/**
 * Recharge l'inspection hub (token public) et rend le PDF « ATTESTATION »
 * du modèle actuel. Retourne null si l'inspection est introuvable ou si
 * le rendu échoue (jamais levant).
 */
export async function buildHubInspectionPdfBuffer(
  publicToken: string,
): Promise<Buffer | null> {
  try {
    const row = await db.checkOutInspection.findUnique({
      where: { publicToken },
      select: {
        id: true,
        publicToken: true,
        guestName: true,
        guestEmail: true,
        ipAddress: true,
        signedAt: true,
        type: true,
        selfAssessment: true,
        issues: true,
        damages: true,
        roomsData: true,
        inventoryCheck: true,
        minibarData: true,
        damagePhotos: true,
        guestSignature: true,
        property: {
          select: {
            name: true,
            address: true,
            propertyType: true,
            branding: true,
            owner: {
              select: {
                fullName: true,
                email: true,
                profile: { select: { phone: true } },
              },
            },
          },
        },
        booking: { select: { checkIn: true, checkOut: true } },
      },
    });
    if (!row) return null;

    // ── Pièces : 1 item « État de la pièce » + 1 item par photo ──
    const hubRooms = Array.isArray(row.roomsData) ? (row.roomsData as HubRoom[]) : [];
    const rooms: StandalonePdfRoom[] = hubRooms.map((hr) => {
      const state = mapStatus(hr.status);
      const comment = hr.comment?.trim() || null;
      const items: StandaloneInspectionPdfData['rooms'][number]['items'] = [
        {
          name: 'État de la pièce',
          state,
          comment,
          photoUrl: null,
        },
      ];
      for (const [i, photo] of (hr.photos ?? []).entries()) {
        items.push({
          name: `Photo de l'état ${i + 1}`,
          state,
          comment: i === 0 ? comment : null,
          photoUrl: photo,
        });
      }
      return {
        name: hr.label || 'Pièce',
        globalState: state,
        comment: null,
        items,
      };
    });

    // ── Empreinte SHA-256 du contenu canonique du document ──
    const canonical = JSON.stringify({
      token: row.publicToken,
      guest: row.guestName,
      email: row.guestEmail,
      signedAt: row.signedAt?.toISOString?.() ?? null,
      type: row.type,
      rooms: hubRooms,
      inventory: row.inventoryCheck ?? null,
      minibar: row.minibarData ?? null,
      property: row.property.name,
    });
    const sha256Hash = createHash('sha256').update(canonical).digest('hex');

    const buffer = await renderStandaloneInspectionPdf({
      inspection: {
        publicToken: row.publicToken,
        propertyName: row.property.name,
        propertyAddress: row.property.address ?? '',
        ownerName: row.property.owner?.fullName ?? '',
        guestName: row.guestName,
        type: row.type === 'checkin' ? 'ENTREE' : 'SORTIE',
        scheduledDate: row.signedAt ?? new Date(),
        status: 'COMPLETED',
        signedAt: row.signedAt,
        completedAt: row.signedAt,
        cleanlinessScore: mapCleanliness(row.selfAssessment),
        cleanlinessComment: null,
        cleanlinessPhotoUrl: null,
        guestSignature: row.guestSignature,
        linkedEntranceDate: null,
        city: null, // fallback renderer : 1re partie de l'adresse
        sha256Hash,
        gpsLocation: null,
        ipAddress: row.ipAddress,
      },
      rooms,
      guestNotes: row.issues?.trim() || null,
      inventory: (row.inventoryCheck as
        | { keys: number; remotes: number; towels: number }
        | null) ?? null,
      minibar: (row.minibarData as { name: string; consumed: number }[] | null) ?? null,
    });
    return buffer;
  } catch (error) {
    console.error('[hub-inspection-pdf] rendu échoué (repli sur liens) :', error);
    return null;
  }
}
