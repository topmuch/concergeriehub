import { NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { z } from 'zod';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/audit';
import { captureError } from '@/lib/error-monitor';
// v4.37 « MESSAGES VOCAUX DU HUB » — TTS multi-langues (FR·EN·ES·AR).
import {
  VOICE_LANGS,
  MAX_TTS_CHARS,
  generateVoiceMessage,
  type VoiceLang,
} from '@/lib/voice-tts';
// WP-BACK v4.61 — VOIX PLATEFORME : repli par défaut du Superadmin
// (le bien reste prioritaire ; source 'platform' pour les cellules absentes).
import {
  PLATFORM_VOICE_KINDS,
  getPlatformVoiceStore,
} from '@/lib/platform-voices';

// =============================================================
// v4.37 — /api/public/hub/[slug]/voice-messages
//
// GET    ?pin=          → liste des messages vocaux du hub (sans audio,
//                         la pré-écoute passe par /voice-messages/audio?v=)
// POST   { pin, ... }   → action 'tts' | 'upload' :
//                         • tts    : génère la voix (WAV→MP3 lamejs) puis
//                                    upsert (unique propertyId+kind+lang)
//                         • upload : voix du propriétaire (base64 ≤ 1 Mo,
//                                    mime allowlist, ≤ 31 s)
// DELETE ?pin&kind&lang → supprime une voix (per-langue)
//
// AUTH : PIN Mode Hôte (bcrypt sur property.pinHash) — même convention
// que /update et /late-checkout. DEMO ('demo-hub') : succès sans écriture,
// MAIS l'action tts génère quand même la voix et la renvoie dans la
// réponse (item.audioData) : l'hôte peut juger la qualité de la voix
// en direct sur le hub de démonstration (pré-écoute locale au dialog).
// =============================================================

const DEMO_SLUG = 'demo-hub';
const isDemo = (slug: string) => slug === DEMO_SLUG;

/** Plafond base64 audio uploadé (≈ 1 Mo binaire, aligné vocaux v4.32). */
const MAX_AUDIO_B64_CHARS = 1_400_000;

// WP-BACK v4.61 — kind 'guidebook' ajouté : voix de lecture du guide de
// bienvenue (configurée depuis le DASHBOARD hôte — route session dédiée
// /api/airbnb/properties/[id]/voice-messages — lang 'fr' côté dashboard).
const KINDS = ['welcome', 'checkout_eve', 'checkout_day', 'menage_note', 'guidebook'] as const;
type VoiceKind = (typeof KINDS)[number];

const ALLOWED_MIME = new Set([
  'audio/mpeg',
  'audio/mp4',
  'audio/webm',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
]);

const bodySchema = z.object({
  pin: z.string().min(4).max(8),
  kind: z.enum(KINDS),
  lang: z.enum(VOICE_LANGS),
  action: z.enum(['tts', 'upload']),
  // tts
  text: z.string().max(MAX_TTS_CHARS).optional(),
  // upload
  audioData: z.string().max(MAX_AUDIO_B64_CHARS).optional(),
  audioMime: z.string().max(64).optional(),
  durationSec: z.number().int().min(0).max(31).optional(),
});

function clientIpFallback(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0].trim() : '') || 'local';
}

/** Résolution du bien : plaque QR (hubSlug) puis repli qrHubSlug —
 *  même chaîne que /late-checkout (v4.32). */
async function resolvePropertyId(slug: string): Promise<string | null> {
  const plaque = await db.physicalQrCode.findUnique({
    where: { hubSlug: slug },
    select: { propertyId: true, isClaimed: true, status: true },
  });
  if (plaque && plaque.isClaimed && plaque.propertyId && plaque.status === 'active') {
    return plaque.propertyId;
  }
  const bySlug = await db.property.findUnique({
    where: { qrHubSlug: slug },
    select: { id: true, isActive: true },
  });
  return bySlug?.isActive ? bySlug.id : null;
}

/** Vérifie le PIN hôte (bcrypt) — renvoie le propertyId ou null.
 *  DÉMO (v4.38) : le bypass passe AVANT la résolution du bien — le hub
 *  'demo-hub' de prod n'a AUCUNE ligne Property en base (payload factice),
 *  la résolution renvoyait donc null → 403 « PIN incorrect » AVANT même
 *  d'atteindre la branche démo (constaté au post-check prod v4.37 :
 *  POST répondait en ~250 ms avec 403 au lieu de générer la voix).
 *  Le propertyId fantôme 'demo' n'est JAMAIS utilisé : toutes les
 *  branches démo (GET/POST/DELETE) retournent avant toute écriture. */
async function verifyHostPin(
  slug: string,
  pin: string,
): Promise<{ propertyId: string } | null> {
  if (isDemo(slug)) {
    if (!/^\d{4}$/.test(pin)) return null;
    return { propertyId: 'demo' };
  }
  const propertyId = await resolvePropertyId(slug);
  if (!propertyId) return null;
  const property = await db.property.findUnique({
    where: { id: propertyId },
    select: { id: true, pinHash: true },
  });
  if (!property) return null;
  if (!property.pinHash) return null;
  const ok = await compare(pin, property.pinHash);
  return ok ? { propertyId: property.id } : null;
}

