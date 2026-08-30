'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { generateQrCode, type QrGeneratorOptions } from '@/lib/qr-generator';

interface QrCodeDisplayProps {
  value: string;
  size?: number;
  logoUrl?: string;
  style?: string;
  fgColor?: string;
  bgColor?: string;
}

// Global cache shared across all instances
const qrCache = new Map<string, string>();

function getCacheKey(options: QrGeneratorOptions): string {
  return JSON.stringify(options);
}

export function QrCodeDisplay({
  value,
  size = 250,
  style = 'classic',
  fgColor = '#1e1b4b',
  bgColor = '#ffffff',
}: QrCodeDisplayProps) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const cacheKey = useMemo(
    () => getCacheKey({ data: value, size, fgColor, bgColor, style: style as QrGeneratorOptions['style'] }),
    [value, size, fgColor, bgColor, style]
  );

  useEffect(() => {
    let cancelled = false;

    async function generate() {
      // Check cache first
      const cached = qrCache.get(cacheKey);
      if (cached) {
        setQrUrl(cached);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(false);
      try {
        const url = await generateQrCode({
          data: value,
          size,
          fgColor,
          bgColor,
          style: style as QrGeneratorOptions['style'],
        });
        if (cancelled) return;
        qrCache.set(cacheKey, url);
        setQrUrl(url);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    generate();
    return () => { cancelled = true; };
  }, [cacheKey, value, size, fgColor, bgColor, style]);

  const handleDownload = useCallback(() => {
    if (!qrUrl) return;
    const a = document.createElement('a');
    a.href = qrUrl;
    a.download = `qr-domotik-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [qrUrl]);

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3">
        <Skeleton className="rounded-xl" style={{ width: size, height: size }} />
      </div>
    );
  }

  if (error || !qrUrl) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/25 bg-muted/10"
        style={{ width: size, height: size }}
      >
        <p className="text-xs text-muted-foreground">Erreur de génération</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="rounded-xl overflow-hidden shadow-lg border"
        style={{ width: size, height: size }}
      >
        <img
          src={qrUrl}
          alt="QR Code"
          width={size}
          height={size}
          className="w-full h-full object-contain"
        />
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleDownload}
        className="gap-2"
      >
        <Download className="h-4 w-4" />
        Télécharger PNG
      </Button>
    </div>
  );
}
