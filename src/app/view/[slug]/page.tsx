'use client';

import { Suspense } from 'react';
import { ViewPageContent } from './view-content';

export default function ViewPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#8B5CF6] flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 rounded-[8px] border-2 border-black bg-white flex items-center justify-center shadow-[2px_2px_0_rgba(0,0,0,0.08)]">
              <span className="text-lg animate-pulse">📱</span>
            </div>
            <p className="text-sm text-white/80 font-bold">Chargement...</p>
          </div>
        </div>
      }
    >
      <ViewPageContent params={params} />
    </Suspense>
  );
}
