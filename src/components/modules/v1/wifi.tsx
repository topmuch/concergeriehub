'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Eye, EyeOff, Copy, Check, Wifi, Lock, Unlock, Shield } from 'lucide-react';
import type { ModuleProps } from '../types';

const DEFAULT_CONTENT = {
  ssid: 'MonWiFi_Maison',
  password: 'MonMotDePasse123!',
  securityType: 'WPA2',
  hidden: false,
  guestNetwork: 'MonWiFi_Invites',
  guestPassword: 'Invites2024!',
  routerLocation: 'Bureau, 2ème étage',
  notes: 'Le réseau 5 GHz est plus rapide mais a moins de portée.',
};

export default function WifiModule({ content, onSave }: ModuleProps) {
  const data = { ...DEFAULT_CONTENT, ...content } as typeof DEFAULT_CONTENT;
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState(data);

  const handleCopy = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const handleSave = () => {
    onSave(form);
    setEditMode(false);
  };

  return (
    <div className="space-y-4">
      {/* Main WiFi Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-950">
                <Wifi className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <CardTitle className="text-base">Réseau Wi-Fi Principal</CardTitle>
                <p className="text-xs text-muted-foreground">Connectez-vous au réseau de la maison</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1">
                {data.securityType === 'WPA3' ? <Shield className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                {data.securityType}
              </Badge>
              {!editMode && (
                <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>Modifier</Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {editMode ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Nom du réseau (SSID)</Label>
                  <Input value={form.ssid} onChange={(e) => setForm({ ...form, ssid: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Mot de passe</Label>
                  <div className="relative">
                    <Input type={showPassword ? 'text' : 'password'} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                    <Button variant="ghost" size="icon" className="absolute right-0 top-0 h-full" onClick={() => setShowPassword(!showPassword)}>
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Type de sécurité</Label>
                  <select className="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm" value={form.securityType} onChange={(e) => setForm({ ...form, securityType: e.target.value })}>
                    <option value="WPA2">WPA2</option>
                    <option value="WPA3">WPA3</option>
                    <option value="WEP">WEP</option>
                    <option value="Open">Ouvert</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Emplacement du routeur</Label>
                  <Input value={form.routerLocation} onChange={(e) => setForm({ ...form, routerLocation: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <textarea className="flex min-h-[60px] w-full rounded-md border bg-transparent px-3 py-2 text-sm" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSave}>Enregistrer</Button>
                <Button variant="outline" onClick={() => { setForm(data); setEditMode(false); }}>Annuler</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground mb-1">Nom du réseau</p>
                  <p className="font-semibold text-sm">{data.ssid}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground mb-1">Mot de passe</p>
                  <div className="flex items-center gap-2">
                    <p className="font-mono font-semibold text-sm flex-1">
                      {showPassword ? data.password : '••••••••••••'}
                    </p>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowPassword(!showPassword)}>
                      {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleCopy(data.password, 'password')}>
                      {copied === 'password' ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
              </div>
              {data.guestNetwork && (
                <div className="rounded-lg border border-dashed p-3 bg-muted/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Unlock className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-medium">Réseau invité</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <p className="text-xs text-muted-foreground">SSID</p>
                      <p className="font-mono text-sm">{data.guestNetwork}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Mot de passe</p>
                      <div className="flex items-center gap-1">
                        <p className="font-mono text-sm flex-1">{data.guestPassword}</p>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCopy(data.guestPassword!, 'guest')}>
                          {copied === 'guest' ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {data.notes && (
                <p className="text-xs text-muted-foreground italic">💡 {data.notes}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
