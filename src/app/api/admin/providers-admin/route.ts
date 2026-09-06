// =============================================================
// /api/admin/providers-admin — ÉTAPE 9 : Gestion des prestataires
//
// RÈGLE D'OR (spéc) : SEUL le Superadmin peut ajouter et
// géolocaliser les prestataires. Les hôtes ne font que consulter.
//
// GET  : liste complète (toutes géolocalisations + audiences).
//        FIX-11 : expose aussi verificationDocuments (parse
//        défensif, LECTURE SEULE) + isVerified — la liste admin en
//        dérive le statut quadri-état (En attente / En revue /
//        Rejeté / Vérifié) sans migration (schéma gelé).
// POST : création d'un prestataire — crée le User porteur +
//        le Provider en transaction. Email auto-généré si absent.
//
// 🔒 Réservé au Superadmin (role 'superadmin').
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { db } from '@/lib/db';
import { PROVIDER_AUDIENCES } from '@/lib/b2b';
import { parseVerificationDocuments } from '@/lib/provider-verification';

function slugifyBusiness(businessName: string): string {
  return businessName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'prestataire';
}

export async function GET() {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    const providers = await db.provider.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { email: true, isActive: true } },
        _count: { select: { serviceRequests: true, reviews: true } },
      },
    });

    return NextResponse.json({
      providers: providers.map((p) => ({
        id: p.id,
        businessName: p.businessName,
        category: p.category,
        subcategory: p.subcategory,
        description: p.description,
        location: p.location,
        latitude: p.latitude,
        longitude: p.longitude,
        serviceRadiusKm: p.serviceRadiusKm,
        audience: p.audience,
        hourlyRate: p.hourlyRate,
        isUrgentAvailable: p.isUrgentAvailable,
        isVerified: p.isVerified,
        isActive: p.isActive,
        // FIX-11 (lecture seule) — JSON FIX-4 parsé défensivement ;
        // alimente le statut quadri-état + le filtre de la liste admin.
        verificationDocuments: parseVerificationDocuments(p.verificationDocuments),
        portfolioImages: p.portfolioImages,
        ratingAvg: p.ratingAvg,
        totalReviews: p.totalReviews,
        totalJobsCompleted: p.totalJobsCompleted,
        email: p.user.email,
        userIsActive: p.user.isActive,
        serviceRequestsCount: p._count.serviceRequests,
        reviewsCount: p._count.reviews,
        createdAt: p.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('[GET /api/admin/providers-admin] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

interface CreateBody {
  businessName?: string;
  category?: string;
  subcategory?: string;
  description?: string;
  location?: string;
  latitude?: number | string;
  longitude?: number | string;
  serviceRadiusKm?: number | string;
  audience?: string;
  hourlyRate?: number | string | null;
  isUrgentAvailable?: boolean;
  isVerified?: boolean;
  isActive?: boolean;
  email?: string;
  portfolioImages?: string[];
}

export async function POST(req: NextRequest) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    const body = (await req.json()) as CreateBody;

    // ---------- Validation ----------
    const businessName = body.businessName?.trim();
    if (!businessName || businessName.length < 2) {
      return NextResponse.json({ error: 'Le nom du prestataire est requis (2 caractères min.)' }, { status: 400 });
    }
    if (!body.category) {
      return NextResponse.json({ error: 'La catégorie est requise' }, { status: 400 });
    }
    if (body.audience && !PROVIDER_AUDIENCES.includes(body.audience as never)) {
      return NextResponse.json({ error: 'Audience invalide (OWNER_SERVICE ou GUEST_EXPERIENCE)' }, { status: 400 });
    }

    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      return NextResponse.json({ error: 'Latitude invalide (entre -90 et 90)' }, { status: 400 });
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return NextResponse.json({ error: 'Longitude invalide (entre -180 et 180)' }, { status: 400 });
    }

    const serviceRadiusKm = Math.min(Math.max(Math.round(Number(body.serviceRadiusKm) || 10), 1), 200);
    const hourlyRate =
      body.hourlyRate === null || body.hourlyRate === undefined || body.hourlyRate === ''
        ? null
        : Math.max(0, Number(body.hourlyRate) || 0);

    // Email : fourni, ou auto-généré à partir du nom (compte "fantôme",
    // sans mot de passe, comme les prestataires de démo)
    const email =
      body.email?.trim().toLowerCase() ||
      `contact.${slugifyBusiness(businessName)}@pro.conciergerie-hub.fr`;

    const emailTaken = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (emailTaken) {
      return NextResponse.json({ error: `L'email ${email} est déjà utilisé` }, { status: 409 });
    }

    const created = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          fullName: businessName,
          role: 'user',
          // passwordHash null : le prestataire ne se connecte pas (géré par le Superadmin)
        },
      });
      return tx.provider.create({
        data: {
          userId: user.id,
          businessName,
          category: body.category!,
          subcategory: body.subcategory?.trim() || null,
          description: body.description?.trim() || null,
          location: body.location?.trim() || null,
          latitude,
          longitude,
          serviceRadiusKm,
          audience: body.audience ?? 'OWNER_SERVICE',
          hourlyRate,
          isUrgentAvailable: body.isUrgentAvailable ?? false,
          isVerified: body.isVerified ?? false,
          isActive: body.isActive ?? true,
          portfolioImages: JSON.stringify(Array.isArray(body.portfolioImages) ? body.portfolioImages.slice(0, 6) : []),
        },
      });
    });

    return NextResponse.json({ provider: { id: created.id } }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/admin/providers-admin] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
