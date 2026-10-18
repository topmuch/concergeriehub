import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { sendPushToHome } from '@/lib/push-sender';

// POST: Handle doorbell actions (ring, message) — session obligatoire
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const userId = (session.user as { id?: string }).id;

    const body = await request.json();
    const { qrCodeId, action, text } = body as {
      qrCodeId: string;
      action: 'ring' | 'message';
      text?: string;
    };

    if (!qrCodeId || !action) {
      return NextResponse.json(
        { error: 'Paramètres manquants' },
        { status: 400 }
      );
    }

    // Verify QR code exists
    const qrCode = await db.qrCode.findUnique({
      where: { id: qrCodeId },
      include: { property: true },
    });

    if (!qrCode) {
      return NextResponse.json(
        { error: 'QR code introuvable' },
        { status: 404 }
      );
    }

    const propertyId = qrCode.propertyId;

    // Log the action
    const actionType = action === 'ring' ? 'doorbell_ring' : 'doorbell_message';
    const details: Record<string, unknown> = {
      action,
      qrCodeName: qrCode.name,
      qrCodeType: qrCode.type,
      timestamp: new Date().toISOString(),
    };
    if (text) details.message = text;

    await db.activityLog.create({
      data: {
        propertyId,
        qrCodeId: qrCode.id,
        userId,
        actionType,
        detailsJson: JSON.stringify(details),
      },
    });

    // Send push notification to home owners/members (fire-and-forget)
    if (propertyId) {
      const pushPayload = action === 'ring'
        ? {
            title: '🔔 Quelqu\'un sonne !',
            body: `Un visiteur a sonné à "${qrCode.name || 'votre porte'}"`,
            tag: `doorbell-${qrCodeId}`,
            data: { type: 'doorbell', qrCodeId, propertyId },
            actions: [
              { action: 'view', title: 'Voir' },
            ],
          }
        : {
            title: '💬 Nouveau message',
            body: text ? `${text.slice(0, 80)}${text.length > 80 ? '...' : ''}` : 'Un visiteur vous a laissé un message',
            tag: `doorbell-msg-${qrCodeId}`,
            data: { type: 'doorbell_message', qrCodeId, propertyId },
            actions: [
              { action: 'view', title: 'Voir' },
            ],
          };

      // Fire and forget — don't block the response
      sendPushToHome(propertyId, pushPayload).then((result) => {
        if (result.sent > 0) {
          console.log(`[doorbell] Push sent: ${result.sent} to home ${propertyId}`);
        }
      }).catch((err) => {
        console.error('[doorbell] Push error:', err);
      });
    }

    return NextResponse.json({
      success: true,
      message: action === 'ring' ? 'Sonnette envoyée' : 'Message envoyé',
    });
  } catch (error) {
    console.error('[doorbell POST] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
