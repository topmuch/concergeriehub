import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { db } from '@/lib/db';
import crypto from 'crypto';

const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads', 'voice');
const MAX_DURATION_SEC = 30;
const MAX_FILE_SIZE_KB = 500; // ~500KB for 30s webm

// POST: Upload a voice message for a hub
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const formData = await req.formData();
    const audio = formData.get('audio') as File | null;
    const senderName = (formData.get('senderName') as string) || 'Invité';
    const durationSec = parseInt(formData.get('durationSec') as string) || 0;

    // Validate
    if (!audio) {
      return NextResponse.json({ error: 'Fichier audio requis' }, { status: 400 });
    }
    if (!audio.type.startsWith('audio/')) {
      return NextResponse.json({ error: 'Format audio uniquement' }, { status: 400 });
    }
    const fileSizeKb = Math.round(audio.size / 1024);
    if (fileSizeKb > MAX_FILE_SIZE_KB * 10) {
      return NextResponse.json({ error: 'Fichier trop volumineux' }, { status: 400 });
    }
    if (durationSec > MAX_DURATION_SEC) {
      return NextResponse.json({ error: `Max ${MAX_DURATION_SEC} secondes` }, { status: 400 });
    }

    // Find the home via hubSlug
    const plaque = await db.physicalQrCode.findUnique({
      where: { hubSlug: slug },
      select: { homeId: true, isClaimed: true },
    });
    if (!plaque || !plaque.isClaimed || !plaque.homeId) {
      return NextResponse.json({ error: 'Hub non trouvé' }, { status: 404 });
    }

    // Ensure upload dir exists
    await mkdir(UPLOAD_DIR, { recursive: true });

    // Generate unique filename
    const ext = audio.name?.split('.').pop() || 'webm';
    const filename = `${plaque.homeId}-${crypto.randomBytes(8).toString('hex')}.${ext}`;
    const filePath = join(UPLOAD_DIR, filename);

    // Save file
    const bytes = new Uint8Array(await audio.arrayBuffer());
    await writeFile(filePath, bytes);

    // Create DB record
    const voiceMsg = await db.voiceMessage.create({
      data: {
        homeId: plaque.homeId,
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
    console.error('Voice upload error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// GET: List voice messages for a hub
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);

    const plaque = await db.physicalQrCode.findUnique({
      where: { hubSlug: slug },
      select: { homeId: true, isClaimed: true },
    });
    if (!plaque || !plaque.isClaimed || !plaque.homeId) {
      return NextResponse.json({ error: 'Hub non trouvé' }, { status: 404 });
    }

    const messages = await db.voiceMessage.findMany({
      where: { homeId: plaque.homeId },
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
    console.error('Voice list error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
