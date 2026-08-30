'use client';

import { Card, CardContent } from '@/components/ui/card';
import { StickyNote } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

interface NoteDisplayProps {
  content: Record<string, any>;
  qrCodeId?: string;
  qrName?: string;
}

export function NoteDisplay({ content, qrCodeId, qrName }: NoteDisplayProps) {
  const title = content?.title || undefined;
  const body = content?.body || '';
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500 shadow-lg shadow-amber-500/25">
          <StickyNote className="h-8 w-8 text-white" />
        </div>
        {qrName && <p className="text-sm text-muted-foreground">{qrName}</p>}
      </div>

      {/* Note Card */}
      <Card className="border-2 border-amber-200 dark:border-amber-900/30 bg-amber-50/50 dark:bg-amber-950/10">
        <CardContent className="p-6">
          <h1 className="mb-6 text-center text-2xl font-bold text-amber-900 dark:text-amber-100">
            {title || t('note')}
          </h1>
          <p className="whitespace-pre-wrap text-center text-lg leading-relaxed text-amber-800 dark:text-amber-200">
            {body}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
