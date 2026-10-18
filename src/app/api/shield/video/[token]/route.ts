// =============================================================
// /api/shield/video/[token] — ROOMSCAN BOUCLIER AUTOMATISÉ
// GET public (token 24 car. non devinable) : sert les octets de la
// vidéo walkthrough avec le bon Content-Type. La page publique
// /shield/video/[token] affiche le lecteur + le hash SHA-256.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    if (!token || token.length < 8) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    // 30 requêtes/min/IP simulée par token (un seul flux attendu).
    if (!(await rateLimit(`shield-video:${token}`, 30))) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }

    const video = await db.shieldVideo.findUnique({
      where: { publicToken: token },
      select: { data: true, mimeType: true, sizeBytes: true },
    });
    if (!video) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const bytes = new Uint8Array(video.data);
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': video.mimeType || 'video/webm',
        'Content-Length': String(video.sizeBytes || bytes.byteLength),
        'Content-Disposition': 'inline',
        'Accept-Ranges': 'none',
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (err) {
    console.error('[shield/video/:token] GET failed:', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
