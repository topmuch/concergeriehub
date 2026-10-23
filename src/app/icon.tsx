import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// =============================================================
// PWA (Task 42-a) — Icône applicative dynamique Roomscan
//
// v5.9 — NOUVEAU logo officiel client : l'icône affiche désormais
// l'EMBLÈME RÉEL (maison au balcon, public/brand/roomscan-icon-white.png,
// embarqué en base64) sur un carré arrondi bleu logo #055492.
//
// Deux tailles générées à la volée via generateImageMetadata :
//   · /icon/192 → 192×192 (raccourci Android / onglet)
//   · /icon/512 → 512×512 (splash + écran d'accueil)
// Satori (next/og) = flexbox + <img> data URL → simple et robuste.
// Remarque : public/icon-512.png (régénéré aux couleurs du logo,
// notifications push du Service Worker) — cette route est l'icône
// « install » moderne.
// =============================================================

export const contentType = 'image/png';

const BRAND_BLUE = '#055492';

export async function generateImageMetadata() {
  return [
    {
      id: '192',
      size: { width: 192, height: 192 },
      contentType: 'image/png',
      alt: 'Roomscan',
    },
    {
      id: '512',
      size: { width: 512, height: 512 },
      contentType: 'image/png',
      alt: 'Roomscan',
    },
  ];
}

// Next 16 : les props du segment dynamique sont asynchrones (id est
// une Promise) → on attend la valeur (await sur une string = no-op).
export default async function Icon(props: { id: string | Promise<string> }) {
  const id = await props.id;
  const size = id === '512' ? 512 : 192;

  // Emblème réel blanc (transparence) embarqué en data URL.
  const png = await readFile(
    path.join(process.cwd(), 'public', 'brand', 'roomscan-icon-white.png'),
  );
  const dataUrl = `data:image/png;base64,${png.toString('base64')}`;

  const emblem = Math.round(size * 0.6);
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: BRAND_BLUE,
          borderRadius: Math.round(size * 0.2),
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL embarqué (Satori), Next/Image non applicable */}
        <img
          src={dataUrl}
          alt="Roomscan"
          width={emblem}
          height={emblem}
          style={{ objectFit: 'contain' }}
        />
      </div>
    ),
    { width: size, height: size },
  );
}
