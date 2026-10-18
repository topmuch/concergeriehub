// =============================================================
// v4.37 « MESSAGES VOCAUX DU HUB » — GÉNÉRATION TTS SERVEUR
// v4.40 « REPLI GOOGLE TTS » — la génération marche PARTOUT
// src/lib/voice-tts.ts
//
// Historique : la synthèse Z.ai (v4.37–v4.39) fonctionne dans le
// sandbox mais JAMAIS en prod — constaté au post-check v4.40 :
// internal-api.z.ai résout (DNS publics 8.8.8.8 / 1.1.1.1) en
// adresses PRIVÉES 172.25.x.x (réseau interne Z.ai) → injoignable
// depuis un serveur externe (Coolify : 502 après ~12 s).
//
// Deux voies en cascade :
//
//   Voie 1 — Z.AI SDK (qualité maximale quand joignable) :
//     a. (arabe) translittération LLM arabe → latin phonétique
//        (le moteur Z.ai ne lit PAS l'écriture arabe — test v4.37) ;
//     b. synthèse WAV 24 kHz (l'API refuse le MP3 direct, erreur
//        1214 « response_format non supporté ») ;
//     c. WAV → MP3 64 kbps mono via @breezystack/lamejs (pur JS,
//        aucun ffmpeg requis dans l'image Docker Coolify).
//     • DISJONCTEUR : après le 1er échec, la voie Z.ai est SAUTÉE
//       pendant 10 min (sinon chaque génération paierait ~12 s de
//       timeout réseau avant le repli) ;
//     • simplement sautée si non configurée.
//
//   Voie 2 — GOOGLE TRANSLATE TTS (repli universel, SANS clé) :
//     translate_tts?client=tw-ob — MP3 64 kbps 24 kHz direct (aucune
//     conversion nécessaire), l'arabe est lu NATIVEMENT (tl=ar, pas
//     de translittération requise), segments de ≤ 200 caractères
//     concaténés (les frames MP3 sont auto-porteuses).
//     Testé v4.40 depuis IP datacenter : fr/en/es/ar HTTP 200,
//     en-têtes MPEG validés — qualité claire, adaptée aux messages
//     d'accueil. Si Google bloque aussi l'IP → erreur honnête, et
//     « 📤 Ma propre voix » reste toujours disponible.
//
// Voix Z.ai par langue (tests v4.37, transcript croisé TTS→ASR) :
//   fr → 'xiaochen' (seule voix à débit normal sur le français)
//   en → 'jam'      (voix britannique native — parfait)
//   es → 'xiaochen' (meilleur compromis testé)
//   ar → 'jam'      (sur texte translittéré — arabe reconnaissable)
//
// Limites API Z.ai : 1024 caractères/requête (on plafonne à 600 ≈
// 30 s), rate limit 429 par rafales → retries exponentiels 16/32 s.
// =============================================================

import ZAI from 'z-ai-web-dev-sdk';
// Encodeur MP3 pur JS (ESM « type: module ») — l'import NOMMÉ est la
// seule voie fiable : le build require (IIFE) n'expose pas Mp3Encoder
// sous Bun/Next (interop CJS → undefined, constaté au test v4.37).
import { Mp3Encoder } from '@breezystack/lamejs';
// v4.112 « TTS PREMIUM » — voie 0 : voix neuronale Microsoft « Denise »
// (edge-tts, gratuit, sans clé) pour un rendu humain et chaleureux.
import { generatePremiumSpeech, estimateDurationSec } from '@/lib/tts-service';

/** Langues de voix supportées (demande client v4.37 : FR·EN·ES·AR). */
export const VOICE_LANGS = ['fr', 'en', 'es', 'ar'] as const;
export type VoiceLang = (typeof VOICE_LANGS)[number];

export const VOICE_LANG_LABELS: Record<VoiceLang, string> = {
  fr: 'Français',
  en: 'English',
  es: 'Español',
  ar: 'العربية (Arabe)',
};

const TTS_VOICE_BY_LANG: Record<VoiceLang, string> = {
  fr: 'xiaochen',
  en: 'jam',
  es: 'xiaochen',
  ar: 'jam',
};

/** Codes Google Translate TTS (identiques à nos langues — arabe lu
 *  nativement par Google, contrairement au moteur Z.ai). */
const GOOGLE_TL_BY_LANG: Record<VoiceLang, string> = {
  fr: 'fr',
  en: 'en',
  es: 'es',
  ar: 'ar',
};

/** Plafond serveur du texte TTS (600 ≈ 30 s à débit normal, cohérent
 *  avec la durée max des vocaux — demande client). */
export const MAX_TTS_CHARS = 600;

