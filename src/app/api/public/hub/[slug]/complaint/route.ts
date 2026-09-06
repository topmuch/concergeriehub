import { NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';

// =============================================================
// Réclamations écrites du Hub public — /api/public/hub/[slug]/complaint
//
// POST   (invité, libre) : soumettre une réclamation
//   body: { category, description, photos?: string[], isUrgent?, guestName? }
//   - category : 'PLUMBING' | 'ELECTRICAL' | 'CLEANING' | 'OTHER'
//   - photos   : ≤ 3 images dataURL (png/jpeg/webp), ≤ 500 KB décodé / photo
//   - Rate limit : 5 / minute / slug+IP (anti spam)
//
// PATCH  (hôte) : marquer une réclamation résolue
//   body: { pin, id, status: 'RESOLVED' }
//   - PIN 4 chiffres du bien (bcrypt) — même garde que le MODE HÔTE
// =============================================================

const DEMO_SLUG = 'demo-hub';
const isDemo = (slug: string) => slug === DEMO_SLUG;

const CATEGORIES = ['PLUMBING', 'ELECTRICAL', 'CLEANING', 'OTHER'] as const;
type Category = (typeof CATEGORIES)[number];

const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'] as const;
const MAX_PHOTO_BYTES = 500 * 1024; // 500 KB décodé
const MAX_PHOTOS = 3;
const MAX_DESCRIPTION = 2000;

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0].trim() : null) || 'local';
}

/** Valide un dataURL image : mime autorisé + taille décodée ≤ 500 KB. */
function validatePhoto(dataUrl: unknown): { ok: true } | { ok: false; reason: string } {
  if (typeof dataUrl !== 'string') return { ok: false, reason: 'Photo invalide.' };
  const match = /^data:([a-z]+\/[a-z0-9.+_-]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) return { ok: false, reason: 'Format de photo non reconnu.' };
  const [, mime, b64] = match;
  if (!(ALLOWED_MIME as readonly string[]).includes(mime.toLowerCase())) {
    return { ok: false, reason: 'Type de fichier non autorisé (PNG, JPEG ou WebP uniquement).' };
  }
  const bytes = Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
  if (bytes > MAX_PHOTO_BYTES) {
    return { ok: false, reason: 'Photo trop volumineuse (max 500 Ko).' };
  }
  return { ok: true };
}

/** Résout le bien derrière un slug (plaque V1 OU hub du bien É12). */
async function resolvePropertyId(slug: string): Promise<
  { ok: true; propertyId: string } | { ok: false; status: number; message: string }
> {
  if (isDemo(slug)) return { ok: true, propertyId: 'demo-home-001' };

  const plaque = await db.physicalQrCode.findUnique({
    where: { hubSlug: slug },
    select: { propertyId: true, isClaimed: true, status: true },
  });

  if (plaque) {
    if (!plaque.isClaimed || !plaque.propertyId) {
      return { ok: false, status: 404, message: 'Ce hub est introuvable ou pas encore activé.' };
    }
    if (plaque.status !== 'active') {
      return { ok: false, status: 410, message: 'Cette plaque QR est désactivée.' };
    }
    return { ok: true, propertyId: plaque.propertyId };
  }

  const property = await db.property.findUnique({
    where: { qrHubSlug: slug },
    select: { id: true, isActive: true },
  });
  if (!property) return { ok: false, status: 404, message: 'Ce hub est introuvable.' };
  if (!property.isActive) return { ok: false, status: 410, message: 'Ce bien a été désactivé par son hôte.' };
  return { ok: true, propertyId: property.id };
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;

    // Anti-spam : 5 réclamations / minute / slug+IP
    if (!(await rateLimit(`hubcomplaint:${slug}:${clientIp(req)}`, 5))) {
      return NextResponse.json(
        { error: 'Trop de réclamations. Réessayez dans un instant.' },
        { status: 429 },
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
    }

    const category = body.category as Category;
    if (!CATEGORIES.includes(category)) {
      return NextResponse.json({ error: 'Catégorie invalide.' }, { status: 400 });
    }

    const description = typeof body.description === 'string' ? body.description.trim() : '';
    if (description.length < 5 || description.length > MAX_DESCRIPTION) {
      return NextResponse.json(
        { error: `Décrivez le problème en 5 à ${MAX_DESCRIPTION} caractères.` },
        { status: 400 },
      );
    }

    const rawPhotos = Array.isArray(body.photos) ? body.photos.slice(0, MAX_PHOTOS) : [];
    const photos: string[] = [];
    for (const p of rawPhotos) {
      const v = validatePhoto(p);
      if (!v.ok) return NextResponse.json({ error: v.reason }, { status: 400 });
      photos.push(p as string);
    }

    const isUrgent = body.isUrgent === true;
    const guestName =
      typeof body.guestName === 'string' && body.guestName.trim()
        ? body.guestName.trim().slice(0, 80)
        : null;

    const resolved = await resolvePropertyId(slug);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.message }, { status: resolved.status });
    }

    // ── DEMO MODE : succès sans écriture (le hub démo n'a pas de bien réel) ──
    if (isDemo(slug)) {
      return NextResponse.json({
        success: true,
        id: `demo-complaint-${Date.now()}`,
        message: 'Réclamation envoyée (mode démo).',
      });
    }

    const complaint = await db.guestComplaint.create({
      data: {
        propertyId: resolved.propertyId,
        category,
        description,
        photos: JSON.stringify(photos),
        isUrgent,
        guestName,
      },
      select: { id: true, createdAt: true },
    });

    return NextResponse.json({
      success: true,
      id: complaint.id,
      createdAt: complaint.createdAt.toISOString(),
    });
  } catch (error) {
    console.error('Hub complaint POST error:', error);
    return NextResponse.json(
      { error: 'Erreur serveur. Réessayez dans un instant.' },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const body = await req.json().catch(() => null);
    const pin = typeof body?.pin === 'string' ? body.pin : '';
    const id = typeof body?.id === 'string' ? body.id : '';
    const status = body?.status;

    if (status !== 'RESOLVED') {
      return NextResponse.json({ error: 'Statut non supporté.' }, { status: 400 });
    }
    if (!id) return NextResponse.json({ error: 'Réclamation introuvable.' }, { status: 400 });
    if (!pin || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: 'PIN requis (4 chiffres).' }, { status: 400 });
    }

    // Anti brute-force (même politique que le MODE HÔTE)
    if (!(await rateLimit(`hubhostpin:${slug}`, 10))) {
      return NextResponse.json({ error: 'Trop de tentatives. Réessayez dans un instant.' }, { status: 429 });
    }

    // ── DEMO MODE ──
    if (isDemo(slug)) {
      return NextResponse.json({ success: true });
    }

    const resolved = await resolvePropertyId(slug);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.message }, { status: resolved.status });
    }

    // Garde PIN identique au MODE HÔTE (bcrypt sur property.pinHash)
    const property = await db.property.findUnique({
      where: { id: resolved.propertyId },
      select: { pinHash: true },
    });
    if (!property?.pinHash) {
      return NextResponse.json({ error: 'Aucun PIN configuré.' }, { status: 403 });
    }
    const isValid = await compare(pin, property.pinHash);
    if (!isValid) {
      return NextResponse.json({ error: 'PIN incorrect' }, { status: 401 });
    }

    const existing = await db.guestComplaint.findFirst({
      where: { id, propertyId: resolved.propertyId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Réclamation introuvable.' }, { status: 404 });
    }

    await db.guestComplaint.update({
      where: { id: existing.id },
      data: { status: 'RESOLVED' },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Hub complaint PATCH error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
