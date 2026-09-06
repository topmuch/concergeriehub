import { NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
// FIX-12 — notification SMS hôte (Twilio REST env-gated, fail-closed).
import { sendSms } from '@/lib/sms';
// FIX-14 — monitoring d'erreurs : trace AuditLog (action='runtime.error').
import { captureError } from '@/lib/error-monitor';
// FIX-15 (C) — zod sur la mutation publique + clientIp (rate-limit IP-scopé).
import { z } from 'zod';

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

const CATEGORY_LABELS: Record<Category, string> = {
  PLUMBING: 'Plomberie',
  ELECTRICAL: 'Électricité',
  CLEANING: 'Ménage',
  OTHER: 'Autre',
};

/**
 * FIX-12 — SMS hôte à la création d'une réclamation (notification la plus
 * critique du Hub). Destinataire = propriétaire du bien, UNIQUEMENT s'il
 * a un téléphone réel en DB (Profile.phone, format E.164). Sans téléphone
 * renseigné → no-op silencieux (le SMS complète la consultation du MODE
 * HÔTE, il ne la remplace pas — le flux existant est inchangé).
 * Fire-and-forget : aucun échec SMS ne remonte à l'invité.
 */
async function notifyHostBySms(
  propertyId: string,
  data: {
    complaintId: string;
    category: Category;
    description: string;
    isUrgent: boolean;
    guestName: string | null;
  },
): Promise<void> {
  try {
    const property = await db.property.findUnique({
      where: { id: propertyId },
      select: {
        name: true,
        owner: { select: { profile: { select: { phone: true } } } },
      },
    });
    const phone = property?.owner?.profile?.phone?.trim();
    if (!property || !phone) return;

    const prefix = data.isUrgent ? '🚨 URGENT — ' : '🔔 ';
    const guest = data.guestName ? ` (${data.guestName})` : '';
    const body =
      `${prefix}Conciergerie Hub — ${property.name} : nouvelle réclamation ` +
      `${CATEGORY_LABELS[data.category]}${guest}. « ${data.description.slice(0, 120)} »`;
    const result = await sendSms(phone, body);
    if (!result.sent) {
      console.warn(
        `[complaint] SMS hôte non envoyé (${data.complaintId}) :`,
        result.reason ?? result.error,
      );
    }
  } catch (error) {
    console.error('[complaint] notification SMS hôte failed:', error);
  }
}

const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'] as const;
const MAX_PHOTO_BYTES = 500 * 1024; // 500 KB décodé
const MAX_PHOTOS = 3;
const MAX_DESCRIPTION = 2000;

// FIX-15 (C) — validation zod du POST complaint. Règles IDENTIQUES à la
// validation manuelle remplacée : category enum, description 5-2000
// (sur la chaîne trimée), photos ≤ 3 (troncature historique conservée),
// isUrgent booléen, guestName optionnel. Mêmes messages 400 FR et mêmes
// statuts → aucun changement de contrat pour le formulaire Hub.
// `photos` continue d'être validée en COMPLÉMENT manuellement
// (validatePhoto) : la contrainte réelle — dataURL + mime allowlist +
// taille DÉCODÉE base64 ≤ 500 Ko — n'est pas exprimable proprement en zod.
const complaintSchema = z.object({
  category: z.enum(CATEGORIES, { message: 'Catégorie invalide.' }),
  description: z
    .string({ message: `Décrivez le problème en 5 à ${MAX_DESCRIPTION} caractères.` })
    .trim()
    .min(5, { message: `Décrivez le problème en 5 à ${MAX_DESCRIPTION} caractères.` })
    .max(MAX_DESCRIPTION, { message: `Décrivez le problème en 5 à ${MAX_DESCRIPTION} caractères.` }),
  photos: z.array(z.string()).optional().nullable(),
  isUrgent: z.boolean().optional().nullable(),
  guestName: z.string().optional().nullable(),
});

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

    const rawBody = await req.json().catch(() => null);
    if (!rawBody || typeof rawBody !== 'object') {
      return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
    }
    // FIX-15 (C) : zod remplace la validation manuelle (règles identiques).
    const parsed = complaintSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Requête invalide.' },
        { status: 400 },
      );
    }
    const category = parsed.data.category;
    const description = parsed.data.description;

    // Photos : troncature à 3 conservée (comportement historique) puis
    // validation manuelle dataURL/mime/taille décodée — cf. schema comment.
    const rawPhotos = parsed.data.photos?.slice(0, MAX_PHOTOS) ?? [];
    const photos: string[] = [];
    for (const p of rawPhotos) {
      const v = validatePhoto(p);
      if (!v.ok) return NextResponse.json({ error: v.reason }, { status: 400 });
      photos.push(p as string);
    }

    const isUrgent = parsed.data.isUrgent === true;
    const guestName =
      typeof parsed.data.guestName === 'string' && parsed.data.guestName.trim()
        ? parsed.data.guestName.trim().slice(0, 80)
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

    // FIX-12 — SMS hôte (fire-and-forget : JAMAIS bloquant pour la réponse
    // invité ; no-op si le propriétaire n'a pas de téléphone en DB).
    void notifyHostBySms(resolved.propertyId, {
      complaintId: complaint.id,
      category,
      description,
      isUrgent,
      guestName,
    }).catch(() => undefined);

    return NextResponse.json({
      success: true,
      id: complaint.id,
      createdAt: complaint.createdAt.toISOString(),
    });
  } catch (error) {
    // FIX-14 — captureError console.error + trace AuditLog, ne jette jamais.
    await captureError('hub.complaint', error, undefined, req);
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

    // FIX-15 (B) — Anti brute-force par IP (10 tentatives/min) ; le quota
    // slug global serait un vecteur de DoS du mode hôte : un tiers pouvait
    // épuiser `hubhostpin:<slug>` et verrouiller l'hôte légitime.
    if (!(await rateLimit(`hubhostpin:${slug}:${clientIp(req)}`, 10))) {
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
    // FIX-14 — captureError console.error + trace AuditLog, ne jette jamais.
    await captureError('hub.complaint.status', error, undefined, req);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
