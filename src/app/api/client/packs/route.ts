import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { PACKS } from '@/lib/packs-config';
import crypto from 'crypto';

// GET: List all packs with installation status for a home
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

    // Fetch all existing QR codes for this home (type + name only)
    const existingQrCodes = await db.qrCode.findMany({
      where: { homeId, isActive: true },
      select: { type: true, name: true },
    });

    // Build a Set of "moduleType::name" for fast lookup
    const installedKeys = new Set(
      existingQrCodes.map((qr) => `${qr.type}::${qr.name}`)
    );

    // Enrich each pack with installedCount / totalCount
    const packs = PACKS.map((pack) => {
      const total = pack.qrCodes.length;
      let installed = 0;
      const qrStatuses = pack.qrCodes.map((qr) => {
        const key = `${qr.moduleType}::${qr.name}`;
        const isInstalled = installedKeys.has(key);
        if (isInstalled) installed++;
        return {
          moduleType: qr.moduleType,
          name: qr.name,
          roomName: qr.roomName,
          installed: isInstalled,
        };
      });

      return {
        id: pack.id,
        name: pack.name,
        description: pack.description,
        icon: pack.icon,
        color: pack.color,
        targetAudience: pack.targetAudience,
        badge: pack.badge,
        features: pack.features,
        installedCount: installed,
        totalCount: total,
        qrCodes: qrStatuses,
      };
    });

    return NextResponse.json({ packs });
  } catch (error) {
    console.error('[packs GET] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

// POST: Install a pack into a home
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { homeId, packId, userId } = body as {
      homeId: string;
      packId: string;
      userId?: string;
    };

    if (!homeId || !packId) {
      return NextResponse.json(
        { error: 'Champs requis: homeId, packId' },
        { status: 400 }
      );
    }

    // Find pack definition
    const pack = PACKS.find((p) => p.id === packId);
    if (!pack) {
      return NextResponse.json(
        { error: 'Pack introuvable' },
        { status: 404 }
      );
    }

    // Verify home exists
    const home = await db.home.findUnique({ where: { id: homeId } });
    if (!home) {
      return NextResponse.json(
        { error: 'Maison introuvable' },
        { status: 404 }
      );
    }

    // Resolve userId for activity logs
    let resolvedUserId = userId;
    if (!resolvedUserId) {
      const member = await db.homeMember.findFirst({
        where: { homeId },
      });
      resolvedUserId = member?.userId;
    }

    // Fetch existing QR codes to skip already-installed ones
    const existingQrCodes = await db.qrCode.findMany({
      where: { homeId, isActive: true },
      select: { type: true, name: true },
    });
    const installedKeys = new Set(
      existingQrCodes.map((qr) => `${qr.type}::${qr.name}`)
    );

    // Collect unique roomNames from the pack
    const roomNames = [...new Set(pack.qrCodes.map((qr) => qr.roomName))];

    let installed = 0;

    await db.$transaction(async (tx) => {
      // Find or create rooms
      const roomMap = new Map<string, string>();

      for (const roomName of roomNames) {
        const existingRoom = await tx.room.findFirst({
          where: { homeId, name: roomName },
        });

        if (existingRoom) {
          roomMap.set(roomName, existingRoom.id);
        } else {
          const newRoom = await tx.room.create({
            data: { homeId, name: roomName },
          });
          roomMap.set(roomName, newRoom.id);
        }
      }

      // Create each QR code (skip already installed)
      for (const qrDef of pack.qrCodes) {
        const key = `${qrDef.moduleType}::${qrDef.name}`;
        if (installedKeys.has(key)) continue;

        const roomId = roomMap.get(qrDef.roomName);
        const publicSlug = crypto.randomUUID().slice(0, 8);

        const qrCode = await tx.qrCode.create({
          data: {
            homeId,
            roomId: roomId || null,
            name: qrDef.name,
            type: qrDef.moduleType,
            publicSlug,
            isActive: true,
          },
        });

        await tx.qrContent.create({
          data: {
            qrCodeId: qrCode.id,
            contentJson: JSON.stringify(qrDef.defaultContent),
          },
        });

        // Activity log
        if (resolvedUserId) {
          await tx.activityLog.create({
            data: {
              homeId,
              qrCodeId: qrCode.id,
              userId: resolvedUserId,
              actionType: 'qr_activated',
              detailsJson: JSON.stringify({
                qrCodeName: qrDef.name,
                moduleType: qrDef.moduleType,
                packId: pack.id,
                packName: pack.name,
              }),
            },
          });
        }

        installed++;
      }
    });

    return NextResponse.json({
      success: true,
      installed,
      packName: pack.name,
    });
  } catch (error) {
    console.error('[packs POST] Error:', error);
    const message =
      error instanceof Error ? error.message : 'Erreur interne du serveur';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
