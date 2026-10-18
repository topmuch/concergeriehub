// =============================================================
// v4.97 MODULE STANDALONE « ÉTAT DES LIEUX » — COMPRESSION PHOTO
// Technique reprise de fileToHubPhotoDataUrl (src/lib/hub-photos.ts)
// : createImageBitmap + canvas, max 1280 px, JPEG qualité dégressive
// (0,8 → 0,6 → 0,45) jusqu'à respecter la limite serveur de 500 Ko
// par dataURL. Retourne null si le fichier est indécodable (HEIC…).
// =============================================================

const MAX_W = 1280;
const MAX_BYTES = 500 * 1024;

/** Taille approximative en octets d'un dataURL base64. */
function dataUrlBytes(dataUrl: string): number {
  const idx = dataUrl.indexOf(',');
  if (idx === -1) return Number.MAX_SAFE_INTEGER;
  return Math.floor(((dataUrl.length - idx - 1) * 3) / 4);
}

export async function fileToDefectPhotoDataUrl(file: File): Promise<string | null> {
  const qualities = [0.8, 0.6, 0.45];
  for (const quality of qualities) {
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, MAX_W / Math.max(bitmap.width, 1));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        bitmap.close();
        return null;
      }
      ctx.drawImage(bitmap, 0, 0, w, h);
      bitmap.close();
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (dataUrlBytes(dataUrl) <= MAX_BYTES) return dataUrl;
      // Trop volumineux → qualité inférieure (boucle suivante).
    } catch {
      return null;
    }
  }
  return null;
}
