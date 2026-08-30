'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Server,
  Wifi,
  Plug,
  Zap,
  RefreshCw,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Power,
  PowerOff,
  ChevronDown,
  ChevronUp,
  Loader2,
  Eye,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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

interface Automation {
  id: string;
  homeId: string;
  name: string;
  provider: string;
  baseUrl: string;
  apiToken: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  home: Home;
}

interface HACEntity {
  entity_id: string;
  state: string;
  attributes: {
    friendly_name?: string;
    [key: string]: unknown;
  };
}

type ConnectionStatus = 'idle' | 'testing' | 'connected' | 'disconnected' | 'error';

type ActionType = 'toggle' | 'turn_on' | 'turn_off' | 'get_state';

export function AutomationsManager() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [homes, setHomes] = useState<Home[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedHomeId, setSelectedHomeId] = useState('');
  const [newName, setNewName] = useState('');
  const [newProvider, setNewProvider] = useState('home_assistant');
  const [newBaseUrl, setNewBaseUrl] = useState('');
  const [newApiToken, setNewApiToken] = useState('');
  // Connection status per automation id
  const [connectionStatuses, setConnectionStatuses] = useState<Record<string, ConnectionStatus>>({});
  const [connectionMessages, setConnectionMessages] = useState<Record<string, string>>({});
  const [expandedAutomation, setExpandedAutomation] = useState<string | null>(null);
  const [entities, setEntities] = useState<Record<string, HACEntity[]>>({});
  const [loadingEntities, setLoadingEntities] = useState<Record<string, boolean>>({});
  const [triggeringEntity, setTriggeringEntity] = useState<string | null>(null);
  const [triggerMessage, setTriggerMessage] = useState<Record<string, string>>({});

  const fetchAutomations = useCallback(async () => {
    try {
      const res = await fetch('/api/client/automations');
      const data = await res.json();
      setAutomations(data.automations || []);
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
      await fetchAutomations();
    };
    init();
  }, []);

  const handleCreate = async () => {
    if (!newName || !newBaseUrl) return;
    setSaving(true);
    try {
      const res = await fetch('/api/client/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          homeId: selectedHomeId,
          name: newName,
          provider: newProvider,
          baseUrl: newBaseUrl,
          apiToken: newApiToken || undefined,
        }),
      });
      if (res.ok) {
        setDialogOpen(false);
        setNewName('');
        setNewBaseUrl('');
        setNewApiToken('');
        fetchAutomations();
      }
    } catch {
      // empty
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette automatisation ?')) return;
    try {
      await fetch(`/api/client/automations/${id}`, { method: 'DELETE' });
      fetchAutomations();
    } catch {
      // empty
    }
  };

  const handleToggleActive = async (automation: Automation) => {
    try {
      await fetch(`/api/client/automations/${automation.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !automation.isActive }),
      });
      fetchAutomations();
    } catch {
      // empty
    }
  };

  const handleTestConnection = async (automation: Automation) => {
    setConnectionStatuses((prev) => ({ ...prev, [automation.id]: 'testing' }));
    setConnectionMessages((prev) => ({ ...prev, [automation.id]: 'Test en cours...' }));
    try {
      const res = await fetch(`/api/client/automations/${automation.id}/test`, {
        method: 'POST',
      });
      const data = await res.json();
      setConnectionStatuses((prev) => ({
        ...prev,
        [automation.id]: data.success ? 'connected' : 'disconnected',
      }));
      setConnectionMessages((prev) => ({ ...prev, [automation.id]: data.message }));
    } catch {
      setConnectionStatuses((prev) => ({ ...prev, [automation.id]: 'error' }));
      setConnectionMessages((prev) => ({ ...prev, [automation.id]: 'Erreur réseau' }));
    }
  };

  const fetchEntities = async (automation: Automation) => {
    if (automation.provider !== 'home_assistant') return;
    setLoadingEntities((prev) => ({ ...prev, [automation.id]: true }));
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`${automation.baseUrl}/api/states`, {
        headers: {
          Authorization: `Bearer ${automation.apiToken}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        setEntities((prev) => ({ ...prev, [automation.id]: data.slice(0, 50) }));
      }
    } catch {
      // CORS may block direct fetch
    }
    setLoadingEntities((prev) => ({ ...prev, [automation.id]: false }));
  };

  const handleToggleExpand = async (automation: Automation) => {
    if (expandedAutomation === automation.id) {
      setExpandedAutomation(null);
    } else {
      setExpandedAutomation(automation.id);
      if (automation.provider === 'home_assistant' && !entities[automation.id]) {
        // Try fetching entities via our API proxy (trigger with get_state action)
        // For HA we can list states via test or we try direct
        fetchEntities(automation);
      }
    }
  };

  const handleTriggerEntity = async (automation: Automation, entityId: string, action: ActionType) => {
    const key = `${automation.id}-${entityId}`;
    setTriggeringEntity(key);
    setTriggerMessage((prev) => ({ ...prev, [key]: 'Exécution...' }));
    try {
      const res = await fetch(`/api/client/automations/${automation.id}/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId, action }),
      });
      const data = await res.json();
      setTriggerMessage((prev) => ({ ...prev, [key]: data.message }));
      // Refresh entities after action
      if (automation.provider === 'home_assistant') {
        fetchEntities(automation);
      }
    } catch {
      setTriggerMessage((prev) => ({ ...prev, [key]: 'Erreur réseau' }));
    }
    setTriggeringEntity(null);
  };

  const getConnectionIcon = (automationId: string) => {
    const status = connectionStatuses[automationId];
    switch (status) {
      case 'connected':
        return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case 'disconnected':
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'testing':
        return <Loader2 className="h-4 w-4 text-amber-500 animate-spin" />;
      default:
        return <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />;
    }
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
          <h3 className="text-lg font-semibold">Domotique (Home Assistant / Jeedom)</h3>
          <p className="text-sm text-muted-foreground">
            Connectez et contrôlez vos appareils domotiques
          </p>
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          className="bg-violet-600 hover:bg-violet-700"
          disabled={homes.length === 0}
        >
          <Plus className="h-4 w-4 mr-2" />
          Ajouter une automatisation
        </Button>
      </div>

      {homes.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">Créez d'abord une maison pour ajouter des automatisations.</p>
          </CardContent>
        </Card>
      )}

      {/* Automations list */}
      {automations.length === 0 && homes.length > 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="rounded-2xl bg-violet-100 dark:bg-violet-500/10 p-4">
            <Plug className="h-8 w-8 text-violet-600" />
          </div>
          <div className="text-center">
            <p className="font-medium">Aucune automatisation configurée</p>
            <p className="text-sm text-muted-foreground mt-1">
              Connectez Home Assistant ou Jeedom pour commencer
            </p>
          </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {automations.map((automation) => {
          const isExpanded = expandedAutomation === automation.id;
          const haEntities = entities[automation.id] || [];

          return (
            <Card key={automation.id} className={!automation.isActive ? 'opacity-60' : ''}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  {/* Provider icon */}
                  <div className={automation.provider === 'home_assistant' ? 'rounded-lg p-2 bg-sky-100 dark:bg-sky-500/10' : 'rounded-lg p-2 bg-amber-100 dark:bg-amber-500/10'}>
                    {automation.provider === 'home_assistant' ? (
                      <Server className="h-6 w-6 text-sky-600" />
                    ) : (
                      <Zap className="h-6 w-6 text-amber-600" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium truncate">{automation.name}</h4>
                      {getConnectionIcon(automation.id)}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground truncate">
                        {automation.home.name}
                      </span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {automation.provider === 'home_assistant' ? 'HA' : 'Jeedom'}
                      </Badge>
                      <span className="text-xs text-muted-foreground truncate">
                        {automation.baseUrl}
                      </span>
                    </div>
                    {connectionMessages[automation.id] && connectionStatuses[automation.id] !== 'idle' && (
                      <p className={`text-xs mt-1 ${
                        connectionStatuses[automation.id] === 'connected'
                          ? 'text-emerald-600'
                          : 'text-red-500'
                      }`}>
                        {connectionMessages[automation.id]}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleTestConnection(automation)}
                      disabled={connectionStatuses[automation.id] === 'testing'}
                      title="Tester la connexion"
                    >
                      <Wifi className="h-4 w-4" />
                    </Button>
                    {automation.provider === 'home_assistant' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleToggleExpand(automation)}
                        title="Parcourir les entités"
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    )}
                    <Switch
                      checked={automation.isActive}
                      onCheckedChange={() => handleToggleActive(automation)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-400 hover:text-red-600"
                      onClick={() => handleDelete(automation.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Expanded entity browser for HA */}
                {isExpanded && automation.provider === 'home_assistant' && (
                  <div className="mt-4 border-t pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <h5 className="text-sm font-medium flex items-center gap-2">
                        <Server className="h-4 w-4" />
                        Entités ({haEntities.length})
                      </h5>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchEntities(automation)}
                        disabled={loadingEntities[automation.id]}
                      >
                        <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loadingEntities[automation.id] ? 'animate-spin' : ''}`} />
                        Rafraîchir
                      </Button>
                    </div>

                    {loadingEntities[automation.id] ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : haEntities.length === 0 ? (
                      <div className="flex items-center justify-center py-8">
                        <p className="text-sm text-muted-foreground">
                          Aucune entité trouvée. Assurez-vous que l'API est accessible.
                        </p>
                      </div>
                    ) : (
                      <div className="max-h-96 overflow-y-auto space-y-2 pr-1">
                        {haEntities.map((entity) => {
                          const triggerKey = `${automation.id}-${entity.entity_id}`;
                          const isOn = ['on', 'open', 'unlocked'].includes(entity.state);
                          const domain = entity.entity_id.split('.')[0];
                          const showToggle = ['light', 'switch', 'fan', 'binary_sensor', 'cover', 'lock'].includes(domain);

                          return (
                            <div
                              key={entity.entity_id}
                              className="flex items-center gap-2 rounded-lg border p-2.5 text-sm"
                            >
                              <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                                isOn ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                              }`} />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">
                                  {entity.attributes.friendly_name || entity.entity_id}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {entity.entity_id} · {entity.state}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {showToggle && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => handleTriggerEntity(automation, entity.entity_id, 'toggle')}
                                    disabled={triggeringEntity === triggerKey}
                                  >
                                    {triggeringEntity === triggerKey ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : isOn ? (
                                      <PowerOff className="h-3 w-3" />
                                    ) : (
                                      <Power className="h-3 w-3" />
                                    )}
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => handleTriggerEntity(automation, entity.entity_id, 'get_state')}
                                  disabled={triggeringEntity === triggerKey}
                                >
                                  <Eye className="h-3 w-3" />
                                </Button>
                              </div>
                              {triggerMessage[triggerKey] && (
                                <p className="text-[10px] text-muted-foreground max-w-[120px] truncate">
                                  {triggerMessage[triggerKey]}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nouvelle automatisation</DialogTitle>
            <DialogDescription>
              Connectez Home Assistant ou Jeedom à votre maison
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

            {/* Provider selector with logos */}
            <div className="space-y-2">
              <Label>Fournisseur</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setNewProvider('home_assistant')}
                  className={`flex items-center gap-3 rounded-lg border-2 p-3 transition-all ${
                    newProvider === 'home_assistant'
                      ? 'border-sky-500 bg-sky-50 dark:bg-sky-500/10'
                      : 'border-muted hover:border-muted-foreground/30'
                  }`}
                >
                  <HomeAssistantLogo className={`h-8 w-8 ${
                    newProvider === 'home_assistant' ? 'text-sky-600' : 'text-muted-foreground'
                  }`} />
                  <div className="text-left">
                    <p className="text-sm font-medium">Home Assistant</p>
                    <p className="text-[11px] text-muted-foreground">HA</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setNewProvider('jeedom')}
                  className={`flex items-center gap-3 rounded-lg border-2 p-3 transition-all ${
                    newProvider === 'jeedom'
                      ? 'border-amber-500 bg-amber-50 dark:bg-amber-500/10'
                      : 'border-muted hover:border-muted-foreground/30'
                  }`}
                >
                  <JeedomLogo className={`h-8 w-8 ${
                    newProvider === 'jeedom' ? 'text-amber-600' : 'text-muted-foreground'
                  }`} />
                  <div className="text-left">
                    <p className="text-sm font-medium">Jeedom</p>
                    <p className="text-[11px] text-muted-foreground">Smart Home</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Name */}
            <div className="space-y-2">
              <Label>Nom</Label>
              <Input
                placeholder="Mon installation domotique"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>

            {/* Base URL */}
            <div className="space-y-2">
              <Label>URL de base</Label>
              <Input
                placeholder={
                  newProvider === 'home_assistant'
                    ? 'https://homeassistant.local:8123'
                    : 'http://jeedom.local:80'
                }
                value={newBaseUrl}
                onChange={(e) => setNewBaseUrl(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                {newProvider === 'home_assistant'
                  ? 'URL de votre instance Home Assistant'
                  : 'URL de votre instance Jeedom'}
              </p>
            </div>

            {/* API Token */}
            <div className="space-y-2">
              <Label>Token API</Label>
              <Input
                type="password"
                placeholder={
                  newProvider === 'home_assistant'
                    ? 'Long-lived access token'
                    : 'Clé API Jeedom'
                }
                value={newApiToken}
                onChange={(e) => setNewApiToken(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                {newProvider === 'home_assistant'
                  ? 'Créé dans Profile > Security > Long-Lived Access Tokens'
                  : 'Disponible dans Configuration > API > Clés API'}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleCreate}
              disabled={saving || !newName || !newBaseUrl || !selectedHomeId}
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

// Home Assistant Logo SVG Component
function HomeAssistantLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M13.865 2.733l-2.995 5.202h5.992l-2.997-5.202zm-6.252 10.83l2.994-5.198H1.612l2.995 5.198h3.006zm1.499 2.596L6.118 22.267l8.993.025-2.998-6.033h-2.001zm7.25-2.596l2.995-5.198H10.363l2.997 5.198h2.002zm0 0" />
    </svg>
  );
}

// Jeedom Logo SVG Component
function JeedomLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.18l8 4v8l-8 4-8-4v-8l8-4zM11 8v8h2V8h-2zm-3 2v4h2v-4H8zm6 0v4h2v-4h-2z" />
    </svg>
  );
}
