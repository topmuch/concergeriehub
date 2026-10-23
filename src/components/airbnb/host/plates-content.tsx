'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import QRCode from 'qrcode';
import { Loader2 } from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
//
// v4.69 — PHASE 1 refonte UI : colonne « Lien » (URL publique du
//   Hub, copie en 1 clic) + bouton « Aperçu QR » par ligne (dialog
//   QR généré côté client via `qrcode`, marine #043455) — même
//   pattern que la page impression plaque-print. Actions inchangées.
// v5.2 « SAPHIR LUXE » — refonte design profonde (demande client) :
//   nuit saphir, SANS icônes ni emojis décoratifs (typographie,
//   .lux-dot, glyphes purs), portails (Dropdown/Dialog/AlertDialog/
//   Select) stylés explicitement en sombre bleuté. Logique intacte.
// =============================================================

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

  // ----- v4.69 — Lien public du Hub + Aperçu QR -----
  // L'origine est lue après le montage (évite un mismatch SSR).
  const [origin, setOrigin] = useState('');
  const [qrTarget, setQrTarget] = useState<PlaqueDTO | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [qrBusy, setQrBusy] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  /** URL publique scannable de la plaque (vide si pas de hubSlug). */
  const hubUrlOf = useCallback(
    (row: PlaqueDTO) => (row.hubSlug ? `${origin}/hub/${row.hubSlug}` : ''),
    [origin],
  );

  // Génération du QR à l'ouverture du dialog (client-side, marine). 
  useEffect(() => {
    if (!qrTarget) return;
    const url = hubUrlOf(qrTarget);
    if (!url) return;
    let cancelled = false;
    setQrBusy(true);
    setQrDataUrl('');
    QRCode.toDataURL(url, {
      width: 512,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#043455', light: '#FFFFFF' },
    })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) toast.error('Génération du QR code impossible. Réessayez.');
      })
      .finally(() => {
        if (!cancelled) setQrBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [qrTarget, hubUrlOf]);

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

  // v4.69 — copie du lien public du Hub (même pattern que copyCode).
  // v4.81 (AUDIT QA) — fallback execCommand : navigator.clipboard échoue
  // hors HTTPS / vieux navigateurs → textarea cachée + execCommand('copy').
  function copyLink(url: string) {
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success('Lien copié'))
      .catch(() => {
        try {
          const ta = document.createElement('textarea');
          ta.value = url;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          const ok = document.execCommand('copy');
          document.body.removeChild(ta);
          if (ok) toast.success('Lien copié');
          else toast.error(`Copiez manuellement : ${url}`);
        } catch {
          toast.error(`Copiez manuellement : ${url}`);
        }
      });
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
          <div className="flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              className="truncate font-mono text-[13px] font-bold text-white transition-colors hover:text-[#e9c47c]"
              onClick={() => copyCode(row.activationCode)}
              aria-label={`Copier le code ${row.activationCode}`}
              title="Copier le code"
            >
              {row.activationCode}
            </button>
            {row.id === lastCreated?.id && (
              <span className="ml-0.5 inline-flex shrink-0 items-center rounded-full border border-[#e9c47c]/30 bg-[#e9c47c]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#e9c47c]">
                Nouvelle
              </span>
            )}
          </div>
        ),
      },
      {
        key: 'property',
        header: 'Bien',
        sortValue: (row) => row.property?.name ?? '',
        cell: (row) => (
          <span className="block max-w-[180px] truncate font-medium text-white">
            {row.property?.name ?? '—'}
          </span>
        ),
      },
      {
        // v4.69 — lien public du Hub : URL tronquée + copie en 1 clic.
        key: 'hubUrl',
        header: 'Lien',
        hideBelow: 'lg',
        sortValue: (row) => (row.hubSlug ? `/hub/${row.hubSlug}` : ''),
        cell: (row) => {
          const url = hubUrlOf(row);
          if (!url) return <span className="text-[#8fabc2]/50">—</span>;
          return (
            <button
              type="button"
              className="max-w-[190px] truncate font-mono text-[11px] text-[#8fabc2] transition-colors hover:text-[#a9d8ff]"
              title={url}
              onClick={() => copyLink(url)}
              aria-label={`Copier le lien public du Hub ${url}`}
            >
              {url.replace(/^https?:\/\//, '')}
            </button>
          );
        },
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
          <time dateTime={row.createdAt} className="whitespace-nowrap text-[#8fabc2]">
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
            <time dateTime={row.claimedAt} className="whitespace-nowrap text-[#8fabc2]">
              {dateFr(row.claimedAt)}
            </time>
          ) : (
            <span className="text-[#8fabc2]/50">—</span>
          ),
      },
      {
        key: 'actions',
        header: 'Actions',
        className: 'text-right',
        cell: (row) => (
          <div className="flex justify-end gap-1">
            {/* v4.69 — aperçu QR : dialog avec QR généré côté client. */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 rounded-full px-2.5 text-[11px] font-semibold tracking-[0.08em] text-[#8fabc2] hover:bg-white/8 hover:text-white"
              onClick={() => setQrTarget(row)}
              disabled={!row.hubSlug}
              aria-label={`Aperçu QR de la plaque ${row.activationCode}`}
              title="Aperçu QR"
            >
              QR
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full text-[#8fabc2] hover:bg-white/8 hover:text-white"
                  disabled={busyId === row.id}
                  aria-label={`Actions pour la plaque ${row.activationCode}`}
                >
                  <span aria-hidden="true" className="text-base leading-none">▾</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-60 border-white/10 bg-[#0d1530] text-white"
              >
                <DropdownMenuItem
                  className="focus:bg-white/8 focus:text-white"
                  onSelect={() => router.push(`/airbnb/plates/${row.id}/print`)}
                >
                  Télécharger / Imprimer PDF
                </DropdownMenuItem>
                {row.hubSlug ? (
                  <DropdownMenuItem asChild className="focus:bg-white/8 focus:text-white">
                    <a
                      href={`/hub/${row.hubSlug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Voir le Hub public
                    </a>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem disabled className="focus:bg-white/8 focus:text-white">
                    Voir le Hub public
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator className="bg-white/10" />
                {row.status === 'active' ? (
                  <DropdownMenuItem
                    className="focus:bg-white/8 focus:text-white"
                    onSelect={() => setConfirmTarget({ plaque: row, status: 'inactive' })}
                  >
                    Désactiver
                  </DropdownMenuItem>
                ) : row.status === 'lost' ? (
                  <DropdownMenuItem disabled className="focus:bg-white/8 focus:text-white">
                    Perdue — contactez le support
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    className="focus:bg-white/8 focus:text-white"
                    onSelect={() => setConfirmTarget({ plaque: row, status: 'active' })}
                  >
                    Réactiver
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ];
    return cols;
  }, [lastCreated, busyId, router, hubUrlOf]);

  // ----- Rendus intermédiaires -----
  const showEmptyState = !loading && !error && total === 0;

  return (
    <div className="flex flex-col gap-6">
      {/* ---------- En-tête ---------- */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="lux-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Plaques QR
          </h1>
          <p className="mt-1.5 truncate text-xs text-[#8fabc2] sm:text-sm">
            {loading || propertiesLoading
              ? 'Chargement de vos plaques…'
              : `${total} plaque${total > 1 ? 's' : ''} · ${actives} activée${actives > 1 ? 's' : ''} · ${attente} en attente`}
          </p>
          <p className="mt-0.5 hidden text-xs text-[#8fabc2]/70 sm:block">
            Chaque plaque possède un lien public scannable : copiez-le ou générez son QR en un
            clic.
          </p>
        </div>
        <button
          type="button"
          onClick={openOrderModal}
          className="lux-btn h-9 w-full shrink-0 px-4 text-xs sm:w-auto"
          aria-label="Commander une nouvelle plaque QR"
        >
          Commander une nouvelle plaque
        </button>
      </div>

      {/* ---------- Erreur API ---------- */}
      {error && (
        <div
          className="flex items-center gap-3 rounded-2xl border border-[#f07d6a]/25 bg-[#f07d6a]/8 px-4 py-3 text-sm text-[#f6a293]"
          role="alert"
        >
          <span className="lux-dot shrink-0" style={{ backgroundColor: '#f07d6a' }} aria-hidden="true" />
          {error}
        </div>
      )}

      {/* ---------- Bannière « plaque créée » ---------- */}
      {lastCreated && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#34d399]/25 bg-[#34d399]/8 px-4 py-3"
          role="status"
        >
          <span className="lux-dot shrink-0" style={{ backgroundColor: '#34d399' }} aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm text-[#b8ecd9]">
            <span className="font-bold">Plaque créée !</span>{' '}
            Code <span className="font-mono font-semibold text-white">{lastCreated.activationCode}</span> —
            imprimez-la et collez-la dans le logement.
          </p>
          <Link
            href={`/airbnb/plates/${lastCreated.id}/print`}
            className="lux-btn lux-btn-gold h-8 shrink-0 px-3 text-[11px]"
          >
            Imprimer maintenant
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-full text-[#8fabc2] hover:bg-white/8 hover:text-white"
            onClick={() => setLastCreated(null)}
            aria-label="Masquer la confirmation"
          >
            <span aria-hidden="true" className="text-base leading-none">×</span>
          </Button>
        </motion.div>
      )}

      {showEmptyState ? (
        /* ---------- Empty state ---------- */
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="lux-empty flex flex-col items-center gap-2 rounded-2xl px-6 py-14 text-center"
        >
          <h2 className="lux-display text-lg text-white">Aucune plaque pour le moment</h2>
          <p className="max-w-md text-xs text-[#8fabc2] sm:text-sm">
            Commandez une plaque QR, imprimez-la et collez-la dans le logement : vos voyageurs
            n&apos;auront qu&apos;à scanner pour accéder au Hub (Wi-Fi, guide, services…).
          </p>
          <button
            type="button"
            onClick={openOrderModal}
            className="lux-btn mt-3 h-9 w-full px-4 text-xs sm:w-auto"
          >
            Commander ma première plaque
          </button>
        </motion.div>
      ) : (
        <>
          {/* ---------- Statistiques rapides ---------- */}
          <section
            aria-label="Statistiques des plaques"
            className="grid grid-cols-1 gap-4 sm:grid-cols-3"
          >
            <KPICard
              tone="rausch"
              label="Total plaques"
              value={loading ? '—' : total}
              hint={loading ? undefined : totalHint}
              loading={loading}
              className="min-w-0"
            />
            <KPICard
              tone="emerald"
              label="Activées"
              value={loading ? '—' : actives}
              hint={loading ? undefined : 'Le Hub public est accessible'}
              loading={loading}
              className="min-w-0"
            />
            <KPICard
              tone="amber"
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
            className="lux-card p-4 sm:p-6"
          >
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="lux-display text-lg font-semibold text-white">Liste des plaques</h2>
              {loading || propertiesLoading ? (
                <Skeleton className="h-9 w-full rounded-xl bg-white/8 sm:w-[240px]" aria-hidden="true" />
              ) : (
                <Select value={propertyFilter} onValueChange={setPropertyFilter}>
                  <SelectTrigger
                    className="w-full rounded-xl border-white/12 bg-white/[0.04] text-sm text-white sm:w-[240px]"
                    aria-label="Filtrer par bien"
                  >
                    <SelectValue placeholder="Tous les biens" />
                  </SelectTrigger>
                  <SelectContent className="border-white/10 bg-[#0d1530] text-white">
                    <SelectItem value="all" className="focus:bg-white/8 focus:text-white">Tous les biens</SelectItem>
                    {properties.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="focus:bg-white/8 focus:text-white">
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
                  <Skeleton key={i} className="h-11 w-full rounded-xl bg-white/8" aria-hidden="true" />
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
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => setOrderOpen(false)}
              disabled={creating}
            >
              Annuler
            </Button>
            <button
              type="button"
              onClick={() => void createPlaque()}
              disabled={creating || !effectiveOrderPropertyId}
              className="lux-btn h-9 px-4 text-xs disabled:pointer-events-none disabled:opacity-60"
            >
              {creating ? (
                <>
                  <span
                    aria-hidden="true"
                    className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white"
                  />
                  Génération…
                </>
              ) : (
                <>Générer la plaque</>
              )}
            </button>
          </>
        }
      >
        {properties.length === 0 ? (
          <div className="rounded-xl border border-amber-300/70 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
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
            <p className="text-xs text-muted-foreground">
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
        <AlertDialogContent className="border-white/10 bg-[#0b1226] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="lux-display text-lg font-semibold text-white">
              {confirmTarget?.status === 'inactive'
                ? 'Désactiver cette plaque ?'
                : 'Réactiver cette plaque ?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#8fabc2]">
              {confirmTarget?.status === 'inactive' ? (
                <>
                  Le QR{' '}
                  <span className="font-mono font-semibold text-white">
                    {confirmTarget?.plaque.activationCode}
                  </span>{' '}
                  cessera de fonctionner : le Hub public affichera une page indisponible aux
                  voyageurs. Vous pourrez la réactiver à tout moment.
                </>
              ) : (
                <>
                  Le QR{' '}
                  <span className="font-mono font-semibold text-white">
                    {confirmTarget?.plaque.activationCode}
                  </span>{' '}
                  redeviendra actif : les voyageurs accéderont de nouveau au Hub public du bien.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full border-white/12 bg-white/[0.04] text-[#d5def0] hover:bg-white/8 hover:text-white">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void performStatusChange()}
              className={cn(
                'rounded-full font-semibold text-white',
                confirmTarget?.status === 'inactive'
                  ? 'bg-[#f07d6a] hover:bg-[#f8957f]'
                  : 'bg-gradient-to-br from-[#3d97e0] to-[#24479c] hover:brightness-110',
              )}
            >
              {confirmTarget?.status === 'inactive' ? 'Désactiver' : 'Réactiver'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ---------- v4.69 — Dialog « Aperçu QR » ---------- */}
      <Dialog open={!!qrTarget} onOpenChange={(o) => !o && setQrTarget(null)}>
        <DialogContent className="max-w-md rounded-2xl border-white/10 bg-[#0b1226] text-white">
          <DialogHeader>
            <DialogTitle className="lux-display flex items-center gap-2 text-lg font-semibold text-white">
              Aperçu QR — {qrTarget?.activationCode ?? ''}
            </DialogTitle>
            <DialogDescription className="text-[#8fabc2]">
              Ce QR pointe vers le Hub public du bien : les voyageurs le scannent depuis la
              plaque collée sur place (Wi-Fi, guide, services…).
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-3">
            <div className="flex h-56 w-56 items-center justify-center rounded-xl border border-white/15 bg-white p-2 shadow-inner">
              {qrBusy ? (
                <Loader2 className="h-8 w-8 animate-spin text-[#8fabc2]" aria-hidden="true" />
              ) : qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`QR code du Hub public de la plaque ${qrTarget?.activationCode ?? ''}`}
                  className="h-full w-full rounded-lg"
                />
              ) : (
                <span className="text-xs text-[#8fabc2]">QR indisponible</span>
              )}
            </div>
            <p className="w-full break-all rounded-xl bg-white/[0.04] p-2.5 text-center font-mono text-[11px] text-[#8fabc2]">
              {qrTarget ? hubUrlOf(qrTarget) : ''}
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="ghost"
              className="h-9 rounded-full border border-white/12 bg-white/[0.03] px-4 text-xs font-semibold text-[#d5def0] hover:bg-white/8 hover:text-white"
              onClick={() => qrTarget && copyLink(hubUrlOf(qrTarget))}
              disabled={!qrTarget?.hubSlug}
            >
              Copier le lien
            </Button>
            {qrTarget?.hubSlug ? (
              <Button
                type="button"
                variant="ghost"
                className="h-9 rounded-full border border-white/12 bg-white/[0.03] px-4 text-xs font-semibold text-[#d5def0] hover:bg-white/8 hover:text-white"
                asChild
              >
                <a href={`/hub/${qrTarget.hubSlug}`} target="_blank" rel="noopener noreferrer">
                  Ouvrir le Hub public
                </a>
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                className="h-9 rounded-full border border-white/12 bg-white/[0.03] px-4 text-xs font-semibold text-[#d5def0] hover:bg-white/8 hover:text-white"
                disabled
              >
                Ouvrir le Hub public
              </Button>
            )}
            <Button
              type="button"
              onClick={() => qrTarget && router.push(`/airbnb/plates/${qrTarget.id}/print`)}
              disabled={!qrTarget}
              className="lux-btn h-9 rounded-full text-xs"
            >
              Imprimer la plaque
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
