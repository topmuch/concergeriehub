'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, Bell, Plus, X, Home, MessageSquare, BellRing, Eye, BellOff } from 'lucide-react';
import { toast } from 'sonner';
import { usePushNotifications } from '@/hooks/use-push-notifications';

export interface DoorbellContent {
  mode: 'present' | 'absent';
  instructions: string[];
  allowMessages: boolean;
  allowDoorbell: boolean;
  presentMessage: string;
  absentMessage: string;
}

const DEFAULT_CONTENT: DoorbellContent = {
  mode: 'present',
  instructions: ['Chez le gardien', 'Dans la boîte à colis'],
  allowMessages: true,
  allowDoorbell: true,
  presentMessage: 'Je suis là, merci de sonner !',
  absentMessage: 'Je suis absent pour le moment.',
};

interface DoorbellConfigProps {
  qrCodeId: string;
  initialContent?: Partial<DoorbellContent>;
  onSave?: (content: DoorbellContent) => void;
}

export function DoorbellConfig({ qrCodeId, initialContent, onSave }: DoorbellConfigProps) {
  const [mode, setMode] = useState<DoorbellContent['mode']>(initialContent?.mode || DEFAULT_CONTENT.mode);
  const [instructions, setInstructions] = useState<string[]>(initialContent?.instructions || DEFAULT_CONTENT.instructions);
  const [allowMessages, setAllowMessages] = useState(initialContent?.allowMessages ?? DEFAULT_CONTENT.allowMessages);
  const [allowDoorbell, setAllowDoorbell] = useState(initialContent?.allowDoorbell ?? DEFAULT_CONTENT.allowDoorbell);
  const [presentMessage, setPresentMessage] = useState(initialContent?.presentMessage || DEFAULT_CONTENT.presentMessage);
  const [absentMessage, setAbsentMessage] = useState(initialContent?.absentMessage || DEFAULT_CONTENT.absentMessage);
  const [newInstruction, setNewInstruction] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!initialContent);

  useEffect(() => {
    if (!initialContent && qrCodeId) {
      fetch(`/api/client/module-content?qrCodeId=${qrCodeId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.content) {
            setMode(data.content.mode || DEFAULT_CONTENT.mode);
            setInstructions(data.content.instructions || DEFAULT_CONTENT.instructions);
            setAllowMessages(data.content.allowMessages ?? DEFAULT_CONTENT.allowMessages);
            setAllowDoorbell(data.content.allowDoorbell ?? DEFAULT_CONTENT.allowDoorbell);
            setPresentMessage(data.content.presentMessage || DEFAULT_CONTENT.presentMessage);
            setAbsentMessage(data.content.absentMessage || DEFAULT_CONTENT.absentMessage);
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [qrCodeId, initialContent]);

  const addInstruction = () => {
    const trimmed = newInstruction.trim();
    if (!trimmed) return;
    if (instructions.includes(trimmed)) {
      toast.error('Cette consigne existe déjà');
      return;
    }
    setInstructions([...instructions, trimmed]);
    setNewInstruction('');
  };

  const removeInstruction = (index: number) => {
    setInstructions(instructions.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (mode === 'absent' && instructions.length === 0) {
      toast.error('Ajoutez au moins une consigne en mode absent');
      return;
    }

    const content: DoorbellContent = {
      mode, instructions, allowMessages, allowDoorbell, presentMessage, absentMessage,
    };

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
      toast.success('Configuration du portier sauvegardée');
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
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
          <Bell className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Portier Virtuel</h3>
          <p className="text-sm text-muted-foreground">Gérez les visiteurs quand vous n'êtes pas là</p>
        </div>
      </div>

      {/* Mode Toggle */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mode de présence</CardTitle>
          <CardDescription>Définissez si vous êtes présent ou absent</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setMode('present')}
              className={`relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all ${
                mode === 'present'
                  ? 'border-green-500 bg-green-50 dark:bg-green-950/20'
                  : 'border-muted hover:border-muted-foreground/30'
              }`}
            >
              <div className={`flex h-12 w-12 items-center justify-center rounded-full ${mode === 'present' ? 'bg-green-500' : 'bg-muted'}`}>
                <Home className={`h-6 w-6 ${mode === 'present' ? 'text-white' : 'text-muted-foreground'}`} />
              </div>
              <span className={`text-sm font-semibold ${mode === 'present' ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}`}>
                Présent
              </span>
              {mode === 'present' && <Badge className="absolute -top-2 -right-2 bg-green-500 text-white">Actif</Badge>}
            </button>

            <button
              type="button"
              onClick={() => setMode('absent')}
              className={`relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all ${
                mode === 'absent'
                  ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/20'
                  : 'border-muted hover:border-muted-foreground/30'
              }`}
            >
              <div className={`flex h-12 w-12 items-center justify-center rounded-full ${mode === 'absent' ? 'bg-orange-500' : 'bg-muted'}`}>
                <Eye className={`h-6 w-6 ${mode === 'absent' ? 'text-white' : 'text-muted-foreground'}`} />
              </div>
              <span className={`text-sm font-semibold ${mode === 'absent' ? 'text-orange-700 dark:text-orange-400' : 'text-muted-foreground'}`}>
                Absent
              </span>
              {mode === 'absent' && <Badge className="absolute -top-2 -right-2 bg-orange-500 text-white">Actif</Badge>}
            </button>
          </div>

          {/* Custom messages per mode */}
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Message en mode Présent</Label>
              <Input
                value={presentMessage}
                onChange={(e) => setPresentMessage(e.target.value)}
                placeholder="Je suis là, merci de sonner !"
              />
            </div>
            <div className="space-y-2">
              <Label>Message en mode Absent</Label>
              <Input
                value={absentMessage}
                onChange={(e) => setAbsentMessage(e.target.value)}
                placeholder="Je suis absent pour le moment."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Instructions (visible in absent mode) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Consignes</CardTitle>
          <CardDescription>Instructions affichées aux visiteurs en mode absent</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {instructions.length > 0 && (
            <div className="space-y-2">
              {instructions.map((inst, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40 text-xs font-bold text-amber-700 dark:text-amber-400">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-sm">{inst}</span>
                  <button
                    type="button"
                    onClick={() => removeInstruction(i)}
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Input
              placeholder="Ajouter une consigne..."
              value={newInstruction}
              onChange={(e) => setNewInstruction(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addInstruction()}
            />
            <Button type="button" variant="outline" size="icon" onClick={addInstruction} disabled={!newInstruction.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Feature Toggles */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fonctionnalités</CardTitle>
          <CardDescription>Activez ou désactivez les actions pour les visiteurs</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <BellRing className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Autoriser la sonnette</p>
                <p className="text-xs text-muted-foreground">Le visiteur peut vous notifier</p>
              </div>
            </div>
            <Switch checked={allowDoorbell} onCheckedChange={setAllowDoorbell} />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Autoriser les messages</p>
                <p className="text-xs text-muted-foreground">Le visiteur peut vous laisser un message</p>
              </div>
            </div>
            <Switch checked={allowMessages} onCheckedChange={setAllowMessages} />
          </div>
        </CardContent>
      </Card>

      {/* Push Notification Card */}
      <NotificationCard />

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Sauvegarder
        </Button>
      </div>
    </div>
  );
}

/** Standalone notification card for the doorbell config */
function NotificationCard() {
  const { supported, permission, subscribed, loading, toggle } = usePushNotifications();

  if (!supported) return null;

  return (
    <Card className="border-violet-200 dark:border-violet-900/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {subscribed ? <Bell className="h-4 w-4 text-violet-600" /> : <BellOff className="h-4 w-4 text-muted-foreground" />}
          Notifications push
        </CardTitle>
        <CardDescription>
          Recevez une notification sur votre appareil quand quelqu&apos;un sonne
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`h-3 w-3 rounded-full ${subscribed ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
            <div>
              <p className="text-sm font-medium">
                {subscribed ? 'Notifications activées' : 'Notifications désactivées'}
              </p>
              {!subscribed && permission === 'denied' && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Les notifications sont bloquées. Autorisez-les dans les paramètres de votre navigateur.
                </p>
              )}
            </div>
          </div>
          <Button
            variant={subscribed ? 'outline' : 'default'}
            size="sm"
            onClick={toggle}
            disabled={loading || (!subscribed && permission === 'denied')}
            className={subscribed ? '' : 'bg-violet-600 hover:bg-violet-700'}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {subscribed ? 'Désactiver' : 'Activer'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
