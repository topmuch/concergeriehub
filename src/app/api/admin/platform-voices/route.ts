// =============================================================
// WP-BACK v4.61 — /api/admin/platform-voices
// VOIX PAR DÉFAUT DE LA PLATEFORME (Superadmin)
//
// Le Superadmin définit les voix audio des messages du Hub pour les
// biens dont l'hôte n'a rien configuré (bien > plateforme) :
//   kind ∈ welcome | checkout_eve | checkout_day | guidebook
//   lang ∈ fr | en | es | ar
//
// GET    (sans params)             : grille kind×lang avec métadonnées
//                                    (taille, durée, source, updatedAt) —
//                                    SANS audioData (réponse légère).
// GET    ?kind=&lang=              : cellule complète (audioData inclus).
// GET    ?format=audio&kind=&lang= : binaire audio (pré-écoute <audio>).
// POST   { kind, lang, action: 'tts'|'upload', text?|audioBase64?... }
// DELETE ?kind=&lang=
//
// Sécurité : requireSuperadmin + mutationGuard (60/min admin) + audit.
// Stockage : SystemSetting 'platform_voice_messages' (lib/platform-voices.ts).
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { logAudit, clientIp } from '@/lib/audit';
import { mutationGuard, mutationKey, MUTATIONS_LIMIT_ADMIN } from '@/lib/mutation-guard';
import { z } from 'zod';
import {
  PLATFORM_VOICE_KINDS,
  PLATFORM_VOICE_LANGS,
  getPlatformVoiceStore,
  savePlatformVoice,
  deletePlatformVoice,
  base64SizeKb,
  isPlatformVoiceSizeOk,
  isPlatformVoiceKind,
  isPlatformVoiceLang,
  type PlatformVoiceEntry,
} from '@/lib/platform-voices';
import { generateVoiceMessage, MAX_TTS_CHARS, type VoiceLang } from '@/lib/voice-tts';

const ALLOWED_MIME = new Set([
  'audio/mpeg',
  'audio/mp4',
  'audio/webm',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
]);

/** Métadonnées d'une cellule (SANS audioData — réponse légère). */
function entryMeta(kind: string, lang: string, entry: PlatformVoiceEntry) {
  return {
    kind,
    lang,
    source: entry.source,
    text: entry.text ?? null,
    audioMime: entry.audioMime,
    durationSec: entry.durationSec ?? null,
    sizeKb: base64SizeKb(entry.audioData),
    updatedAt: entry.updatedAt,
  };
}

async function findEntry(kind: string, lang: string): Promise<PlatformVoiceEntry | null> {
  if (!isPlatformVoiceKind(kind) || !isPlatformVoiceLang(lang)) return null;
  const store = await getPlatformVoiceStore();
  return store[kind]?.[lang] ?? null;
}

