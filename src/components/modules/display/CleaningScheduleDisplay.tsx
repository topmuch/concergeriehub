'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Sparkles } from 'lucide-react';

interface CleaningScheduleDisplayProps {
  content: Record<string, any>;
  qrCodeId?: string;
  qrName?: string;
}

export function CleaningScheduleDisplay({ content, qrCodeId, qrName }: CleaningScheduleDisplayProps) {
  const title = content?.title || 'Plan de nettoyage';
  const body = content?.body || 'Aucune tâche de nettoyage disponible.';

  const tasks = body
    .split('\n')
    .map((line: string) => line.trim())
    .filter((line: string) => line.length > 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white dark:from-sky-950/20 dark:to-background">
      <div className="mx-auto max-w-md px-4 py-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-500 shadow-lg shadow-sky-500/25">
            <Sparkles className="h-8 w-8 text-white" />
          </div>
          {qrName && <p className="text-sm text-muted-foreground">{qrName}</p>}
        </div>

        {/* Schedule Card */}
        <Card className="border-2 border-sky-100 dark:border-sky-900/30">
          <CardContent className="p-6">
            <h1 className="mb-6 text-2xl font-bold text-sky-900 dark:text-sky-100">
              {title}
            </h1>

            <div className="rounded-xl bg-sky-50 dark:bg-sky-950/30 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-sky-500" />
                <p className="text-xs font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">
                  Tâches
                </p>
              </div>

              <ul className="space-y-2">
                {tasks.map((task: string, index: number) => (
                  <li
                    key={index}
                    className="flex items-start gap-3 rounded-lg bg-white dark:bg-sky-950/50 p-3 shadow-sm"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-200 dark:bg-sky-800 text-xs font-bold text-sky-700 dark:text-sky-300">
                      {index + 1}
                    </span>
                    <span className="text-sm leading-relaxed text-sky-800 dark:text-sky-200">
                      {task}
                    </span>
                  </li>
                ))}
              </ul>
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
