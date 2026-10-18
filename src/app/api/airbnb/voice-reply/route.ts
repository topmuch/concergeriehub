import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { writeFile, mkdir } from 'fs/promises';
import { join, basename } from 'path';
import { db } from '@/lib/db';
import { authOptions } from '@/lib/auth';
import { canAccessProperty } from '@/lib/b2b-server';
import { mutationGuard, mutationKey } from '@/lib/mutation-guard';
import { captureError } from '@/lib/error-monitor';
import crypto from 'crypto';
// FIX-32 — sniffAudioExt déplacé dans lib/voice-audio (partagé avec
// la nouvelle route PIN /api/public/hub/[slug]/host-reply).
import { sniffAudioExt } from '@/lib/voice-audio';
// v4.32 — plafond dataURL partagé avec les autres routes vocales.
// v4.35 « VOCAL ILLISIBLE » — plafond aligné sur le plafond fichier
// (2 Mo) : avant, une réponse hôte de 500 Ko–2 Mo partait SANS copie
// base64 → lecture dépendante du fichier disque (perdu au
// redéploiement) → « la réponse n'est pas lisible côté invité ».
const MAX_AUDIO_DATA_KB = 2048;

// =============================================================
// RÉPONSE VOCALE DE L'HÔTE — POST /api/airbnb/voice-reply
//
// Le propriétaire répond par message vocal enregistré à un message
// de son invité. Le vocal est enregistré dans la MÊME table
// VoiceMessage avec senderType='HOST' :
//   → il apparaît dans le guidebook (/view) via GET /api/public/qr-voice
//     (liste déjà publique) et dans le Hub Invité via la nouvelle route
//     GET /api/public/hub/[slug]/voice-replies.
//
// Sécurité : session NextAuth + canAccessProperty (anti-IDOR) ;
// anti-abus mutationGuard (20 réponses/min/hôte) ; allowlist extensions
// + magic numbers audio ; 2 Mo max ; nommage serveur ; never-throw.
// =============================================================

const UPLOAD_DIR = join(process.cwd(), 'data', 'uploads', 'voice');
// FIX-32 : 500 Ko cassait les réponses de 60 s en audio/mp4 (Safari/iOS,
// AAC ≈ 8-16 Ko/s → jusqu'à ~1 Mo) → erreur « Fichier trop volumineux »
// côté propriétaire. 2 Mo reste très raisonnable pour un vocal de 60 s.
const MAX_FILE_SIZE_KB = 2048;
const MAX_DURATION_SEC = 60;

const ALLOWED_AUDIO_EXT = new Set(['webm', 'ogg', 'mp3', 'm4a', 'wav']);

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const mutGuard = await mutationGuard(mutationKey('airbnb-mut', req, userId));
    if (mutGuard) return mutGuard;

    const formData = await req.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json({ error: 'Formulaire invalide.' }, { status: 400 });
    }
    const audio = formData.get('audio');
    const voiceMessageId = String(formData.get('voiceMessageId') ?? '').trim();

    if (!audio || !(audio instanceof File)) {
      return NextResponse.json({ error: 'Fichier audio requis.' }, { status: 400 });
    }
    if (audio.size === 0) {
      return NextResponse.json({ error: 'Enregistrement vide.' }, { status: 400 });
    }
    if (!audio.type.startsWith('audio/')) {
      return NextResponse.json({ error: 'Format audio uniquement.' }, { status: 400 });
    }
    const fileSizeKb = Math.round(audio.size / 1024);
    if (fileSizeKb > MAX_FILE_SIZE_KB) {
      return NextResponse.json(
        { error: `Fichier trop volumineux (max ${MAX_FILE_SIZE_KB} Ko).` },
        { status: 400 },
      );
    }
    const durationSec = parseInt(String(formData.get('durationSec') ?? ''), 10) || 0;
    if (durationSec > MAX_DURATION_SEC) {
      return NextResponse.json({ error: `Max ${MAX_DURATION_SEC} secondes.` }, { status: 400 });
    }

    // ── Message d'origine : propriété cible (validée, jamais cru côté client) ──
    const origin = voiceMessageId
      ? await db.voiceMessage.findUnique({
          where: { id: voiceMessageId },
          select: { propertyId: true },
        })
      : null;
    if (voiceMessageId && !origin) {
      return NextResponse.json({ error: 'Message vocal introuvable.' }, { status: 404 });
    }

    let propertyId: string | null = origin?.propertyId ?? null;
    if (!propertyId) {
      // Fallback : propertyId passé directement (réponse générale).
      const direct = String(formData.get('propertyId') ?? '').trim();
      if (direct && (await canAccessProperty(userId, direct))) propertyId = direct;
    }
    if (!propertyId) {
      return NextResponse.json({ error: 'Bien cible manquant.' }, { status: 400 });
    }
    if (!(await canAccessProperty(userId, propertyId))) {
      return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
    }

    // ── Validation binaire : magic numbers OBLIGATOIRES ──
    const bytes = new Uint8Array(await audio.arrayBuffer());
    const sniffed = sniffAudioExt(bytes);
    if (!sniffed || !ALLOWED_AUDIO_EXT.has(sniffed)) {
      return NextResponse.json(
        { error: 'Format audio non supporté (webm, ogg, mp3, m4a ou wav).' },
        { status: 400 },
      );
    }

    // ── Écriture fichier (nommage serveur, répertoire persistant) ──
    const filename = `${propertyId}-${crypto.randomBytes(8).toString('hex')}.${sniffed}`;
    await mkdir(UPLOAD_DIR, { recursive: true });
    await writeFile(join(UPLOAD_DIR, basename(filename)), bytes);

    // ── Enregistrement DB : senderType='HOST' ──
    const owner = await db.user.findUnique({
      where: { id: userId },
      select: { fullName: true },
    });
    const hostName = (owner?.fullName || 'Votre hôte').trim().slice(0, 50);
    const voiceMsg = await db.voiceMessage.create({
      data: {
        propertyId,
        senderName: hostName,
        senderType: 'HOST',
        audioUrl: `/uploads/voice/${filename}`,
        // v4.32 « AUDIO DURABLE » — copie dataURL en base si le fichier
        // est sous le plafond (lecture garantie après redéploiement).
        audioData:
          fileSizeKb <= MAX_AUDIO_DATA_KB
            ? `data:${(audio.type || 'audio/webm').split(';')[0].trim()};base64,${Buffer.from(bytes).toString('base64')}`
            : null,
        durationSec: Math.min(Math.max(durationSec, 0), MAX_DURATION_SEC),
        fileSizeKb,
      },
    });

    return NextResponse.json(
      { ok: true, id: voiceMsg.id, audioUrl: voiceMsg.audioUrl },
      { status: 201 },
    );
  } catch (error) {
    await captureError('voice-reply.post', error, undefined, req);
    return NextResponse.json(
      { error: "Impossible d'envoyer la réponse vocale. Réessayez." },
      { status: 500 },
    );
  }
}
