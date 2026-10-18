'use client';

// =============================================================
// v4.52 « LIVRE D'OR VIVANT » — GALERIE PUBLIQUE + FORMULAIRE
//
// Overlay plein écran du Hub invité (même anatomie que l'overlay
// Room Services) : le nouveau voyageur feuillette les souvenirs des
// précédents — photos, messages manuscrits (serif italique), vocaux,
// réponses de l'hôte — puis laisse le sien.
//
//   • Header « 📖 Le Livre d'Or de {bien} » + compteur animé
//     (« X voyageurs ont partagé leur expérience ici »).
//   • Filtres chips : 🌟 Tous / 📷 Photos / 🎤 Vocaux / ✍️ Messages /
//     ⭐ 5 étoiles uniquement.
//   • Grille MASONRY (columns-1 md:columns-2 xl:columns-3), souvenirs
//     épinglés d'abord (badge « ⭐ Coup de cœur de l'hôte »).
//   • Carte : photo cover → nom + drapeau → étoiles + date relative →
//     message serif italic → lecteur audio → miniatures → réponse hôte
//     (fond ambre). Apparition en cascade, hover élévation.
//   • CTA flottant « ✍️ Laisser mon souvenir » → formulaire : nom
//     pré-rempli (booking), pays à drapeaux, 5 étoiles interactives,
//     message, ≤ 5 photos (redimensionnées client), vocal ≤ 60 s
//     (MediaRecorder — même pipeline que les voix du hub), checkbox
//     « Rendre mon souvenir public » (cochée).
//   • Soumission → isApproved:false (pending) + notification hôte ;
//     le souvenir du voyageur s'affiche « ⏳ En attente de validation ».
//
// Design « livre d'or physique » : fond papier (stone-50/amber-50),
// cartes bg-white border-amber-100, typographie serif italique.
// i18n via HubLangContext (rendu DANS l'arbre invité).
// =============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import {
  ImagePlus,
  Loader2,
  Mic,
  Pause,
  Play,
  Send,
  Square,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { CountUp } from '@/components/premium/count-up';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { fileToHubPhotoDataUrl } from '@/lib/hub-photos';
import { hubFetch, HubSessionExpiredError } from '@/lib/hub-access-client';
import { pickRecorderMime } from '@/lib/voice-audio';
import { translateText, useHubLang } from '@/lib/hub-i18n';
import {
  MEMORY_COUNTRIES,
  MEMORY_LIMITS,
  countryFlag,
  type GuestMemoryPublic,
} from '@/lib/memories';

/* ── Types locaux ─────────────────────────────────────────────── */

interface MemoriesStats {
  total: number;
  avg: number | null;
  photos: number;
  audios: number;
  publicRate: number;
}

type MemoryFilter = 'all' | 'photos' | 'audios' | 'messages' | 'five';

/** Souvenir soumis localement (en attente de modération hôte). */
interface PendingMemory {
  localId: string;
  guestName: string;
  guestCountry: string | null;
  rating: number;
  message: string | null;
  photos: { url: string }[];
  audioUrl: string | null;
  audioSeconds: number | null;
  createdAt: string;
}

/* ── Utilitaires ──────────────────────────────────────────────── */

/** Date relative FR (« Il y a 2 semaines »). */
function relativeFr(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `il y a ${d} jour${d > 1 ? 's' : ''}`;
  const w = Math.floor(d / 7);
  if (w < 5) return `il y a ${w} semaine${w > 1 ? 's' : ''}`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `il y a ${mo} mois`;
  const y = Math.floor(d / 365);
  return `il y a ${y} an${y > 1 ? 's' : ''}`;
}

