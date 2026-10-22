// =============================================================
// MODULE STANDALONE « ÉTAT DES LIEUX » — BUILDER PDF (v4.162)
//
// Génère le PDF signé d'un état des lieux depuis la base, SANS
// contexte HTTP — réutilisable par la route publique
// /api/inspection/pdf/[token] ET par l'envoi des emails de
// confirmation (pièce jointe, v4.162 : hôte + invité reçoivent le
// document signé EN PIÈCE JOINTE).
//
// Mapping unique (avant : dupliqué dans la seule route) → le PDF
// attaché aux emails est strictement IDENTIQUE à celui téléchargé
// depuis le lien public.
// =============================================================
import { db } from '@/lib/db';
import {
  renderStandaloneInspectionPdf,
  type StandaloneInspectionPdfData,
} from '@/lib/inspection-standalone-pdf';
import { computeInspectionSha256 } from '@/lib/inspection-hash';

export type InspectionPdfBuild =
  | { ok: true; buffer: Buffer; type: string }
  | { ok: false; reason: 'not_found' | 'render_error' };

/**
 * Charge l'inspection (pièces, items, photos dataURL, signature,
 * empreinte) et rend le PDF signé. Ne lève jamais : en cas d'échec de
 * rendu (ou d'inspection absente) la fonction retourne un résultat
 * qualifié que l'appelant transforme (404/500 côté route ; fallback
 * « email sans pièce jointe » côté emails).
 */
export async function buildInspectionPdfFromDb(
  publicToken: string,
): Promise<InspectionPdfBuild> {
  try {
    const inspection = await db.inspection.findUnique({
      where: { publicToken },
      include: {
        rooms: {
          orderBy: { sortOrder: 'asc' },
          include: { items: { orderBy: { sortOrder: 'asc' } } },
        },
        linkedInspection: { select: { scheduledDate: true } },
      },
    });
    if (!inspection) return { ok: false, reason: 'not_found' };

    const data: StandaloneInspectionPdfData = {
      inspection: {
        publicToken: inspection.publicToken,
        propertyName: inspection.propertyName,
        propertyAddress: inspection.propertyAddress,
        ownerName: inspection.ownerName,
        guestName: inspection.guestName,
        type: inspection.type,
        scheduledDate: inspection.scheduledDate,
        status: inspection.status,
        signedAt: inspection.signedAt,
        completedAt: inspection.completedAt,
        cleanlinessScore: inspection.cleanlinessScore,
        cleanlinessComment: inspection.cleanlinessComment,
        // Photo de propreté incluse (dataURL) — décodage tolérant côté PDF.
        cleanlinessPhotoUrl: inspection.cleanlinessPhotoUrl,
        guestSignature: inspection.guestSignature,
        linkedEntranceDate:
          inspection.type === 'SORTIE' ? inspection.linkedInspection?.scheduledDate ?? null : null,
        // Preuve & anti-fraude (v4.110). Empreinte : stockée à la
        // signature ; pour les documents signés avant v4.110 (sans
        // empreinte en base) elle est recalculée à la volée — le
        // contenu d'un document COMPLETED étant figé, elle est stable.
        city: inspection.city,
        ipAddress: inspection.ipAddress,
        gpsLocation: inspection.gpsLocation,
        sha256Hash:
          inspection.sha256Hash ??
          (inspection.status === 'COMPLETED'
            ? computeInspectionSha256({
                publicToken: inspection.publicToken,
                propertyName: inspection.propertyName,
                propertyAddress: inspection.propertyAddress,
                ownerName: inspection.ownerName,
                guestName: inspection.guestName,
                type: inspection.type,
                scheduledDate: inspection.scheduledDate,
                status: inspection.status,
                signedAt: inspection.signedAt,
                cleanlinessScore: inspection.cleanlinessScore,
                cleanlinessComment: inspection.cleanlinessComment,
                cleanlinessPhotoUrl: inspection.cleanlinessPhotoUrl,
                guestSignature: inspection.guestSignature,
                rooms: inspection.rooms.map((room) => ({
                  name: room.name,
                  globalState: room.globalState,
                  comment: room.comment,
                  items: room.items.map((item) => ({
                    name: item.name,
                    state: item.state,
                    comment: item.comment,
                    photoUrl: item.photoUrl,
                    photoOnUrl: item.photoOnUrl,
                    photoOffUrl: item.photoOffUrl,
                  })),
                })),
              })
            : null),
      },
      rooms: inspection.rooms.map((room) => ({
        name: room.name,
        globalState: room.globalState,
        comment: room.comment,
        items: room.items.map((item) => ({
          name: item.name,
          state: item.state,
          comment: item.comment,
          photoUrl: item.photoUrl,
          photoOnUrl: item.photoOnUrl,
          photoOffUrl: item.photoOffUrl,
        })),
      })),
    };

    const buffer = await renderStandaloneInspectionPdf(data);
    return { ok: true, buffer, type: inspection.type };
  } catch (error) {
    console.error('[inspection-pdf-builder] render failed:', error);
    return { ok: false, reason: 'render_error' };
  }
}

/** Nom de fichier canonique du PDF (route + pièces jointes email). */
export function inspectionPdfFilename(publicToken: string, type: string): string {
  const token6 = publicToken.slice(-6).toUpperCase();
  const typeSlug = type === 'SORTIE' ? 'sortie' : 'entree';
  return `etat-des-lieux-${typeSlug}-${token6}.pdf`;
}
