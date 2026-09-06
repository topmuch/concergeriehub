import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join, basename } from 'path';
import { db } from '@/lib/db';
import crypto from 'crypto';
import { compare } from 'bcryptjs';
import { rateLimit } from '@/lib/rate-limit';
// FIX-14 — monitoring d'erreurs : trace AuditLog (action='runtime.error').
import { captureError } from '@/lib/error-monitor';
// FIX-15 (C) — zod sur les champs texte du FormData + clientIp (rate-limit IP-scopé).
import { z } from 'zod';
import { clientIp } from '@/lib/audit';

const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads', 'voice');
const MAX_DURATION_SEC = 30;
const MAX_FILE_SIZE_KB = 500; // ~500KB for 30s webm

// SÉCURITÉ : allowlist stricte des extensions — empêche tout path traversal
// (l'extension client n'est JAMAIS concaténée telle quelle).
const ALLOWED_AUDIO_EXT = new Set(['webm', 'ogg', 'mp3', 'm4a', 'wav']);

// FIX-15 (C) — zod sur les champs TEXTE du FormData. Le fichier audio reste
// validé manuellement ci-dessous (type MIME + taille réelle du fichier :
// contraintes binaires hors périmètre zod propre). senderName/durationSec
// doivent être des chaînes — avant, un champ non-texte provoquait un 500.
const voiceFormSchema = z.object({
  senderName: z.string().optional(),
  durationSec: z.string().optional(),
});

