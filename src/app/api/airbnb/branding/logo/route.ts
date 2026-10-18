import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { mutationGuard, mutationKey } from '@/lib/mutation-guard';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { canAccessProperty } from '@/lib/b2b-server';
import { parseBranding } from '@/lib/branding';
import { mkdir, writeFile, unlink } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

// =============================================================
// ÉTAPE 19 (V3) — WHITE-LABEL : logo de marque du bien.
//   POST   /api/airbnb/branding/logo?propertyId=…  (multipart, file)
//     → PNG normalisé (512px max, carré cover) dans
//       public/uploads/branding/<propertyId>.png → branding.logoUrl
//   DELETE /api/airbnb/branding/logo?propertyId=…
//     → retrait du logo (DB + fichier).
//
// Sécurité : session + accès bien ; extension réelle validée par
// sharp (ré-encodage PNG = pas de SVG/polyglot) ; max 2 Mo.
// IDs en QUERY PARAM (règle sandbox). Never-throw.
// =============================================================

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'branding');
const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

function logoPathFor(propertyId: string): string {
  return path.join(UPLOAD_DIR, `${propertyId}.png`);
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    // FIX-15 — anti-abus : 30 mutations/min par hôte (userId, sinon IP).
    const mutGuard = await mutationGuard(mutationKey('airbnb-mut', req, userId));
    if (mutGuard) return mutGuard;

    const { searchParams } = new URL(req.url);
    const propertyId = (searchParams.get('propertyId') || '').trim();
    if (!propertyId) {
      return NextResponse.json({ error: 'Bien manquant' }, { status: 400 });
    }
    if (!(await canAccessProperty(userId, propertyId))) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'Aucun fichier reçu.' }, { status: 400 });
    }
    if (!ALLOWED.includes(file.type)) {
      return NextResponse.json(
        { error: 'Format non supporté (PNG, JPEG, WebP ou GIF attendu).' },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Image trop lourde (2 Mo max).' }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    // Ré-encodage systématique en PNG 512px max — neutralise tout
    // contenu malveillant (SVG actif, EXIF, polyglot) et unifie le nom.
    const png = await sharp(bytes)
      .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
      .png({ quality: 90 })
      .toBuffer();

    await mkdir(UPLOAD_DIR, { recursive: true });
    await writeFile(logoPathFor(propertyId), png);

    // Cache-busting : une version dans l'URL invalide les vieux logos.
    const logoUrl = `/uploads/branding/${propertyId}.png?v=${Date.now()}`;
    const existing = await db.property.findUnique({
      where: { id: propertyId },
      select: { branding: true },
    });
    const next = { ...parseBranding(existing?.branding), logoUrl };
    await db.property.update({ where: { id: propertyId }, data: { branding: next } });

    return NextResponse.json({ ok: true, logoUrl });
  } catch (error) {
    console.error('[airbnb/branding/logo POST] Error:', error);
    return NextResponse.json({ error: 'Impossible de traiter cette image.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    // FIX-15 — anti-abus : 30 mutations/min par hôte (userId, sinon IP).
    const mutGuard = await mutationGuard(mutationKey('airbnb-mut', req, userId));
    if (mutGuard) return mutGuard;

    const { searchParams } = new URL(req.url);
    const propertyId = (searchParams.get('propertyId') || '').trim();
    if (!propertyId) {
      return NextResponse.json({ error: 'Bien manquant' }, { status: 400 });
    }
    if (!(await canAccessProperty(userId, propertyId))) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const existing = await db.property.findUnique({
      where: { id: propertyId },
      select: { branding: true },
    });
    const next = { ...parseBranding(existing?.branding), logoUrl: null };
    await db.property.update({ where: { id: propertyId }, data: { branding: next } });
    await unlink(logoPathFor(propertyId)).catch(() => {
      /* fichier déjà absent — sans conséquence */
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[airbnb/branding/logo DELETE] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
