'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// =============================================================
// AdminEmailsContent — ÉTAPE 22 : console des emails transactionnels.
//  - Onglet « Journal d'envoi » (É22) : stats d'envoi (24 h +
//    globales), outbox filtrable, aperçu HTML, Réessai des échecs
//  - Onglet « Modèles » (FIX-12) : édition des templates DB
//    (sujet + corps HTML, activer/désactiver) consommés en priorité
//    par le rendu réel (lib/email-template-render.ts)
// Design v5.2 « Saphir Luxe » : sombre bleuté, sans icônes.
// =============================================================

// ---------- Design « Saphir Luxe » : champs & portails sombres ----------
const LUX_FIELD =
  'rounded-xl! border-white/12! bg-white/[0.04]! text-white! placeholder:text-[#8fa0c2]/60! focus-visible:ring-[#5c8af0]/50!';
const LUX_SELECT_TRIGGER =
  'rounded-xl! border-white/12! bg-white/[0.04]! text-white! focus-visible:ring-[#5c8af0]/50!';
const LUX_SELECT_CONTENT = 'border-white/10! bg-[#0b1226]! text-white!';
const LUX_SELECT_ITEM = 'focus:bg-white/8! focus:text-white!';
const LUX_TABS_LIST = 'h-auto rounded-full! border border-white/10! bg-white/[0.04]! p-1';
const LUX_TABS_TRIGGER =
  'rounded-full! px-4! text-[11px]! font-semibold uppercase tracking-[0.12em] text-[#8fa0c2]! data-[state=active]:bg-white/10! data-[state=active]:text-white!';

interface EmailRow {
  id: string;
  to: string;
  subject: string;
  template: string;
  status: string;
  provider: string | null;
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
  referenceType: string | null;
  referenceId: string | null;
  metaJson: string;
}

interface EmailStats {
  total: number;
  sent: number;
  failed: number;
  queued: number;
  sent24h: number;
  failed24h: number;
  successRate24h: number | null;
}

// v4.58 — Configuration e-mail effective renvoyée par l'API
interface EmailConfig {
  from: string;
  provider: string;
  providerConfigured: boolean;
}

const TEMPLATE_META: Record<string, { label: string; emoji: string }> = {
  host_notification: { label: 'Notification hôte', emoji: '🔔' },
  guest_receipt: { label: 'Reçu invité', emoji: '🧾' },
  guest_refund: { label: 'Remboursement', emoji: '↩️' },
  welcome: { label: 'Bienvenue', emoji: '👋' },
  admin_password_reset: { label: 'Reset mot de passe', emoji: '🔑' },
  custom: { label: 'Personnalisé', emoji: '✉️' },
};

const PROVIDER_LABEL: Record<string, string> = {
  smtp: 'SMTP',
  resend: 'Resend',
  demo: 'Démo (non expédié)',
};

const dtf = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : dtf.format(d);
}

function statusChip(status: string) {
  switch (status) {
    case 'SENT':
      return { label: 'Envoyé', dot: '#34d399' };
    case 'FAILED':
      return { label: 'Échec', dot: '#f07d6a' };
    case 'QUEUED':
      return { label: 'En file', dot: '#fbbf24' };
    default:
      return { label: status, dot: '#8fa0c2' };
  }
}

