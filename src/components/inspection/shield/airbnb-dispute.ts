// =============================================================
// EXPORT INTELLIGENT POUR LITIGE AIRBNB — helpers client
// Prépare le dossier en 1 clic : ① téléchargement du PDF Bouclier,
// ② message juridique pré-rédigé copié dans le presse-papier,
// ③ ouverture du Centre de Résolution Airbnb.
// Les deux variantes (Bouclier automatisé / EDL classique) ont des
// messages VÉRIDICALS : le classique capture GPS + IP et signe la
// photo, le Bouclier prouve par la vidéo walkthrough hashée (traversée
// continue des pièces, jusqu'à 60 s) — chaque message ne promet que
// ce que le module délivre vraiment.
// =============================================================

/** URL du Centre de Résolution Airbnb (cible du 1-clic). */
export const AIRBNB_RESOLUTION_CENTER_URL = 'https://www.airbnb.fr/resolution-center';

/** Assainit une chaîne pour un nom de fichier téléchargé. */
export function sanitizeFilePart(value: string): string {
  const clean = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return clean || 'Logement';
}

/** ① Téléchargement direct du PDF (ancre temporaire + attribut download). */
export function triggerDownload(url: string, filename: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/** Copie presse-papier robuste : Clipboard API → repli execCommand. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Contexte non sécurisé ou permission refusée → repli ci-dessous.
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    ta.style.pointerEvents = 'none';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** ③ Ouvre le Centre de Résolution Airbnb — false si le pop-up est bloqué. */
export function openAirbnbResolutionCenter(): boolean {
  const win = window.open(AIRBNB_RESOLUTION_CENTER_URL, '_blank');
  if (win) {
    win.opener = null; // sécurité : pas de reverse tabnabbing
    return true;
  }
  return false;
}

/** Résultat de la préparation du dossier. */
export interface DisputePrepResult {
  copied: boolean;
  popupBlocked: boolean;
}

/**
 * Orchestration complète du 1-clic (ordre du cahier des charges) :
 * télécharger le PDF → copier le message → ouvrir Airbnb.
 * Si le pop-up est bloqué, l'appelant propose un lien « Ouvrir Airbnb ».
 */
export async function prepareAirbnbDispute(payload: {
  pdfUrl: string;
  pdfFilename: string;
  message: string;
}): Promise<DisputePrepResult> {
  triggerDownload(payload.pdfUrl, payload.pdfFilename);
  const copied = await copyText(payload.message);
  const popupBlocked = !openAirbnbResolutionCenter();
  return { copied, popupBlocked };
}

// -------------------------------------------------------------
// Message juridique — BOUCLIER AUTOMATISÉ (session 6 zones + vidéo)
// -------------------------------------------------------------

export function buildShieldDisputeMessage(input: {
  propertyName: string;
  ownerName: string;
  sessionRef: string;
  completedAt: string;
  videoToken: string | null;
  videoSha256: string | null;
  origin: string;
}): string {
  const d = new Date(input.completedAt);
  const dateFr = Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('fr-FR');
  const link = input.videoToken
    ? `${input.origin}/shield/video/${input.videoToken}`
    : null;
  const lines = [
    'Bonjour,',
    '',
    `Suite à un litige concernant le logement « ${input.propertyName} » pour le séjour du ${dateFr} (référence dossier ${input.sessionRef}), je vous transmets le rapport d'état des lieux certifié.`,
    '',
    'Ce document a été généré par le système sécurisé Roomscan Inventaire. Il inclut :',
    '- Les photos horodatées des 6 zones de contrôle, comparables point par point à l\'état des lieux d\'entrée.',
    `- Le Hash SHA256 de vérification : ${input.videoSha256 || 'Voir PDF'}`,
    "- Le QR Code de vérification d'authenticité.",
    '',
    link
      ? "La vidéo walkthrough (traversée continue de toutes les pièces, ininterrompue) certifiant l'état global du logement est accessible via le QR Code présent dans le PDF ou via ce lien sécurisé : " + link
      : "La vidéo walkthrough (traversée continue de toutes les pièces, ininterrompue) certifiant l'état global du logement est accessible via le QR Code présent dans le PDF.",
    '',
    'Je reste à votre disposition pour toute information complémentaire.',
    '',
    'Cordialement,',
    input.ownerName,
  ];
  return lines.join('\n');
}

// -------------------------------------------------------------
// Message juridique — EDL CLASSIQUE (photos GPS + signature + hash)
// -------------------------------------------------------------

export function buildClassicDisputeMessage(input: {
  propertyName: string;
  guestName: string;
  scheduledDate: string;
  sha256Hash: string | null;
  ownerName: string;
  shareUrl: string;
}): string {
  const d = new Date(input.scheduledDate);
  const dateFr = Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('fr-FR');
  const lines = [
    'Bonjour,',
    '',
    `Suite à un litige concernant le logement « ${input.propertyName} » pour le séjour de ${input.guestName} (du ${dateFr}), je vous transmets le rapport d'état des lieux certifié.`,
    '',
    'Ce document a été généré par le système sécurisé Roomscan Inventaire. Il inclut :',
    '- Les photos horodatées et géolocalisées.',
    `- Le Hash SHA256 de vérification : ${input.sha256Hash || 'Voir PDF'}`,
    "- Le QR Code de vérification d'authenticité.",
    '',
    `Le détail complet de l'état des lieux (pièce par pièce, avec signature électronique) est accessible via le QR Code présent dans le PDF ou via ce lien sécurisé : ${input.shareUrl}`,
    '',
    'Je reste à votre disposition pour toute information complémentaire.',
    '',
    'Cordialement,',
    input.ownerName,
  ];
  return lines.join('\n');
}