function Stars({ n, className }: { n: number; className?: string }) {
  return (
    <span aria-label={`${n} étoiles sur 5`} className={cn('inline-flex items-center gap-0.5', className)}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn('h-3.5 w-3.5', i <= n ? 'fill-amber-400 text-amber-400' : 'fill-stone-200 text-stone-200')}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

/* ── Lecteur audio élégant ────────────────────────────────────── */

function MemoryAudioPlayer({
  src,
  fallbackSeconds,
}: {
  src: string;
  fallbackSeconds?: number | null;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState<number | null>(fallbackSeconds ?? null);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (audioRef.current) audioRef.current.src = '';
    };
  }, []);

  const toggle = () => {
    if (!audioRef.current) {
      const audio = new Audio(src);
      audioRef.current = audio;
      audio.addEventListener('loadedmetadata', () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          setDuration(Math.round(audio.duration));
        }
      });
      audio.addEventListener('timeupdate', () => setElapsed(audio.currentTime));
      audio.addEventListener('ended', () => {
        setPlaying(false);
        setElapsed(0);
      });
      audio.addEventListener('error', () => {
        setPlaying(false);
      });
    }
    const audio = audioRef.current!;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      void audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  };

  const total = duration && Number.isFinite(duration) && duration > 0 ? duration : null;
  const pct = total ? Math.min(100, (elapsed / total) * 100) : 0;
  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/80 px-3 py-2.5">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Mettre en pause le vocal' : 'Écouter le vocal'}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white shadow-md transition-all hover:bg-amber-600 active:scale-95"
      >
        {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
      </button>
      <div className="min-w-0 flex-1">
        {/* Onde décorative (barres) — hauteur reflète la progression */}
        <div className="flex h-6 items-center gap-[3px]" aria-hidden="true">
          {Array.from({ length: 24 }).map((_, i) => {
            const active = total ? i / 24 <= pct / 100 : false;
            const h = 6 + ((i * 7919) % 16); // pseudo-aléatoire déterministe
            return (
              <span
                key={i}
                style={{ height: `${h}px` }}
                className={cn(
                  'w-[3px] rounded-full transition-colors duration-300',
                  active ? 'bg-amber-500' : 'bg-amber-200',
                )}
              />
            );
          })}
        </div>
        <p className="mt-1 text-[10px] font-semibold tabular-nums text-stone-500">
          🎤 {fmt(elapsed)}{total ? ` / ${fmt(total)}` : ''}
        </p>
      </div>
    </div>
  );
}

/* ── Carte souvenir (masonry) ─────────────────────────────────── */

function MemoryCard({
  memory,
  index,
  tL,
  pending = false,
  audioSeconds,
}: {
  memory: GuestMemoryPublic;
  index: number;
  tL: (s: string) => string;
  pending?: boolean;
  audioSeconds?: number | null;
}) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -30px 0px' }}
      transition={{ duration: 0.45, delay: Math.min(index * 0.05, 0.4), ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'group mb-4 break-inside-avoid overflow-hidden rounded-2xl border bg-white shadow-[0_10px_30px_-16px_rgba(120,80,20,0.25)]',
        'transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_44px_-16px_rgba(120,80,20,0.35)]',
        pending ? 'border-amber-300 border-dashed' : 'border-amber-100',
      )}
    >
      {/* Photo cover */}
      {memory.photos.length > 0 && (
        <div className="relative h-48 w-full overflow-hidden">
          
          <img
            src={memory.photos[0].url}
            alt={memory.message ? '' : `Souvenir de ${memory.guestName}`}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
          {memory.photos.length > 1 && (
            <span className="absolute bottom-2.5 right-2.5 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur-md">
              📷 {memory.photos.length} {tL('photos')}
            </span>
          )}
        </div>
      )}

      <div className="p-4">
        {/* Badge épinglé / en attente */}
        {memory.isPinned && !pending && (
          <span className="mb-2 inline-flex items-center gap-1 rounded-full border border-amber-300 bg-gradient-to-r from-amber-100 to-orange-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-800">
            ⭐ {tL("Coup de cœur de l'hôte")}
          </span>
        )}
        {pending && (
          <span className="mb-2 inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">
            ⏳ {tL('En attente de validation par votre hôte')}
          </span>
        )}

        {/* Nom + drapeau + étoiles + date */}
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-bold text-stone-800">
            👤 {memory.guestName}
            {memory.guestCountry ? (
              <span aria-hidden="true" className="ml-1.5" title={memory.guestCountry}>
                {countryFlag(memory.guestCountry)}
              </span>
            ) : null}
          </p>
          <span className="shrink-0 text-[10px] font-medium text-stone-400">
            {relativeFr(memory.createdAt)}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <Stars n={memory.rating} />
          {memory.guestCountry && (
            <span className="text-[10px] font-medium text-stone-400">{memory.guestCountry}</span>
          )}
        </div>

        {/* Message manuscrit */}
        {memory.message && (
          <p className="mt-2.5 font-serif text-[15px] italic leading-relaxed text-slate-700">
            « {memory.message} »
          </p>
        )}

        {/* Vocal */}
        {memory.audioUrl && (
          <div className="mt-3">
            <MemoryAudioPlayer src={memory.audioUrl} fallbackSeconds={audioSeconds ?? null} />
          </div>
        )}

        {/* Miniatures photos (si cover affichée + autres photos) */}
        {memory.photos.length > 1 && (
          <div className="mt-3 flex gap-2">
            {memory.photos.map((p, i) => (
              <img
                key={`${memory.id}-ph-${i}`}
                src={p.url}
                alt=""
                loading="lazy"
                className="h-14 w-14 rounded-lg border border-amber-100 object-cover"
              />
            ))}
          </div>
        )}

        {/* Réponse de l'hôte */}
        {memory.hostReply && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/90 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-700">
              💬 {tL('Réponse de l’hôte')}
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-amber-900">{memory.hostReply}</p>
          </div>
        )}
      </div>
    </motion.article>
  );
}

