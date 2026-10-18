// =============================================================
// WP-BACK v4.61 — /api/airbnb/properties/[id]/voice-messages
// VOIX DES MESSAGES DU HUB — ÉDITION DASHBOARD (session hôte)
//
// Équivalent session-gardé de la route PIN-gardée du hub
// /api/public/hub/[slug]/voice-messages : l'hôte gère les voix du hub
// (welcome, checkout_eve, checkout_day, guidebook) SANS PIN, depuis le
// dashboard (la carte « 🎙️ Voix du guidebook » de l'Expérience invité).
//
// GET (liste)              : toutes les voix du bien, tous kinds/langs
//                            (métadonnées, SANS audioData — réponse légère).
// GET ?format=audio&kind=&lang=[&v=] : binaire audio (pré-écoute <audio>).
// POST { action, kind, lang, text?|audioBase64?... } :
//   • 'tts'    → generateVoiceMessage (cascade Z.ai → Google TTS) + upsert
//   • 'upload' → voix du propriétaire (base64 ≤ 1 Mo, mime allowlist)
//   • 'delete' → suppression du couple (kind, lang)
//
// Sécurité : session + rôle sur le bien (canManageTeam — même garde que
// /memories, /minibar-ops). mutationGuard anti-abus (30/min hôte).
// kind ∈ welcome|checkout_eve|checkout_day|guidebook (menage_note reste
// éditable au hub) — lang ∈ fr|en|es|ar (le dashboard n'utilise que 'fr').
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getUserRoleForProperty } from '@/lib/b2b-server';
import { canManageTeam } from '@/lib/team';
import { mutationGuard, mutationKey } from '@/lib/mutation-guard';
import { generateVoiceMessage, MAX_TTS_CHARS, VOICE_LANGS, type VoiceLang } from '@/lib/voice-tts';

type Ctx = { params: Promise<{ id: string }> };

/** Kinds éditables depuis le dashboard (menage_note reste au hub). */
const KINDS = ['welcome', 'checkout_eve', 'checkout_day', 'guidebook'] as const;

const ALLOWED_MIME = new Set([
  'audio/mpeg',
  'audio/mp4',
  'audio/webm',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
]);

/** Plafond base64 audio uploadé (≈ 1 Mo binaire, aligné hub v4.32). */
const MAX_AUDIO_B64_CHARS = 1_400_000;

/** Garde session + rôle sur le bien (copie de la route memories). */
async function guard(propertyId: string, userId: string | undefined, sessionPresent: boolean) {
  if (!sessionPresent || !userId) return false;
  const myRole = await getUserRoleForProperty(userId, propertyId);
  return !!myRole && canManageTeam(myRole);
}

const itemSelect = {
  id: true,
  kind: true,
  lang: true,
  source: true,
  text: true,
  audioMime: true,
  durationSec: true,
  fileSizeKb: true,
  updatedAt: true,
} as const;

