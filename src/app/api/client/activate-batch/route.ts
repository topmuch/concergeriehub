import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import crypto from 'crypto';

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { codes, moduleType, roomId, name, homeId, userId } = body as {
      codes: string[];
      moduleType: string;
      roomId: string;
      name: string;
      homeId: string;
      userId?: string;
    };

    if (!Array.isArray(codes) || codes.length === 0 || !moduleType || !roomId || !name || !homeId) {
      return NextResponse.json(
        { error: 'Champs requis: codes (array non vide), moduleType, roomId, name, homeId' },
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

    let activated = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const code of codes) {
      try {
        const publicSlug = crypto.randomUUID().slice(0, 8);

        await db.$transaction(async (tx) => {
          // 1. Find and verify physical QR code
          const physicalQr = await tx.physicalQrCode.findUnique({
            where: { activationCode: code },
          });

          if (!physicalQr) {
            throw new Error(`Code ${code} introuvable`);
          }

          if (physicalQr.status !== 'inactive') {
            throw new Error(`Code ${code} déjà ${physicalQr.status}`);
          }

          // 2. Create QrCode
          const qrCode = await tx.qrCode.create({
            data: {
              homeId,
              roomId,
              name: `${name} (${code.slice(-4)})`,
              type: moduleType,
              publicSlug,
              isActive: true,
            },
          });

          // 3. Create QrContent
          await tx.qrContent.create({
            data: {
              qrCodeId: qrCode.id,
              contentJson: '{}',
            },
          });

          // 4. Update PhysicalQrCode
          await tx.physicalQrCode.update({
            where: { id: physicalQr.id },
            data: {
              status: 'active',
              activatedByUserId: user.id,
              activatedAt: new Date(),
              dynamicQrCodeId: qrCode.id,
            },
          });

          // 5. ActivationLog
          await tx.activationLog.create({
            data: {
              physicalQrCodeId: physicalQr.id,
              userId: user.id,
              action: 'activated',
            },
          });

          // 6. ActivityLog
          await tx.activityLog.create({
            data: {
              homeId,
              qrCodeId: qrCode.id,
              userId: user.id,
              actionType: 'qr_activated_batch',
              detailsJson: JSON.stringify({
                qrCodeName: `${name} (${code.slice(-4)})`,
                moduleType,
                activationCode: code,
              }),
            },
          });
        });

        activated++;
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : `Échec pour le code ${code}`;
        errors.push(msg);
      }
    }

    return NextResponse.json({
      success: true,
      activated,
      failed,
      errors,
    });
  } catch (error) {
    console.error('[activate-batch] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
