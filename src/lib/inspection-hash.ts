// =============================================================
// MODULE STANDALONE « ÉTAT DES LIEUX » — EMPREINTE SHA-256 (v4.110)
//
// Source unique de l'empreinte d'intégrité du document : calculée
// à la SIGNATURE (POST /api/inspection/[token]/submit → stockée en
// base `sha256Hash`) et au RENDU PDF (affichée sous le QR code).
//
// Le canon est construit sur les champs PRISMA normalisés (jamais
// sur le payload client) : submit et PDF relisent la base → les
// deux empreintes coïncident pour un contenu identique. Les photos
// (dataURL) entrent dans l'empreinte via un sous-hash SHA-256 —
// une photo remplacée en base invalide l'empreinte globale.
// =============================================================
import { createHash } from 'node:crypto';

/** Entrées du canon : lignes Prisma (Inspection + rooms + items). */
export interface InspectionHashInput {
  publicToken: string;
  propertyName: string;
  propertyAddress: string;
  ownerName: string;
  guestName: string;
  type: string; // 'ENTREE' | 'SORTIE'
  scheduledDate: Date;
  status: string;
  signedAt?: Date | null;
  cleanlinessScore?: string | null;
  cleanlinessComment?: string | null;
  cleanlinessPhotoUrl?: string | null;
  guestSignature?: string | null;
  rooms: {
    name: string;
    globalState: string;
    comment?: string | null;
    items: {
      name: string;
      state: string;
      comment?: string | null;
      photoUrl?: string | null;
      photoOnUrl?: string | null;
      photoOffUrl?: string | null;
    }[];
  }[];
}

/** Commentaire normalisé : trim → string, sinon null. */
function normText(value?: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

/** Sous-hash d'un contenu volumineux (dataURL photo/signature). */
function digest(value?: string | null): string | null {
  return value ? createHash('sha256').update(value).digest('hex') : null;
}

/** Date → ISO UTC ou null. */
function iso(d?: Date | null): string | null {
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
}

/**
 * SHA-256 hexadécimal du contenu canonique du document.
 * Déterministe : mêmes données en base → même empreinte.
 */
export function computeInspectionSha256(input: InspectionHashInput): string {
  const canon = {
    v: 1,
    token: input.publicToken,
    logement: {
      nom: input.propertyName.trim(),
      adresse: input.propertyAddress.trim(),
      proprietaire: input.ownerName.trim(),
    },
    invite: input.guestName.trim(),
    type: input.type,
    dateVisee: iso(input.scheduledDate),
    signature: iso(input.signedAt),
    empreinteSignature: digest(input.guestSignature),
    proprete: {
      niveau: normText(input.cleanlinessScore),
      commentaire: normText(input.cleanlinessComment),
      photo: digest(input.cleanlinessPhotoUrl),
    },
    pieces: input.rooms.map((room) => ({
      nom: room.name.trim(),
      etat: room.globalState,
      commentaire: normText(room.comment),
      elements: room.items.map((item) => ({
        nom: item.name.trim(),
        etat: item.state,
        commentaire: normText(item.comment),
        photo: digest(item.photoUrl),
        photoAllume: digest(item.photoOnUrl),
        photoEteint: digest(item.photoOffUrl),
      })),
    })),
  };
  return createHash('sha256').update(JSON.stringify(canon)).digest('hex');
}

/** ID court d'affichage type « RS-XXXXXX » dérivé du token public. */
export function inspectionDocumentId(publicToken: string): string {
  return `RS-${publicToken.slice(-6).toUpperCase()}`;
}
