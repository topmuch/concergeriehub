import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import sharp from 'sharp';

// =============================================================
// ÉTAPE 16 (V3) — Icône PWA dynamique par logement
// GET /api/public/app-icon?slug=…&size=192|512&purpose=any|maskable
//
// Génère un PNG via sharp : pastille arrondie aux couleurs de la
// marque, dégradé choisi de façon déterministe à partir du nom du
// logement + initiale en blanc. L'app installée affiche donc
// l'icône du logement (ex: "L" pour Loft Canal Saint-Martin).
// =============================================================

const DEMO_SLUG = 'demo-hub';

const PALETTES: { from: string; to: string }[] = [
  { from: '#059669', to: '#047857' }, // Émeraude (marque)
  { from: '#0D9488', to: '#0F766E' }, // Teal
  { from: '#D97706', to: '#B45309' }, // Ambre profond
  { from: '#E11D48', to: '#BE123C' }, // Rose profond
  { from: '#7C3AED', to: '#6D28D9' }, // Violet
  { from: '#334155', to: '#1E293B' }, // Ardoise
];

function initialFor(name: string): string {
  const clean = name.trim();
  if (!clean) return 'C';
  const first = Array.from(clean)[0];
  return (first || 'C').toUpperCase();
}

function paletteFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return PALETTES[hash % PALETTES.length];
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = (url.searchParams.get('slug') || '').trim();
  const size = Math.min(Math.max(parseInt(url.searchParams.get('size') || '192', 10) || 192, 64), 512);
  const purpose = url.searchParams.get('purpose') === 'maskable' ? 'maskable' : 'any';

  if (!slug || slug.length < 2) {
    return NextResponse.json({ error: 'not_found' }, { status: 400 });
  }

  let propertyName = 'Conciergerie Hub';
  if (slug !== DEMO_SLUG) {
    const plaque = await db.physicalQrCode.findUnique({
      where: { hubSlug: slug },
      select: { propertyId: true, isClaimed: true },
    });
    const property = plaque?.isClaimed && plaque.propertyId
      ? await db.property.findUnique({ where: { id: plaque.propertyId }, select: { name: true } })
      : await db.property.findUnique({ where: { qrHubSlug: slug }, select: { name: true } });
    if (!property) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    propertyName = property.name;
  }

  const palette = paletteFor(propertyName);
  const initial = initialFor(propertyName);

  // Maskable : le visuel reste dans la zone sûre (80 % du canevas)
  const pad = purpose === 'maskable' ? size * 0.1 : 0;
  const inner = size - pad * 2;
  const radius = purpose === 'maskable' ? inner * 0.18 : size * 0.22;
  const fontSize = Math.round(inner * 0.46);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette.from}"/>
      <stop offset="100%" stop-color="${palette.to}"/>
    </linearGradient>
  </defs>
  <rect x="${pad}" y="${pad}" width="${inner}" height="${inner}" rx="${radius}" fill="url(#bg)"/>
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${fontSize}" fill="#FFFFFF">${escapeXml(initial)}</text>
</svg>`;

  try {
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    return new NextResponse(new Uint8Array(png), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    });
  } catch (error) {
    console.error('App-icon generation error:', error);
    return NextResponse.json({ error: 'server' }, { status: 500 });
  }
}

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case '"':
        return '&quot;';
      default:
        return '&apos;';
    }
  });
}
