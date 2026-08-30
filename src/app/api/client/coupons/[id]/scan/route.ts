import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// POST: Scan/validate a coupon
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { merchantId } = body as { merchantId: string };

    if (!merchantId) {
      return NextResponse.json(
        { error: 'merchantId is required' },
        { status: 400 }
      );
    }

    const coupon = await db.coupon.findUnique({ where: { id } });
    if (!coupon) {
      return NextResponse.json(
        { error: 'Coupon not found' },
        { status: 404 }
      );
    }

    if (coupon.status === 'used') {
      return NextResponse.json(
        { error: 'Coupon has already been fully used' },
        { status: 400 }
      );
    }

    const scannedByUserId = 'dev-user-1';

    const newCurrentUses = coupon.currentUses + 1;
    const isFullyUsed = newCurrentUses >= coupon.maxUses;
    const commissionAmount = coupon.discountValue * coupon.commissionRate / 100;

    const scan = await db.couponScan.create({
      data: {
        couponId: id,
        merchantId,
        scannedByUserId,
        commissionAmount,
      },
    });

    const updatedCoupon = await db.coupon.update({
      where: { id },
      data: {
        currentUses: newCurrentUses,
        ...(isFullyUsed && { status: 'used' }),
      },
    });

    return NextResponse.json({ scan, coupon: updatedCoupon }, { status: 201 });
  } catch (error) {
    console.error('[coupons/:id/scan POST] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