// POST: Upload a voice message for a hub
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    // FIX-15 (B) — Anti-spam par IP (10 messages/min) ; le quota slug global
    // serait un vecteur de DoS : un tiers pouvait épuiser `voice:<slug>`
    // et bloquer les messages vocaux des invités légitimes.
    if (!(await rateLimit(`voice:${slug}:${clientIp(req.headers) ?? 'local'}`, 10))) {
      return NextResponse.json({ error: 'Trop de tentatives. Réessayez dans un instant.' }, { status: 429 });
    }
    const formData = await req.formData();
    const audio = formData.get('audio') as File | null;
    // FIX-15 (C) — validation zod des champs texte du formulaire (400 si
    // champ non-texte ; comportement des clients valides inchangé).
    const parsedForm = voiceFormSchema.safeParse({
      senderName: formData.get('senderName') ?? undefined,
      durationSec: formData.get('durationSec') ?? undefined,
    });
    if (!parsedForm.success) {
      return NextResponse.json({ error: 'Formulaire invalide.' }, { status: 400 });
    }
    const senderName = parsedForm.data.senderName || 'Invité';
    const durationSec = parseInt(parsedForm.data.durationSec ?? '', 10) || 0;

    // Validate
    if (!audio) {
      return NextResponse.json({ error: 'Fichier audio requis' }, { status: 400 });
    }
    if (!audio.type.startsWith('audio/')) {
      return NextResponse.json({ error: 'Format audio uniquement' }, { status: 400 });
    }
    const fileSizeKb = Math.round(audio.size / 1024);
    // FIX (AUD-FULL) : la limite effective est MAX_FILE_SIZE_KB (500 Ko),
    // l'ancien `* 10` autorisait 5 Mo malgré la doc.
    if (fileSizeKb > MAX_FILE_SIZE_KB) {
      return NextResponse.json({ error: 'Fichier trop volumineux (max 500 Ko)' }, { status: 400 });
    }
    if (durationSec > MAX_DURATION_SEC) {
      return NextResponse.json({ error: `Max ${MAX_DURATION_SEC} secondes` }, { status: 400 });
    }

    // Find the home via hubSlug (plaque V1) OU qrHubSlug du bien (ÉTAPE 12/16 —
    // l'app invitée PWA poste avec le slug du bien)
    const plaque = await db.physicalQrCode.findUnique({
      where: { hubSlug: slug },
      select: { propertyId: true, isClaimed: true },
    });
    let resolvedPropertyId: string | null =
      plaque && plaque.isClaimed && plaque.propertyId ? plaque.propertyId : null;
    if (!resolvedPropertyId && !plaque) {
      const propertyBySlug = await db.property.findUnique({
        where: { qrHubSlug: slug },
        select: { id: true, isActive: true },
      });
      if (propertyBySlug?.isActive) resolvedPropertyId = propertyBySlug.id;
    }
    if (!resolvedPropertyId) {
      return NextResponse.json({ error: 'Hub non trouvé' }, { status: 404 });
    }
    const propertyId = resolvedPropertyId;

    // Ensure upload dir exists
    await mkdir(UPLOAD_DIR, { recursive: true });

    // Generate unique filename — extension issue d'une allowlist, jamais du client
    const clientExt = (audio.name?.split('.').pop() || '').toLowerCase();
    const ext = ALLOWED_AUDIO_EXT.has(clientExt) ? clientExt : 'webm';
    const filename = `${propertyId}-${crypto.randomBytes(8).toString('hex')}.${ext}`;
    const filePath = join(UPLOAD_DIR, basename(filename));

    // Save file
    const bytes = new Uint8Array(await audio.arrayBuffer());
    await writeFile(filePath, bytes);

    // Create DB record
    const voiceMsg = await db.voiceMessage.create({
      data: {
        propertyId: propertyId,
        senderName: senderName.trim().slice(0, 50),
        senderType: 'guest',
        audioUrl: `/uploads/voice/${filename}`,
        durationSec: Math.min(durationSec, MAX_DURATION_SEC),
        fileSizeKb,
      },
    });

    return NextResponse.json({
      success: true,
      id: voiceMsg.id,
      audioUrl: voiceMsg.audioUrl,
      durationSec: voiceMsg.durationSec,
      createdAt: voiceMsg.createdAt,
    }, { status: 201 });
  } catch (error) {
    // FIX-14 — captureError console.error + trace AuditLog, ne jette jamais.
    await captureError('hub.voice.upload', error, undefined, req);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// GET: List voice messages for a hub — RÉSERVÉ À L'HÔTE (AUD-FULL/FIX-1) :
// PIN bcrypt obligatoire (fail-closed) car les messages contiennent la voix
// des invités. Résolution double plaque V1 / property.qrHubSlug (É12).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const url = new URL(req.url);
    const parsedLimit = parseInt(url.searchParams.get('limit') || '20', 10);
    const limit = Math.min(Number.isFinite(parsedLimit) ? parsedLimit : 20, 50) || 20;
    const pin = url.searchParams.get('pin') || '';

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
      where: { id: propertyId },
      select: { id: true, pinHash: true },
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
    if (!pin || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: 'PIN requis (4 chiffres)' }, { status: 400 });
    }
    // FIX-15 (B) — Anti brute-force par IP (10 tentatives/min) ; le quota
    // slug global serait un vecteur de DoS du mode hôte : un tiers pouvait
    // épuiser `hubvoicepin:<slug>` et verrouiller l'hôte légitime.
    if (!(await rateLimit(`hubvoicepin:${slug}:${clientIp(req.headers) ?? 'local'}`, 10))) {
      return NextResponse.json({ error: 'Trop de tentatives. Réessayez dans un instant.' }, { status: 429 });
    }
    const isValid = await compare(pin, property.pinHash);
    if (!isValid) {
      return NextResponse.json({ error: 'PIN incorrect' }, { status: 401 });
    }

    const messages = await db.voiceMessage.findMany({
      where: { propertyId: property.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        senderName: true,
        senderType: true,
        audioUrl: true,
        durationSec: true,
        fileSizeKb: true,
        isRead: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ messages });
  } catch (error) {
    // FIX-14 — captureError console.error + trace AuditLog, ne jette jamais.
    await captureError('hub.voice.list', error, undefined, req);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
