'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { SignaturePad } from './signature-pad';

// =============================================================
// v5.0 « ÉTAT DES LIEUX DE SORTIE » — Formulaire invité
// L'invité constate l'état dans lequel il rend le logement :
//   • 5 pièces × 3 états (Bon état / Sale / Endommagé) + commentaire
//     + photos (≤ 4/pièce, compressées client, dataURL — pas d'upload) ;
//   • inventaire rendu (clés / télécommandes / serviettes) ;
//   • auto-évaluation 5 étoiles + commentaires libres ;
//   • signature au doigt (SignaturePad) — valeur légale ;
//   • POST /api/public/hub/[slug]/checkout-inspection → emails
//     (invité + hôte) + preuve publique + PDF à la demande.
// Écran de confirmation DANS ce composant (pas de nouvelle route) :
// coche émeraude animée + encart ambre « lien de preuve » copiable.
// Design : accent émeraude (app invité), badges ambre (légal).
// =============================================================

type RoomId = 'entrance' | 'kitchen' | 'livingRoom' | 'bedrooms' | 'bathroom';
type RoomStatus = 'good' | 'dirty' | 'damaged';

interface RoomState {
  status: RoomStatus;
  comment: string;
  photos: string[];
}

interface CheckInInfo {
  checkedAt: string;
  publicToken: string | null;
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

export function CheckOutInspection({
  slug,
  bookingId,
  onDone,
}: {
  slug: string;
  /** Séjour courant (mémorisé ?b=) — rattache le document au séjour. */
  bookingId?: string | null;
  /** Callback de navigation (retour à l'accueil du Hub). */
  onDone?: () => void;
}) {
  const [propertyName, setPropertyName] = useState<string>('');
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [checkIn, setCheckIn] = useState<CheckInInfo | null>(null);
  const [ctxLoaded, setCtxLoaded] = useState(false);

  const [rooms, setRooms] = useState<Record<RoomId, RoomState>>(() => ({
    entrance: { status: 'good', comment: '', photos: [] },
    kitchen: { status: 'good', comment: '', photos: [] },
    livingRoom: { status: 'good', comment: '', photos: [] },
    bedrooms: { status: 'good', comment: '', photos: [] },
    bathroom: { status: 'good', comment: '', photos: [] },
  }));
  const [inventory, setInventory] = useState({ keys: 2, remotes: 1, towels: 4 });
  const [selfAssessment, setSelfAssessment] = useState(0);
  const [comments, setComments] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const photoTargetRoom = useRef<RoomId | null>(null);
  const [busyRoom, setBusyRoom] = useState<RoomId | null>(null);

  // ── Contexte : pré-remplissage (booking) + inspection d'entrée ──
  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const qs = new URLSearchParams({ slug });
        if (bookingId) qs.set('b', bookingId);
        const [appRes, ctxRes] = await Promise.all([
          fetch(`/api/public/guest-app?${qs.toString()}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch(`/api/public/hub/${encodeURIComponent(slug)}/checkout-inspection?${qs.toString()}`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
        ]);
        if (cancelled) return;
        const booking = appRes?.guest?.booking ?? null;
        if (booking?.guestName) setGuestName((v) => v || String(booking.guestName).slice(0, 80));
        if (appRes?.property?.name) setPropertyName(String(appRes.property.name));
        if (ctxRes?.checkIn) setCheckIn(ctxRes.checkIn as CheckInInfo);
        if (ctxRes?.inventory) {
          const inv = ctxRes.inventory as Record<string, unknown>;
          setInventory({
            keys: typeof inv.keys === 'number' && inv.keys >= 0 ? inv.keys : 2,
            remotes: typeof inv.remotes === 'number' && inv.remotes >= 0 ? inv.remotes : 1,
            towels: typeof inv.towels === 'number' && inv.towels >= 0 ? inv.towels : 4,
          });
        }
      } finally {
        if (!cancelled) setCtxLoaded(true);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [slug, bookingId]);

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
      toast.error(`Maximum ${MAX_PHOTOS_PER_ROOM} photos pour cette pièce.`);
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
          toast.error('Une photo n’a pas pu être traitée.');
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

  const canSubmit = useMemo(
    () => guestName.trim().length > 0 && selfAssessment >= 1 && !!signature && !submitting,
    [guestName, selfAssessment, signature, submitting],
  );

  const submit = async () => {
    if (!canSubmit || submitting) return;
    if (!signature) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/checkout-inspection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: bookingId ?? undefined,
          guestName: guestName.trim().slice(0, 80),
          guestEmail: guestEmail.trim() || undefined,
          rooms: ROOMS.map((r) => ({
            id: r.id,
            label: r.label,
            status: rooms[r.id].status,
            comment: rooms[r.id].comment.trim() || undefined,
            photos: rooms[r.id].photos,
          })),
          inventory,
          selfAssessment,
          comments: comments.trim() || undefined,
          signature,
          checkInPublicToken: checkIn?.publicToken ?? undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as SubmitResult & { error?: string };
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Envoi impossible');
      }
      setResult(data);
      toast.success('État des lieux enregistré !');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      toast.error(e instanceof Error && e.message !== 'Envoi impossible' ? e.message : 'Envoi impossible. Vérifiez votre connexion et réessayez.');
    } finally {
      setSubmitting(false);
    }
  };

  const copyProofLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Lien de preuve copié !');
    } catch {
      toast.error('Copie impossible — maintenez le lien pour le copier.');
    }
  };

  // ── Écran de confirmation (dans le même composant) ──
  if (result?.success) {
    return (
      <div className="space-y-4" role="status" aria-live="polite">
        <div className="rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-sm">
          <motion.div
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100"
            aria-hidden="true"
          >
            <motion.svg
              viewBox="0 0 24 24"
              className="h-10 w-10 text-emerald-600"
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
          <h1 className="mt-4 text-xl font-bold text-slate-900">État des lieux enregistré !</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Merci {guestName.split(/\s+/)[0] ? guestName.split(/\s+/)[0] : ''} — votre document a été transmis
            {result.demo ? ' (mode démo : aucun email ni document généré).' : ' à votre hôte. Le PDF vous a été envoyé par email.'}
          </p>

          {!result.demo && result.publicUrl && (
            <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-left">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-800">
                🔗 Preuve publique à valeur légale
              </p>
              <p className="mt-1.5 break-all text-xs text-amber-900/90">{result.publicUrl}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void copyProofLink(result.publicUrl!)}
                  className="min-h-[44px] flex-1 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-amber-600 cursor-pointer"
                >
                  📋 Copier le lien
                </button>
                <a
                  href={`/api/public/inspection/${result.publicToken}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-amber-400 bg-white px-4 py-2 text-sm font-bold text-amber-800 transition-colors hover:bg-amber-100"
                >
                  📄 Voir le document de preuve
                </a>
              </div>
            </div>
          )}

          {onDone && (
            <button
              type="button"
              onClick={onDone}
              className="mt-6 min-h-[48px] w-full rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-700 cursor-pointer"
            >
              ← Retour à l'accueil
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Formulaire ──
  return (
    <div className="space-y-4">
      {/* En-tête */}
      <header className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h1 className="text-lg font-bold text-card-foreground">État des lieux de sortie</h1>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Merci de constater l'état dans lequel vous rendez le logement
          {propertyName ? <> — <strong className="text-card-foreground">{propertyName}</strong></> : null}.
        </p>
        <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          ⚖️ Document à valeur légale — PDF envoyé par email
        </span>

        {/* Encart comparaison entrée */}
        {ctxLoaded && checkIn && (
          <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-2.5 text-xs font-semibold leading-relaxed text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
            ✅ Votre état des lieux d'entrée a été enregistré le{' '}
            {new Date(checkIn.checkedAt).toLocaleString('fr-FR', {
              day: 'numeric',
              month: 'long',
              hour: '2-digit',
              minute: '2-digit',
            })}
            {checkIn.publicToken ? (
              <>
                {' — '}
                <a
                  href={`/api/public/inspection/${checkIn.publicToken}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2"
                >
                  revoir la preuve d'arrivée
                </a>
              </>
            ) : null}
          </p>
        )}
      </header>

      {/* Identité invité */}
      <section aria-label="Vos coordonnées" className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-sm font-bold text-card-foreground">1. Vous</h2>
        <div className="mt-3 space-y-3">
          <div>
            <label htmlFor="coi-name" className="text-xs font-semibold text-muted-foreground">
              Nom complet *
            </label>
            <input
              id="coi-name"
              type="text"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              maxLength={80}
              autoComplete="name"
              placeholder="Votre nom"
              className="mt-1 w-full min-h-[44px] rounded-xl border border-border bg-background px-3.5 text-sm text-card-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-[#0066EF]/50"
            />
          </div>
          <div>
            <label htmlFor="coi-email" className="text-xs font-semibold text-muted-foreground">
              Email (pour recevoir le PDF)
            </label>
            <input
              id="coi-email"
              type="email"
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              maxLength={120}
              autoComplete="email"
              inputMode="email"
              placeholder="vous@exemple.com"
              className="mt-1 w-full min-h-[44px] rounded-xl border border-border bg-background px-3.5 text-sm text-card-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-[#0066EF]/50"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Sans email, le document reste consultable en ligne auprès de votre hôte.
            </p>
          </div>
        </div>
      </section>

      {/* Les 5 pièces */}
      <section aria-label="État des pièces" className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-sm font-bold text-card-foreground">2. L'état des pièces</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Signalez ce qui est sale ou endommagé — photos bienvenues en cas de problème.
        </p>
        <div className="mt-3 space-y-3">
          {ROOMS.map((room) => {
            const state = rooms[room.id];
            return (
              <div
                key={room.id}
                className={`rounded-xl border p-3.5 transition-colors ${STATUS_META[state.status].card}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold text-card-foreground">
                    <span aria-hidden="true" className="mr-1.5">{room.emoji}</span>
                    {room.label}
                  </p>
                </div>
                <div className="mt-2.5 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={`État : ${room.label}`}>
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
                        className={`min-h-[44px] rounded-xl border px-1.5 py-2 text-[11px] font-bold leading-tight transition-all cursor-pointer ${
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
                  <div className="mt-3 space-y-2.5">
                    <input
                      type="text"
                      value={state.comment}
                      onChange={(e) => setRoom(room.id, { comment: e.target.value })}
                      maxLength={300}
                      placeholder="Précisez le problème (optionnel)"
                      aria-label={`Commentaire : ${room.label}`}
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
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
                        ) : (
                          <>📷 Ajouter des photos ({state.photos.length}/{MAX_PHOTOS_PER_ROOM})</>
                        )}
                      </button>
                    )}
                    {state.photos.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {state.photos.map((photo, i) => (
                          <div key={`${i}-${photo.slice(-16)}`} className="relative h-20 w-20 overflow-hidden rounded-lg border border-border">
                            <img src={photo} alt={`Photo ${i + 1} — ${room.label}`} className="h-full w-full object-cover" />
                            <button
                              type="button"
                              onClick={() => removePhoto(room.id, i)}
                              aria-label={`Supprimer la photo ${i + 1} de ${room.label}`}
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
        {/* Input fichier caché partagé (capture appareil photo) */}
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

      {/* Inventaire rendu */}
      <section aria-label="Inventaire rendu" className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-sm font-bold text-card-foreground">3. Inventaire rendu</h2>
        <p className="mt-1 text-xs text-muted-foreground">Combien d'objets restent dans le logement ?</p>
        <div className="mt-3 space-y-2">
          {(
            [
              { key: 'keys' as const, emoji: '🔑', label: 'Clés' },
              { key: 'remotes' as const, emoji: '📺', label: 'Télécommandes' },
              { key: 'towels' as const, emoji: '🧺', label: 'Serviettes' },
            ]
          ).map((item) => (
            <div key={item.key} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/60 px-3.5 py-2">
              <p className="text-sm font-semibold text-card-foreground">
                <span aria-hidden="true" className="mr-1.5">{item.emoji}</span>
                {item.label}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={`Retirer une ${item.label.toLowerCase()}`}
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
                  aria-label={`Ajouter une ${item.label.toLowerCase()}`}
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

      {/* Auto-évaluation + commentaires */}
      <section aria-label="Votre ressenti" className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-sm font-bold text-card-foreground">4. Votre séjour</h2>
        <p className="mt-1 text-xs font-semibold text-muted-foreground">Comment évaluez-vous votre séjour ?</p>
        <div className="mt-2 flex items-center gap-1" role="radiogroup" aria-label="Auto-évaluation de 1 à 5 étoiles">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              role="radio"
              aria-checked={selfAssessment === star}
              aria-label={`${star} étoile${star > 1 ? 's' : ''}`}
              onClick={() => setSelfAssessment(star)}
              className={`min-h-[44px] min-w-[44px] rounded-lg text-3xl leading-none transition-transform hover:scale-110 cursor-pointer ${
                star <= selfAssessment ? 'text-amber-400' : 'text-slate-300 dark:text-slate-600'
              }`}
            >
              ★
            </button>
          ))}
        </div>
        <textarea
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="Commentaires libres pour votre hôte (optionnel)"
          aria-label="Commentaires libres"
          className="mt-3 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-card-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-[#0066EF]/50 resize-none"
        />
      </section>

      {/* Signature */}
      <section aria-label="Signature" className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-sm font-bold text-card-foreground">5. Signature</h2>
        <div className="mt-3">
          <SignaturePad onChange={setSignature} />
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          En signant, je certifie sur l'honneur l'exactitude des informations déclarées et reconnais que ce
          document, horodaté et accompagné de mon adresse IP, a valeur d'état des lieux de sortie contradictoire.
        </p>
      </section>

      {/* Validation finale */}
      <button
        type="button"
        onClick={() => void submit()}
        disabled={!canSubmit}
        className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#0066EF] px-5 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-[#0052C4] active:scale-[0.99] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
        aria-describedby="coi-submit-hint"
      >
        {submitting && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden="true" />
        )}
        {submitting ? 'Envoi en cours…' : 'Valider et générer le document de sortie'}
      </button>
      <p id="coi-submit-hint" className="-mt-2 text-center text-[11px] text-muted-foreground">
        {!signature || selfAssessment < 1
          ? 'Signature et auto-évaluation requises pour valider.'
          : 'Le document sera signé électroniquement, horodaté et envoyé par email.'}
      </p>
    </div>
  );
}