export interface GeneratedVoice {
  base64: string;
  mime: 'audio/mpeg';
  durationSec: number;
  sizeKb: number;
}

/** Écrit .z-ai-config depuis Z_AI_CONFIG_JSON si absent (1er appel) —
 *  même convention que /api/public/translate (config Coolify prod). */
async function ensureSdkConfig(): Promise<void> {
  const raw = process.env.Z_AI_CONFIG_JSON;
  if (!raw) return;
  try {
    const fs = await import('fs');
    const path = await import('path');
    const target = path.join(process.cwd(), '.z-ai-config');
    try {
      const existing = JSON.parse(fs.readFileSync(target, 'utf-8'));
      if (existing?.baseUrl && existing?.apiKey) return; // déjà en place
    } catch {
      /* absent ou invalide → on écrit */
    }
    const cfg = JSON.parse(raw) as { baseUrl?: string; apiKey?: string };
    if (!cfg?.baseUrl || !cfg?.apiKey) return;
    fs.writeFileSync(target, raw, { mode: 0o600 });
  } catch {
    /* config env invalide — le TTS restera indisponible */
  }
}

/** v4.39 — L'IA vocale est-elle disponible sur CE serveur ? Le SDK lit
 *  .z-ai-config (cwd / home / /etc) ; en son absence ET sans variable
 *  d'environnement Z_AI_CONFIG_JSON (Coolify), la synthèse Z.ai ne peut
 *  pas s'ouvrir — v4.40 : ce n'est plus une erreur, on passe au repli
 *  Google TTS (public, sans clé). */
