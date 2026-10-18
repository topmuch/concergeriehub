// =============================================================
// v4.112 « TTS PREMIUM — VOIX MICROSOFT DENISE » (edge-tts)
// src/lib/tts-service.ts
//
// Remplace la synthèse vocale par la voix neuronale MICROSOFT
// « Denise » (fr-FR-DeniseNeural) via la librairie gratuite
// edge-tts (service Edge Read Aloud, SANS clé API) : rendu humain,
// chaleureux et premium pour les messages d'accueil, les rappels de
// checkout et les consignes du Hub.
//
// Paramètres EXACTS (spécification « rendu naturel et luxueux ») :
//   • Voix  : fr-FR-DeniseNeural
//   • Rate  : -5%   (légèrement plus lent — ton posé, accueillant)
//   • Pitch : +0Hz  (normal)
//
// Deux usages :
//   1. FICHIERS MP3 PRÉ-GÉNÉRÉS — generatePremiumAudio(text, file)
//      écrit public/audio/<file> (servi en statique, zéro temps de
//      chargement pour l'invité) ; ensurePremiumAudio() ne régénère
//      PAS si le fichier existe déjà (idempotent).
//   2. CASCADE DU PIPELINE VOCAUX DU HUB — generatePremiumSpeech()
//      renvoie le MP3 brut ; branchée en VOIE 0 de
//      src/lib/voice-tts.ts (avant Z.ai → Google TTS).
//
// ROBUSTESSE : le service edge-tts parle à
// speech.platform.bing.com en WebSocket. Si le réseau bloque ce
// protocole (sandbox, pare-feu sortant strict), chaque fonction
// échoue PROPREMENT (null / throw capté par l'appelant) et la
// cascade existante (Z.ai → Google Translate TTS) ou le repli
// navigateur Web Speech API prennent le relais.
//
// ⚠️ Dépendance : « edge-tts » est distribué en TypeScript BRUT
// (main: index.ts) → il DOIT rester dans next.config transpilePackages
// (Node ne peut pas require du TS à runtime).
// =============================================================

import fs from 'fs';
import path from 'path';
import { tts, ttsSave } from 'edge-tts';

/** La voix premium demandée par le client. */
export const PREMIUM_TTS_VOICE = 'fr-FR-DeniseNeural';
/** Vitesse : légèrement plus lent pour un ton posé et accueillant. */
export const PREMIUM_TTS_RATE = '-5%';
/** Tonalité normale. */
export const PREMIUM_TTS_PITCH = '+0Hz';

/** Voix Edge neuronale par langue du Hub (Denise = FR ; soeurs
 *  neuronales de même génération pour EN/ES/AR). */
export const PREMIUM_VOICE_BY_LANG: Record<string, string> = {
  fr: 'fr-FR-DeniseNeural',
  en: 'en-GB-SoniaNeural',
  es: 'es-ES-ElviraNeural',
  ar: 'ar-SA-ZariyahNeural',
};

/** Dossier de sortie des MP3 (servi en statique par Next depuis public/).
 *  Surchargable via TTS_AUDIO_DIR (ex. volume persistant Coolify). */
export function ttsAudioDir(): string {
  return process.env.TTS_AUDIO_DIR ?? path.join(process.cwd(), 'public', 'audio');
}

/** URL publique correspondant à un fichier du dossier audio. */
function audioUrl(fileName: string): string {
  return `/audio/${fileName.split('/').map(encodeURIComponent).join('/')}`;
}

/** Nom de fichier sûr : lettres/chiffres/-/_ (pas de traversée de chemin). */
function safeFileName(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  return base.endsWith('.mp3') ? base : `${base}.mp3`;
}

/** Durée estimée (s) d'un MP3 edge-tts (sortie mono 24 kHz ≈ 48 kbps). */
function estimateDurationSec(bytes: number): number {
  return Math.max(1, Math.round((bytes * 8) / 48_000));
}

/**
 * Génère un MP3 « voix Denise » et le sauvegarde dans le dossier audio.
 *
 * @param text           Texte à synthétiser (tronqué à 600 caractères —
 *                       cohérent avec la durée max des vocaux du hub).
 * @param outputFileName Nom du fichier (ex. « hub/welcome-fr » → .mp3 ajouté).
 * @param opts.voice     Voix Edge (défaut : fr-FR-DeniseNeural).
 * @param opts.overwrite Regénérer même si le fichier existe (défaut false).
 * @returns URL publique du MP3 (ex. /audio/hub/welcome-fr.mp3),
 *          ou `null` si la synthèse a échoué (réseau, service…).
 *          L'appelant bascule alors sur son repli (cascade TTS ou
 *          Web Speech API navigateur).
 */
export async function generatePremiumAudio(
  text: string,
  outputFileName: string,
  opts?: { voice?: string; overwrite?: boolean },
): Promise<string | null> {
  try {
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, 600);
    if (!clean) return null;
    const fileName = safeFileName(outputFileName);
    const dir = ttsAudioDir();
    const outputPath = path.join(dir, fileName);

    if (!opts?.overwrite && fs.existsSync(outputPath)) {
      return audioUrl(fileName); // déjà généré → idempotent
    }
    fs.mkdirSync(dir, { recursive: true });

    await ttsSave(clean, outputPath, {
      voice: opts?.voice ?? PREMIUM_TTS_VOICE,
      rate: PREMIUM_TTS_RATE,
      pitch: PREMIUM_TTS_PITCH,
    });
    // Garde-fou : un MP3 valide d'~1 s fait > 4 Ko.
    const size = fs.existsSync(outputPath) ? fs.statSync(outputPath).size : 0;
    if (size < 500) {
      try {
        fs.unlinkSync(outputPath);
      } catch {
        /* noop */
      }
      return null;
    }
    console.log(`[tts-service] MP3 Denise généré : ${fileName} (${Math.round(size / 1024)} Ko)`);
    return audioUrl(fileName);
  } catch (error) {
    console.error(
      '[tts-service] Génération Denise impossible (repli appelant attendu) :',
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * Idempotent : renvoie l'URL du MP3 s'il existe déjà (pré-généré au
 * déploiement / à la création de la propriété), sinon le génère.
 * Fire-and-forget friendly (jamais throw).
 */
export async function ensurePremiumAudio(
  text: string,
  outputFileName: string,
  opts?: { voice?: string },
): Promise<string | null> {
  return generatePremiumAudio(text, outputFileName, { voice: opts?.voice, overwrite: false });
}

/**
 * MP3 BRUT (Buffer) pour la cascade de src/lib/voice-tts.ts — même
 * voix/paramètres premium, sans écriture disque. `null` si échec.
 */
export async function generatePremiumSpeech(
  text: string,
  lang: string = 'fr',
): Promise<Buffer | null> {
  try {
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, 600);
    if (!clean) return null;
    const voice = PREMIUM_VOICE_BY_LANG[lang] ?? PREMIUM_TTS_VOICE;
    const mp3 = await tts(clean, {
      voice,
      rate: PREMIUM_TTS_RATE,
      pitch: PREMIUM_TTS_PITCH,
    });
    if (!mp3 || mp3.length < 500) return null;
    return Buffer.from(mp3);
  } catch (error) {
    console.error(
      '[tts-service] Synthèse Denise impossible (cascade suivante attendue) :',
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

export { estimateDurationSec };
