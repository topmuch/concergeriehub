import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Helper: recalculate provider rating
async function recalcProfessionalRating(providerId: string) {
  const reviews = await db.review.findMany({ where: { providerId } });
  const totalReviews = reviews.length;
  const ratingAvg = totalReviews > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews : 0;
  await db.provider.update({
    where: { id: providerId },
    data: {
      ratingAvg: Math.round(ratingAvg * 10) / 10,
      totalReviews,
    },
  });
}

// GET: List reviews
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get('providerId');
    const serviceRequestId = searchParams.get('serviceRequestId');
    const userId = searchParams.get('userId');

    const where: Record<string, unknown> = {};
    if (providerId) where.providerId = providerId;
    if (serviceRequestId) where.serviceRequestId = serviceRequestId;
    if (userId) where.userId = userId;

    const reviews = await db.review.findMany({
      where,
      include: {
        user: {
          select: { id: true, email: true, fullName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ reviews });
  } catch (error) {
    console.error('[reviews GET] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

// POST: Create a review
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      serviceRequestId,
      providerId,
      userId,
      rating,
      comment,
    } = body as {
      serviceRequestId: string;
      providerId: string;
      userId: string;
      rating: number;
      comment?: string;
    };

    if (!serviceRequestId || !providerId || !userId || rating === undefined) {
      return NextResponse.json(
        { error: 'Les champs serviceRequestId, providerId, userId et rating sont requis' },
        { status: 400 }
      );
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: 'La note doit être un entier entre 1 et 5' },
        { status: 400 }
      );
    }

    // Verify service request exists
    const serviceRequest = await db.serviceRequest.findUnique({
      where: { id: serviceRequestId },
    });
    if (!serviceRequest) {
      return NextResponse.json(
        { error: 'Demande de service introuvable' },
        { status: 404 }
      );
    }

    // Verify provider exists
    const provider = await db.provider.findUnique({
      where: { id: providerId },
    });
    if (!provider) {
      return NextResponse.json(
        { error: 'Professionnel introuvable' },
        { status: 404 }
      );
    }

    const review = await db.review.create({
      data: {
        serviceRequestId,
        providerId,
        userId,
        rating,
        comment: comment ?? null,
      },
      include: {
        user: {
          select: { id: true, email: true, fullName: true },
        },
      },
    });

    // Recalculate provider rating
    await recalcProfessionalRating(providerId);

    return NextResponse.json(review, { status: 201 });
  } catch (error) {
    console.error('[reviews POST] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
