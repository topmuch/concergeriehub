'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Wifi, Copy, Check, Eye, EyeOff, Shield, Radio, Smartphone, Monitor, Apple } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/i18n';

export interface WifiContent {
  ssid: string;
  password: string;
  security: 'WPA' | 'WEP' | 'nopass';
  hidden: boolean;
}

interface WifiDisplayProps {
  content: WifiContent;
  qrName?: string;
}

type Platform = 'android' | 'ios' | 'desktop';

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  if (
    /Android/i.test(ua) ||
    (navigator as any).userAgentData?.platform === 'android'
  ) {
    return 'android';
  }
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return 'ios';
  }
  return 'desktop';
}

export function WifiDisplay({ content, qrName }: WifiDisplayProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const { t } = useTranslation();

  const platform = useMemo(() => detectPlatform(), []);

  const securityLabel =
    content.security === 'WPA'
      ? 'WPA/WPA2/WPA3'
      : content.security === 'WEP'
        ? 'WEP'
        : t('open_network');
  const securityVariant =
    content.security === 'WPA'
      ? ('default' as const)
      : content.security === 'WEP'
        ? ('secondary' as const)
        : ('outline' as const);

  // iOS / generic WiFi URI
  const getWifiUrl = () => {
    return `WIFI:S:${content.ssid};T:${content.security};P:${content.password};H:${content.hidden ? 'true' : 'false'};;`;
  };

  // Android intent deep link
  const getAndroidIntent = () => {
    return `intent://connect#wifi;S:${content.ssid};T:${content.security};P:${content.password};;#Intent;scheme=wifi;action=android.net.wifi.CONNECT;end`;
  };

  const handleConnectIos = () => {
    const wifiUrl = getWifiUrl();
    const link = document.createElement('a');
    link.href = wifiUrl;
    link.click();
    toast.success('Si votre appareil le supporte, la connexion Wi-Fi va s\'ouvrir');
  };

  const handleConnectAndroid = () => {
    const intentUrl = getAndroidIntent();
    const link = document.createElement('a');
    link.href = intentUrl;
    link.click();
  };

  const handleCopyInfo = async () => {
    const info = `SSID: ${content.ssid}\nMot de passe: ${content.password}`;
    try {
      await navigator.clipboard.writeText(info);
      setCopied(true);
      toast.success(t('copied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('error'));
    }
  };

  const handleCopyPassword = async () => {
    try {
      await navigator.clipboard.writeText(content.password);
      setCopied(true);
      toast.success(t('copied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('error'));
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500 shadow-lg shadow-emerald-500/25">
          <Wifi className="h-8 w-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold">{t('guest_wifi')}</h1>
        {qrName && <p className="mt-1 text-sm text-muted-foreground">{qrName}</p>}

        {/* Platform indicator */}
        <div className="mt-3 flex items-center justify-center gap-1.5">
          {platform === 'android' && <Smartphone className="h-4 w-4 text-green-600" />}
          {platform === 'ios' && <Apple className="h-4 w-4 text-neutral-700 dark:text-neutral-300" />}
          {platform === 'desktop' && <Monitor className="h-4 w-4 text-muted-foreground" />}
          <span className="text-xs text-muted-foreground">
            {platform === 'android' ? 'Android' : platform === 'ios' ? 'iOS' : 'Desktop'}
          </span>
        </div>
      </div>

      {/* Network Info Card */}
      <Card className="mb-4 border-2 border-emerald-100 dark:border-emerald-900/30">
        <CardContent className="p-6">
          <div className="space-y-4">
            {/* SSID */}
            <div className="rounded-lg bg-muted/50 p-4">
              <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('network')}</p>
              <p className="text-xl font-bold">{content.ssid}</p>
            </div>

            {/* Security Badge */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{t('security')}</span>
              </div>
              <Badge variant={securityVariant}>{securityLabel}</Badge>
            </div>

            {/* Hidden Network */}
            {content.hidden && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Radio className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{t('hidden_network')}</span>
                </div>
                <Badge variant="outline">Oui</Badge>
              </div>
            )}

            {/* Password */}
            {content.security !== 'nopass' && (
              <div className="rounded-lg border p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('password')}</p>
                  <button
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <p className="flex-1 font-mono text-lg tracking-wider">
                    {showPassword ? content.password : '•'.repeat(content.password.length)}
                  </p>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-9 w-9"
                    onClick={handleCopyPassword}
                  >
                    {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons — platform-specific */}
      <div className="space-y-3">
        {platform === 'android' && (
          <Button
            onClick={handleConnectAndroid}
            className="w-full h-12 text-base font-semibold bg-emerald-600 hover:bg-emerald-700"
            size="lg"
          >
            <Wifi className="mr-2 h-5 w-5" />
            {t('connect_one_tap')}
          </Button>
        )}

        {platform === 'ios' && (
          <Button
            onClick={handleConnectIos}
            className="w-full h-12 text-base font-semibold bg-emerald-600 hover:bg-emerald-700"
            size="lg"
          >
            <Wifi className="mr-2 h-5 w-5" />
            {t('connect_wifi')}
          </Button>
        )}

        {platform === 'desktop' && (
          <Button
            onClick={handleCopyInfo}
            className="w-full h-12 text-base font-semibold bg-emerald-600 hover:bg-emerald-700"
            size="lg"
          >
            {copied ? <Check className="mr-2 h-5 w-5" /> : <Copy className="mr-2 h-5 w-5" />}
            {t('copy_info')}
          </Button>
        )}

        {content.security !== 'nopass' && platform !== 'desktop' && (
          <Button
            variant="outline"
            className="w-full h-12 text-base"
            size="lg"
            onClick={handleCopyPassword}
          >
            {copied ? <Check className="mr-2 h-5 w-5 text-emerald-500" /> : <Copy className="mr-2 h-5 w-5" />}
            {copied ? t('copied') : t('copy_password')}
          </Button>
        )}
      </div>
    </div>
  );
}
