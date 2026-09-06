// =============================================================
// FIX-11 (AUD-FULL) — Statut de vérification prestataire
//
// Dérive un statut QUADRI-ÉTAT lisible par l'admin à partir des
// données RÉELLES déjà en base (aucune migration, SCHÉMA GELÉ) :
//   · Provider.isVerified (Boolean)
//   · Provider.verificationDocuments (JSON string, convention
//     FIX-4 : Array<{ status: 'PENDING'|'VERIFIED'|'REJECTED' }>)
//
// États dérivés (AUD-FULL : « statut prestataire binaire » corrigé) :
//   VERIFIED  « Vérifié »   — badge isVerified = true
//   REJECTED  « Rejeté »    — ≥ 1 document REJECTED et non vérifié
//   IN_REVIEW « En revue »  — ≥ 1 document PENDING, aucun rejet
//   PENDING   « En attente »— aucun document soumis
//
// Précédence : Vérifié > Rejeté > En revue > En attente (l'ordre
// suit la définition de l'audit : « Rejeté » exige non-vérifié,
// « En revue » exige aucun rejet, « En attente » = zéro document).
// =============================================================

export type DocumentKind = 'KBIS' | 'ASSURANCE' | 'OTHER';
export type DocumentStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

export interface VerificationDocument {
  id: string;
  kind: DocumentKind;
  name: string;
  url: string;
  uploadedAt: string;
  status: DocumentStatus;
}

export const DOCUMENT_KINDS: DocumentKind[] = ['KBIS', 'ASSURANCE', 'OTHER'];
export const DOCUMENT_STATUSES: DocumentStatus[] = ['PENDING', 'VERIFIED', 'REJECTED'];

/** Parse défensif du JSON-as-string (champ Provider.verificationDocuments).
 *  Les entrées incomplètes/corrompues sont ignorées, jamais throw.
 *  Idempotent : accepte aussi un tableau déjà parsé. */
export function parseVerificationDocuments(raw: unknown): VerificationDocument[] {
  let arr: unknown = raw;
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr.filter((d): d is VerificationDocument => {
    if (typeof d !== 'object' || d === null) return false;
    const doc = d as Partial<VerificationDocument>;
    return (
      typeof doc.id === 'string' &&
      DOCUMENT_KINDS.includes(doc.kind as DocumentKind) &&
      typeof doc.name === 'string' &&
      typeof doc.url === 'string' &&
      typeof doc.uploadedAt === 'string' &&
      DOCUMENT_STATUSES.includes(doc.status as DocumentStatus)
    );
  });
}

export type ProviderReviewStatus = 'PENDING' | 'IN_REVIEW' | 'REJECTED' | 'VERIFIED';

/** Dérive le statut de vérification d'un prestataire (voir en-tête). */
export function deriveProviderReviewStatus(
  isVerified: boolean,
  documents: Pick<VerificationDocument, 'status'>[],
): ProviderReviewStatus {
  if (isVerified) return 'VERIFIED';
  if (documents.some((d) => d.status === 'REJECTED')) return 'REJECTED';
  if (documents.some((d) => d.status === 'PENDING')) return 'IN_REVIEW';
  // Cas résiduel (ne devrait pas arriver : la règle badge FIX-4 passe
  // isVerified à true dès que tous les documents sont VERIFIED) —
  // dossier complet mais badge désactivé manuellement → re-revue requise.
  if (documents.length > 0) return 'IN_REVIEW';
  return 'PENDING';
}

/** Méta d'affichage : badge coloré distinct par état
 *  (slate / amber / red / emerald — cf. AUD-FULL). */
export const PROVIDER_REVIEW_STATUS_META: Record<
  ProviderReviewStatus,
  { label: string; emoji: string; badgeCls: string }
> = {
  PENDING: {
    label: 'En attente',
    emoji: '⏳',
    badgeCls: 'bg-slate-100 border-slate-300 text-slate-700',
  },
  IN_REVIEW: {
    label: 'En revue',
    emoji: '🔍',
    badgeCls: 'bg-amber-50 border-amber-300 text-amber-800',
  },
  REJECTED: {
    label: 'Rejeté',
    emoji: '⛔',
    badgeCls: 'bg-red-50 border-red-300 text-red-700',
  },
  VERIFIED: {
    label: 'Vérifié',
    emoji: '✓',
    badgeCls: 'bg-emerald-50 border-emerald-300 text-emerald-700',
  },
};

/** Méta des kinds de documents (libellés lisibles, partagés UI). */
export const DOC_KIND_META: Record<DocumentKind, { label: string; emoji: string }> = {
  KBIS: { label: 'Kbis', emoji: '🏛️' },
  ASSURANCE: { label: 'Assurance', emoji: '🛡️' },
  OTHER: { label: 'Autre', emoji: '📎' },
};

/** Méta des statuts DOCUMENT (3 états, au niveau de chaque pièce) —
 *  à ne pas confondre avec PROVIDER_REVIEW_STATUS_META (4 états au
 *  niveau du prestataire). */
export const DOC_STATUS_META: Record<DocumentStatus, { label: string; cls: string }> = {
  PENDING: { label: 'En attente', cls: 'bg-amber-50 border-amber-300 text-amber-800' },
  VERIFIED: { label: 'Validé', cls: 'bg-emerald-50 border-emerald-300 text-emerald-700' },
  REJECTED: { label: 'Rejeté', cls: 'bg-red-50 border-red-200 text-red-600' },
};
