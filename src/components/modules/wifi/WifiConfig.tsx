'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, Save, Wifi } from 'lucide-react';
import { toast } from 'sonner';

export interface WifiContent {
  ssid: string;
  password: string;
  security: 'WPA' | 'WEP' | 'nopass';
  hidden: boolean;
}

interface WifiConfigProps {
  qrCodeId: string;
  initialContent?: Partial<WifiContent>;
  onSave?: (content: WifiContent) => void;
}

export function WifiConfig({ qrCodeId, initialContent, onSave }: WifiConfigProps) {
  const [ssid, setSsid] = useState(initialContent?.ssid || '');
  const [password, setPassword] = useState(initialContent?.password || '');
  const [security, setSecurity] = useState<WifiContent['security']>(initialContent?.security || 'WPA');
  const [hidden, setHidden] = useState(initialContent?.hidden || false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!initialContent);

  useEffect(() => {
    if (!initialContent && qrCodeId) {
      fetch(`/api/client/module-content?qrCodeId=${qrCodeId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.content) {
            setSsid(data.content.ssid || '');
            setPassword(data.content.password || '');
            setSecurity(data.content.security || 'WPA');
            setHidden(data.content.hidden || false);
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [qrCodeId, initialContent]);

  const handleSave = async () => {
    if (!ssid.trim()) {
      toast.error('Le nom du réseau (SSID) est requis');
      return;
    }
    if (security !== 'nopass' && !password.trim()) {
      toast.error('Le mot de passe est requis pour ce type de sécurité');
      return;
    }

    const content: WifiContent = { ssid, password, security, hidden };

    if (onSave) {
      onSave(content);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/client/module-content', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrCodeId, content }),
      });
      if (!res.ok) throw new Error('Erreur serveur');
      toast.success('Configuration Wi-Fi sauvegardée');
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
          <Wifi className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Wi-Fi Invités</h3>
          <p className="text-sm text-muted-foreground">Permettez à vos invités de se connecter facilement</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuration du réseau</CardTitle>
          <CardDescription>Les informations seront encodées dans le QR code</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="wifi-ssid">Nom du réseau (SSID)</Label>
            <Input
              id="wifi-ssid"
              placeholder="MonRéseauWiFi"
              value={ssid}
              onChange={(e) => setSsid(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="wifi-security">Type de sécurité</Label>
            <Select value={security} onValueChange={(v) => setSecurity(v as WifiContent['security'])}>
              <SelectTrigger id="wifi-security">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="WPA">WPA/WPA2/WPA3</SelectItem>
                <SelectItem value="WEP">WEP</SelectItem>
                <SelectItem value="nopass">Réseau ouvert</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {security === 'WPA' && 'Recommandé pour la plupart des réseaux modernes'}
              {security === 'WEP' && 'Sécurité obsolète, non recommandé'}
              {security === 'nopass' && 'Aucun mot de passe requis pour se connecter'}
            </p>
          </div>

          {security !== 'nopass' && (
            <div className="space-y-2">
              <Label htmlFor="wifi-password">Mot de passe</Label>
              <Input
                id="wifi-password"
                type="text"
                placeholder="Entrez le mot de passe Wi-Fi"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Ce mot de passe sera visible en scannant le QR code. Utilisez un réseau invité si possible.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="wifi-hidden">Réseau masqué</Label>
              <p className="text-xs text-muted-foreground">Le SSID n'est pas diffusé publiquement</p>
            </div>
            <Switch id="wifi-hidden" checked={hidden} onCheckedChange={setHidden} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Sauvegarder
        </Button>
      </div>
    </div>
  );
}
