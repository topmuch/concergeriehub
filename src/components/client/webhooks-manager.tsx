'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Globe,
  Link,
  Send,
  RefreshCw,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Zap,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Home {
  id: string;
  name: string;
}

interface Webhook {
  id: string;
  homeId: string;
  name: string;
  url: string;
  events: string;
  secret: string | null;
  isActive: boolean;
  lastTriggerAt: string | null;
  successCount: number;
  failCount: number;
  createdAt: string;
  updatedAt: string;
  home: Home;
}

const ALL_EVENTS = [
  { value: 'scan', label: 'Scan QR', icon: '📱' },
  { value: 'doorbell', label: 'Sonnette', icon: '🔔' },
  { value: 'guestbook', label: 'Livre d\'or', icon: '📖' },
  { value: 'chore_completed', label: 'Corvée terminée', icon: '✅' },
  { value: 'notification', label: 'Notification', icon: '📢' },
];

const WEBHOOK_TEMPLATES = [
  {
    name: 'Slack',
    url: 'https://hooks.slack.com/services/...',
    color: 'text-[#E01E5A]',
    bgColor: 'bg-[#E01E5A]/10',
  },
  {
    name: 'Discord',
    url: 'https://discord.com/api/webhooks/...',
    color: 'text-[#5865F2]',
    bgColor: 'bg-[#5865F2]/10',
  },
  {
    name: 'n8n',
    url: 'https://your-n8n.com/webhook/...',
    color: 'text-orange-600',
    bgColor: 'bg-orange-500/10',
  },
  {
    name: 'Make.com',
    url: 'https://hook.make.com/...',
    color: 'text-violet-600',
    bgColor: 'bg-violet-500/10',
  },
  {
    name: 'Zapier',
    url: 'https://hooks.zapier.com/hooks/catch/...',
    color: 'text-amber-600',
    bgColor: 'bg-amber-500/10',
  },
];

