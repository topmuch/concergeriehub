import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET: List promos with optional filters
export async function GET(request: NextRequest) {
  try {
    const merchantId = request.nextUrl.searchParams.get('merchantId');
    const category = request.nextUrl.searchParams.get('category');
    const source = request.nextUrl.searchParams.get('source');
    const isActiveParam = request.nextUrl.searchParams.get('isActive');

    const where: Record<string, unknown> = {};

    if (merchantId) where.merchantId = merchantId;
    if (category) where.category = category;
    if (source) where.source = source;
    if (isActiveParam === 'true') {
      where.validUntil = { gte: new Date() };
    }

    const promos = await db.promo.findMany({
      where,
      include: {
        merchant: {
          select: { id: true, name: true, logoUrl: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(promos);
  } catch (error) {
    console.error('[promos GET] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: Create promo
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      merchantId,
      title,
      description,
      imageUrl,
      originalPrice,
      promoPrice,
      validFrom,
      validUntil,
      keywords,
      category,
      source,
    } = body as {
      merchantId?: string;
      title: string;
      description?: string;
      imageUrl?: string;
      originalPrice?: number;
      promoPrice?: number;
      validFrom?: string;
      validUntil?: string;
      keywords?: string;
      category?: string;
      source?: string;
    };

    if (!title) {
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400 }
      );
    }

    const promo = await db.promo.create({
      data: {
        merchantId: merchantId ?? null,
        title,
        description: description ?? null,
        imageUrl: imageUrl ?? null,
        originalPrice: originalPrice ?? null,
        promoPrice: promoPrice ?? null,
        validFrom: validFrom ? new Date(validFrom) : null,
        validUntil: validUntil ? new Date(validUntil) : null,
        keywords: keywords ?? '[]',
        category: category ?? null,
        source: source ?? 'local',
      },
      include: {
        merchant: {
          select: { id: true, name: true, logoUrl: true },
        },
      },
    });

    return NextResponse.json(promo, { status: 201 });
  } catch (error) {
    console.error('[promos POST] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