// ── GET ─────────────────────────────────────────────────────────
export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    const { id: propertyId } = await ctx.params;
    if (!(await guard(propertyId, userId, !!session?.user))) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const kind = searchParams.get('kind') ?? '';
    const lang = searchParams.get('lang') ?? '';

    // ── Binaire audio (pré-écoute <audio> du dashboard) ──
    if (searchParams.get('format') === 'audio') {
      if (!(KINDS as readonly string[]).includes(kind) || !VOICE_LANGS.includes(lang as VoiceLang)) {
        return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 });
      }
      const message = await db.hubVoiceMessage.findUnique({
        where: { propertyId_kind_lang: { propertyId, kind, lang } },
        select: { audioData: true, audioMime: true },
      });
      if (!message) {
        return NextResponse.json({ error: 'Aucune voix pour ce message' }, { status: 404 });
      }
      const buffer = Buffer.from(message.audioData, 'base64');
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': message.audioMime || 'audio/mpeg',
          'Content-Length': String(buffer.length),
          // Cache court : ?v=updatedAt buste à chaque régénération.
          'Cache-Control': 'private, max-age=60',
        },
      });
    }

    // ── Liste (métadonnées sans audioData) ──
    const rows = await db.hubVoiceMessage.findMany({
      where: { propertyId },
      select: itemSelect,
      orderBy: { updatedAt: 'desc' },
    });
    return NextResponse.json({ items: rows });
  } catch (error) {
    console.error('[airbnb/properties/[id]/voice-messages GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// ── POST : tts | upload | delete ────────────────────────────────
const postSchema = z.object({
  action: z.enum(['tts', 'upload', 'delete']),
  kind: z.enum(KINDS),
  lang: z.enum(VOICE_LANGS),
  // tts
  text: z.string().max(MAX_TTS_CHARS).optional(),
  // upload
  audioBase64: z.string().max(MAX_AUDIO_B64_CHARS).optional(),
  audioMime: z.string().max(64).optional(),
  durationSec: z.number().int().min(0).max(31).optional(),
});

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    const { id: propertyId } = await ctx.params;
    if (!(await guard(propertyId, userId, !!session?.user))) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }
    // FIX-15 — guard anti-abus (mutations hôte : 30/min) ; la TTS est
    // lente (5-15 s) : le quota par utilisateur borne le généreux.
    const mutGuard = await mutationGuard(mutationKey('airbnb-mut', req, userId));
    if (mutGuard) return mutGuard;

    const parsed = postSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Requête invalide' },
        { status: 400 },
      );
    }
    const { action, kind, lang } = parsed.data;

    // ── DELETE ──
    if (action === 'delete') {
      await db.hubVoiceMessage.deleteMany({ where: { propertyId, kind, lang } });
      return NextResponse.json({ ok: true });
    }

    // ── TTS : synthèse → MP3 → upsert ──
    if (action === 'tts') {
      const text = (parsed.data.text ?? '').trim();
      if (!text) {
        return NextResponse.json({ error: 'Écrivez d’abord votre message.' }, { status: 400 });
      }
      try {
        const voice = await generateVoiceMessage(text, lang as VoiceLang);
        const saved = await db.hubVoiceMessage.upsert({
          where: {
            propertyId_kind_lang: { propertyId, kind, lang },
          },
          create: {
            propertyId,
            kind,
            lang,
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
        return NextResponse.json({ ok: true, item: saved });
      } catch (e) {
        console.error('[airbnb/properties/[id]/voice-messages] tts failed:', e);
        const msg = e instanceof Error ? e.message : '';
        if (msg.includes('Texte vide')) {
          return NextResponse.json({ error: 'Écrivez d’abord votre message.' }, { status: 400 });
        }
        return NextResponse.json(
          {
            error:
              'Génération de la voix impossible pour le moment (service de synthèse injoignable). Réessayez dans un instant ou importez votre propre audio.',
          },
          { status: 502 },
        );
      }
    }

    // ── UPLOAD : voix du propriétaire ──
    const audioBase64 = (parsed.data.audioBase64 ?? '').trim();
    const mime = (parsed.data.audioMime ?? '').split(';')[0].trim().toLowerCase();
    if (!audioBase64 || !ALLOWED_MIME.has(mime)) {
      return NextResponse.json(
        { error: 'Fichier audio non supporté (MP3, M4A, WAV, WEBM ou OGG).' },
        { status: 400 },
      );
    }
    // DataURL client accepté puis décapé (base64 pur en base).
    const pureB64 = audioBase64.startsWith('data:')
      ? audioBase64.slice(audioBase64.indexOf(',') + 1)
      : audioBase64;
    if (!/^[A-Za-z0-9+/=\s]+$/.test(pureB64)) {
      return NextResponse.json({ error: 'Audio invalide (base64 attendu).' }, { status: 400 });
    }
    if (pureB64.length > MAX_AUDIO_B64_CHARS) {
      return NextResponse.json({ error: 'Audio trop volumineux (max 30 s).' }, { status: 400 });
    }
    const durationSec = Math.max(1, Math.round(parsed.data.durationSec ?? 0));
    const sizeKb = Math.round((pureB64.length * 3) / 4 / 1024);
    const saved = await db.hubVoiceMessage.upsert({
      where: {
        propertyId_kind_lang: { propertyId, kind, lang },
      },
      create: {
        propertyId,
        kind,
        lang,
        source: 'upload',
        text: parsed.data.text?.trim() || null,
        audioData: pureB64.replace(/\s+/g, ''),
        audioMime: mime,
        durationSec,
        fileSizeKb: sizeKb,
      },
      update: {
        source: 'upload',
        text: parsed.data.text?.trim() || null,
        audioData: pureB64.replace(/\s+/g, ''),
        audioMime: mime,
        durationSec,
        fileSizeKb: sizeKb,
      },
      select: itemSelect,
    });
    return NextResponse.json({ ok: true, item: saved });
  } catch (error) {
    console.error('[airbnb/properties/[id]/voice-messages POST] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
