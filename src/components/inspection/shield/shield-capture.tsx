'use client';

// =============================================================
// ROOMSCAN BOUCLIER AUTOMATISÉ (v5.1) — CAPTURES
//
//  · ShieldPhotoCapture : capture photo réutilisable (caméra
//    arrière + fantôme d'angle optionnel + fallback fichier).
//    Utilisée par l'onboarding (photos de référence) et par le
//    flux 90 secondes (fantôme d'angle ON/OFF).
//  · ShieldCapture : session CHECK-IN / CHECK-OUT en 90 secondes
//    — 6 zones aux mêmes angles (fantômes), vidéo walkthrough
//    jusqu'à 60 s (preuve reine), envoi + certificat PDF complet
//    (bibliothèque + attestation) envoyé par email hôte + invité.
//
// Thème clair (fond slate-50, cartes blanches) · rouge bouclier #C21F26 · aucune dépendance réseau tierce.
// =============================================================
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Camera, CheckCircle2, Eye, EyeOff, FileVideo, Loader2, RotateCcw, Square, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { SHIELD_ZONE_STATUSES, type ShieldZoneStatus } from '@/lib/shield-refs';
import { blobToBase64, canvasToCompressedDataUrl, fileToShieldPhotoDataUrl } from './shield-photo';

// ---------- Constantes du flux ----------

const VIDEO_TARGET_SEC = 60;
const VIDEO_MAX_BYTES = 20_000_000; // garde-fou client (< 22 Mo serveur)

/** Métadonnées d'affichage des 3 statuts de zone. */
const STATUS_META: Record<
  ShieldZoneStatus,
  { label: string; selected: string; idle: string }
> = {
  IMPECCABLE: {
    label: 'IMPECCABLE',
    selected: 'border-emerald-700 bg-emerald-700 text-white',
    idle: 'border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50',
  },
  A_NETTOYER: {
    label: 'À NETTOYER',
    selected: 'border-amber-500 bg-amber-500 text-amber-950',
    idle: 'border-amber-300 bg-white text-amber-700 hover:bg-amber-50',
  },
  DEGRADATION: {
    label: 'DÉGRADATION',
    selected: 'border-red-600 bg-red-600 text-white',
    idle: 'border-red-300 bg-white text-red-600 hover:bg-red-50',
  },
};

/** Choix du mimeType vidéo (webm vp8 → mp4 → défaut navigateur). */
function pickVideoMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = ['video/webm;codecs=vp8', 'video/mp4', 'video/webm'];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return undefined;
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

// =============================================================
// ShieldPhotoCapture — capture photo réutilisable
// =============================================================

interface ShieldPhotoCaptureProps {
  /** Photo déjà validée (reprise d'une étape) → démarre en aperçu. */
  initialPhoto?: string;
  /** Photo de référence superposée en filigrane (fantôme d'angle). */
  ghostPhoto?: string;
  /** Texte d'aide sous le bouton principal. */
  hint?: string;
  /** UI personnalisée sous l'aperçu (flux session) — sinon boutons Reprendre / ✓ Utiliser. */
  resultNode?: (photo: string, reset: () => void) => ReactNode;
  /** Appelé dès qu'une nouvelle photo est capturée/choisie. */
  onShot?: (photo: string) => void;
  /** Flow par défaut : appelé au « ✓ Utiliser ». */
  onConfirmed?: (photo: string) => void;
  className?: string;
}

