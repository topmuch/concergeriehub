import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { InteractiveDemo } from '@/components/landing/interactive-demo';

// Police landing (spec : Inter ou Plus Jakarta Sans) — scopée à la
// page, n'affecte pas le reste de l'application (Geist global).
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Conciergerie Hub — Transformez chaque séjour en expérience 5 étoiles',
  description:
    'Une seule plaque QR élégante : Wi-Fi, guidebook et services en 1 scan pour vos invités. Vous pilotez tout depuis un dashboard professionnel. Sans application.',
};

// APERÇU ÉTAPE 1/3 — la démo interactive seule, pour validation.
// (L'ancienne page V1 est conservée dans page.tsx.bak ; la landing
// complète arrive à l'ÉTAPE 2 après validation de la démo.)
export default function Home() {
  return (
    <main
      className={`${jakarta.variable} min-h-screen bg-slate-50 bg-gradient-to-br from-blue-50/50 to-emerald-50/50 font-[family-name:var(--font-jakarta)]`}
    >
      <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
        {/* Bandeau de contexte d'aperçu */}
        <div className="mb-10 flex justify-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-600 shadow-sm">
            🛠️ Aperçu — Étape 1/3 : la démo interactive
            <span aria-hidden="true" className="h-1 w-1 rounded-full bg-slate-300" />
            <span className="text-slate-400">landing complète au NEXT</span>
          </span>
        </div>

        {/* Hero de la démo */}
        <div className="mb-12 text-center">
          <h1 className="mx-auto max-w-3xl text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
            Transformez chaque séjour en expérience 5 étoiles.{' '}
            <span className="text-emerald-600">Sans application.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600 sm:text-lg">
            Une seule plaque QR élégante. Vos invités accèdent au Wi-Fi et aux
            services en 1 scan. Vous pilotez tout depuis un dashboard
            professionnel.
          </p>
        </div>

        <InteractiveDemo />
      </div>
    </main>
  );
}
