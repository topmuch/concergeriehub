import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET: List merchants with optional filters
export async function GET(request: NextRequest) {
  try {
    const category = request.nextUrl.searchParams.get('category');
    const isVerifiedParam = request.nextUrl.searchParams.get('isVerified');
    const isActiveParam = request.nextUrl.searchParams.get('isActive');
    const search = request.nextUrl.searchParams.get('search');
    const homeId = request.nextUrl.searchParams.get('homeId');

    const where: Record<string, unknown> = {};

    if (category) where.category = category;
    if (isVerifiedParam === 'true') where.isVerified = true;
    if (isActiveParam === 'true') where.isActive = true;
    else if (isActiveParam === 'false') where.isActive = false;
    if (homeId) where.homeId = homeId;

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { description: { contains: search } },
      ];
    }

    const merchants = await db.merchant.findMany({
      where,
      include: {
        merchantPhotos: {
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(merchants);
  } catch (error) {
    console.error('[merchants GET] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: Create merchant
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      category,
      description,
      address,
      location,
      phone,
      website,
      openingHours,
      homeId,
    } = body as {
      name: string;
      category?: string;
      description?: string;
      address?: string;
      location?: string;
      phone?: string;
      website?: string;
      openingHours?: string;
      homeId?: string;
    };

    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    const merchant = await db.merchant.create({
      data: {
        userId: 'dev-user-1',
        name,
        category: category ?? null,
        description: description ?? null,
        address: address ?? null,
        location: location ?? null,
        phone: phone ?? null,
        website: website ?? null,
        openingHours: openingHours ?? '{}',
        homeId: homeId ?? null,
      },
      include: {
        merchantPhotos: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    return NextResponse.json(merchant, { status: 201 });
  } catch (error) {
    console.error('[merchants POST] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
