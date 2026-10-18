'use client';

// =============================================================
// AdminInvoicesContent — v4.69 PHASE 5 « CRM Superadmin & Facturation »
// -------------------------------------------------------------
// Facturation mensuelle des commissions RoomScan :
//   • KPIs (à encaisser / encaissé / en retard) ;
//   • génération des factures du mois (tous les hôtes actifs ou un hôte) ;
//   • tableau : hôte, mois, commandes, total encaissé, taux, commission,
//     échéance, statut — actions : marquer payée, PDF, taux, supprimer.
// API : GET/POST/PATCH/DELETE /api/admin/commission-invoices (Superadmin).
// PDF : downloadCommissionInvoicePdf (client, jspdf).
// =============================================================
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { downloadCommissionInvoicePdf } from '@/lib/commission-invoice-pdf';

// ── Types (contrat API) ──────────────────────────────────────
interface InvoiceRow {
  id: string;
  month: number;
  year: number;
  totalOrdersAmount: number;
  commissionRate: number;
  commissionOwed: number;
  ordersCount: number;
  breakdown: { minibar?: number; services?: number; laundry?: number } | null;
  status: string;
  dueDate: string;
  paidAt: string | null;
  invoicePdfUrl?: string | null;
  host: { id: string; email: string; fullName: string | null };
}

interface Kpis {
  pendingTotal: number;
  paidTotal: number;
  overdueTotal: number;
  pendingCount: number;
  overdueCount: number;
  paidCount: number;
}

const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

const eur = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;

function monthLabel(month: number, year: number): string {
  return `${MONTHS_FR[Math.min(11, Math.max(0, month - 1))]} ${year}`;
}

function statusBadge(status: string): { label: string; dot: string } {
  if (status === 'paid') return { label: 'Payée', dot: '#34d399' };
  if (status === 'overdue') return { label: 'En retard', dot: '#f07d6a' };
  return { label: 'En attente', dot: '#fbbf24' };
}

function frDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function AdminInvoicesContent() {
  const [invoices, setInvoices] = useState<InvoiceRow[] | null>(null);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Sélection du mois à facturer : par défaut = le mois précédent.
  const now = new Date();
  const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth(); // getMonth() = index → mois précédent = index courant
  const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const [genMonth, setGenMonth] = useState(prevMonth);
  const [genYear, setGenYear] = useState(prevYear);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  // Dialog taux de commission
  const [rateHost, setRateHost] = useState<{ id: string; email: string; rate: number } | null>(null);
  const [rateInput, setRateInput] = useState('20');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/commission-invoices', { cache: 'no-store' });
      const json = (await res.json()) as { invoices?: InvoiceRow[]; kpis?: Kpis; error?: string };
      if (!res.ok) {
        toast.error(json.error || 'Chargement impossible.');
        setInvoices([]);
        return;
      }
      setInvoices(json.invoices ?? []);
      setKpis(json.kpis ?? null);
    } catch {
      toast.error('Connexion impossible. Réessayez.');
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Génère les factures du mois sélectionné (tous les hôtes actifs). */
  async function generate() {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/commission-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: genMonth, year: genYear }),
      });
      const json = (await res.json()) as { ok?: boolean; created?: number; updated?: number; skipped?: number; error?: string };
      if (!res.ok) {
        toast.error(json.error || 'Génération impossible.');
        return;
      }
      toast.success(
        `Factures générées — ${json.created ?? 0} créée(s), ${json.updated ?? 0} mise(s) à jour, ${json.skipped ?? 0} ignorée(s).`,
      );
      await load();
    } catch {
      toast.error('Connexion impossible. Réessayez.');
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: string) {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/commission-invoices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        toast.error(json.error || 'Mise à jour impossible.');
        return;
      }
      toast.success(status === 'paid' ? 'Facture marquée payée ✓' : 'Statut mis à jour');
      await load();
    } catch {
      toast.error('Connexion impossible. Réessayez.');
    } finally {
      setBusy(false);
    }
  }

  async function removeInvoice(id: string) {
    if (!window.confirm('Supprimer définitivement cette facture (non payée) ?')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/commission-invoices?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        toast.error(json.error || 'Suppression impossible.');
        return;
      }
      toast.success('Facture supprimée');
      await load();
    } catch {
      toast.error('Connexion impossible. Réessayez.');
    } finally {
      setBusy(false);
    }
  }

  async function saveRate() {
    if (!rateHost) return;
    const pct = Number(rateInput.replace(',', '.'));
    if (!Number.isFinite(pct) || pct <= 0 || pct > 50) {
      toast.error('Taux invalide (entre 0,1 et 50 %).');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/commission-invoices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostId: rateHost.id, commissionRate: pct / 100 }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        toast.error(json.error || 'Mise à jour impossible.');
        return;
      }
      toast.success(`Taux de commission mis à jour : ${pct} %`);
      setRateHost(null);
      await load();
    } catch {
      toast.error('Connexion impossible. Réessayez.');
    } finally {
      setBusy(false);
    }
  }

  const filtered = (invoices ?? []).filter((i) => {
    if (statusFilter !== 'all' && i.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const host = `${i.host.fullName ?? ''} ${i.host.email}`.toLowerCase();
      if (!host.includes(q) && !monthLabel(i.month, i.year).toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col gap-2">
        <div>
          <p className="lux-eyebrow">Finance · Superadmin</p>
          <h1 className="lux-display mt-1 text-2xl font-semibold text-white sm:text-3xl">Commissions &amp; Facturation</h1>
          <p className="mt-1 text-sm text-[#8fa0c2]">
            Facturation mensuelle de la commission RoomScan sur les commandes encaissées par les hôtes via leur Hub.
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="luxkpi luxkpi-gold">
          <div className="relative flex items-center justify-between gap-2">
            <span className="luxkpi-label">À encaisser</span>
            <span className="luxkpi-chip">{kpis?.pendingCount ?? 0}</span>
          </div>
          <p className="luxkpi-value mt-2.5 truncate text-[26px] leading-none">
            {kpis ? eur(kpis.pendingTotal) : '…'}
          </p>
        </div>
        <div className="luxkpi luxkpi-emerald">
          <div className="relative flex items-center justify-between gap-2">
            <span className="luxkpi-label">Encaissé</span>
            <span className="luxkpi-chip">{kpis?.paidCount ?? 0}</span>
          </div>
          <p className="luxkpi-value mt-2.5 truncate text-[26px] leading-none">
            {kpis ? eur(kpis.paidTotal) : '…'}
          </p>
        </div>
        <div className="luxkpi luxkpi-coral">
          <div className="relative flex items-center justify-between gap-2">
            <span className="luxkpi-label">En retard</span>
            <span className="luxkpi-chip">{kpis?.overdueCount ?? 0}</span>
          </div>
          <p className="luxkpi-value mt-2.5 truncate text-[26px] leading-none">
            {kpis ? eur(kpis.overdueTotal) : '…'}
          </p>
        </div>
      </div>

      {/* Barre de génération */}
      <div className="lux-card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="gen-month" className="text-[#8fa0c2]">Mois à facturer</Label>
            <Select value={String(genMonth)} onValueChange={(v) => setGenMonth(Number(v))}>
              <SelectTrigger id="gen-month" className="w-[170px] rounded-xl border-white/12 bg-white/[0.04] text-white">
                <SelectValue placeholder="Mois" />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-[#0b1226] text-white">
                {MONTHS_FR.map((m, idx) => (
                  <SelectItem key={m} className="focus:bg-white/8 focus:text-white" value={String(idx + 1)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gen-year" className="text-[#8fa0c2]">Année</Label>
            <Input
              id="gen-year"
              type="number"
              min={2024}
              max={2100}
              value={genYear}
              onChange={(e) => setGenYear(Number(e.target.value) || prevYear)}
              className="w-[110px] rounded-xl border-white/12 bg-white/[0.04] text-white focus-visible:ring-[#5c8af0]/50"
            />
          </div>
          <Button onClick={generate} disabled={busy} className="lux-btn sm:ml-auto h-9 rounded-full px-4 text-xs">
            Générer les factures du mois
          </Button>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un hôte ou un mois…"
            className="rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fa0c2]/60 focus-visible:ring-[#5c8af0]/50"
            aria-label="Rechercher une facture"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full rounded-xl border-white/12 bg-white/[0.04] text-white sm:w-[180px]" aria-label="Filtrer par statut">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent className="border-white/10 bg-[#0b1226] text-white">
            <SelectItem className="focus:bg-white/8 focus:text-white" value="all">Tous les statuts</SelectItem>
            <SelectItem className="focus:bg-white/8 focus:text-white" value="pending">En attente</SelectItem>
            <SelectItem className="focus:bg-white/8 focus:text-white" value="paid">Payées</SelectItem>
            <SelectItem className="focus:bg-white/8 focus:text-white" value="overdue">En retard</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tableau */}
      <div className="lux-card p-0">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-[#8fa0c2]">
            Chargement des factures…
          </div>
        ) : filtered.length === 0 ? (
          <div className="lux-empty m-4 rounded-2xl px-4 py-10 text-center">
            <p className="lux-display text-lg text-white">Aucune facture de commission</p>
            <p className="mt-2 text-xs text-[#8fa0c2]">
              Sélectionnez un mois puis cliquez sur « Générer les factures » pour calculer les commissions des hôtes actifs.
            </p>
          </div>
        ) : (
          <div className="lux-scroll max-h-[62vh] overflow-auto rounded-xl">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="sticky top-0 z-10 bg-[#0d1530]/95 backdrop-blur">
                <tr className="text-left">
                  <th className="lux-eyebrow !text-[9.5px] px-4 py-3">Mois</th>
                  <th className="lux-eyebrow !text-[9.5px] px-4 py-3">Hôte</th>
                  <th className="lux-eyebrow !text-[9.5px] px-4 py-3 text-right">Commandes</th>
                  <th className="lux-eyebrow !text-[9.5px] px-4 py-3 text-right">Total encaissé</th>
                  <th className="lux-eyebrow !text-[9.5px] px-4 py-3 text-right">Taux</th>
                  <th className="lux-eyebrow !text-[9.5px] px-4 py-3 text-right">Commission</th>
                  <th className="lux-eyebrow !text-[9.5px] px-4 py-3">Échéance</th>
                  <th className="lux-eyebrow !text-[9.5px] px-4 py-3">Statut</th>
                  <th className="lux-eyebrow !text-[9.5px] px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8">
                {filtered.map((i) => {
                  const badge = statusBadge(i.status);
                  return (
                    <tr key={i.id} className="border-white/8 transition-colors hover:bg-white/[0.04]">
                      <td className="px-4 py-3 font-medium text-white">{monthLabel(i.month, i.year)}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-white">{i.host.fullName || 'Hôte'}</p>
                        <p className="text-xs text-[#8fa0c2]">{i.host.email}</p>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-white/85">{i.ordersCount}</td>
                      <td className="lux-num px-4 py-3 text-right tabular-nums text-white">{eur(i.totalOrdersAmount)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#8fa0c2]">{Math.round(i.commissionRate * 100)} %</td>
                      <td className="lux-num px-4 py-3 text-right font-bold tabular-nums text-[#e9c47c]">{eur(i.commissionOwed)}</td>
                      <td className="px-4 py-3 text-xs text-[#8fa0c2]">{frDate(i.dueDate)}</td>
                      <td className="px-4 py-3">
                        <span className="lux-chip">
                          <span className="lux-dot" style={{ backgroundColor: badge.dot }} aria-hidden="true" />
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {i.status !== 'paid' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-full border-[#34d399]/30 bg-transparent px-3 text-xs text-[#86e9cb] hover:bg-[#34d399]/10 hover:text-[#86e9cb]"
                              onClick={() => void setStatus(i.id, 'paid')}
                              disabled={busy}
                              aria-label={`Marquer la facture de ${i.host.email} comme payée`}
                            >
                              Payée
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="lux-btn-ghost h-8 rounded-full px-3 text-xs"
                            onClick={() =>
                              downloadCommissionInvoicePdf({
                                monthLabel: monthLabel(i.month, i.year),
                                hostName: i.host.fullName || 'Hôte',
                                hostEmail: i.host.email,
                                totalOrdersAmount: i.totalOrdersAmount,
                                commissionRate: i.commissionRate,
                                commissionOwed: i.commissionOwed,
                                ordersCount: i.ordersCount,
                                breakdown: i.breakdown,
                                status: i.status,
                                dueDate: i.dueDate,
                                paidAt: i.paidAt,
                                issuedBy: 'RoomScan',
                              })
                            }
                            aria-label={`Télécharger le PDF de la facture de ${i.host.email}`}
                          >
                            PDF
                          </Button>
                          {i.invoicePdfUrl ? (
                            <a
                              href={i.invoicePdfUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.04] px-3 text-xs font-medium text-[#8fa0c2] transition-colors hover:bg-white/[0.07] hover:text-white"
                              aria-label={`Ouvrir le PDF public (serveur) de la facture de ${i.host.email}`}
                            >
                              PDF public
                            </a>
                          ) : null}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 rounded-full border-white/12 bg-transparent p-0 text-[#8fa0c2] hover:bg-white/[0.06] hover:text-white"
                            onClick={() => {
                              setRateHost({ id: i.host.id, email: i.host.email, rate: i.commissionRate });
                              setRateInput(String(Math.round(i.commissionRate * 100)));
                            }}
                            aria-label={`Modifier le taux de commission de ${i.host.email}`}
                          >
                            <span aria-hidden="true">%</span>
                          </Button>
                          {i.status !== 'paid' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 rounded-full p-0 text-[#f07d6a] hover:bg-[#f07d6a]/10 hover:text-[#f07d6a]"
                              onClick={() => void removeInvoice(i.id)}
                              disabled={busy}
                              aria-label={`Supprimer la facture de ${i.host.email}`}
                            >
                              <span aria-hidden="true">×</span>
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dialog taux de commission */}
      <Dialog open={!!rateHost} onOpenChange={(v) => !v && setRateHost(null)}>
        <DialogContent className="border-white/10 bg-[#0b1226] text-white sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="lux-display text-lg text-white">Taux de commission</DialogTitle>
            <DialogDescription className="text-[#8fa0c2]">
              Taux appliqué aux commandes encaissées par <span className="font-medium">{rateHost?.email}</span> (ex : 10 ou 20 %).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rate-input" className="text-[#8fa0c2]">Taux en %</Label>
            <Input
              id="rate-input"
              inputMode="decimal"
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value)}
              placeholder="20"
              className="rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fa0c2]/60 focus-visible:ring-[#5c8af0]/50"
            />
            <p className="text-xs text-[#8fa0c2]">
              Prend effet à la prochaine génération de factures. Les factures déjà payées ne sont pas recalculées.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" className="lux-btn-ghost h-9 rounded-full px-4 text-xs" onClick={() => setRateHost(null)}>
              Annuler
            </Button>
            <Button onClick={() => void saveRate()} disabled={busy} className="lux-btn h-9 rounded-full px-4 text-xs">
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
