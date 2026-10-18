'use client';

// =============================================================
// v4.52 « LIVRE D'OR VIVANT + MIDDLE-STAY CARE » — MODÉRATION HÔTE
// Deux dialogs du MODE HÔTE (hub QR, protégés par le PIN du bien) :
//
//   1. MemoriesModerationDialog — « 📖 Livre d'or »
//      • Stats en tête : total, note moyenne, photos/vocaux, taux
//        de souvenirs publics.
//      • Onglet « À valider » : aperçu complet + ✅ Publier /
//        ❌ Masquer (sans supprimer) + réponse de l'hôte.
//      • Onglet « Publiés » : 📌 Épingler/Désépingler (coup de cœur),
//        💬 Répondre/modifier la réponse, 👁️ Masquer, 🗑️ Supprimer
//        (avec confirmation).
//
//   2. MiddleStayHostDialog — « 🧺 Middle-Stay Care »
//      File des demandes de réassort/ménage des séjours longs :
//      pending → in_progress (Démarrer) → completed (Terminer) →
//      Rouvrir si besoin. Compteurs par statut.
//
// API unique : POST /api/public/hub/[slug]/host-livredor { pin, ... }
// (chaque action renvoie les listes fraîches — 1 aller-retour).
// =============================================================

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Star } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  MIDDLE_STAY_STATUS_LABEL,
  countryFlag,
  type GuestMemoryHost,
  type MiddleStayRequestHost,
} from '@/lib/memories';

/* ── Types + hook de chargement ───────────────────────────────── */

interface HostLivredorData {
  memories: GuestMemoryHost[];
  stats: {
    total: number;
    approved: number;
    pending: number;
    avg: number | null;
    photos: number;
    audios: number;
    publicRate: number;
  };
  middleStay: MiddleStayRequestHost[];
  middleStayCounts: { pending: number; inProgress: number; completed: number };
}

