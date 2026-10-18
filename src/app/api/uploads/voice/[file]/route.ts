// =============================================================
// GET /api/uploads/voice/[file] — lecture des messages vocaux
//
// POURQUOI CETTE ROUTE (bug production) :
//  Les audios étaient écrits dans public/uploads/voice/ à l'exécution.
//  En build standalone (Docker), Next.js ne sert PAS les fichiers
//  apparus dans public/ après le build → <audio src="/uploads/…"> = 404
//  = « l'enregistrement vocal ne marche pas ».
//  Cette route sert le fichier depuis :
//   1. <cwd>/data/uploads/voice  (volume persistant Docker, avec la DB)
//   2. public/uploads/voice      (anciens fichiers déjà sur disque)
//  Content-Type correct par extension (allowlist stricte, basename
//  uniquement → aucune traversée de chemin possible).
//
// v4.35 « VOCAL ILLISIBLE » — support des REQUÊTES RANGE (206) :
// Safari/iOS exige souvent des réponses partielles pour <audio> —
// l'ancien « Accept-Ranges: none » rendait les m4a injouables sur
// iPhone quand la lecture retombait sur le fichier disque.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import { join, basename } from 'path';
import { VOICE_ALLOWED_EXT, VOICE_CONTENT_TYPES, type VoiceAudioExt } from '@/lib/voice-audio';

function resolveUploadDirs(): string[] {
  const cwd = process.cwd();
  const dirs = [join(cwd, 'data', 'uploads', 'voice')];
  if (process.env.VOICE_UPLOAD_DIR) dirs.unshift(process.env.VOICE_UPLOAD_DIR);
  // Répertoire historique : fichiers écrits avant la migration.
  dirs.push(join(cwd, 'public', 'uploads', 'voice'));
  return dirs;
}

/**
 * v4.35 — parse « Range: bytes=start-end » (une seule plage supportée,
 * cas d'usage réel des lecteurs <audio>). Retourne null si absent/invalide.
 */
function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const [, rawStart, rawEnd] = m;
  if (rawStart === '' && rawEnd === '') return null;
  let start: number;
  let end: number;
  if (rawStart === '') {
    // suffixe « bytes=-N » : les N derniers octets
    const n = Number.parseInt(rawEnd, 10);
    if (!Number.isFinite(n) || n <= 0) return null;
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number.parseInt(rawStart, 10);
    end = rawEnd === '' ? size - 1 : Number.parseInt(rawEnd, 10);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  }
  if (start >= size || start > end) return null; // plage hors bornes → 416 géré par l'appelant
  return { start, end: Math.min(end, size - 1) };
}

export async function GET(
  req: NextRequest,
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
    const ext = (name.split('.').pop() ?? '').toLowerCase() as VoiceAudioExt;
    if (!(VOICE_ALLOWED_EXT as readonly string[]).includes(ext)) {
      return NextResponse.json({ error: 'Format audio non supporté' }, { status: 404 });
    }
    const contentType = VOICE_CONTENT_TYPES[ext] ?? 'application/octet-stream';

    for (const dir of resolveUploadDirs()) {
      const filePath = join(dir, name);
      try {
        const info = await stat(filePath);
        if (!info.isFile()) continue;
        const bytes = await readFile(filePath);
        const size = bytes.byteLength;
        const baseHeaders: Record<string, string> = {
          'Content-Type': contentType,
          // Audio privé (voix d'invités) : cache navigateur court, jamais
          // de cache intermédiaire/CDN.
          'Cache-Control': 'private, max-age=3600',
          'X-Content-Type-Options': 'nosniff',
          'Accept-Ranges': 'bytes',
        };
        const range = parseRange(req.headers.get('range'), size);
        if (range) {
          const slice = bytes.subarray(range.start, range.end + 1);
          return new NextResponse(new Uint8Array(slice), {
            status: 206,
            headers: {
              ...baseHeaders,
              'Content-Length': String(slice.byteLength),
              'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
            },
          });
        }
        return new NextResponse(new Uint8Array(bytes), {
          status: 200,
          headers: { ...baseHeaders, 'Content-Length': String(size) },
        });
      } catch {
        // Fichier absent dans ce répertoire → candidat suivant.
      }
    }

    return NextResponse.json(
      { error: 'Audio introuvable (fichier expiré ou supprimé)' },
      { status: 404 },
    );
  } catch (error) {
    console.error('[uploads/voice GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
