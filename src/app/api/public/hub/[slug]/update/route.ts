import { NextResponse } from 'next/server';
import { compare, hash } from 'bcryptjs';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';

const DEMO_SLUG = 'demo-hub';
const isDemo = (slug: string) => slug === DEMO_SLUG;

type UpdateItem = {
  qrCodeId: string;
  content: Record<string, any>;
};

/**
 * PUT /api/public/hub/[slug]/update
 *
 * Allows updating QR code content and home data from the Hub.
 * Requires PIN verification if the home has one configured.
 *
 * Body examples:
 *   // Update QR code contents:
 *   { pin: "1234", updates: [{ qrCodeId: "...", content: { ... } }] }
 *
 *   // Update home info:
 *   { pin: "1234", homeData: { name: "...", address: "..." } }
 *
 *   // Change PIN:
 *   { pin: "1234", newPin: "5678" }
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    if (!slug || slug.length < 2) {
      return NextResponse.json({ error: 'Slug invalide' }, { status: 400 });
    }

    const body = await req.json();
    const { pin, updates, homeData, newPin } = body;

    // ── DEMO MODE: any 4-digit PIN works, return success without saving ──
    if (isDemo(slug)) {
      if (pin && !/^\d{4}$/.test(pin)) {
        return NextResponse.json({ error: 'PIN invalide' }, { status: 400 });
      }
      return NextResponse.json({
        success: true,
        updated: updates?.length ?? 0,
      });
    }

    // ── Résolution du bien : plaque V1 OU hub du bien (É12, property.qrHubSlug) ──
    // (AUD-FULL/FIX-1 : même résolution double que GET /host et /complaint —
    //  les biens créés par wizard n'ont pas de plaque et sont joignables via qrHubSlug)
    let propertyId: string | null = null;
    const plaque = await db.physicalQrCode.findUnique({
      where: { hubSlug: slug },
      select: { propertyId: true, isClaimed: true, status: true },
    });
    if (plaque) {
      if (!plaque.isClaimed || !plaque.propertyId) {
        return NextResponse.json({ error: 'Hub non trouvé' }, { status: 404 });
      }
      if (plaque.status !== 'active') {
        return NextResponse.json({ error: 'Cette plaque QR est désactivée.' }, { status: 410 });
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

    const home = await db.property.findUnique({
      where: { id: propertyId },
      select: { id: true, pinHash: true },
    });

    if (!home) {
      return NextResponse.json({ error: 'Logement non trouvé' }, { status: 404 });
    }

    // ── PIN verification (FAIL-CLOSED : sans PIN configuré, toute mutation est refusée) ──
    if (!home.pinHash) {
      return NextResponse.json(
        { error: "Aucun PIN n'est configuré pour ce logement. Définissez-le d'abord dans l'espace hôte." },
        { status: 403 },
      );
    }
    if (!pin || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: 'PIN requis (4 chiffres)' }, { status: 400 });
    }
    // Anti brute-force : 10 tentatives/minute/slug.
    if (!(await rateLimit(`hubupdatepin:${slug}`, 10))) {
      return NextResponse.json({ error: 'Trop de tentatives. Réessayez dans un instant.' }, { status: 429 });
    }
    const isValid = await compare(pin, home.pinHash);
    if (!isValid) {
      return NextResponse.json({ error: 'PIN incorrect' }, { status: 401 });
    }

    let updatedCount = 0;

    // ── Update QR code contents ──
    if (updates && Array.isArray(updates) && updates.length > 0) {
      // Fetch all QR codes belonging to this home for verification
      const homeQrCodes = await db.qrCode.findMany({
        where: { propertyId: home.id },
        select: { id: true },
      });
      const homeQrCodeIds = new Set(homeQrCodes.map((qr) => qr.id));

      for (const update of updates) {
        if (!update.qrCodeId || !update.content) {
          continue;
        }

        // Verify the QR code belongs to this home
        if (!homeQrCodeIds.has(update.qrCodeId)) {
          return NextResponse.json(
            { error: 'Code QR non trouvé pour ce logement' },
            { status: 404 }
          );
        }

        // Upsert the content
        await db.qrContent.upsert({
          where: { qrCodeId: update.qrCodeId },
          create: {
            qrCodeId: update.qrCodeId,
            contentJson: JSON.stringify(update.content),
          },
          update: {
            contentJson: JSON.stringify(update.content),
          },
        });

        updatedCount++;
      }
    }

    // ── Update home-level data ──
    if (homeData && typeof homeData === 'object') {
      const updateData: Record<string, string> = {};
      if (typeof homeData.name === 'string' && homeData.name.trim()) {
        updateData.name = homeData.name.trim();
      }
      if (typeof homeData.address === 'string') {
        updateData.address = homeData.address.trim();
      }

      if (Object.keys(updateData).length > 0) {
        await db.property.update({
          where: { id: home.id },
          data: updateData,
        });
      }
    }

    // ── Change PIN ──
    if (newPin !== undefined && newPin !== null) {
      if (!/^[0-9]{4}$/.test(String(newPin))) {
        return NextResponse.json(
          { error: 'Le nouveau PIN doit comporter exactement 4 chiffres' },
          { status: 400 }
        );
      }
      const hashedPin = await hash(String(newPin), 10);
      await db.property.update({
        where: { id: home.id },
        data: { pinHash: hashedPin },
      });
    }

    return NextResponse.json({ success: true, updated: updatedCount });
  } catch (error) {
    console.error('Hub PUT update error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
