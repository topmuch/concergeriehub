import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { CATEGORIES } from '@/types/database';

// GET: Get single professional with services and reviews
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const professional = await db.professional.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, email: true, fullName: true },
        },
        services: {
          where: { isActive: true },
        },
        reviews: {
          include: {
            user: {
              select: { id: true, email: true, fullName: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!professional) {
      return NextResponse.json(
        { error: 'Professionnel introuvable' },
        { status: 404 }
      );
    }

    return NextResponse.json(professional);
  } catch (error) {
    console.error('[professionals GET by id] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

// PATCH: Update professional fields
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      businessName,
      category,
      subcategory,
      description,
      location,
      serviceRadiusKm,
      hourlyRate,
      isUrgentAvailable,
      isVerified,
      isActive,
      portfolioImages,
    } = body as {
      businessName?: string;
      category?: string;
      subcategory?: string | null;
      description?: string | null;
      location?: string | null;
      serviceRadiusKm?: number;
      hourlyRate?: number | null;
      isUrgentAvailable?: boolean;
      isVerified?: boolean;
      isActive?: boolean;
      portfolioImages?: string;
    };

    const existing = await db.professional.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Professionnel introuvable' },
        { status: 404 }
      );
    }

    if (category !== undefined && !CATEGORIES.includes(category as typeof CATEGORIES[number])) {
      return NextResponse.json(
        { error: 'Catégorie invalide' },
        { status: 400 }
      );
    }

    const updated = await db.professional.update({
      where: { id },
      data: {
        ...(businessName !== undefined ? { businessName } : {}),
        ...(category !== undefined ? { category } : {}),
        ...(subcategory !== undefined ? { subcategory: subcategory ?? null } : {}),
        ...(description !== undefined ? { description: description ?? null } : {}),
        ...(location !== undefined ? { location: location ?? null } : {}),
        ...(serviceRadiusKm !== undefined ? { serviceRadiusKm } : {}),
        ...(hourlyRate !== undefined ? { hourlyRate: hourlyRate ?? null } : {}),
        ...(isUrgentAvailable !== undefined ? { isUrgentAvailable } : {}),
        ...(isVerified !== undefined ? { isVerified } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
        ...(portfolioImages !== undefined ? { portfolioImages } : {}),
      },
      include: {
        user: {
          select: { id: true, email: true, fullName: true },
        },
        services: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('[professionals PATCH] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

// DELETE: Soft delete (set isActive=false)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.professional.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Professionnel introuvable' },
        { status: 404 }
      );
    }

    await db.professional.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[professionals DELETE] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
