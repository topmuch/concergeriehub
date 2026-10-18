'use client';

// =============================================================
// ÉTATS DES LIEUX DE SORTIE (v5.0) — bloc du module « Ménage & Stock »
// Reprise EXACTE de la section existante de menage-content.tsx :
// les 20 dernières inspections signées par les invités (toutes les
// propriétés ou le bien ciblé) : pièces endommagées/sales, auto-
// évaluation, statut de traitement (pending/reviewed/resolved),
// preuve publique + PDF. « Marquer traitée » résout en 1 clic.
// Placé en bas de l'onglet JOURNAL (preuves horodatées de départ).
// =============================================================
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { CheckoutInspectionApi } from './types';
import { formatFrDateTime } from './menage-utils';
import { LuxBusyDot, LUX_GHOST_BTN } from './menage-ui';

const INSPECTION_STATUS_META: Record<string, { label: string; className: string }> = {
  pending: {
    label: 'À traiter',
    className: 'border-[#fbbf24]/30 bg-[#fbbf24]/10 text-[#fbbf24]',
  },
  reviewed: {
    label: 'Consultée',
    className: 'border-[#2dd4bf]/30 bg-[#2dd4bf]/10 text-[#2dd4bf]',
  },
  resolved: {
    label: 'Traitée',
    className: 'border-[#34d399]/30 bg-[#34d399]/10 text-[#34d399]',
  },
};

