import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { PRICE_UNITS } from '@/types/database';

// GET: List services for a professional
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const professional = await db.professional.findUnique({
      where: { id },
    });

    if (!professional) {
      return NextResponse.json(
        { error: 'Professionnel introuvable' },
        { status: 404 }
      );
    }

    const services = await db.service.findMany({
      where: { professionalId: id },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ services });
  } catch (error) {
    console.error('[professional-services GET] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

// POST: Create a service for a professional
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      name,
      description,
      basePrice,
      priceUnit,
      durationMinutes,
      isUrgent,
    } = body as {
      name: string;
      description?: string;
      basePrice: number;
      priceUnit?: string;
      durationMinutes?: number;
      isUrgent?: boolean;
    };

    if (!name || basePrice === undefined) {
      return NextResponse.json(
        { error: 'Les champs name et basePrice sont requis' },
        { status: 400 }
      );
    }

    if (priceUnit !== undefined && !PRICE_UNITS.includes(priceUnit as typeof PRICE_UNITS[number])) {
      return NextResponse.json(
        { error: "Unité de prix invalide. Valeurs autorisées : hour, flat_rate, estimate" },
        { status: 400 }
      );
    }

    const professional = await db.professional.findUnique({
      where: { id },
    });

    if (!professional) {
      return NextResponse.json(
        { error: 'Professionnel introuvable' },
        { status: 404 }
      );
    }

    const service = await db.service.create({
      data: {
        professionalId: id,
        name,
        description: description ?? null,
        basePrice,
        priceUnit: priceUnit ?? 'flat_rate',
        durationMinutes: durationMinutes ?? null,
        isUrgent: isUrgent ?? false,
      },
    });

    return NextResponse.json(service, { status: 201 });
  } catch (error) {
    console.error('[professional-services POST] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
