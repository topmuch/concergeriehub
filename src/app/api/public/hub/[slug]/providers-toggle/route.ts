import { NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { z } from 'zod';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/audit';

// =============================================================
// v4.32 « PRESTATAIRES AUTOUR » — ACTIVER / DÉSACTIVER par le MODE HÔTE
// POST /api/public/hub/[slug]/providers-toggle
//   body: { pin, providerId, enabled: boolean }
//
// L'hôte décide quels prestataires « autour du bien » sont proposés :
//   • enabled=false → l'id rejoint Property.disabledProviders (Json,
//     liste d'ids) : le prestataire disparaît des services invités
//     (hub public + PWA) et apparaît « Désactivé » dans les listes
//     de gestion (mode hôte + dashboard /airbnb/providers).
//   • enabled=true  → l'id est retiré de la liste (réactivation).
//
// Sécurité : PIN bcrypt FAIL-CLOSED (même garde que POST /host) +
// rate limit + zod + anti-abus (20 toggles/min) ; never-throw.
// =============================================================

const bodySchema = z.object({
  pin: z.string().regex(/^\d{4}$/, { message: 'PIN invalide' }),
  providerId: z.string().trim().min(1).max(60),
  enabled: z.boolean(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    if (!(await rateLimit(`hubprovidertoggle:${slug}:${clientIp(req.headers) ?? 'local'}`, 20))) {
      return NextResponse.json({ error: 'Trop de tentatives. Réessayez dans un instant.' }, { status: 429 });
    }
    const raw = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
    }
    const { pin, providerId, enabled } = parsed.data;

    // ── DEMO MODE : n'importe quel PIN à 4 chiffres, succès sans écriture ──
    if (slug === 'demo-hub') {
      return NextResponse.json({ ok: true, enabled, demo: true });
    }

    // ── Résolution du bien : plaque V1 OU hub du bien (É12) ──
    let propertyId: string | null = null;
    const plaque = await db.physicalQrCode.findUnique({
      where: { hubSlug: slug },
      select: { propertyId: true, isClaimed: true },
    });
    if (plaque) {
      if (!plaque.isClaimed || !plaque.propertyId) {
        return NextResponse.json({ error: 'Hub non trouvé' }, { status: 404 });
      }
      propertyId = plaque.propertyId;
    } else {
      const propertyBySlug = await db.property.findUnique({
        where: { qrHubSlug: slug },
        select: { id: true, isActive: true },
      });
      if (!propertyBySlug) {
        return NextResponse.json({ error: 'Hub non trouvé' }, { status: 404 });
      }
      if (!propertyBySlug.isActive) {
        return NextResponse.json({ error: 'Ce bien a été désactivé par son hôte.' }, { status: 410 });
      }
      propertyId = propertyBySlug.id;
    }

    const property = await db.property.findUnique({
      where: { id: propertyId },
      select: { id: true, pinHash: true, disabledProviders: true },
    });
    if (!property) {
      return NextResponse.json({ error: 'Logement non trouvé' }, { status: 404 });
    }
    if (!property.pinHash) {
      return NextResponse.json({ error: "Aucun PIN n'est configuré pour ce logement." }, { status: 403 });
    }
    const isValid = await compare(pin, property.pinHash);
    if (!isValid) {
      return NextResponse.json({ error: 'PIN incorrect' }, { status: 401 });
    }

    // Le prestataire doit exister (jamais cru côté client).
    const provider = await db.provider.findUnique({
      where: { id: providerId },
      select: { id: true },
    });
    if (!provider) {
      return NextResponse.json({ error: 'Prestataire introuvable.' }, { status: 404 });
    }

    // ── Merge de la liste disabledProviders (Json SQLite tolérant) ──
    const current = Array.isArray(property.disabledProviders)
      ? (property.disabledProviders as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];
    const next = enabled
      ? current.filter((id) => id !== providerId)
      : current.includes(providerId)
        ? current
        : [...current, providerId];

    await db.property.update({
      where: { id: property.id },
      data: { disabledProviders: next },
    });

    return NextResponse.json({
      ok: true,
      enabled,
      disabledCount: next.length,
    });
  } catch (error) {
    console.error('Hub providers-toggle error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