// ── GET ─────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    const { searchParams } = req.nextUrl;
    const kind = searchParams.get('kind') ?? '';
    const lang = searchParams.get('lang') ?? '';
    const format = searchParams.get('format') ?? '';

    if (!isPlatformVoiceKind(kind) || !isPlatformVoiceLang(lang)) {
      // Liste complète : grille kind×lang (statut défini / vide).
      const store = await getPlatformVoiceStore();
      const items: ReturnType<typeof entryMeta>[] = [];
      for (const k of PLATFORM_VOICE_KINDS) {
        for (const l of PLATFORM_VOICE_LANGS) {
          const entry = store[k]?.[l];
          if (entry) items.push(entryMeta(k, l, entry));
        }
      }
      return NextResponse.json({
        kinds: PLATFORM_VOICE_KINDS,
        langs: PLATFORM_VOICE_LANGS,
        items,
      });
    }

    const entry = await findEntry(kind, lang);
    if (!entry) {
      return NextResponse.json(
        { error: 'Aucune voix plateforme pour ce couple kind/lang' },
        { status: 404 },
      );
    }

    // Binaire audio (pré-écoute du Superadmin — <audio src> direct).
    if (format === 'audio') {
      const buffer = Buffer.from(entry.audioData, 'base64');
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': entry.audioMime || 'audio/mpeg',
          'Content-Length': String(buffer.length),
          'Cache-Control': 'private, max-age=60',
        },
      });
    }

    // Cellule complète (base64 inclus — édition/remplacement).
    return NextResponse.json({
      item: { ...entryMeta(kind, lang, entry), audioData: entry.audioData },
    });
  } catch (error) {
    console.error('[GET /api/admin/platform-voices] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// ── POST : générer (tts) ou uploader ────────────────────────────
const postSchema = z.object({
  kind: z.enum(PLATFORM_VOICE_KINDS),
  lang: z.enum(PLATFORM_VOICE_LANGS),
  action: z.enum(['tts', 'upload']),
  // tts
  text: z.string().max(MAX_TTS_CHARS).optional(),
  // upload — base64 (dataURL accepté puis décapé)
  audioBase64: z.string().max(1_400_000).optional(),
  audioMime: z.string().max(64).optional(),
  durationSec: z.number().int().min(0).max(3600).optional(),
});

export async function POST(req: NextRequest) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();
  // FIX-15 — anti-abus : 60 mutations/min par admin (Console Superadmin).
  const mutGuard = await mutationGuard(mutationKey('admin-mut', req, admin.id), MUTATIONS_LIMIT_ADMIN);
  if (mutGuard) return mutGuard;

  try {
    const parsed = postSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Requête invalide' },
        { status: 400 },
      );
    }
    const { kind, lang, action } = parsed.data;

    if (action === 'tts') {
      const text = (parsed.data.text ?? '').trim();
      if (!text) {
        return NextResponse.json({ error: 'Écrivez d’abord le message à synthétiser.' }, { status: 400 });
      }
      try {
        const voice = await generateVoiceMessage(text, lang as VoiceLang);
        const entry = await savePlatformVoice(kind, lang, {
          audioData: voice.base64,
          audioMime: voice.mime,
          durationSec: voice.durationSec,
          text,
          source: 'tts',
        });
        await logAudit({
          actor: admin,
          action: 'platform_voice.tts',
          entityType: 'system_setting',
          entityId: `platform_voice_messages:${kind}:${lang}`,
          details: { kind, lang, durationSec: voice.durationSec, sizeKb: voice.sizeKb },
          ip: clientIp(req.headers),
        });
        return NextResponse.json({ ok: true, item: entryMeta(kind, lang, entry) });
      } catch (e) {
        console.error('[POST /api/admin/platform-voices] tts failed:', e);
        return NextResponse.json(
          {
            error:
              'Génération de la voix impossible pour le moment (service de synthèse injoignable). Réessayez dans un instant ou importez votre propre audio.',
          },
          { status: 502 },
        );
      }
    }

    // ── upload : voix audio importée ──
    const audioBase64 = (parsed.data.audioBase64 ?? '').trim();
    const mime = (parsed.data.audioMime ?? '').split(';')[0].trim().toLowerCase();
    if (!audioBase64) {
      return NextResponse.json({ error: 'Aucun fichier audio fourni.' }, { status: 400 });
    }
    if (!ALLOWED_MIME.has(mime)) {
      return NextResponse.json(
        { error: 'Format audio non supporté (MP3, M4A, WAV, WEBM ou OGG).' },
        { status: 400 },
      );
    }
    // Base64 pur uniquement (un dataURL client est accepté puis décapé).
    const pureB64 = audioBase64.startsWith('data:')
      ? audioBase64.slice(audioBase64.indexOf(',') + 1)
      : audioBase64;
    if (!/^[A-Za-z0-9+/=\s]+$/.test(pureB64)) {
      return NextResponse.json({ error: 'Audio invalide (base64 attendu).' }, { status: 400 });
    }
    if (!isPlatformVoiceSizeOk(pureB64)) {
      return NextResponse.json({ error: 'Audio trop volumineux (max 1 Mo).' }, { status: 400 });
    }
    const entry = await savePlatformVoice(kind, lang, {
      audioData: pureB64.replace(/\s+/g, ''),
      audioMime: mime,
      durationSec: parsed.data.durationSec ?? 0,
      text: parsed.data.text?.trim() || undefined,
      source: 'upload',
    });
    await logAudit({
      actor: admin,
      action: 'platform_voice.upload',
      entityType: 'system_setting',
      entityId: `platform_voice_messages:${kind}:${lang}`,
      details: { kind, lang, sizeKb: base64SizeKb(entry.audioData), mime },
      ip: clientIp(req.headers),
    });
    return NextResponse.json({ ok: true, item: entryMeta(kind, lang, entry) });
  } catch (error) {
    console.error('[POST /api/admin/platform-voices] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// ── DELETE ?kind=&lang= ─────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();
  const mutGuard = await mutationGuard(mutationKey('admin-mut', req, admin.id), MUTATIONS_LIMIT_ADMIN);
  if (mutGuard) return mutGuard;

  try {
    const { searchParams } = req.nextUrl;
    const kind = searchParams.get('kind') ?? '';
    const lang = searchParams.get('lang') ?? '';
    if (!isPlatformVoiceKind(kind) || !isPlatformVoiceLang(lang)) {
      return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 });
    }
    const existed = await findEntry(kind, lang);
    await deletePlatformVoice(kind, lang);
    if (existed) {
      await logAudit({
        actor: admin,
        action: 'platform_voice.delete',
        entityType: 'system_setting',
        entityId: `platform_voice_messages:${kind}:${lang}`,
        details: { kind, lang },
        ip: clientIp(req.headers),
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[DELETE /api/admin/platform-voices] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
