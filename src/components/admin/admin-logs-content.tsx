'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  FileWarning,
  LifeBuoy,
  Loader2,
  MousePointerClick,
  Plus,
  ScrollText,
  ShieldCheck,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

// =============================================================
// AdminLogsContent — Module 8 Logs & Tickets
//  - Audit : journal des actions Superadmin (audit_logs réels)
//  - Scans : analytics réels des scans QR (scan_logs)
//  - Tickets : support (création, changement de statut — audité)
// =============================================================

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

const TICKET_STATUS: Record<string, { label: string; className: string }> = {
  OPEN: { label: 'Ouvert', className: 'bg-amber-100 text-amber-800' },
  PENDING: { label: 'En cours', className: 'bg-sky-100 text-sky-800' },
  RESOLVED: { label: 'Résolu', className: 'bg-emerald-100 text-emerald-800' },
  CLOSED: { label: 'Fermé', className: 'bg-slate-100 text-slate-600' },
};

export function AdminLogsContent() {
  // Audit
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [auditSearch, setAuditSearch] = useState('');
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
  }, [auditPage, auditSearch]);

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
        <TabsList className="h-auto flex-wrap justify-start gap-1 bg-slate-100 p-1">
          <TabsTrigger value="audit" className="gap-1.5">
            <ShieldCheck className="h-4 w-4" /> Audit
          </TabsTrigger>
          <TabsTrigger value="scans" className="gap-1.5">
            <MousePointerClick className="h-4 w-4" /> Scans QR
          </TabsTrigger>
          <TabsTrigger value="tickets" className="gap-1.5">
            <LifeBuoy className="h-4 w-4" /> Tickets
          </TabsTrigger>
        </TabsList>

        {/* ----- Audit ----- */}
        <TabsContent value="audit">
          <Card className="border-slate-200 bg-white">
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>📜 Journal d'audit</CardTitle>
                  <CardDescription>
                    Chaque action d'administration est tracée : acteur, cible, détails, IP.
                  </CardDescription>
                </div>
                <Input
                  placeholder="Filtrer (action, email…)"
                  value={auditSearch}
                  onChange={(e) => { setAuditSearch(e.target.value); setAuditPage(1); }}
                  className="sm:max-w-xs"
                  aria-label="Rechercher dans l'audit"
                />
              </div>
            </CardHeader>
            <CardContent>
              {auditLoading ? (
                <TableSkeletonRows />
              ) : audit.length === 0 ? (
                <EmptyState icon={ScrollText} text="Aucune entrée d'audit — elles apparaissent dès la première action admin." />
              ) : (
                <>
                  <div className="max-h-[32rem] overflow-y-auto rounded-lg border">
                    <Table>
                      <TableHeader className="sticky top-0 bg-white">
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Acteur</TableHead>
                          <TableHead>Action</TableHead>
                          <TableHead className="hidden md:table-cell">Cible</TableHead>
                          <TableHead className="hidden xl:table-cell">Détails</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {audit.map((a) => (
                          <TableRow key={a.id}>
                            <TableCell className="whitespace-nowrap text-xs text-slate-500">
                              {new Date(a.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                            </TableCell>
                            <TableCell className="text-xs font-semibold">{a.actorEmail}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="border-slate-300 font-mono text-[11px] text-slate-700">{a.action}</Badge>
                            </TableCell>
                            <TableCell className="hidden text-xs text-slate-500 md:table-cell">
                              {a.entityType}{a.entityId ? ` · ${a.entityId.slice(0, 10)}…` : ''}
                            </TableCell>
                            <TableCell className="hidden max-w-72 truncate font-mono text-[11px] text-slate-400 xl:table-cell">
                              {a.details}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <PaginationBar pagination={auditPagination} onPage={setAuditPage} />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ----- Scans ----- */}
        <TabsContent value="scans">
          <Card className="border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>🖱️ Logs de scan QR</CardTitle>
              <CardDescription>Analytics réels : chaque scan de QR dynamique est journalisé.</CardDescription>
            </CardHeader>
            <CardContent>
              {scanLoading ? (
                <TableSkeletonRows />
              ) : scans.length === 0 ? (
                <EmptyState icon={MousePointerClick} text="Aucun scan enregistré." />
              ) : (
                <>
                  <div className="max-h-[32rem] overflow-y-auto rounded-lg border">
                    <Table>
                      <TableHeader className="sticky top-0 bg-white">
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>QR</TableHead>
                          <TableHead>Bien</TableHead>
                          <TableHead className="hidden md:table-cell">Module</TableHead>
                          <TableHead className="hidden lg:table-cell">IP</TableHead>
                          <TableHead className="hidden xl:table-cell">User agent</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {scans.map((s) => (
                          <TableRow key={s.id}>
                            <TableCell className="whitespace-nowrap text-xs text-slate-500">
                              {new Date(s.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                            </TableCell>
                            <TableCell className="text-sm font-semibold">{s.qrName}</TableCell>
                            <TableCell className="text-sm">{s.propertyName}</TableCell>
                            <TableCell className="hidden md:table-cell">
                              {s.moduleType ? <Badge variant="outline" className="border-slate-300 text-slate-700">{s.moduleType}</Badge> : '—'}
                            </TableCell>
                            <TableCell className="hidden font-mono text-xs text-slate-500 lg:table-cell">
                              {s.visitorIp ?? '—'}
                            </TableCell>
                            <TableCell className="hidden max-w-64 truncate text-xs text-slate-400 xl:table-cell">
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
            </CardContent>
          </Card>
        </TabsContent>

        {/* ----- Tickets ----- */}
        <TabsContent value="tickets">
          <Card className="border-slate-200 bg-white">
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>🎫 Tickets support</CardTitle>
                  <CardDescription>
                    {ticketStats
                      ? `${ticketStats.open} ouvert(s) · ${ticketStats.pending} en cours · ${ticketStats.resolved} résolu(s)`
                      : '…'}
                  </CardDescription>
                </div>
                <Button size="sm" onClick={() => setTicketDialog(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Nouveau ticket
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {ticketsLoading ? (
                <TableSkeletonRows />
              ) : tickets.length === 0 ? (
                <EmptyState icon={FileWarning} text="Aucun ticket — créez-en un ou générez-en depuis un email en échec." />
              ) : (
                <div className="max-h-[32rem] overflow-y-auto rounded-lg border">
                  <Table>
                    <TableHeader className="sticky top-0 bg-white">
                      <TableRow>
                        <TableHead>Sujet</TableHead>
                        <TableHead className="hidden sm:table-cell">Demandeur</TableHead>
                        <TableHead>Priorité</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead className="hidden md:table-cell">Créé le</TableHead>
                        <TableHead className="w-40"><span className="sr-only">Changer statut</span></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tickets.map((t) => {
                        const st = TICKET_STATUS[t.status] ?? { label: t.status, className: 'bg-slate-100 text-slate-600' };
                        return (
                          <TableRow key={t.id}>
                            <TableCell>
                              <p className="font-semibold text-slate-900">{t.subject}</p>
                              {t.body && <p className="max-w-64 truncate text-xs text-slate-500">{t.body}</p>}
                            </TableCell>
                            <TableCell className="hidden text-sm sm:table-cell">{t.email}</TableCell>
                            <TableCell>
                              <Badge variant={t.priority === 'URGENT' ? 'destructive' : t.priority === 'HIGH' ? 'default' : 'outline'}>
                                {t.priority}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${st.className}`}>
                                {st.label}
                              </span>
                            </TableCell>
                            <TableCell className="hidden text-xs text-slate-500 md:table-cell">
                              {new Date(t.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                            </TableCell>
                            <TableCell>
                              <Select value={t.status} onValueChange={(v) => changeTicketStatus(t, v)}>
                                <SelectTrigger className="h-8 w-36" aria-label={`Changer le statut de ${t.subject}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="OPEN">Ouvert</SelectItem>
                                  <SelectItem value="PENDING">En cours</SelectItem>
                                  <SelectItem value="RESOLVED">Résolu</SelectItem>
                                  <SelectItem value="CLOSED">Fermé</SelectItem>
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
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ----- Dialog création ticket ----- */}
      <Dialog open={ticketDialog} onOpenChange={setTicketDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouveau ticket support</DialogTitle>
            <DialogDescription>Le suivi est assuré depuis cette console.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="ticket-subject">Sujet</Label>
              <Input id="ticket-subject" value={ticketForm.subject}
                onChange={(e) => setTicketForm((f) => ({ ...f, subject: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ticket-email">Email du demandeur</Label>
              <Input id="ticket-email" type="email" value={ticketForm.email}
                onChange={(e) => setTicketForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Priorité</Label>
                <Select value={ticketForm.priority} onValueChange={(v) => setTicketForm((f) => ({ ...f, priority: v }))}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Basse</SelectItem>
                    <SelectItem value="NORMAL">Normale</SelectItem>
                    <SelectItem value="HIGH">Haute</SelectItem>
                    <SelectItem value="URGENT">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ticket-body">Description</Label>
              <textarea
                id="ticket-body"
                className="min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={ticketForm.body}
                onChange={(e) => setTicketForm((f) => ({ ...f, body: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={createTicket} disabled={ticketBusy || ticketForm.subject.trim().length < 3 || !ticketForm.email.trim()}>
              {ticketBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
      <p className="text-sm text-slate-500">
        Page {pagination.page} / {pagination.totalPages} — {pagination.total} entrée{pagination.total > 1 ? 's' : ''}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={pagination.page <= 1} onClick={() => onPage(pagination.page - 1)}>
          Précédent
        </Button>
        <Button variant="outline" size="sm" disabled={pagination.page >= pagination.totalPages} onClick={() => onPage(pagination.page + 1)}>
          Suivant
        </Button>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
      <Icon className="mb-3 h-10 w-10 text-slate-300" aria-hidden="true" />
      <p className="max-w-md text-sm text-slate-500">{text}</p>
    </div>
  );
}

function TableSkeletonRows() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-11 w-full" />
      ))}
    </div>
  );
}
