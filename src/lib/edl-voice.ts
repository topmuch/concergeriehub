// =============================================================
// v5.12 « GUIDAGE VOCAL DES ÉTATS DES LIEUX » — src/lib/edl-voice.ts
//
// Construit le script vocal (voix guide « Denise ») qui accompagne
// l'agent — typiquement la femme de ménage — pendant la capture d'un
// état des lieux : une consigne par zone (photo) + l'encadrement
// complet de la vidéo walkthrough (Option 3 validée par le client :
// consignes complètes AVANT l'enregistrement, quelques repères
// vocaux COURTS pendant, message de fin).
//
// Réutilise le moteur TTS existant (src/lib/tts-service.ts) :
//   · edge-tts gratuit SANS clé API — fr-FR-DeniseNeural, rate -5 % ;
//   · MP3 écrits dans public/audio/ (servis en statique) ;
//   · idempotent : un MP3 déjà généré n'est pas régénéré.
//
// CACHE PAR EMPREINTE : le nom de fichier = sha256(texte) tronqué
// (edl-<hash16>.mp3). Deux sessions avec les mêmes zones et le même
// type réutilisent les MÊMES fichiers → le disque reste borné au
// nombre de textes distincts (et non au nombre de sessions).
//
// SÉCURITÉ : la route appelante ne transmet QUE { type, propertyName,
// zoneNames, videoTargetSec } — les textes sont TOUJOURS reconstruits
// ici à partir de ces seules entrées (pas de synthèse de texte
// arbitraire). Zone names bornés (24 zones × 60 caractères).
// =============================================================

import { createHash } from 'crypto';
import { ensurePremiumAudio } from './tts-service';

export type EdlVoiceType = 'CHECK_IN' | 'CHECK_OUT';

/** Limites d'entrée (durcies côté route API). */
export const EDL_VOICE_MAX_ZONES = 24;
export const EDL_VOICE_ZONE_NAME_MAX = 60;
export const EDL_VOICE_PROPERTY_MAX = 120;

/** Clés de messages du guidage (stables, consommées par le client). */
export const EDL_VOICE_KEYS = [
  'video-intro',
  'video-cue-1',
  'video-cue-2',
  'video-cue-3',
  'video-end',
] as const;

export interface EdlVoiceMessage {
  key: string;
  text: string;
  url: string;
}

/** Nettoie une entrée utilisateur : espaces aplatis, caractères de contrôle supprimés, tronquée. */
export function sanitizeVoiceInput(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Consigne photo adaptée au TYPE de pièce (nom de zone dynamique). */
function roomInstruction(zoneName: string): string {
  const n = zoneName.toLowerCase();
  if (/(salon|s[eé]jour|living)/.test(n)) {
    return 'Placez-vous au centre de la pièce et prenez une photo en grand angle. Assurez-vous que tout le salon est visible.';
  }
  if (/(couloir|entr[eé]e|hall|d[eé]gagement)/.test(n)) {
    return 'Prenez la photo depuis l\u2019entrée, en montrant toute la longueur du couloir.';
  }
  if (/(chambre|suite)/.test(n)) {
    return 'Prenez la photo depuis la porte. Le lit et les rangements doivent être bien visibles.';
  }
  if (/(cuisine|kitchen|coin repas)/.test(n)) {
    return 'Prenez la photo en grand angle. Ouvrez les placards et montrez les appareils électroménagers.';
  }
  if (/(salle de bains?|salle d\u2019eau|\bwc\b|toilettes?\b|bain)/.test(n)) {
    return 'Prenez la photo en grand angle. Montrez la douche ou la baignoire, la vasque et les joints.';
  }
  if (/(terrass|balcon|jardin|ext[eé]rieur|parking|cave|garage|piscine|buanderie)/.test(n)) {
    return 'Montrez l\u2019espace en entier, ainsi que son accès.';
  }
  return 'Placez-vous au centre de la pièce et prenez une photo en grand angle. Toute la pièce doit être visible.';
}

/** Libellé parlé de la durée vidéo cible (« 2 minutes », « 1 minute », « 90 secondes »…). */
function durationLabel(targetSec: number): string {
  if (targetSec >= 100) return '2 minutes';
  if (targetSec >= 45) return '1 minute';
  return `${targetSec} secondes`;
}

export interface EdlVoiceScriptInput {
  type: EdlVoiceType;
  propertyName: string;
  zoneNames: string[];
  videoTargetSec: number;
}

/**
 * Construit TOUS les textes du guidage pour une session.
 * Retour : map clé → texte (clés `step-0..N-1` + `video-*`).
 */
export function buildEdlVoiceScript(input: EdlVoiceScriptInput): Record<string, string> {
  const isCheckIn = input.type === 'CHECK_IN';
  const edlLabel = isCheckIn ? 'état des lieux d\u2019entrée' : 'état des lieux de sortie';
  const zones = input.zoneNames;
  const total = zones.length;
  const texts: Record<string, string> = {};

  zones.forEach((zoneName, i) => {
    const instruction = roomInstruction(zoneName);
    const step = `Étape ${i + 1} sur ${total} : ${zoneName}. ${instruction}`;
    texts[`step-${i}`] =
      i === 0
        ? `Bienvenue. Nous allons réaliser l'${edlLabel} de ${input.propertyName}. ${step}`
        : step;
  });

  texts['video-intro'] =
    `Nous allons maintenant filmer le logement pendant ${durationLabel(input.videoTargetSec)}. ` +
    `Traversez toutes les pièces une par une, sans interruption : commencez par ${zones[0] ?? 'la première pièce'}, ` +
    `puis montrez toutes les pièces. Ouvrez les placards et montrez les appareils électroménagers.`;

  // Option 3 (validée client) : repères vocaux COURTS pendant l'enregistrement.
  // Chronologie (cible 120 s) : ⅓ ≈ 40 s, 5/8 ≈ 75 s, puis « il reste 30 s » à 90 s.
  texts['video-cue-1'] = 'Bien. Continuez vers la pièce suivante.';
  texts['video-cue-2'] = 'Montrez l\u2019intérieur du réfrigérateur et les plaques de cuisson.';
  texts['video-cue-3'] = 'Il reste 30 secondes. Terminez par les chambres et la salle de bain.';
  texts['video-end'] =
    'Parfait. La vidéo est terminée. Vous pouvez maintenant valider votre état des lieux.';

  return texts;
}

/** Empreinte de cache d'un texte (16 hex — nom de fichier stable et borné). */
export function edlVoiceCacheKey(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

/** URL publique d'un MP3 du guidage — diffusé par la route /api/audio/[file]
 *  (les fichiers écrits au runtime ne sont pas servis en statique en prod
 *  standalone : v5.13). */
export function edlVoiceUrl(text: string): string {
  return `/api/audio/edl-${edlVoiceCacheKey(text)}.mp3`;
}

/**
 * Pré-génère (idempotent, fire-and-forget friendly) les MP3 du guidage.
 * Ne JAMAIS throw — chaque échec est journalisé et le repli Web Speech
 * API du client prend le relais.
 */
export async function ensureEdlVoiceAudio(texts: Record<string, string>): Promise<number> {
  let generated = 0;
  for (const [key, text] of Object.entries(texts)) {
    if (!text) continue;
    const url = await ensurePremiumAudio(text, `edl-${edlVoiceCacheKey(text)}`);
    if (url) generated += 1;
    else console.warn(`[edl-voice] MP3 non généré (${key}) — repli Web Speech API client actif.`);
  }
  return generated;
}
