// =============================================================
// v4.69 — PHASE 2 · « AJOUTER MON PROPRE PRESTATAIRE »
// /api/airbnb/host-providers  (GET | POST | PATCH ?id= | DELETE ?id=)
//
// CRUD des HostProvider : prestataires ajoutés MANUELLEMENT par
// l'hôte pour UN bien précis (son plombier, sa baby-sitter…), hors
// annuaire plateforme. Selon `audience` :
//   • OWNER_SERVICE     → onglet « Services Propriétaire » (dashboard) ;
//   • GUEST_EXPERIENCE  → onglet « Expériences Invité » (dashboard)
//     ET fusionnés dans les services invités du hub public.
// `isActive=false` = masqué côté invités (même sémantique que le
// toggle des prestataires annuaire, sans passer par
// Property.disabledProviders).
//
// Sécurité (copie /api/airbnb/providers PATCH) : session +
// mutationGuard(mutationKey('airbnb-mut')) + resolveUserProperties +
// canAccessProperty — toute mutation vérifie que le HostProvider
// appartient à un bien accessible (anti-IDOR, findFirst scopé).
// Validation : zod, messages d'erreur français.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { resolveUserProperties, canAccessProperty } from '@/lib/b2b-server';
import { mutationGuard, mutationKey } from '@/lib/mutation-guard';

/** Champs exposés au client (aucun secret ici — modèle dédié hôte). */
const HOST_PROVIDER_SELECT = {
  id: true,
  propertyId: true,
  name: true,
  emoji: true,
  category: true,
  description: true,
  contactName: true,
  contactEmail: true,
  contactPhone: true,
  website: true,
  audience: true,
  isUrgentAvailable: true,
  isActive: true,
  createdAt: true,
} as const;

type HostProviderRow = {
  id: string;
  propertyId: string;
  name: string;
  emoji: string;
  category: string;
  description: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
  audience: string;
  isUrgentAvailable: boolean;
  isActive: boolean;
  createdAt: Date;
};

