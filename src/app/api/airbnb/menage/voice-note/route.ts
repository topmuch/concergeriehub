// =============================================================
// /api/airbnb/menage/voice-note — CONSIGNE VOCALE HÔTE → FEMME DE
// MÉNAGE (v4.43, onglet Ménage du dashboard)
//
// GET  ?propertyId= : sert le binaire audio (lecture dashboard).
// POST { propertyId, action } :
//   • action 'tts'    : { text } → génération voix IA/Google (fr),
//                       upsert HubVoiceMessage kind='menage_note';
//   • action 'upload' : { audioData, audioMime, durationSec } →
//                       enregistrement micro de l'hôte (≤ 90 s).
// DELETE ?propertyId= : supprime la consigne vocale.
//
// Stockage : HubVoiceMessage (propertyId + kind='menage_note' +
// lang='fr', unique) — re-générer/ré-enregistrer REMPLACE la consigne.
// La femme de ménage la reçoit via /api/public/hub/[slug]/cleaning/config
// et l'audio public /voice-messages/audio?kind=menage_note.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { z } from 'zod';
import { db } from '@/lib/db';
import { resolveUserProperties } from '@/lib/b2b-server';
import { rateLimit } from '@/lib/rate-limit';
import { generateVoiceMessage, MAX_TTS_CHARS } from '@/lib/voice-tts';

const MAX_AUDIO_B64_CHARS = 1_400_000; // ≈ 1 Mo binaire (aligné vocaux hub)
const MAX_VOICE_SEC = 90;

const ALLOWED_MIME = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/ogg',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
]);

const bodySchema = z.object({
  propertyId: z.string().min(1),
  action: z.enum(['tts', 'upload']),
  // tts
  text: z.string().max(MAX_TTS_CHARS).optional(),
  // upload
  audioData: z.string().max(MAX_AUDIO_B64_CHARS).optional(),
  audioMime: z.string().max(64).optional(),
  durationSec: z.number().int().min(0).max(MAX_VOICE_SEC).optional(),
});

/** Session + propriété accessible → propertyId ou null. */
async function resolveOwnedProperty(
  userId: string,
  propertyId: string,
): Promise<string | null> {
  const properties = await resolveUserProperties(userId);
  return properties.some((p) => p.id === propertyId) ? propertyId : null;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const propertyId = searchParams.get('propertyId') ?? '';
    const owned = await resolveOwnedProperty(userId, propertyId);
    if (!owned) {
      return NextResponse.json({ error: 'Bien introuvable' }, { status: 404 });
    }
    const note = await db.hubVoiceMessage.findUnique({
      where: {
        propertyId_kind_lang: { propertyId: owned, kind: 'menage_note', lang: 'fr' },
      },
    });
    if (!note) {
      return NextResponse.json({ error: 'Aucune consigne vocale' }, { status: 404 });
    }
    const buffer = Buffer.from(note.audioData, 'base64');
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': note.audioMime || 'audio/mpeg',
        'Content-Length': String(buffer.length),
        'Cache-Control': 'no-store',
        'Accept-Ranges': 'none',
      },
    });
  } catch (error) {
    console.error('[airbnb/menage/voice-note GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    if (!(await rateLimit(`menage-note:${userId}`, 12))) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Réessayez dans un instant.' },
        { status: 429 },
      );
    }

    const raw = (await req.json().catch(() => null)) as unknown;
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Requête invalide.' },
        { status: 400 },
      );
    }
    const { propertyId, action } = parsed.data;
    const owned = await resolveOwnedProperty(userId, propertyId);
    if (!owned) {
      return NextResponse.json({ error: 'Bien introuvable' }, { status: 404 });
    }

    if (action === 'tts') {
      const text = parsed.data.text?.replace(/\s+/g, ' ').trim() ?? '';
      if (!text) {
        return NextResponse.json(
          { error: 'Écrivez d’abord le message à transformer en voix.' },
          { status: 400 },
        );
      }
      try {
        const voice = await generateVoiceMessage(text, 'fr');
        await db.hubVoiceMessage.upsert({
          where: {
            propertyId_kind_lang: { propertyId: owned, kind: 'menage_note', lang: 'fr' },
          },
          create: {
            propertyId: owned,
            kind: 'menage_note',
            lang: 'fr',
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
        });
        return NextResponse.json({
          ok: true,
          source: 'tts',
          durationSec: voice.durationSec,
        });
      } catch (e) {
        console.error('[menage/voice-note tts] failed:', e);
        return NextResponse.json(
          { error: 'Génération de la voix impossible pour le moment. Réessayez.' },
          { status: 502 },
        );
      }
    }

    // action === 'upload' — enregistrement micro de l'hôte.
    const audioData = parsed.data.audioData ?? '';
    const audioMime = (parsed.data.audioMime ?? '').toLowerCase();
    if (!audioData) {
      return NextResponse.json({ error: 'Aucun enregistrement reçu.' }, { status: 400 });
    }
    const match = /^data:([a-z]+\/[a-z0-9.+_-]+);base64,(.+)$/i.exec(audioData);
    if (!match || !ALLOWED_MIME.has(match[1].toLowerCase())) {
      return NextResponse.json({ error: 'Format audio non autorisé.' }, { status: 400 });
    }
    if (audioMime && !ALLOWED_MIME.has(audioMime)) {
      return NextResponse.json({ error: 'Format audio non autorisé.' }, { status: 400 });
    }
    await db.hubVoiceMessage.upsert({
      where: {
        propertyId_kind_lang: { propertyId: owned, kind: 'menage_note', lang: 'fr' },
      },
      create: {
        propertyId: owned,
        kind: 'menage_note',
        lang: 'fr',
        source: 'upload',
        text: parsed.data.durationSec
          ? `Consigne enregistrée (${parsed.data.durationSec} s)`
          : 'Consigne enregistrée',
        audioData,
        audioMime: match[1].toLowerCase(),
        durationSec: parsed.data.durationSec ?? 0,
        fileSizeKb: Math.round((match[2].length * 3) / 4 / 1024),
      },
      update: {
        source: 'upload',
        audioData,
        audioMime: match[1].toLowerCase(),
        durationSec: parsed.data.durationSec ?? 0,
        fileSizeKb: Math.round((match[2].length * 3) / 4 / 1024),
      },
    });
    return NextResponse.json({ ok: true, source: 'upload' });
  } catch (error) {
    console.error('[airbnb/menage/voice-note POST] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const propertyId = searchParams.get('propertyId') ?? '';
    const owned = await resolveOwnedProperty(userId, propertyId);
    if (!owned) {
      return NextResponse.json({ error: 'Bien introuvable' }, { status: 404 });
    }
    await db.hubVoiceMessage.deleteMany({
      where: { propertyId: owned, kind: 'menage_note' },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[airbnb/menage/voice-note DELETE] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
