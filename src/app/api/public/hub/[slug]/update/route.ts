import { NextResponse } from 'next/server';
import { compare, hash } from 'bcryptjs';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
// FIX-14 — monitoring d'erreurs : trace AuditLog (action='runtime.error').
import { captureError } from '@/lib/error-monitor';
// FIX-15 (C) — premier usage réel de zod + clientIp pour le rate-limit IP-scopé.
import { z } from 'zod';
import { clientIp } from '@/lib/audit';

const DEMO_SLUG = 'demo-hub';
const isDemo = (slug: string) => slug === DEMO_SLUG;

// FIX-15 (C) — validation zod du payload PUT update. Contrat conservé :
// mêmes champs, mêmes statuts (400) et mêmes messages FR que la validation
// manuelle précédente. Particularités assumées :
//  - `pin` reste validé PAR MODE plus bas (démo : 4 chiffres optionnels ;
//    réel : requis 4 chiffres) — comportement historique identique ;
//  - `updates[]` : zod garantit « tableau d'objets » ; les items incomplets
//    restent ignorés (continue) et `content` reste un objet libre car chaque
//    module du Hub définit son propre schéma de contenu (wifi, guidebook…) ;
//  - `newPin` est désormais rejeté AVANT toute écriture (avant : le 400
//    arrivait après application des updates — durcissement, mêmes
//    message/statut ; les clients valides ne voient aucune différence).
const updateSchema = z.object({
  pin: z.string().optional(),
  updates: z
    .array(
      z.object({
        qrCodeId: z.string().optional(),
        content: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .optional(),
  homeData: z
    .object({
      name: z.string().optional(),
      address: z.string().optional(),
    })
    .optional()
    .nullable(),
  newPin: z
    .string()
    .regex(/^[0-9]{4}$/, { message: 'Le nouveau PIN doit comporter exactement 4 chiffres' })
    .optional()
    .nullable(),
});

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

    const rawBody = await req.json().catch(() => null);
    // FIX-15 (C) : payload malformé → 400 avec le premier message zod
    // (au lieu d'un 500 sur un champ inattendu). Clients valides inchangés.
    const parsed = updateSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Requête invalide' },
        { status: 400 },
      );
    }
    const { pin, updates, homeData, newPin } = parsed.data;

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
    // FIX-15 (B) — Anti brute-force par IP (10 tentatives/min) ; le quota
    // slug global serait un vecteur de DoS du mode hôte : un tiers pouvait
    // épuiser `hubupdatepin:<slug>` et verrouiller l'hôte légitime.
    if (!(await rateLimit(`hubupdatepin:${slug}:${clientIp(req.headers) ?? 'local'}`, 10))) {
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

    // ── Change PIN ── (format déjà validé par zod — FIX-15 (C))
    if (newPin) {
      const hashedPin = await hash(newPin, 10);
      await db.property.update({
        where: { id: home.id },
        data: { pinHash: hashedPin },
      });
    }

    return NextResponse.json({ success: true, updated: updatedCount });
  } catch (error) {
    // FIX-14 — captureError console.error + trace AuditLog, ne jette jamais.
    await captureError('hub.update', error, undefined, req);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
