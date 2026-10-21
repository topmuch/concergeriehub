import { ImageResponse } from 'next/og';

// =============================================================
// PWA (Task 42-a) — Icône applicative dynamique Roomscan
//
// Deux tailles générées à la volée via generateImageMetadata :
//   · /icon/192 → 192×192 (raccourci Android / onglet)
//   · /icon/512 → 512×512 (splash + écran d'accueil)
// Design : carré arrondi bleu #1e3a8a, bouclier blanc (SVG inline),
// monogramme « RS ». Satori (next/og) = flexbox uniquement, police
// par défaut (aucun embed) → reste volontairement SIMPLE et ROBUSTE.
// Remarque : public/icon-512.png reste en place (notifications push
// du Service Worker) — cette route est l'icône « install » moderne.
// =============================================================

export const contentType = 'image/png';

const BRAND_BLUE = '#1e3a8a';

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
  const shield = Math.round(size * 0.46);
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: BRAND_BLUE,
          borderRadius: Math.round(size * 0.2),
        }}
      >
        <svg
          width={shield}
          height={shield}
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M12 1.7 4.2 4.6v6.1c0 5.1 3.3 9.5 7.8 10.8 4.5-1.3 7.8-5.7 7.8-10.8V4.6L12 1.7z"
            fill="#ffffff"
          />
        </svg>
        <div
          style={{
            marginTop: Math.round(size * 0.04),
            fontSize: Math.round(size * 0.17),
            letterSpacing: Math.round(size * 0.02),
            color: '#ffffff',
            display: 'flex',
          }}
        >
          RS
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
