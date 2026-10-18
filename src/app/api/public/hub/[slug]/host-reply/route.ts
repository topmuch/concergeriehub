import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join, basename } from 'path';
import { db } from '@/lib/db';
import { compare } from 'bcryptjs';
import { rateLimit } from '@/lib/rate-limit';
import { captureError } from '@/lib/error-monitor';
import { clientIp } from '@/lib/audit';
import crypto from 'crypto';
import { sniffAudioExt } from '@/lib/voice-audio';

// =============================================================
// RÉPONSE VOCALE DE L'HÔTE DEPUIS LE HUB (Mode Hôte PIN) — FIX-32
// POST /api/public/hub/[slug]/host-reply
//   FormData: { audio, durationSec, pin, voiceMessageId? }
//
// BUG CORRIGÉ : dans l'Espace Hôte du hub (⚙️ + code PIN), le bouton
// « Répondre en vocal » postait vers /api/airbnb/voice-reply qui
// exige une session NextAuth → 401 « Non autorisé » SYSTÉMATIQUE
// (l'hôte n'a pas de session : il s'authentifie par PIN). Le
// propriétaire ne pouvait JAMAIS répondre aux vocaux depuis le hub.
//
// Cette route réplique le contrat de sécurité du GET existant
// /api/public/hub/[slug]/voice (PIN bcrypt fail-closed + rate
// limit IP) pour l'UPLOAD d'une réponse senderType='HOST' :
//   → elle apparaît chez l'invité (voice-replies) et le guidebook.
//
// Sécurité : rate limit 10/min/slug+IP ; PIN bcrypt OBLIGATOIRE
// (fail-closed) ; allowlist extensions via magic numbers audio ;
// 2 Mo max / 60 s max ; nommage serveur ; never-throw.
// =============================================================

const UPLOAD_DIR = join(process.cwd(), 'data', 'uploads', 'voice');
const MAX_FILE_SIZE_KB = 2048;
const MAX_DURATION_SEC = 60;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;

    // ── Anti-abus : 10 réponses/min/slug+IP (couvre aussi le
    //    brute-force du PIN, comme le GET vocal existant) ──
    if (!(await rateLimit(`hostvoice:${slug}:${clientIp(req.headers) ?? 'local'}`, 10))) {
      return NextResponse.json({ error: 'Trop de tentatives. Réessayez dans un instant.' }, { status: 429 });
    }

    const formData = await req.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json({ error: 'Formulaire invalide.' }, { status: 400 });
    }
    const audio = formData.get('audio');
    const pin = String(formData.get('pin') ?? '').trim();
    const voiceMessageId = String(formData.get('voiceMessageId') ?? '').trim();
    const durationSec = parseInt(String(formData.get('durationSec') ?? ''), 10) || 0;

    if (!pin || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: 'PIN requis (4 chiffres).' }, { status: 400 });
    }

    // ── Résolution du bien : plaque V1 OU hub du bien (property.qrHubSlug) ──
    let propertyId: string | null = null;
    const plaque = await db.physicalQrCode.findUnique({
      where: { hubSlug: slug },
      select: { propertyId: true, isClaimed: true },
    });
    if (plaque) {
      if (!plaque.isClaimed || !plaque.propertyId) {
        return NextResponse.json({ error: 'Hub non trouvé' }, { status: 404 });
      }
      propertyId = plaque.propertyId;
    } else {
      const propertyBySlug = await db.property.findUnique({
        where: { qrHubSlug: slug },
        select: { id: true, isActive: true },
      });
      if (!propertyBySlug) {
        return NextResponse.json({ error: 'Hub non trouvé' }, { status: 404 });
      }
      if (!propertyBySlug.isActive) {
        return NextResponse.json({ error: 'Ce bien a été désactivé par son hôte.' }, { status: 410 });
      }
      propertyId = propertyBySlug.id;
    }

    // ── Garde PIN (FAIL-CLOSED) : sans PIN configuré, accès refusé ──
    const property = await db.property.findUnique({
      where: { id: propertyId as string },
      select: { id: true, pinHash: true, owner: { select: { fullName: true } } },
    });
    if (!property) {
      return NextResponse.json({ error: 'Logement non trouvé' }, { status: 404 });
    }
    if (!property.pinHash) {
      return NextResponse.json(
        { error: "Aucun PIN n'est configuré pour ce logement." },
        { status: 403 },
      );
    }
    const isValid = await compare(pin, property.pinHash);
    if (!isValid) {
      return NextResponse.json({ error: 'PIN incorrect.' }, { status: 401 });
    }

    // ── Validation du fichier audio ──
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
    if (durationSec > MAX_DURATION_SEC) {
      return NextResponse.json({ error: `Max ${MAX_DURATION_SEC} secondes.` }, { status: 400 });
    }

    // ── Message d'origine (optionnel) : revalidé par bien (anti-IDOR) ──
    if (voiceMessageId) {
      const origin = await db.voiceMessage.findFirst({
        where: { id: voiceMessageId, propertyId: property.id },
        select: { id: true },
      });
      if (!origin) {
        return NextResponse.json({ error: 'Message vocal introuvable.' }, { status: 404 });
      }
    }

    // ── Validation binaire : magic numbers OBLIGATOIRES ──
    const bytes = new Uint8Array(await audio.arrayBuffer());
    const sniffed = sniffAudioExt(bytes);
    if (!sniffed) {
      return NextResponse.json(
        { error: 'Format audio non supporté (webm, ogg, mp3, m4a ou wav).' },
        { status: 400 },
      );
    }

    // ── Écriture fichier (nommage serveur, répertoire persistant) ──
    const filename = `${property.id}-${crypto.randomBytes(8).toString('hex')}.${sniffed}`;
    await mkdir(UPLOAD_DIR, { recursive: true });
    await writeFile(join(UPLOAD_DIR, basename(filename)), bytes);

    // ── Enregistrement DB : senderType='HOST' ──
    const hostName = (property.owner?.fullName || 'Votre hôte').trim().slice(0, 50);
    const voiceMsg = await db.voiceMessage.create({
      data: {
        propertyId: property.id,
        senderName: hostName,
        senderType: 'HOST',
        audioUrl: `/uploads/voice/${filename}`,
        // v4.32 « AUDIO DURABLE » — copie dataURL en base sous plafond.
        // v4.35 « VOCAL ILLISIBLE » — plafond aligné sur le fichier (2 Mo) :
        // une réponse de 500 Ko–2 Mo partait SANS copie → injouable côté
        // invité dès que le fichier disque disparaissait (redéploiement).
        audioData:
          fileSizeKb <= MAX_FILE_SIZE_KB
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
    await captureError('hub.host-reply', error, undefined, req);
    return NextResponse.json(
      { error: "Impossible d'envoyer la réponse vocale. Réessayez." },
      { status: 500 },
    );
  }
}
