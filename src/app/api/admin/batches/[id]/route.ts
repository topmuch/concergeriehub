import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { logAudit, clientIp } from '@/lib/audit';

// GET /api/admin/batches/[id] — Fetch single batch with all QR codes
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();
  try {
    const { id } = await params;
    const batch = await db.qrBatch.findUnique({
      where: { id },
      include: {
        physicalQrCodes: {
          orderBy: { id: 'asc' },
        },
      },
    });

    if (!batch) {
      return NextResponse.json({ error: 'Lot introuvable' }, { status: 404 });
    }

    return NextResponse.json(batch);
  } catch (error) {
    console.error('[GET /api/admin/batches/[id]] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch batch' },
      { status: 500 },
    );
  }
}

// DELETE /api/admin/batches/[id] — Delete a batch and all its QR codes
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();
  try {
    const { id } = await params;

    const batch = await db.qrBatch.findUnique({
      where: { id },
      select: { id: true, quantity: true },
    });

    if (!batch) {
      return NextResponse.json({ error: 'Lot introuvable' }, { status: 404 });
    }

    // Delete all physical QR codes in this batch, then the batch itself
    await db.$transaction(async (tx) => {
      await tx.physicalQrCode.deleteMany({ where: { batchId: id } });
      await tx.qrBatch.delete({ where: { id } });
    });

    await logAudit({
      actor: admin,
      action: 'batch.delete',
      entityType: 'qr_batch',
      entityId: id,
      details: { quantity: batch.quantity },
      ip: clientIp(_request.headers),
    });

    return NextResponse.json({
      success: true,
      deletedBatchId: id,
      deletedCount: batch.quantity,
    });
  } catch (error) {
    console.error('[DELETE /api/admin/batches/[id]] Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete batch' },
      { status: 500 },
    );
  }
}
