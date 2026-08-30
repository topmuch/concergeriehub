import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

async function ensureDemoUser() {
  let user = await db.user.findFirst({
    where: { email: 'demo@qrdomotik.roomscan.pro' },
  });

  if (!user) {
    user = await db.user.create({
      data: {
        email: 'demo@qrdomotik.roomscan.pro',
        fullName: 'Utilisateur Démo',
        role: 'user',
      },
    });

    const home = await db.home.create({
      data: {
        ownerId: user.id,
        name: 'Ma Maison',
        address: 'Dakar, Sénégal',
        isActive: true,
      },
    });

    await db.homeMember.create({
      data: {
        homeId: home.id,
        userId: user.id,
        role: 'owner',
      },
    });
  }

  const member = await db.homeMember.findFirst({
    where: { userId: user.id },
    include: { home: true },
  });

  return { user, home: member?.home };
}

// GET: List QR codes for a home
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const homeId = searchParams.get('homeId');

    if (!homeId) {
      return NextResponse.json(
        { error: 'Le paramètre homeId est requis' },
        { status: 400 }
      );
    }

    const qrCodes = await db.qrCode.findMany({
      where: { homeId },
      include: {
        room: {
          select: { id: true, name: true, icon: true },
        },
        content: {
          select: { id: true, contentJson: true, updatedAt: true },
        },
        physicalQrCodes: {
          select: {
            id: true,
            activationCode: true,
            status: true,
            designConfig: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ qrCodes });
  } catch (error) {
    console.error('[qr-codes GET] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

// PATCH: Update a QR code
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, isActive, roomId, content } = body as {
      id: string;
      name?: string;
      isActive?: boolean;
      roomId?: string;
      content?: Record<string, string>;
    };

    if (!id) {
      return NextResponse.json(
        { error: 'L\'id du QR code est requis' },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (roomId !== undefined) updateData.roomId = roomId;

    // Update content if provided
    if (content) {
      const existingContent = await db.qrContent.findUnique({
        where: { qrCodeId: id },
      });

      if (existingContent) {
        await db.qrContent.update({
          where: { qrCodeId: id },
          data: { contentJson: JSON.stringify(content) },
        });
      } else {
        await db.qrContent.create({
          data: { qrCodeId: id, contentJson: JSON.stringify(content) },
        });
      }
    }

    const qrCode = await db.qrCode.update({
      where: { id },
      data: updateData,
      include: {
        room: {
          select: { id: true, name: true, icon: true },
        },
        content: {
          select: { id: true, contentJson: true, updatedAt: true },
        },
      },
    });

    return NextResponse.json(qrCode);
  } catch (error) {
    console.error('[qr-codes PATCH] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

// DELETE: Deactivate a QR code
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, physicalQrCodeId, userId } = body as {
      id: string;
      physicalQrCodeId: string;
      userId?: string;
    };

    if (!id || !physicalQrCodeId) {
      return NextResponse.json(
        { error: 'Les champs id et physicalQrCodeId sont requis' },
        { status: 400 }
      );
    }

    // Resolve user
    let user;
    if (userId) {
      user = await db.user.findUnique({ where: { id: userId } });
      if (!user) {
        return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });
      }
    } else {
      const demo = await ensureDemoUser();
      user = demo.user;
    }

    await db.$transaction(async (tx) => {
      // 1. Get QR code for homeId
      const qrCode = await tx.qrCode.findUnique({ where: { id } });
      if (!qrCode) {
        throw new Error('QR code introuvable');
      }

      // 2. Update PhysicalQrCode — reset to inactive
      await tx.physicalQrCode.update({
        where: { id: physicalQrCodeId },
        data: {
          status: 'inactive',
          activatedByUserId: null,
          activatedAt: null,
          dynamicQrCodeId: null,
        },
      });

      // 3. Create ActivationLog with action 'deactivated'
      await tx.activationLog.create({
        data: {
          physicalQrCodeId,
          userId: user.id,
          action: 'deactivated',
        },
      });

      // 4. Soft-delete the QrCode
      await tx.qrCode.update({
        where: { id },
        data: { isActive: false },
      });

      // 5. Create ActivityLog
      await tx.activityLog.create({
        data: {
          homeId: qrCode.homeId,
          qrCodeId: id,
          userId: user.id,
          actionType: 'qr_deactivated',
          detailsJson: JSON.stringify({
            qrCodeName: qrCode.name,
            qrCodeType: qrCode.type,
          }),
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[qr-codes DELETE] Error:', error);
    const message = error instanceof Error ? error.message : 'Erreur interne du serveur';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