const itemSelect = {
  id: true,
  kind: true,
  lang: true,
  source: true,
  text: true,
  durationSec: true,
  fileSizeKb: true,
  updatedAt: true,
} as const;

type ItemMeta = {
  id: string;
  kind: string;
  lang: string;
  source: string;
  text: string | null;
  durationSec: number;
  fileSizeKb: number;
  updatedAt: Date;
};

// ── GET : liste (hôte) ────────────────────────────────────────────
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    if (!slug || slug.length < 2) {
      return NextResponse.json({ error: 'Slug invalide' }, { status: 400 });
    }
    if (!(await rateLimit(`hubvoice-get:${clientIpFallback(req)}`, 30))) {
      return NextResponse.json({ error: 'Trop de requêtes. Réessayez dans un instant.' }, { status: 429 });
    }
    // v4.76 — PIN en header `x-hub-pin` (jamais loggé) ; repli query compat.
    const pin = req.headers.get('x-hub-pin') || (new URL(req.url).searchParams.get('pin') ?? '');
    if (isDemo(slug)) {
      return NextResponse.json({ demo: true, items: [] });
    }
    const auth = await verifyHostPin(slug, pin);
    if (!auth) {
      return NextResponse.json({ error: 'PIN incorrect' }, { status: 403 });
    }
    const rows = await db.hubVoiceMessage.findMany({
      where: { propertyId: auth.propertyId },
      select: itemSelect,
      orderBy: { updatedAt: 'desc' },
    });
    // ── WP-BACK v4.61 — FUSION DES VOIX PLATEFORME (repli Superadmin) :
    // pour chaque (kind, lang) : la voix du BIEN gagne ; si absente, la
    // voix plateforme est servie avec source 'platform' (l'hôte voit ce
    // que son invité entendra réellement). id synthétique 'platform-…'.
    const items = [...rows];
    try {
      const platform = await getPlatformVoiceStore();
      const own = new Set(rows.map((r) => `${r.kind}:${r.lang}`));
      for (const kind of PLATFORM_VOICE_KINDS) {
        const langs = platform[kind];
        if (!langs) continue;
        for (const [lang, entry] of Object.entries(langs)) {
          if (!entry || own.has(`${kind}:${lang}`)) continue;
          items.push({
            id: `platform-${kind}-${lang}`,
            kind,
            lang,
            source: 'platform',
            text: entry.text ?? null,
            durationSec: entry.durationSec ?? 0,
            fileSizeKb: Math.round((entry.audioData.length * 3) / 4 / 1024),
            updatedAt: new Date(entry.updatedAt),
          });
        }
      }
      items.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    } catch (e) {
      // Repli gracieux : sans store plateforme, la liste du bien suffit.
      console.error('[voice-messages] merge platform voices failed:', e);
    }
    return NextResponse.json({ items });
  } catch (error) {
    await captureError('hub.voice-messages.get', error, undefined, req);
    return NextResponse.json({ error: 'Erreur serveur. Réessayez.' }, { status: 500 });
  }
}

