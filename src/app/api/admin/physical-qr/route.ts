import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ------------------------------------------------------------------
// Valid status transitions
// ------------------------------------------------------------------
const VALID_TRANSITIONS: Record<string, string[]> = {
  active: ['lost', 'cancelled'],
  lost: ['inactive'],
  cancelled: [],
  inactive: [],
};

const ALLOWED_STATUSES = new Set(['lost', 'cancelled', 'inactive']);

// GET /api/admin/physical-qr — List physical QR codes with filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status');
    const batchId = searchParams.get('batchId');
    const search = searchParams.get('search');
    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 20));
    const skip = (page - 1) * limit;

    // Build the where clause
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (batchId) where.batchId = batchId;
    if (search) {
      where.OR = [
        { activationCode: { contains: search } },
        { batch: { id: { contains: search } } },
      ];
    }

    const [records, total] = await Promise.all([
      db.physicalQrCode.findMany({
        where,
        include: {
          batch: {
            select: {
              id: true,
              quantity: true,
              designConfig: true,
              createdAt: true,
            },
          },
          activatedBy: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
          dynamicQrCode: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.physicalQrCode.count({ where }),
    ]);

    return NextResponse.json({
      data: records,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('[GET /api/admin/physical-qr] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch physical QR codes' },
      { status: 500 },
    );
  }
}

// PATCH /api/admin/physical-qr — Update a physical QR code status
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status: newStatus } = body;

    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: 'id is required and must be a string' },
        { status: 400 },
      );
    }

    if (!newStatus || !ALLOWED_STATUSES.has(newStatus)) {
      return NextResponse.json(
        {
          error: `status must be one of: ${Array.from(ALLOWED_STATUSES).join(', ')}`,
        },
        { status: 400 },
      );
    }

    // Fetch current record
    const existing = await db.physicalQrCode.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Physical QR code not found' },
        { status: 404 },
      );
    }

    // Validate transition
    const allowedNext = VALID_TRANSITIONS[existing.status] ?? [];
    if (!allowedNext.includes(newStatus)) {
      return NextResponse.json(
        {
          error: `Invalid status transition: ${existing.status} → ${newStatus}. Allowed: ${allowedNext.length ? allowedNext.join(', ') : 'none'}`,
        },
        { status: 400 },
      );
    }

    // If transitioning away from active, clear activation fields
    const updateData: Record<string, unknown> = { status: newStatus };
    if (existing.status === 'active') {
      updateData.activatedByUserId = null;
      updateData.activatedAt = null;
      updateData.dynamicQrCodeId = null;
    }

    const updated = await db.physicalQrCode.update({
      where: { id },
      data: updateData,
      include: {
        batch: {
          select: {
            id: true,
            quantity: true,
            createdAt: true,
          },
        },
        activatedBy: {
          select: {
            id: true,
            email: true,
            fullName: true,
          },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('[PATCH /api/admin/physical-qr] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update physical QR code' },
      { status: 500 },
    );
  }
}
