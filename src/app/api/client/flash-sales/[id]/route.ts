import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET: Flash sale detail with merchant and coupon count
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const flashSale = await db.flashSale.findUnique({
      where: { id },
      include: {
        merchant: {
          select: { id: true, name: true, logoUrl: true, category: true },
        },
        promo: {
          select: { id: true, title: true, imageUrl: true },
        },
        _count: {
          select: { coupons: true },
        },
      },
    });

    if (!flashSale) {
      return NextResponse.json(
        { error: 'Flash sale not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(flashSale);
  } catch (error) {
    console.error('[flash-sales/:id GET] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH: Update flash sale (including status transitions)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await db.flashSale.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Flash sale not found' },
        { status: 404 }
      );
    }

    const {
      title,
      description,
      imageUrl,
      originalPrice,
      flashPrice,
      geofenceRadiusMeters,
      startsAt,
      endsAt,
      maxRedemptions,
      status,
      costEuros,
    } = body as {
      title?: string;
      description?: string;
      imageUrl?: string;
      originalPrice?: number;
      flashPrice?: number;
      geofenceRadiusMeters?: number;
      startsAt?: string;
      endsAt?: string;
      maxRedemptions?: number;
      status?: string;
      costEuros?: number;
    };

    const flashSale = await db.flashSale.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(originalPrice !== undefined && { originalPrice }),
        ...(flashPrice !== undefined && { flashPrice }),
        ...(geofenceRadiusMeters !== undefined && { geofenceRadiusMeters }),
        ...(startsAt !== undefined && { startsAt: startsAt ? new Date(startsAt) : undefined }),
        ...(endsAt !== undefined && { endsAt: endsAt ? new Date(endsAt) : undefined }),
        ...(maxRedemptions !== undefined && { maxRedemptions }),
        ...(status !== undefined && { status }),
        ...(costEuros !== undefined && { costEuros }),
      },
      include: {
        merchant: {
          select: { id: true, name: true, logoUrl: true },
        },
      },
    });

    return NextResponse.json(flashSale);
  } catch (error) {
    console.error('[flash-sales/:id PATCH] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE: Cancel flash sale (set status to 'cancelled')
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.flashSale.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Flash sale not found' },
        { status: 404 }
      );
    }

    const flashSale = await db.flashSale.update({
      where: { id },
      data: { status: 'cancelled' },
    });

    return NextResponse.json(flashSale);
  } catch (error) {
    console.error('[flash-sales/:id DELETE] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
