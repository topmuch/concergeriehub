// =============================================================
// /api/audio/[file] — v5.13 « DIFFUSION DES MP3 PRÉ-GÉNÉRÉS »
//
// Pourquoi une route API et pas /audio/... en statique ? En
// production standalone (node .next/standalone/server.js, cwd=/app),
// les fichiers écrits AU RUNTIME dans public/ ne sont PAS servis par
// le serveur Next (qui expose .next/standalone/public du build).
// Cette route lit directement le dossier audio courant
// (ttsAudioDir()) → le guidage vocal « Denise » (et tout futur MP3
// pré-généré) est toujours diffusé, quel que soit l'environnement.
//
// Sécurité : nom de fichier STRICTEMENT plat (^[A-Za-z0-9._-]+\.mp3$)
// — aucune traversée de chemin possible ; fichiers ~100 Ko lus en
// mémoire ; cache immutable (le nom contient l'empreinte du texte).
// =============================================================
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { ttsAudioDir } from '@/lib/tts-service';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;
  if (!/^[A-Za-z0-9._-]+\.mp3$/.test(file)) {
    return new NextResponse('Not found', { status: 404 });
  }
  const dir = ttsAudioDir();
  const filePath = path.join(dir, file);
  if (!filePath.startsWith(dir + path.sep) || !fs.existsSync(filePath)) {
    return new NextResponse('Not found', { status: 404 });
  }
  try {
    const data = fs.readFileSync(filePath);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(data.length),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
