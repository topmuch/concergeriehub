'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Zap } from 'lucide-react';

interface EnergyMonitorDisplayProps {
  content: Record<string, any>;
  qrCodeId?: string;
  qrName?: string;
}

export function EnergyMonitorDisplay({ content, qrCodeId, qrName }: EnergyMonitorDisplayProps) {
  const title = content?.title || 'Suivi énergétique';
  const body = content?.body || 'Aucune note disponible.';

  return (
    <div className="min-h-screen bg-gradient-to-b from-cyan-50 to-white dark:from-cyan-950/20 dark:to-background">
      <div className="mx-auto max-w-md px-4 py-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-500 shadow-lg shadow-cyan-500/25">
            <Zap className="h-8 w-8 text-white" />
          </div>
          {qrName && <p className="text-sm text-muted-foreground">{qrName}</p>}
        </div>

        {/* Energy Notes Card */}
        <Card className="border-2 border-cyan-100 dark:border-cyan-900/30">
          <CardContent className="p-6">
            <h1 className="mb-6 text-2xl font-bold text-cyan-900 dark:text-cyan-100">
              {title}
            </h1>
            <div className="rounded-xl bg-cyan-50 dark:bg-cyan-950/30 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Zap className="h-4 w-4 text-cyan-500" />
                <p className="text-xs font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
                  Notes
                </p>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-cyan-800 dark:text-cyan-200">
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