export async function aiVoiceConfigured(): Promise<boolean> {
  if (process.env.Z_AI_CONFIG_JSON) return true;
  try {
    const fs = await import('fs');
    const os = await import('os');
    const candidates = [
      `${process.cwd()}/.z-ai-config`,
      `${os.homedir()}/.z-ai-config`,
      '/etc/.z-ai-config',
    ];
    return candidates.some((p) => fs.existsSync(p));
  } catch {
    return false;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Détecte une erreur 429 (rate limit SDK) dans un message d'erreur. */
function isRateLimitError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  return msg.includes('429') || msg.toLowerCase().includes('too many requests');
}

// =============================================================
// v4.40 — DISJONCTEURS + CASCADE
//   voie 0 (v4.112) : edge-tts « Denise » (WebSocket Microsoft)
//   voie 1 : Z.ai (qualité maximale quand joignable)
//   voie 2 : Google Translate TTS (repli universel, sans clé)
// =============================================================

/** Disjoncteur : timestamp jusqu'auquel la voie Z.ai est ignorée.
 *  Ouvert après le 1er échec (API injoignable depuis prod — IPs
 *  privées) → évite de payer ~12 s de timeout à CHAQUE génération. */
let zaiTtsDownUntil = 0;
const ZAI_TTS_COOLDOWN_MS = 10 * 60 * 1000; // réessaie toutes les 10 min

/** v4.112 — disjoncteur de la voie Denise (edge-tts) : le service
 *  Microsoft parle en WebSocket (wss://speech.platform.bing.com) —
 *  bloqué sur certains réseaux (sandbox, pare-feu sortant). Après le
 *  1er échec, la voie est SAUTÉE 10 min (cascade immédiate Z.ai →
 *  Google, sans repayer le timeout WebSocket à chaque génération). */
let edgeTtsDownUntil = 0;
const EDGE_TTS_COOLDOWN_MS = 10 * 60 * 1000;

/** Découpe un texte en segments ≤ max caractères aux frontières de mots
 *  (limite pratique Google translate_tts : ~200 caractères/requête). */
function splitForGoogleTTS(text: string, max = 200): string[] {
  if (text.length <= max) return [text];
  const words = text.split(' ');
  const chunks: string[] = [];
  let cur = '';
  for (const w of words) {
    const candidate = cur ? `${cur} ${w}` : w;
    if (candidate.length > max && cur) {
      chunks.push(cur);
      cur = w;
    } else {
      cur = candidate;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

/** Un segment → MP3 Google (translate_tts, endpoint public sans clé).
 *  UA navigateur requis (401/refus sinon). AbortSignal 15 s : un blocage
 *  réseau ne doit pas pendre indéfiniment. */
async function googleTTSChunk(
  text: string,
  lang: VoiceLang,
  idx: number,
  total: number,
): Promise<Buffer> {
  const url =
    `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${GOOGLE_TL_BY_LANG[lang]}` +
    `&total=${total}&idx=${idx}&textlen=${text.length}&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Referer: 'https://translate.google.com/',
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Google TTS HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // Un MP3 valide d'~1 s fait > 4 Ko — plus court = page d'erreur HTML.
  if (buf.length < 500) {
    throw new Error('Google TTS : réponse invalide (bloqué ou vide)');
  }
  return buf;
}

/** Voie 2 v4.40 — synthèse Google Translate TTS (sans clé). Les segments
 *  MP3 sont concaténés (frames auto-porteuses). Durée estimée sur le
 *  débit constant 64 kbps (sortie Google : mono 24 kHz). */
async function googleTTS(clean: string, lang: VoiceLang): Promise<GeneratedVoice> {
  const chunks = splitForGoogleTTS(clean, 200);
  const parts: Buffer[] = [];
  for (let i = 0; i < chunks.length; i++) {
    parts.push(await googleTTSChunk(chunks[i], lang, i, chunks.length));
    if (i < chunks.length - 1) await sleep(150); // politesse : espace les requêtes
  }
  const mp3 = Buffer.concat(parts);
  const durationSec = Math.max(1, Math.round((mp3.length * 8) / 64_000));
  return {
    base64: mp3.toString('base64'),
    mime: 'audio/mpeg',
    durationSec,
    sizeKb: Math.round(mp3.length / 1024),
  };
}

/** Voie 1 v4.40 — synthèse Z.ai (ex-générateur principal, extrait tel
 *  quel). Lance en cas d'échec — l'appelant ouvre le disjoncteur. */
async function zaiTTS(clean: string, lang: VoiceLang): Promise<GeneratedVoice> {
  // Arabe : translittération LLM (le moteur Z.ai ne lit pas l'écriture
  // arabe — Google, lui, la lit nativement, voir googleTTS).
  const ttsInput = lang === 'ar' ? await transliterateArabic(clean) : clean;

  await ensureSdkConfig();
  const zai = await ZAI.create();
  let wav: Buffer | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await zai.audio.tts.create({
        input: ttsInput,
        voice: TTS_VOICE_BY_LANG[lang],
        speed: 1.0,
        response_format: 'wav',
        stream: false,
      });
      const arrayBuffer = await response.arrayBuffer();
      wav = Buffer.from(new Uint8Array(arrayBuffer));
      break;
    } catch (e) {
      lastError = e;
      if (isRateLimitError(e) && attempt < 2) {
        await sleep(8000 * (attempt + 1) * 2); // 16 s puis 32 s
        continue;
      }
      throw e;
    }
  }
  if (!wav) throw lastError ?? new Error('Synthèse vocale échouée');

  // WAV → MP3 (lamejs) + métriques.
  const { pcm, sampleRate } = parseWav(wav);
  const durationSec = Math.round(pcm.length / sampleRate);
  const mp3 = encodeMp3(pcm, sampleRate);
  return {
    base64: mp3.toString('base64'),
    mime: 'audio/mpeg',
    durationSec,
    sizeKb: Math.round(mp3.length / 1024),
  };
}

/** Translittération LLM : écriture arabe → latin phonétique lisible par
 *  un moteur TTS orienté anglais (voix `jam`). Best-effort : en cas
 *  d'échec LLM, on renvoie le texte tel quel (le TTS produira un audio
 *  médiocre plutôt qu'aucune voix). */
export async function transliterateArabic(text: string): Promise<string> {
  try {
    await ensureSdkConfig();
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create(
      {
        messages: [
          {
            role: 'assistant',
            content:
              'You transliterate Arabic script into Latin letters for a text-to-speech engine. ' +
              'Spell each word the way an ENGLISH-speaking TTS engine would pronounce natural spoken Arabic: ' +
              'simple English phonetic spelling, no diacritics, no apostrophes for ayin/hamza (use plain vowels), ' +
              'write numbers as words in Arabic. ' +
              'Return ONLY the transliteration on a single line, nothing else, no quotes.',
          },
          { role: 'user', content: text },
        ],
        thinking: { type: 'disabled' },
      } as never,
    );
    const out = completion.choices[0]?.message?.content?.trim() ?? '';
    // Garde-fou : une translittération vide ou identique au texte arabe
    // (le LLM a échoué) → on renvoie l'entrée brute.
    if (out.length > 0 && !/[\u0600-\u06FF]/.test(out)) return out;
    return text;
  } catch {
    return text;
  }
}

/** Parse un fichier WAV (RIFF) → PCM Int16 + métriques. Gère les
 *  chunks non standard (le header « data » n'est pas toujours à 44 o). */
function parseWav(buffer: Buffer): {
  pcm: Int16Array;
  sampleRate: number;
  channels: number;
} {
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF') {
    throw new Error('Audio WAV invalide (en-tête RIFF absent)');
  }
  let offset = 12; // saute RIFF(12) + 'WAVE'
  let sampleRate = 24000;
  let channels = 1;
  let bitsPerSample = 16;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkId === 'fmt ') {
      channels = buffer.readUInt16LE(offset + 10);
      sampleRate = buffer.readUInt32LE(offset + 12);
      bitsPerSample = buffer.readUInt16LE(offset + 22);
    } else if (chunkId === 'data') {
      const dataStart = offset + 8;
      const dataEnd = Math.min(dataStart + chunkSize, buffer.length);
      const bytesPerSample = bitsPerSample / 8;
      const frameCount = Math.floor((dataEnd - dataStart) / (bytesPerSample * channels));
      // On ne garde que le canal 1 (mono source) — le TTS est mono.
      const pcm = new Int16Array(frameCount);
      for (let i = 0; i < frameCount; i++) {
        pcm[i] = buffer.readInt16LE(dataStart + i * bytesPerSample * channels);
      }
      return { pcm, sampleRate, channels: 1 };
    }
    offset += 8 + chunkSize + (chunkSize % 2); // chunks alignés sur 2 octets
  }
  throw new Error('Audio WAV invalide (chunk data absent)');
}

/** Encode PCM Int16 mono → MP3 via lamejs (pur JS, sans ffmpeg). */
function encodeMp3(pcm: Int16Array, sampleRate: number): Buffer {
  const encoder = new Mp3Encoder(1, sampleRate, 64);
  const chunks: Buffer[] = [];
  const BLOCK = 1152 * 20; // ~1 s par appel (multiples de 1152 frames)
  for (let i = 0; i < pcm.length; i += BLOCK) {
    const slice = pcm.subarray(i, Math.min(i + BLOCK, pcm.length));
    const encoded = encoder.encodeBuffer(slice);
    if (encoded.length > 0) chunks.push(Buffer.from(encoded));
  }
  const tail = encoder.flush();
  if (tail.length > 0) chunks.push(Buffer.from(tail));
  return Buffer.concat(chunks);
}

/** Génère la voix MP3 d'un message dans la langue donnée.
 *
 *  v4.40 — cascade : voie Z.ai (si configurée, joignable et disjoncteur
 *  fermé) → repli Google TTS (public, sans clé). Sur un serveur où
 *  internal-api.z.ai est injoignable (IPs privées — le cas prod), le
 *  1er appel ouvre le disjoncteur 10 min puis bascule sur Google :
 *  les générations suivantes répondent en 2-5 s sans timeout.
 *
 *  Retries 429 : 3 tentatives (délais 8/16/24 s) — la génération des
 *  4 langues est séquentielle côté client, ce qui espace déjà les appels. */
export async function generateVoiceMessage(
  text: string,
  lang: VoiceLang,
): Promise<GeneratedVoice> {
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, MAX_TTS_CHARS);
  if (!clean) throw new Error('Texte vide');
  if (!VOICE_LANGS.includes(lang)) throw new Error(`Langue non supportée : ${lang}`);

  // ── Voie 0 (v4.112) : edge-tts « Denise » — voix neuronale Microsoft
  //    premium, gratuite et sans clé. Toute erreur (WebSocket bloqué,
  //    service indisponible) ouvre le disjoncteur 10 min et bascule
  //    sur la cascade historique Z.ai → Google.
  if (Date.now() >= edgeTtsDownUntil) {
    const mp3 = await generatePremiumSpeech(clean, lang);
    if (mp3) {
      return {
        base64: mp3.toString('base64'),
        mime: 'audio/mpeg',
        durationSec: estimateDurationSec(mp3.length),
        sizeKb: Math.round(mp3.length / 1024),
      };
    }
    edgeTtsDownUntil = Date.now() + EDGE_TTS_COOLDOWN_MS;
    console.error(
      '[voice-tts] voie Denise (edge-tts) indisponible → disjoncteur 10 min, cascade Z.ai/Google',
    );
  }

  // ── Voie 1 : Z.ai (qualité maximale) — si configurée, disjoncteur
  //    fermé. Toute erreur (timeout réseau prod, 429, ...) ouvre le
  //    disjoncteur 10 min et bascule sur Google.
  if (Date.now() >= zaiTtsDownUntil && (await aiVoiceConfigured())) {
    try {
      return await zaiTTS(clean, lang);
    } catch (e) {
      zaiTtsDownUntil = Date.now() + ZAI_TTS_COOLDOWN_MS;
      console.error(
        '[voice-tts] voie Z.ai en échec → disjoncteur 10 min, repli Google :',
        e instanceof Error ? e.message : e,
      );
    }
  }

  // ── Voie 2 : repli Google Translate TTS (public, sans clé) ──
  return googleTTS(clean, lang);
}
