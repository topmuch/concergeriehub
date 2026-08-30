import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET: List products for a home
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get('propertyId');
    const filter = searchParams.get('filter') || 'all';

    if (!propertyId) {
      return NextResponse.json(
        { error: 'Le paramètre propertyId est requis' },
        { status: 400 }
      );
    }

    if (!['all', 'dlc', 'stock'].includes(filter)) {
      return NextResponse.json(
        { error: 'Filtre invalide. Valeurs autorisées : all, dlc, stock' },
        { status: 400 }
      );
    }

    const products = await db.product.findMany({
      where: { propertyId },
      include: {
        productInstances: {
          orderBy: { expiryDate: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (filter === 'all') {
      return NextResponse.json({ products });
    }

    const now = new Date();
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(now.getDate() + 3);

    let filtered = products;

    if (filter === 'dlc') {
      filtered = products.filter((p) =>
        p.productInstances.some(
          (inst) =>
            inst.status === 'fresh' &&
            inst.expiryDate &&
            inst.expiryDate >= now &&
            inst.expiryDate <= threeDaysFromNow
        )
      );
    } else if (filter === 'stock') {
      filtered = products.filter(
        (p) => p.currentStock <= p.minStockThreshold
      );
    }

    return NextResponse.json({ products: filtered });
  } catch (error) {
    console.error('[products GET] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

// POST: Create a product
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      propertyId,
      name,
      category,
      minStockThreshold,
      currentStock,
    } = body as {
      propertyId: string;
      name: string;
      category?: string;
      minStockThreshold?: number;
      currentStock?: number;
    };

    if (!propertyId || !name) {
      return NextResponse.json(
        { error: 'Les champs propertyId et name sont requis' },
        { status: 400 }
      );
    }

    // Verify the home exists
    const home = await db.property.findUnique({ where: { id: propertyId } });
    if (!home) {
      return NextResponse.json(
        { error: 'Maison introuvable' },
        { status: 404 }
      );
    }

    const product = await db.product.create({
      data: {
        propertyId,
        name,
        category: category ?? null,
        minStockThreshold: minStockThreshold ?? 1,
        currentStock: currentStock ?? 0,
      },
      include: {
        productInstances: {
          orderBy: { expiryDate: 'asc' },
        },
      },
    });

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    console.error('[products POST] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
