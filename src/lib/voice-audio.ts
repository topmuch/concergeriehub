// =============================================================
// voice-audio — helpers partagés MESSAGES VOCAUX
//
// PROBLÈME RÉSOLU (production) :
//  1. Les fichiers audio étaient écrits dans public/uploads/voice/
//     à l'exécution. En build standalone (Docker Coolify), Next.js
//     ne sert PAS les fichiers ajoutés dans public/ après le build
//     (inventaire statique calculé au démarrage) → lecture 404.
//  2. Le volume Docker ne contenait pas /app/public/uploads → les
//     audios disparaissaient à chaque redéploiement.
//
// SOLUTION :
//  - Écriture dans <cwd>/data/uploads/voice (même volume persistant
//    que la base /app/data en Docker) — override via VOICE_UPLOAD_DIR.
//  - Lecture via la route API /api/uploads/voice/<fichier> (servie
//    dynamiquement, avec Content-Type correct par extension).
//  - `voiceAudioSrc()` réécrit les anciennes URLs /uploads/voice/…
//    (stockées en base) vers la route API → rétrocompatible.
//  - Détection du mimeType MediaRecorder supporté (Safari/iOS
//    n'enregistre PAS en webm — il faut audio/mp4 → .m4a).
// =============================================================

/** Extensions audio autorisées (allowlist serveur, alignée sur les routes d'upload). */
export const VOICE_ALLOWED_EXT = ['webm', 'ogg', 'mp3', 'm4a', 'wav'] as const;
export type VoiceAudioExt = (typeof VOICE_ALLOWED_EXT)[number];

/** Content-Type servi par la route de lecture, par extension. */
export const VOICE_CONTENT_TYPES: Record<VoiceAudioExt, string> = {
  webm: 'audio/webm',
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
};

/**
 * Réécrit l'URL d'un audio vocal stocké en base vers la route de
 * lecture dynamique. Sère aussi bien les nouveaux fichiers
 * (<data>/uploads/voice) que les anciens (public/uploads/voice).
 * Retourne la valeur d'origine si l'URL n'est pas un chemin vocal local.
 */
export function voiceAudioSrc(audioUrl: string): string {
  if (!audioUrl) return audioUrl;
  const marker = '/uploads/voice/';
  const idx = audioUrl.indexOf(marker);
  if (idx === -1) return audioUrl; // ex. /demo/… ou URL externe : inchangé
  const filename = audioUrl.slice(idx + marker.length).split(/[?#]/)[0];
  if (!/^[A-Za-z0-9._-]+$/.test(filename)) return audioUrl;
  return `/api/uploads/voice/${filename}`;
}

/**
 * v4.32 « AUDIO DURABLE » — source de lecture d'un message vocal.
 *
 * Les fichiers disque (<cwd>/data/uploads/voice) n'étaient pas garantis
 * persistants en Docker : à chaque redéploiement, les audios devenaient
 * 404 → « les audios reçus ne marchent pas » dans le dashboard.
 *
 * Les routes d'upload stockent désormais une COPIE dataURL (base64) en
 * base (VoiceMessage.audioData) : la lecture la privilégie et retombe
 * sur l'URL fichier pour les anciens messages.
 */
export function voicePlaybackSrc(
  audioData: string | null | undefined,
  audioUrl: string | null | undefined,
): string {
  if (audioData && audioData.startsWith('data:audio/')) return audioData;
  // v4.35 « VOCAL ILLISIBLE » — certains anciens enregistrements (ou des
  // imports tiers) contiennent du base64 NU (sans préfixe data:). Avant,
  // on retombait silencieusement sur l'URL fichier (souvent 404 après
  // redéploiement) → « le vocal ne se lit pas ». On reconstitue ici la
  // dataURL avec le mimeType sniffé depuis les magic numbers.
  if (audioData && audioData.length > 64 && !audioData.startsWith('data:')) {
    const mime = guessAudioMime(audioData) ?? 'audio/webm';
    return `data:${mime};base64,${audioData}`;
  }
  return voiceAudioSrc(audioUrl ?? '');
}

/**
 * v4.35 — devine le mimeType d'un flux base64 (NU) à partir des
 * magic numbers des premiers octets. Retourne null si inconnu.
 */
export function guessAudioMime(base64: string): string | null {
  try {
    let head = '';
    if (typeof atob === 'function') {
      const bin = atob(base64.slice(0, 32));
      head = bin.slice(0, 16);
    } else if (typeof Buffer !== 'undefined') {
      head = Buffer.from(base64.slice(0, 32), 'base64').toString('binary').slice(0, 16);
    } else {
      return null;
    }
    const b = head.split('').map((c) => c.charCodeAt(0));
    const ext = sniffAudioExt(new Uint8Array(b));
    return ext ? VOICE_CONTENT_TYPES[ext as VoiceAudioExt] ?? null : null;
  } catch {
    return null;
  }
}

/** Candidats de mimeType MediaRecorder, par préférence. Safari/iOS
 *  ne supporte ni webm ni opus → tombe sur audio/mp4 (AAC). */
const RECORDER_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/mpeg',
] as const;

/** Premier mimeType réellement supporté par le navigateur courant ('' si aucun). */
export function pickRecorderMime(): string {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return '';
  }
  for (const candidate of RECORDER_MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(candidate)) return candidate;
    } catch {
      // navigateur exotique : candidat suivant
    }
  }
  return '';
}

/** Sous-type → extension fichier (alignée sur l'allowlist serveur). */
const EXT_BY_SUBTYPE: Record<string, VoiceAudioExt> = {
  webm: 'webm',
  mp4: 'm4a',
  ogg: 'ogg',
  mpeg: 'mp3',
  mp3: 'mp3',
  wav: 'wav',
  'x-wav': 'wav',
  wave: 'wav',
};

/** Extension d'un mimeType (ex. 'audio/mp4;codecs=…' → 'm4a'). */
export function extForMime(mime: string): VoiceAudioExt {
  const base = (mime || '').split(';')[0].trim().toLowerCase();
  const subtype = base.split('/')[1] ?? '';
  return EXT_BY_SUBTYPE[subtype] ?? 'webm';
}

/**
 * Magic numbers audio — l'extension CLIENT n'est JAMAIS de confiance.
 * Partagé par les routes d'upload vocal (réponse hôte session/PIN).
 * Retourne l'extension sniffée ou null si le binaire n'est pas reconnu.
 */
export function sniffAudioExt(bytes: Uint8Array): string | null {
  const b = bytes;
  const ascii = (start: number, text: string) =>
    b.length >= start + text.length &&
    String.fromCharCode(...b.slice(start, start + text.length)) === text;
  // WebM/Matroska (EBML)
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'webm';
  // OGG
  if (ascii(0, 'OggS')) return 'ogg';
  // MP3 (ID3 tag ou frame sync MPEG)
  if (ascii(0, 'ID3')) return 'mp3';
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return 'mp3';
  // WAV (RIFF....WAVE)
  if (ascii(0, 'RIFF') && ascii(8, 'WAVE')) return 'wav';
  // MP4/M4A — 'ftyp' à l'offset 4
  if (ascii(4, 'ftyp')) return 'm4a';
  return null;
}
