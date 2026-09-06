'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { AlertCircle, Copy, MoreHorizontal, X } from 'lucide-react';
import { toast } from 'sonner';
import { KPICard } from '@/components/airbnb/host/kpi-card';
import { StatusBadge } from '@/components/airbnb/host/status-badge';
import { DataTable, type DataTableColumn } from '@/components/airbnb/host/data-table';
import { FormDialog } from '@/components/airbnb/host/form-dialog';
import { useHostContext } from '@/components/airbnb/host/host-context';
import { usePlaques, type PlaqueDTO } from '@/hooks/use-plaques';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { cn } from '@/lib/utils';

// =============================================================
// PlatesContent — page « Plaques QR » du Dashboard Client (H4)
//
// • En-tête + 3 mini-cartes (Total / Activées / En attente) —
//   données réelles depuis /api/airbnb/plaques.
// • Filtre client-side par bien (sélecteur du portfolio).
// • DataTable : code (copie), bien, statut, dates, actions
//   (impression PDF, Hub public, désactiver/réactiver).
// • Modale « Commander une nouvelle plaque » (POST) ouverte
//   aussi via ?new=1 (useState initial — un seul coup).
//
// NB honnête : les plaques physiques ne sont pas tracées par
// ScanLog (réservé aux QrCode dynamiques) → pas de statistique
// de scans ici ; l'action proposée est « Voir le Hub public ».
// =============================================================

const CORAL = '#E23F2B';

type StatusChange = { plaque: PlaqueDTO; status: 'active' | 'inactive' };

