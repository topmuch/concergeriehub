import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

function generateCouponCode(length = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// GET: List coupons for the dev user
export async function GET(request: NextRequest) {
  try {
    const status = request.nextUrl.searchParams.get('status');
    const userId = 'dev-user-1';

    const where: Record<string, unknown> = { userId };

    if (status) where.status = status;

    const coupons = await db.coupon.findMany({
      where,
      include: {
        merchant: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(coupons);
  } catch (error) {
    console.error('[coupons GET] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: Claim/create a coupon
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      merchantId,
      flashSaleId,
      discountType,
      discountValue,
      maxUses,
      validFrom,
      validUntil,
    } = body as {
      merchantId: string;
      flashSaleId?: string;
      discountType?: string;
      discountValue: number;
      maxUses?: number;
      validFrom?: string;
      validUntil?: string;
    };

    if (!merchantId || discountValue === undefined) {
      return NextResponse.json(
        { error: 'merchantId and discountValue are required' },
        { status: 400 }
      );
    }

    const userId = 'dev-user-1';
    const code = generateCouponCode();
    const couponId = `temp-${Date.now()}`; // placeholder for pre-generate ID
    const qrCodeData = JSON.stringify({ couponId });

    const coupon = await db.coupon.create({
      data: {
        merchantId,
        flashSaleId: flashSaleId ?? null,
        userId,
        code,
        qrCodeData,
        discountType: discountType ?? 'percentage',
        discountValue,
        maxUses: maxUses ?? 1,
        currentUses: 0,
        validFrom: validFrom ? new Date(validFrom) : null,
        validUntil: validUntil ? new Date(validUntil) : null,
        status: 'active',
      },
      include: {
        merchant: {
          select: { id: true, name: true },
        },
      },
    });

    // Update qrCodeData with actual coupon ID
    const updated = await db.coupon.update({
      where: { id: coupon.id },
      data: {
        qrCodeData: JSON.stringify({ couponId: coupon.id }),
      },
      include: {
        merchant: {
          select: { id: true, name: true },
        },
      },
    });

    return NextResponse.json(updated, { status: 201 });
  } catch (error) {
    console.error('[coupons POST] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
