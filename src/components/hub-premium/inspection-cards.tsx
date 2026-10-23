'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { ChevronDown, Copy, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SignaturePad } from '@/components/guest-app/signature-pad';
import { hubFetch, HubSessionExpiredError } from '@/lib/hub-access-client';
import { useHubLang, type HubLang } from '@/lib/hub-i18n';
import type { GuestMinibarItem } from '@/lib/concierge';

// =============================================================
// v4.80 « ÉTATS DES LIEUX DU HUB » — CARTES ARRIVÉE & DÉPART
//
// Demande client : « l'invité après avoir déverrouillé le HUB doit
// valider l'état des lieux, les photos de l'appartement, le signer et
// le système génère le PDF à envoyer à l'hôte et l'invité ; il doit
// aussi valider l'inventaire du minibar à la sortie ». Deux cartes :
//   • CheckInInspectionCard  — ARRIVÉE : 5 pièces + photos + signature
//     → PDF « État des lieux d'entrée » (emails invité + hôte, preuve
//     publique à vie). Disparaît une fois signée.
//   • CheckOutInspectionCard — DÉPART : minibar (unités consommées par
//     article) + 5 pièces + inventaire rendu + signature → PDF « État
//     des lieux de sortie ». Disparaît une fois signée.
// API : POST /api/public/hub/[slug]/checkout-inspection (type
// checkin|checkout) — emails + notification hôte + lien public.
// Synchronisation serveur au montage : si le séjour a déjà signé
// (autre appareil), la carte disparaît immédiatement.
// Design : cartes hub (rounded-3xl, bandeau dégradé), Dialog scrollable,
// accents émeraude (entrée) / ambre (sortie), cibles ≥ 44 px.
// =============================================================

type RoomId = 'entrance' | 'kitchen' | 'livingRoom' | 'bedrooms' | 'bathroom';
type RoomStatus = 'good' | 'dirty' | 'damaged';

interface RoomState {
  status: RoomStatus;
  comment: string;
  photos: string[];
}

interface SubmitResult {
  success: boolean;
  demo?: boolean;
  publicToken?: string;
  publicUrl?: string;
}

const MAX_PHOTOS_PER_ROOM = 4;

const ROOMS: { id: RoomId; emoji: string; label: string }[] = [
  { id: 'entrance', emoji: '🚪', label: 'Entrée / Couloir' },
  { id: 'kitchen', emoji: '🍳', label: 'Cuisine' },
  { id: 'livingRoom', emoji: '🛋️', label: 'Salon / Séjour' },
  { id: 'bedrooms', emoji: '🛏️', label: 'Chambres' },
  { id: 'bathroom', emoji: '🛁', label: 'Salle de bain' },
];

const STATUS_META: Record<RoomStatus, { label: string; emoji: string; button: string; card: string }> = {
  good: {
    label: 'Bon état',
    emoji: '✅',
    button: 'bg-emerald-600 text-white border-emerald-600',
    card: 'border-emerald-300 bg-emerald-50/50',
  },
  dirty: {
    label: 'Sale',
    emoji: '⚠️',
    button: 'bg-amber-500 text-white border-amber-500',
    card: 'border-amber-300 bg-amber-50/60',
  },
  damaged: {
    label: 'Endommagé',
    emoji: '❌',
    button: 'bg-red-600 text-white border-red-600',
    card: 'border-red-300 bg-red-50/60',
  },
};

/** Compression client : max 1280 px, JPEG q≈0.7 → dataURL (≤ ~500 Ko). */
async function compressImage(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('lecture impossible'));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('image illisible'));
    im.src = dataUrl;
  });
  const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.7);
}

// -------------------------------------------------------------
// Formulaire partagé (arrivée / départ) dans un Dialog
// -------------------------------------------------------------

