'use client';

// =============================================================
// v4.52 « MIDDLE-STAY CARE » — CARTE INVITÉ (séjours longs ≥ 7 nuits)
//
// Carte du Hub invité qui ouvre un dialog simple : l'invité choisit
// RÉASSORT (serviettes, papier toilette, consommables…) ou MÉNAGE
// INTERMÉDIAIRE, précise sa demande et l'hôte reçoit une notification
// unifiée (cloche + email). La file de traitement vit dans l'espace
// hôte (MiddleStayHostDialog).
//
// Affichée SEULEMENT si le séjour courant dure ≥ 7 nuits
// (payload.stay.nights, calculé serveur) — la démo en a 9.
// =============================================================

import { useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { translateText, useHubLang } from '@/lib/hub-i18n';
import { HUB_VISUALS } from '@/lib/hub-visuals';
import { hubFetch, HubSessionExpiredError } from '@/lib/hub-access-client';
import { cn } from '@/lib/utils';

function MiddleStayCardInner({
  slug,
  nights,
  guestName,
  photoOverride,
}: {
  slug: string;
  nights: number;
  guestName: string | null;
  photoOverride?: string | null;
}) {
  const { lang } = useHubLang();
  const tL = (s: string) => translateText(s, lang);

  const [open, setOpen] = useState(false);
  const [requestType, setRequestType] = useState<'restock' | 'cleaning'>('restock');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // v4.71 — hubFetch : token de session du hub verrouillé (x-hub-token).
      // Un fetch simple renvoyait 403 SESSION_REQUIRED sur hub protégé →
      // « impossible de valider un réassort ».
      const res = await hubFetch(slug, `/api/public/hub/${encodeURIComponent(slug)}/middle-stay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestType,
          details: details.trim() || null,
          guestName,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok || !json.ok) {
        toast.error(json.error || tL('Demande impossible. Réessayez dans un instant.'));
        return;
      }
      toast.success(json.message || tL('Demande envoyée — votre hôte revient vers vous ✨'));
      setOpen(false);
      setDetails('');
    } catch (err) {
      if (err instanceof HubSessionExpiredError) {
        toast.error(err.message);
      } else {
        toast.error(tL('Demande impossible. Vérifiez votre connexion.'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={tL('Middle-Stay Care — demander un réassort ou un ménage')}
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '0px 0px -40px 0px' }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        whileHover={{ y: -4 }}
        className="group relative flex h-full min-h-52 w-full flex-col justify-between overflow-hidden rounded-3xl border border-white/20 text-left shadow-[0_8px_32px_rgba(0,0,0,0.3)] transition-[border-color,box-shadow] duration-300 hover:border-white/30 hover:shadow-[0_12px_48px_rgba(0,0,0,0.4)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
      >
        <img
          src={photoOverride ?? HUB_VISUALS.survival}
          alt=""
          loading="lazy"
          decoding="async"
          className="hub-kenburns absolute inset-0 h-full w-full object-cover"
        />
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent"
        />
        <span className="relative flex items-start justify-between p-4">
          <span
            aria-hidden="true"
            className="relative mt-0.5 block h-8 w-11 rounded-md border border-white/40 bg-white/25 shadow-inner backdrop-blur-sm"
          >
            <span className="absolute inset-x-0 top-1/2 h-px bg-white/50" />
            <span className="absolute inset-y-0 left-1/2 w-px bg-white/50" />
          </span>
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/30 bg-white/20 backdrop-blur-md transition-all duration-300 group-hover:translate-x-1 group-hover:bg-white/30"
          >
            <ArrowRight className="h-4 w-4 text-white" />
          </span>
        </span>
        <span className="relative flex flex-col p-4 pt-0">
          <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/85 drop-shadow-sm">
            🧺 {tL('Séjour long')} · {nights} {tL('nuits')}
          </span>
          <span className="display-title font-serif! mt-0.5 text-xl font-bold leading-tight tracking-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.55)] md:text-2xl">
            {tL('Middle-Stay Care')}
          </span>
          <span className="mt-1 line-clamp-2 text-xs leading-snug text-slate-300 drop-shadow-sm sm:text-sm">
            {tL('Réassort ou ménage pendant votre séjour — on s’occupe de tout')}
          </span>
        </span>
      </motion.button>

      <Dialog open={open} onOpenChange={setOpen}>
        {/* v4.71 — max-h + scroll interne : le bouton « Envoyer ma demande »
            restait SOUS le pli sur mobile (dialog plus haut que l'écran) —
            l'invité ne voyait aucune validation possible. */}
        <DialogContent className="max-h-[88vh] max-w-md overflow-y-auto rounded-2xl p-5 sm:p-6 [&>button]:hidden">
          <DialogHeader className="items-center text-center">
            <DialogTitle className="font-serif text-lg font-bold text-slate-900">
              🧺 {tL('Middle-Stay Care')}
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-600">
              {tL('Vous restez longtemps — dites-nous ce qui vous ferait plaisir, votre hôte organise le passage.')}
            </DialogDescription>
          </DialogHeader>

          {/* Choix du type */}
          <div className="mt-2 grid grid-cols-2 gap-3" role="radiogroup" aria-label={tL('Type de demande')}>
            <button
              type="button"
              role="radio"
              aria-checked={requestType === 'restock'}
              onClick={() => setRequestType('restock')}
              className={cn(
                'flex flex-col items-center rounded-2xl border-2 px-3 pb-3 pt-4 transition-all duration-300',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2',
                requestType === 'restock'
                  ? 'border-sky-400 bg-gradient-to-b from-sky-50 to-white shadow-lg shadow-sky-500/20 scale-[1.02]'
                  : 'border-slate-200 bg-slate-50/70 opacity-75 hover:border-sky-200 hover:opacity-100',
              )}
            >
              <span aria-hidden="true" className="text-3xl">📦</span>
              <span className="mt-2 text-sm font-extrabold text-slate-900">{tL('Réassort')}</span>
              <span className="mt-1 text-center text-[11px] leading-snug text-slate-500">
                {tL('Serviettes, papier toilette, savon…')}
              </span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={requestType === 'cleaning'}
              onClick={() => setRequestType('cleaning')}
              className={cn(
                'flex flex-col items-center rounded-2xl border-2 px-3 pb-3 pt-4 transition-all duration-300',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2',
                requestType === 'cleaning'
                  ? 'border-teal-400 bg-gradient-to-b from-teal-50 to-white shadow-lg shadow-teal-500/20 scale-[1.02]'
                  : 'border-slate-200 bg-slate-50/70 opacity-75 hover:border-teal-200 hover:opacity-100',
              )}
            >
              <span aria-hidden="true" className="text-3xl">🧹</span>
              <span className="mt-2 text-sm font-extrabold text-slate-900">{tL('Ménage')}</span>
              <span className="mt-1 text-center text-[11px] leading-snug text-slate-500">
                {tL('Un passage de frais pendant le séjour')}
              </span>
            </button>
          </div>

          {/* Détails */}
          <label className="mt-2 block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
              {tL('Votre demande')}
            </span>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value.slice(0, 500))}
              rows={3}
              maxLength={500}
              placeholder={
                requestType === 'restock'
                  ? tL('Ex. Besoin de 4 serviettes et de papier toilette')
                  : tL('Ex. Ménage de la cuisine et des sols, de préférence vendredi matin')
              }
              className="w-full resize-none rounded-xl border border-slate-200 bg-white p-3 text-sm leading-relaxed text-slate-800 shadow-sm outline-none transition-colors focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            />
          </label>

          {/* v4.71 — bouton collant au bas du dialog : toujours visible
              même quand le formulaire défile. */}
          <div className="sticky bottom-0 -mx-5 mt-2 bg-gradient-to-t from-white via-white to-white/0 px-5 pb-1 pt-3 sm:-mx-6 sm:px-6">
            <Button
              type="button"
              disabled={busy}
              onClick={() => void submit()}
              className="h-12 w-full bg-sky-600 text-sm font-bold text-white shadow-lg hover:bg-sky-500"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : '✨'}
              {tL('Envoyer ma demande')}
            </Button>
          </div>
          <p className="mt-1 text-center text-[11px] text-slate-400">
            {tL('Votre hôte reçoit une notification immédiate et revient vers vous.')}
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Carte Middle-Stay — hérite de la langue du hub via HubLangContext. */
export function MiddleStayCard(props: {
  slug: string;
  nights: number;
  guestName: string | null;
  photoOverride?: string | null;
}) {
  // Rendue DANS l'arbre invité (HubLangContext fourni par GuestView).
  return <MiddleStayCardInner {...props} />;
}