export function ShieldPhotoCapture({
  initialPhoto,
  ghostPhoto,
  hint,
  resultNode,
  onShot,
  onConfirmed,
  className,
}: ShieldPhotoCaptureProps) {
  const [photo, setPhoto] = useState<string | null>(initialPhoto ?? null);
  const [stage, setStage] = useState<'idle' | 'camera' | 'preview'>(
    initialPhoto ? 'preview' : 'idle',
  );
  const [ghostOn, setGhostOn] = useState(true);
  const [camError, setCamError] = useState(false);
  const [busy, setBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const closeCamera = useCallback(() => {
    stopStream(streamRef.current);
    streamRef.current = null;
  }, []);

  useEffect(() => closeCamera, [closeCamera]);

  const openCamera = async () => {
    setCamError(false);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('indisponible');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setStage('camera');
      // La vidéo n'existe qu'après le rendu du stage « camera ».
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => undefined);
        }
      });
    } catch {
      setCamError(true);
      toast.error('Caméra indisponible — choisissez une photo depuis vos fichiers.');
    }
  };

  const shoot = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvasToCompressedDataUrl(canvas);
    closeCamera();
    setPhoto(dataUrl);
    setStage('preview');
    onShot?.(dataUrl);
  };

  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    const dataUrl = await fileToShieldPhotoDataUrl(file);
    setBusy(false);
    if (!dataUrl) {
      toast.error('Photo illisible — réessayez avec une autre image.');
      return;
    }
    setPhoto(dataUrl);
    setStage('preview');
    onShot?.(dataUrl);
  };

  const reset = () => {
    setPhoto(null);
    setStage('idle');
  };

  // ----- Rendu -----
  if (stage === 'idle') {
    return (
      <div className={cn('space-y-2', className)}>
        <button
          type="button"
          onClick={() => void openCamera()}
          className="flex min-h-[88px] w-full flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-gray-300 bg-white px-4 py-4 text-gray-900 shadow-sm transition-colors hover:border-[#C21F26]/60 hover:bg-red-50"
          aria-label="Ouvrir la caméra pour prendre la photo"
        >
          <Camera className="size-5 text-[#C21F26]" aria-hidden="true" />
          <span className="text-sm font-semibold">Ouvrir la caméra</span>
          {hint ? <span className="text-[11px] text-gray-500">{hint}</span> : null}
        </button>

        {camError ? (
          <p className="text-[11px] font-medium text-amber-700" role="note">
            Caméra indisponible — utilisez la sélection de fichier ci-dessous.
          </p>
        ) : null}

        <label className="flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-full border border-gray-300 bg-white px-4 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900">
          <span aria-hidden="true">＋</span> ou choisir une photo du téléphone
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              void onPickFile(e.target.files?.[0]);
              e.currentTarget.value = '';
            }}
          />
        </label>
        {busy ? (
          <p className="flex items-center justify-center gap-2 text-[11px] text-gray-500" role="status">
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Compression de la photo…
          </p>
        ) : null}
      </div>
    );
  }

  if (stage === 'camera') {
    return (
      <div className={cn('space-y-2', className)}>
        <div className="relative overflow-hidden rounded-2xl border border-gray-300 bg-black shadow-sm">
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            className="aspect-[3/4] w-full object-cover sm:aspect-video"
            aria-label="Aperçu caméra"
          />
          {ghostPhoto && ghostOn ? (
            <img
              src={ghostPhoto}
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-35"
            />
          ) : null}

          {/* Toggle fantôme d'angle */}
          {ghostPhoto ? (
            <button
              type="button"
              onClick={() => setGhostOn((v) => !v)}
              className={cn(
                'absolute left-2 top-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3 text-[11px] font-bold uppercase tracking-[0.08em] backdrop-blur',
                ghostOn
                  ? 'border-white/30 bg-black/60 text-white'
                  : 'border-white/15 bg-black/40 text-white/60',
              )}
              aria-pressed={ghostOn}
              aria-label={ghostOn ? 'Désactiver le fantôme d\u2019angle' : 'Activer le fantôme d\u2019angle'}
            >
              {ghostOn ? <Eye className="size-4" aria-hidden="true" /> : <EyeOff className="size-4" aria-hidden="true" />}
              Fantôme {ghostOn ? 'ON' : 'OFF'}
            </button>
          ) : null}

          {/* Déclencheur 56 px + annuler */}
          <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-6">
            <button
              type="button"
              onClick={closeCamera}
              className="flex size-11 items-center justify-center rounded-full border border-white/25 bg-black/60 text-white/80 transition-colors hover:text-white"
              aria-label="Annuler la capture caméra"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={shoot}
              className="size-14 rounded-full border-4 border-white/90 bg-[#C21F26] shadow-[0_0_0_6px_rgba(194,31,38,0.25)] transition-transform active:scale-95"
              aria-label="Prendre la photo"
            />
            <span aria-hidden="true" className="size-11" />
          </div>
        </div>

        <label className="flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-full border border-gray-300 bg-white px-4 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900">
          <span aria-hidden="true">＋</span> ou choisir une photo du téléphone
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              void onPickFile(e.target.files?.[0]);
              e.currentTarget.value = '';
            }}
          />
        </label>
      </div>
    );
  }

  // stage === 'preview'
  return (
    <div className={cn('space-y-3', className)}>
      <div className="overflow-hidden rounded-2xl border border-gray-300 bg-black shadow-sm">
        <img
          src={photo ?? undefined}
          alt="Photo capturée"
          className="aspect-[3/4] w-full object-cover sm:aspect-video"
        />
      </div>
      {resultNode && photo ? (
        resultNode(photo, reset)
      ) : (
        <div className="flex items-center justify-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={reset}
            className="min-h-[44px] rounded-full border-gray-300 bg-white px-5 text-gray-900 hover:bg-gray-50 hover:text-gray-900 dark:bg-white dark:border-gray-300 dark:hover:bg-gray-50"
            aria-label="Reprendre la photo"
          >
            Reprendre
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!photo || !onConfirmed}
            onClick={() => photo && onConfirmed?.(photo)}
            className="min-h-[44px] rounded-full bg-[#C21F26] px-5 font-semibold text-white hover:bg-[#a81a20]"
            aria-label="Utiliser cette photo"
          >
            ✓ Utiliser
          </Button>
        </div>
      )}
    </div>
  );
}

