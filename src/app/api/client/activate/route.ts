import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, moduleType, name, homeId, roomId, content } = body as {
      code: string;
      moduleType: string;
      name?: string;
      homeId?: string;
      roomId?: string;
      content?: Record<string, unknown>;
    };

    if (!code || !moduleType) {
      return NextResponse.json(
        { error: 'Champs requis: code, moduleType' },
        { status: 400 }
      );
    }

    // Resolve authenticated user
    const session = await getServerSession(authOptions);
    let userId: string | undefined;
    let resolvedHomeId: string | undefined = homeId;
    let resolvedRoomId: string | undefined = roomId;

    if (session?.user?.id) {
      userId = session.user.id;

      // Auto-resolve home if not provided
      if (!resolvedHomeId) {
        const membership = await db.homeMember.findFirst({
          where: { userId },
          include: { home: true },
        });
        if (membership?.home) {
          resolvedHomeId = membership.home.id;
        } else {
          // Create a default home if none exists
          const home = await db.home.create({
            data: {
              ownerId: userId,
              name: 'Ma Maison',
              address: '',
              isActive: true,
            },
          });
          await db.homeMember.create({
            data: { homeId: home.id, userId, role: 'owner' },
          });
          resolvedHomeId = home.id;
        }
      }

      // Auto-resolve room if not provided
      if (!resolvedRoomId && resolvedHomeId) {
        let room = await db.room.findFirst({
          where: { homeId: resolvedHomeId },
        });
        if (!room) {
          // Auto-create a default room
          room = await db.room.create({
            data: { homeId: resolvedHomeId, name: 'Piece principale' },
          });
        }
        resolvedRoomId = room.id;
      }
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'Vous devez etre connecte pour activer un QR code' },
        { status: 401 }
      );
    }

    if (!resolvedHomeId) {
      return NextResponse.json(
        { error: 'Aucune maison trouvee. Creez une maison dans votre dashboard.' },
        { status: 400 }
      );
    }

    const publicSlug = crypto.randomUUID().slice(0, 8);

    const result = await db.$transaction(async (tx) => {
      // 1. Find physical QR code and verify it's inactive
      const physicalQr = await tx.physicalQrCode.findUnique({
        where: { activationCode: code },
      });

      if (!physicalQr) {
        throw new Error('Code QR physique introuvable');
      }

      if (physicalQr.status !== 'inactive') {
        throw new Error(`Ce code QR est deja ${physicalQr.status}`);
      }

      // 2. Create QrCode record
      const qrCode = await tx.qrCode.create({
        data: {
          homeId: resolvedHomeId,
          roomId: resolvedRoomId || null,
          name: name || `QR ${code}`,
          type: moduleType,
          publicSlug,
          isActive: true,
        },
      });

      // 3. Create QrContent — merge provided content with defaults
      const defaults = getDefaultContent(moduleType);
      const savedContent = content && Object.keys(content).length > 0
        ? { ...defaults, ...content }
        : defaults;
      await tx.qrContent.create({
        data: {
          qrCodeId: qrCode.id,
          contentJson: JSON.stringify(savedContent),
        },
      });

      // 4. Update PhysicalQrCode
      const updatedPhysicalQr = await tx.physicalQrCode.update({
        where: { id: physicalQr.id },
        data: {
          status: 'active',
          activatedByUserId: userId,
          activatedAt: new Date(),
          dynamicQrCodeId: qrCode.id,
        },
      });

      // 5. Create ActivationLog
      await tx.activationLog.create({
        data: {
          physicalQrCodeId: physicalQr.id,
          userId,
          action: 'activated',
        },
      });

      // 6. Create ActivityLog for the home
      await tx.activityLog.create({
        data: {
          homeId: resolvedHomeId,
          qrCodeId: qrCode.id,
          userId,
          actionType: 'qr_activated',
          detailsJson: JSON.stringify({
            qrCodeName: name || `QR ${code}`,
            moduleType,
            activationCode: code,
          }),
        },
      });

      return { qrCode, physicalQr: updatedPhysicalQr };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[activate] Error:', error);
    const message = error instanceof Error ? error.message : 'Erreur interne du serveur';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function getDefaultContent(moduleType: string): Record<string, unknown> {
  switch (moduleType) {
    case 'wifi':
      return { ssid: '', password: '', security: 'WPA2', hidden: false };
    case 'external_link':
      return { url: '', title: '' };
    case 'home_manual':
      return { title: '', body: '' };
    case 'doorbell':
      return { mode: 'absent', instructions: [], allowMessages: true, allowDoorbell: true, presentMessage: '', absentMessage: '' };
    case 'emergency':
      return { title: '', body: '', contacts: [] };
    case 'note':
      return { title: '', body: '' };
    case 'contact':
      return { name: '', phone: '', email: '' };
    case 'guestbook':
      return { title: '', body: '' };
    case 'meal_planner':
      return { title: '', body: '' };
    case 'medication':
      return { title: '', body: '' };
    case 'energy_monitor':
      return { title: '', body: '' };
    case 'key_location':
      return { title: '', body: '' };
    case 'cleaning_schedule':
      return { title: '', body: '' };
    case 'shopping_list':
      return { title: '', body: '', items: [] };
    case 'checklist':
      return { title: '', body: '', items: [] };
    default:
      return { title: '', body: '' };
  }
}