function useLivredorData(slug: string, pin: string, open: boolean) {
  const [data, setData] = useState<HostLivredorData | null>(null);
  const [loading, setLoading] = useState(false);
  const [mutating, setMutating] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/host-livredor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const json = (await res.json().catch(() => null)) as (HostLivredorData & { ok?: boolean; error?: string }) | null;
      if (res.ok && json?.ok) {
        setData({ memories: json.memories, stats: json.stats, middleStay: json.middleStay, middleStayCounts: json.middleStayCounts });
      } else {
        toast.error(json?.error || 'Impossible de charger les données.');
      }
    } catch {
      toast.error('Erreur réseau — réessayez.');
    } finally {
      setLoading(false);
    }
  }, [slug, pin]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  /** Action générique → l'API renvoie les listes fraîches. */
  const mutate = useCallback(
    async (key: string, body: Record<string, unknown>, successMsg?: string) => {
      setMutating(key);
      try {
        const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/host-livredor`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin, ...body }),
        });
        const json = (await res.json().catch(() => null)) as (HostLivredorData & { ok?: boolean; error?: string; message?: string }) | null;
        if (res.ok && json?.ok) {
          // Certaines réponses (ex. mode démo) peuvent arriver sans les
          // listes : on ne remplace JAMAIS par undefined — repli reload.
          if (Array.isArray(json.memories) && Array.isArray(json.middleStay)) {
            setData({ memories: json.memories, stats: json.stats, middleStay: json.middleStay, middleStayCounts: json.middleStayCounts });
          } else {
            await load();
          }
          if (successMsg) toast.success(successMsg);
        } else {
          toast.error(json?.error || 'Action impossible.');
        }
      } catch {
        toast.error('Erreur réseau — réessayez.');
      } finally {
        setMutating(null);
      }
    },
    [slug, pin],
  );

  return { data, loading, mutating, mutate, reload: load };
}

/* ── Aperçu compact d'un souvenir ─────────────────────────────── */

function StarsRow({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn('h-3 w-3', i <= n ? 'fill-amber-400 text-amber-400' : 'fill-stone-200 text-stone-200')} />
      ))}
    </span>
  );
}

function MemoryPreview({ m }: { m: GuestMemoryHost }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-bold text-slate-800">
        {m.guestName}
        {m.guestCountry ? <span aria-hidden="true">{countryFlag(m.guestCountry)}</span> : null}
        <StarsRow n={m.rating} />
        <span className="text-[10px] font-medium text-slate-400">
          {new Date(m.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
        </span>
        {m.isPublic ? (
          <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">PUBLIC</span>
        ) : (
          <span className="rounded-full bg-stone-100 px-1.5 py-0.5 text-[9px] font-bold text-stone-500">PRIVÉ</span>
        )}
        {m.isPinned ? (
          <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">📌 ÉPINGLÉ</span>
        ) : null}
      </p>
      {m.message && <p className="mt-1 line-clamp-3 font-serif text-[13px] italic text-slate-600">« {m.message} »</p>}
      <p className="mt-1 flex flex-wrap gap-1.5 text-[10px] font-semibold text-slate-400">
        {m.photos.length > 0 && <span>📷 {m.photos.length} photo(s)</span>}
        {m.audioUrl && <span>🎤 vocal</span>}
        {m.hostReply && <span>💬 réponse hôte</span>}
      </p>
    </div>
  );
}

/* ── 1. Dialog « 📖 Livre d'or » ──────────────────────────────── */

export function MemoriesModerationDialog({
  open,
  onClose,
  slug,
  pin,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  pin: string;
}) {
  const { data, loading, mutating, mutate } = useLivredorData(slug, pin, open);
  const [tab, setTab] = useState<'pending' | 'published'>('pending');
  const [replyId, setReplyId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const pendingMemories = data?.memories.filter((m) => !m.isApproved) ?? [];
  const publishedMemories = data?.memories.filter((m) => m.isApproved) ?? [];
  const shown = tab === 'pending' ? pendingMemories : publishedMemories;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto rounded-2xl p-0 [&>button]:hidden">
        <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-5 pb-4 pt-5 backdrop-blur-md">
          <DialogHeader className="items-start text-left">
            <DialogTitle className="font-serif text-xl font-bold text-slate-900">
              📖 Livre d&apos;or — modération
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500">
              Validez, épinglez et répondez aux souvenirs de vos voyageurs.
            </DialogDescription>
          </DialogHeader>

          {/* Stats */}
          <div className="mt-3 grid grid-cols-4 gap-2">
            {[
              { label: 'Souvenirs', value: data ? String(data.stats.approved) : '—' },
              { label: 'Moyenne', value: data?.stats.avg ? `⭐ ${data.stats.avg}` : '—' },
              { label: 'Photos/Vocaux', value: data ? `${data.stats.photos}/${data.stats.audios}` : '—' },
              { label: 'Publics', value: data ? `${data.stats.publicRate} %` : '—' },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-amber-100 bg-amber-50/60 px-2 py-2 text-center">
                <p className="text-sm font-extrabold text-slate-900">{s.value}</p>
                <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-400">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Onglets */}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setTab('pending')}
              aria-pressed={tab === 'pending'}
              className={cn(
                'flex-1 rounded-xl border px-3 py-2 text-xs font-bold transition-colors',
                tab === 'pending'
                  ? 'border-amber-400 bg-amber-50 text-amber-800'
                  : 'border-slate-200 bg-white text-slate-500 hover:border-amber-200',
              )}
            >
              ⏳ À valider {data && data.stats.pending > 0 ? `(${data.stats.pending})` : ''}
            </button>
            <button
              type="button"
              onClick={() => setTab('published')}
              aria-pressed={tab === 'published'}
              className={cn(
                'flex-1 rounded-xl border px-3 py-2 text-xs font-bold transition-colors',
                tab === 'published'
                  ? 'border-amber-400 bg-amber-50 text-amber-800'
                  : 'border-slate-200 bg-white text-slate-500 hover:border-amber-200',
              )}
            >
              🌟 Publiés {data ? `(${data.stats.approved})` : ''}
            </button>
          </div>
        </div>

        <div className="px-5 pb-6 pt-4">
          {loading && !data ? (
            <div className="flex flex-col items-center gap-3 py-10" aria-busy="true">
              <Loader2 className="h-7 w-7 animate-spin text-amber-500" />
              <p className="text-sm text-slate-500">Chargement des souvenirs…</p>
            </div>
          ) : shown.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-3xl" aria-hidden="true">{tab === 'pending' ? '✅' : '📖'}</p>
              <p className="mt-2 text-sm font-semibold text-slate-600">
                {tab === 'pending'
                  ? 'Aucun souvenir en attente — tout est traité ✓'
                  : 'Aucun souvenir publié pour le moment.'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {shown.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    'rounded-2xl border p-3.5 transition-colors',
                    tab === 'pending' ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200 bg-white',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <MemoryPreview m={m} />
                    {/* Vignette 1ʳᵉ photo */}
                    {m.photos.length > 0 && (
                      <img
                        src={m.photos[0].url}
                        alt=""
                        className="h-16 w-16 shrink-0 rounded-xl border border-slate-200 object-cover"
                      />
                    )}
                  </div>

                  {/* Réponse de l'hôte (édition inline) */}
                  {replyId === m.id ? (
                    <div className="mt-3">
                      <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value.slice(0, 500))}
                        rows={2}
                        placeholder="Merci pour votre merveilleux souvenir…"
                        className="w-full resize-none rounded-xl border border-amber-200 bg-white p-2.5 text-sm text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                      />
                      <div className="mt-2 flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={mutating === `reply-${m.id}` || replyText.trim().length === 0}
                          onClick={() => {
                            void mutate(
                              `reply-${m.id}`,
                              { memoryId: m.id, action: 'REPLY', hostReply: replyText.trim() },
                              'Réponse envoyée 💬',
                            ).then(() => {
                              setReplyId(null);
                              setReplyText('');
                            });
                          }}
                          className="h-9 bg-amber-500 text-xs font-bold text-white hover:bg-amber-600"
                        >
                          {mutating === `reply-${m.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '💬 Enregistrer'}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setReplyId(null);
                            setReplyText('');
                          }}
                          className="h-9 border-slate-300 text-xs text-slate-500"
                        >
                          Annuler
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {tab === 'pending' ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            disabled={mutating === m.id}
                            onClick={() => void mutate(m.id, { memoryId: m.id, action: 'APPROVE' }, 'Souvenir publié ✅')}
                            className="h-9 bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-500"
                          >
                            {mutating === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '✅'} Publier
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={mutating === m.id}
                            onClick={() => void mutate(m.id, { memoryId: m.id, action: 'HIDE' }, 'Souvenir masqué (le voyageur ne voit pas ce refus).')}
                            className="h-9 border-slate-300 text-xs text-slate-600"
                          >
                            ❌ Masquer
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={mutating === m.id}
                            onClick={() =>
                              void mutate(
                                m.id,
                                { memoryId: m.id, action: m.isPinned ? 'UNPIN' : 'PIN' },
                                m.isPinned ? 'Retiré des coups de cœur.' : '⭐ Coup de cœur épinglé — il passera en tête de la galerie.',
                              )
                            }
                            className="h-9 border-amber-300 text-xs font-bold text-amber-700"
                          >
                            {m.isPinned ? '📌 Désépingler' : '📌 Épingler'}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setReplyId(m.id);
                              setReplyText(m.hostReply ?? '');
                            }}
                            className="h-9 border-slate-300 text-xs text-slate-600"
                          >
                            💬 {m.hostReply ? 'Modifier la réponse' : 'Répondre'}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={mutating === m.id}
                            onClick={() => void mutate(m.id, { memoryId: m.id, action: 'HIDE' }, 'Souvenir masqué.')}
                            className="h-9 border-slate-300 text-xs text-slate-600"
                          >
                            👁️ Masquer
                          </Button>
                          {confirmDeleteId === m.id ? (
                            <Button
                              type="button"
                              size="sm"
                              disabled={mutating === m.id}
                              onClick={() => {
                                void mutate(m.id, { memoryId: m.id, action: 'DELETE' }, 'Souvenir supprimé 🗑️');
                                setConfirmDeleteId(null);
                              }}
                              className="h-9 bg-red-600 text-xs font-bold text-white hover:bg-red-500"
                            >
                              Confirmer la suppression ?
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => setConfirmDeleteId(m.id)}
                              className="h-9 text-xs text-slate-400 hover:text-red-600"
                            >
                              🗑️ Supprimer
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── 2. Dialog « 🧺 Middle-Stay Care » ────────────────────────── */

export function MiddleStayHostDialog({
  open,
  onClose,
  slug,
  pin,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  pin: string;
}) {
  const { data, loading, mutating, mutate } = useLivredorData(slug, pin, open);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-xl overflow-y-auto rounded-2xl p-0 [&>button]:hidden">
        <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-5 pb-4 pt-5 backdrop-blur-md">
          <DialogHeader className="items-start text-left">
            <DialogTitle className="font-serif text-xl font-bold text-slate-900">
              🧺 Middle-Stay Care
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500">
              Réassorts &amp; ménages demandés par vos invités en séjour long.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              { label: 'À traiter', value: data?.middleStayCounts.pending ?? 0, cls: 'text-amber-700' },
              { label: 'En cours', value: data?.middleStayCounts.inProgress ?? 0, cls: 'text-sky-700' },
              { label: 'Terminées', value: data?.middleStayCounts.completed ?? 0, cls: 'text-emerald-700' },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-slate-100 bg-slate-50/70 px-2 py-2 text-center">
                <p className={cn('text-lg font-extrabold', s.cls)}>{s.value}</p>
                <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="px-5 pb-6 pt-4">
          {loading && !data ? (
            <div className="flex flex-col items-center gap-3 py-10" aria-busy="true">
              <Loader2 className="h-7 w-7 animate-spin text-[#0066EF]" />
              <p className="text-sm text-slate-500">Chargement des demandes…</p>
            </div>
          ) : !data || data.middleStay.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-3xl" aria-hidden="true">🧺</p>
              <p className="mt-2 text-sm font-semibold text-slate-600">
                Aucune demande pour le moment — vos séjours longs n&apos;ont besoin de rien ✓
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {data.middleStay.map((r) => {
                const st = MIDDLE_STAY_STATUS_LABEL[r.status] ?? MIDDLE_STAY_STATUS_LABEL.pending;
                return (
                  <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-slate-800">
                        {r.requestType === 'cleaning' ? '🧹 Ménage intermédiaire' : '📦 Réassort'} — {r.guestName}
                      </p>
                      <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase', st.cls)}>
                        {st.label}
                      </span>
                    </div>
                    {r.details && (
                      <p className="mt-1.5 rounded-xl bg-slate-50 px-3 py-2 text-[13px] leading-relaxed text-slate-600">
                        « {r.details} »
                      </p>
                    )}
                    <p className="mt-1.5 text-[10px] font-medium text-slate-400">
                      Demande du{' '}
                      {new Date(r.createdAt).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {r.price != null ? ` · ${r.price.toFixed(2)} €` : ''}
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {r.status === 'pending' && (
                        <Button
                          type="button"
                          size="sm"
                          disabled={mutating === r.id}
                          onClick={() => void mutate(r.id, { requestId: r.id, msAction: 'START' }, 'Intervention démarrée 🚀')}
                          className="h-9 bg-sky-600 text-xs font-bold text-white hover:bg-sky-500"
                        >
                          {mutating === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '🚀'} Démarrer
                        </Button>
                      )}
                      {r.status === 'in_progress' && (
                        <Button
                          type="button"
                          size="sm"
                          disabled={mutating === r.id}
                          onClick={() => void mutate(r.id, { requestId: r.id, msAction: 'COMPLETE' }, 'Demande terminée ✓')}
                          className="h-9 bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-500"
                        >
                          {mutating === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '✓'} Terminer
                        </Button>
                      )}
                      {r.status !== 'pending' && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={mutating === r.id}
                          onClick={() => void mutate(r.id, { requestId: r.id, msAction: 'REOPEN' }, 'Demande rouverte.')}
                          className="h-9 border-slate-300 text-xs text-slate-500"
                        >
                          ↩️ Rouvrir
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
