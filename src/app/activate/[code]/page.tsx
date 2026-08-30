'use client';

import { Suspense } from 'react';
import { SessionProvider } from 'next-auth/react';
import { ActivatePageContent } from './activate-content';

function ActivateFallback() {
  return (
    <div className="min-h-screen bg-[#8B5CF6] flex items-center justify-center">
      <div className="h-10 w-10 border-4 border-white/30 border-t-white rounded-full animate-spin" />
    </div>
  );
}

export default function ActivatePage(props: { params: Promise<{ code: string }> }) {
  return (
    <SessionProvider>
      <Suspense fallback={<ActivateFallback />}>
        <ActivatePageContent params={props.params} />
      </Suspense>
    </SessionProvider>
  );
}
