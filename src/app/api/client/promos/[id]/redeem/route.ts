import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// POST: Redeem a promo
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const promo = await db.promo.findUnique({ where: { id } });
    if (!promo) {
      return NextResponse.json(
        { error: 'Promo not found' },
        { status: 404 }
      );
    }

    const redemption = await db.promoRedemption.create({
      data: {
        promoId: id,
        userId: 'dev-user-1',
      },
    });

    // Increment promo redemption count
    await db.promo.update({
      where: { id },
      data: {
        redemptionsCount: { increment: 1 },
      },
    });

    return NextResponse.json(redemption, { status: 201 });
  } catch (error) {
    console.error('[promos/:id/redeem POST] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
