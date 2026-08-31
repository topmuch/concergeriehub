import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// =============================================================
// ÉTAPE 16 (V3) — Manifest PWA DYNAMIQUE par logement
// GET /api/public/app-manifest?slug=…
//
// Le nom de "l'app" installée correspond au logement
// (ex: "Loft Canal Saint-Martin") et son icône est générée
// dynamiquement (/api/public/app-icon). La page invité injecte
// ce manifest via generateMetadata → <link rel="manifest">.
//
// scope = /app/hub/ → l'app installée ne couvre que l'expérience
// invitée, jamais l'Espace Hôte.
// =============================================================

const DEMO_SLUG = 'demo-hub';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = (url.searchParams.get('slug') || '').trim();

  if (!slug || slug.length < 2) {
    return NextResponse.json({ error: 'not_found' }, { status: 400 });
  }

  let propertyName = 'Conciergerie Hub';
  if (slug !== DEMO_SLUG) {
    // Plaque QR (flux V1) OU Hub du bien (V2)
    const plaque = await db.physicalQrCode.findUnique({
      where: { hubSlug: slug },
      select: { propertyId: true, isClaimed: true },
    });
    const property = plaque?.isClaimed && plaque.propertyId
      ? await db.property.findUnique({
          where: { id: plaque.propertyId },
          select: { name: true, isActive: true },
        })
      : await db.property.findUnique({
          where: { qrHubSlug: slug },
          select: { name: true, isActive: true },
        });

    if (!property || !property.isActive) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    propertyName = property.name;
  }

  const startUrl = `/app/hub/${encodeURIComponent(slug)}/guest`;
  const icon = (size: number, purpose: string) =>
    `/api/public/app-icon?slug=${encodeURIComponent(slug)}&size=${size}&purpose=${purpose}`;

  const manifest = {
    id: startUrl,
    name: propertyName,
    short_name: propertyName.length > 14 ? `${propertyName.slice(0, 13)}…` : propertyName,
    description: `Votre guide digital pour ${propertyName} : Wi-Fi, guidebook, services et contact hôte.`,
    start_url: startUrl,
    scope: '/app/hub/',
    display: 'standalone',
    orientation: 'portrait',
    lang: 'fr',
    dir: 'ltr',
    background_color: '#F8FAFC',
    theme_color: '#059669',
    categories: ['travel', 'lifestyle'],
    icons: [
      { src: icon(192, 'any'), sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: icon(512, 'any'), sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: icon(512, 'maskable'), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };

  return new NextResponse(JSON.stringify(manifest), {
    status: 200,
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
