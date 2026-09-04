'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Eye, RefreshCw, RotateCcw, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

// =============================================================
// AdminEmailsContent — ÉTAPE 22 : console des emails transactionnels.
//  - Stats d'envoi (24 h + globales)
//  - Outbox filtrable par statut, recherche destinataire/sujet
//  - Aperçu HTML (iframe sandboxée) + Réessai des emails en échec
// =============================================================

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

const TEMPLATE_META: Record<string, { label: string; emoji: string }> = {
  host_notification: { label: 'Notification hôte', emoji: '🔔' },
  guest_receipt: { label: 'Reçu invité', emoji: '🧾' },
  guest_refund: { label: 'Remboursement', emoji: '↩️' },
  custom: { label: 'Personnalisé', emoji: '✉️' },
};

const PROVIDER_LABEL: Record<string, string> = {
  resend: 'Resend',
  smtp: 'SMTP',
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
      return { label: 'Envoyé', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'FAILED':
      return { label: 'Échec', cls: 'bg-red-50 text-red-700 border-red-200' };
    case 'QUEUED':
      return { label: 'En file', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
    default:
      return { label: status, cls: 'bg-slate-50 text-slate-600 border-slate-200' };
  }
}

export function AdminEmailsContent() {
  const [stats, setStats] = useState<EmailStats | null>(null);
  const [items, setItems] = useState<EmailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState<{ id: string; subject: string; html: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setLoading(true);
      try {
        const res = await fetch('/api/admin/emails?limit=100', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { stats: EmailStats; items: EmailRow[] };
        setStats(data.stats);
        setItems(data.items);
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

  const kpis = [
    { label: 'Envoyés (24 h)', value: stats ? String(stats.sent24h) : '—', sub: stats ? `${stats.sent} au total` : '', accent: 'text-emerald-600' },
    { label: 'Échecs (24 h)', value: stats ? String(stats.failed24h) : '—', sub: stats ? `${stats.failed} au total` : '', accent: 'text-red-600' },
    { label: 'En file', value: stats ? String(stats.queued) : '—', sub: 'à délivrer', accent: 'text-amber-600' },
    {
      label: 'Taux de succès (24 h)',
      value: stats?.successRate24h != null ? `${stats.successRate24h} %` : '—',
      sub: stats && stats.total > 0 ? `${stats.total} emails journalisés` : 'aucun email',
      accent: 'text-slate-900',
    },
  ];

  return (
    <div className="space-y-6">
      {/* ----- En-tête ----- */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Emails transactionnels</h1>
          <p className="mt-1 text-sm text-slate-500">
            Outbox des notifications et reçus — Providers : Resend / SMTP, sinon mode démo en dev.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} className="bg-white" aria-label="Rafraîchir la liste">
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          Actualiser
        </Button>
      </div>

      {/* ----- KPIs ----- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">{kpi.label}</p>
            <p className={cn('mt-1.5 text-2xl font-bold sm:text-3xl', kpi.accent)}>{kpi.value}</p>
            <p className="mt-1 truncate text-xs text-slate-400">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* ----- Filtres ----- */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full bg-white sm:w-48" aria-label="Filtrer par statut">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="SENT">Envoyés</SelectItem>
            <SelectItem value="FAILED">Échecs</SelectItem>
            <SelectItem value="QUEUED">En file</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un destinataire ou un sujet…"
            className="pl-9 bg-white"
            aria-label="Rechercher un email"
          />
        </div>
      </div>

      {/* ----- Outbox ----- */}
      <div className="rounded-xl border border-slate-200 bg-white">
        {loading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
            <span className="text-3xl" aria-hidden="true">📭</span>
            <p className="text-sm font-medium text-slate-700">Aucun email</p>
            <p className="max-w-sm text-xs text-slate-500">
              Les notifications d&apos;équipe, reçus de paiement et remboursements apparaîtront ici automatiquement.
            </p>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-white">
                <TableRow>
                  <TableHead>Destinataire</TableHead>
                  <TableHead className="hidden md:table-cell">Sujet</TableHead>
                  <TableHead className="hidden lg:table-cell">Type</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="hidden sm:table-cell">Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => {
                  const chip = statusChip(row.status);
                  const tplMeta = TEMPLATE_META[row.template] ?? { label: row.template, emoji: '✉️' };
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="max-w-40">
                        <p className="truncate text-sm font-medium text-slate-900" title={row.to}>
                          {row.to}
                        </p>
                        <p className="truncate text-xs text-slate-500 sm:hidden" title={row.subject}>
                          {row.subject}
                        </p>
                        {row.status === 'FAILED' && row.lastError ? (
                          <p className="mt-0.5 max-w-56 truncate text-[11px] text-red-500" title={row.lastError}>
                            {row.lastError}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="hidden max-w-64 md:table-cell">
                        <p className="truncate text-sm text-slate-700" title={row.subject}>
                          {row.subject}
                        </p>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                          <span aria-hidden="true">{tplMeta.emoji}</span>
                          <span className="ml-1">{tplMeta.label}</span>
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className={cn('inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold', chip.cls)}>
                            {chip.label}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {row.provider ? (PROVIDER_LABEL[row.provider] ?? row.provider) : '—'}
                            {row.attempts > 1 ? ` · ${row.attempts} tentatives` : ''}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap text-sm text-slate-500 sm:table-cell">
                        {fmtDate(row.sentAt ?? row.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void openPreview(row)}
                            aria-label={`Aperçu de « ${row.subject} »`}
                            className="h-8 px-2"
                          >
                            <Eye className="h-4 w-4" />
                            <span className="sr-only sm:not-sr-only sm:ml-1 sm:text-xs">Aperçu</span>
                          </Button>
                          {row.status !== 'SENT' ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void retry(row)}
                              disabled={retryingId === row.id}
                              aria-label={`Réessayer « ${row.subject} »`}
                              className="h-8 bg-white px-2"
                            >
                              <RotateCcw className={cn('h-4 w-4', retryingId === row.id && 'animate-spin')} />
                              <span className="ml-1 text-xs">Réessayer</span>
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="pr-6 text-left text-slate-900">{preview?.subject}</DialogTitle>
            <DialogDescription className="text-left">
              Aperçu du rendu HTML envoyé au destinataire.
            </DialogDescription>
          </DialogHeader>
          {previewLoading || !preview?.html ? (
            <div className="flex h-96 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
              <Skeleton className="h-8 w-48" />
            </div>
          ) : (
            <iframe
              title={`Aperçu : ${preview.subject}`}
              srcDoc={preview.html}
              sandbox=""
              className="h-96 w-full rounded-lg border border-slate-200 bg-white"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
