'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ListChecks, CheckCircle2 } from 'lucide-react';

interface ChecklistItem {
  text: string;
  checked: boolean;
}

interface ChecklistDisplayProps {
  content: Record<string, any>;
  qrCodeId?: string;
  qrName?: string;
}

export function ChecklistDisplay({ content, qrCodeId, qrName }: ChecklistDisplayProps) {
  const title = content?.title || 'Liste de vérification';
  const body = content?.body || '';
  const items: ChecklistItem[] = Array.isArray(content?.items) ? content.items : [];

  const checkedCount = items.filter((item) => item.checked).length;
  const totalCount = items.length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white dark:from-indigo-950/20 dark:to-background">
      <div className="mx-auto max-w-md px-4 py-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500 shadow-lg shadow-indigo-500/25">
            <ListChecks className="h-8 w-8 text-white" />
          </div>
          {qrName && <p className="text-sm text-muted-foreground">{qrName}</p>}
        </div>

        {/* Title Card */}
        <Card className="mb-4 border-2 border-indigo-100 dark:border-indigo-900/30">
          <CardContent className="p-6">
            <h1 className="mb-1 text-2xl font-bold text-indigo-900 dark:text-indigo-100">
              {title}
            </h1>
            {totalCount > 0 && (
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-indigo-100 dark:bg-indigo-900/40">
                  <div
                    className="h-full rounded-full bg-indigo-500 transition-all"
                    style={{ width: `${totalCount > 0 ? (checkedCount / totalCount) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                  {checkedCount}/{totalCount}
                </span>
              </div>
            )}
            {body && (
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {body}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Items Card */}
        {items.length > 0 ? (
          <Card className="border-2 border-indigo-100 dark:border-indigo-900/30">
            <CardContent className="p-6">
              <div className="mb-3 flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-indigo-500" />
                <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                  Tâches
                </p>
              </div>

              <ul className="space-y-2">
                {items.map((item, index) => (
                  <li
                    key={index}
                    className="flex items-center gap-3 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 p-3"
                  >
                    <Checkbox
                      checked={!!item.checked}
                      disabled
                      className="data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                    />
                    <span
                      className={`text-sm leading-relaxed ${
                        item.checked
                          ? 'text-muted-foreground line-through'
                          : 'text-indigo-800 dark:text-indigo-200'
                      }`}
                    >
                      {item.text || 'Tâche sans nom'}
                    </span>
                  </li>
                ))}
              </ul>

              {/* All done message */}
              {checkedCount === totalCount && totalCount > 0 && (
                <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 p-3">
                  <CheckCircle2 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  <p className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
                    Tout est terminé !
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="border-2 border-indigo-100 dark:border-indigo-900/30">
            <CardContent className="p-6 text-center">
              <p className="text-sm text-muted-foreground">
                Aucune tâche dans la liste.
              </p>
            </CardContent>
          </Card>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          QR Domotik &middot; Scannez le QR pour accéder
        </p>
      </div>
    </div>
  );
}
