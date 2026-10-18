// =============================================================
// GET /api/uploads/concierge/[file] — lecture des photos / GIF de
// la conciergerie (appareils du Guide + pannes courantes du SOS).
//
// Même mécanique que /api/uploads/voice (messages vocaux) :
//  les fichiers sont écrits dans <cwd>/data/uploads/concierge
//  (volume persistant Docker /app/data) car public/ n'est PAS servi
//  après un build standalone et n'est pas persisté.
// Content-Type par extension (allowlist stricte, basename uniquement
// → aucune traversée de chemin possible). Images non privées (elles
// apparaissent dans l'app des invités) → cache public long.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import { join, basename } from 'path';
import {
  CONCIERGE_MEDIA_CONTENT_TYPES,
  CONCIERGE_MEDIA_EXT,
  type ConciergeMediaExt,
} from '@/lib/concierge-media';

const UPLOAD_DIR = 'data/uploads/concierge';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ file: string }> },
) {
  try {
    const { file: rawFile } = await params;
    // Sanitisation : basename uniquement + allowlist de caractères.
    let name: string;
    try {
      name = basename(decodeURIComponent(rawFile));
    } catch {
      return NextResponse.json({ error: 'Fichier invalide' }, { status: 404 });
    }
    if (!/^[A-Za-z0-9._-]+$/.test(name) || name.startsWith('.')) {
      return NextResponse.json({ error: 'Fichier invalide' }, { status: 404 });
    }
    const ext = (name.split('.').pop() ?? '').toLowerCase() as ConciergeMediaExt;
    if (!(CONCIERGE_MEDIA_EXT as readonly string[]).includes(ext)) {
      return NextResponse.json({ error: 'Format non supporté' }, { status: 404 });
    }

    const filePath = join(process.cwd(), UPLOAD_DIR, name);
    try {
      const info = await stat(filePath);
      if (!info.isFile()) {
        return NextResponse.json({ error: 'Image introuvable' }, { status: 404 });
      }
      const bytes = await readFile(filePath);
      return new NextResponse(new Uint8Array(bytes), {
        status: 200,
        headers: {
          'Content-Type': CONCIERGE_MEDIA_CONTENT_TYPES[ext] ?? 'application/octet-stream',
          'Content-Length': String(info.size),
          // Noms de fichiers uniques (timestamp) → cache public long.
          'Cache-Control': 'public, max-age=31536000, immutable',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } catch {
      return NextResponse.json({ error: 'Image introuvable' }, { status: 404 });
    }
  } catch (error) {
    console.error('[uploads/concierge GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
