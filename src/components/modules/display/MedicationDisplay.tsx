'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Pill } from 'lucide-react';

interface MedicationDisplayProps {
  content: Record<string, any>;
  qrCodeId?: string;
  qrName?: string;
}

export function MedicationDisplay({ content, qrCodeId, qrName }: MedicationDisplayProps) {
  const title = content?.title || 'Médicaments';
  const body = content?.body || 'Aucune instruction disponible.';

  return (
    <div className="min-h-screen bg-gradient-to-b from-rose-50 to-white dark:from-rose-950/20 dark:to-background">
      <div className="mx-auto max-w-md px-4 py-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500 shadow-lg shadow-rose-500/25">
            <Pill className="h-8 w-8 text-white" />
          </div>
          {qrName && <p className="text-sm text-muted-foreground">{qrName}</p>}
        </div>

        {/* Medication Card */}
        <Card className="border-2 border-rose-100 dark:border-rose-900/30">
          <CardContent className="p-6">
            <h1 className="mb-6 text-center text-2xl font-bold text-rose-900 dark:text-rose-100">
              {title}
            </h1>
            <div className="rounded-xl bg-rose-50 dark:bg-rose-950/30 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Pill className="h-4 w-4 text-rose-500" />
                <p className="text-xs font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                  Instructions
                </p>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-rose-800 dark:text-rose-200">
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
