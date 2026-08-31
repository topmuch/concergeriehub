import type { Metadata, Viewport } from 'next';
import { db } from '@/lib/db';
import { GuestApp } from '@/components/guest-app/guest-app';
import { GuestScope } from '@/components/guest-app/guest-scope';
import { ServiceWorkerRegistrar } from '@/components/guest-app/sw-registrar';

// =============================================================
// ÉTAPE 16 (V3) — APP INVITÉE PWA : /app/hub/[slug]/guest
// Expérience "comme une app" sans téléchargement :
//   • manifest DYNAMIQUE (nom + icône = logement, ex: "Loft
//     Canal Saint-Martin") via generateMetadata
//   • Service Worker → guidebook / règles / Wi-Fi hors-ligne
//   • bottom nav + transitions, dark mode automatique
// Le slug est celui de la plaque QR (V1) OU du bien (V2).
// =============================================================

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Résout le bien (plaque V1 → bien V2) pour nommer l'app installée. */
async function resolvePropertyName(slug: string): Promise<string | null> {
  try {
    const plaque = await db.physicalQrCode.findUnique({
      where: { hubSlug: slug },
      select: { propertyId: true, isClaimed: true },
    });
    if (plaque?.isClaimed && plaque.propertyId) {
      const p = await db.property.findUnique({
        where: { id: plaque.propertyId },
        select: { name: true },
      });
      if (p) return p.name;
    }
    if (!plaque) {
      const property = await db.property.findUnique({
        where: { qrHubSlug: slug },
        select: { name: true },
      });
      if (property) return property.name;
    }
  } catch {
    /* fallback silencieux → titre générique */
  }
  return null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const name = (await resolvePropertyName(slug)) || 'Guide digital';
  const encoded = encodeURIComponent(slug);

  return {
    title: `${name} — Guide digital`,
    description: `Wi-Fi, guidebook, services et contact hôte pour ${name}. Ajoutez l'app à votre écran d'accueil — fonctionne même hors-ligne.`,
    manifest: `/api/public/app-manifest?slug=${encoded}`,
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: name,
    },
    icons: {
      icon: `/api/public/app-icon?slug=${encoded}&size=192`,
      apple: `/api/public/app-icon?slug=${encoded}&size=180`,
    },
    robots: { index: false },
  };
}

export const viewport: Viewport = {
  themeColor: '#059669',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default async function GuestAppPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;
  const bookingParam = typeof sp.b === 'string' ? sp.b : undefined;

  return (
    <GuestScope>
      <ServiceWorkerRegistrar />
      <GuestApp slug={slug} initialBookingId={bookingParam} />
    </GuestScope>
  );
}
