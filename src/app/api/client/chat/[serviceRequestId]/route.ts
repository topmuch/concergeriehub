import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { CHAT_SENDER_TYPES, CHAT_MESSAGE_TYPES } from '@/types/database';
import { sendPushToUser } from '@/lib/push-sender';

// GET: Get all chat messages for a service request
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ serviceRequestId: string }> }
) {
  try {
    const { serviceRequestId } = await params;
    const { searchParams } = new URL(request.url);
    const markRead = searchParams.get('markRead') === 'true';
    const readerId = searchParams.get('readerId');

    // Verify service request exists
    const serviceRequest = await db.serviceRequest.findUnique({
      where: { id: serviceRequestId },
      select: { id: true, professionalId: true, homeId: true },
    });

    if (!serviceRequest) {
      return NextResponse.json(
        { error: 'Demande de service introuvable' },
        { status: 404 }
      );
    }

    // Optionally mark unread messages from the other party as read
    if (markRead && readerId) {
      const otherMessages = await db.chatMessage.findMany({
        where: {
          serviceRequestId,
          isRead: false,
          senderId: { not: readerId },
        },
        select: { id: true },
      });

      if (otherMessages.length > 0) {
        await db.chatMessage.updateMany({
          where: {
            id: { in: otherMessages.map(m => m.id) },
          },
          data: { isRead: true },
        });
      }
    }

    const messages = await db.chatMessage.findMany({
      where: { serviceRequestId },
      include: {
        sender: {
          select: { id: true, email: true, fullName: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ messages });
  } catch (error) {
    console.error('[chat GET] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

// POST: Send a message
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ serviceRequestId: string }> }
) {
  try {
    const { serviceRequestId } = await params;
    const body = await request.json();
    const {
      senderId,
      senderType,
      content,
      messageType,
      attachmentUrl,
    } = body as {
      senderId: string;
      senderType: string;
      content: string;
      messageType?: string;
      attachmentUrl?: string;
    };

    if (!senderId || !senderType || !content) {
      return NextResponse.json(
        { error: 'Les champs senderId, senderType et content sont requis' },
        { status: 400 }
      );
    }

    if (!CHAT_SENDER_TYPES.includes(senderType as typeof CHAT_SENDER_TYPES[number])) {
      return NextResponse.json(
        { error: "Type d'expéditeur invalide. Valeurs autorisées : homeowner, professional" },
        { status: 400 }
      );
    }

    if (messageType && !CHAT_MESSAGE_TYPES.includes(messageType as typeof CHAT_MESSAGE_TYPES[number])) {
      return NextResponse.json(
        { error: 'Type de message invalide. Valeurs autorisées : text, image, document, system' },
        { status: 400 }
      );
    }

    // Verify service request exists
    const serviceRequest = await db.serviceRequest.findUnique({
      where: { id: serviceRequestId },
      include: {
        professional: {
          select: { userId: true, businessName: true },
        },
        home: {
          select: { ownerId: true },
        },
      },
    });

    if (!serviceRequest) {
      return NextResponse.json(
        { error: 'Demande de service introuvable' },
        { status: 404 }
      );
    }

    const message = await db.chatMessage.create({
      data: {
        serviceRequestId,
        senderId,
        senderType,
        content,
        messageType: messageType ?? 'text',
        attachmentUrl: attachmentUrl ?? null,
        isRead: false,
      },
      include: {
        sender: {
          select: { id: true, email: true, fullName: true },
        },
      },
    });

    // Send push notification to the other party
    try {
      let recipientId: string | undefined;

      if (senderType === 'homeowner') {
        // Notify the professional
        recipientId = serviceRequest.professional.userId;
      } else if (senderType === 'professional') {
        // Notify the homeowner
        recipientId = serviceRequest.home.ownerId;
      }

      if (recipientId && recipientId !== senderId) {
        const previewText = content.length > 80 ? content.slice(0, 80) + '...' : content;
        await sendPushToUser(recipientId, {
          title: 'Nouveau message',
          body: previewText,
          tag: `chat-${serviceRequestId}`,
          data: { serviceRequestId, messageId: message.id },
        });
      }
    } catch (pushError) {
      console.error('[chat POST] Push notification failed:', pushError);
    }

    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    console.error('[chat POST] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
