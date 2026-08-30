import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { db } from '@/lib/db';
import crypto from 'crypto';

const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads', 'voice');
const MAX_DURATION_SEC = 30;

// POST: Upload a voice message linked to a QR code's home
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    // Find the QR code and its home
    const qrCode = await db.qrCode.findUnique({
      where: { id },
      select: { homeId: true },
    });
    if (!qrCode?.homeId) {
      return NextResponse.json({ error: 'Module non li\u00e9 \u00e0 une maison' }, { status: 404 });
    }

    // Ensure upload dir exists
    await mkdir(UPLOAD_DIR, { recursive: true });

    // Generate unique filename
    const ext = audio.name?.split('.').pop() || 'webm';
    const filename = `${qrCode.homeId}-${crypto.randomBytes(8).toString('hex')}.${ext}`;
    const filePath = join(UPLOAD_DIR, filename);

    // Save file
    const bytes = new Uint8Array(await audio.arrayBuffer());
    await writeFile(filePath, bytes);

    const fileSizeKb = Math.round(audio.size / 1024);

    // Create DB record
    const voiceMsg = await db.voiceMessage.create({
      data: {
        homeId: qrCode.homeId,
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
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);

    // Find the QR code and its home
    const qrCode = await db.qrCode.findUnique({
      where: { id },
      select: { homeId: true },
    });
    if (!qrCode?.homeId) {
      return NextResponse.json({ error: 'Module non li\u00e9 \u00e0 une maison' }, { status: 404 });
    }

    const messages = await db.voiceMessage.findMany({
      where: { homeId: qrCode.homeId },
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
