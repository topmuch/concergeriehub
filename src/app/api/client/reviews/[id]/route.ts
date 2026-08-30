import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Helper: recalculate professional rating
async function recalcProfessionalRating(professionalId: string) {
  const reviews = await db.review.findMany({ where: { professionalId } });
  const totalReviews = reviews.length;
  const ratingAvg = totalReviews > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews : 0;
  await db.professional.update({
    where: { id: professionalId },
    data: {
      ratingAvg: Math.round(ratingAvg * 10) / 10,
      totalReviews,
    },
  });
}

// GET: Get single review
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const review = await db.review.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, email: true, fullName: true },
        },
        professional: {
          select: { id: true, businessName: true },
        },
        serviceRequest: {
          select: { id: true, status: true },
        },
      },
    });

    if (!review) {
      return NextResponse.json(
        { error: 'Avis introuvable' },
        { status: 404 }
      );
    }

    return NextResponse.json(review);
  } catch (error) {
    console.error('[reviews GET by id] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

// PATCH: Update rating and comment
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { rating, comment } = body as {
      rating?: number;
      comment?: string | null;
    };

    const existing = await db.review.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Avis introuvable' },
        { status: 404 }
      );
    }

    if (rating !== undefined && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
      return NextResponse.json(
        { error: 'La note doit être un entier entre 1 et 5' },
        { status: 400 }
      );
    }

    const updated = await db.review.update({
      where: { id },
      data: {
        ...(rating !== undefined ? { rating } : {}),
        ...(comment !== undefined ? { comment: comment ?? null } : {}),
      },
      include: {
        user: {
          select: { id: true, email: true, fullName: true },
        },
      },
    });

    // Recalculate professional rating
    await recalcProfessionalRating(existing.professionalId);

    return NextResponse.json(updated);
  } catch (error) {
    console.error('[reviews PATCH] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

// DELETE: Delete review and recalculate professional rating
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.review.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Avis introuvable' },
        { status: 404 }
      );
    }

    const professionalId = existing.professionalId;

    await db.review.delete({ where: { id } });

    // Recalculate professional rating
    await recalcProfessionalRating(professionalId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[reviews DELETE] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
