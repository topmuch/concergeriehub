'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExternalLink, Globe, ArrowUpRight } from 'lucide-react';

export interface LinkContent {
  url: string;
  title: string;
  description: string;
}

interface LinkDisplayProps {
  content: LinkContent;
  qrName?: string;
}

export function LinkDisplay({ content, qrName }: LinkDisplayProps) {
  let hostname = '';
  try {
    hostname = new URL(content.url).hostname;
  } catch {
    hostname = content.url;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-blue-950/20 dark:to-background">
      <div className="mx-auto max-w-md px-4 py-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500 shadow-lg shadow-blue-500/25">
            <Globe className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold">{content.title || 'Lien externe'}</h1>
          {qrName && <p className="mt-1 text-sm text-muted-foreground">{qrName}</p>}
        </div>

        {/* Link Preview Card */}
        <Card className="mb-6 border-2 border-blue-100 dark:border-blue-900/30">
          <CardContent className="p-6">
            {/* Favicon + hostname */}
            <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-muted">
                <Globe className="h-3 w-3" />
              </div>
              {hostname}
            </div>

            {/* Title */}
            {content.title && (
              <h2 className="mb-2 text-lg font-semibold">{content.title}</h2>
            )}

            {/* Description */}
            {content.description && (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {content.description}
              </p>
            )}

            {/* URL */}
            <div className="mt-4 rounded-lg bg-muted/50 p-3">
              <p className="truncate font-mono text-xs text-muted-foreground">{content.url}</p>
            </div>
          </CardContent>
        </Card>

        {/* Action Button */}
        <a href={content.url} target="_blank" rel="noopener noreferrer" className="block">
          <Button
            className="w-full h-12 text-base font-semibold bg-blue-600 hover:bg-blue-700"
            size="lg"
          >
            <ExternalLink className="mr-2 h-5 w-5" />
            Ouvrir le lien
            <ArrowUpRight className="ml-2 h-4 w-4" />
          </Button>
        </a>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          QR Domotik &middot; Scannez le QR pour accéder
        </p>
      </div>
    </div>
  );
}
