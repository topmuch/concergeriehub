import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * Vérifie que l'utilisateur est owner de la propriété
 * ou membre actif (invitation acceptée).
 */
async function canAccessProperty(userId: string, propertyId: string): Promise<boolean> {
  const property = await db.property.findFirst({
    where: {
      id: propertyId,
      OR: [
        { ownerId: userId },
        { members: { some: { userId, acceptedAt: { not: null } } } },
      ],
    },
    select: { id: true },
  });
  return property !== null;
}

// GET: Fetch module content for a QR code
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const userId = (session.user as { id?: string }).id;
    if (!userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

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

    if (!(await canAccessProperty(userId, qrCode.propertyId))) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
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
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const userId = (session.user as { id?: string }).id;
    if (!userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

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

    // Garde d'accès AVANT l'upsert : owner OU membre accepté
    if (!(await canAccessProperty(userId, qrCode.propertyId))) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
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
