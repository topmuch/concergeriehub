import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * Résout la session courante. Retourne null si non authentifié.
 */
async function getSessionUser(): Promise<{ id: string } | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const userId = (session.user as { id?: string }).id;
  return userId ? { id: userId } : null;
}

/**
 * PropertyIds accessibles : propriétés possédées + memberships acceptés.
 */
async function getAllowedPropertyIds(userId: string): Promise<string[]> {
  const [owned, memberships] = await Promise.all([
    db.property.findMany({ where: { ownerId: userId }, select: { id: true } }),
    db.propertyMember.findMany({
      where: { userId, acceptedAt: { not: null } },
      select: { propertyId: true },
    }),
  ]);
  return [...new Set([...owned.map((p) => p.id), ...memberships.map((m) => m.propertyId)])];
}

// GET: List QR codes — uniquement ceux des propriétés autorisées
export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const allowedPropertyIds = await getAllowedPropertyIds(user.id);

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get('propertyId');

    if (propertyId && !allowedPropertyIds.includes(propertyId)) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    const qrCodes = await db.qrCode.findMany({
      where: {
        propertyId: propertyId ? propertyId : { in: allowedPropertyIds },
      },
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

// PATCH: Update a QR code (propriété autorisée uniquement)
export async function PATCH(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

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

    const qrCode = await db.qrCode.findUnique({ where: { id } });
    if (!qrCode) {
      return NextResponse.json(
        { error: 'QR code introuvable' },
        { status: 404 }
      );
    }

    const allowedPropertyIds = await getAllowedPropertyIds(user.id);
    if (!allowedPropertyIds.includes(qrCode.propertyId)) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    if (roomId) {
      const room = await db.room.findFirst({
        where: { id: roomId, propertyId: qrCode.propertyId },
        select: { id: true },
      });
      if (!room) {
        return NextResponse.json(
          { error: 'Pièce introuvable dans cette propriété' },
          { status: 400 }
        );
      }
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

    const updated = await db.qrCode.update({
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

    return NextResponse.json(updated);
  } catch (error) {
    console.error('[qr-codes PATCH] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

// DELETE: Deactivate a QR code (propriété autorisée uniquement)
export async function DELETE(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const body = await request.json();
    const { id, physicalQrCodeId } = body as {
      id: string;
      physicalQrCodeId: string;
    };

    if (!id || !physicalQrCodeId) {
      return NextResponse.json(
        { error: 'Les champs id et physicalQrCodeId sont requis' },
        { status: 400 }
      );
    }

    const qrCode = await db.qrCode.findUnique({ where: { id } });
    if (!qrCode) {
      return NextResponse.json(
        { error: 'QR code introuvable' },
        { status: 404 }
      );
    }

    const allowedPropertyIds = await getAllowedPropertyIds(user.id);
    if (!allowedPropertyIds.includes(qrCode.propertyId)) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    await db.$transaction(async (tx) => {
      // 1. Update PhysicalQrCode — reset to inactive
      await tx.physicalQrCode.update({
        where: { id: physicalQrCodeId },
        data: {
          status: 'inactive',
          activatedByUserId: null,
          activatedAt: null,
          dynamicQrCodeId: null,
        },
      });

      // 2. Create ActivationLog with action 'deactivated'
      await tx.activationLog.create({
        data: {
          physicalQrCodeId,
          userId: user.id,
          action: 'deactivated',
        },
      });

      // 3. Soft-delete the QrCode
      await tx.qrCode.update({
        where: { id },
        data: { isActive: false },
      });

      // 4. Create ActivityLog
      await tx.activityLog.create({
        data: {
          propertyId: qrCode.propertyId,
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
