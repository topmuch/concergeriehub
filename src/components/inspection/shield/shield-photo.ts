// =============================================================
// ROOMSCAN BOUCLIER AUTOMATISÉ (v5.1) — HELPERS CAPTURE PHOTO
// Compression côté client identique au module invité
// (src/components/inspection/guest/photo.ts) : max 1280 px, JPEG
// qualité dégressive 0,82 → 0,6 → 0,45 jusqu'à respecter la limite
// serveur de 500 Ko par dataURL. + encodage base64 vidéo (blob).
// =============================================================

const SHIELD_QUALITIES = [0.82, 0.6, 0.45];

/** Taille approximative en octets d'un dataURL base64. */
function dataUrlBytes(dataUrl: string): number {
  const idx = dataUrl.indexOf(',');
  if (idx === -1) return Number.MAX_SAFE_INTEGER;
  return Math.floor(((dataUrl.length - idx - 1) * 3) / 4);
}

/**
 * Compresse un canvas en dataURL JPEG : downscale à maxDim puis
 * dégradation de qualité jusqu'à maxBytes. Retourne toujours la
 * meilleure tentative (jamais null) — le canvas est déjà peint.
 */
export function canvasToCompressedDataUrl(
  canvas: HTMLCanvasElement,
  maxDim = 1280,
  maxBytes = 500_000,
): string {
  const scale = Math.min(1, maxDim / Math.max(canvas.width, canvas.height, 1));
  let target = canvas;
  if (scale < 1) {
    const w = Math.max(1, Math.round(canvas.width * scale));
    const h = Math.max(1, Math.round(canvas.height * scale));
    const scaled = document.createElement('canvas');
    scaled.width = w;
    scaled.height = h;
    const ctx = scaled.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(canvas, 0, 0, w, h);
      target = scaled;
    }
  }
  let best = '';
  for (const quality of SHIELD_QUALITIES) {
    let dataUrl = '';
    try {
      dataUrl = target.toDataURL('image/jpeg', quality);
    } catch {
      dataUrl = '';
    }
    if (!dataUrl) continue;
    best = dataUrl;
    if (dataUrlBytes(dataUrl) <= maxBytes) return dataUrl;
  }
  return best;
}

/**
 * Fichier → dataURL JPEG compressé (via Image + canvas, même logique
 * que canvasToCompressedDataUrl). Null si le fichier est
 * indécodable (HEIC, image corrompue…).
 */
export function fileToShieldPhotoDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    const cleanup = () => URL.revokeObjectURL(url);
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, img.naturalWidth);
        canvas.height = Math.max(1, img.naturalHeight);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          cleanup();
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0);
        cleanup();
        resolve(canvasToCompressedDataUrl(canvas));
      } catch {
        cleanup();
        resolve(null);
      }
    };
    img.onerror = () => {
      cleanup();
      resolve(null);
    };
    img.src = url;
  });
}

/** Blob (vidéo…) → base64 SANS le préfixe data:. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(new Error('lecture_blob_impossible'));
    reader.readAsDataURL(blob);
  });
}
