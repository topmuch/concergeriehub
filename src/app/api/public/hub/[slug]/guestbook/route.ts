import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

const DEMO_SLUG = 'demo-hub';
const isDemo = (slug: string) => slug === DEMO_SLUG;

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

    const body = await req.json();
    const { qrCodeId, entry } = body;

    if (!qrCodeId) {
      return NextResponse.json({ error: 'Code QR requis' }, { status: 400 });
    }
    if (!entry || !entry.author || !entry.message) {
      return NextResponse.json(
        { error: 'Auteur et message requis' },
        { status: 400 }
      );
    }

    if (entry.author.trim().length === 0) {
      return NextResponse.json({ error: 'L\'auteur ne peut pas être vide' }, { status: 400 });
    }
    if (entry.message.trim().length === 0) {
      return NextResponse.json({ error: 'Le message ne peut pas être vide' }, { status: 400 });
    }
    if (entry.message.length > 2000) {
      return NextResponse.json(
        { error: 'Le message ne peut pas dépasser 2000 caractères' },
        { status: 400 }
      );
    }
    if (entry.rating !== undefined && entry.rating !== null) {
      const r = Number(entry.rating);
      if (!Number.isInteger(r) || r < 1 || r > 5) {
        return NextResponse.json(
          { error: 'La note doit être un entier entre 1 et 5' },
          { status: 400 }
        );
      }
    }

    // ── DEMO MODE: return success without saving ──
    if (isDemo(slug)) {
      return NextResponse.json({ success: true });
    }

    // ── Find the plaque and home ──
    const plaque = await db.physicalQrCode.findUnique({
      where: { hubSlug: slug },
    });

    if (!plaque || !plaque.isClaimed || !plaque.homeId) {
      return NextResponse.json({ error: 'Hub non trouvé' }, { status: 404 });
    }

    // ── Verify the QR code exists and belongs to this home ──
    const qrCode = await db.qrCode.findUnique({
      where: { id: qrCodeId },
      select: { id: true, homeId: true },
    });

    if (!qrCode || qrCode.homeId !== plaque.homeId) {
      return NextResponse.json(
        { error: 'Code QR non trouvé pour ce logement' },
        { status: 404 }
      );
    }

    // ── Find or create the QrContent record ──
    const newEntry = {
      author: entry.author.trim(),
      message: entry.message.trim(),
      rating: entry.rating !== undefined && entry.rating !== null ? Number(entry.rating) : undefined,
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
    console.error('Hub guestbook POST error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