// =============================================================
// ShieldCapture — session CHECK-IN / CHECK-OUT en 90 secondes
// =============================================================

export interface ShieldCaptureZone {
  id: string;
  name: string;
  referencePhoto: string;
}

export interface ShieldCaptureDoneResult {
  sessionRef: string;
  pdfUrl: string;
  videoToken: string | null;
}

interface ShieldCaptureProps {
  property: { id: string; propertyName: string };
  zones: ShieldCaptureZone[];
  type: 'CHECK_IN' | 'CHECK_OUT';
  agentName: string;
  onClose: () => void;
  onDone: (r: ShieldCaptureDoneResult) => void;
}

interface ShotState {
  photo: string;
  status: ShieldZoneStatus;
  comment: string;
}

export function ShieldCapture({
  property,
  zones,
  type,
  agentName,
  onClose,
  onDone,
}: ShieldCaptureProps) {
  const [stage, setStage] = useState<'zones' | 'video' | 'success'>('zones');
  const [stepIdx, setStepIdx] = useState(0);
  const [shots, setShots] = useState<Record<string, ShotState>>({});
  const [sending, setSending] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [subRequired, setSubRequired] = useState(false);
  const [quitArmed, setQuitArmed] = useState(false);
  const [result, setResult] = useState<ShieldCaptureDoneResult & { videoSha256: string | null } | null>(
    null,
  );
  const quitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (quitTimer.current) clearTimeout(quitTimer.current);
    };
  }, []);

  const isCheckIn = type === 'CHECK_IN';
  const total = zones.length;
  const zone = zones[stepIdx];
  const shot = zone ? shots[zone.id] : undefined;
  const canNext = Boolean(shot && (shot.status === 'IMPECCABLE' || shot.comment.trim().length > 0));

  const armQuit = () => {
    if (quitArmed) {
      onClose();
      return;
    }
    setQuitArmed(true);
    if (quitTimer.current) clearTimeout(quitTimer.current);
    quitTimer.current = setTimeout(() => setQuitArmed(false), 4000);
  };

  const setShotFor = (zoneId: string, patch: Partial<ShotState>) => {
    setShots((prev) => ({
      ...prev,
      [zoneId]: {
        photo: prev[zoneId]?.photo ?? '',
        status: prev[zoneId]?.status ?? 'IMPECCABLE',
        comment: prev[zoneId]?.comment ?? '',
        ...patch,
      },
    }));
  };

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const scrollTop = () => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goNext = () => {
    if (!canNext) return;
    if (stepIdx + 1 < total) {
      setStepIdx(stepIdx + 1);
    } else {
      setStage('video');
    }
    scrollTop();
  };

  const goPrevZone = () => {
    if (stepIdx > 0) setStepIdx(stepIdx - 1);
    scrollTop();
  };

  // ---------- Vidéo walkthrough ----------
  const [videoState, setVideoState] = useState<{
    mimeType: string;
    durationSec: number;
    dataBase64: string;
    previewUrl: string;
  } | null>(null);
  const [recState, setRecState] = useState<'idle' | 'recording' | 'preview'>('idle');
  const [remaining, setRemaining] = useState(VIDEO_TARGET_SEC);
  const [camUnavailable, setCamUnavailable] = useState(false);

  // Invité optionnel — le certificat PDF final lui sera aussi envoyé
  // par email (pièce jointe) dès la fin de la session.
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestOpen, setGuestOpen] = useState(false);

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const previewUrlRef = useRef<string | null>(null);

  const clearVideoTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const teardownVideo = useCallback(() => {
    clearVideoTimer();
    stopStream(streamRef.current);
    streamRef.current = null;
    if (recRef.current && recRef.current.state !== 'inactive') {
      try {
        recRef.current.stop();
      } catch {
        /* déjà arrêté */
      }
    }
    recRef.current = null;
  }, []);

  useEffect(() => teardownVideo, [teardownVideo]);

  const handleBlob = async (blob: Blob, mimeType: string, elapsed: number) => {
    if (blob.size > VIDEO_MAX_BYTES) {
      toast.error('Vidéo trop lourde, refaites-la (60 s max).');
      setRecState('idle');
      return;
    }
    try {
      const base64 = await blobToBase64(blob);
      const url = URL.createObjectURL(blob);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = url;
      setVideoState({
        mimeType: mimeType || blob.type || 'video/webm',
        durationSec: Math.max(3, Math.round(elapsed)),
        dataBase64: base64,
        previewUrl: url,
      });
      setRecState('preview');
    } catch {
      toast.error('Lecture de la vidéo impossible — refaites l\u2019enregistrement.');
      setRecState('idle');
    }
  };

  const startRecording = async () => {
    setInlineError(null);
    if (videoState) {
      // Reprise → remise à zéro de l'aperçu précédent.
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
      setVideoState(null);
    }
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('indisponible');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      const mimeType = pickVideoMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const elapsed = (Date.now() - startedAtRef.current) / 1000;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || 'video/webm' });
        teardownVideo();
        void handleBlob(blob, mimeType ?? '', elapsed);
      };
      recRef.current = recorder;
      startedAtRef.current = Date.now();
      recorder.start(1000);
      setRecState('recording');
      setRemaining(VIDEO_TARGET_SEC);
      timerRef.current = setInterval(() => {
        const left = VIDEO_TARGET_SEC - Math.round((Date.now() - startedAtRef.current) / 1000);
        if (left <= 0) {
          stopRecording();
          return;
        }
        setRemaining(left);
      }, 1000);
    } catch {
      teardownVideo();
      setCamUnavailable(true);
      toast.error('Caméra vidéo indisponible — choisissez une vidéo depuis vos fichiers.');
    }
  };

  const stopRecording = () => {
    const rec = recRef.current;
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop();
      } catch {
        /* noop */
      }
    }
    clearVideoTimer();
  };

  const onPickVideoFile = async (file: File | undefined) => {
    if (!file) return;
    setInlineError(null);
    if (file.size > VIDEO_MAX_BYTES) {
      toast.error('Vidéo trop lourde, refaites-la (60 s max).');
      return;
    }
    // Durée réelle via les métadonnées (fallback 60 s).
    let duration = 60;
    try {
      duration = await new Promise<number>((resolve) => {
        const url = URL.createObjectURL(file);
        const probe = document.createElement('video');
        probe.preload = 'metadata';
        probe.onloadedmetadata = () => {
          const d = Number.isFinite(probe.duration) ? probe.duration : 60;
          URL.revokeObjectURL(url);
          resolve(Math.max(3, Math.round(d)));
        };
        probe.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(60);
        };
        probe.src = url;
      });
    } catch {
      duration = 60;
    }
    await handleBlob(file, file.type, duration);
  };

  // ---------- Envoi ----------
  const submit = async () => {
    if (sending) return;
    if (!videoState) {
      toast.error('Enregistrez la vidéo walkthrough avant de terminer.');
      return;
    }
    const missing = zones.filter((z) => !shots[z.id]?.photo);
    if (missing.length > 0) {
      toast.error(`${missing.length} zone(s) sans photo — complétez avant l'envoi.`);
      setStage('zones');
      return;
    }
    setSending(true);
    setInlineError(null);
    try {
      const res = await fetch('/api/shield/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId: property.id,
          type,
          agentName,
          guestName: guestName.trim() ? guestName.trim() : null,
          guestEmail: guestEmail.trim() ? guestEmail.trim() : null,
          shots: zones.map((z) => ({
            zoneId: z.id,
            photo: shots[z.id].photo,
            status: shots[z.id].status,
            comment: shots[z.id].comment.trim() ? shots[z.id].comment.trim() : null,
          })),
          video: {
            mimeType: videoState.mimeType,
            durationSec: videoState.durationSec,
            dataBase64: videoState.dataBase64,
          },
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            message?: string;
            session?: {
              sessionRef: string;
              videoToken: string | null;
              videoSha256: string | null;
            };
            pdfUrl?: string;
          }
        | null;
      if (!res.ok || !json?.ok || !json.session) {
        if (res.status === 403 && json?.error === 'abonnement_requis') {
          setSubRequired(true);
          setInlineError(json.message ?? 'Abonnement requis pour générer un certificat.');
          return;
        }
        const msg = json?.message ?? json?.error ?? `Envoi impossible (HTTP ${res.status}).`;
        setInlineError(msg);
        toast.error(msg);
        return;
      }
      const done = {
        sessionRef: json.session.sessionRef,
        pdfUrl: json.pdfUrl ?? `/api/shield/pdf/session/${json.session.sessionRef}`,
        videoToken: json.session.videoToken,
        videoSha256: json.session.videoSha256,
      };
      setResult(done);
      setStage('success');
      window.scrollTo({ top: 0 });
    } catch {
      const msg = 'Envoi impossible — vérifiez votre connexion puis réessayez.';
      setInlineError(msg);
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  // ---------- Rendu ----------
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="left-0 top-0 h-dvh w-full max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-none border-0 bg-slate-50 p-0 text-gray-900 duration-200 sm:max-w-none"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">
          Session Bouclier — {isCheckIn ? 'check-in' : 'check-out'} de {property.propertyName}
        </DialogTitle>
        <div
          ref={scrollRef}
          className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-4 pb-10 pt-4 sm:px-6"
        >
          {/* ----- Barre supérieure ----- */}
          <div className="flex items-center gap-3">
            <span
              className={cn(
                'inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em]',
                isCheckIn
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-red-200 bg-red-50 text-[#C21F26]',
              )}
            >
              {isCheckIn ? 'Check-in' : 'Check-out'} — 90 s
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-gray-600">{property.propertyName}</span>
            <button
              type="button"
              onClick={armQuit}
              className={cn(
                'inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3 text-[11px] font-bold uppercase tracking-[0.08em] transition-colors',
                quitArmed
                  ? 'border-red-600 bg-red-600 text-white hover:bg-red-700'
                  : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900',
              )}
              aria-label={quitArmed ? 'Confirmer l\u2019annulation de la session' : 'Annuler la session'}
            >
              {quitArmed ? 'Confirmer ?' : 'Quitter'}
            </button>
          </div>

          {/* ================= STAGE : ZONES ================= */}
          {stage === 'zones' && zone ? (
            <motion.div
              key={`zone-${zone.id}`}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="mt-5 flex flex-1 flex-col"
            >
              {/* En-tête zone + progression */}
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="lux-display text-lg font-semibold text-gray-900 sm:text-xl">
                  Zone {stepIdx + 1}/{total} — <span className="text-[#C21F26]">{zone.name}</span>
                </h2>
                <span className="text-[11px] text-gray-500">Agent : {agentName}</span>
              </div>
              {stepIdx > 0 ? (
                <button
                  type="button"
                  onClick={goPrevZone}
                  className="mt-1 inline-flex min-h-[44px] items-center rounded-full px-2 text-xs font-semibold text-gray-600 transition-colors hover:text-gray-900 sm:min-h-0"
                  aria-label={`Revenir à la zone précédente (${stepIdx}/${total})`}
                >
                  ← Zone précédente
                </button>
              ) : null}
              <div
                className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-200"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={stepIdx + 1}
                aria-label={`Progression des zones (${stepIdx + 1}/${total})`}
              >
                <div
                  className="h-full rounded-full bg-[#C21F26] transition-all duration-300"
                  style={{ width: `${((stepIdx + 1) / total) * 100}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Alignez votre cadrage sur le fantôme d&apos;angle (photo de référence) puis capturez.
              </p>

              <div className="mt-4">
                <ShieldPhotoCapture
                  key={zone.id}
                  ghostPhoto={zone.referencePhoto}
                  initialPhoto={shot?.photo}
                  onShot={(photo) => setShotFor(zone.id, { photo })}
                  resultNode={(photo, reset) => (
                    <div className="space-y-3">
                      {/* Statut segmenté */}
                      <div
                        className="grid grid-cols-3 gap-2"
                        role="radiogroup"
                        aria-label={`État de la zone ${zone.name}`}
                      >
                        {SHIELD_ZONE_STATUSES.map((s) => {
                          const active = (shot?.status ?? 'IMPECCABLE') === s;
                          const meta = STATUS_META[s];
                          return (
                            <button
                              key={s}
                              type="button"
                              role="radio"
                              aria-checked={active}
                              onClick={() => setShotFor(zone.id, { status: s, photo })}
                              className={cn(
                                'min-h-[44px] rounded-xl border px-2 text-[11px] font-bold tracking-wide transition-colors',
                                active ? meta.selected : meta.idle,
                              )}
                            >
                              {meta.label}
                            </button>
                          );
                        })}
                      </div>

                      {/* Commentaire obligatoire si ≠ IMPECCABLE */}
                      {(shot?.status ?? 'IMPECCABLE') !== 'IMPECCABLE' ? (
                        <div className="space-y-1.5">
                          <label
                            htmlFor={`comment-${zone.id}`}
                            className="text-[11px] font-bold uppercase tracking-[0.08em] text-amber-700"
                          >
                            Commentaire obligatoire
                          </label>
                          <Textarea
                            id={`comment-${zone.id}`}
                            value={shot?.comment ?? ''}
                            onChange={(e) => setShotFor(zone.id, { comment: e.target.value, photo })}
                            placeholder="Décrivez le constat…"
                            rows={3}
                            className="resize-none border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus-visible:border-[#C21F26] focus-visible:ring-2 focus-visible:ring-[#C21F26]/30 dark:bg-white"
                          />
                        </div>
                      ) : null}

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShots((prev) => {
                              const next = { ...prev };
                              delete next[zone.id];
                              return next;
                            });
                            reset();
                          }}
                          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-gray-300 bg-white px-4 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900"
                          aria-label={`Reprendre la photo de la zone ${zone.name}`}
                        >
                          <RotateCcw className="size-3.5" aria-hidden="true" /> Reprendre
                        </button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={goNext}
                          disabled={!canNext}
                          className="min-h-[44px] rounded-full bg-[#C21F26] px-6 font-bold text-white hover:bg-[#a81a20] disabled:opacity-50"
                          aria-label={
                            stepIdx + 1 < total
                              ? `Passer à la zone suivante (${stepIdx + 2}/${total})`
                              : 'Passer à la vidéo walkthrough'
                          }
                        >
                          {stepIdx + 1 < total ? 'Zone suivante →' : 'Vidéo walkthrough →'}
                        </Button>
                      </div>
                    </div>
                  )}
                />
              </div>
            </motion.div>
          ) : null}

          {/* ================= STAGE : VIDÉO ================= */}
          {stage === 'video' ? (
            <motion.div
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="mt-5 flex flex-1 flex-col"
            >
              <p className="text-[10.5px] font-bold uppercase tracking-[0.24em] text-[#C21F26]">Dernière étape — la preuve reine</p>
              <h2 className="lux-display mt-1 text-lg font-semibold text-gray-900 sm:text-xl">
                VIDÉO WALKTHROUGH — JUSQU&apos;À 60 SECONDES
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                Traversez toutes les pièces EN CONTINU (salon → couloir → chambres → cuisine →
                toilette) : cette traversée ininterrompue est la preuve inattaquable de
                re-validation. Elle est scellée (hash SHA-256) avec le certificat.
              </p>

              <div className="mt-4">
                {recState === 'idle' ? (
                  <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-gray-300 bg-white px-4 py-8 shadow-sm">
                    <button
                      type="button"
                      onClick={() => void startRecording()}
                      className="flex size-20 items-center justify-center rounded-full bg-[#C21F26] shadow-[0_0_0_8px_rgba(194,31,38,0.18)] transition-transform active:scale-95"
                      aria-label="Démarrer l'enregistrement vidéo (jusqu'à 60 secondes)"
                    >
                      <span aria-hidden="true" className="size-7 rounded-sm bg-white" />
                    </button>
                    <p className="text-sm font-semibold text-gray-900">REC — appuyez pour démarrer</p>
                    <p className="text-[11px] text-gray-500">Arrêt automatique à 60 s</p>
                    <label className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full border border-gray-300 bg-white px-4 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900">
                      <FileVideo className="size-4" aria-hidden="true" /> ou choisir une vidéo
                      <input
                        type="file"
                        accept="video/*"
                        className="sr-only"
                        onChange={(e) => {
                          void onPickVideoFile(e.target.files?.[0]);
                          e.currentTarget.value = '';
                        }}
                      />
                    </label>
                    {camUnavailable ? (
                      <p className="text-[11px] font-medium text-amber-700" role="note">
                        Caméra vidéo indisponible sur cet appareil — la sélection de fichier est la
                        voie à suivre.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {recState === 'recording' ? (
                  <div className="relative overflow-hidden rounded-2xl border border-red-300 bg-black shadow-sm">
                    <VideoLivePreview streamRef={streamRef} />
                    {/* Compte à rebours circulaire */}
                    <div className="absolute right-3 top-3">
                      <CountdownCircle remaining={remaining} total={VIDEO_TARGET_SEC} />
                    </div>
                    <div className="absolute inset-x-0 bottom-3 flex justify-center">
                      <button
                        type="button"
                        onClick={stopRecording}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-white px-5 text-xs font-bold uppercase tracking-[0.1em] text-black transition-colors hover:bg-white/90"
                        aria-label="Arrêter l'enregistrement"
                      >
                        <Square className="size-4 fill-black" aria-hidden="true" /> Stop
                      </button>
                    </div>
                  </div>
                ) : null}

                {recState === 'preview' && videoState ? (
                  <div className="space-y-3">
                    <div className="overflow-hidden rounded-2xl border border-gray-300 bg-black shadow-sm">
                      <video
                        src={videoState.previewUrl}
                        controls
                        playsInline
                        className="aspect-video w-full"
                        aria-label="Aperçu de la vidéo walkthrough"
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => void startRecording()}
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-gray-300 bg-white px-4 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900"
                        aria-label="Refaire la vidéo walkthrough"
                      >
                        <RotateCcw className="size-3.5" aria-hidden="true" /> Refaire
                      </button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void submit()}
                        disabled={sending}
                        className="min-h-[44px] rounded-full bg-[#C21F26] px-6 font-bold text-white hover:bg-[#a81a20] disabled:opacity-60"
                        aria-label="Terminer et générer le certificat"
                      >
                        {sending ? (
                          <>
                            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Envoi en
                            cours…
                          </>
                        ) : (
                          'Terminer et générer le certificat'
                        )}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Invité optionnel — envoi du certificat par email */}
              <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <button
                  type="button"
                  onClick={() => setGuestOpen((v) => !v)}
                  aria-expanded={guestOpen}
                  className="flex min-h-[44px] w-full items-center justify-between gap-2 text-left"
                >
                  <span className="text-xs font-bold uppercase tracking-[0.08em] text-gray-900">
                    Envoyer aussi l&apos;attestation à l&apos;invité
                  </span>
                  <span
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors',
                      guestEmail.trim()
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-gray-200 bg-gray-50 text-gray-500',
                    )}
                  >
                    {guestEmail.trim() ? 'Actif' : 'Optionnel'}
                  </span>
                </button>
                {guestOpen ? (
                  <div className="mt-3 space-y-2.5">
                    <p className="text-[11px] leading-relaxed text-gray-500">
                      Le certificat PDF final (bibliothèque de référence + attestation) sera envoyé
                      automatiquement par email à l&apos;hôte{guestEmail.trim() ? ' ET à cet invité' : ''}.
                    </p>
                    <div>
                      <label htmlFor="shield-guest-name" className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-600">
                        Nom de l&apos;invité
                      </label>
                      <input
                        id="shield-guest-name"
                        type="text"
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        placeholder="Ex. Marie Diallo"
                        maxLength={80}
                        className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus-visible:border-[#C21F26] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C21F26]/30 dark:bg-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="shield-guest-email" className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-600">
                        Email de l&apos;invité
                      </label>
                      <input
                        id="shield-guest-email"
                        type="email"
                        inputMode="email"
                        value={guestEmail}
                        onChange={(e) => setGuestEmail(e.target.value)}
                        placeholder="Ex. marie@exemple.com"
                        maxLength={160}
                        className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus-visible:border-[#C21F26] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C21F26]/30 dark:bg-white"
                      />
                      {guestEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim()) ? (
                        <p className="mt-1 text-[10px] font-semibold text-amber-700" role="note">
                          Email invalide — le certificat ne partira qu&apos;à l&apos;hôte.
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Erreurs inline (envoi / abonnement) */}
              {inlineError ? (
                <div
                  role="alert"
                  className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
                >
                  <p className="font-semibold">{inlineError}</p>
                  {subRequired ? (
                    <Link
                      href="/edl/abonnement"
                      className="mt-2 inline-flex min-h-[44px] items-center rounded-full bg-[#C21F26] px-4 text-xs font-bold text-white hover:bg-[#a81a20]"
                    >
                      Renouveler l&apos;abonnement
                    </Link>
                  ) : null}
                </div>
              ) : null}

              {sending && recState !== 'preview' ? (
                <p className="mt-4 flex items-center gap-2 text-sm text-gray-600" role="status">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Génération du
                  certificat… l&apos;envoi de la vidéo peut prendre quelques secondes.
                </p>
              ) : null}

              <div className="mt-auto pt-6">
                <button
                  type="button"
                  onClick={() => {
                    setStage('zones');
                    setStepIdx(total - 1);
                  }}
                  className="inline-flex min-h-[44px] items-center rounded-full px-3 text-xs font-semibold text-gray-600 transition-colors hover:text-gray-900"
                  aria-label="Revenir aux zones"
                >
                  ← Revoir les zones
                </button>
              </div>
            </motion.div>
          ) : null}

          {/* ================= STAGE : SUCCÈS ================= */}
          {stage === 'success' && result ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center"
            >
              <CheckCircle2 className="size-14 text-emerald-600" aria-hidden="true" />
              <h2 className="lux-display text-xl font-semibold text-gray-900 sm:text-2xl">
                Session enregistrée — certificat généré
              </h2>
              <span
                className={cn(
                  'inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em]',
                  isCheckIn
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-red-200 bg-red-50 text-[#C21F26]',
                )}
              >
                {isCheckIn ? 'Check-in' : 'Check-out'}
              </span>
              <p
                className="rounded-xl border border-[#C21F26]/30 bg-red-50 px-5 py-3 font-mono text-lg font-bold tracking-wider text-[#C21F26] sm:text-xl"
                aria-label="Référence de la session"
              >
                {result.sessionRef}
              </p>
              {result.videoSha256 ? (
                <p className="font-mono text-[11px] text-gray-500" aria-label="Empreinte de la vidéo">
                  sha256: {result.videoSha256.slice(0, 8)}…
                </p>
              ) : null}
              <p
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[11px] font-semibold text-emerald-700"
                role="status"
              >
                Certificat PDF envoyé par email à l&apos;hôte{guestEmail.trim() ? ` et à ${guestEmail.trim()}` : ''}.
              </p>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                <a
                  href={result.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] items-center rounded-full border border-gray-300 bg-white px-5 text-sm font-bold text-gray-900 shadow-sm transition-colors hover:bg-gray-50"
                  aria-label="Ouvrir le certificat PDF de la session"
                >
                  Ouvrir le PDF
                </a>
                {result.videoToken ? (
                  <a
                    href={`/shield/video/${result.videoToken}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[44px] items-center rounded-full border border-gray-300 bg-white px-5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900"
                    aria-label="Voir la vidéo walkthrough"
                  >
                    Voir la vidéo
                  </a>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onDone(result)}
                  className="min-h-[44px] rounded-full bg-[#C21F26] px-6 font-bold text-white hover:bg-[#a81a20]"
                  aria-label="Terminer la session"
                >
                  Terminer
                </Button>
              </div>
            </motion.div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Sous-composants vidéo ----------

/** Flux caméra live monté pendant l'enregistrement. */
function VideoLivePreview({ streamRef }: { streamRef: RefObject<MediaStream | null> }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const video = ref.current;
    const stream = streamRef.current;
    if (video && stream) {
      video.srcObject = stream;
      void video.play().catch(() => undefined);
    }
  }, [streamRef]);
  return (
    <video
      ref={ref}
      muted
      playsInline
      autoPlay
      className="aspect-video w-full object-cover"
      aria-label="Enregistrement en cours"
    />
  );
}

/** Cercle de compte à rebours (jusqu'à 60 s) — SVG sans dépendance. */
function CountdownCircle({ remaining, total }: { remaining: number; total: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, remaining / total));
  return (
    <div className="relative size-16" role="timer" aria-label={`${remaining} secondes restantes`}>
      <svg viewBox="0 0 64 64" className="size-16 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="rgba(0,0,0,0.55)" stroke="rgba(255,255,255,0.2)" strokeWidth="4" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke="#C21F26"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: 'stroke-dashoffset 1s linear' }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-sm font-bold text-white">
        {remaining}
      </span>
    </div>
  );
}
