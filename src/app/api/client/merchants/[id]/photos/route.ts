import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET: List photos for a merchant, ordered by sortOrder
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const merchant = await db.merchant.findUnique({ where: { id } });
    if (!merchant) {
      return NextResponse.json(
        { error: 'Merchant not found' },
        { status: 404 }
      );
    }

    const photos = await db.merchantPhoto.findMany({
      where: { merchantId: id },
      orderBy: { sortOrder: 'asc' },
    });

    return NextResponse.json(photos);
  } catch (error) {
    console.error('[merchants/:id/photos GET] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: Add a photo to a merchant
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { url, altText, sortOrder, isCover } = body as {
      url: string;
      altText?: string;
      sortOrder?: number;
      isCover?: boolean;
    };

    if (!url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    const merchant = await db.merchant.findUnique({ where: { id } });
    if (!merchant) {
      return NextResponse.json(
        { error: 'Merchant not found' },
        { status: 404 }
      );
    }

    const photo = await db.merchantPhoto.create({
      data: {
        merchantId: id,
        url,
        altText: altText ?? null,
        sortOrder: sortOrder ?? 0,
        isCover: isCover ?? false,
      },
    });

    return NextResponse.json(photo, { status: 201 });
  } catch (error) {
    console.error('[merchants/:id/photos POST] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