function dateFr(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function timeValue(iso: string | null): number {
  return iso ? new Date(iso).getTime() : 0;
}

/** Badge de statut — 'cancelled' (legacy) affiché « Désactivée ». */
function PlaqueStatusBadge({ status }: { status: string }) {
  return <StatusBadge status={status} label={status === 'cancelled' ? 'Désactivée' : undefined} />;
}

export function PlatesContent({ openOrderOnInit = false }: { openOrderOnInit?: boolean }) {
  const router = useRouter();
  const { properties, propertiesLoading, selectedProperty } = useHostContext();
  const { plaques, loading, error, refetch } = usePlaques();

  const [propertyFilter, setPropertyFilter] = useState<string>('all');
  // ?new=1 → modale ouverte dès le montage (initialisateur one-shot,
  // pas de setState-in-effect).
  const [orderOpen, setOrderOpen] = useState(() => openOrderOnInit);
  const [orderPropertyId, setOrderPropertyId] = useState('');
  const [creating, setCreating] = useState(false);
  const [lastCreated, setLastCreated] = useState<PlaqueDTO | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<StatusChange | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // ----- Statistiques globales (données réelles) -----
  const total = plaques.length;
  const actives = plaques.filter((p) => p.status === 'active').length;
  const attente = plaques.filter((p) => p.status === 'inactive').length;
  const cancelledCount = plaques.filter((p) => p.status === 'cancelled').length;
  const lostCount = plaques.filter((p) => p.status === 'lost').length;

  const totalHint = useMemo(() => {
    const extras: string[] = [];
    if (cancelledCount > 0) extras.push(`${cancelledCount} désactivée${cancelledCount > 1 ? 's' : ''}`);
    if (lostCount > 0) extras.push(`${lostCount} perdue${lostCount > 1 ? 's' : ''}`);
    return extras.length > 0 ? `dont ${extras.join(' · ')}` : 'Vos plaques QR physiques';
  }, [cancelledCount, lostCount]);

  // ----- Filtre client-side par bien -----
  const filteredPlaques = useMemo(
    () =>
      propertyFilter === 'all'
        ? plaques
        : plaques.filter((p) => p.property?.id === propertyFilter),
    [plaques, propertyFilter],
  );

  // Bien présélectionné dans la modale : sélection du shell, sinon
  // le premier bien — calculé au rendu (zéro effet nécessaire).
  const effectiveOrderPropertyId = orderPropertyId || properties[0]?.id || '';

  // ----- Actions -----
  function copyCode(code: string) {
    navigator.clipboard
      .writeText(code)
      .then(() => toast.success('Code copié'))
      .catch(() => toast.error('Copie impossible dans ce navigateur.'));
  }

  function openOrderModal() {
    if (properties.length === 0) {
      toast.error('Ajoutez d’abord un bien pour commander une plaque.');
      return;
    }
    setOrderPropertyId(selectedProperty?.id ?? '');
    setOrderOpen(true);
  }

  async function createPlaque() {
    if (!effectiveOrderPropertyId) return;
    setCreating(true);
    try {
      const res = await fetch('/api/airbnb/plaques', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId: effectiveOrderPropertyId }),
      });
      const json = (await res.json().catch(() => ({}))) as { plaque?: PlaqueDTO; error?: string };
      if (!res.ok || !json.plaque) {
        throw new Error(json.error ?? 'Erreur serveur. Réessayez dans un instant.');
      }
      toast.success('Plaque générée ✅ — imprimez-la et collez-la dans le logement');
      setOrderOpen(false);
      setPropertyFilter('all'); // garantit la visibilité de la nouvelle plaque
      setLastCreated(json.plaque);
      await refetch();
    } catch (err) {
      console.error('[PlatesContent] create failed:', err);
      toast.error(err instanceof Error ? err.message : 'Impossible de générer la plaque.');
    } finally {
      setCreating(false);
    }
  }

  async function performStatusChange() {
    if (!confirmTarget) return;
    const { plaque, status } = confirmTarget;
    setConfirmTarget(null);
    setBusyId(plaque.id);
    try {
      const res = await fetch(`/api/airbnb/plaques/${plaque.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Erreur serveur');
      toast.success(
        status === 'active'
          ? 'Plaque réactivée ✅ — le Hub public redevient accessible'
          : 'Plaque désactivée ⏸️ — le Hub public est maintenant indisponible',
      );
      await refetch();
    } catch (err) {
      console.error('[PlatesContent] status change failed:', err);
      toast.error(err instanceof Error ? err.message : 'Impossible de changer le statut.');
    } finally {
      setBusyId(null);
    }
  }

  // ----- Colonnes DataTable -----
  const columns = useMemo<DataTableColumn<PlaqueDTO>[]>(() => {
    const cols: DataTableColumn<PlaqueDTO>[] = [
      {
        key: 'code',
        header: 'Code',
        sortValue: (row) => row.activationCode,
        cell: (row) => (
          <div className="flex min-w-0 items-center gap-1">
            <span className="truncate font-mono text-[13px] font-bold text-slate-900">
              {row.activationCode}
            </span>
            {row.id === lastCreated?.id && (
              <span className="ml-1 inline-flex shrink-0 items-center rounded-full bg-[#FEF1EF] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#E23F2B] ring-1 ring-[#E23F2B]/30">
                Nouvelle
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-slate-400 hover:text-slate-700"
              onClick={() => copyCode(row.activationCode)}
              aria-label={`Copier le code ${row.activationCode}`}
            >
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        ),
      },
      {
        key: 'property',
        header: 'Bien',
        sortValue: (row) => row.property?.name ?? '',
        cell: (row) => (
          <span className="block max-w-[180px] truncate font-medium text-slate-700">
            {row.property?.name ?? '—'}
          </span>
        ),
      },
      {
        key: 'status',
        header: 'Statut',
        sortValue: (row) => row.status,
        cell: (row) => <PlaqueStatusBadge status={row.status} />,
      },
      {
        key: 'createdAt',
        header: 'Créée le',
        sortValue: (row) => timeValue(row.createdAt),
        cell: (row) => (
          <time dateTime={row.createdAt} className="whitespace-nowrap text-slate-600">
            {dateFr(row.createdAt)}
          </time>
        ),
      },
      {
        key: 'claimedAt',
        header: 'Activée le',
        hideBelow: 'md',
        sortValue: (row) => timeValue(row.claimedAt),
        cell: (row) =>
          row.claimedAt ? (
            <time dateTime={row.claimedAt} className="whitespace-nowrap text-slate-600">
              {dateFr(row.claimedAt)}
            </time>
          ) : (
            <span className="text-slate-400">—</span>
          ),
      },
      {
        key: 'actions',
        header: 'Actions',
        className: 'text-right',
        cell: (row) => (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-slate-500 hover:text-slate-900"
                  disabled={busyId === row.id}
                  aria-label={`Actions pour la plaque ${row.activationCode}`}
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuItem
                  onSelect={() => router.push(`/airbnb/plates/${row.id}/print`)}
                >
                  🖨️ Télécharger / Imprimer PDF
                </DropdownMenuItem>
                {row.hubSlug ? (
                  <DropdownMenuItem asChild>
                    <a
                      href={`/hub/${row.hubSlug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      👁️ Voir le Hub public
                    </a>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem disabled>👁️ Voir le Hub public</DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                {row.status === 'active' ? (
                  <DropdownMenuItem onSelect={() => setConfirmTarget({ plaque: row, status: 'inactive' })}>
                    ⏸️ Désactiver
                  </DropdownMenuItem>
                ) : row.status === 'lost' ? (
                  <DropdownMenuItem disabled>🔒 Perdue — contactez le support</DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onSelect={() => setConfirmTarget({ plaque: row, status: 'active' })}
                    className="focus:text-emerald-700"
                  >
                    ▶️ Réactiver
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ];
    return cols;
  }, [lastCreated, busyId, router]);

  // ----- Rendus intermédiaires -----
  const showEmptyState = !loading && !error && total === 0;

  return (
    <div className="flex flex-col gap-6">
      {/* ---------- En-tête ---------- */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            📱 Plaques QR
          </h1>
          <p className="mt-1 truncate text-sm text-slate-600">
            {loading || propertiesLoading
              ? 'Chargement de vos plaques…'
              : `${total} plaque${total > 1 ? 's' : ''} · ${actives} activée${actives > 1 ? 's' : ''} · ${attente} en attente`}
          </p>
        </div>
        <Button
          onClick={openOrderModal}
          className="h-10 shrink-0 bg-[#E23F2B] font-semibold text-white hover:bg-[#c93520]"
          aria-label="Commander une nouvelle plaque QR"
        >
          <span aria-hidden="true">📱</span> Commander une nouvelle plaque
        </Button>
      </div>

      {/* ---------- Erreur API ---------- */}
      {error && (
        <div
          className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          role="alert"
        >
          <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {/* ---------- Bannière « plaque créée » ---------- */}
      {lastCreated && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3"
          role="status"
        >
          <span aria-hidden="true" className="text-xl">🎉</span>
          <p className="min-w-0 flex-1 text-sm text-emerald-900">
            <span className="font-bold">Plaque créée !</span>{' '}
            Code <span className="font-mono font-semibold">{lastCreated.activationCode}</span> —
            imprimez-la et collez-la dans le logement.
          </p>
          <Button
            size="sm"
            asChild
            className="h-8 shrink-0 bg-[#E23F2B] font-semibold text-white hover:bg-[#c93520]"
          >
            <Link href={`/airbnb/plates/${lastCreated.id}/print`}>
              🖨️ Imprimer maintenant
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-emerald-700 hover:text-emerald-900"
            onClick={() => setLastCreated(null)}
            aria-label="Masquer la confirmation"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </motion.div>
      )}

      {showEmptyState ? (
        /* ---------- Empty state ---------- */
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center shadow-sm"
        >
          <span
            aria-hidden="true"
            className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FEF1EF] text-3xl ring-1 ring-[#E23F2B]/20"
          >
            📱
          </span>
          <h2 className="text-lg font-bold text-slate-900">Aucune plaque pour le moment</h2>
          <p className="max-w-md text-sm text-slate-600">
            Commandez une plaque QR, imprimez-la et collez-la dans le logement : vos voyageurs
            n&apos;auront qu&apos;à scanner pour accéder au Hub (Wi-Fi, guide, services…).
          </p>
          <Button
            onClick={openOrderModal}
            className="mt-1 bg-[#E23F2B] font-semibold text-white hover:bg-[#c93520]"
          >
            <span aria-hidden="true">📱</span> Commander ma première plaque
          </Button>
        </motion.div>
      ) : (
        <>
          {/* ---------- Statistiques rapides ---------- */}
          <section
            aria-label="Statistiques des plaques"
            className="grid grid-cols-1 gap-4 sm:grid-cols-3"
          >
            <KPICard
              icon="🏷️"
              label="Total plaques"
              value={loading ? '—' : total}
              hint={loading ? undefined : totalHint}
              loading={loading}
              className="min-w-0"
            />
            <KPICard
              icon="✅"
              label="Activées"
              value={loading ? '—' : actives}
              hint={loading ? undefined : 'Le Hub public est accessible'}
              loading={loading}
              className="min-w-0"
            />
            <KPICard
              icon="⏳"
              label="En attente"
              value={loading ? '—' : attente}
              hint={loading ? undefined : 'À imprimer et coller sur place'}
              loading={loading}
              className="min-w-0"
            />
          </section>

          {/* ---------- Filtre + Tableau ---------- */}
          <section
            aria-label="Liste des plaques"
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
          >
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-base font-bold text-slate-900">📋 Liste des plaques</h2>
              {loading || propertiesLoading ? (
                <Skeleton className="h-9 w-full rounded-lg sm:w-[240px]" aria-hidden="true" />
              ) : (
                <Select value={propertyFilter} onValueChange={setPropertyFilter}>
                  <SelectTrigger
                    className="w-full text-sm sm:w-[240px]"
                    aria-label="Filtrer par bien"
                  >
                    <SelectValue placeholder="Tous les biens" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les biens</SelectItem>
                    {properties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {loading ? (
              <div className="flex flex-col gap-2" aria-busy="true" aria-label="Chargement du tableau">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-11 w-full rounded-lg" aria-hidden="true" />
                ))}
              </div>
            ) : (
              <DataTable
                columns={columns}
                rows={filteredPlaques}
                rowKey={(row) => row.id}
                emptyMessage={
                  propertyFilter === 'all'
                    ? 'Aucune plaque pour le moment.'
                    : 'Aucune plaque pour ce bien.'
                }
              />
            )}
          </section>
        </>
      )}

      {/* ---------- Modale « Commander une nouvelle plaque » ---------- */}
      <FormDialog
        open={orderOpen}
        onOpenChange={setOrderOpen}
        title="Commander une nouvelle plaque"
        description="Une plaque QR unique sera générée pour le bien choisi : lien Hub public, code d'activation et fiche imprimable. Elle est active immédiatement."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setOrderOpen(false)} disabled={creating}>
              Annuler
            </Button>
            <Button
              onClick={() => void createPlaque()}
              disabled={creating || !effectiveOrderPropertyId}
              className="bg-[#E23F2B] font-semibold text-white hover:bg-[#c93520]"
            >
              {creating ? (
                <>
                  <span
                    aria-hidden="true"
                    className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                  />
                  Génération…
                </>
              ) : (
                <>
                  <span aria-hidden="true">📱</span> Générer la plaque
                </>
              )}
            </Button>
          </>
        }
      >
        {properties.length === 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Vous n&apos;avez aucun bien pour le moment. Ajoutez d&apos;abord une propriété pour
            lui commander une plaque.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Label htmlFor="plate-property">Pour quel bien ?</Label>
            <Select value={effectiveOrderPropertyId} onValueChange={setOrderPropertyId}>
              <SelectTrigger id="plate-property" className="w-full">
                <SelectValue placeholder="Choisir un bien" />
              </SelectTrigger>
              <SelectContent>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">
              La plaque sera rattachée à ce bien et son Hub public sera actif aussitôt.
            </p>
          </div>
        )}
      </FormDialog>

      {/* ---------- Confirmation désactiver / réactiver ---------- */}
      <AlertDialog
        open={confirmTarget !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmTarget?.status === 'inactive'
                ? 'Désactiver cette plaque ?'
                : 'Réactiver cette plaque ?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTarget?.status === 'inactive' ? (
                <>
                  Le QR{' '}
                  <span className="font-mono font-semibold text-slate-900">
                    {confirmTarget?.plaque.activationCode}
                  </span>{' '}
                  cessera de fonctionner : le Hub public affichera une page indisponible aux
                  voyageurs. Vous pourrez la réactiver à tout moment.
                </>
              ) : (
                <>
                  Le QR{' '}
                  <span className="font-mono font-semibold text-slate-900">
                    {confirmTarget?.plaque.activationCode}
                  </span>{' '}
                  redeviendra actif : les voyageurs accéderont de nouveau au Hub public du bien.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void performStatusChange()}
              className={cn(
                'font-semibold text-white',
                confirmTarget?.status === 'inactive'
                  ? 'bg-slate-900 hover:bg-slate-800'
                  : 'bg-emerald-600 hover:bg-emerald-700',
              )}
            >
              {confirmTarget?.status === 'inactive' ? '⏸️ Désactiver' : '▶️ Réactiver'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
