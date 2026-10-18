'use client';

// =============================================================
// DEMANDES PARTICULIÈRES (v5.x) — onglet 4 du module « Ménage & Stock »
// Reprise du panneau existant (ajouté v4.95) : demandes d'équipements
// envoyées par les invités depuis le Hub (lit d'appoint, lit bébé,
// siège bébé, serviettes…). Suivi : En attente → En cours → Traité
// (+ Annuler / Réouvrir). Historique traité/annulé dépliable.
// Fonctionne en vue « Toutes les propriétés » (nom du bien affiché)
// comme sur un bien précis. Sans icônes : points colorés uniquement.
// =============================================================
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { SPECIAL_REQUEST_STATUS_META, specialRequestItemMeta } from '@/lib/special-requests';
import type { SpecialRequestApi } from './types';
import { formatFrDateTime } from './menage-utils';
import { LuxBusyDot, LUX_GHOST_BTN } from './menage-ui';

interface MenageRequestsProps {
  /** 'all' ou id du bien — même contrat que le bloc existant. */
  selectedId: string;
}

export function MenageRequests({ selectedId }: MenageRequestsProps) {
  const [requests, setRequests] = useState<SpecialRequestApi[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'initial') setLoading(true);
    try {
      const res = await fetch(`/api/airbnb/special-requests?propertyId=${encodeURIComponent(selectedId)}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { requests?: SpecialRequestApi[] };
      setRequests(json.requests ?? []);
    } catch {
      if (mode === 'initial') setRequests(null);
      if (mode === 'refresh') toast.error('Actualisation des demandes particulières impossible.');
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void load('initial');
  }, [load]);

  const act = async (requestId: string, action: 'START' | 'COMPLETE' | 'CANCEL' | 'REOPEN') => {
    if (actingId) return;
    setActingId(requestId);
    try {
      const res = await fetch('/api/airbnb/special-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, action }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        status?: string;
      } | null;
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? 'http');
      const nextStatus = json.status ?? 'pending';
      const nextMeta = SPECIAL_REQUEST_STATUS_META[nextStatus];
      setRequests((prev) =>
        prev
          ? prev.map((r) =>
              r.id === requestId
                ? {
                    ...r,
                    status: nextStatus,
                    statusLabel: nextMeta?.label ?? r.statusLabel,
                    handledAt:
                      action === 'START' || action === 'COMPLETE'
                        ? new Date().toISOString()
                        : action === 'REOPEN'
                          ? null
                          : r.handledAt,
                  }
                : r,
            )
          : prev,
      );
      toast.success(
        action === 'START'
          ? 'Demande prise en charge — en cours.'
          : action === 'COMPLETE'
            ? 'Demande marquée comme traitée ✓'
            : action === 'CANCEL'
              ? 'Demande annulée.'
              : 'Demande réouverte.',
      );
    } catch {
      toast.error('Action impossible. Réessayez.');
    } finally {
      setActingId(null);
    }
  };

  const open = (requests ?? []).filter((r) => r.status === 'pending' || r.status === 'in_progress');
  const history = (requests ?? []).filter((r) => r.status === 'done' || r.status === 'cancelled');

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="lux-card p-4 sm:p-5"
      aria-label="Demandes particulières"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="lux-eyebrow">Demandes des invités</p>
          <h2 className="lux-display mt-1 text-lg text-white">Demandes particulières</h2>
          <p className="mt-0.5 text-xs text-[#8fa0c2]">
            Lit d&apos;appoint, lit bébé, siège bébé, serviettes… envoyées depuis le Hub par vos
            invités.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn('h-8 shrink-0 rounded-full border-white/12 bg-white/[0.04] px-3 text-xs', LUX_GHOST_BTN)}
          disabled={loading}
          onClick={() => void load('refresh')}
          aria-label="Rafraîchir les demandes particulières"
        >
          {loading && <LuxBusyDot />}
          Actualiser
        </Button>
      </div>

      {loading && requests === null ? (
        <Skeleton className="mt-4 h-24 w-full rounded-2xl bg-white/8" />
      ) : requests === null ? (
        <div className="lux-empty mt-4 flex flex-col items-center gap-2 rounded-2xl p-6 text-center">
          <span className="lux-dot" style={{ backgroundColor: '#e9c47c' }} aria-hidden="true" />
          <p className="text-sm font-semibold text-white">Chargement impossible</p>
          <p className="text-xs text-[#8fa0c2]">Réessayez avec le bouton Actualiser.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {open.length === 0 && history.length === 0 && (
            <div className="lux-empty flex flex-col items-center gap-2 rounded-2xl p-6 text-center">
              <span className="lux-dot" style={{ backgroundColor: '#e9c47c' }} aria-hidden="true" />
              <p className="text-sm font-semibold text-white">Aucune demande pour le moment</p>
              <p className="text-xs text-[#8fa0c2]">
                Les demandes envoyées depuis l&apos;onglet « Demandes particulières » du Hub
                apparaîtront ici.
              </p>
            </div>
          )}

          {open.length > 0 && (
            <ul className="space-y-2.5">
              {open.map((r) => {
                const item = specialRequestItemMeta(r.itemType);
                const statusMeta = SPECIAL_REQUEST_STATUS_META[r.status] ?? SPECIAL_REQUEST_STATUS_META.pending;
                return (
                  <li
                    key={r.id}
                    className={cn(
                      'flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-start sm:justify-between',
                      r.status === 'pending'
                        ? 'border-[#fbbf24]/30 bg-[#fbbf24]/8'
                        : 'border-[#2dd4bf]/30 bg-[#2dd4bf]/8',
                    )}
                  >
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
                        {item.label}
                        {r.quantity > 1 ? <span className="text-[#8fa0c2]">×{r.quantity}</span> : null}
                        <span className="ml-1 inline-block rounded-full border px-2 py-0.5 text-[11px] font-bold" style={{ borderColor: `${statusMeta.dot}55`, color: statusMeta.dot }}>
                          {statusMeta.label}
                        </span>
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-[#8fa0c2]">
                        <span
                          className="lux-dot shrink-0"
                          style={{ backgroundColor: statusMeta.dot }}
                          aria-hidden="true"
                        />
                        {r.guestName ?? 'Invité'}
                        {r.propertyName ? ` · ${r.propertyName}` : ''}
                        {' · '}
                        {formatFrDateTime(r.requestedAt)}
                      </p>
                      {r.note ? (
                        <p className="mt-1.5 rounded-xl bg-white/[0.04] px-3 py-2 text-xs leading-relaxed text-[#d5def0]">
                          « {r.note.slice(0, 200)} »
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {r.status === 'pending' && (
                        <Button
                          type="button"
                          size="sm"
                          className="h-9 rounded-full bg-gradient-to-br from-[#3d6fe0] to-[#24479c] px-4 text-xs font-semibold text-white shadow-[0_10px_28px_-12px_rgba(61,111,224,0.55)] hover:from-[#5c8af0] hover:to-[#2c56b8]"
                          disabled={actingId === r.id}
                          onClick={() => void act(r.id, 'START')}
                          aria-label={`Prendre en charge : ${item.label}`}
                        >
                          {actingId === r.id && <LuxBusyDot />}
                          Prendre en charge
                        </Button>
                      )}
                      {r.status === 'in_progress' && (
                        <Button
                          type="button"
                          size="sm"
                          className="h-9 rounded-full bg-gradient-to-br from-[#2fa77a] to-[#1c6e52] px-4 text-xs font-semibold text-white shadow-[0_10px_28px_-12px_rgba(47,167,122,0.55)] hover:from-[#3ec292] hover:to-[#23815f]"
                          disabled={actingId === r.id}
                          onClick={() => void act(r.id, 'COMPLETE')}
                          aria-label={`Marquer traité : ${item.label}`}
                        >
                          {actingId === r.id && <LuxBusyDot />}
                          Traité
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={cn('h-9 rounded-full px-4 text-xs', LUX_GHOST_BTN)}
                        disabled={actingId === r.id}
                        onClick={() => void act(r.id, 'CANCEL')}
                        aria-label={`Annuler : ${item.label}`}
                      >
                        Annuler
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {history.length > 0 && (
            <details className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <summary className="cursor-pointer text-sm font-semibold text-[#8fa0c2] transition-colors hover:text-white">
                Historique traité / annulé ({history.length})
              </summary>
              <ul className="mt-2.5 space-y-1.5">
                {history.map((r) => {
                  const item = specialRequestItemMeta(r.itemType);
                  const statusMeta = SPECIAL_REQUEST_STATUS_META[r.status] ?? SPECIAL_REQUEST_STATUS_META.done;
                  return (
                    <li key={r.id} className="flex flex-wrap items-center gap-2 text-xs text-[#8fa0c2]">
                      <span className="lux-dot shrink-0" style={{ backgroundColor: statusMeta.dot }} aria-hidden="true" />
                      {item.label}
                      {r.quantity > 1 ? ` ×${r.quantity}` : ''}
                      {' · '}
                      {r.guestName ?? 'Invité'}
                      {r.propertyName ? ` · ${r.propertyName}` : ''}
                      {' · '}
                      {formatFrDateTime(r.requestedAt)}
                      {r.status === 'done' ? (
                        <>
                          {' · '}
                          <span aria-hidden="true" className="font-semibold text-[#34d399]">✓</span>{' '}
                          traité {r.handledAt ? formatFrDateTime(r.handledAt) : '—'}
                        </>
                      ) : (
                        ' · annulé'
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={cn('ml-auto h-7 rounded-full px-3 text-[11px]', LUX_GHOST_BTN)}
                        disabled={actingId === r.id}
                        onClick={() => void act(r.id, 'REOPEN')}
                        aria-label={`Réouvrir : ${item.label}`}
                      >
                        Réouvrir
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
        </div>
      )}
    </motion.section>
  );
}
