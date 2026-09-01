import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join, basename } from 'path';
import { db } from '@/lib/db';
import crypto from 'crypto';
import { rateLimit } from '@/lib/orders';

const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads', 'voice');
const MAX_DURATION_SEC = 30;
const MAX_FILE_SIZE_KB = 500;

// SÉCURITÉ : allowlist stricte des extensions — empêche tout path traversal.
const ALLOWED_AUDIO_EXT = new Set(['webm', 'ogg', 'mp3', 'm4a', 'wav']);

// POST: Upload a voice message linked to a QR code's home
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // Anti-spam : max 10 messages/minute/QR.
    if (!rateLimit(`qrvoice:${id}`, 10)) {
      return NextResponse.json({ error: 'Trop de tentatives. Réessayez dans un instant.' }, { status: 429 });
    }
    const formData = await req.formData();
    const audio = formData.get('audio') as File | null;
    const senderName = (formData.get('senderName') as string) || 'Invit\u00e9';
    const durationSec = parseInt(formData.get('durationSec') as string) || 0;

    if (!audio) {
      return NextResponse.json({ error: 'Fichier audio requis' }, { status: 400 });
    }
    if (!audio.type.startsWith('audio/')) {
      return NextResponse.json({ error: 'Format audio uniquement' }, { status: 400 });
    }
    if (durationSec > MAX_DURATION_SEC) {
      return NextResponse.json({ error: `Max ${MAX_DURATION_SEC} secondes` }, { status: 400 });
    }
    const fileSizeKb = Math.round(audio.size / 1024);
    if (fileSizeKb > MAX_FILE_SIZE_KB) {
      return NextResponse.json({ error: 'Fichier trop volumineux' }, { status: 400 });
    }

    // Find the QR code and its home
    const qrCode = await db.qrCode.findUnique({
      where: { id },
      select: { propertyId: true },
    });
    if (!qrCode?.propertyId) {
      return NextResponse.json({ error: 'Module non li\u00e9 \u00e0 une maison' }, { status: 404 });
    }

    // Ensure upload dir exists
    await mkdir(UPLOAD_DIR, { recursive: true });

    // Generate unique filename — extension issue d'une allowlist, jamais du client
    const clientExt = (audio.name?.split('.').pop() || '').toLowerCase();
    const ext = ALLOWED_AUDIO_EXT.has(clientExt) ? clientExt : 'webm';
    const filename = `${qrCode.propertyId}-${crypto.randomBytes(8).toString('hex')}.${ext}`;
    const filePath = join(UPLOAD_DIR, basename(filename));

    // Save file
    const bytes = new Uint8Array(await audio.arrayBuffer());
    await writeFile(filePath, bytes);

    // Create DB record
    const voiceMsg = await db.voiceMessage.create({
      data: {
        propertyId: qrCode.propertyId,
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
    console.error('QR Voice upload error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// GET: List voice messages for a QR code's home
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const parsedLimit = parseInt(url.searchParams.get('limit') || '20', 10);
    const limit = Math.min(Number.isFinite(parsedLimit) ? parsedLimit : 20, 50) || 20;

    // Find the QR code and its home
    const qrCode = await db.qrCode.findUnique({
      where: { id },
      select: { propertyId: true },
    });
    if (!qrCode?.propertyId) {
      return NextResponse.json({ error: 'Module non li\u00e9 \u00e0 une maison' }, { status: 404 });
    }

    const messages = await db.voiceMessage.findMany({
      where: { propertyId: qrCode.propertyId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        senderName: true,
        senderType: true,
        audioUrl: true,
        durationSec: true,
        isRead: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ messages });
  } catch (error) {
    console.error('QR Voice list error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
