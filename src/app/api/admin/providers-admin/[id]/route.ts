// =============================================================
// /api/admin/providers-admin/[id] — ÉTAPE 9
//
// PATCH  : modification d'un prestataire (géoloc, audience,
//          statut actif/inactif, champs métier).
// DELETE : suppression — supprime le Provider ET le User porteur
//          en transaction (les demandes de service liées partent
//          en cascade).
//
// 🔒 Réservé au Superadmin (role 'superadmin').
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { db } from '@/lib/db';
import { PROVIDER_AUDIENCES } from '@/lib/b2b';
import { logAudit, clientIp } from '@/lib/audit';

interface UpdateBody {
  businessName?: string;
  category?: string;
  subcategory?: string | null;
  description?: string | null;
  location?: string | null;
  latitude?: number | string;
  longitude?: number | string;
  serviceRadiusKm?: number | string;
  audience?: string;
  hourlyRate?: number | string | null;
  isUrgentAvailable?: boolean;
  isVerified?: boolean;
  isActive?: boolean;
  portfolioImages?: string[];
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    const { id } = await params;
    const existing = await db.provider.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return NextResponse.json({ error: 'Prestataire introuvable' }, { status: 404 });
    }

    const body = (await req.json()) as UpdateBody;
    const data: Record<string, unknown> = {};

    if (body.businessName !== undefined) {
      const name = body.businessName.trim();
      if (name.length < 2) {
        return NextResponse.json({ error: 'Nom trop court' }, { status: 400 });
      }
      data.businessName = name;
    }
    if (body.category !== undefined) data.category = body.category;
    if (body.subcategory !== undefined) data.subcategory = body.subcategory?.trim() || null;
    if (body.description !== undefined) data.description = body.description?.trim() || null;
    if (body.location !== undefined) data.location = body.location?.trim() || null;

    if (body.latitude !== undefined) {
      const lat = Number(body.latitude);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
        return NextResponse.json({ error: 'Latitude invalide' }, { status: 400 });
      }
      data.latitude = lat;
    }
    if (body.longitude !== undefined) {
      const lng = Number(body.longitude);
      if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
        return NextResponse.json({ error: 'Longitude invalide' }, { status: 400 });
      }
      data.longitude = lng;
    }
    if (body.serviceRadiusKm !== undefined) {
      data.serviceRadiusKm = Math.min(Math.max(Math.round(Number(body.serviceRadiusKm) || 10), 1), 200);
    }
    if (body.audience !== undefined) {
      if (!PROVIDER_AUDIENCES.includes(body.audience as never)) {
        return NextResponse.json({ error: 'Audience invalide' }, { status: 400 });
      }
      data.audience = body.audience;
    }
    if (body.hourlyRate !== undefined) {
      data.hourlyRate =
        body.hourlyRate === null || body.hourlyRate === ''
          ? null
          : Math.max(0, Number(body.hourlyRate) || 0);
    }
    if (body.isUrgentAvailable !== undefined) data.isUrgentAvailable = body.isUrgentAvailable;
    if (body.isVerified !== undefined) data.isVerified = body.isVerified;
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.portfolioImages !== undefined) {
      data.portfolioImages = JSON.stringify(
        Array.isArray(body.portfolioImages) ? body.portfolioImages.slice(0, 6) : [],
      );
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Aucune modification fournie' }, { status: 400 });
    }

    await db.provider.update({ where: { id }, data });
    await logAudit({
      actor: admin,
      action: 'provider.update',
      entityType: 'provider',
      entityId: id,
      details: data,
      ip: clientIp(req.headers),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[PATCH /api/admin/providers-admin/[id]] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    const { id } = await params;
    const provider = await db.provider.findUnique({
      where: { id },
      select: { id: true, userId: true, businessName: true },
    });
    if (!provider) {
      return NextResponse.json({ error: 'Prestataire introuvable' }, { status: 404 });
    }

    await db.$transaction(async (tx) => {
      await tx.provider.delete({ where: { id: provider.id } });
      await tx.user.delete({ where: { id: provider.userId } });
    });

    await logAudit({
      actor: admin,
      action: 'provider.delete',
      entityType: 'provider',
      entityId: provider.id,
      details: { businessName: provider.businessName },
      ip: clientIp(_req.headers),
    });

    return NextResponse.json({ ok: true, deleted: provider.businessName });
  } catch (error) {
    console.error('[DELETE /api/admin/providers-admin/[id]] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