export function CheckoutInspectionsSection({ selectedId }: { selectedId: string }) {
  const [inspections, setInspections] = useState<CheckoutInspectionApi[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [patchingId, setPatchingId] = useState<string | null>(null);

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'initial') setLoading(true);
    try {
      const res = await fetch(`/api/airbnb/checkout-inspections?propertyId=${encodeURIComponent(selectedId)}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { inspections?: CheckoutInspectionApi[] };
      setInspections(json.inspections ?? []);
    } catch {
      if (mode === 'initial') setInspections(null);
      if (mode === 'refresh') toast.error('Actualisation des états des lieux impossible.');
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void load('initial');
  }, [load]);

  const markResolved = async (id: string) => {
    if (patchingId) return;
    setPatchingId(id);
    try {
      const res = await fetch('/api/airbnb/checkout-inspections', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'resolved' }),
      });
      if (!res.ok) throw new Error('http');
      setInspections((prev) =>
        prev ? prev.map((i) => (i.id === id ? { ...i, status: 'resolved' } : i)) : prev,
      );
      toast.success('Inspection marquée comme traitée.');
    } catch {
      toast.error('Mise à jour impossible. Réessayez.');
    } finally {
      setPatchingId(null);
    }
  };

  const stars = (n: number) => '★'.repeat(Math.max(0, Math.min(5, n))) + '☆'.repeat(Math.max(0, 5 - n));

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut', delay: 0.08 }}
      className="lux-card p-4 sm:p-5"
      aria-label="États des lieux de sortie"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="lux-eyebrow">Signés par vos invités</p>
          <h3 className="lux-display mt-1 text-lg text-white">États des lieux de sortie</h3>
          <p className="text-xs text-[#8fa0c2]">
            Inspections signées par vos invités avant leur départ — preuves horodatées de fin de séjour.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void load('refresh')}
          className={cn('h-9 gap-2 rounded-full px-4 text-xs', LUX_GHOST_BTN)}
          aria-label="Rafraîchir les états des lieux de sortie"
        >
          {loading && <LuxBusyDot />}
          Actualiser
        </Button>
      </div>

      {loading && inspections === null ? (
        <div className="mt-4 space-y-2.5" role="status" aria-label="Chargement des inspections">
          <Skeleton className="h-20 w-full rounded-2xl bg-white/8" />
          <Skeleton className="h-20 w-full rounded-2xl bg-white/8" />
        </div>
      ) : !inspections || inspections.length === 0 ? (
        <div className="lux-empty mt-4 flex flex-col items-center gap-2 rounded-2xl py-8 text-center">
          <span className="lux-dot" style={{ backgroundColor: '#cdb6ff' }} aria-hidden="true" />
          <p className="text-sm font-semibold text-white">Aucun état des lieux pour le moment</p>
          <p className="mt-1 max-w-md text-xs text-[#8fa0c2]">
            L&apos;invité signe son inspection depuis son Hub (« Je quitte le logement ») — le document
            apparaît ici instantanément.
          </p>
        </div>
      ) : (
        <ul className="lux-scroll mt-4 max-h-96 space-y-2.5 overflow-y-auto pr-1">
          {inspections.map((i) => {
            const statusMeta = INSPECTION_STATUS_META[i.status] ?? INSPECTION_STATUS_META.pending;
            return (
              <li
                key={i.id}
                className={cn(
                  'rounded-2xl border p-4',
                  i.hasDamages
                    ? 'border-[#f07d6a]/30 bg-[#f07d6a]/8'
                    : 'border-white/10 bg-white/[0.03]',
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
                      {i.guestName}
                      {i.hasDamages && (
                        <span className="inline-block rounded-full border border-[#f07d6a]/30 bg-[#f07d6a]/12 px-2 py-0.5 text-[10px] font-bold text-[#f07d6a]">
                          Dégâts signalés
                        </span>
                      )}
                      <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusMeta.className}`}>
                        {statusMeta.label}
                      </span>
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[#8fa0c2]">
                      <span className="lux-dot shrink-0" style={{ backgroundColor: '#5c8af0' }} aria-hidden="true" />
                      {i.propertyName ? `${i.propertyName} · ` : ''}
                      {formatFrDateTime(i.signedAt)} ·{' '}
                      <span className="text-[#e9c47c]">{stars(i.selfAssessment)}</span>{' '}
                      <span className="lux-num text-[#e9c47c]">{i.selfAssessment}</span>
                      /5
                    </p>
                    {(i.damagedRooms.length > 0 || i.dirtyRooms.length > 0) && (
                      <p className="mt-1.5 flex flex-wrap gap-1">
                        {i.damagedRooms.map((room) => (
                          <span
                            key={`d-${room}`}
                            className="rounded-full border border-[#f07d6a]/35 bg-[#f07d6a]/12 px-2 py-0.5 text-[10px] font-bold text-[#f07d6a]"
                          >
                            {room}
                          </span>
                        ))}
                        {i.dirtyRooms.map((room) => (
                          <span
                            key={`s-${room}`}
                            className="rounded-full border border-[#fbbf24]/35 bg-[#fbbf24]/12 px-2 py-0.5 text-[10px] font-bold text-[#fbbf24]"
                          >
                            {room}
                          </span>
                        ))}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <a
                      href={i.publicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.04] px-3 text-xs font-semibold text-[#d5def0] transition-colors hover:bg-white/8 hover:text-white"
                      aria-label={`Voir la preuve publique de ${i.guestName}`}
                    >
                      Preuve publique
                    </a>
                    <a
                      href={`${i.publicUrl.replace(/^\/public\/inspection\//, '/api/public/inspection/')}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.04] px-3 text-xs font-semibold text-[#d5def0] transition-colors hover:bg-white/8 hover:text-white"
                      aria-label={`Voir le PDF de ${i.guestName}`}
                    >
                      PDF
                    </a>
                    {i.status !== 'resolved' && (
                      <Button
                        type="button"
                        size="sm"
                        className="h-9 rounded-full bg-gradient-to-br from-[#3d6fe0] to-[#24479c] px-4 text-xs font-semibold text-white shadow-[0_10px_28px_-12px_rgba(61,111,224,0.55)] hover:from-[#5c8af0] hover:to-[#2c56b8]"
                        disabled={patchingId === i.id}
                        onClick={() => void markResolved(i.id)}
                        aria-label={`Marquer l'inspection de ${i.guestName} comme traitée`}
                      >
                        {patchingId === i.id && <LuxBusyDot />}
                        Marquer traitée
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </motion.section>
  );
}
