'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// =============================================================
// AdminSettingsContent — Module 7 Paramètres
//  - Général : nom plateforme, support, commission, quotas (DB réelle)
//  - Domaines : white-label customDomain + vérification DNS réelle (TXT/CNAME)
//  - Flags : feature flags consommés par les routes métier
//  - Sécurité : clés d'API (hashées), blacklist IP, état rate limiting
// Refonte « SAPHIR LUXE » : sombre bleuté, sans icônes.
// =============================================================

interface Settings {
  platformName: string;
  supportEmail: string;
  defaultCommissionPercent: number;
  signupHourlyLimit: number;
  payoutMinimumEur: number;
  maintenanceMode: boolean;
}

interface FlagRow {
  key: string;
  enabled: boolean;
  description: string;
}

interface DomainRow {
  propertyId: string;
  propertyName: string;
  domain: string;
  verified: boolean;
  ownerEmail: string;
  txtRecord: { host: string; value: string };
}

interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revoked: boolean;
}

interface BlacklistRow {
  ip: string;
  reason: string | null;
  createdAt: string;
}

// Champs de formulaire « lux » (sombre bleuté).
const LUX_INPUT =
  'h-10 rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fa0c2]/60 focus-visible:ring-[#5c8af0]/50';

export function AdminSettingsContent() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [domains, setDomains] = useState<DomainRow[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyRow[]>([]);
  const [blacklist, setBlacklist] = useState<BlacklistRow[]>([]);
  const [rateInfo, setRateInfo] = useState<{ backend: string; redisConfigured: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  // Clé API
  const [keyName, setKeyName] = useState('');
  const [keyCreating, setKeyCreating] = useState(false);
  const [plaintextKey, setPlaintextKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyRow | null>(null);

  // Blacklist
  const [newIp, setNewIp] = useState('');
  const [newIpReason, setNewIpReason] = useState('');
  const [ipBusy, setIpBusy] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [resSettings, resDomains, resKeys, resBlacklist] = await Promise.all([
        fetch('/api/admin/settings'),
        fetch('/api/admin/settings/domains'),
        fetch('/api/admin/api-keys'),
        fetch('/api/admin/blacklist'),
      ]);
      if (resSettings.ok) {
        const data = await resSettings.json();
        setSettings(data.settings);
        setFlags(Array.isArray(data.flags) ? data.flags : []);
        setRateInfo(data.rateLimiting ?? null);
      }
      if (resDomains.ok) setDomains((await resDomains.json()).domains ?? []);
      if (resKeys.ok) setApiKeys((await resKeys.json()).data ?? []);
      if (resBlacklist.ok) setBlacklist((await resBlacklist.json()).data ?? []);
    } catch {
      toast.error('Erreur de chargement des paramètres');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur serveur');
      setSettings(data.settings);
      toast.success(data.message || 'Paramètres enregistrés');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setSaving(false);
    }
  };

  const toggleFlag = async (flag: FlagRow) => {
    try {
      const res = await fetch('/api/admin/flags', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: flag.key, enabled: !flag.enabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur serveur');
      setFlags((fs) => fs.map((f) => (f.key === flag.key ? { ...f, enabled: !flag.enabled } : f)));
      toast.success(data.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur inconnue');
    }
  };

  const verifyDomain = async (domain: DomainRow) => {
    setVerifyingId(domain.propertyId);
    try {
      const res = await fetch('/api/admin/settings/domains/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId: domain.propertyId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur serveur');
      if (data.verified) toast.success(data.message);
      else toast.warning(data.message);
      fetchAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setVerifyingId(null);
    }
  };

  const createApiKey = async () => {
    setKeyCreating(true);
    try {
      const res = await fetch('/api/admin/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: keyName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur serveur');
      setPlaintextKey(data.plaintext);
      setCopied(false);
      setKeyName('');
      fetchAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setKeyCreating(false);
    }
  };

  const revokeKey = async (key: ApiKeyRow) => {
    try {
      const res = await fetch(`/api/admin/api-keys?id=${key.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur serveur');
      toast.success(data.message);
      setRevokeTarget(null);
      fetchAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur inconnue');
    }
  };

  const addBlacklist = async () => {
    setIpBusy(true);
    try {
      const res = await fetch('/api/admin/blacklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: newIp, reason: newIpReason || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur serveur');
      toast.success(`IP ${newIp} blacklistée`);
      setNewIp('');
      setNewIpReason('');
      fetchAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setIpBusy(false);
    }
  };

  const removeBlacklist = async (entry: BlacklistRow) => {
    try {
      const res = await fetch(`/api/admin/blacklist?id=${encodeURIComponent(entry.ip)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur serveur');
      toast.success(data.message);
      fetchAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur inconnue');
    }
  };

  if (loading || !settings) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <Skeleton className="h-10 w-72 bg-white/8" />
        <Skeleton className="h-64 w-full rounded-2xl bg-white/8" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <Tabs defaultValue="general" className="gap-4">
        <TabsList className="h-auto flex-wrap justify-start gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1">
          <TabsTrigger
            value="general"
            className="rounded-full text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8fa0c2] transition-colors data-[state=active]:bg-white/10 data-[state=active]:text-white"
          >
            Général
          </TabsTrigger>
          <TabsTrigger
            value="domains"
            className="rounded-full text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8fa0c2] transition-colors data-[state=active]:bg-white/10 data-[state=active]:text-white"
          >
            Domaines &amp; White-label
          </TabsTrigger>
          <TabsTrigger
            value="flags"
            className="rounded-full text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8fa0c2] transition-colors data-[state=active]:bg-white/10 data-[state=active]:text-white"
          >
            Feature flags
          </TabsTrigger>
          <TabsTrigger
            value="security"
            className="rounded-full text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8fa0c2] transition-colors data-[state=active]:bg-white/10 data-[state=active]:text-white"
          >
            Sécurité
          </TabsTrigger>
        </TabsList>

        {/* ----- Général ----- */}
        <TabsContent value="general">
          <Card className="lux-card">
            <CardHeader>
              <CardTitle className="lux-display text-lg text-white">Paramètres généraux</CardTitle>
              <CardDescription className="text-sm text-[#8fa0c2]">
                Configuration persistée en base et consommée par les routes métier (inscriptions, commandes, reversements).
              </CardDescription>
            </CardHeader>
            <CardContent className="grid max-w-2xl gap-4">
              <div className="grid gap-2">
                <Label htmlFor="set-name" className="text-xs font-semibold text-[#c7d3ec]">Nom de la plateforme</Label>
                <Input id="set-name" value={settings.platformName} className={LUX_INPUT}
                  onChange={(e) => setSettings({ ...settings, platformName: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="set-email" className="text-xs font-semibold text-[#c7d3ec]">Email de support</Label>
                <Input id="set-email" type="email" value={settings.supportEmail} className={LUX_INPUT}
                  onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="set-commission" className="text-xs font-semibold text-[#c7d3ec]">Commission par défaut (%)</Label>
                  <Input id="set-commission" type="number" min="0" max="50" value={settings.defaultCommissionPercent} className={LUX_INPUT}
                    onChange={(e) => setSettings({ ...settings, defaultCommissionPercent: Number(e.target.value) })} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="set-signup" className="text-xs font-semibold text-[#c7d3ec]">Inscriptions / heure / IP</Label>
                  <Input id="set-signup" type="number" min="1" max="500" value={settings.signupHourlyLimit} className={LUX_INPUT}
                    onChange={(e) => setSettings({ ...settings, signupHourlyLimit: Number(e.target.value) })} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="set-payout" className="text-xs font-semibold text-[#c7d3ec]">Reversement min. (€)</Label>
                  <Input id="set-payout" type="number" min="0" value={settings.payoutMinimumEur} className={LUX_INPUT}
                    onChange={(e) => setSettings({ ...settings, payoutMinimumEur: Number(e.target.value) })} />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div>
                  <p className="text-sm font-semibold text-white">Mode maintenance</p>
                  <p className="text-xs text-[#8fa0c2]">
                    Bloque les nouvelles commandes de service (contrôle réel dans l'API marketplace).
                  </p>
                </div>
                <Switch checked={settings.maintenanceMode}
                  onCheckedChange={(v) => setSettings({ ...settings, maintenanceMode: v })}
                  aria-label="Mode maintenance" />
              </div>
              <div>
                <Button onClick={saveSettings} disabled={saving} className="lux-btn h-9 rounded-full px-4 text-xs">
                  {saving ? 'Enregistrement…' : 'Enregistrer les paramètres'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ----- Domaines & White-label ----- */}
        <TabsContent value="domains">
          <Card className="lux-card">
            <CardHeader>
              <CardTitle className="lux-display text-lg text-white">Domaines personnalisés (white-label)</CardTitle>
              <CardDescription className="text-sm text-[#8fa0c2]">
                L'app invitée est servie sous le domaine de la conciergerie (CNAME) une fois la possession
                du domaine prouvée par l'enregistrement TXT ci-dessous.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {domains.length === 0 ? (
                <p className="lux-empty rounded-2xl px-4 py-10 text-center text-sm text-[#8fa0c2]">
                  Aucun bien n'a de domaine personnalisé configuré. Les conciergeries définissent leur domaine
                  dans les réglages de leur bien (white-label).
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-[#0d1530]">
                      <TableRow className="border-white/8 hover:bg-transparent">
                        <TableHead className="lux-eyebrow !text-[9.5px]">Bien</TableHead>
                        <TableHead className="lux-eyebrow !text-[9.5px]">Domaine</TableHead>
                        <TableHead className="lux-eyebrow !text-[9.5px] hidden lg:table-cell">Enregistrement TXT attendu</TableHead>
                        <TableHead className="lux-eyebrow !text-[9.5px]">Statut</TableHead>
                        <TableHead className="w-32"><span className="sr-only">Action</span></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {domains.map((d) => (
                        <TableRow key={d.propertyId} className="border-white/8 hover:bg-white/[0.04]">
                          <TableCell className="font-semibold text-white">{d.propertyName}</TableCell>
                          <TableCell className="font-mono text-xs text-[#c7d3ec]">{d.domain}</TableCell>
                          <TableCell className="hidden font-mono text-[11px] text-[#8fa0c2] lg:table-cell">
                            {d.txtRecord.host} → {d.txtRecord.value}
                          </TableCell>
                          <TableCell>
                            {d.verified ? (
                              <Badge className="border border-[#34d399]/25 bg-[#34d399]/10 text-[#86e9cb]">Vérifié</Badge>
                            ) : (
                              <Badge className="border border-[#fbbf24]/25 bg-[#fbbf24]/10 text-[#fbbf24]">En attente</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button size="sm" variant="outline" disabled={verifyingId === d.propertyId}
                              className="lux-btn-ghost h-8 rounded-full px-3.5 text-xs"
                              onClick={() => verifyDomain(d)}>
                              {verifyingId === d.propertyId ? 'Vérification…' : 'Vérifier le DNS'}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ----- Feature flags ----- */}
        <TabsContent value="flags">
          <Card className="lux-card">
            <CardHeader>
              <CardTitle className="lux-display text-lg text-white">Feature flags</CardTitle>
              <CardDescription className="text-sm text-[#8fa0c2]">
                Interrupteurs réels : chaque bascule est appliquée immédiatement par les routes métier.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {flags.map((flag) => (
                <div key={flag.key} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="min-w-0 pr-4">
                    <p className="font-mono text-sm font-bold text-white">{flag.key}</p>
                    <p className="text-xs text-[#8fa0c2]">{flag.description}</p>
                  </div>
                  <Switch checked={flag.enabled} onCheckedChange={() => toggleFlag(flag)}
                    aria-label={`Basculer ${flag.key}`} />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ----- Sécurité ----- */}
        <TabsContent value="security" className="space-y-4">
          {/* État rate limiting */}
          <Card className="lux-card">
            <CardHeader>
              <CardTitle className="lux-display text-lg text-white">Rate limiting</CardTitle>
              <CardDescription className="text-sm text-[#8fa0c2]">
                Actif sur : connexion, inscription, création/paiement de commandes, hub.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              <Badge className={rateInfo?.redisConfigured
                ? 'border border-[#34d399]/25 bg-[#34d399]/10 text-[#86e9cb]'
                : 'border border-white/10 bg-white/[0.05] text-[#8fa0c2]'}>
                Backend : {rateInfo?.backend ?? '…'}
              </Badge>
              <p className="text-xs text-[#8fa0c2]">
                Connexion : 10/min/IP · Inscriptions : quota configurable (onglet Général) · Paiement : 6/min/commande
                {rateInfo?.redisConfigured ? ' — partagé entre instances via Redis.' : ' — store mémoire (mono-instance).'}
              </p>
            </CardContent>
          </Card>

          {/* Clés d'API */}
          <Card className="lux-card">
            <CardHeader>
              <CardTitle className="lux-display text-lg text-white">Clés d'API externes</CardTitle>
              <CardDescription className="text-sm text-[#8fa0c2]">
                Consommation réelle : <code className="rounded bg-white/10 px-1 text-[#a9c4ff]">GET /api/external/v1/stats</code> avec
                l'en-tête <code className="rounded bg-white/10 px-1 text-[#a9c4ff]">x-api-key</code> (30 req/min/clé).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input placeholder="Nom de la clé (ex: Dashboard partenaire)" value={keyName}
                  onChange={(e) => setKeyName(e.target.value)} aria-label="Nom de la clé" className={cn(LUX_INPUT, 'flex-1')} />
                <Button onClick={createApiKey} disabled={keyCreating || keyName.trim().length < 2}
                  className="lux-btn h-9 rounded-full px-4 text-xs">
                  {keyCreating ? 'Création…' : 'Créer une clé'}
                </Button>
              </div>

              {plaintextKey && (
                <div className="rounded-xl border border-[#34d399]/25 bg-[#34d399]/[0.08] p-4">
                  <p className="mb-2 flex items-center gap-2 text-sm font-bold text-[#86e9cb]">
                    <span className="lux-dot" style={{ backgroundColor: '#34d399' }} aria-hidden="true" />
                    Clé affichée une seule fois — copiez-la maintenant :
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 select-all overflow-x-auto rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-[#86e9cb]">
                      {plaintextKey}
                    </code>
                    <Button size="sm" variant="outline"
                      className="lux-btn-ghost h-8 shrink-0 rounded-full px-3.5 text-[11px]"
                      onClick={() => {
                        navigator.clipboard?.writeText(plaintextKey).then(() => {
                          setCopied(true);
                          toast.success('Clé copiée');
                        });
                      }}>
                      {copied ? 'Copié ✓' : 'Copier'}
                    </Button>
                  </div>
                </div>
              )}

              {apiKeys.length === 0 ? (
                <p className="text-sm text-[#8fa0c2]">Aucune clé créée.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-[#0d1530]">
                      <TableRow className="border-white/8 hover:bg-transparent">
                        <TableHead className="lux-eyebrow !text-[9.5px]">Nom</TableHead>
                        <TableHead className="lux-eyebrow !text-[9.5px]">Préfixe</TableHead>
                        <TableHead className="lux-eyebrow !text-[9.5px] hidden md:table-cell">Dernière utilisation</TableHead>
                        <TableHead className="lux-eyebrow !text-[9.5px]">Statut</TableHead>
                        <TableHead className="w-12"><span className="sr-only">Actions</span></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {apiKeys.map((k) => (
                        <TableRow key={k.id} className="border-white/8 hover:bg-white/[0.04]">
                          <TableCell className="font-semibold text-white">{k.name}</TableCell>
                          <TableCell className="font-mono text-xs text-[#c7d3ec]">{k.prefix}</TableCell>
                          <TableCell className="hidden text-xs text-[#8fa0c2] md:table-cell">
                            {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString('fr-FR') : 'jamais'}
                          </TableCell>
                          <TableCell>
                            {k.revoked ? (
                              <Badge variant="outline" className="border-white/12 text-[#8fa0c2]">Révoquée</Badge>
                            ) : (
                              <Badge className="border border-[#34d399]/25 bg-[#34d399]/10 text-[#86e9cb]">Active</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {!k.revoked && (
                              <Button size="sm" variant="ghost"
                                className="text-xs text-[#f07d6a] hover:bg-[#f07d6a]/10 hover:text-[#f07d6a]"
                                onClick={() => setRevokeTarget(k)} aria-label={`Révoquer ${k.name}`}>
                                Révoquer
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Blacklist IP */}
          <Card className="lux-card">
            <CardHeader>
              <CardTitle className="lux-display text-lg text-white">Blacklist IP</CardTitle>
              <CardDescription className="text-sm text-[#8fa0c2]">
                Une IP bannie est refusée sur la connexion, l'inscription et le paiement (contrôle réel).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input placeholder="Ex: 203.0.113.42" value={newIp} onChange={(e) => setNewIp(e.target.value)}
                  aria-label="IP à bannir" className={cn(LUX_INPUT, 'flex-1')} />
                <Input placeholder="Raison (optionnel)" value={newIpReason} onChange={(e) => setNewIpReason(e.target.value)}
                  aria-label="Raison" className={cn(LUX_INPUT, 'flex-1')} />
                <Button onClick={addBlacklist} disabled={ipBusy || !newIp.trim()}
                  className="lux-btn h-9 rounded-full px-4 text-xs">
                  {ipBusy ? 'Bannissement…' : 'Bannir'}
                </Button>
              </div>
              {blacklist.length === 0 ? (
                <p className="text-sm text-[#8fa0c2]">Aucune IP bannie.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-[#0d1530]">
                      <TableRow className="border-white/8 hover:bg-transparent">
                        <TableHead className="lux-eyebrow !text-[9.5px]">IP</TableHead>
                        <TableHead className="lux-eyebrow !text-[9.5px]">Raison</TableHead>
                        <TableHead className="lux-eyebrow !text-[9.5px]">Ajoutée le</TableHead>
                        <TableHead className="w-12"><span className="sr-only">Actions</span></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {blacklist.map((b) => (
                        <TableRow key={b.ip} className="border-white/8 hover:bg-white/[0.04]">
                          <TableCell className="font-mono text-sm font-bold text-white">{b.ip}</TableCell>
                          <TableCell className="text-sm text-[#8fa0c2]">{b.reason ?? '—'}</TableCell>
                          <TableCell className="text-sm text-[#8fa0c2]">
                            {new Date(b.createdAt).toLocaleDateString('fr-FR')}
                          </TableCell>
                          <TableCell>
                            <Button size="sm" variant="ghost"
                              className="text-xs text-[#f07d6a] hover:bg-[#f07d6a]/10 hover:text-[#f07d6a]"
                              onClick={() => removeBlacklist(b)} aria-label={`Retirer ${b.ip}`}>
                              Retirer
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Confirmation révocation clé */}
      <AlertDialog open={revokeTarget !== null} onOpenChange={(o) => !o && setRevokeTarget(null)}>
        <AlertDialogContent className="border-white/10 bg-[#0b1226] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="lux-display text-lg text-white">Révoquer cette clé d'API ?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-[#8fa0c2]">
              La clé « <strong>{revokeTarget?.name}</strong> » ({revokeTarget?.prefix}) cessera de fonctionner
              immédiatement. Action irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="lux-btn-ghost rounded-full border-white/10 bg-transparent px-4 text-xs text-[#c7d3ec]">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction className="rounded-full bg-[#f07d6a] text-[#2a0e08] hover:bg-[#f07d6a]/90"
              onClick={(e) => {
                e.preventDefault();
                if (revokeTarget) revokeKey(revokeTarget);
              }}>
              Révoquer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
