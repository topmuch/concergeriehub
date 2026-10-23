'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

// =============================================================
// AdminLogsContent — Module 8 Logs & Tickets
//  - Audit : journal des actions Superadmin (audit_logs réels)
//  - Scans : analytics réels des scans QR (scan_logs)
//  - Tickets : support (création, changement de statut — audité)
// Design v5.2 « Saphir Luxe » : sombre bleuté, sans icônes.
// =============================================================

// ---------- Design « Saphir Luxe » : champs & portails sombres ----------
const LUX_FIELD =
  'rounded-xl! border-white/12! bg-white/[0.04]! text-white! placeholder:text-[#8fabc2]/60! focus-visible:ring-[#5cadf0]/50!';
const LUX_SELECT_TRIGGER =
  'rounded-xl! border-white/12! bg-white/[0.04]! text-white! focus-visible:ring-[#5cadf0]/50!';
const LUX_SELECT_CONTENT = 'border-white/10! bg-[#0b1226]! text-white!';
const LUX_SELECT_ITEM = 'focus:bg-white/8! focus:text-white!';
const LUX_TABS_LIST = 'h-auto rounded-full! border border-white/10! bg-white/[0.04]! p-1';
const LUX_TABS_TRIGGER =
  'rounded-full! px-4! text-[11px]! font-semibold uppercase tracking-[0.12em] text-[#8fabc2]! data-[state=active]:bg-white/10! data-[state=active]:text-white!';
const LUX_BTN_GHOST_SM =
  'h-8 rounded-full! border-white/10! bg-white/[0.04]! px-3! text-xs! font-semibold text-white! hover:bg-white/[0.08]! hover:text-white!';

// Pastille de statut ticket (design) — libellés métier inchangés.
const TICKET_STATUS: Record<string, { label: string; dot: string }> = {
  OPEN: { label: 'Ouvert', dot: '#fbbf24' },
  PENDING: { label: 'En cours', dot: '#5cadf0' },
  RESOLVED: { label: 'Résolu', dot: '#34d399' },
  CLOSED: { label: 'Fermé', dot: '#8fabc2' },
};

// Couleur de pastille priorité (design).
const PRIORITY_DOT: Record<string, string> = {
  URGENT: '#f07d6a',
  HIGH: '#fbbf24',
};

interface AuditRow {
  id: string;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details: string;
  ip: string | null;
  createdAt: string;
}

interface ScanRow {
  id: string;
  qrName: string;
  moduleType: string | null;
  propertyName: string;
  visitorIp: string | null;
  userAgent: string | null;
  locale: string | null;
  createdAt: string;
}

interface TicketRow {
  id: string;
  subject: string;
  email: string;
  priority: string;
  status: string;
  body: string | null;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// FIX-14 — erreurs runtime (action='runtime.error') : libellés lisibles
// des sources (AuditLog.entityType). 'client' = erreur navigateur reçue
// par POST /api/errors ; les autres = sites d'erreur serveur wirés dans
// les routes critiques (cf. src/lib/error-monitor.ts).
const RUNTIME_SOURCE_LABELS: Record<string, string> = {
  client: 'Navigateur client',
  'api.auth.register': 'API · Inscription',
  'stripe.webhook': 'Stripe · Webhook',
  'payments.orderPay': 'Paiements · Paiement commande',
  'payments.refund.host': 'Paiements · Remboursement (hôte)',
  'payments.refund.admin': 'Paiements · Remboursement (admin)',
  'payments.receipt.email': 'Paiements · Email de reçu',
  'payments.refund.email': 'Paiements · Email de remboursement',
  'hub.get': 'Hub · Accueil',
  'hub.pin': 'Hub · PIN hôte',
  'hub.update': 'Hub · Mise à jour',
  'hub.voice.upload': 'Hub · Message vocal (envoi)',
  'hub.voice.list': 'Hub · Message vocal (liste)',
  'hub.complaint': 'Hub · Réclamation',
  'hub.complaint.status': 'Hub · Réclamation (statut)',
  'hub.guestbook': 'Hub · Livre d’or',
};

/** Extrait {name, message, url} du detailsJson d'une erreur runtime. */
function parseRuntimeDetails(raw: string | null): { name: string; message: string; url: string | null } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      name?: unknown;
      message?: unknown;
      context?: { url?: unknown } | null;
    };
    const message = typeof parsed.message === 'string' ? parsed.message : '';
    if (!message) return null;
    return {
      name: typeof parsed.name === 'string' ? parsed.name : 'Error',
      message,
      url:
        parsed.context && typeof parsed.context.url === 'string'
          ? parsed.context.url
          : null,
    };
  } catch {
    return null;
  }
}

