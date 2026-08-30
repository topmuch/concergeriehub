import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sendPushToHome } from '@/lib/push-sender';
import { SERVICE_REQUEST_STATUSES, URGENCY_LEVELS } from '@/types/database';

// GET: Get single service request with professional, service, reviews, and chat messages
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const serviceRequest = await db.serviceRequest.findUnique({
      where: { id },
      include: {
        professional: {
          include: {
            user: {
              select: { id: true, email: true, fullName: true },
            },
          },
        },
        service: true,
        reviews: {
          include: {
            user: {
              select: { id: true, email: true, fullName: true },
            },
          },
        },
        chatMessages: {
          include: {
            sender: {
              select: { id: true, email: true, fullName: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!serviceRequest) {
      return NextResponse.json(
        { error: 'Demande de service introuvable' },
        { status: 404 }
      );
    }

    return NextResponse.json(serviceRequest);
  } catch (error) {
    console.error('[service-requests GET by id] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

// PATCH: Update status, finalPrice, commissionAmount, preferredDate
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      status,
      finalPrice,
      commissionAmount,
      preferredDate,
    } = body as {
      status?: string;
      finalPrice?: number;
      commissionAmount?: number;
      preferredDate?: string;
    };

    const existing = await db.serviceRequest.findUnique({
      where: { id },
      include: {
        professional: {
          select: { userId: true, businessName: true },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Demande de service introuvable' },
        { status: 404 }
      );
    }

    if (status && !SERVICE_REQUEST_STATUSES.includes(status as typeof SERVICE_REQUEST_STATUSES[number])) {
      return NextResponse.json(
        { error: 'Statut invalide. Valeurs autorisées : pending, accepted, in_progress, completed, cancelled, disputed' },
        { status: 400 }
      );
    }

    const updated = await db.serviceRequest.update({
      where: { id },
      data: {
        ...(status !== undefined ? { status } : {}),
        ...(finalPrice !== undefined ? { finalPrice } : {}),
        ...(commissionAmount !== undefined ? { commissionAmount } : {}),
        ...(preferredDate !== undefined ? { preferredDate: preferredDate ? new Date(preferredDate) : null } : {}),
      },
      include: {
        professional: {
          include: {
            user: {
              select: { id: true, email: true, fullName: true },
            },
          },
        },
        service: true,
      },
    });

    // Send push notification to homeowner when status changes
    if (status && status !== existing.status) {
      try {
        const statusLabels: Record<string, string> = {
          accepted: 'acceptée',
          in_progress: 'en cours',
          completed: 'terminée',
          cancelled: 'annulée',
          disputed: 'contestée',
        };

        await sendPushToHome(existing.homeId, {
          title: 'Mise à jour de votre demande',
          body: `Votre demande de service a été ${statusLabels[status] || status}.`,
          tag: `service-request-${id}`,
          data: { serviceRequestId: id, status },
        });
      } catch (pushError) {
        console.error('[service-requests PATCH] Push notification failed:', pushError);
      }
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('[service-requests PATCH] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
