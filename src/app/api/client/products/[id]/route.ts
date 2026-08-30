import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// PATCH: Update product fields
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      name,
      category,
      minStockThreshold,
      currentStock,
      isOnShoppingList,
    } = body as {
      name?: string;
      category?: string | null;
      minStockThreshold?: number;
      currentStock?: number;
      isOnShoppingList?: boolean;
    };

    const existing = await db.product.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Produit introuvable' },
        { status: 404 }
      );
    }

    const updated = await db.product.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(category !== undefined ? { category: category ?? null } : {}),
        ...(minStockThreshold !== undefined ? { minStockThreshold } : {}),
        ...(currentStock !== undefined ? { currentStock } : {}),
        ...(isOnShoppingList !== undefined ? { isOnShoppingList } : {}),
      },
      include: {
        productInstances: {
          orderBy: { expiryDate: 'asc' },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('[products PATCH] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

// DELETE: Delete product and its instances (cascade)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.product.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Produit introuvable' },
        { status: 404 }
      );
    }

    await db.product.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[products DELETE] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
