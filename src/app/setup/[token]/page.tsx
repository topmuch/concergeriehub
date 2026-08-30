'use client';

import { Suspense } from 'react';
import { SessionProvider } from 'next-auth/react';
import { SetupPageContent } from './setup-content';

export default function SetupPage(props: { params: Promise<{ token: string }> }) {
  return (
    <SessionProvider>
      <Suspense
        fallback={
          <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="h-12 w-12 rounded-xl border border-slate-200 bg-white flex items-center justify-center shadow-sm">
                <span className="text-xl">🗝️</span>
              </div>
              <p className="text-sm text-slate-500 font-semibold">Chargement...</p>
            </div>
          </div>
        }
      >
        <SetupPageContent params={props.params} />
      </Suspense>
    </SessionProvider>
  );
}
