import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const VALID_STATUSES = ['fresh', 'consumed', 'expired', 'discarded'];

// POST: Create a ProductInstance
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      productId,
      homeId,
      purchaseDate,
      expiryDate,
    } = body as {
      productId: string;
      homeId: string;
      purchaseDate?: string;
      expiryDate?: string;
    };

    if (!productId || !homeId) {
      return NextResponse.json(
        { error: 'Les champs productId et homeId sont requis' },
        { status: 400 }
      );
    }

    // Verify the product exists
    const product = await db.product.findUnique({ where: { id: productId } });
    if (!product) {
      return NextResponse.json(
        { error: 'Produit introuvable' },
        { status: 404 }
      );
    }

    const instance = await db.productInstance.create({
      data: {
        productId,
        homeId,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
      },
    });

    return NextResponse.json(instance, { status: 201 });
  } catch (error) {
    console.error('[product-instances POST] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

// PATCH: Update instance status (instanceId from query param for SQLite compatibility)
export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const instanceId = searchParams.get('instanceId');

    if (!instanceId) {
      return NextResponse.json(
        { error: 'Le paramètre instanceId est requis' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { status } = body as { status?: string };

    if (!status) {
      return NextResponse.json(
        { error: 'Le champ status est requis' },
        { status: 400 }
      );
    }

    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: 'Statut invalide. Valeurs autorisées : fresh, consumed, expired, discarded' },
        { status: 400 }
      );
    }

    const existing = await db.productInstance.findUnique({ where: { id: instanceId } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Instance de produit introuvable' },
        { status: 404 }
      );
    }

    const updated = await db.productInstance.update({
      where: { id: instanceId },
      data: { status },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('[product-instances PATCH] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
