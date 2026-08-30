import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET: Fetch module content for a QR code
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const qrCodeId = searchParams.get('qrCodeId');

    if (!qrCodeId) {
      return NextResponse.json(
        { error: 'Le paramètre qrCodeId est requis' },
        { status: 400 }
      );
    }

    const qrCode = await db.qrCode.findUnique({
      where: { id: qrCodeId },
      include: {
        content: true,
        room: { select: { id: true, name: true, icon: true } },
      },
    });

    if (!qrCode) {
      return NextResponse.json(
        { error: 'QR code introuvable' },
        { status: 404 }
      );
    }

    let contentData: Record<string, unknown> = {};
    if (qrCode.content) {
      try {
        contentData = JSON.parse(qrCode.content.contentJson);
      } catch {
        contentData = {};
      }
    }

    return NextResponse.json({
      qrCode: {
        id: qrCode.id,
        name: qrCode.name,
        type: qrCode.type,
        room: qrCode.room,
        isActive: qrCode.isActive,
      },
      content: contentData,
    });
  } catch (error) {
    console.error('[module-content GET] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

// PUT: Save module content for a QR code
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { qrCodeId, content } = body as {
      qrCodeId: string;
      content: Record<string, unknown>;
    };

    if (!qrCodeId) {
      return NextResponse.json(
        { error: 'Le paramètre qrCodeId est requis' },
        { status: 400 }
      );
    }

    const qrCode = await db.qrCode.findUnique({
      where: { id: qrCodeId },
    });

    if (!qrCode) {
      return NextResponse.json(
        { error: 'QR code introuvable' },
        { status: 404 }
      );
    }

    const contentJson = JSON.stringify(content);

    // Upsert content
    const existing = await db.qrContent.findUnique({
      where: { qrCodeId },
    });

    if (existing) {
      await db.qrContent.update({
        where: { id: existing.id },
        data: { contentJson },
      });
    } else {
      await db.qrContent.create({
        data: { qrCodeId, contentJson },
      });
    }

    return NextResponse.json({ success: true, content });
  } catch (error) {
    console.error('[module-content PUT] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
