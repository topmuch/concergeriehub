// =============================================================
// v5.10 — LOADER FICHIER DES ASSETS MARQUE (SERVER ONLY, pdfkit).
// Les générateurs server-side (mode d'emploi, facture de commission,
// états des lieux standalone, bouclier) dessinent le logo officiel
// via doc.image(buffer). Lecture FICHIER (pas HTTP) — robuste en mode
// standalone où public/ n'est pas servi mais reste lisible. Deux
// candidats (repo + .next/standalone) ; résultat en cache par process ;
// null si absent (le PDF est rendu sans logo, ne plante jamais).
// =============================================================
import { readFile } from 'fs/promises';
import path from 'path';

const LOGO_BLUE_REL = path.join('brand', 'roomscan-logo.png');
const LOGO_WHITE_REL = path.join('brand', 'roomscan-logo-white.png');

const cache = new Map<string, Buffer | null>();

async function loadBrandFile(rel: string): Promise<Buffer | null> {
  if (cache.has(rel)) return cache.get(rel) ?? null;
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, 'public', rel),
    path.join(cwd, '.next', 'standalone', 'public', rel),
  ];
  let result: Buffer | null = null;
  for (const p of candidates) {
    try {
      const buf = await readFile(p);
      if (buf.length > 0) {
        result = buf;
        break;
      }
    } catch {
      // fichier absent — candidat suivant
    }
  }
  cache.set(rel, result);
  return result;
}

/** Logo RoomScan officiel BLEU (fonds clairs) — 754×283 transparent. */
export function loadRoomscanLogoBlue(): Promise<Buffer | null> {
  return loadBrandFile(LOGO_BLUE_REL);
}

/** Logo RoomScan officiel BLANC (fonds de couleur / sombres). */
export function loadRoomscanLogoWhite(): Promise<Buffer | null> {
  return loadBrandFile(LOGO_WHITE_REL);
}
