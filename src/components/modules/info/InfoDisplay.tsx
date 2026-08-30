'use client';

import { Card, CardContent } from '@/components/ui/card';
import { FileText } from 'lucide-react';

export interface InfoContent {
  title: string;
  body: string;
}

interface InfoDisplayProps {
  content: InfoContent;
  qrName?: string;
}

export function InfoDisplay({ content, qrName }: InfoDisplayProps) {
  const renderMarkdown = (md: string) => {
    let html = md
      .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-5 mb-2">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold mt-6 mb-3">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-6 mb-4">$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/_(.+?)_/g, '<em>$1</em>')
      .replace(/^> (.+)$/gm, '<blockquote class="border-l-4 border-violet-300 dark:border-violet-600 pl-4 italic text-muted-foreground my-3">$1</blockquote>')
      .replace(/^---$/gm, '<hr class="my-6 border-border" />')
      .replace(/^- (.+)$/gm, '<li class="ml-6 list-disc">$1</li>')
      .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-6 list-decimal">$2</li>')
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-violet-600 dark:text-violet-400 underline hover:no-underline">$1</a>')
      .replace(/\n/g, '<br />');
    return html;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-violet-50 to-white dark:from-violet-950/20 dark:to-background">
      <div className="mx-auto max-w-lg px-4 py-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500 shadow-lg shadow-violet-500/25">
            <FileText className="h-8 w-8 text-white" />
          </div>
          {qrName && <p className="text-sm text-muted-foreground">{qrName}</p>}
        </div>

        {/* Content Card */}
        <Card className="border-2 border-violet-100 dark:border-violet-900/30">
          <CardContent className="p-6 sm:p-8">
            <h1 className="mb-6 text-2xl font-bold">{content.title}</h1>
            <div
              className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(content.body) }}
            />
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          QR Domotik &middot; Scannez le QR pour accéder
        </p>
      </div>
    </div>
  );
}
