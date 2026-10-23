import type { Metadata } from 'next';
import { Download, MonitorSmartphone } from 'lucide-react';
import { PwaInstallBanner } from '@/components/pwa/pwa-install-banner';
import { PwaInstallButton } from '@/components/pwa/pwa-install-button';

// FIX-CSP-PROD — page dynamique : jamais prerendue, la session et
// l'entitlement EDL sont garantis par src/app/inspection/(shield)/layout.tsx
// (aucune garde dupliquee ici).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Application mobile — Inventaire | RoomScan',
  description:
    'Installez l’application RoomScan sur votre téléphone : bouton d’installation direct, QR code et guide Android / iPhone pas à pas.',
};

// v4.160 — onglet « Application mobile » du dashboard Inventaire
// (/inspection/application, SOUS « FAQ » dans la sidebar).
// v5.0 — demande client : l'onglet ne proposait pas l'installation
// (le QR renvoyait simplement vers le site). Ajout du VRAI bouton
// d'installation PWA (prompt natif Android/Chrome via
// beforeinstallprompt) + détection « app déjà installée » + consigne
// claire pour iOS. Carte QR conservée + guide Android / iPhone.
export default function ApplicationShieldPage() {
  return (
    <div className="p-4 sm:p-6">
      <div className="mx-auto w-full max-w-3xl space-y-5">
        {/* ── En-tête ── */}
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#C41E3A] dark:text-[#ff5a76]">
            Mobile
          </p>
          <h1 className="luxe-header-title">Application mobile</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Installez RoomScan comme une vraie application sur votre téléphone — elle fonctionne
            même en mauvaise connexion, idéal sur le terrain.
          </p>
        </div>

        {/* ── v5.0 : VRAI bouton d'installation (prompt natif) ── */}
        <section aria-label="Installation rapide">
          <PwaInstallButton />
        </section>

        {/* ── Carte QR (PwaInstallBanner — enregistre aussi le Service Worker) ── */}
        <PwaInstallBanner variant="qr-card" />

        {/* ── Guide manuel Android / iPhone ── */}
        <section aria-label="Installation manuelle" className="grid gap-4 sm:grid-cols-2">
          <div className="luxe-card p-5">
            <p className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              <MonitorSmartphone className="h-4 w-4 text-[#055492] dark:text-[#1173c7]" aria-hidden="true" />
              Android (Chrome)
            </p>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
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
          <div className="luxe-card p-5">
            <p className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              <MonitorSmartphone className="h-4 w-4 text-[#055492] dark:text-[#1173c7]" aria-hidden="true" />
              iPhone / iPad (Safari)
            </p>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
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

        <p className="text-center text-xs leading-relaxed text-slate-400 dark:text-slate-500">
          L&apos;application s&apos;ouvre sans barre de navigateur, garde votre session et reste
          utilisable hors connexion sur les écrans de capture (check-in / check-out).
        </p>
        <p className="flex items-center justify-center gap-1.5 text-center text-xs font-semibold text-[#055492] dark:text-[#1173c7]">
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Astuce : le bouton « Installer maintenant » ci-dessus lance l&apos;installation directe
          sur Android.
        </p>
      </div>
    </div>
  );
}
