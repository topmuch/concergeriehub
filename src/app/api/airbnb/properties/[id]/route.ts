// =============================================================
// /api/airbnb/properties/[id] — ÉTAPE 12 V2 : détail d'un bien
//
// GET    : détail + rôle de l'appelant + synthèse équipe.
// PATCH  : mise à jour (nom, adresse, type, géoloc, hub) —
//          OWNER/MANAGER. PIN Mode Hôte : OWNER uniquement.
// DELETE : suppression du bien — OWNER uniquement (cascade).
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { hash } from 'bcryptjs';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getUserRoleForProperty } from '@/lib/b2b-server';
import { canManageTeam } from '@/lib/team';
import { PROPERTY_TYPE_META } from '@/lib/b2b';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const { id } = await ctx.params;
    const myRole = await getUserRoleForProperty(userId, id);
    if (!myRole) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const property = await db.property.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        propertyType: true,
        address: true,
        latitude: true,
        longitude: true,
        isActive: true,
        qrHubSlug: true,
        createdAt: true,
      },
    });
    if (!property) {
      return NextResponse.json({ error: 'Bien introuvable' }, { status: 404 });
    }

    const [pinCount, membersCount] = await Promise.all([
      db.property.findUnique({ where: { id }, select: { pinHash: true } }),
      db.propertyMember.count({ where: { propertyId: id, acceptedAt: { not: null } } }),
    ]);

    return NextResponse.json({
      property: { ...property, hasPin: Boolean(pinCount?.pinHash) },
      myRole,
      canManage: canManageTeam(myRole),
      membersCount,
    });
  } catch (error) {
    console.error('[airbnb/properties/[id] GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const { id } = await ctx.params;
    const myRole = await getUserRoleForProperty(userId, id);
    if (!myRole || !canManageTeam(myRole)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const body = (await req.json()) as {
      name?: string;
      address?: string;
      propertyType?: string;
      latitude?: number | string | null;
      longitude?: number | string | null;
      isActive?: boolean;
      qrHubSlug?: string;
      hubPin?: string | null;
    };

    const data: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const name = body.name.trim();
      if (name.length < 2 || name.length > 80) {
        return NextResponse.json(
          { error: 'Le nom du bien doit contenir entre 2 et 80 caractères.' },
          { status: 400 },
        );
      }
      data.name = name;
    }
    if (body.address !== undefined) {
      const address = body.address.trim();
      if (!address) {
        return NextResponse.json({ error: "L'adresse ne peut pas être vide." }, { status: 400 });
      }
      data.address = address;
    }
    if (body.propertyType !== undefined) {
      if (!PROPERTY_TYPE_META[body.propertyType]) {
        return NextResponse.json({ error: 'Type de bien invalide.' }, { status: 400 });
      }
      data.propertyType = body.propertyType;
    }
    if (body.latitude !== undefined) {
      const lat = parseCoord(body.latitude, -90, 90);
      if (body.latitude !== null && lat === null) {
        return NextResponse.json({ error: 'Latitude invalide.' }, { status: 400 });
      }
      data.latitude = lat;
    }
    if (body.longitude !== undefined) {
      const lng = parseCoord(body.longitude, -180, 180);
      if (body.longitude !== null && lng === null) {
        return NextResponse.json({ error: 'Longitude invalide.' }, { status: 400 });
      }
      data.longitude = lng;
    }
    if (body.isActive !== undefined) {
      if (myRole !== 'OWNER') {
        return NextResponse.json(
          { error: "Seul le propriétaire peut (dés)activer le bien." },
          { status: 403 },
        );
      }
      data.isActive = Boolean(body.isActive);
    }
    if (body.qrHubSlug !== undefined) {
      const slug = body.qrHubSlug
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '');
      if (slug.length < 3 || slug.length > 60) {
        return NextResponse.json(
          { error: 'Le slug du hub doit contenir entre 3 et 60 caractères (a-z, 0-9, -).' },
          { status: 400 },
        );
      }
      const taken = await db.property.findFirst({
        where: { qrHubSlug: slug, NOT: { id } },
        select: { id: true },
      });
      if (taken) {
        return NextResponse.json({ error: 'Ce slug de hub est déjà utilisé.' }, { status: 409 });
      }
      data.qrHubSlug = slug;
    }
    if (body.hubPin !== undefined) {
      if (myRole !== 'OWNER') {
        return NextResponse.json(
          { error: 'Seul le propriétaire peut modifier le PIN du Mode Hôte.' },
          { status: 403 },
        );
      }
      if (body.hubPin === null || body.hubPin === '') {
        data.pinHash = null; // retrait du PIN
      } else {
        const pin = String(body.hubPin);
        if (!/^\d{4}$/.test(pin)) {
          return NextResponse.json(
            { error: 'Le PIN doit contenir exactement 4 chiffres.' },
            { status: 400 },
          );
        }
        data.pinHash = await hash(pin, 10);
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Aucune modification fournie.' }, { status: 400 });
    }

    const updated = await db.property.update({
      where: { id },
      data,
      select: { id: true, name: true, qrHubSlug: true, isActive: true, updatedAt: true },
    });

    return NextResponse.json({ property: updated });
  } catch (error) {
    console.error('[airbnb/properties/[id] PATCH] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const { id } = await ctx.params;
    // Seul le PROPRIÉTAIRE peut supprimer (rôle OWNER d'équipe insuffisant)
    const owned = await db.property.findFirst({
      where: { id, ownerId: userId },
      select: { id: true, name: true },
    });
    if (!owned) {
      return NextResponse.json(
        { error: 'Seul le propriétaire du bien peut le supprimer.' },
        { status: 403 },
      );
    }

    await db.property.delete({ where: { id } });
    return NextResponse.json({ deleted: true, id: owned.id, name: owned.name });
  } catch (error) {
    console.error('[airbnb/properties/[id] DELETE] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

function parseCoord(
  value: number | string | null | undefined,
  min: number,
  max: number,
): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(num) || num < min || num > max) return null;
  return num;
}
