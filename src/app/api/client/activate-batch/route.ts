import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import crypto from 'crypto';

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

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const userId = (session.user as { id?: string }).id;
    if (!userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const user = { id: userId };

    const body = await request.json();
    const { codes, moduleType, roomId, name, propertyId } = body as {
      codes: string[];
      moduleType: string;
      roomId: string;
      name: string;
      propertyId: string;
    };

    if (!Array.isArray(codes) || codes.length === 0 || !moduleType || !roomId || !name || !propertyId) {
      return NextResponse.json(
        { error: 'Champs requis: codes (array non vide), moduleType, roomId, name, propertyId' },
        { status: 400 }
      );
    }

    // Garde d'accès : activation uniquement dans une propriété autorisée
    if (!(await canAccessProperty(userId, propertyId))) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
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
              propertyId,
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
              propertyId,
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
