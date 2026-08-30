import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET: Aggregate marketplace stats
export async function GET() {
  try {
    const userId = 'dev-user-1';

    const [totalMerchants, activePromos, activeFlashSales, myCoupons, totalRedemptions, totalScans] =
      await Promise.all([
        db.merchant.count({ where: { isActive: true } }),
        db.promo.count({ where: { validUntil: { gte: new Date() } } }),
        db.flashSale.count({ where: { status: 'active' } }),
        db.coupon.count({ where: { userId } }),
        db.promoRedemption.count({}),
        db.couponScan.count({}),
      ]);

    return NextResponse.json({
      totalMerchants,
      activePromos,
      activeFlashSales,
      myCoupons,
      totalRedemptions,
      totalScans,
    });
  } catch (error) {
    console.error('[marketplace/stats GET] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