/* ── Formulaire « Laisser mon souvenir » ──────────────────────── */

function MemoryForm({
  slug,
  guestName,
  onSubmitDone,
  onBack,
  tL,
}: {
  slug: string;
  guestName: string | null;
  onSubmitDone: (pending: PendingMemory) => void;
  onBack: () => void;
  tL: (s: string) => string;
}) {
  const [name, setName] = useState(guestName ?? '');
  const [country, setCountry] = useState('');
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [message, setMessage] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioSeconds, setAudioSeconds] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [isPublic, setIsPublic] = useState(true);
  const [busy, setBusy] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recTimerRef = useRef<number | null>(null);
  const recStartRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  const canSubmit = name.trim().length > 0 && rating >= 1 && !busy;

  // ── Photos (≤ 5, redimensionnées client en dataURL JPEG) ──
  const addPhotos = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setPhotoBusy(true);
    try {
      const next: string[] = [];
      for (const file of Array.from(files)) {
        if (photos.length + next.length >= MEMORY_LIMITS.maxPhotos) break;
        const dataUrl = await fileToHubPhotoDataUrl(file, 1024);
        if (dataUrl && dataUrl.length <= MEMORY_LIMITS.maxPhotoChars) next.push(dataUrl);
      }
      if (next.length > 0) setPhotos((p) => [...p, ...next].slice(0, MEMORY_LIMITS.maxPhotos));
      else toast.error(tL('Photo trop lourde ou illisible — essayez une autre image.'));
    } finally {
      setPhotoBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [photos.length, tL]);

  // ── Vocal (≤ 60 s, MediaRecorder — même pipeline que les voix) ──
  const stopRecording = useCallback((finalize: boolean) => {
    if (recTimerRef.current != null) {
      window.clearInterval(recTimerRef.current);
      recTimerRef.current = null;
    }
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (!finalize) {
      // Annulation : on arrête sans garder le résultat.
      recorder.ondataavailable = null;
      recorder.onstop = null;
      try {
        recorder.stop();
      } catch {
        // déjà arrêté
      }
      recorderRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setRecording(false);
      setRecSeconds(0);
      return;
    }
    try {
      recorder.stop();
    } catch {
      // déjà arrêté
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickRecorderMime();
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      recorderRef.current = recorder;
      recStartRef.current = Date.now();
      setRecSeconds(0);
      setRecording(true);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const seconds = Math.max(1, Math.round((Date.now() - recStartRef.current) / 1000));
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = typeof reader.result === 'string' ? reader.result : null;
          if (dataUrl && dataUrl.length <= MEMORY_LIMITS.maxAudioChars) {
            setAudioUrl(dataUrl);
            setAudioSeconds(seconds);
            toast.success(tL('Vocal enregistré — il accompagnera votre souvenir 🎤'));
          } else {
            toast.error(tL('Vocal trop long — réenregistrez un message de moins de 60 secondes.'));
          }
          streamRef.current?.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          recorderRef.current = null;
        };
        reader.readAsDataURL(blob);
        setRecording(false);
        setRecSeconds(0);
      };
      recorder.start(250);
      recTimerRef.current = window.setInterval(() => {
        const s = Math.floor((Date.now() - recStartRef.current) / 1000);
        setRecSeconds(s);
        if (s >= 60) stopRecording(true); // plafond 60 s — auto-stop
      }, 250);
    } catch {
      toast.error(tL('Microphone indisponible — vérifiez les autorisations du navigateur.'));
      setRecording(false);
    }
  }, [recording, stopRecording, tL]);

  useEffect(() => {
    return () => {
      if (recTimerRef.current != null) window.clearInterval(recTimerRef.current);
      if (recorderRef.current?.state === 'recording') { try { recorderRef.current.stop(); } catch { /* déjà arrêté */ } }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const submit = async () => {
    if (!canSubmit) return;
    if (name.trim().length === 0) {
      toast.error(tL('Indiquez votre nom pour envoyer votre souvenir.'));
      return;
    }
    if (rating < 1) {
      toast.error(tL('Choisissez une note de 1 à 5 étoiles.'));
      return;
    }
    setBusy(true);
    try {
      // v4.71 — hubFetch : porte le token de session du hub verrouillé
      // (x-hub-token). Un fetch simple renvoyait 403 SESSION_REQUIRED sur
      // tout hub protégé par code → « impossible d'envoyer » le souvenir.
      const res = await hubFetch(slug, `/api/public/hub/${encodeURIComponent(slug)}/memories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestName: name.trim().slice(0, 60),
          guestCountry: country || null,
          rating,
          message: message.trim() || null,
          photoUrls: photos,
          audioUrl,
          isPublic,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok || !json.ok) {
        toast.error(json.error || tL('Envoi impossible. Réessayez dans un instant.'));
        return;
      }
      onSubmitDone({
        localId: `pending-${Date.now()}`,
        guestName: name.trim().slice(0, 60),
        guestCountry: country || null,
        rating,
        message: message.trim() || null,
        photos: photos.map((url) => ({ url })),
        audioUrl,
        audioSeconds,
        createdAt: new Date().toISOString(),
      });
      toast.success(json.message || tL('Merci ! Votre souvenir sera publié après validation.'));
    } catch (err) {
      if (err instanceof HubSessionExpiredError) {
        toast.error(err.message);
      } else {
        toast.error(tL('Envoi impossible. Vérifiez votre connexion.'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Nom + pays */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-stone-500">
            {tL('Votre nom')} *
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder={tL('Ex. Thomas & Sophie')}
            className="h-11 w-full rounded-xl border border-stone-200 bg-white px-3.5 text-sm font-medium text-stone-800 shadow-sm outline-none transition-colors placeholder:text-stone-300 focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-stone-500">
            {tL('Votre pays')}
          </span>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm font-medium text-stone-800 shadow-sm outline-none transition-colors focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
          >
            <option value="">—</option>
            {MEMORY_COUNTRIES.map((c) => (
              <option key={c.label} value={c.label}>
                {c.flag} {c.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Note 5 étoiles interactives */}
      <div>
        <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-stone-500">
          {tL('Votre note')} *
        </span>
        <div className="flex items-center gap-1.5" role="radiogroup" aria-label={tL('Votre note')}>
          {[1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={rating === i}
              aria-label={`${i} étoile${i > 1 ? 's' : ''}`}
              onMouseEnter={() => setHoverRating(i)}
              onMouseLeave={() => setHoverRating(0)}
              onClick={() => setRating(i)}
              className="rounded-lg p-1 transition-transform hover:scale-110 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              <Star
                className={cn(
                  'h-8 w-8 transition-colors',
                  (hoverRating || rating) >= i
                    ? 'fill-amber-400 text-amber-400'
                    : 'fill-stone-200 text-stone-200',
                )}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Message */}
      <label className="block">
        <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-stone-500">
          {tL('Racontez-nous votre séjour…')}
        </span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, MEMORY_LIMITS.maxMessageChars))}
          rows={4}
          maxLength={MEMORY_LIMITS.maxMessageChars}
          placeholder={tL('Le coucher de soleil depuis la terrasse, le petit café du matin…')}
          className="w-full resize-none rounded-xl border border-stone-200 bg-white p-3.5 font-serif text-[15px] italic leading-relaxed text-stone-800 shadow-sm outline-none transition-colors placeholder:font-sans placeholder:not-italic placeholder:text-stone-300 focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
        />
        <span className="mt-1 block text-right text-[10px] text-stone-400">
          {message.length}/{MEMORY_LIMITS.maxMessageChars}
        </span>
      </label>

      {/* Photos (≤ 5) */}
      <div>
        <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-stone-500">
          {tL('Photos')} <span className="normal-case text-stone-400">({photos.length}/{MEMORY_LIMITS.maxPhotos})</span>
        </span>
        <div className="flex flex-wrap gap-2">
          {photos.map((p, i) => (
            <span key={i} className="group relative">
              
              <img src={p} alt="" className="h-16 w-16 rounded-xl border border-amber-200 object-cover" />
              <button
                type="button"
                onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                aria-label={tL('Retirer cette photo')}
                className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-stone-800 text-white shadow-md transition-transform hover:scale-110"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {photos.length < MEMORY_LIMITS.maxPhotos && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={photoBusy}
              className="flex h-16 w-16 flex-col items-center justify-center rounded-xl border-2 border-dashed border-stone-300 text-stone-400 transition-colors hover:border-amber-400 hover:text-amber-500 disabled:opacity-50"
            >
              {photoBusy ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <ImagePlus className="h-5 w-5" />
                  <span className="mt-0.5 text-[9px] font-bold">{tL('Ajouter')}</span>
                </>
              )}
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => void addPhotos(e.target.files)}
        />
      </div>

      {/* Vocal ≤ 60 s */}
      <div>
        <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-stone-500">
          {tL('Message vocal')} <span className="normal-case text-stone-400">(≤ 60 s)</span>
        </span>
        {audioUrl ? (
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <MemoryAudioPlayer src={audioUrl} fallbackSeconds={audioSeconds} />
            </div>
            <button
              type="button"
              onClick={() => {
                setAudioUrl(null);
                setAudioSeconds(null);
              }}
              aria-label={tL('Supprimer le vocal')}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-stone-200 text-stone-500 transition-colors hover:border-red-300 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => (recording ? stopRecording(true) : void startRecording())}
            className={cn(
              'flex h-12 w-full items-center justify-center gap-2.5 rounded-xl border-2 font-semibold text-sm transition-all active:scale-[0.99]',
              recording
                ? 'border-red-300 bg-red-50 text-red-700'
                : 'border-stone-200 bg-white text-stone-700 hover:border-amber-400 hover:text-amber-600',
            )}
          >
            {recording ? (
              <>
                <Square className="h-4 w-4 fill-current" />
                {tL('Arrêter')} · <span className="tabular-nums">{String(recSeconds).padStart(2, '0')} s / 60</span>
                <span className="ml-1 h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" aria-hidden="true" />
              </>
            ) : (
              <>
                <Mic className="h-5 w-5" />
                {tL('Enregistrer un vocal')}
              </>
            )}
          </button>
        )}
      </div>

      {/* Checkbox public */}
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5">
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
          className="mt-0.5 h-5 w-5 rounded border-stone-300 accent-amber-600"
        />
        <span className="min-w-0">
          <span className="block text-sm font-bold text-stone-800">
            🌍 {tL('Rendre mon souvenir public')}
          </span>
          <span className="mt-0.5 block text-xs leading-relaxed text-stone-500">
            {tL('Votre souvenir sera visible par les futurs voyageurs après validation par votre hôte.')}
          </span>
        </span>
      </label>

      {/* Actions */}
      <div className="flex gap-2.5">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          className="h-12 flex-1 border-stone-300 text-stone-600"
        >
          {tL('Retour au livre d’or')}
        </Button>
        <Button
          type="button"
          disabled={!canSubmit}
          onClick={() => void submit()}
          className="h-12 flex-[1.4] bg-amber-500 text-sm font-bold text-white hover:bg-amber-600"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {tL('Envoyer mon souvenir')}
        </Button>
      </div>
    </div>
  );
}

/* ── Overlay principal ────────────────────────────────────────── */

const FILTERS: { key: MemoryFilter; label: string }[] = [
  { key: 'all', label: '🌟 Tous' },
  { key: 'photos', label: '📷 Photos' },
  { key: 'audios', label: '🎤 Vocaux' },
  { key: 'messages', label: '✍️ Messages' },
  { key: 'five', label: '⭐ 5 étoiles' },
];

export function MemoriesGallery({
  open,
  onClose,
  slug,
  propertyName,
  guestName,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  propertyName: string;
  /** Prénom de l'invité en cours (pré-remplit le formulaire). */
  guestName: string | null;
}) {
  const { lang } = useHubLang();
  const tL = useCallback((s: string) => translateText(s, lang), [lang]);

  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [memories, setMemories] = useState<GuestMemoryPublic[]>([]);
  const [stats, setStats] = useState<MemoriesStats>({ total: 0, avg: null, photos: 0, audios: 0, publicRate: 0 });
  const [filter, setFilter] = useState<MemoryFilter>('all');
  const [view, setView] = useState<'gallery' | 'form'>('gallery');
  const [pending, setPending] = useState<PendingMemory[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Chargement à l'ouverture (+ reset du filtre/vue).
  useEffect(() => {
    if (!open) return;
    setView('gallery');
    setFilter('all');
    setLoading(true);
    setFailed(false);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/memories`);
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          memories?: GuestMemoryPublic[];
          stats?: MemoriesStats;
        } | null;
        if (cancelled) return;
        if (res.ok && json?.ok && Array.isArray(json.memories)) {
          setMemories(json.memories);
          if (json.stats) setStats(json.stats);
        } else {
          setFailed(true);
        }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, slug]);

  // Verrouille le scroll de fond quand l'overlay est ouvert.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Échap → fermer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    switch (filter) {
      case 'photos':
        return memories.filter((m) => m.photos.length > 0);
      case 'audios':
        return memories.filter((m) => !!m.audioUrl);
      case 'messages':
        return memories.filter((m) => !!m.message && m.message.trim().length > 0);
      case 'five':
        return memories.filter((m) => m.rating === 5);
      default:
        return memories;
    }
  }, [memories, filter]);

  if (!mounted || !open) return null;

  const pendingAsCards: GuestMemoryPublic[] = pending.map((p) => ({
    id: p.localId,
    guestName: p.guestName,
    guestCountry: p.guestCountry,
    rating: p.rating,
    message: p.message,
    photos: p.photos,
    audioUrl: p.audioUrl,
    isPinned: false,
    hostReply: null,
    createdAt: p.createdAt,
  }));

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-gradient-to-b from-amber-50/95 via-stone-50 to-stone-100 backdrop-blur-xl">
      {/* ── Header « livre d'or physique » ── */}
      <header className="relative border-b border-amber-100 bg-white/70 px-4 pb-4 pt-5 shadow-sm backdrop-blur-xl sm:px-6">
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer le livre d'or"
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200 bg-white/90 text-stone-500 shadow-sm transition-all hover:text-stone-800 active:scale-95 sm:right-6"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mx-auto max-w-5xl text-center">
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700"
          >
            📖 {tL('Livre d’or')}
          </motion.p>
          <h1 className="mt-2.5 font-serif text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
            {tL('Le Livre d’Or de')} <span className="text-gradient-lux">{propertyName}</span>
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            <CountUp end={stats.total} duration={1.4} className="font-bold text-stone-800" />{' '}
            {tL(stats.total > 1 ? 'voyageurs ont partagé leur expérience ici' : 'voyageur a partagé son expérience ici')}
            {stats.avg ? (
              <span className="ml-2 inline-flex items-center gap-1 font-semibold text-amber-700">
                ⭐ {stats.avg}/5
              </span>
            ) : null}
          </p>
        </div>

        {/* Filtres chips */}
        {view === 'gallery' && memories.length > 0 && (
          <div className="mx-auto mt-3.5 flex max-w-5xl gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
                className={cn(
                  'inline-flex shrink-0 items-center rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all active:scale-95',
                  filter === f.key
                    ? 'border-amber-500 bg-amber-500 text-white shadow-md shadow-amber-500/30'
                    : 'border-stone-200 bg-white/80 text-stone-600 hover:border-amber-300 hover:text-amber-700',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* ── Contenu scrollable ── */}
      <div className="relative flex-1 overflow-y-auto overscroll-contain px-4 pb-28 pt-5 sm:px-6">
        <div className="mx-auto max-w-5xl">
          {view === 'form' ? (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-auto max-w-2xl rounded-3xl border border-amber-100 bg-white/85 p-5 shadow-[0_16px_44px_-20px_rgba(120,80,20,0.3)] backdrop-blur-xl sm:p-7"
            >
              <h2 className="font-serif text-xl font-bold text-stone-900 sm:text-2xl">
                ✍️ {tL('Laissez votre trace dans la légende de la maison')}
              </h2>
              <p className="mb-5 mt-1 text-sm text-stone-500">
                {tL('Photos, mots, voix — tout ce qui rendra ce séjour inoubliable pour les prochains voyageurs.')}
              </p>
              <MemoryForm
                slug={slug}
                guestName={guestName}
                tL={tL}
                onBack={() => setView('gallery')}
                onSubmitDone={(p) => {
                  setPending((prev) => [p, ...prev]);
                  setView('gallery');
                }}
              />
            </motion.div>
          ) : loading ? (
            <div className="columns-1 gap-4 md:columns-2 xl:columns-3" aria-hidden="true">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="mb-4 break-inside-avoid">
                  <div className={cn('animate-pulse rounded-2xl bg-white/70', i % 3 === 0 ? 'h-72' : i % 3 === 1 ? 'h-56' : 'h-64')} />
                </div>
              ))}
            </div>
          ) : failed ? (
            <div className="mx-auto max-w-md py-16 text-center">
              <p className="text-4xl" aria-hidden="true">📖</p>
              <p className="mt-3 font-serif text-lg font-bold text-stone-800">
                {tL('Livre d’or momentanément indisponible')}
              </p>
              <p className="mt-1 text-sm text-stone-500">{tL('Réessayez dans un instant.')}</p>
            </div>
          ) : filtered.length === 0 && pending.length === 0 ? (
            /* ── État vide — encourager la 1ʳᵉ contribution ── */
            <div className="mx-auto max-w-md py-14 text-center">
              <motion.p
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 220, damping: 16 }}
                className="text-6xl"
                aria-hidden="true"
              >
                📖
              </motion.p>
              <p className="mt-4 font-serif text-xl font-bold text-stone-900">
                {tL('Soyez le premier à écrire dans le livre d’or de cette villa !')}
              </p>
              <p className="mt-2 text-sm text-stone-500">
                {tL('Votre souvenir rejoindra la légende de la maison et inspirera les prochains voyageurs.')}
              </p>
              <Button
                type="button"
                onClick={() => setView('form')}
                className="mt-6 h-12 bg-amber-500 px-7 text-sm font-bold text-white shadow-lg shadow-amber-500/30 hover:bg-amber-600"
              >
                ✍️ {tL('Laisser mon souvenir')}
              </Button>
            </div>
          ) : (
            <div className="columns-1 gap-4 md:columns-2 xl:columns-3">
              {/* Souvenirs en attente du voyageur courant (locaux) */}
              {pendingAsCards
                .filter((p) => filter === 'all' || (filter === 'photos' && p.photos.length > 0) || (filter === 'audios' && !!p.audioUrl) || (filter === 'messages' && !!p.message) || (filter === 'five' && p.rating === 5))
                .map((p, i) => (
                  <MemoryCard key={p.id} memory={p} index={i} tL={tL} pending />
                ))}
              {filtered.map((m, i) => (
                <MemoryCard key={m.id} memory={m} index={i} tL={tL} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── CTA flottant (vue galerie) ── */}
      {view === 'gallery' && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center px-4"
        >
          <motion.button
            type="button"
            onClick={() => setView('form')}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            className="pointer-events-auto inline-flex items-center gap-2.5 rounded-full border border-amber-400/50 bg-amber-500 px-7 py-3.5 text-sm font-bold text-white shadow-[0_18px_44px_-12px_rgba(245,158,11,0.65)] backdrop-blur-md transition-colors hover:bg-amber-600"
          >
            ✍️ {tL('Laisser mon souvenir')}
          </motion.button>
        </motion.div>
      )}
    </div>,
    document.body,
  );
}
