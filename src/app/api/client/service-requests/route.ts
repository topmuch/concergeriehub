import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sendPushToUser } from '@/lib/push-sender';
import { SERVICE_REQUEST_STATUSES, URGENCY_LEVELS } from '@/types/database';

// GET: List service requests for a home
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get('propertyId');
    const status = searchParams.get('status');

    if (!propertyId) {
      return NextResponse.json(
        { error: 'Le paramètre propertyId est requis' },
        { status: 400 }
      );
    }

    if (status && !SERVICE_REQUEST_STATUSES.includes(status as typeof SERVICE_REQUEST_STATUSES[number])) {
      return NextResponse.json(
        { error: 'Statut invalide. Valeurs autorisées : pending, accepted, in_progress, completed, cancelled, disputed' },
        { status: 400 }
      );
    }

    const where: Record<string, unknown> = { propertyId };
    if (status) where.status = status;

    const serviceRequests = await db.serviceRequest.findMany({
      where,
      include: {
        provider: {
          include: {
            user: {
              select: { id: true, email: true, fullName: true },
            },
          },
        },
        service: true,
        _count: {
          select: {
            chatMessages: {
              where: { isRead: false },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = serviceRequests.map((sr) => ({
      ...sr,
      unreadChatCount: sr._count.chatMessages,
    }));

    return NextResponse.json({ serviceRequests: result });
  } catch (error) {
    console.error('[service-requests GET] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

// POST: Create a service request
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      propertyId,
      providerId,
      serviceId,
      description,
      preferredDate,
      urgencyLevel,
      address,
      photos,
    } = body as {
      propertyId: string;
      providerId: string;
      serviceId?: string;
      description?: string;
      preferredDate?: string;
      urgencyLevel?: string;
      address?: string;
      photos?: string[];
    };

    if (!propertyId || !providerId) {
      return NextResponse.json(
        { error: 'Les champs propertyId et providerId sont requis' },
        { status: 400 }
      );
    }

    if (urgencyLevel && !URGENCY_LEVELS.includes(urgencyLevel as typeof URGENCY_LEVELS[number])) {
      return NextResponse.json(
        { error: "Niveau d'urgence invalide. Valeurs autorisées : normal, urgent, emergency" },
        { status: 400 }
      );
    }

    // Verify home exists
    const home = await db.property.findUnique({ where: { id: propertyId } });
    if (!home) {
      return NextResponse.json(
        { error: 'Maison introuvable' },
        { status: 404 }
      );
    }

    // Verify provider exists
    const provider = await db.provider.findUnique({ where: { id: providerId } });
    if (!provider) {
      return NextResponse.json(
        { error: 'Professionnel introuvable' },
        { status: 404 }
      );
    }

    // Verify service exists if provided
    if (serviceId) {
      const service = await db.service.findUnique({ where: { id: serviceId } });
      if (!service) {
        return NextResponse.json(
          { error: 'Service introuvable' },
          { status: 404 }
        );
      }
    }

    const serviceRequest = await db.serviceRequest.create({
      data: {
        propertyId,
        providerId,
        serviceId: serviceId ?? null,
        status: 'pending',
        description: description ?? null,
        preferredDate: preferredDate ? new Date(preferredDate) : null,
        urgencyLevel: urgencyLevel ?? 'normal',
        address: address ?? null,
        photos: photos ? JSON.stringify(photos) : '[]',
      },
      include: {
        provider: {
          include: {
            user: {
              select: { id: true, email: true, fullName: true },
            },
          },
        },
        service: true,
      },
    });

    // Send push notification to the provider
    try {
      await sendPushToUser(provider.userId, {
        title: 'Nouvelle demande de service',
        body: `Vous avez reçu une nouvelle demande de service pour ${provider.businessName}.`,
        tag: `service-request-${serviceRequest.id}`,
        data: { serviceRequestId: serviceRequest.id },
      });
    } catch (pushError) {
      console.error('[service-requests POST] Push notification failed:', pushError);
    }

    return NextResponse.json(serviceRequest, { status: 201 });
  } catch (error) {
    console.error('[service-requests POST] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