export function AdminLogsContent() {
  // Audit
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [auditSearch, setAuditSearch] = useState('');
  // FIX-14 — filtre « Erreurs runtime » (action='runtime.error').
  const [auditFilter, setAuditFilter] = useState<'all' | 'runtime'>('all');
  const [auditPage, setAuditPage] = useState(1);
  const [auditPagination, setAuditPagination] = useState<Pagination | null>(null);
  const [auditLoading, setAuditLoading] = useState(true);

  // Scans
  const [scans, setScans] = useState<ScanRow[]>([]);
  const [scanPage, setScanPage] = useState(1);
  const [scanPagination, setScanPagination] = useState<Pagination | null>(null);
  const [scanLoading, setScanLoading] = useState(true);

  // Tickets
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [ticketStats, setTicketStats] = useState<{ open: number; pending: number; resolved: number; closed: number } | null>(null);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [ticketDialog, setTicketDialog] = useState(false);
  const [ticketForm, setTicketForm] = useState({ subject: '', email: '', priority: 'NORMAL', body: '' });
  const [ticketBusy, setTicketBusy] = useState(false);

  const fetchAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const params = new URLSearchParams({ type: 'audit', page: String(auditPage), limit: '25' });
      if (auditSearch.trim()) params.set('search', auditSearch.trim());
      if (auditFilter === 'runtime') params.set('action', 'runtime.error');
      const res = await fetch(`/api/admin/logs?${params.toString()}`);
      if (!res.ok) throw new Error('Erreur de chargement');
      const data = await res.json();
      setAudit(Array.isArray(data.data) ? data.data : []);
      setAuditPagination(data.pagination ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setAuditLoading(false);
    }
  }, [auditPage, auditSearch, auditFilter]);

  const fetchScans = useCallback(async () => {
    setScanLoading(true);
    try {
      const res = await fetch(`/api/admin/logs?type=scans&page=${scanPage}&limit=25`);
      if (!res.ok) throw new Error('Erreur de chargement');
      const data = await res.json();
      setScans(Array.isArray(data.data) ? data.data : []);
      setScanPagination(data.pagination ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setScanLoading(false);
    }
  }, [scanPage]);

  const fetchTickets = useCallback(async () => {
    setTicketsLoading(true);
    try {
      const res = await fetch('/api/admin/tickets');
      if (!res.ok) throw new Error('Erreur de chargement');
      const data = await res.json();
      setTickets(Array.isArray(data.data) ? data.data : []);
      setTicketStats(data.stats ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setTicketsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);
  useEffect(() => {
    fetchScans();
  }, [fetchScans]);
  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const createTicket = async () => {
    setTicketBusy(true);
    try {
      const res = await fetch('/api/admin/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ticketForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur serveur');
      toast.success('Ticket créé');
      setTicketDialog(false);
      setTicketForm({ subject: '', email: '', priority: 'NORMAL', body: '' });
      fetchTickets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setTicketBusy(false);
    }
  };

  const changeTicketStatus = async (ticket: TicketRow, status: string) => {
    try {
      const res = await fetch('/api/admin/tickets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ticket.id, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur serveur');
      toast.success(data.message);
      fetchTickets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur inconnue');
    }
  };

  return (
    <div className="p-4 sm:p-6">
      <Tabs defaultValue="audit" className="gap-4">
        <TabsList className={LUX_TABS_LIST}>
          <TabsTrigger value="audit" className={LUX_TABS_TRIGGER}>
            Audit
          </TabsTrigger>
          <TabsTrigger value="scans" className={LUX_TABS_TRIGGER}>
            Scans QR
          </TabsTrigger>
          <TabsTrigger value="tickets" className={LUX_TABS_TRIGGER}>
            Tickets
          </TabsTrigger>
        </TabsList>

        {/* ----- Audit ----- */}
        <TabsContent value="audit">
          <div className="lux-card p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="lux-eyebrow">Traçabilité</p>
                <h2 className="lux-display mt-1 text-xl font-semibold text-white">Journal d&apos;audit</h2>
                <p className="mt-1 text-sm text-[#8fabc2]">
                  Chaque action d'administration est tracée : acteur, cible, détails, IP. Les
                  erreurs runtime (serveur &amp; navigateur) sont marquées « Erreur runtime ».
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                {/* FIX-14 — filtre « Erreurs runtime » (action='runtime.error') */}
                <Select
                  value={auditFilter}
                  onValueChange={(v) => {
                    setAuditFilter(v === 'runtime' ? 'runtime' : 'all');
                    setAuditPage(1);
                  }}
                >
                  <SelectTrigger className={`w-full sm:w-44 ${LUX_SELECT_TRIGGER}`} aria-label="Filtrer le journal d'audit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className={LUX_SELECT_CONTENT}>
                    <SelectItem value="all" className={LUX_SELECT_ITEM}>Tous les événements</SelectItem>
                    <SelectItem value="runtime" className={LUX_SELECT_ITEM}>Erreurs runtime</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Filtrer (action, email…)"
                  value={auditSearch}
                  onChange={(e) => { setAuditSearch(e.target.value); setAuditPage(1); }}
                  className={`sm:max-w-xs ${LUX_FIELD}`}
                  aria-label="Rechercher dans l'audit"
                />
              </div>
            </div>
            <div className="mt-4">
              {auditLoading ? (
                <TableSkeletonRows />
              ) : audit.length === 0 ? (
                <EmptyState text="Aucune entrée d'audit — elles apparaissent dès la première action admin." />
              ) : (
                <>
                  <div className="lux-scroll max-h-[32rem] overflow-y-auto rounded-xl border border-white/10">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-[#0d1530]">
                        <TableRow className="border-white/8 hover:bg-transparent">
                          <TableHead className="lux-eyebrow text-[9.5px]!">Date</TableHead>
                          <TableHead className="lux-eyebrow text-[9.5px]!">Acteur</TableHead>
                          <TableHead className="lux-eyebrow text-[9.5px]!">Action</TableHead>
                          <TableHead className="lux-eyebrow text-[9.5px]! hidden md:table-cell">Cible</TableHead>
                          <TableHead className="lux-eyebrow text-[9.5px]! hidden xl:table-cell">Détails</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {audit.map((a) => {
                          // FIX-14 — rendu lisible des erreurs runtime :
                          // badge rouge, source en libellé, message extrait.
                          const isRuntimeError = a.action === 'runtime.error';
                          const runtimeDetails = isRuntimeError ? parseRuntimeDetails(a.details) : null;
                          return (
                            <TableRow key={a.id} className="border-white/8 hover:bg-white/[0.04]">
                              <TableCell className="whitespace-nowrap text-xs text-[#8fabc2]">
                                {new Date(a.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                              </TableCell>
                              <TableCell className="text-xs font-semibold">
                                {isRuntimeError ? (
                                  <span className="font-mono text-[#8fabc2]">{a.actorEmail}</span>
                                ) : (
                                  <span className="text-white">{a.actorEmail}</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {isRuntimeError ? (
                                  <span className="lux-chip px-2! py-0.5! text-[10px]!">
                                    <span className="lux-dot" style={{ backgroundColor: '#f07d6a' }} aria-hidden="true" />
                                    Erreur runtime
                                  </span>
                                ) : (
                                  <span className="rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10.5px] text-[#c7d3ea]">{a.action}</span>
                                )}
                              </TableCell>
                              <TableCell className="hidden text-xs text-[#8fabc2] md:table-cell">
                                {isRuntimeError
                                  ? (RUNTIME_SOURCE_LABELS[a.entityType] ?? a.entityType)
                                  : <>{a.entityType}{a.entityId ? ` · ${a.entityId.slice(0, 10)}…` : ''}</>}
                              </TableCell>
                              <TableCell className="hidden max-w-72 truncate font-mono text-[11px] text-[#8fabc2]/70 xl:table-cell">
                                {isRuntimeError
                                  ? runtimeDetails
                                    ? `${runtimeDetails.name}: ${runtimeDetails.message}`
                                    : a.details
                                  : a.details}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  <PaginationBar pagination={auditPagination} onPage={setAuditPage} />
                </>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ----- Scans ----- */}
        <TabsContent value="scans">
          <div className="lux-card p-5 sm:p-6">
            <div>
              <p className="lux-eyebrow">Analytics</p>
              <h2 className="lux-display mt-1 text-xl font-semibold text-white">Logs de scan QR</h2>
              <p className="mt-1 text-sm text-[#8fabc2]">Analytics réels : chaque scan de QR dynamique est journalisé.</p>
            </div>
            <div className="mt-4">
              {scanLoading ? (
                <TableSkeletonRows />
              ) : scans.length === 0 ? (
                <EmptyState text="Aucun scan enregistré." />
              ) : (
                <>
                  <div className="lux-scroll max-h-[32rem] overflow-y-auto rounded-xl border border-white/10">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-[#0d1530]">
                        <TableRow className="border-white/8 hover:bg-transparent">
                          <TableHead className="lux-eyebrow text-[9.5px]!">Date</TableHead>
                          <TableHead className="lux-eyebrow text-[9.5px]!">QR</TableHead>
                          <TableHead className="lux-eyebrow text-[9.5px]!">Bien</TableHead>
                          <TableHead className="lux-eyebrow text-[9.5px]! hidden md:table-cell">Module</TableHead>
                          <TableHead className="lux-eyebrow text-[9.5px]! hidden lg:table-cell">IP</TableHead>
                          <TableHead className="lux-eyebrow text-[9.5px]! hidden xl:table-cell">User agent</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {scans.map((s) => (
                          <TableRow key={s.id} className="border-white/8 hover:bg-white/[0.04]">
                            <TableCell className="whitespace-nowrap text-xs text-[#8fabc2]">
                              {new Date(s.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                            </TableCell>
                            <TableCell className="text-sm font-semibold text-white">{s.qrName}</TableCell>
                            <TableCell className="text-sm text-white/85">{s.propertyName}</TableCell>
                            <TableCell className="hidden md:table-cell">
                              {s.moduleType ? (
                                <span className="rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10.5px] text-[#c7d3ea]">{s.moduleType}</span>
                              ) : '—'}
                            </TableCell>
                            <TableCell className="hidden font-mono text-xs text-[#8fabc2] lg:table-cell">
                              {s.visitorIp ?? '—'}
                            </TableCell>
                            <TableCell className="hidden max-w-64 truncate text-xs text-[#8fabc2]/70 xl:table-cell">
                              {s.userAgent ?? '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <PaginationBar pagination={scanPagination} onPage={setScanPage} />
                </>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ----- Tickets ----- */}
        <TabsContent value="tickets">
          <div className="lux-card p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="lux-eyebrow">Support</p>
                <h2 className="lux-display mt-1 text-xl font-semibold text-white">Tickets support</h2>
                <p className="mt-1 text-sm text-[#8fabc2]">
                  {ticketStats
                    ? `${ticketStats.open} ouvert(s) · ${ticketStats.pending} en cours · ${ticketStats.resolved} résolu(s)`
                    : '…'}
                </p>
              </div>
              <button type="button" onClick={() => setTicketDialog(true)} className="lux-btn shrink-0">
                Nouveau ticket
              </button>
            </div>
            <div className="mt-4">
              {ticketsLoading ? (
                <TableSkeletonRows />
              ) : tickets.length === 0 ? (
                <EmptyState text="Aucun ticket — créez-en un ou générez-en depuis un email en échec." />
              ) : (
                <div className="lux-scroll max-h-[32rem] overflow-y-auto rounded-xl border border-white/10">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-[#0d1530]">
                      <TableRow className="border-white/8 hover:bg-transparent">
                        <TableHead className="lux-eyebrow text-[9.5px]!">Sujet</TableHead>
                        <TableHead className="lux-eyebrow text-[9.5px]! hidden sm:table-cell">Demandeur</TableHead>
                        <TableHead className="lux-eyebrow text-[9.5px]!">Priorité</TableHead>
                        <TableHead className="lux-eyebrow text-[9.5px]!">Statut</TableHead>
                        <TableHead className="lux-eyebrow text-[9.5px]! hidden md:table-cell">Créé le</TableHead>
                        <TableHead className="w-40"><span className="sr-only">Changer statut</span></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tickets.map((t) => {
                        const st = TICKET_STATUS[t.status] ?? { label: t.status, dot: '#8fabc2' };
                        return (
                          <TableRow key={t.id} className="border-white/8 hover:bg-white/[0.04]">
                            <TableCell>
                              <p className="font-semibold text-white">{t.subject}</p>
                              {t.body && <p className="max-w-64 truncate text-xs text-[#8fabc2]">{t.body}</p>}
                            </TableCell>
                            <TableCell className="hidden text-sm text-white/85 sm:table-cell">{t.email}</TableCell>
                            <TableCell>
                              <span className="lux-chip px-2! py-0.5! text-[10px]!">
                                <span
                                  className="lux-dot"
                                  style={{ backgroundColor: PRIORITY_DOT[t.priority] ?? '#8fabc2' }}
                                  aria-hidden="true"
                                />
                                {t.priority}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="lux-chip px-2! py-0.5! text-[10px]!">
                                <span className="lux-dot" style={{ backgroundColor: st.dot }} aria-hidden="true" />
                                {st.label}
                              </span>
                            </TableCell>
                            <TableCell className="hidden text-xs text-[#8fabc2] md:table-cell">
                              {new Date(t.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                            </TableCell>
                            <TableCell>
                              <Select value={t.status} onValueChange={(v) => changeTicketStatus(t, v)}>
                                <SelectTrigger className={`h-8 w-36 ${LUX_SELECT_TRIGGER}`} aria-label={`Changer le statut de ${t.subject}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className={LUX_SELECT_CONTENT}>
                                  <SelectItem value="OPEN" className={LUX_SELECT_ITEM}>Ouvert</SelectItem>
                                  <SelectItem value="PENDING" className={LUX_SELECT_ITEM}>En cours</SelectItem>
                                  <SelectItem value="RESOLVED" className={LUX_SELECT_ITEM}>Résolu</SelectItem>
                                  <SelectItem value="CLOSED" className={LUX_SELECT_ITEM}>Fermé</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* ----- Dialog création ticket ----- */}
      <Dialog open={ticketDialog} onOpenChange={setTicketDialog}>
        <DialogContent className="border-white/10! bg-[#0b1226]! text-white!">
          <DialogHeader>
            <DialogTitle className="lux-display text-xl font-semibold text-white">Nouveau ticket support</DialogTitle>
            <DialogDescription className="text-[#8fabc2]!">Le suivi est assuré depuis cette console.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="ticket-subject">Sujet</Label>
              <Input id="ticket-subject" value={ticketForm.subject} className={LUX_FIELD}
                onChange={(e) => setTicketForm((f) => ({ ...f, subject: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ticket-email">Email du demandeur</Label>
              <Input id="ticket-email" type="email" value={ticketForm.email} className={LUX_FIELD}
                onChange={(e) => setTicketForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Priorité</Label>
                <Select value={ticketForm.priority} onValueChange={(v) => setTicketForm((f) => ({ ...f, priority: v }))}>
                  <SelectTrigger className={`w-full ${LUX_SELECT_TRIGGER}`}><SelectValue /></SelectTrigger>
                  <SelectContent className={LUX_SELECT_CONTENT}>
                    <SelectItem value="LOW" className={LUX_SELECT_ITEM}>Basse</SelectItem>
                    <SelectItem value="NORMAL" className={LUX_SELECT_ITEM}>Normale</SelectItem>
                    <SelectItem value="HIGH" className={LUX_SELECT_ITEM}>Haute</SelectItem>
                    <SelectItem value="URGENT" className={LUX_SELECT_ITEM}>Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ticket-body">Description</Label>
              <textarea
                id="ticket-body"
                className="min-h-24 rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-[#8fabc2]/60 outline-none focus:border-[#5cadf0]/50"
                value={ticketForm.body}
                onChange={(e) => setTicketForm((f) => ({ ...f, body: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={createTicket}
              disabled={ticketBusy || ticketForm.subject.trim().length < 3 || !ticketForm.email.trim()}
              className="lux-btn h-9 rounded-full px-4 text-xs"
            >
              Créer le ticket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PaginationBar({ pagination, onPage }: { pagination: Pagination | null; onPage: (p: number) => void }) {
  if (!pagination || pagination.totalPages <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-between">
      <p className="text-sm text-[#8fabc2]">
        Page {pagination.page} / {pagination.totalPages} — {pagination.total} entrée{pagination.total > 1 ? 's' : ''}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className={LUX_BTN_GHOST_SM} disabled={pagination.page <= 1} onClick={() => onPage(pagination.page - 1)}>
          Précédent
        </Button>
        <Button variant="outline" size="sm" className={LUX_BTN_GHOST_SM} disabled={pagination.page >= pagination.totalPages} onClick={() => onPage(pagination.page + 1)}>
          Suivant
        </Button>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="lux-empty flex flex-col items-center justify-center rounded-2xl py-12 text-center">
      <p className="max-w-md px-4 text-sm text-[#8fabc2]">{text}</p>
    </div>
  );
}

function TableSkeletonRows() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-11 w-full bg-white/8" />
      ))}
    </div>
  );
}
