'use client';

import { Card, CardContent } from '@/components/ui/card';
import { UtensilsCrossed } from 'lucide-react';

interface MealPlannerDisplayProps {
  content: Record<string, any>;
  qrCodeId?: string;
  qrName?: string;
}

export function MealPlannerDisplay({ content, qrCodeId, qrName }: MealPlannerDisplayProps) {
  const title = content?.title || 'Menu de la semaine';
  const body = content?.body || 'Aucun menu disponible.';

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white dark:from-orange-950/20 dark:to-background">
      <div className="mx-auto max-w-md px-4 py-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500 shadow-lg shadow-orange-500/25">
            <UtensilsCrossed className="h-8 w-8 text-white" />
          </div>
          {qrName && <p className="text-sm text-muted-foreground">{qrName}</p>}
        </div>

        {/* Menu Card */}
        <Card className="border-2 border-orange-100 dark:border-orange-900/30">
          <CardContent className="p-6">
            <h1 className="mb-6 text-2xl font-bold text-orange-900 dark:text-orange-100">
              {title}
            </h1>
            <div className="rounded-xl bg-orange-50 dark:bg-orange-950/30 p-4">
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-orange-800 dark:text-orange-200">
                {body}
              </pre>
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
