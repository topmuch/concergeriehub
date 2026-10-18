import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import crypto from 'crypto';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { logAudit, clientIp } from '@/lib/audit';
import { mutationGuard, mutationKey, MUTATIONS_LIMIT_ADMIN } from '@/lib/mutation-guard';
// v4.81 (AUDIT QA-3) — CSPRNG isomorphe pour les codes d'activation.
import { generateActivationCode } from '@/lib/activation-code';

// GET /api/admin/batches — List all batches with aggregated QR code counts
export async function GET() {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();
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
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  // FIX-15 — anti-abus : 60 mutations/min par admin (Console Superadmin).
  const mutGuard = await mutationGuard(mutationKey('admin-mut', request, admin.id), MUTATIONS_LIMIT_ADMIN);
  if (mutGuard) return mutGuard;
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

    // Build the batch and its QR codes inside a transaction.
    // v4.81 (AUDIT QA-3) — retry anti-collision : une collision @unique
    // (activationCode ou setupToken) échouait TOUT le lot en 500. On
    // rejoue la transaction jusqu'à 3× (les tokens sont régénérés à chaque
    // passe quand ils ne sont pas fournis par l'appelant).
    let batch: { batch: { id: string; quantity: number }; createdCount: number } | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        batch = await db.$transaction(async (tx) => {
        // AUDIT PRÉ-PROD : plus de création fallback d'un superadmin sans
        // mot de passe — requireSuperadmin() garantit l'existence du compte
        // appelant (l'utilisateur courant est le creator).
        const admin = await tx.user.findFirst({ where: { role: 'superadmin' } });
        if (!admin) {
          throw new Error('Aucun superadmin existant — création du lot impossible.');
        }

        const createdBatch = await tx.qrBatch.create({
          data: {
            quantity,
            designConfig,
            createdBy: admin.id,
          },
        });

        const codes = Array.from({ length: quantity }, (_, i) => {
          // AUDIT 24-d (P1) — 12 octets aléatoires (96 bits) au lieu de 4
          // (32 bits) : avec setupToken @unique, une collision (paradoxe des
          // anniversaires ≈ 1,2 % pour un lot de 10 000 à 32 bits) faisait
          // échouer TOUT le lot en 500 + rollback. À 96 bits, la probabilité
          // devient négligeable (~10⁻²⁰ par lot de 10 000).
          const setupToken = `SETUP-${crypto.randomBytes(12).toString('hex').toUpperCase()}`;
          return {
            batchId: createdBatch.id,
            // v4.81 (AUDIT QA-3) — si l'appelant ne fournit pas de codes :
            // CSPRNG au lieu de QR-{batchId}-{i} séquentiel (prévisible).
            activationCode:
              activationCodes?.[i] ??
              generateActivationCode(),
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
        break;
      } catch (error) {
        if (attempt === 2) throw error;
        console.warn(`[batches POST] collision unique (tentative ${attempt + 1}/3), retry…`, error);
      }
    }
    if (!batch) {
      return NextResponse.json({ error: 'Création du lot impossible après 3 tentatives.' }, { status: 500 });
    }

    // Fetch the freshly-created codes for the response
    const physicalQrCodes = await db.physicalQrCode.findMany({
      where: { batchId: batch.batch.id },
      orderBy: { id: 'asc' },
    });

    await logAudit({
      actor: admin,
      action: 'batch.create',
      entityType: 'qr_batch',
      entityId: batch.batch.id,
      details: { quantity, createdCount: batch.createdCount },
      ip: clientIp(request.headers),
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