export function AdminEmailsContent() {
  const [stats, setStats] = useState<EmailStats | null>(null);
  const [config, setConfig] = useState<EmailConfig | null>(null);
  const [items, setItems] = useState<EmailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState<{ id: string; subject: string; html: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryingBulk, setRetryingBulk] = useState(false);

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setLoading(true);
      try {
        const res = await fetch('/api/admin/emails?limit=100', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { stats: EmailStats; items: EmailRow[]; config?: EmailConfig };
        setStats(data.stats);
        setItems(data.items);
        if (data.config) setConfig(data.config);
      } catch (error) {
        console.error(error);
        toast.error('Impossible de charger les emails');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((e) => {
      if (statusFilter !== 'all' && e.status !== statusFilter) return false;
      if (!q) return true;
      return e.to.toLowerCase().includes(q) || e.subject.toLowerCase().includes(q);
    });
  }, [items, statusFilter, search]);

  const openPreview = useCallback(async (row: EmailRow) => {
    setPreview({ id: row.id, subject: row.subject, html: '' });
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/admin/emails?id=${encodeURIComponent(row.id)}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { email: { htmlBody: string } };
      setPreview({ id: row.id, subject: row.subject, html: data.email.htmlBody });
    } catch (error) {
      console.error(error);
      toast.error("Impossible de charger l'aperçu");
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const retry = useCallback(
    async (row: EmailRow) => {
      setRetryingId(row.id);
      try {
        const res = await fetch(`/api/admin/emails/retry?id=${encodeURIComponent(row.id)}`, {
          method: 'POST',
        });
        const data = (await res.json()) as { ok?: boolean; status?: string; provider?: string | null; error?: string };
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        if (data.ok) {
          toast.success(`Email renvoyé (${data.provider === 'demo' ? 'mode démo' : data.provider})`);
        } else {
          toast.error(data.error ?? 'Échec du renvoi');
        }
        await load({ silent: true });
      } catch (error) {
        console.error(error);
        toast.error(error instanceof Error ? error.message : 'Échec du renvoi');
      } finally {
        setRetryingId(null);
      }
    },
    [load],
  );

  // v4.163 — Renvoi EN MASSE de tous les échecs (provider réparé :
  // nouvelle clé Resend ou identifiants SMTP corrigés → un clic
  // récupère tous les emails bloqués, ex : confirmations EDL 535).
  const retryAllFailed = useCallback(
    async () => {
      if (retryingBulk) return;
      setRetryingBulk(true);
      try {
        const res = await fetch('/api/admin/emails/retry?all=failed', { method: 'POST' });
        const data = await res.json() as {
          ok?: boolean; bulk?: boolean; total?: number; sent?: number; failed?: number;
          errors?: { id: string; to: string; subject: string; error: string }[];
          error?: string;
        };
        if (!res.ok || !data.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        const total = data.total ?? 0;
        const sent = data.sent ?? 0;
        const failed = data.failed ?? 0;
        if (total === 0) {
          toast.info('Aucun email en échec à renvoyer');
        } else if (failed === 0) {
          toast.success(`${sent} email${sent > 1 ? 's' : ''} renvoyé${sent > 1 ? 's' : ''} avec succès ✅`);
        } else {
          const first = data.errors?.[0]?.error?.slice(0, 120);
          toast.warning(
            `${sent} envoyé${sent > 1 ? 's' : ''}, ${failed} toujours en échec${first ? ` — ex : ${first}` : ''}`,
          );
        }
        await load({ silent: true });
      } catch (error) {
        console.error(error);
        toast.error(error instanceof Error ? error.message : 'Échec du renvoi en masse');
      } finally {
        setRetryingBulk(false);
      }
    },
    [load, retryingBulk],
  );

  const kpis = [
    { label: 'Envoyés (24 h)', value: stats ? String(stats.sent24h) : '—', sub: stats ? `${stats.sent} au total` : '', variant: 'luxkpi-emerald' },
    { label: 'Échecs (24 h)', value: stats ? String(stats.failed24h) : '—', sub: stats ? `${stats.failed} au total` : '', variant: 'luxkpi-coral' },
    { label: 'En file', value: stats ? String(stats.queued) : '—', sub: 'à délivrer', variant: 'luxkpi-gold' },
    {
      label: 'Taux de succès (24 h)',
      value: stats?.successRate24h != null ? `${stats.successRate24h} %` : '—',
      sub: stats && stats.total > 0 ? `${stats.total} emails journalisés` : 'aucun email',
      variant: 'luxkpi-sapphire',
    },
  ];

  return (
    <div className="space-y-6">
      {/* ----- En-tête ----- */}
      <div>
        <p className="lux-eyebrow">Console plateforme</p>
        <h1 className="lux-display mt-2 text-2xl font-semibold text-white sm:text-3xl">Emails transactionnels</h1>
        <p className="mt-2 text-sm text-[#8fa0c2]">
          Outbox des notifications et reçus — provider configurable dans l&apos;onglet
          Configuration (SMTP ou Resend), sinon mode démo en dev.
        </p>
        {config && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="lux-chip">
              <span className="font-semibold text-white">Expéditeur :</span> {config.from}
            </span>
            <span className="lux-chip">
              <span className="lux-dot" style={{ backgroundColor: '#34d399' }} aria-hidden="true" />
              Notifications expédiées par la plateforme — les hôtes n&apos;ont rien à configurer
            </span>
            {config.provider === 'resend' && !config.providerConfigured && (
              <span className="lux-chip">
                <span className="lux-dot" style={{ backgroundColor: '#f07d6a' }} aria-hidden="true" />
                Provider Resend sélectionné mais clé API manquante — voir Configuration
              </span>
            )}
            {config.provider === 'smtp' && !config.providerConfigured && (
              <span className="lux-chip">
                <span className="lux-dot" style={{ backgroundColor: '#f07d6a' }} aria-hidden="true" />
                Provider SMTP sélectionné mais hôte/port manquants — voir Configuration
              </span>
            )}
            {config.provider === 'none' && (
              <span className="lux-chip">
                <span className="lux-dot" style={{ backgroundColor: '#f07d6a' }} aria-hidden="true" />
                Aucun provider configuré — voir Configuration
              </span>
            )}
          </div>
        )}
      </div>

      <Tabs defaultValue="journal">
        <TabsList className={LUX_TABS_LIST}>
          <TabsTrigger value="journal" className={LUX_TABS_TRIGGER}>Journal d&apos;envoi</TabsTrigger>
          <TabsTrigger value="templates" className={LUX_TABS_TRIGGER}>Modèles</TabsTrigger>
          <TabsTrigger value="config" className={LUX_TABS_TRIGGER}>Configuration</TabsTrigger>
        </TabsList>

        {/* ----- Onglet Journal d'envoi (outbox) ----- */}
        <TabsContent value="journal" className="mt-6 space-y-6">
            <div className="flex flex-wrap items-center justify-end gap-2">
              {stats && stats.failed > 0 && (
                <Button
                  variant="outline"
                  onClick={() => void retryAllFailed()}
                  disabled={retryingBulk}
                  className="rounded-full! border-[#f07d6a]/40! bg-[#f07d6a]/10! px-4! text-xs! font-semibold text-[#f07d6a]! hover:bg-[#f07d6a]/20! hover:text-[#f07d6a]!"
                  aria-label="Renvoyer tous les emails en échec"
                >
                  {retryingBulk ? 'Renvoi en cours…' : `Renvoyer tous les échecs (${stats.failed})`}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => void load()}
                className="rounded-full! border-white/10! bg-white/[0.04]! px-4! text-xs! font-semibold text-white! hover:bg-white/[0.08]! hover:text-white!"
                aria-label="Rafraîchir la liste"
              >
                Actualiser
              </Button>
            </div>

            {/* ----- KPIs ----- */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          {kpis.map((kpi) => (
            <div key={kpi.label} className={`luxkpi ${kpi.variant}`}>
              <p className="luxkpi-label">{kpi.label}</p>
              <p className="luxkpi-value mt-2 text-3xl">{kpi.value}</p>
              <p className="mt-1.5 truncate text-xs text-white/60">{kpi.sub}</p>
            </div>
          ))}
        </div>

        {/* ----- Filtres ----- */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className={`w-full sm:w-48 ${LUX_SELECT_TRIGGER}`} aria-label="Filtrer par statut">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent className={LUX_SELECT_CONTENT}>
              <SelectItem value="all" className={LUX_SELECT_ITEM}>Tous les statuts</SelectItem>
              <SelectItem value="SENT" className={LUX_SELECT_ITEM}>Envoyés</SelectItem>
              <SelectItem value="FAILED" className={LUX_SELECT_ITEM}>Échecs</SelectItem>
              <SelectItem value="QUEUED" className={LUX_SELECT_ITEM}>En file</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un destinataire ou un sujet…"
            className={`flex-1 ${LUX_FIELD}`}
            aria-label="Rechercher un email"
          />
        </div>

        {/* ----- Outbox ----- */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02]">
          {loading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full bg-white/8" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="lux-empty m-4 rounded-2xl px-4 py-10 text-center">
              <p className="text-sm font-semibold text-white">Aucun email</p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-[#8fa0c2]">
                Les notifications d&apos;équipe, reçus de paiement et remboursements apparaîtront ici automatiquement.
              </p>
            </div>
          ) : (
            <div className="lux-scroll max-h-96 overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-[#0d1530]">
                  <TableRow className="border-white/8 hover:bg-transparent">
                    <TableHead className="lux-eyebrow text-[9.5px]!">Destinataire</TableHead>
                    <TableHead className="lux-eyebrow text-[9.5px]! hidden md:table-cell">Sujet</TableHead>
                    <TableHead className="lux-eyebrow text-[9.5px]! hidden lg:table-cell">Type</TableHead>
                    <TableHead className="lux-eyebrow text-[9.5px]!">Statut</TableHead>
                    <TableHead className="lux-eyebrow text-[9.5px]! hidden sm:table-cell">Date</TableHead>
                    <TableHead className="lux-eyebrow text-[9.5px]! text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => {
                    const chip = statusChip(row.status);
                    const tplMeta = TEMPLATE_META[row.template] ?? { label: row.template, emoji: '✉️' };
                    return (
                      <TableRow key={row.id} className="border-white/8 hover:bg-white/[0.04]">
                        <TableCell className="max-w-40">
                          <p className="truncate text-sm font-medium text-white" title={row.to}>
                            {row.to}
                          </p>
                          <p className="truncate text-xs text-[#8fa0c2] sm:hidden" title={row.subject}>
                            {row.subject}
                          </p>
                          {row.status === 'FAILED' && row.lastError ? (
                            <p className="mt-0.5 max-w-56 truncate text-[11px] text-[#f07d6a]" title={row.lastError}>
                              {row.lastError}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="hidden max-w-64 md:table-cell">
                          <p className="truncate text-sm text-white/85" title={row.subject}>
                            {row.subject}
                          </p>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <span className="lux-chip px-2! py-0.5! text-[10px]!">{tplMeta.label}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className="lux-chip w-fit px-2! py-0.5! text-[10px]!">
                              <span className="lux-dot" style={{ backgroundColor: chip.dot }} aria-hidden="true" />
                              {chip.label}
                            </span>
                            <span className="text-[11px] text-[#8fa0c2]/70">
                              {row.provider ? (PROVIDER_LABEL[row.provider] ?? row.provider) : '—'}
                              {row.attempts > 1 ? ` · ${row.attempts} tentatives` : ''}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden whitespace-nowrap text-sm text-[#8fa0c2] sm:table-cell">
                          {fmtDate(row.sentAt ?? row.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void openPreview(row)}
                              aria-label={`Aperçu de « ${row.subject} »`}
                              className="h-8 rounded-full! px-3! text-xs! text-[#8fa0c2]! hover:bg-white/[0.08]! hover:text-white!"
                            >
                              Aperçu
                            </Button>
                            {row.status !== 'SENT' ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void retry(row)}
                                disabled={retryingId === row.id}
                                aria-label={`Réessayer « ${row.subject} »`}
                                className="h-8 rounded-full! border-white/10! bg-white/[0.04]! px-3! text-xs! font-semibold text-white! hover:bg-white/[0.08]! hover:text-white!"
                              >
                                Réessayer
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* ----- Aperçu HTML ----- */}
        <Dialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
          <DialogContent className="max-w-2xl border-white/10! bg-[#0b1226]! text-white!">
            <DialogHeader>
              <DialogTitle className="lux-display pr-6 text-left text-xl font-semibold text-white">{preview?.subject}</DialogTitle>
              <DialogDescription className="text-left text-[#8fa0c2]!">
                Aperçu du rendu HTML envoyé au destinataire.
              </DialogDescription>
            </DialogHeader>
            {previewLoading || !preview?.html ? (
              <div className="flex h-96 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03]">
                <Skeleton className="h-8 w-48 bg-white/8" />
              </div>
            ) : (
              <iframe
                title={`Aperçu : ${preview.subject}`}
                srcDoc={preview.html}
                sandbox=""
                className="h-96 w-full rounded-lg border border-white/10 bg-white"
              />
            )}
          </DialogContent>
        </Dialog>
        </TabsContent>

        {/* ----- Onglet Modèles (FIX-12) ----- */}
        <TabsContent value="templates" className="mt-6">
          <EmailTemplatesTab />
        </TabsContent>

        {/* ----- Onglet Configuration (v4.56) ----- */}
        <TabsContent value="config" className="mt-6">
          <EmailConfigTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =============================================================
// EmailConfigTab — v4.56/4.57/4.58 : configuration e-mail éditable
// depuis la Console Superadmin. Persistance : table system_settings
// (priorité base de données > variable d'environnement > défaut).
//  - Expéditeur (From) de TOUS les emails sortants — boîte système
//    notifications@… : les hôtes/invités reçoivent les notifications
//    DE la plateforme, sans rien configurer (v4.58, clarification) ;
//  - Provider d'envoi (SMTP, identifiants compris) + envoi
//    d'un email de TEST pour valider en 1 clic (v4.57).
// =============================================================

interface EmailConfigState {
  from: string;
  fromSource: 'database' | 'env' | 'default';
  fromOverride: string;
  adminEmail: string;
  provider: 'smtp' | 'resend' | 'none';
  providerSource: 'database' | 'env' | 'default';
  providerConfigured: boolean;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPassSet: boolean;
  smtpPassMasked: string;
  smtpFromDb: boolean;
  resendKeySet: boolean;
  resendKeyMasked: string;
  resendFromDb: boolean;
}

const SOURCE_META: Record<string, { label: string; dot: string }> = {
  database: { label: 'Config Superadmin', dot: '#34d399' },
  env: { label: "Variable d'environnement", dot: '#5c8af0' },
  default: { label: 'Défaut', dot: '#8fa0c2' },
};

function sourceChip(source: string | undefined) {
  const meta = SOURCE_META[source ?? 'default'] ?? SOURCE_META.default;
  return (
    <span className="lux-chip px-2! py-0.5! text-[10px]!">
      <span className="lux-dot" style={{ backgroundColor: meta.dot }} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

function EmailConfigTab() {
  const [cfg, setCfg] = useState<EmailConfigState | null>(null);
  const [loading, setLoading] = useState(true);
  const [fromInput, setFromInput] = useState('');
  const [providerInput, setProviderInput] = useState<'none' | 'smtp' | 'resend'>('none');
  const [smtpHostInput, setSmtpHostInput] = useState('');
  const [smtpPortInput, setSmtpPortInput] = useState('');
  const [smtpUserInput, setSmtpUserInput] = useState('');
  const [smtpPassInput, setSmtpPassInput] = useState('');
  const [resendKeyInput, setResendKeyInput] = useState('');
  const [testTo, setTestTo] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/emails/config', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as EmailConfigState;
      setCfg(data);
      setFromInput(data.fromOverride);
      setProviderInput(data.provider === 'smtp' || data.provider === 'resend' ? data.provider : 'none');
      setSmtpHostInput(data.smtpHost ?? '');
      setSmtpPortInput(data.smtpPort ?? '');
      setSmtpUserInput(data.smtpUser ?? '');
      setSmtpPassInput('');
      setResendKeyInput('');
      setTestTo(data.adminEmail || '');
    } catch (error) {
      console.error(error);
      toast.error('Impossible de charger la configuration e-mail');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      // Secrets : envoyés UNIQUEMENT si l'admin a saisi quelque chose
      // (sinon la valeur existante — DB ou env — est conservée).
      const body: Record<string, string> = {
        from: fromInput,
        provider: providerInput === 'none' ? '' : providerInput,
        smtpHost: smtpHostInput,
        smtpPort: smtpPortInput,
        smtpUser: smtpUserInput,
      };
      if (smtpPassInput.trim()) body.smtpPass = smtpPassInput.trim();
      if (resendKeyInput.trim()) body.resendApiKey = resendKeyInput.trim();

      const res = await fetch('/api/admin/emails/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as EmailConfigState & { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setCfg(data);
      setFromInput(data.fromOverride);
      setProviderInput(data.provider === 'smtp' || data.provider === 'resend' ? data.provider : 'none');
      setSmtpHostInput(data.smtpHost ?? '');
      setSmtpPortInput(data.smtpPort ?? '');
      setSmtpUserInput(data.smtpUser ?? '');
      setSmtpPassInput('');
      setResendKeyInput('');
      toast.success('Configuration e-mail enregistrée — effective immédiatement');
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Échec de la sauvegarde');
    } finally {
      setSaving(false);
    }
  }, [fromInput, providerInput, smtpHostInput, smtpPortInput, smtpUserInput, smtpPassInput, resendKeyInput]);

  const sendTest = useCallback(async () => {
    const to = testTo.trim();
    if (!to || !to.includes('@')) {
      toast.error('Renseignez une adresse email de destination valide');
      return;
    }
    setSendingTest(true);
    try {
      const res = await fetch('/api/admin/emails/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to }),
      });
      const data = (await res.json()) as { ok?: boolean; status?: string; provider?: string | null; error?: string | null };
      if (data.ok) {
        toast.success(`Email de test envoyé à ${to} ✅ (${data.provider === 'demo' ? 'mode démo — aucun envoi réel en dev' : `via ${data.provider ?? 'provider'}`})`);
      } else {
        toast.error(`Échec de l'envoi test : ${data.error ?? data.status ?? 'erreur inconnue'}`);
      }
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Échec de l’envoi de test');
    } finally {
      setSendingTest(false);
    }
  }, [testTo]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full rounded-xl bg-white/8" />
        <Skeleton className="h-40 w-full rounded-xl bg-white/8" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ----- Expéditeur ----- */}
      <div className="lux-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="lux-display text-lg font-semibold text-white">Expéditeur des emails</h2>
          {sourceChip(cfg?.fromSource)}
        </div>
        <p className="mt-1 text-sm text-[#8fa0c2]">
          Adresse utilisée pour <strong>tous</strong> les emails sortants — notifications hôtes (ménage,
          stock, pressing, check-out…), emails invités, reçus. Format libre :{' '}
          <code className="rounded bg-white/10 px-1 font-mono text-[#c7d3ea]">Nom &lt;email@domaine&gt;</code> ou{' '}
          <code className="rounded bg-white/10 px-1 font-mono text-[#c7d3ea]">email@domaine</code>.
        </p>
        <div className="mt-4 space-y-2">
          <Label htmlFor="email-from">Expéditeur (laisser vide = défaut)</Label>
          <Input
            id="email-from"
            value={fromInput}
            onChange={(e) => setFromInput(e.target.value)}
            placeholder={cfg?.from ?? 'RoomScan <notifications@roomscan.pro>'}
            autoComplete="off"
            className={LUX_FIELD}
          />
          <p className="text-xs text-[#8fa0c2]">
            Valeur effective actuelle : <span className="font-medium text-white">{cfg?.from}</span>
          </p>
          <p className="rounded-lg border border-[#34d399]/25 bg-[#34d399]/10 p-3 text-xs text-[#86e9cb]">
            Les notifications sont expédiées <strong>par cette boîte plateforme</strong> vers les mails
            des hôtes et des invités — <strong>l&apos;hôte n&apos;a jamais besoin de connecter son propre
            email</strong>, tout part automatiquement du système.
          </p>
        </div>
      </div>

      {/* ----- Provider d'envoi (v4.57) ----- */}
      <div className="lux-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="lux-display text-lg font-semibold text-white">Provider d&apos;envoi</h2>
          <div className="flex items-center gap-2">
            {sourceChip(cfg?.providerSource)}
            {cfg?.providerConfigured ? (
              <span className="lux-chip px-2! py-0.5! text-[10px]!">
                <span className="lux-dot" style={{ backgroundColor: '#34d399' }} aria-hidden="true" />
                opérationnel
              </span>
            ) : (
              <span className="lux-chip px-2! py-0.5! text-[10px]!">
                <span className="lux-dot" style={{ backgroundColor: '#f07d6a' }} aria-hidden="true" />
                non configuré
              </span>
            )}
          </div>
        </div>
        <p className="mt-1 text-sm text-[#8fa0c2]">
          Le service qui expédie physiquement les emails. Sans provider, les emails sont en échec en
          production (consultables dans le journal d&apos;envoi ci-dessus).
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="email-provider">Service</Label>
            <Select
              value={providerInput}
              onValueChange={(v) => setProviderInput(v as 'none' | 'smtp' | 'resend')}
            >
              <SelectTrigger id="email-provider" className={`w-full ${LUX_SELECT_TRIGGER}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={LUX_SELECT_CONTENT}>
                <SelectItem value="resend" className={LUX_SELECT_ITEM}>Resend (recommandé — API directe, réception garantie)</SelectItem>
                <SelectItem value="smtp" className={LUX_SELECT_ITEM}>SMTP (Gmail, OVH, Brevo, serveur dédié…)</SelectItem>
                <SelectItem value="none" className={LUX_SELECT_ITEM}>Aucun (mode démo / échec en prod)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {providerInput === 'smtp' && (
          <div className="mt-4 space-y-3 rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="email-smtp-host">Serveur</Label>
                <Input
                  id="email-smtp-host"
                  value={smtpHostInput}
                  onChange={(e) => setSmtpHostInput(e.target.value)}
                  placeholder="smtp.gmail.com"
                  autoComplete="off"
                  className={LUX_FIELD}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email-smtp-port">Port</Label>
                <Input
                  id="email-smtp-port"
                  value={smtpPortInput}
                  onChange={(e) => setSmtpPortInput(e.target.value)}
                  placeholder="587"
                  inputMode="numeric"
                  autoComplete="off"
                  className={LUX_FIELD}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email-smtp-user">Utilisateur</Label>
                <Input
                  id="email-smtp-user"
                  value={smtpUserInput}
                  onChange={(e) => setSmtpUserInput(e.target.value)}
                  placeholder="souvent = votre email"
                  autoComplete="off"
                  className={LUX_FIELD}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email-smtp-pass">Mot de passe / mot de passe d&apos;application</Label>
              <Input
                id="email-smtp-pass"
                type="password"
                value={smtpPassInput}
                onChange={(e) => setSmtpPassInput(e.target.value)}
                placeholder={cfg?.smtpPassSet ? `Configuré (${cfg.smtpPassMasked}) — laissez vide pour conserver` : '••••••••'}
                autoComplete="new-password"
                className={LUX_FIELD}
              />
              <p className="text-xs text-[#8fa0c2]">
                Gmail : activez la validation en 2 étapes puis créez un « mot de passe d&apos;application ».
                Port 587 (TLS) ou 465 (SSL direct).
              </p>
            </div>
          </div>
        )}

        {providerInput === 'resend' && (
          <div className="mt-4 space-y-3 rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <div className="space-y-1.5">
              <Label htmlFor="email-resend-key">Clé API Resend</Label>
              <Input
                id="email-resend-key"
                type="password"
                value={resendKeyInput}
                onChange={(e) => setResendKeyInput(e.target.value)}
                placeholder={cfg?.resendKeySet ? `Configurée (${cfg.resendKeyMasked}) — laissez vide pour conserver` : 're_… (resend.com → API Keys)'}
                autoComplete="new-password"
                className={LUX_FIELD}
              />
              <p className="text-xs text-[#8fa0c2]">
                Créez la clé sur <strong>resend.com → API Keys → Create API Key</strong>. Resend
                n&apos;affiche une clé qu&apos;<strong>une seule fois</strong>, à sa création : si votre
                ancienne clé n&apos;est plus copiable (affichée <code className="rounded bg-white/10 px-1 font-mono text-[#c7d3ea]">re_****…</code>),
                c&apos;est normal — créez simplement une <strong>nouvelle clé</strong> (les anciennes
                restent valables, vous pourrez les supprimer ensuite). Collez-la ici puis
                enregistrez : effet immédiat, sans redéploiement.
              </p>
              <p className="text-xs text-[#fbbf24]">
                Important : vérifiez le domaine <strong>roomscan.pro</strong> dans Resend → Domains
                (ajoutez les enregistrements DNS fournis) pour expédier depuis{' '}
                <code className="rounded bg-white/10 px-1 font-mono text-[#c7d3ea]">notifications@roomscan.pro</code>.
                Sans domaine vérifié, Resend refuse l&apos;envoi vers vos hôtes et invités (compte
                restreint : uniquement vers l&apos;email du compte Resend).
              </p>
            </div>
          </div>
        )}

        {providerInput === 'none' && (
          <p className="mt-3 rounded-lg border border-[#fbbf24]/25 bg-[#fbbf24]/10 p-3 text-xs text-[#fcd34d]">
            Aucun provider sélectionné : en développement les emails sont journalisés en « mode
            démo » (consultables ci-dessus), en production ils passent en échec.
          </p>
        )}
      </div>

      {/* ----- Email de test (v4.57) ----- */}
      <div className="lux-card p-5">
        <h2 className="lux-display text-lg font-semibold text-white">Tester l&apos;envoi</h2>
        <p className="mt-1 text-sm text-[#8fa0c2]">
          Envoie un email de test via le provider configuré ci-dessus, exactement comme les vrais
          emails (mêmes expéditeur et route d&apos;envoi).
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Input
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="destinataire@domaine.fr"
            type="email"
            className={`sm:max-w-xs ${LUX_FIELD}`}
            autoComplete="off"
          />
          <Button
            variant="outline"
            onClick={() => void sendTest()}
            disabled={sendingTest || saving}
            className="rounded-full! border-white/10! bg-white/[0.04]! px-4! text-xs! font-semibold text-white! hover:bg-white/[0.08]! hover:text-white!"
          >
            {sendingTest ? 'Envoi en cours…' : 'Envoyer un email de test'}
          </Button>
        </div>
        <p className="mt-2 text-xs text-[#8fa0c2]/70">
          Astuce : enregistrez d&apos;abord la configuration, puis envoyez le test.
        </p>
      </div>

      {/* ----- Sauvegarde ----- */}
      <div className="lux-card flex flex-wrap items-center justify-end gap-2 p-5">
        <Button
          variant="outline"
          onClick={() => void load()}
          disabled={saving}
          className="rounded-full! border-white/10! bg-white/[0.04]! px-4! text-xs! font-semibold text-[#8fa0c2]! hover:bg-white/[0.08]! hover:text-white!"
        >
          Annuler
        </Button>
        <Button onClick={() => void save()} disabled={saving} className="lux-btn h-9 rounded-full px-4 text-xs">
          {saving ? 'Enregistrement…' : 'Enregistrer la configuration'}
        </Button>
      </div>
    </div>
  );
}

// =============================================================
// Onglet « Modèles » (FIX-12) — éditeur des templates DB
// (email_templates) consommés en priorité par le rendu réel des
// emails (lib/email-template-render.ts, fallback = template dur).
// Liste (key, sujet, actif, updatedAt) + dialog d'édition
// (sujet, corps HTML monospace, variables réelles) + PUT.
// =============================================================

interface TemplateRow {
  id: string;
  key: string;
  subject: string;
  description: string | null;
  isActive: boolean;
  updatedAt: string;
  variables: string[];
}

function EmailTemplatesTab() {
  const [items, setItems] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<TemplateRow | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editHtml, setEditHtml] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);

  const load = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setLoading(true);
    try {
      const res = await fetch('/api/admin/email-templates', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { items: TemplateRow[] };
      setItems(data.items);
    } catch (error) {
      console.error(error);
      toast.error('Impossible de charger les modèles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openEdit = useCallback(async (row: TemplateRow) => {
    setEditing(row);
    setEditSubject(row.subject);
    setEditHtml('');
    setEditLoading(true);
    try {
      const res = await fetch(`/api/admin/email-templates/${encodeURIComponent(row.key)}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { template: { htmlBody: string; subject: string } };
      setEditHtml(data.template.htmlBody);
      setEditSubject(data.template.subject);
    } catch (error) {
      console.error(error);
      toast.error("Impossible de charger le modèle");
      setEditing(null);
    } finally {
      setEditLoading(false);
    }
  }, []);

  const save = useCallback(async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/email-templates/${encodeURIComponent(editing.key)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: editSubject, htmlBody: editHtml }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast.success(`Modèle « ${editing.key} » enregistré ✅`);
      setEditing(null);
      await load({ silent: true });
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Échec de l'enregistrement");
    } finally {
      setSaving(false);
    }
  }, [editing, editSubject, editHtml, load]);

  const toggleActive = useCallback(
    async (row: TemplateRow) => {
      setTogglingKey(row.key);
      try {
        const res = await fetch(`/api/admin/email-templates/${encodeURIComponent(row.key)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive: !row.isActive }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        toast.success(row.isActive ? `Modèle « ${row.key} » désactivé` : `Modèle « ${row.key} » activé`);
        await load({ silent: true });
      } catch (error) {
        console.error(error);
        toast.error(error instanceof Error ? error.message : 'Échec de la modification');
      } finally {
        setTogglingKey(null);
      }
    },
    [load],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h2 className="lux-display text-lg font-semibold text-white">Modèles d&apos;emails</h2>
          <span className="lux-chip px-2! py-0.5! text-[10px]!">{items.length}</span>
        </div>
        <p className="text-xs text-[#8fa0c2]">
          Les envois réels utilisent en priorité ces modèles (sujet + corps HTML, variables{' '}
          <code className="rounded bg-white/10 px-1 font-mono text-[11px] text-[#c7d3ea]">{'{{variable}}'}</code>) —
          sinon repli automatique sur le template intégré.
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02]">
        {loading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full bg-white/8" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="lux-empty m-4 rounded-2xl px-4 py-10 text-center">
            <p className="text-sm font-semibold text-white">Aucun modèle</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-[#8fa0c2]">
              Exécutez <code className="rounded bg-white/10 px-1 font-mono">bun run scripts/seed-email-templates.ts</code>{' '}
              pour importer les modèles intégrés.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-white/8 hover:bg-transparent">
                <TableHead className="lux-eyebrow text-[9.5px]!">Modèle</TableHead>
                <TableHead className="lux-eyebrow text-[9.5px]! hidden md:table-cell">Sujet</TableHead>
                <TableHead className="lux-eyebrow text-[9.5px]!">Statut</TableHead>
                <TableHead className="lux-eyebrow text-[9.5px]! hidden sm:table-cell">Mis à jour</TableHead>
                <TableHead className="lux-eyebrow text-[9.5px]! text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow key={row.id} className="border-white/8 hover:bg-white/[0.04]">
                  <TableCell>
                    <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs text-[#c7d3ea]">
                      {row.key}
                    </code>
                    {row.variables.length > 0 ? (
                      <p className="mt-1 max-w-56 truncate text-[11px] text-[#8fa0c2]/70" title={row.variables.map((v) => `{{${v}}}`).join(' ')}>
                        {row.variables.map((v) => `{{${v}}}`).join(' ')}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="hidden max-w-72 md:table-cell">
                    <p className="truncate text-sm text-white/85" title={row.subject}>
                      {row.subject}
                    </p>
                  </TableCell>
                  <TableCell>
                    <span className="lux-chip px-2! py-0.5! text-[10px]!">
                      <span
                        className="lux-dot"
                        style={{ backgroundColor: row.isActive ? '#34d399' : '#8fa0c2' }}
                        aria-hidden="true"
                      />
                      {row.isActive ? 'Actif' : 'Inactif'}
                    </span>
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-sm text-[#8fa0c2] sm:table-cell">
                    {fmtDate(row.updatedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void openEdit(row)}
                        aria-label={`Modifier le modèle ${row.key}`}
                        className="h-8 rounded-full! px-3! text-xs! text-[#8fa0c2]! hover:bg-white/[0.08]! hover:text-white!"
                      >
                        Modifier
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void toggleActive(row)}
                        disabled={togglingKey === row.key}
                        aria-label={row.isActive ? `Désactiver le modèle ${row.key}` : `Activer le modèle ${row.key}`}
                        className="h-8 rounded-full! border-white/10! bg-white/[0.04]! px-3! text-xs! font-semibold text-white! hover:bg-white/[0.08]! hover:text-white!"
                      >
                        {row.isActive ? 'Désactiver' : 'Activer'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* ----- Dialog d'édition ----- */}
      <Dialog open={editing !== null} onOpenChange={(open) => !open && !saving && setEditing(null)}>
        <DialogContent className="max-w-3xl border-white/10! bg-[#0b1226]! text-white!">
          <DialogHeader>
            <DialogTitle className="lux-display pr-6 text-left text-xl font-semibold text-white">
              Modifier le modèle <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-sm text-[#c7d3ea]">{editing?.key}</code>
            </DialogTitle>
            <DialogDescription className="text-left text-[#8fa0c2]!">
              {editing?.description ?? 'Sujet et corps HTML envoyés aux destinataires.'}
            </DialogDescription>
          </DialogHeader>

          {editLoading ? (
            <div className="space-y-3 py-2">
              <Skeleton className="h-9 w-full bg-white/8" />
              <Skeleton className="h-72 w-full bg-white/8" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="template-subject">Sujet</Label>
                <Input
                  id="template-subject"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  className={LUX_FIELD}
                  maxLength={300}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="template-html">Corps HTML</Label>
                <Textarea
                  id="template-html"
                  value={editHtml}
                  onChange={(e) => setEditHtml(e.target.value)}
                  rows={14}
                  spellCheck={false}
                  className={`${LUX_FIELD} font-mono text-xs leading-relaxed`}
                  aria-label="Corps HTML du modèle"
                />
              </div>
              {editing && editing.variables.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-medium text-[#8fa0c2]">Variables réelles :</span>
                  {editing.variables.map((v) => (
                    <code
                      key={v}
                      className="rounded border border-[#34d399]/25 bg-[#34d399]/10 px-1.5 py-0.5 font-mono text-[11px] text-[#86e9cb]"
                    >
                      {`{{${v}}}`}
                    </code>
                  ))}
                </div>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setEditing(null)}
                  disabled={saving}
                  className="rounded-full! border-white/10! bg-white/[0.04]! px-4! text-xs! font-semibold text-[#8fa0c2]! hover:bg-white/[0.08]! hover:text-white!"
                >
                  Annuler
                </Button>
                <Button
                  onClick={() => void save()}
                  disabled={saving || !editSubject.trim() || !editHtml.trim()}
                  className="lux-btn h-9 rounded-full px-4 text-xs"
                >
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
