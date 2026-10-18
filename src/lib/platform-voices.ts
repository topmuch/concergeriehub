// =============================================================
// WP-BACK v4.61 — VOIX PAR DÉFAUT DE LA PLATEFORME
// src/lib/platform-voices.ts — SERVER ONLY
//
// Le Superadmin définit des voix par défaut (TTS ou upload) pour les
// messages vocaux du Hub — appliquées à TOUS les biens qui n'ont pas
// défini leur propre voix pour un couple (kind, lang) :
//   bien définit → voix du bien (source 'tts' | 'upload') ;
//   sinon        → voix plateforme (source 'platform', repli lecture).
//
// STOCKAGE : table SystemSetting (clé/valeur JSON, pattern lib/settings.ts —
// aucun changement de schéma). Clé unique 'platform_voice_messages' :
//   { [kind]: { [lang]: { audioData, audioMime, durationSec?, text?,
//                         source: 'tts'|'upload', updatedAt } } }
// audioData = base64 SANS préfixe dataURL (le préfixe est déduit de
// audioMime à la lecture — même convention que HubVoiceMessage).
// =============================================================
import { db } from '@/lib/db';

/** Kinds de voix autorisés (alignés HubVoiceMessage.kind + guidebook). */
export const PLATFORM_VOICE_KINDS = ['welcome', 'checkout_eve', 'checkout_day', 'guidebook'] as const;
export type PlatformVoiceKind = (typeof PLATFORM_VOICE_KINDS)[number];

/** Langues de voix autorisées (identiques à lib/voice-tts.ts). */
export const PLATFORM_VOICE_LANGS = ['fr', 'en', 'es', 'ar'] as const;
export type PlatformVoiceLang = (typeof PLATFORM_VOICE_LANGS)[number];

export interface PlatformVoiceEntry {
  /** Base64 brut (sans préfixe dataURL). */
  audioData: string;
  audioMime: string;
  durationSec?: number;
  /** Texte source (TTS) ou légende de l'enregistrement. */
  text?: string;
  source: 'tts' | 'upload';
  /** ISO string — sert de version de cache-bust (?v=). */
  updatedAt: string;
}

export type PlatformVoiceStore = Partial<
  Record<PlatformVoiceKind, Partial<Record<PlatformVoiceLang, PlatformVoiceEntry>>>
>;

const SETTING_KEY = 'platform_voice_messages';
/** Plafond taille binaire décodée (1 Mo — aligné sur les vocaux du hub). */
export const MAX_PLATFORM_VOICE_BYTES = 1024 * 1024;

/** Lit le store complet (tolérant : JSON illisible → store vide). */
export async function getPlatformVoiceStore(): Promise<PlatformVoiceStore> {
  try {
    const row = await db.systemSetting.findUnique({ where: { key: SETTING_KEY } });
    if (!row?.value) return {};
    const parsed = JSON.parse(row.value) as PlatformVoiceStore;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch (error) {
    console.error('[platform-voices] lecture impossible, store vide:', error);
    return {};
  }
}

/** Valide un couple (kind, lang) du store — garde les entrées complètes. */
function isValidEntry(entry: unknown): entry is PlatformVoiceEntry {
  if (!entry || typeof entry !== 'object') return false;
  const e = entry as Partial<PlatformVoiceEntry>;
  return (
    typeof e.audioData === 'string' &&
    e.audioData.length > 0 &&
    typeof e.audioMime === 'string' &&
    e.audioMime.length > 0 &&
    typeof e.updatedAt === 'string'
  );
}

function sanitizeStore(raw: PlatformVoiceStore): PlatformVoiceStore {
  const out: PlatformVoiceStore = {};
  for (const kind of PLATFORM_VOICE_KINDS) {
    const langs = raw[kind];
    if (!langs || typeof langs !== 'object') continue;
    for (const lang of PLATFORM_VOICE_LANGS) {
      const entry = langs[lang];
      if (isValidEntry(entry)) {
        out[kind] = out[kind] ?? {};
        out[kind]![lang] = entry;
      }
    }
  }
  return out;
}

async function writeStore(next: PlatformVoiceStore): Promise<void> {
  const value = JSON.stringify(next);
  await db.systemSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value },
    update: { value },
  });
}

/** Ajoute (ou remplace) une voix plateforme pour (kind, lang). */
export async function savePlatformVoice(
  kind: PlatformVoiceKind,
  lang: PlatformVoiceLang,
  entry: Omit<PlatformVoiceEntry, 'updatedAt'>,
): Promise<PlatformVoiceEntry> {
  const store = sanitizeStore(await getPlatformVoiceStore());
  const full: PlatformVoiceEntry = {
    ...entry,
    text: entry.text?.slice(0, 2000),
    updatedAt: new Date().toISOString(),
  };
  store[kind] = store[kind] ?? {};
  store[kind]![lang] = full;
  await writeStore(store);
  return full;
}

/** Supprime une voix plateforme pour (kind, lang). */
export async function deletePlatformVoice(
  kind: PlatformVoiceKind,
  lang: PlatformVoiceLang,
): Promise<void> {
  const store = sanitizeStore(await getPlatformVoiceStore());
  if (store[kind]?.[lang]) {
    delete store[kind]![lang];
    await writeStore(store);
  }
}

/** Taille binaire approximative d'une chaîne base64 (sans préfixe). */
export function base64SizeKb(b64: string): number {
  return Math.round((b64.length * 3) / 4 / 1024);
}

/** Garde-fou taille : base64 décodé ≤ 1 Mo. */
export function isPlatformVoiceSizeOk(b64: string): boolean {
  const bytes = Math.floor((b64.length * 3) / 4);
  return bytes > 0 && bytes <= MAX_PLATFORM_VOICE_BYTES;
}

/** Est-ce un kind / lang valide ? (gards zod des routes) */
export function isPlatformVoiceKind(kind: string): kind is PlatformVoiceKind {
  return (PLATFORM_VOICE_KINDS as readonly string[]).includes(kind);
}

export function isPlatformVoiceLang(lang: string): lang is PlatformVoiceLang {
  return (PLATFORM_VOICE_LANGS as readonly string[]).includes(lang);
}
