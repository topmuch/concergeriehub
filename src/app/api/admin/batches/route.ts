import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import crypto from 'crypto';

// GET /api/admin/batches — List all batches with aggregated QR code counts
export async function GET() {
  try {
    const batches = await db.qrBatch.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            physicalQrCodes: true,
          },
        },
        physicalQrCodes: {
          select: { id: true, status: true },
        },
      },
    });

    // Derive per-status counts from the included physical QR codes
    const result = batches.map((batch) => {
      const activeCount = batch.physicalQrCodes.filter(
        (qr) => qr.status === 'active',
      ).length;
      const inactiveCount = batch.physicalQrCodes.filter(
        (qr) => qr.status === 'inactive',
      ).length;
      const lostCount = batch.physicalQrCodes.filter(
        (qr) => qr.status === 'lost',
      ).length;
      const cancelledCount = batch.physicalQrCodes.filter(
        (qr) => qr.status === 'cancelled',
      ).length;

      return {
        id: batch.id,
        quantity: batch.quantity,
        designConfig: batch.designConfig,
        createdBy: batch.createdBy,
        createdAt: batch.createdAt,
        _count: {
          physicalQrCodes: batch._count.physicalQrCodes,
          active: activeCount,
          inactive: inactiveCount,
          lost: lostCount,
          cancelled: cancelledCount,
        },
      };
    });

    return NextResponse.json({ batches: result });
  } catch (error) {
    console.error('[GET /api/admin/batches] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch batches' },
      { status: 500 },
    );
  }
}

// POST /api/admin/batches — Create a new batch with physical QR codes
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { quantity, designConfig, batchName, activationCodes } = body;

    if (
      !quantity ||
      typeof quantity !== 'number' ||
      quantity < 1 ||
      quantity > 10000
    ) {
      return NextResponse.json(
        { error: 'quantity must be a number between 1 and 10 000' },
        { status: 400 },
      );
    }

    if (!designConfig || typeof designConfig !== 'string') {
      return NextResponse.json(
        { error: 'designConfig must be a non-empty string' },
        { status: 400 },
      );
    }

    if (activationCodes && Array.isArray(activationCodes)) {
      if (activationCodes.length !== quantity) {
        return NextResponse.json(
          {
            error: `Expected ${quantity} activation codes but received ${activationCodes.length}`,
          },
          { status: 400 },
        );
      }

      // Ensure uniqueness
      const uniqueCodes = new Set(activationCodes);
      if (uniqueCodes.size !== activationCodes.length) {
        return NextResponse.json(
          { error: 'activationCodes must all be unique' },
          { status: 400 },
        );
      }
    }

    // Build the batch and its QR codes inside a transaction
    const batch = await db.$transaction(async (tx) => {
      // Ensure a superadmin user exists for the createdBy FK
      let admin = await tx.user.findFirst({ where: { role: 'superadmin' } });
      if (!admin) {
        admin = await tx.user.create({
          data: {
            email: 'superadmin@qrdomotik.roomscan.pro',
            fullName: 'Superadmin',
            role: 'superadmin',
          },
        });
      }

      const createdBatch = await tx.qrBatch.create({
        data: {
          quantity,
          designConfig,
          createdBy: admin.id,
        },
      });

      const codes = Array.from({ length: quantity }, (_, i) => {
        const setupToken = `SETUP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        return {
          batchId: createdBatch.id,
          activationCode:
            activationCodes?.[i] ??
            `QR-${createdBatch.id.slice(0, 8).toUpperCase()}-${String(i + 1).padStart(4, '0')}`,
          setupToken,
          status: 'inactive' as const,
          designConfig,
        };
      });

      const createdCodes = await tx.physicalQrCode.createMany({
        data: codes,
      });

      return { batch: createdBatch, createdCount: createdCodes.count };
    });

    // Fetch the freshly-created codes for the response
    const physicalQrCodes = await db.physicalQrCode.findMany({
      where: { batchId: batch.batch.id },
      orderBy: { id: 'asc' },
    });

    return NextResponse.json(
      {
        ...batch.batch,
        createdCount: batch.createdCount,
        physicalQrCodes,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('[POST /api/admin/batches] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create batch' },
      { status: 500 },
    );
  }
}
