'use client';

import { Suspense } from 'react';
import { HubPageContent } from './hub-content';

export default function HubPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center">
              <span className="text-xl">🏠</span>
            </div>
            <p className="text-sm text-slate-500 font-semibold">Chargement du Hub...</p>
          </div>
        </div>
      }
    >
      <HubPageContent params={params} />
    </Suspense>
  );
}
