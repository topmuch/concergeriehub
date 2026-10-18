'use client';

import { Suspense } from 'react';
import { HubPageContent } from './hub-content';

export default function HubPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense
      fallback={
        // Fond clair premium : cohérent avec l'écran d'entrée
        // « Airbnb Pro clair » (hero stone + cartes blanches) qui suit.
        <div className="min-h-screen bg-stone-50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-white border border-stone-200 air-shadow flex items-center justify-center animate-pulse">
              <span className="text-xl">🗝️</span>
            </div>
            <p className="text-sm text-stone-500 font-semibold">Chargement du Hub...</p>
          </div>
        </div>
      }
    >
      <HubPageContent params={params} />
    </Suspense>
  );
}
