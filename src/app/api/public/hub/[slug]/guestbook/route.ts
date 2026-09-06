import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
// FIX-14 — monitoring d'erreurs : trace AuditLog (action='runtime.error').
import { captureError } from '@/lib/error-monitor';
// FIX-15 (C) — premier usage réel de zod + clientIp pour le rate-limit IP-scopé.
import { z } from 'zod';
import { clientIp } from '@/lib/audit';

const DEMO_SLUG = 'demo-hub';
const isDemo = (slug: string) => slug === DEMO_SLUG;

// FIX-15 (C) — validation zod du POST guestbook. Contrat conservé : mêmes
// messages 400 FR que la validation manuelle (Auteur et message requis,
// message ≤ 2000 sur la longueur BRUTE, note entière 1-5 optionnelle).
const guestbookSchema = z.object({
  qrCodeId: z
    .string({ message: 'Code QR requis' })
    .min(1, { message: 'Code QR requis' }),
  entry: z.object({
    author: z
      .string({ message: 'Auteur et message requis' })
      .trim()
      .min(1, { message: "L'auteur ne peut pas être vide" }),
    // .max AVANT .trim() : la limite s'applique à la longueur brute,
    // exactement comme l'ancien contrôle `entry.message.length > 2000`.
    message: z
      .string({ message: 'Auteur et message requis' })
      .max(2000, { message: 'Le message ne peut pas dépasser 2000 caractères' })
      .trim()
      .min(1, { message: 'Le message ne peut pas être vide' }),
    rating: z
      .number({ message: 'La note doit être un entier entre 1 et 5' })
      .int({ message: 'La note doit être un entier entre 1 et 5' })
      .min(1, { message: 'La note doit être un entier entre 1 et 5' })
      .max(5, { message: 'La note doit être un entier entre 1 et 5' })
      .optional()
      .nullable(),
  }),
});

/**
 * POST /api/public/hub/[slug]/guestbook
 *
 * Allows guests to add guestbook entries without PIN.
 * Entries are appended to the contentJson of the QR code's content record.
 *
 * Body: { qrCodeId: string, entry: { author: string, message: string, rating?: number } }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    if (!slug || slug.length < 2) {
      return NextResponse.json({ error: 'Slug invalide' }, { status: 400 });
    }

    // FIX-15 (B) — Anti-spam par IP (5 avis/min) ; le quota slug global
    // serait un vecteur de DoS : un tiers pouvait épuiser
    // `guestbook:<slug>` et bloquer les invités légitimes.
    if (!(await rateLimit(`guestbook:${slug}:${clientIp(req.headers) ?? 'local'}`, 5))) {
      return NextResponse.json({ error: 'Trop de tentatives. Réessayez dans un instant.' }, { status: 429 });
    }

    const rawBody = await req.json().catch(() => null);
    // FIX-15 (C) : payload malformé → 400 (premier message zod).
    const parsed = guestbookSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Requête invalide' },
        { status: 400 },
      );
    }
    const { qrCodeId, entry } = parsed.data;

    // ── DEMO MODE: return success without saving ──
    if (isDemo(slug)) {
      return NextResponse.json({ success: true });
    }

    // ── Résolution du bien : plaque V1 OU hub du bien (É12, property.qrHubSlug) ──
    // (AUD-FULL/FIX-1 : les biens wizard n'ont pas de plaque, résolution double
    //  identique à GET /host et /complaint)
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

    // ── Verify the QR code exists and belongs to this home ──
    const qrCode = await db.qrCode.findUnique({
      where: { id: qrCodeId },
      select: { id: true, propertyId: true },
    });

    if (!qrCode || qrCode.propertyId !== propertyId) {
      return NextResponse.json(
        { error: 'Code QR non trouvé pour ce logement' },
        { status: 404 }
      );
    }

    // ── Find or create the QrContent record ──
    const newEntry = {
      author: entry.author.trim(),
      message: entry.message.trim(),
      rating: entry.rating ?? undefined,
      createdAt: new Date().toISOString(),
    };

    const existing = await db.qrContent.findUnique({
      where: { qrCodeId },
    });

    let currentContent: Record<string, any> = {};
    if (existing) {
      try {
        currentContent = JSON.parse(existing.contentJson);
      } catch {
        currentContent = {};
      }
    }

    // Ensure entries array exists
    if (!Array.isArray(currentContent.entries)) {
      currentContent.entries = [];
    }

    // Append the new entry
    currentContent.entries.push(newEntry);

    // Upsert the content
    await db.qrContent.upsert({
      where: { qrCodeId },
      create: {
        qrCodeId,
        contentJson: JSON.stringify(currentContent),
      },
      update: {
        contentJson: JSON.stringify(currentContent),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    // FIX-14 — captureError console.error + trace AuditLog, ne jette jamais.
    await captureError('hub.guestbook', error, undefined, req);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
