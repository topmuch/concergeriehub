import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET: List flash sales with optional filters
export async function GET(request: NextRequest) {
  try {
    const merchantId = request.nextUrl.searchParams.get('merchantId');
    const status = request.nextUrl.searchParams.get('status') ?? 'active';

    const where: Record<string, unknown> = { status };

    if (merchantId) where.merchantId = merchantId;

    const flashSales = await db.flashSale.findMany({
      where,
      include: {
        merchant: {
          select: { id: true, name: true, logoUrl: true, category: true },
        },
      },
      orderBy: { startsAt: 'desc' },
    });

    return NextResponse.json(flashSales);
  } catch (error) {
    console.error('[flash-sales GET] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: Create flash sale
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      merchantId,
      promoId,
      title,
      description,
      imageUrl,
      originalPrice,
      flashPrice,
      geofenceRadiusMeters,
      startsAt,
      endsAt,
      maxRedemptions,
      costEuros,
    } = body as {
      merchantId: string;
      promoId: string;
      title?: string;
      description?: string;
      imageUrl?: string;
      originalPrice?: number;
      flashPrice: number;
      geofenceRadiusMeters?: number;
      startsAt: string;
      endsAt: string;
      maxRedemptions?: number;
      costEuros?: number;
    };

    if (!merchantId || !promoId || !flashPrice || !startsAt || !endsAt) {
      return NextResponse.json(
        { error: 'merchantId, promoId, flashPrice, startsAt, and endsAt are required' },
        { status: 400 }
      );
    }

    const flashSale = await db.flashSale.create({
      data: {
        promoId,
        merchantId,
        title: title ?? null,
        description: description ?? null,
        imageUrl: imageUrl ?? null,
        originalPrice: originalPrice ?? null,
        flashPrice,
        geofenceRadiusMeters: geofenceRadiusMeters ?? 500,
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt),
        maxRedemptions: maxRedemptions ?? null,
        status: 'scheduled',
        costEuros: costEuros ?? 0.5,
      },
      include: {
        merchant: {
          select: { id: true, name: true, logoUrl: true },
        },
      },
    });

    return NextResponse.json(flashSale, { status: 201 });
  } catch (error) {
    console.error('[flash-sales POST] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
