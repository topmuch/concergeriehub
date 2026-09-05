import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// =============================================================
// SEO — Carte Open Graph dynamique (1200×630, PNG)
//
// Injectée automatiquement en og:image sur toutes les routes
// (convention Next.js App Router). Rendue par Satori via next/og :
// flexbox uniquement (pas de CSS grid), pas de filter:blur —
// les halos sont des cercles pleins en opacité.
// =============================================================

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt =
  'Conciergerie Hub — Wi-Fi, guidebook et services en 1 scan pour vos invités';

// Motif QR décoratif déterministe (9×9) : coins « finder » stylisés
// + trame pseudo-aléatoire fixe. Purement décoratif, non scannable.
function qrPattern(n = 9): boolean[][] {
  const finder = [
    [true, true, true],
    [true, false, true],
    [true, true, true],
  ];
  const cells: boolean[][] = [];
  for (let r = 0; r < n; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < n; c++) {
      const topLeft = r < 3 && c < 3;
      const topRight = r < 3 && c >= n - 3;
      const bottomLeft = r >= n - 3 && c < 3;
      if (topLeft || topRight || bottomLeft) {
        const fr = topLeft ? 0 : topRight ? 0 : n - 3;
        const fc = topLeft || bottomLeft ? 0 : n - 3;
        row.push(finder[r - fr][c - fc]);
      } else {
        row.push((r * 7 + c * 13) % 3 === 0 || (r + c) % 4 === 0);
      }
    }
    cells.push(row);
  }
  return cells;
}

// Police de la landing (Plus Jakarta Sans) chargée depuis les TTF
// locaux : Satori ne synthétise PAS le gras — sans font dédiée, le
// titre retombe en regular (Noto Sans bundle).
async function loadFonts() {
  const dir = path.join(process.cwd(), 'src', 'assets', 'fonts');
  const [regular, extraBold] = await Promise.all([
    readFile(path.join(dir, 'PlusJakartaSans-Regular.ttf')),
    readFile(path.join(dir, 'PlusJakartaSans-ExtraBold.ttf')),
  ]);
  return [
    { name: 'Jakarta', data: regular, weight: 400 as const, style: 'normal' as const },
    { name: 'Jakarta', data: extraBold, weight: 800 as const, style: 'normal' as const },
  ];
}

export default async function OpengraphImage() {
  const fonts = await loadFonts();
  const cells = qrPattern();

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'row',
          backgroundColor: '#f8fafc',
          fontFamily: 'Jakarta',
          position: 'relative',
        }}
      >
        {/* Halos décoratifs (pas de blur en Satori → opacités) */}
        <div
          style={{
            position: 'absolute',
            width: 480,
            height: 480,
            borderRadius: 9999,
            backgroundColor: 'rgba(37, 99, 235, 0.10)',
            top: -180,
            left: -140,
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            width: 420,
            height: 420,
            borderRadius: 9999,
            backgroundColor: 'rgba(5, 150, 105, 0.10)',
            bottom: -200,
            right: 320,
            display: 'flex',
          }}
        />

        {/* Colonne texte */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '0 0 0 72px',
            width: 640,
          }}
        >
          {/* Pill marque */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              backgroundColor: '#ffffff',
              borderRadius: 9999,
              padding: '12px 24px',
              border: '1px solid #e2e8f0',
              alignSelf: 'flex-start',
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: 7,
                background: 'linear-gradient(135deg, #2563eb 0%, #059669 100%)',
                display: 'flex',
              }}
            />
            <div style={{ fontSize: 26, fontWeight: 800, color: '#0f172a' }}>
              Conciergerie Hub
            </div>
          </div>

          {/* Titre */}
          <div
            style={{
              display: 'flex',
              fontSize: 62,
              fontWeight: 800,
              lineHeight: 1.12,
              color: '#0f172a',
              marginTop: 34,
            }}
          >
            Transformez chaque séjour en expérience 5 étoiles
          </div>

          {/* Sous-titre */}
          <div
            style={{
              display: 'flex',
              fontSize: 29,
              lineHeight: 1.4,
              color: '#475569',
              marginTop: 24,
            }}
          >
            Wi-Fi, guidebook &amp; services en 1 scan — sans application pour vos invités.
          </div>

          {/* Badges */}
          <div style={{ display: 'flex', gap: 14, marginTop: 34 }}>
            <div
              style={{
                display: 'flex',
                fontSize: 22,
                fontWeight: 800,
                color: '#ffffff',
                background: 'linear-gradient(135deg, #2563eb 0%, #059669 100%)',
                borderRadius: 9999,
                padding: '12px 26px',
              }}
            >
              Essai gratuit
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: 22,
                fontWeight: 800,
                color: '#334155',
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 9999,
                padding: '12px 26px',
              }}
            >
              Opérationnel en 3 minutes
            </div>
          </div>
        </div>

        {/* Colonne plaque QR */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 560,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              backgroundColor: '#ffffff',
              borderRadius: 36,
              border: '1px solid #e2e8f0',
              padding: '40px 48px',
              boxShadow: '0 24px 60px rgba(15, 23, 42, 0.12)',
            }}
          >
            {/* Motif QR */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {cells.map((row, ri) => (
                <div key={ri} style={{ display: 'flex' }}>
                  {row.map((filled, ci) => (
                    <div
                      key={ci}
                      style={{
                        width: 34,
                        height: 34,
                        backgroundColor: filled ? '#0f172a' : '#ffffff',
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: 23,
                fontWeight: 400,
                color: '#475569',
                marginTop: 26,
              }}
            >
              1 scan → Wi-Fi instantané
            </div>
            {/* Barre gradient */}
            <div
              style={{
                display: 'flex',
                width: 280,
                height: 8,
                borderRadius: 9999,
                background: 'linear-gradient(90deg, #2563eb 0%, #059669 100%)',
                marginTop: 22,
              }}
            />
          </div>
        </div>
      </div>
    ),
    { ...size, fonts }
  );
}
