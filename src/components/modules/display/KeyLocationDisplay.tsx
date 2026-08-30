'use client';

import { Card, CardContent } from '@/components/ui/card';
import { KeyRound, MapPin } from 'lucide-react';

interface KeyLocationDisplayProps {
  content: Record<string, any>;
  qrCodeId?: string;
  qrName?: string;
}

export function KeyLocationDisplay({ content, qrCodeId, qrName }: KeyLocationDisplayProps) {
  const title = content?.title || 'Localisation des clés';
  const body = content?.body || 'Aucune information de localisation disponible.';

  return (
    <div className="min-h-screen bg-gradient-to-b from-violet-50 to-white dark:from-violet-950/20 dark:to-background">
      <div className="mx-auto max-w-md px-4 py-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500 shadow-lg shadow-violet-500/25">
            <KeyRound className="h-8 w-8 text-white" />
          </div>
          {qrName && <p className="text-sm text-muted-foreground">{qrName}</p>}
        </div>

        {/* Key Location Card */}
        <Card className="border-2 border-violet-100 dark:border-violet-900/30">
          <CardContent className="p-6">
            <h1 className="mb-6 text-center text-2xl font-bold text-violet-900 dark:text-violet-100">
              {title}
            </h1>
            <div className="rounded-xl bg-violet-50 dark:bg-violet-950/30 p-4">
              <div className="mb-3 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-violet-500" />
                <p className="text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                  Emplacement
                </p>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-violet-800 dark:text-violet-200">
                {body}
              </p>
            </div>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          QR Domotik &middot; Scannez le QR pour accéder
        </p>
      </div>
    </div>
  );
}
