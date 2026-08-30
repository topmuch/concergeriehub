import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET: Merchant detail by id
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const merchant = await db.merchant.findUnique({
      where: { id },
      include: {
        merchantPhotos: {
          orderBy: { sortOrder: 'asc' },
        },
        promos: {
          where: {
            validUntil: { gte: new Date() },
          },
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: { coupons: true },
        },
        flashSales: {
          where: { status: 'active' },
          orderBy: { startsAt: 'desc' },
        },
      },
    });

    if (!merchant) {
      return NextResponse.json(
        { error: 'Merchant not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(merchant);
  } catch (error) {
    console.error('[merchants/:id GET] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH: Update merchant
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await db.merchant.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Merchant not found' },
        { status: 404 }
      );
    }

    const { name, category, description, address, location, phone, website, openingHours, homeId, isVerified, logoUrl } = body as {
      name?: string;
      category?: string;
      description?: string;
      address?: string;
      location?: string;
      phone?: string;
      website?: string;
      openingHours?: string;
      homeId?: string;
      isVerified?: boolean;
      logoUrl?: string;
    };

    const merchant = await db.merchant.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(category !== undefined && { category }),
        ...(description !== undefined && { description }),
        ...(address !== undefined && { address }),
        ...(location !== undefined && { location }),
        ...(phone !== undefined && { phone }),
        ...(website !== undefined && { website }),
        ...(openingHours !== undefined && { openingHours }),
        ...(homeId !== undefined && { homeId }),
        ...(isVerified !== undefined && { isVerified }),
        ...(logoUrl !== undefined && { logoUrl }),
      },
      include: {
        merchantPhotos: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    return NextResponse.json(merchant);
  } catch (error) {
    console.error('[merchants/:id PATCH] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE: Soft delete merchant (isActive = false)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.merchant.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Merchant not found' },
        { status: 404 }
      );
    }

    const merchant = await db.merchant.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json(merchant);
  } catch (error) {
    console.error('[merchants/:id DELETE] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