function InspectionFlowForm({
  slug,
  type,
  propertyName,
  guestNameHint,
  minibarItems,
  onSessionExpired,
  onSubmitted,
}: {
  slug: string;
  type: 'checkin' | 'checkout';
  propertyName: string;
  guestNameHint?: string | null;
  minibarItems: GuestMinibarItem[];
  onSessionExpired?: () => void;
  onSubmitted: (result: SubmitResult) => void;
}) {
  const { t } = useHubLang();
  const isCheckin = type === 'checkin';

  const [guestName, setGuestName] = useState(guestNameHint ?? '');
  const [guestEmail, setGuestEmail] = useState('');
  const [rooms, setRooms] = useState<Record<RoomId, RoomState>>(() => ({
    entrance: { status: 'good', comment: '', photos: [] },
    kitchen: { status: 'good', comment: '', photos: [] },
    livingRoom: { status: 'good', comment: '', photos: [] },
    bedrooms: { status: 'good', comment: '', photos: [] },
    bathroom: { status: 'good', comment: '', photos: [] },
  }));
  const [inventory, setInventory] = useState({ keys: 2, remotes: 1, towels: 4 });
  const [consumed, setConsumed] = useState<Record<string, number>>({});
  const [comments, setComments] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const photoTargetRoom = useRef<RoomId | null>(null);
  const [busyRoom, setBusyRoom] = useState<RoomId | null>(null);

  const setRoom = (id: RoomId, patch: Partial<RoomState>) =>
    setRooms((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const openPhotoPicker = (id: RoomId) => {
    photoTargetRoom.current = id;
    photoInputRef.current?.click();
  };

  const onPhotosPicked = async (files: FileList | null) => {
    const id = photoTargetRoom.current;
    if (!id || !files || files.length === 0) return;
    const room = rooms[id];
    const remaining = MAX_PHOTOS_PER_ROOM - room.photos.length;
    if (remaining <= 0) {
      toast.error(t(`Maximum ${MAX_PHOTOS_PER_ROOM} photos pour cette pièce.`));
      return;
    }
    setBusyRoom(id);
    try {
      const picked = Array.from(files).slice(0, remaining);
      const compressed: string[] = [];
      for (const file of picked) {
        if (!file.type.startsWith('image/')) continue;
        try {
          compressed.push(await compressImage(file));
        } catch {
          toast.error(t('Une photo n’a pas pu être traitée.'));
        }
      }
      if (compressed.length > 0) {
        setRoom(id, { photos: [...room.photos, ...compressed].slice(0, MAX_PHOTOS_PER_ROOM) });
      }
    } finally {
      setBusyRoom(null);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const removePhoto = (id: RoomId, index: number) => {
    const room = rooms[id];
    setRoom(id, { photos: room.photos.filter((_, i) => i !== index) });
  };

  const consumedCount = useMemo(
    () => minibarItems.reduce((acc, i) => acc + (consumed[i.id] ?? 0), 0),
    [minibarItems, consumed],
  );
  const consumedEur = useMemo(
    () =>
      minibarItems.reduce(
        (acc, i) => acc + (consumed[i.id] ?? 0) * (i.free ? 0 : i.price),
        0,
      ),
    [minibarItems, consumed],
  );

  const canSubmit =
    guestName.trim().length > 0 && !!signature && !submitting;

  const submit = async () => {
    if (!canSubmit || submitting || !signature) return;
    setSubmitting(true);
    try {
      const res = await hubFetch(slug, `/api/public/hub/${encodeURIComponent(slug)}/checkout-inspection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          guestName: guestName.trim().slice(0, 80),
          guestEmail: guestEmail.trim() || undefined,
          rooms: ROOMS.map((r) => ({
            id: r.id,
            label: r.label,
            status: rooms[r.id].status,
            comment: rooms[r.id].comment.trim() || undefined,
            photos: rooms[r.id].photos,
          })),
          ...(isCheckin
            ? {}
            : {
                inventory,
                selfAssessment: 5,
                minibar: minibarItems.map((i) => ({
                  name: i.name,
                  consumed: consumed[i.id] ?? 0,
                })),
              }),
          comments: comments.trim() || undefined,
          signature,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as SubmitResult & { error?: string };
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'http');
      }
      toast.success(t('État des lieux signé — PDF envoyé !'));
      onSubmitted(data);
    } catch (e) {
      if (e instanceof HubSessionExpiredError) {
        onSessionExpired?.();
        return;
      }
      toast.error(t('Envoi impossible. Vérifiez votre connexion et réessayez.'));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Écran de succès (dans le dialog) ──
  // Le parent reçoit le résultat immédiatement (disparition de la carte)
  // mais le dialog reste ouvert pour montrer la preuve jusqu'à fermeture.
  return (
    <div className="space-y-4">
      {/* Bandeau document légal */}
      <div
        className={`rounded-2xl border p-4 ${
          isCheckin
            ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/25 dark:bg-emerald-500/10'
            : 'border-amber-200 bg-amber-50/70 dark:border-amber-500/25 dark:bg-amber-500/10'
        }`}
      >
        <p className={`text-sm font-bold ${isCheckin ? 'text-emerald-800 dark:text-emerald-200' : 'text-amber-800 dark:text-amber-200'}`}>
          ⚖️ {t('Document à valeur légale')}
        </p>
        <p className={`mt-1 text-xs leading-relaxed ${isCheckin ? 'text-emerald-800/85 dark:text-emerald-200/85' : 'text-amber-800/85 dark:text-amber-200/85'}`}>
          {t(
            isCheckin
              ? `En signant, vous confirmez l'état du logement à votre arrivée. Le PDF signé est envoyé à vous et à votre hôte, et reste consultable en ligne à vie.`
              : `En signant, vous confirmez l'état du logement rendu et l'inventaire du minibar. Le PDF signé est envoyé à vous et à votre hôte, et reste consultable en ligne à vie.`,
          )}
        </p>
      </div>

      {/* Identité */}
      <section aria-label={t('Vos coordonnées')} className="rounded-2xl border border-border bg-card p-4">
        <h3 className="text-sm font-bold text-card-foreground">1. {t('Vous')}</h3>
        <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="insp-name" className="text-xs font-semibold text-muted-foreground">
              {t('Nom complet')} *
            </label>
            <input
              id="insp-name"
              type="text"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              maxLength={80}
              autoComplete="name"
              placeholder={t('Votre nom')}
              className="mt-1 w-full min-h-[44px] rounded-xl border border-border bg-background px-3.5 text-sm text-card-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-[#055492]/50"
            />
          </div>
          <div>
            <label htmlFor="insp-email" className="text-xs font-semibold text-muted-foreground">
              {t('Email (pour recevoir le PDF)')}
            </label>
            <input
              id="insp-email"
              type="email"
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              maxLength={120}
              autoComplete="email"
              inputMode="email"
              placeholder="vous@exemple.com"
              className="mt-1 w-full min-h-[44px] rounded-xl border border-border bg-background px-3.5 text-sm text-card-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-[#055492]/50"
            />
          </div>
        </div>
      </section>

      {/* Minibar (départ uniquement) */}
      {!isCheckin && minibarItems.length > 0 && (
        <section aria-label={t('Inventaire du minibar')} className="rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-card-foreground">2. {t('Minibar — ce que vous avez consommé')}</h3>
            {consumedCount > 0 && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
                {consumedCount} {t('article(s)')} · {consumedEur.toFixed(2)} €
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('Déclarez honnêtement vos consommations — réglement avec votre hôte, sans mauvaise surprise.')}
          </p>
          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
            {minibarItems.map((item) => {
              const qty = consumed[item.id] ?? 0;
              return (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/60 px-3 py-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold text-card-foreground">
                    <span aria-hidden="true" className="mr-1.5">{item.emoji}</span>
                    {item.name}
                    {!item.free && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{item.price.toFixed(2)} €</span>}
                    {item.free && (
                      <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                        {t('Offert')}
                      </span>
                    )}
                  </p>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      aria-label={t('Retirer une unité')}
                      onClick={() => setConsumed((v) => ({ ...v, [item.id]: Math.max(0, qty - 1) }))}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-base font-bold text-card-foreground transition-colors hover:bg-secondary cursor-pointer"
                    >
                      −
                    </button>
                    <span className="w-6 text-center text-sm font-bold tabular-nums text-card-foreground" aria-live="polite">
                      {qty}
                    </span>
                    <button
                      type="button"
                      aria-label={t('Ajouter une unité')}
                      onClick={() => setConsumed((v) => ({ ...v, [item.id]: Math.min(9, qty + 1) }))}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-base font-bold text-card-foreground transition-colors hover:bg-secondary cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {consumedCount === 0 && (
            <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              ✅ {t('Rien consommé — je confirme l’inventaire complet')}
            </p>
          )}
        </section>
      )}

      {/* Pièces */}
      <section aria-label={t('État des pièces')} className="rounded-2xl border border-border bg-card p-4">
        <h3 className="text-sm font-bold text-card-foreground">
          {isCheckin ? `2. ${t("L'état des pièces à votre arrivée")}` : `3. ${t("L'état des pièces au départ")}`}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('Signalez ce qui est sale ou endommagé — photos bienvenues en cas de problème.')}
        </p>
        <div className="mt-3 space-y-3">
          {ROOMS.map((room) => {
            const state = rooms[room.id];
            return (
              <div
                key={room.id}
                className={`rounded-xl border p-3 transition-colors ${STATUS_META[state.status].card}`}
              >
                <p className="text-sm font-bold text-card-foreground">
                  <span aria-hidden="true" className="mr-1.5">{room.emoji}</span>
                  {room.label}
                </p>
                <div className="mt-2 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={`${t('État')} : ${room.label}`}>
                  {(Object.keys(STATUS_META) as RoomStatus[]).map((status) => {
                    const active = state.status === status;
                    const meta = STATUS_META[status];
                    return (
                      <button
                        key={status}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setRoom(room.id, { status })}
                        className={`min-h-[44px] rounded-xl border px-1 py-2 text-[11px] font-bold leading-tight transition-all cursor-pointer ${
                          active
                            ? meta.button
                            : 'border-border bg-card text-muted-foreground hover:border-accent hover:text-card-foreground'
                        }`}
                      >
                        <span aria-hidden="true" className="block text-sm leading-none">{meta.emoji}</span>
                        <span className="mt-1 block">{meta.label}</span>
                      </button>
                    );
                  })}
                </div>

                {state.status !== 'good' && (
                  <div className="mt-2.5 space-y-2">
                    <input
                      type="text"
                      value={state.comment}
                      onChange={(e) => setRoom(room.id, { comment: e.target.value })}
                      maxLength={300}
                      placeholder={t('Précisez le problème (optionnel)')}
                      aria-label={`${t('Commentaire')} : ${room.label}`}
                      className="w-full min-h-[44px] rounded-xl border border-border bg-background px-3.5 text-sm text-card-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    />
                    {state.photos.length < MAX_PHOTOS_PER_ROOM && (
                      <button
                        type="button"
                        onClick={() => openPhotoPicker(room.id)}
                        disabled={busyRoom === room.id}
                        className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background/70 px-4 text-xs font-bold text-muted-foreground transition-colors hover:border-accent hover:text-card-foreground cursor-pointer disabled:opacity-60"
                      >
                        {busyRoom === room.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <>📷 {t('Ajouter des photos')} ({state.photos.length}/{MAX_PHOTOS_PER_ROOM})</>
                        )}
                      </button>
                    )}
                    {state.photos.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {state.photos.map((photo, i) => (
                          <div key={`${i}-${photo.slice(-16)}`} className="relative h-20 w-20 overflow-hidden rounded-lg border border-border">
                            <img src={photo} alt={`${t('Photo')} ${i + 1} — ${room.label}`} className="h-full w-full object-cover" />
                            <button
                              type="button"
                              onClick={() => removePhoto(room.id, i)}
                              aria-label={`${t('Supprimer la photo')} ${i + 1} ${t('de')} ${room.label}`}
                              className="absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-xs font-bold text-white hover:bg-black cursor-pointer"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => void onPhotosPicked(e.target.files)}
          aria-hidden="true"
          tabIndex={-1}
        />
      </section>

      {/* Inventaire rendu (départ uniquement) */}
      {!isCheckin && (
        <section aria-label={t('Inventaire rendu')} className="rounded-2xl border border-border bg-card p-4">
          <h3 className="text-sm font-bold text-card-foreground">4. {t('Inventaire rendu')}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t("Combien d'objets restent dans le logement ?")}</p>
          <div className="mt-3 space-y-2">
            {(
              [
                { key: 'keys' as const, emoji: '🔑', label: t('Clés') },
                { key: 'remotes' as const, emoji: '📺', label: t('Télécommandes') },
                { key: 'towels' as const, emoji: '🧺', label: t('Serviettes') },
              ]
            ).map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/60 px-3 py-2">
                <p className="text-sm font-semibold text-card-foreground">
                  <span aria-hidden="true" className="mr-1.5">{item.emoji}</span>
                  {item.label}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={`${t('Retirer une')} ${item.label.toLowerCase()}`}
                    onClick={() => setInventory((v) => ({ ...v, [item.key]: Math.max(0, v[item.key] - 1) }))}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-base font-bold text-card-foreground transition-colors hover:bg-secondary cursor-pointer"
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-sm font-bold tabular-nums text-card-foreground" aria-live="polite">
                    {inventory[item.key]}
                  </span>
                  <button
                    type="button"
                    aria-label={`${t('Ajouter une')} ${item.label.toLowerCase()}`}
                    onClick={() => setInventory((v) => ({ ...v, [item.key]: Math.min(20, v[item.key] + 1) }))}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-base font-bold text-card-foreground transition-colors hover:bg-secondary cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Commentaires */}
      <section aria-label={t('Commentaires')} className="rounded-2xl border border-border bg-card p-4">
        <h3 className="text-sm font-bold text-card-foreground">
          {isCheckin ? `3. ${t('Un problème à signaler ?')}` : `5. ${t('Un mot pour votre hôte ?')}`}
        </h3>
        <textarea
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          maxLength={1000}
          rows={2}
          placeholder={t('Commentaires libres (optionnel)')}
          aria-label={t('Commentaires libres')}
          className="mt-2 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-card-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-[#055492]/50 resize-none"
        />
      </section>

      {/* Signature */}
      <section aria-label={t('Signature')} className="rounded-2xl border border-border bg-card p-4">
        <h3 className="text-sm font-bold text-card-foreground">
          {isCheckin ? `4. ${t('Signature')}` : `6. ${t('Signature')}`}
        </h3>
        <div className="mt-2.5">
          <SignaturePad onChange={setSignature} />
        </div>
        <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">
          {t(
            "En signant, je certifie sur l'honneur l'exactitude des informations déclarées. Document horodaté, signé électroniquement et envoyé par email.",
          )}
        </p>
      </section>

      {/* Validation */}
      <button
        type="button"
        onClick={() => void submit()}
        disabled={!canSubmit}
        className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#055492] px-5 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-[#04467a] active:scale-[0.99] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {submitting
          ? t('Envoi en cours…')
          : isCheckin
            ? t('Signer et générer le document d’arrivée')
            : t('Signer et générer le document de sortie')}
      </button>
      <p className="-mt-2 text-center text-[11px] text-muted-foreground">
        {t('PDF généré automatiquement — envoyé à vous et à votre hôte.')}
      </p>
    </div>
  );
}

// -------------------------------------------------------------
// Écran de succès (remplace le formulaire après envoi réussi)
// -------------------------------------------------------------

function InspectionSuccessScreen({
  type,
  result,
  guestName,
  onClose,
}: {
  type: 'checkin' | 'checkout';
  result: SubmitResult;
  guestName: string;
  onClose: () => void;
}) {
  const { t } = useHubLang();
  const isCheckin = type === 'checkin';
  const first = guestName.trim().split(/\s+/)[0] ?? '';

  return (
    <div className="space-y-4 py-2" role="status" aria-live="polite">
      <div className="text-center">
        <motion.div
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/15"
          aria-hidden="true"
        >
          <motion.svg
            viewBox="0 0 24 24"
            className="h-10 w-10 text-emerald-600 dark:text-emerald-300"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <motion.path
              d="M5 13l4 4L19 7"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.15, duration: 0.4, ease: 'easeOut' }}
            />
          </motion.svg>
        </motion.div>
        <h3 className="mt-4 text-lg font-bold text-foreground">
          {isCheckin ? t('État des lieux d’arrivée signé !') : t('État des lieux de sortie signé !')}
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          {t('Merci')}{first ? ` ${first}` : ''} —{' '}
          {result.demo
            ? t('mode démo : aucun email ni document généré.')
            : t('votre document signé a été envoyé par email à vous et à votre hôte.')}
        </p>
      </div>

      {!result.demo && result.publicUrl && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-800 dark:text-amber-200">
            🔗 {t('Preuve publique à valeur légale')}
          </p>
          <p className="mt-1.5 break-all text-xs text-amber-900/90 dark:text-amber-100/90">{result.publicUrl}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void copyProofLinkSafe(result.publicUrl!)}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-amber-600 cursor-pointer"
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
              {t('Copier le lien')}
            </button>
            <a
              href={`/api/public/inspection/${result.publicToken}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-amber-400 bg-white px-4 py-2 text-sm font-bold text-amber-800 transition-colors hover:bg-amber-100 dark:bg-transparent dark:text-amber-200 dark:hover:bg-amber-500/10"
            >
              📄 {t('Voir le PDF')}
            </a>
          </div>
        </div>
      )}

      <Button
        type="button"
        onClick={onClose}
        className="h-12 w-full rounded-xl bg-emerald-600 text-sm font-bold text-white hover:bg-emerald-700"
      >
        ✨ {t('Terminer')}
      </Button>
    </div>
  );
}

/** Copie presse-papiers tolérante (le hook du dialog peut être remonté). */
async function copyProofLinkSafe(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    toast.success('Lien de preuve copié !');
  } catch {
    toast.error('Copie impossible — maintenez le lien pour le copier.');
  }
}

// -------------------------------------------------------------
// CARTE 1 — ÉTAT DES LIEUX D'ARRIVÉE
// -------------------------------------------------------------

export function CheckInInspectionCard({
  slug,
  propertyName,
  guestNameHint,
  onDone,
  onSessionExpired,
}: {
  slug: string;
  propertyName: string;
  guestNameHint?: string | null;
  /** Appelé après signature (ou si déjà signé côté serveur) → la carte disparaît. */
  onDone: () => void;
  onSessionExpired?: () => void;
}) {
  const { t } = useHubLang();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [syncing, setSyncing] = useState(true);
  // Le dialog reste ouvert tant que l'écran de succès est visible, même
  // si le parent démonte la carte après onDone → on garde le rendu local.
  const [showAfterDone, setShowAfterDone] = useState(false);

  // Sync serveur : déjà signé pour CE séjour (autre appareil) → disparaît.
  useEffect(() => {
    let alive = true;
    hubFetch(slug, `/api/public/hub/${encodeURIComponent(slug)}/checkout-inspection`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { checkin?: { publicToken: string } | null } | null) => {
        if (alive && data?.checkin) onDone();
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setSyncing(false);
      });
    return () => {
      alive = false;
    };
     
  }, [slug]);

  const finishAndClose = () => {
    setOpen(false);
    // v4.80 — onDone à la FERMETURE (pas à la soumission) : la carte reste
    // montée pendant l'écran de preuve (sinon le parent la démonte et le
    // dialog disparaît avant le remerciement). Un rechargement avant
    // fermeture est couvert par la sync serveur du montage.
    onDone();
    setTimeout(() => {
      setShowAfterDone(false);
      setResult(null);
    }, 300);
  };

  return (
    <article
      aria-label={t("État des lieux d'arrivée")}
      className="group flex h-full min-w-0 flex-col overflow-hidden rounded-3xl border border-emerald-200/70 bg-card shadow-sm transition-shadow hover:shadow-md dark:border-emerald-500/20"
    >
      {/* Bandeau dégradé */}
      <div className="relative overflow-hidden bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 px-5 pb-8 pt-5 text-white">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-8 -top-10 text-[7rem] leading-none opacity-20 select-none"
        >
          📋
        </div>
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/80">
          {t('Sécurisez votre séjour')}
        </p>
        <h3 className="mt-1 text-lg font-black leading-tight">{t("État des lieux d'arrivée")}</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-white/85">
          {t('Vérifiez les pièces, ajoutez des photos si besoin, signez — le PDF est envoyé à vous et à votre hôte.')}
        </p>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <ul className="space-y-1.5 text-xs text-muted-foreground" aria-label={t('Contenu du document')}>
          {[
            `🏠 ${t('Les 5 pièces — bon état / sale / endommagé')}`,
            `📷 ${t('Photos de l’appartement en cas de problème')}`,
            `✍️ ${t('Signature au doigt — document horodaté')}`,
            `📄 ${t('PDF envoyé par email + lien public à vie')}`,
          ].map((line) => (
            <li key={line} className="flex items-start gap-1.5">
              <span aria-hidden="true">{line.slice(0, 2)}</span>
              <span>{line.slice(2).trim()}</span>
            </li>
          ))}
        </ul>

        <Button
          type="button"
          onClick={() => setOpen(true)}
          disabled={syncing}
          className="mt-auto h-12 w-full rounded-xl bg-emerald-600 text-sm font-bold text-white shadow hover:bg-emerald-700"
        >
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {t('Démarrer l’inspection')} · ⏱ {t('3 min')}
        </Button>
      </div>

      <Dialog
        open={open || showAfterDone}
        onOpenChange={(v) => {
          if (!v) {
            if (result?.success) {
              finishAndClose();
            } else {
              setOpen(false);
            }
          }
        }}
      >
        <DialogContent className="max-h-[88svh] overflow-y-auto rounded-3xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-left">
              📋 {t("État des lieux d'arrivée")}
            </DialogTitle>
            <DialogDescription className="text-left">
              {t('Logement')} : <strong className="text-foreground">{propertyName}</strong>
            </DialogDescription>
          </DialogHeader>
          {result?.success ? (
            <InspectionSuccessScreen type="checkin" result={result} guestName={guestNameHint ?? ''} onClose={finishAndClose} />
          ) : (
            <InspectionFlowForm
              slug={slug}
              type="checkin"
              propertyName={propertyName}
              guestNameHint={guestNameHint}
              minibarItems={[]}
              onSessionExpired={onSessionExpired}
              onSubmitted={(r) => {
                setResult(r);
                setShowAfterDone(true);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </article>
  );
}

// -------------------------------------------------------------
// CARTE 2 — ÉTAT DES LIEUX DE DÉPART (minibar + pièces + signature)
// -------------------------------------------------------------

export function CheckOutInspectionCard({
  slug,
  propertyName,
  guestNameHint,
  minibarItems,
  onDone,
  onSessionExpired,
  /** v4.82 — mode "dialog seul" (écran d'au-revoir) : la carte n'est pas
   *  rendue, seul le dialog est disponible (ouvert via openSignal). */
  hidden = false,
  /** v4.82 — compteur : incrémenté par le parent pour OUVRIR le dialog
   *  à distance (ex : bouton « Signer l'état des lieux » de l'écran
   *  d'au-revoir). */
  openSignal = 0,
}: {
  slug: string;
  propertyName: string;
  guestNameHint?: string | null;
  /** Articles du minibar du bien (sortie : déclaration des consommations). */
  minibarItems: GuestMinibarItem[];
  /** Appelé après signature (ou si déjà signé côté serveur) → la carte disparaît. */
  onDone: () => void;
  onSessionExpired?: () => void;
  hidden?: boolean;
  openSignal?: number;
}) {
  const { t } = useHubLang();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [syncing, setSyncing] = useState(true);
  const [showAfterDone, setShowAfterDone] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // v4.82 — ouverture à distance (écran d'au-revoir → signature EDL).
  // Pattern React « adjust state during render » : un incrément du
  // signal ouvre le dialog (sans setState dans un effect).
  const [lastOpenSignal, setLastOpenSignal] = useState(openSignal);
  if (openSignal !== lastOpenSignal) {
    setLastOpenSignal(openSignal);
    if (openSignal > 0) setOpen(true);
  }

  useEffect(() => {
    let alive = true;
    hubFetch(slug, `/api/public/hub/${encodeURIComponent(slug)}/checkout-inspection`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { checkout?: { publicToken: string } | null } | null) => {
        if (alive && data?.checkout) onDone();
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setSyncing(false);
      });
    return () => {
      alive = false;
    };
     
  }, [slug]);

  const finishAndClose = () => {
    setOpen(false);
    // v4.80 — onDone à la FERMETURE (pas à la soumission) : la carte reste
    // montée pendant l'écran de preuve (sinon le parent la démonte et le
    // dialog disparaît avant le remerciement). Un rechargement avant
    // fermeture est couvert par la sync serveur du montage.
    onDone();
    setTimeout(() => {
      setShowAfterDone(false);
      setResult(null);
    }, 300);
  };

  return (
    <article
      aria-label={t('État des lieux de départ')}
      className={`group flex h-full min-w-0 flex-col overflow-hidden rounded-3xl border border-amber-200/70 bg-card shadow-sm transition-shadow hover:shadow-md dark:border-amber-500/20 ${
        hidden ? 'hidden' : ''
      }`}
    >
      <div className="relative overflow-hidden bg-gradient-to-br from-amber-500 via-orange-500 to-rose-600 px-5 pb-8 pt-5 text-white">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-8 -top-10 text-[7rem] leading-none opacity-20 select-none"
        >
          🚪
        </div>
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/80">
          {t('Avant de partir')}
        </p>
        <h3 className="mt-1 text-lg font-black leading-tight">{t('État des lieux de départ')}</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-white/85">
          {t('Déclarez le minibar, vérifiez les pièces, signez — le PDF est envoyé à vous et à votre hôte.')}
        </p>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <ul className="space-y-1.5 text-xs text-muted-foreground" aria-label={t('Contenu du document')}>
          {[
            `🍷 ${t('Inventaire du minibar — consommations déclarées')}`,
            `🏠 ${t('Les 5 pièces + inventaire rendu (clés, serviettes)')}`,
            `✍️ ${t('Signature au doigt — document horodaté')}`,
            `📄 ${t('PDF envoyé par email + lien public à vie')}`,
          ].map((line) => (
            <li key={line} className="flex items-start gap-1.5">
              <span aria-hidden="true">{line.slice(0, 2)}</span>
              <span>{line.slice(2).trim()}</span>
            </li>
          ))}
        </ul>

        {minibarItems.length > 0 && (
          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl border border-border bg-secondary/60 px-3.5 py-2 text-left text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
            aria-expanded={detailsOpen}
          >
            <span>
              🍷 {t('Minibar')} · {minibarItems.length} {t('article(s)')}
            </span>
            <ChevronDown className={`h-4 w-4 transition-transform ${detailsOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
        )}
        {detailsOpen && minibarItems.length > 0 && (
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
            {minibarItems.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2">
                <span className="truncate">
                  <span aria-hidden="true" className="mr-1">{i.emoji}</span>
                  {i.name}
                </span>
                <span className="shrink-0 font-semibold">{i.free ? t('Offert') : `${i.price.toFixed(2)} €`}</span>
              </li>
            ))}
          </ul>
        )}

        <Button
          type="button"
          onClick={() => setOpen(true)}
          disabled={syncing}
          className="mt-auto h-12 w-full rounded-xl bg-amber-500 text-sm font-bold text-white shadow hover:bg-amber-600"
        >
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {t('Démarrer l’inspection')} · ⏱ {t('5 min')}
        </Button>
      </div>

      <Dialog
        open={open || showAfterDone}
        onOpenChange={(v) => {
          if (!v) {
            if (result?.success) {
              finishAndClose();
            } else {
              setOpen(false);
            }
          }
        }}
      >
        <DialogContent className="max-h-[88svh] overflow-y-auto rounded-3xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-left">
              🚪 {t('État des lieux de départ')}
            </DialogTitle>
            <DialogDescription className="text-left">
              {t('Logement')} : <strong className="text-foreground">{propertyName}</strong>
            </DialogDescription>
          </DialogHeader>
          {result?.success ? (
            <InspectionSuccessScreen type="checkout" result={result} guestName={guestNameHint ?? ''} onClose={finishAndClose} />
          ) : (
            <InspectionFlowForm
              slug={slug}
              type="checkout"
              propertyName={propertyName}
              guestNameHint={guestNameHint}
              minibarItems={minibarItems}
              onSessionExpired={onSessionExpired}
              onSubmitted={(r) => {
                setResult(r);
                setShowAfterDone(true);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </article>
  );
}

// Garde-fou typage langue (import utilisé) — HubLang référencé pour l'arbre i18n.
export type { HubLang };
