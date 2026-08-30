'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { List, ShoppingCart } from 'lucide-react';

interface ShoppingListItem {
  text: string;
  checked: boolean;
}

interface ShoppingListDisplayProps {
  content: Record<string, any>;
  qrCodeId?: string;
  qrName?: string;
}

export function ShoppingListDisplay({ content, qrCodeId, qrName }: ShoppingListDisplayProps) {
  const title = content?.title || 'Liste de courses';
  const body = content?.body || '';
  const items: ShoppingListItem[] = Array.isArray(content?.items) ? content.items : [];

  const checkedCount = items.filter((item) => item.checked).length;
  const totalCount = items.length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-lime-50 to-white dark:from-lime-950/20 dark:to-background">
      <div className="mx-auto max-w-md px-4 py-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-lime-500 shadow-lg shadow-lime-500/25">
            <ShoppingCart className="h-8 w-8 text-white" />
          </div>
          {qrName && <p className="text-sm text-muted-foreground">{qrName}</p>}
        </div>

        {/* Title Card */}
        <Card className="mb-4 border-2 border-lime-100 dark:border-lime-900/30">
          <CardContent className="p-6">
            <h1 className="mb-1 text-2xl font-bold text-lime-900 dark:text-lime-100">
              {title}
            </h1>
            {totalCount > 0 && (
              <p className="text-sm text-lime-600 dark:text-lime-400">
                {checkedCount} / {totalCount} article{totalCount > 1 ? 's' : ''} cochés
              </p>
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
          <Card className="border-2 border-lime-100 dark:border-lime-900/30">
            <CardContent className="p-6">
              <div className="mb-3 flex items-center gap-2">
                <List className="h-4 w-4 text-lime-500" />
                <p className="text-xs font-semibold uppercase tracking-wider text-lime-600 dark:text-lime-400">
                  Articles
                </p>
              </div>

              <ul className="space-y-2">
                {items.map((item, index) => (
                  <li
                    key={index}
                    className="flex items-center gap-3 rounded-lg bg-lime-50 dark:bg-lime-950/30 p-3"
                  >
                    <Checkbox
                      checked={!!item.checked}
                      disabled
                      className="data-[state=checked]:bg-lime-600 data-[state=checked]:border-lime-600"
                    />
                    <span
                      className={`text-sm leading-relaxed ${
                        item.checked
                          ? 'text-muted-foreground line-through'
                          : 'text-lime-800 dark:text-lime-200'
                      }`}
                    >
                      {item.text || 'Article sans nom'}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-2 border-lime-100 dark:border-lime-900/30">
            <CardContent className="p-6 text-center">
              <p className="text-sm text-muted-foreground">
                Aucun article dans la liste.
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