function serialize(row: HostProviderRow) {
  return {
    id: row.id,
    propertyId: row.propertyId,
    name: row.name,
    emoji: row.emoji,
    category: row.category,
    description: row.description,
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    website: row.website,
    audience: row.audience === 'GUEST_EXPERIENCE' ? 'GUEST_EXPERIENCE' : 'OWNER_SERVICE',
    isUrgentAvailable: row.isUrgentAvailable,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Session + garde commune à tous les handlers. */
async function requireSession(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!session?.user || !userId) {
    return { error: NextResponse.json({ error: 'Non autorisé' }, { status: 401 }) } as const;
  }
  const mutGuard = await mutationGuard(mutationKey('airbnb-mut', req, userId));
  if (mutGuard) return { error: mutGuard } as const;
  return { userId } as const;
}

// =============================================================
// GET /api/airbnb/host-providers?propertyId=…
// Liste des prestataires perso du bien (createdAt desc). Le bien est
// exigé : les HostProvider sont rattachés à UN bien.
// =============================================================
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const propertyId = searchParams.get('propertyId')?.trim() ?? '';
    if (!propertyId) {
      return NextResponse.json({ error: 'Bien requis' }, { status: 400 });
    }
    if (!(await canAccessProperty(userId, propertyId))) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const items = await db.hostProvider.findMany({
      where: { propertyId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: HOST_PROVIDER_SELECT,
    });

    return NextResponse.json({ items: items.map(serialize) });
  } catch (error) {
    console.error('[airbnb/host-providers GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// =============================================================
// POST /api/airbnb/host-providers  body: { propertyId, name, emoji?,
//   category?, description?, contactName?, contactEmail?,
//   contactPhone?, website?, audience, isUrgentAvailable? }
// =============================================================
const POST_SCHEMA = z.object({
  propertyId: z.string().min(1, 'Bien requis'),
  name: z
    .string()
    .trim()
    .min(2, 'Le nom doit contenir au moins 2 caractères')
    .max(80, 'Le nom ne peut pas dépasser 80 caractères'),
  emoji: z.string().trim().max(8, 'Emoji trop long').optional().nullable(),
  category: z.string().trim().min(1, 'Catégorie requise').max(60, 'Catégorie trop longue').optional(),
  description: z.string().trim().max(500, 'Description limitée à 500 caractères').optional().nullable(),
  contactName: z.string().trim().max(80, 'Nom de contact trop long').optional().nullable(),
  contactEmail: z
    .union([z.literal(''), z.string().trim().email('Adresse email invalide')])
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  contactPhone: z.string().trim().max(30, 'Téléphone trop long').optional().nullable(),
  website: z.string().trim().max(200, 'Site web trop long').optional().nullable(),
  audience: z.enum(['OWNER_SERVICE', 'GUEST_EXPERIENCE']),
  isUrgentAvailable: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSession(req);
    if ('error' in auth) return auth.error;

    const body = await req.json().catch(() => null);
    const parsed = POST_SCHEMA.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? 'Données invalides';
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    const input = parsed.data;

    const properties = await resolveUserProperties(auth.userId);
    if (!properties.some((p) => p.id === input.propertyId)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const created = await db.hostProvider.create({
      data: {
        propertyId: input.propertyId,
        name: input.name,
        emoji: input.emoji && input.emoji.length > 0 ? input.emoji : '🔧',
        category: input.category && input.category.length > 0 ? input.category : 'Autre',
        description: input.description || null,
        contactName: input.contactName || null,
        contactEmail: input.contactEmail ?? null,
        contactPhone: input.contactPhone || null,
        website: input.website || null,
        audience: input.audience,
        isUrgentAvailable: input.isUrgentAvailable ?? false,
      },
      select: HOST_PROVIDER_SELECT,
    });

    return NextResponse.json({ ok: true, item: serialize(created) }, { status: 201 });
  } catch (error) {
    console.error('[airbnb/host-providers POST] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// =============================================================
// PATCH /api/airbnb/host-providers?id=…  body: champs partiels
// (édition complète du dialog OU simple toggle isActive).
// =============================================================
const PATCH_SCHEMA = z.object({
  name: z.string().trim().min(2, 'Le nom doit contenir au moins 2 caractères').max(80).optional(),
  emoji: z.string().trim().max(8, 'Emoji trop long').optional().nullable(),
  category: z.string().trim().min(1).max(60).optional(),
  description: z.string().trim().max(500, 'Description limitée à 500 caractères').optional().nullable(),
  contactName: z.string().trim().max(80).optional().nullable(),
  contactEmail: z
    .union([z.literal(''), z.string().trim().email('Adresse email invalide')])
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  contactPhone: z.string().trim().max(30).optional().nullable(),
  website: z.string().trim().max(200).optional().nullable(),
  audience: z.enum(['OWNER_SERVICE', 'GUEST_EXPERIENCE']).optional(),
  isUrgentAvailable: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireSession(req);
    if ('error' in auth) return auth.error;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id')?.trim() ?? '';
    if (!id) {
      return NextResponse.json({ error: 'Identifiant requis' }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const parsed = PATCH_SCHEMA.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? 'Données invalides';
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const properties = await resolveUserProperties(auth.userId);
    const propertyIds = properties.map((p) => p.id);

    // Anti-IDOR : le prestataire DOIT appartenir à un bien accessible.
    const existing = await db.hostProvider.findFirst({
      where: { id, propertyId: { in: propertyIds } },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Prestataire introuvable' }, { status: 404 });
    }

    const d = parsed.data;
    const updated = await db.hostProvider.update({
      where: { id },
      data: {
        ...(d.name !== undefined ? { name: d.name } : {}),
        ...(d.emoji !== undefined ? { emoji: d.emoji && d.emoji.length > 0 ? d.emoji : '🔧' } : {}),
        ...(d.category !== undefined ? { category: d.category } : {}),
        ...(d.description !== undefined ? { description: d.description || null } : {}),
        ...(d.contactName !== undefined ? { contactName: d.contactName || null } : {}),
        ...(d.contactEmail !== undefined ? { contactEmail: d.contactEmail ?? null } : {}),
        ...(d.contactPhone !== undefined ? { contactPhone: d.contactPhone || null } : {}),
        ...(d.website !== undefined ? { website: d.website || null } : {}),
        ...(d.audience !== undefined ? { audience: d.audience } : {}),
        ...(d.isUrgentAvailable !== undefined ? { isUrgentAvailable: d.isUrgentAvailable } : {}),
        ...(d.isActive !== undefined ? { isActive: d.isActive } : {}),
      },
      select: HOST_PROVIDER_SELECT,
    });

    return NextResponse.json({ ok: true, item: serialize(updated) });
  } catch (error) {
    console.error('[airbnb/host-providers PATCH] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// =============================================================
// DELETE /api/airbnb/host-providers?id=…
// =============================================================
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireSession(req);
    if ('error' in auth) return auth.error;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id')?.trim() ?? '';
    if (!id) {
      return NextResponse.json({ error: 'Identifiant requis' }, { status: 400 });
    }

    const properties = await resolveUserProperties(auth.userId);
    const propertyIds = properties.map((p) => p.id);

    // Anti-IDOR : le prestataire DOIT appartenir à un bien accessible.
    const existing = await db.hostProvider.findFirst({
      where: { id, propertyId: { in: propertyIds } },
      select: { id: true, name: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Prestataire introuvable' }, { status: 404 });
    }

    await db.hostProvider.delete({ where: { id } });

    return NextResponse.json({ ok: true, name: existing.name });
  } catch (error) {
    console.error('[airbnb/host-providers DELETE] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
