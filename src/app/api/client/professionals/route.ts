import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { CATEGORIES } from '@/types/database';

// GET: List professionals with optional filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const location = searchParams.get('location');
    const homeId = searchParams.get('homeId');
    const isVerifiedParam = searchParams.get('isVerified');
    const urgentParam = searchParams.get('urgent');

    if (category && !CATEGORIES.includes(category as typeof CATEGORIES[number])) {
      return NextResponse.json(
        { error: 'Catégorie invalide' },
        { status: 400 }
      );
    }

    const where: Record<string, unknown> = { isActive: true };

    if (category) where.category = category;
    if (location) where.location = { contains: location };
    if (isVerifiedParam === 'true') where.isVerified = true;
    if (urgentParam === 'true') where.isUrgentAvailable = true;

    const professionals = await db.professional.findMany({
      where,
      include: {
        user: {
          select: { id: true, email: true, fullName: true },
        },
        services: {
          where: { isActive: true },
        },
        _count: {
          select: { reviews: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // Attach review summary
    const result = professionals.map((p) => ({
      ...p,
      ratingAvg: p.ratingAvg,
      totalReviews: p._count.reviews,
    }));

    return NextResponse.json({ professionals: result });
  } catch (error) {
    console.error('[professionals GET] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

// POST: Create a professional profile
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      userId,
      businessName,
      category,
      subcategory,
      description,
      location,
      serviceRadiusKm,
      hourlyRate,
      isUrgentAvailable,
    } = body as {
      userId: string;
      businessName: string;
      category: string;
      subcategory?: string;
      description?: string;
      location?: string;
      serviceRadiusKm?: number;
      hourlyRate?: number;
      isUrgentAvailable?: boolean;
    };

    if (!userId || !businessName || !category) {
      return NextResponse.json(
        { error: 'Les champs userId, businessName et category sont requis' },
        { status: 400 }
      );
    }

    if (!CATEGORIES.includes(category as typeof CATEGORIES[number])) {
      return NextResponse.json(
        { error: 'Catégorie invalide' },
        { status: 400 }
      );
    }

    // Verify the user exists
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json(
        { error: 'Utilisateur introuvable' },
        { status: 404 }
      );
    }

    const professional = await db.professional.create({
      data: {
        userId,
        businessName,
        category,
        subcategory: subcategory ?? null,
        description: description ?? null,
        location: location ?? null,
        serviceRadiusKm: serviceRadiusKm ?? 10,
        hourlyRate: hourlyRate ?? null,
        isUrgentAvailable: isUrgentAvailable ?? false,
        isVerified: false,
        isActive: true,
      },
      include: {
        user: {
          select: { id: true, email: true, fullName: true },
        },
        services: true,
      },
    });

    return NextResponse.json(professional, { status: 201 });
  } catch (error) {
    console.error('[professionals POST] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