// ── POST : générer (tts) ou uploader ──────────────────────────────
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    if (!slug || slug.length < 2) {
      return NextResponse.json({ error: 'Slug invalide' }, { status: 400 });
    }
    // TTS lent (5-15 s) : quota généreux mais borné (anti-abus).
    if (!(await rateLimit(`hubvoice-post:${clientIpFallback(req)}`, 15))) {
      return NextResponse.json({ error: 'Trop de générations. Patientez un instant.' }, { status: 429 });
    }
    const raw = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Requête invalide' },
        { status: 400 },
      );
    }
    const body = parsed.data;
    const auth = await verifyHostPin(slug, body.pin);
    if (!auth) {
      return NextResponse.json({ error: 'PIN incorrect' }, { status: 403 });
    }

    // ── TTS : synthèse → MP3 ──
    if (body.action === 'tts') {
      const text = (body.text ?? '').trim();
      if (!text) {
        return NextResponse.json({ error: 'Écrivez d’abord votre message.' }, { status: 400 });
      }
      try {
        const voice = await generateVoiceMessage(text, body.lang as VoiceLang);
        // Démo : succès sans écriture, audio renvoyé pour pré-écoute locale.
        if (isDemo(slug)) {
          const item: ItemMeta & { audioData?: string; audioMime?: string } = {
            id: `demo-${Date.now()}`,
            kind: body.kind,
            lang: body.lang,
            source: 'tts',
            text,
            durationSec: voice.durationSec,
            fileSizeKb: voice.sizeKb,
            updatedAt: new Date(),
            audioData: voice.base64,
            audioMime: voice.mime,
          };
          return NextResponse.json({ demo: true, item });
        }
        const saved = await db.hubVoiceMessage.upsert({
          where: {
            propertyId_kind_lang: {
              propertyId: auth.propertyId,
              kind: body.kind,
              lang: body.lang,
            },
          },
          create: {
            propertyId: auth.propertyId,
            kind: body.kind,
            lang: body.lang,
            source: 'tts',
            text,
            audioData: voice.base64,
            audioMime: voice.mime,
            durationSec: voice.durationSec,
            fileSizeKb: voice.sizeKb,
          },
          update: {
            source: 'tts',
            text,
            audioData: voice.base64,
            audioMime: voice.mime,
            durationSec: voice.durationSec,
            fileSizeKb: voice.sizeKb,
          },
          select: itemSelect,
        });
        return NextResponse.json({ item: saved });
      } catch (e) {
        await captureError('hub.voice-messages.tts', e, undefined, req);
        const msg = e instanceof Error ? e.message : '';
        // v4.40 — les deux voies de synthèse (Z.ai + repli Google TTS)
        // ont échoué : message ACTIONNABLE (la voix propriétaire reste
        // toujours disponible — elle ne dépend d'aucune API externe).
        if (msg.includes('Texte vide')) {
          return NextResponse.json({ error: 'Écrivez d’abord votre message.' }, { status: 400 });
        }
        return NextResponse.json(
          { error: 'Génération de la voix impossible pour le moment (service de synthèse injoignable depuis ce serveur). Réessayez dans un instant ou utilisez « 📤 Ma propre voix ».' },
          { status: 502 },
        );
      }
    }

    // ── UPLOAD : voix du propriétaire ──
    const audioData = body.audioData ?? '';
    const mime = (body.audioMime ?? '').split(';')[0].trim().toLowerCase();
    if (!audioData || !ALLOWED_MIME.has(mime)) {
      return NextResponse.json({ error: 'Fichier audio non supporté (MP3, M4A, WAV, WEBM ou OGG).' }, { status: 400 });
    }
    if (audioData.length > MAX_AUDIO_B64_CHARS) {
      return NextResponse.json({ error: 'Audio trop volumineux (max 30 s).' }, { status: 400 });
    }
    const durationSec = Math.max(1, Math.round(body.durationSec ?? 0));
    const sizeKb = Math.round((audioData.length * 3) / 4 / 1024);
    // Démo : écho sans écriture (pré-écoute locale au dialog).
    if (isDemo(slug)) {
      const item: ItemMeta & { audioData?: string; audioMime?: string } = {
        id: `demo-${Date.now()}`,
        kind: body.kind,
        lang: body.lang,
        source: 'upload',
        text: body.text?.trim() || null,
        durationSec,
        fileSizeKb: sizeKb,
        updatedAt: new Date(),
        audioData,
        audioMime: mime,
      };
      return NextResponse.json({ demo: true, item });
    }
    const saved = await db.hubVoiceMessage.upsert({
      where: {
        propertyId_kind_lang: {
          propertyId: auth.propertyId,
          kind: body.kind,
          lang: body.lang,
        },
      },
      create: {
        propertyId: auth.propertyId,
        kind: body.kind,
        lang: body.lang,
        source: 'upload',
        text: body.text?.trim() || null,
        audioData,
        audioMime: mime,
        durationSec,
        fileSizeKb: sizeKb,
      },
      update: {
        source: 'upload',
        text: body.text?.trim() || null,
        audioData,
        audioMime: mime,
        durationSec,
        fileSizeKb: sizeKb,
      },
      select: itemSelect,
    });
    return NextResponse.json({ item: saved });
  } catch (error) {
    await captureError('hub.voice-messages.post', error, undefined, req);
    return NextResponse.json({ error: 'Erreur serveur. Réessayez.' }, { status: 500 });
  }
}

// ── DELETE : supprime une voix ────────────────────────────────────
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    if (!slug || slug.length < 2) {
      return NextResponse.json({ error: 'Slug invalide' }, { status: 400 });
    }
    if (!(await rateLimit(`hubvoice-del:${clientIpFallback(req)}`, 30))) {
      return NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 });
    }
    const url = new URL(req.url);
    // v4.76 — PIN en header `x-hub-pin` (jamais loggé) ; repli query compat.
    const pin = req.headers.get('x-hub-pin') || (url.searchParams.get('pin') ?? '');
    const kind = url.searchParams.get('kind') ?? '';
    const lang = url.searchParams.get('lang') ?? '';
    if (!KINDS.includes(kind as VoiceKind) || !VOICE_LANGS.includes(lang as VoiceLang)) {
      return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 });
    }
    if (isDemo(slug)) {
      return NextResponse.json({ demo: true });
    }
    const auth = await verifyHostPin(slug, pin);
    if (!auth) {
      return NextResponse.json({ error: 'PIN incorrect' }, { status: 403 });
    }
    await db.hubVoiceMessage.deleteMany({
      where: { propertyId: auth.propertyId, kind, lang },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    await captureError('hub.voice-messages.delete', error, undefined, req);
    return NextResponse.json({ error: 'Erreur serveur. Réessayez.' }, { status: 500 });
  }
}
