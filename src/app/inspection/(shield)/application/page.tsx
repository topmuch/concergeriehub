import type { Metadata } from 'next';
import { MonitorSmartphone } from 'lucide-react';
import { PwaInstallBanner } from '@/components/pwa/pwa-install-banner';

// FIX-CSP-PROD — page dynamique : jamais prerendue, la session et
// l'entitlement EDL sont garantis par src/app/inspection/(shield)/layout.tsx
// (aucune garde dupliquee ici).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Application mobile — Bouclier | RoomScan',
  description:
    'Installez l’application RoomScan sur votre téléphone : QR code d’installation et guide Android / iPhone pas à pas.',
};

// v4.160 — onglet « Application mobile » du dashboard Bouclier
// (/inspection/application, SOUS « FAQ » dans la sidebar) : carte
// QR PWA (Task 42-a) + guide d'installation manuelle Android/iOS.
export default function ApplicationShieldPage() {
  return (
    <div className="p-4 sm:p-6">
      <div className="mx-auto w-full max-w-3xl space-y-5">
        {/* ── En-tête ── */}
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#C41E3A]">
            Mobile
          </p>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Application mobile
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Installez RoomScan comme une vraie application sur votre téléphone — elle fonctionne
            même en mauvaise connexion, idéal sur le terrain.
          </p>
        </div>

        {/* ── Carte QR (PwaInstallBanner — enregistre aussi le Service Worker) ── */}
        <PwaInstallBanner variant="qr-card" />

        {/* ── Guide manuel Android / iPhone ── */}
        <section aria-label="Installation manuelle" className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <MonitorSmartphone className="h-4 w-4 text-[#1e3a8a]" aria-hidden="true" />
              Android (Chrome)
            </p>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-slate-600">
              <li>
                Ouvrez <strong>roomscan.pro</strong> dans Chrome.
              </li>
              <li>
                Touchez le menu <strong>⋮</strong> en haut à droite.
              </li>
              <li>
                Choisissez <strong>« Installer l&apos;application »</strong> ou{' '}
                <strong>« Ajouter à l&apos;écran d&apos;accueil »</strong>.
              </li>
            </ol>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <MonitorSmartphone className="h-4 w-4 text-[#1e3a8a]" aria-hidden="true" />
              iPhone / iPad (Safari)
            </p>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-slate-600">
              <li>
                Ouvrez <strong>roomscan.pro</strong> dans Safari.
              </li>
              <li>
                Touchez le bouton <strong>Partager</strong> (carré avec flèche).
              </li>
              <li>
                Choisissez <strong>« Sur l&apos;écran d&apos;accueil »</strong> puis{' '}
                <strong>Ajouter</strong>.
              </li>
            </ol>
          </div>
        </section>

        <p className="text-center text-xs leading-relaxed text-slate-400">
          L&apos;application s&apos;ouvre sans barre de navigateur, garde votre session et reste
          utilisable hors connexion sur les écrans de capture (check-in / check-out).
        </p>
      </div>
    </div>
  );
}
