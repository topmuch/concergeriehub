import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET: Promo detail with merchant and redemption count
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const promo = await db.promo.findUnique({
      where: { id },
      include: {
        merchant: {
          select: { id: true, name: true, logoUrl: true, category: true },
        },
        _count: {
          select: { redemptions: true },
        },
      },
    });

    if (!promo) {
      return NextResponse.json(
        { error: 'Promo not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(promo);
  } catch (error) {
    console.error('[promos/:id GET] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH: Update promo
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await db.promo.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Promo not found' },
        { status: 404 }
      );
    }

    const {
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
      title?: string;
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

    const promo = await db.promo.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(originalPrice !== undefined && { originalPrice }),
        ...(promoPrice !== undefined && { promoPrice }),
        ...(validFrom !== undefined && { validFrom: validFrom ? new Date(validFrom) : null }),
        ...(validUntil !== undefined && { validUntil: validUntil ? new Date(validUntil) : null }),
        ...(keywords !== undefined && { keywords }),
        ...(category !== undefined && { category }),
        ...(source !== undefined && { source }),
      },
      include: {
        merchant: {
          select: { id: true, name: true, logoUrl: true },
        },
      },
    });

    return NextResponse.json(promo);
  } catch (error) {
    console.error('[promos/:id PATCH] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE: Hard delete promo
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.promo.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Promo not found' },
        { status: 404 }
      );
    }

    await db.promo.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[promos/:id DELETE] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