export function WebhooksManager() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [homes, setHomes] = useState<Home[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedHomeId, setSelectedHomeId] = useState('');
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newEvents, setNewEvents] = useState<string[]>(['scan', 'doorbell', 'guestbook']);
  const [newSecret, setNewSecret] = useState('');
  // Secret visibility per webhook
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  // Test results per webhook
  const [testResults, setTestResults] = useState<Record<string, {
    loading: boolean;
    success?: boolean;
    statusCode?: number;
    response?: string;
  }>>({});

  const fetchWebhooks = useCallback(async () => {
    try {
      const res = await fetch('/api/client/webhooks');
      const data = await res.json();
      setWebhooks(data.webhooks || []);
    } catch {
      // empty
    }
    setLoading(false);
  }, []);

  const fetchHomes = useCallback(async () => {
    try {
      const res = await fetch('/api/client/homes');
      const data = await res.json();
      setHomes(data.homes || []);
      if (data.homes?.length > 0 && !selectedHomeId) {
        setSelectedHomeId(data.homes[0].id);
      }
    } catch {
      // empty
    }
  }, [selectedHomeId]);

  useEffect(() => {
    const init = async () => {
      await fetchHomes();
      await fetchWebhooks();
    };
    init();
  }, []);

  const toggleEvent = (event: string) => {
    setNewEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  const handleCreate = async () => {
    if (!newName || !newUrl || newEvents.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch('/api/client/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          homeId: selectedHomeId,
          name: newName,
          url: newUrl,
          events: newEvents,
          secret: newSecret || undefined,
        }),
      });
      if (res.ok) {
        setDialogOpen(false);
        setNewName('');
        setNewUrl('');
        setNewEvents(['scan', 'doorbell', 'guestbook']);
        setNewSecret('');
        fetchWebhooks();
      }
    } catch {
      // empty
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce webhook ?')) return;
    try {
      await fetch(`/api/client/webhooks/${id}`, { method: 'DELETE' });
      fetchWebhooks();
    } catch {
      // empty
    }
  };

  const handleToggleActive = async (webhook: Webhook) => {
    try {
      await fetch(`/api/client/webhooks/${webhook.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !webhook.isActive }),
      });
      fetchWebhooks();
    } catch {
      // empty
    }
  };

  const handleTest = async (webhook: Webhook) => {
    setTestResults((prev) => ({ ...prev, [webhook.id]: { loading: true } }));
    try {
      const res = await fetch(`/api/client/webhooks/${webhook.id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'test' }),
      });
      const data = await res.json();
      setTestResults((prev) => ({
        ...prev,
        [webhook.id]: {
          loading: false,
          success: data.success,
          statusCode: data.statusCode,
          response: data.response,
        },
      }));
      fetchWebhooks(); // refresh counts
    } catch {
      setTestResults((prev) => ({
        ...prev,
        [webhook.id]: { loading: false, success: false, response: 'Erreur réseau' },
      }));
    }
  };

  const handleRegenerateSecret = async (webhook: Webhook) => {
    if (!confirm('Régénérer le secret ? L\'ancien secret ne fonctionnera plus.')) return;
    try {
      await fetch(`/api/client/webhooks/${webhook.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerateSecret: true }),
      });
      fetchWebhooks();
    } catch {
      // empty
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const parseEvents = (eventsStr: string): string[] => {
    try {
      return JSON.parse(eventsStr || '[]');
    } catch {
      return [];
    }
  };

  const getEventLabel = (value: string) => {
    return ALL_EVENTS.find((e) => e.value === value)?.label || value;
  };

  const getEventIcon = (value: string) => {
    return ALL_EVENTS.find((e) => e.value === value)?.icon || '📌';
  };

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return 'Jamais';
    const date = new Date(dateStr);
    return date.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 border-2 border-violet-300/30 border-t-violet-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Webhooks & Automations</h3>
          <p className="text-sm text-muted-foreground">
            Recevez des notifications en temps réel sur vos services
          </p>
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          className="bg-violet-600 hover:bg-violet-700"
          disabled={homes.length === 0}
        >
          <Plus className="h-4 w-4 mr-2" />
          Ajouter un webhook
        </Button>
      </div>

      {homes.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">Créez d'abord une maison pour ajouter des webhooks.</p>
          </CardContent>
        </Card>
      )}

      {/* Templates */}
      {webhooks.length === 0 && homes.length > 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-6">
            <div className="rounded-2xl bg-violet-100 dark:bg-violet-500/10 p-4">
              <Globe className="h-8 w-8 text-violet-600" />
            </div>
            <div className="text-center">
              <p className="font-medium">Aucun webhook configuré</p>
              <p className="text-sm text-muted-foreground mt-1">
                Choisissez un template ou créez un webhook personnalisé
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 w-full max-w-2xl">
              {WEBHOOK_TEMPLATES.map((template) => (
                <button
                  key={template.name}
                  onClick={() => {
                    setNewUrl(template.url);
                    setDialogOpen(true);
                  }}
                  className={`flex flex-col items-center gap-2 rounded-xl border p-3 transition-all hover:shadow-sm ${template.bgColor}`}
                >
                  <span className="text-lg font-bold">{template.name}</span>
                  <span className="text-[10px] text-muted-foreground text-center">Template URL</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Webhooks list */}
      <div className="grid gap-4">
        {webhooks.map((webhook) => {
          const events = parseEvents(webhook.events);
          const testResult = testResults[webhook.id];
          const showSecret = showSecrets[webhook.id];

          return (
            <Card key={webhook.id} className={!webhook.isActive ? 'opacity-60' : ''}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div className="rounded-lg bg-violet-100 dark:bg-violet-500/10 p-2 mt-0.5">
                    <Link className="h-5 w-5 text-violet-600" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{webhook.name}</h4>
                      {webhook.isActive ? (
                        <Badge variant="default" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 text-[10px] px-1.5 py-0">
                          Actif
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          Inactif
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Globe className="h-3 w-3 text-muted-foreground shrink-0" />
                      <p className="text-xs text-muted-foreground truncate font-mono">
                        {webhook.url}
                      </p>
                    </div>

                    {/* Events badges */}
                    <div className="flex flex-wrap gap-1.5">
                      {events.map((event) => (
                        <Badge
                          key={event}
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 gap-1"
                        >
                          <span>{getEventIcon(event)}</span>
                          {getEventLabel(event)}
                        </Badge>
                      ))}
                    </div>

                    {/* Stats row */}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        {webhook.successCount} succès
                      </span>
                      <span className="flex items-center gap-1">
                        <XCircle className="h-3 w-3 text-red-400" />
                        {webhook.failCount} échecs
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTime(webhook.lastTriggerAt)}
                      </span>
                    </div>

                    {/* Secret */}
                    {webhook.secret && (
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground whitespace-nowrap">Secret:</Label>
                        <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono flex-1 truncate">
                          {showSecret ? webhook.secret : '•••••••••••••••••••••••••••••••••••'}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => setShowSecrets((prev) => ({ ...prev, [webhook.id]: !showSecret }))}
                        >
                          {showSecret ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => copyToClipboard(webhook.secret!)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-amber-500 hover:text-amber-600"
                          onClick={() => handleRegenerateSecret(webhook)}
                          title="Régénérer le secret"
                        >
                          <RefreshCw className="h-3 w-3" />
                        </Button>
                      </div>
                    )}

                    {/* Test result */}
                    {testResult && !testResult.loading && testResult.response && (
                      <div className={`rounded-lg border p-2.5 text-xs ${
                        testResult.success
                          ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/5'
                          : 'border-red-200 bg-red-50 dark:border-red-500/20 dark:bg-red-500/5'
                      }`}>
                        <div className="flex items-center gap-1.5 mb-1">
                          {testResult.success ? (
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          ) : (
                            <AlertTriangle className="h-3 w-3 text-red-500" />
                          )}
                          <span className="font-medium">
                            {testResult.success ? `HTTP ${testResult.statusCode}` : 'Échec'}
                          </span>
                        </div>
                        <p className="text-muted-foreground break-all">{testResult.response}</p>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTest(webhook)}
                      disabled={testResult?.loading}
                      className="h-8 text-xs"
                    >
                      {testResult?.loading ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <Send className="h-3 w-3 mr-1" />
                      )}
                      Tester
                    </Button>
                    <div className="flex items-center gap-1">
                      <Switch
                        checked={webhook.isActive}
                        onCheckedChange={() => handleToggleActive(webhook)}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-400 hover:text-red-600"
                        onClick={() => handleDelete(webhook.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Templates section when webhooks exist */}
      {webhooks.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Templates rapides</CardTitle>
            <CardDescription className="text-xs">
              Cliquez pour pré-remplir l'URL d'un nouveau webhook
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {WEBHOOK_TEMPLATES.map((template) => (
                <Button
                  key={template.name}
                  variant="outline"
                  size="sm"
                  className={`text-xs h-8 ${template.bgColor} ${template.color}`}
                  onClick={() => {
                    setNewUrl(template.url);
                    setDialogOpen(true);
                  }}
                >
                  {template.name}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nouveau webhook</DialogTitle>
            <DialogDescription>
              Configurez un endpoint pour recevoir des événements en temps réel
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Home selector */}
            <div className="space-y-2">
              <Label>Maison</Label>
              <Select value={selectedHomeId} onValueChange={setSelectedHomeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner une maison" />
                </SelectTrigger>
                <SelectContent>
                  {homes.map((home) => (
                    <SelectItem key={home.id} value={home.id}>
                      {home.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Name */}
            <div className="space-y-2">
              <Label>Nom</Label>
              <Input
                placeholder="Mon webhook Slack"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>

            {/* URL */}
            <div className="space-y-2">
              <Label>URL du webhook</Label>
              <Input
                placeholder="https://hooks.slack.com/services/..."
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
              />
            </div>

            {/* Events */}
            <div className="space-y-3">
              <Label>Événements</Label>
              <div className="grid grid-cols-1 gap-2">
                {ALL_EVENTS.map((event) => (
                  <div key={event.value} className="flex items-center gap-3 rounded-lg border p-2.5">
                    <Checkbox
                      checked={newEvents.includes(event.value)}
                      onCheckedChange={() => toggleEvent(event.value)}
                    />
                    <span className="text-sm">{event.icon}</span>
                    <Label className="text-sm cursor-pointer flex-1" onClick={() => toggleEvent(event.value)}>
                      {event.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Secret (optional) */}
            <div className="space-y-2">
              <Label>Secret (optionnel)</Label>
              <Input
                placeholder="Laisser vide pour générer automatiquement"
                value={newSecret}
                onChange={(e) => setNewSecret(e.target.value)}
              />\n              <p className="text-[11px] text-muted-foreground">
                Utilisé pour signer les payloads avec HMAC-SHA256
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleCreate}
              disabled={saving || !newName || !newUrl || newEvents.length === 0 || !selectedHomeId}
              className="bg-violet-600 hover:bg-violet-700"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Zap className="h-4 w-4 mr-2" />}
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
