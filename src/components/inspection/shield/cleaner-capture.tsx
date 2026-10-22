'use client';

// =============================================================
// ROOMSCAN BOUCLIER V2 — FLUX A « APP CLEANER » (page publique).
//
// Ouverte via le lien magique /s/[token] partagé par l'hôte
// (WhatsApp/SMS) à son agent de ménage. AUCUN compte requis :
//  1. INTRO   — récap du séjour (logement, type, date, invité) +
//               saisie du nom de l'agent (traçabilité) ;
//  2. ZONES   — les N zones du logement, chacune photographiée
//               au MÊME ANGLE que son fantôme de référence
//               (statut + commentaire obligatoire si ≠ impeccable) ;
//  3. VIDÉO   — walkthrough en CONTINU jusqu'à 120 s (preuve reine) ;
//  4. SUCCÈS  — référence de session + hôte notifié (PDF par email).
//
// La capture CONSOMME la session planifiée (A_VENIR → TERMINE) via
// /api/shield/cleaner/[token] — le token magique EST l'autorisation.
// Thème clair (fond slate-50, cartes blanches) · rouge bouclier #C21F26.
// =============================================================
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Home,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Square,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { SHIELD_ZONE_STATUSES, type ShieldZoneStatus } from '@/lib/shield-refs';
import type { CleanerSessionView } from '@/lib/shield-cleaner';
import {
  CountdownCircle,
  ShieldPhotoCapture,
  ShieldVideoPicker,
  STATUS_META,
  VideoLivePreview,
  cleanVideoMime,
  fmtDuration,
  probeVideoDuration,
  processVideoFile,
  reencodeVideo,
} from './shield-capture';
import { blobToBase64 } from './shield-photo';

const VIDEO_TARGET_SEC = 120; // master prompt : walkthrough ≤ 120 s
const VIDEO_MAX_BYTES = 20_000_000; // garde-fou client (< 22 Mo serveur)

type Stage = 'intro' | 'zones' | 'video' | 'success';

interface ShotState {
  photo: string;
  status: ShieldZoneStatus;
  comment: string;
}

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

const dtf = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

export default function CleanerCapture({ data }: { data: CleanerSessionView }) {
  const isCheckIn = data.type === 'CHECK_IN';
  const total = data.zones.length;

  const [stage, setStage] = useState<Stage>('intro');
  const [agentName, setAgentName] = useState('');
  const [stepIdx, setStepIdx] = useState(0);
  const [shots, setShots] = useState<Record<string, ShotState>>({});
  const [sending, setSending] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [result, setResult] = useState<{ sessionRef: string; videoSha256: string | null } | null>(
    null,
  );

  const zone = data.zones[stepIdx];
  const shot = zone ? shots[zone.id] : undefined;
  const canNext = Boolean(shot && (shot.status === 'IMPECCABLE' || shot.comment.trim().length > 0));

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
  const scrollTop = () => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });

  const goNext = () => {
    if (!canNext) return;
    if (stepIdx + 1 < total) setStepIdx(stepIdx + 1);
    else setStage('video');
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
  const [recState, setRecState] = useState<'idle' | 'recording' | 'processing' | 'preview'>('idle');
  const [remaining, setRemaining] = useState(VIDEO_TARGET_SEC);
  const [camUnavailable, setCamUnavailable] = useState(false);
  // FIX-CAPTURE-V38 : à mi-temps (60 s sur 120), l'utilisateur peut
  // arrêter tout de suite ou continuer jusqu'à l'arrêt automatique.
  const [halfPrompt, setHalfPrompt] = useState(false);

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // FIX-CAPTURE-V38 : arrêt automatique DUR (setTimeout) en plus du
  // décompte — immunisé contre le throttling des setInterval.
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtRef = useRef(0);
  const previewUrlRef = useRef<string | null>(null);

  const clearVideoTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
    stopTimeoutRef.current = null;
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
    setRecState('processing');
    try {
      let cur = {
        blob,
        mimeType: mimeType || blob.type || 'video/webm',
        durationSec: Math.max(3, Math.round(elapsed)),
      };
      // FIX-CAPTURE-V38 : trop lourde → ré-encodage automatique au lieu
      // d'un refus sec qui laissait l'agent sans bouton de validation.
      if (cur.blob.size > VIDEO_MAX_BYTES) {
        toast.info('Vidéo compressée automatiquement…');
        const out = await reencodeVideo(cur.blob, VIDEO_TARGET_SEC);
        cur = { blob: out.blob, mimeType: out.mimeType, durationSec: out.durationSec };
      }
      if (cur.blob.size > VIDEO_MAX_BYTES) {
        toast.error('Vidéo toujours trop lourde — refaites-la plus courte.');
        setRecState('idle');
        return;
      }
      const base64 = await blobToBase64(cur.blob);
      const url = URL.createObjectURL(cur.blob);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = url;
      setVideoState({
        mimeType: cur.mimeType,
        durationSec: cur.durationSec,
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
      // FIX-CAPTURE-V38 : bitrate plafonné (~1 Mbps → 120 s ≈ 15 Mo) pour
      // que la vidéo live reste toujours sous la limite de taille.
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 1_000_000,
      });
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
      setHalfPrompt(false);
      // FIX-CAPTURE-V38 : arrêt automatique à 120 s (timeout dur + décompte).
      stopTimeoutRef.current = setTimeout(
        () => stopRecording(),
        (VIDEO_TARGET_SEC + 1.5) * 1000,
      );
      timerRef.current = setInterval(() => {
        const left = VIDEO_TARGET_SEC - Math.round((Date.now() - startedAtRef.current) / 1000);
        if (left <= 0) {
          stopRecording();
          return;
        }
        if (left <= Math.floor(VIDEO_TARGET_SEC / 2)) setHalfPrompt(true);
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
    const duration = await probeVideoDuration(file, VIDEO_TARGET_SEC);
    if (duration > 180) {
      toast.error('Vidéo trop longue (max 3 minutes) — refaites-la plus courte.');
      return;
    }
    // FIX-CAPTURE-V38 (v4.153) : plus aucun refus sec pour taille/durée —
    // la vidéo est coupée à 120 s et compressée automatiquement (le
    // « système arrête de filmer » à la cible), le flux aboutit toujours
    // au bouton de validation.
    setRecState('processing');
    try {
      const out = await processVideoFile(file, {
        targetSec: VIDEO_TARGET_SEC,
        maxBytes: VIDEO_MAX_BYTES,
      });
      if (out.trimmed) {
        toast.info(`Vidéo ajustée à ${fmtDuration(out.durationSec)} — cible ${VIDEO_TARGET_SEC} s.`);
      } else if (out.compressed) {
        toast.info('Vidéo compressée automatiquement.');
      }
      await handleBlob(out.blob, out.mimeType, out.durationSec);
    } catch {
      toast.error('Vidéo illisible sur cet appareil — refaites-la avec le bouton « Enregistrer la vidéo ».');
      setRecState('idle');
    }
  };

  // ---------- Envoi (consomme la session planifiée) ----------
  const submit = async () => {
    if (sending) return;
    if (!videoState) {
      toast.error('Enregistrez la vidéo walkthrough avant de terminer.');
      return;
    }
    const missing = data.zones.filter((z) => !shots[z.id]?.photo);
    if (missing.length > 0) {
      toast.error(`${missing.length} zone(s) sans photo — complétez avant l'envoi.`);
      setStage('zones');
      return;
    }
    setSending(true);
    setInlineError(null);
    try {
      const res = await fetch(`/api/shield/cleaner/${data.token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentName: agentName.trim(),
          shots: data.zones.map((z) => ({
            zoneId: z.id,
            photo: shots[z.id].photo,
            status: shots[z.id].status,
            comment: shots[z.id].comment.trim() ? shots[z.id].comment.trim() : null,
          })),
          video: {
            mimeType: cleanVideoMime(videoState.mimeType),
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
            session?: { sessionRef: string; videoSha256: string | null };
          }
        | null;
      if (!res.ok || !json?.ok || !json.session) {
        if (res.status === 409 && (json?.error === 'already_done' || json?.error === 'cancelled')) {
          toast.error(json.message ?? 'Cette session n\u2019est plus à réaliser.');
          setInlineError(json.message ?? 'Cette session n\u2019est plus à réaliser.');
          return;
        }
        const msg = json?.message ?? json?.error ?? `Envoi impossible (HTTP ${res.status}).`;
        setInlineError(msg);
        toast.error(msg);
        return;
      }
      setResult({ sessionRef: json.session.sessionRef, videoSha256: json.session.videoSha256 ?? null });
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

  const scheduledLabel = data.scheduledDate ? dtf.format(new Date(data.scheduledDate)) : null;
  const late = data.effectiveStatus === 'EN_RETARD';

  // ---------- Rendu ----------
  return (
    <div
      ref={scrollRef}
      className="min-h-dvh bg-slate-50 pb-16 text-gray-900"
    >
      {/* ----- Bandeau supérieur ----- */}
      <header className="border-b border-gray-200 bg-white px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#1e3a8a] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white">
            <ShieldCheck className="size-3.5" aria-hidden="true" /> Inventaire
          </span>
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
          {late ? (
            <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-red-600">
              En retard
            </span>
          ) : null}
          <span className="min-w-0 flex-1 truncate text-right text-xs font-semibold text-gray-600">
            {data.propertyName}
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 pt-5 sm:px-6">
        {/* ================= STAGE : INTRO ================= */}
        {stage === 'intro' ? (
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="space-y-4"
          >
            <h1 className="lux-display text-xl font-semibold text-gray-900 sm:text-2xl">
              Intervention de ménage — <span className="text-[#C21F26]">suivez le guide</span>
            </h1>
            <p className="text-sm leading-relaxed text-gray-600">
              Vous avez été invité par l&apos;hôte de <strong>{data.propertyName}</strong> pour
              réaliser le {isCheckIn ? 'check-in (état des lieux d\u2019entrée)' : 'check-out (état des lieux de sortie)'}.
              La capture prend quelques minutes : {total} photos aux angles de référence puis une
              vidéo walkthrough de 2 minutes maximum.
            </p>

            {/* Récap du séjour */}
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-gray-900">Le séjour</h2>
              <dl className="mt-3 space-y-2.5 text-sm">
                <div className="flex items-start gap-2.5">
                  <Home className="mt-0.5 size-4 shrink-0 text-[#1e3a8a]" aria-hidden="true" />
                  <div>
                    <dt className="sr-only">Logement</dt>
                    <dd className="font-semibold text-gray-900">{data.propertyName}</dd>
                    <dd className="text-xs text-gray-500">{data.propertyAddress}</dd>
                  </div>
                </div>
                {scheduledLabel ? (
                  <div className="flex items-center gap-2.5">
                    <CalendarDays className="size-4 shrink-0 text-[#1e3a8a]" aria-hidden="true" />
                    <div>
                      <dt className="sr-only">Date prévue</dt>
                      <dd className="text-gray-700">
                        Prévu le <span className="font-semibold">{scheduledLabel}</span>
                        {late ? <span className="ml-2 font-bold text-red-600">— en retard</span> : null}
                      </dd>
                    </div>
                  </div>
                ) : null}
                {data.guestName ? (
                  <div className="flex items-center gap-2.5">
                    <User className="size-4 shrink-0 text-[#1e3a8a]" aria-hidden="true" />
                    <div>
                      <dt className="sr-only">Invité</dt>
                      <dd className="text-gray-700">
                        Invité : <span className="font-semibold">{data.guestName}</span>
                      </dd>
                    </div>
                  </div>
                ) : null}
              </dl>
            </div>

            {/* Zones à photographier */}
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-gray-900">
                Les {total} zones à photographier
              </h2>
              <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {data.zones.map((z, i) => (
                  <li key={z.id} className="overflow-hidden rounded-xl border border-gray-200 bg-slate-50">
                    <div className="relative aspect-[4/3] bg-black">
                      {z.referencePhoto ? (
                        <img
                          src={z.referencePhoto}
                          alt={`Photo de référence de la zone ${z.name}`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-widest text-white/50">
                          sans référence
                        </div>
                      )}
                      <span className="absolute left-1.5 top-1.5 rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-bold text-white">
                        {i + 1}
                      </span>
                    </div>
                    <p className="truncate px-2 py-1.5 text-[11px] font-semibold text-gray-700">{z.name}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] leading-relaxed text-gray-500">
                À chaque étape, superposez votre cadrage au <strong>fantôme d&apos;angle</strong>{' '}
                (photo de référence affichée en filigrane) : les documents restent comparables
                d&apos;un séjour à l&apos;autre.
              </p>
            </div>

            {/* Nom de l'agent */}
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <label
                htmlFor="cleaner-agent-name"
                className="text-xs font-bold uppercase tracking-[0.08em] text-gray-900"
              >
                Votre nom (il figurera sur le document)
              </label>
              <input
                id="cleaner-agent-name"
                type="text"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="Ex. Awa Ndiaye"
                maxLength={80}
                autoComplete="name"
                className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus-visible:border-[#C21F26] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C21F26]/30"
              />
            </div>

            <Button
              type="button"
              size="lg"
              disabled={agentName.trim().length < 2}
              onClick={() => {
                setStage('zones');
                scrollTop();
              }}
              className="min-h-[48px] w-full rounded-full bg-[#C21F26] text-base font-bold text-white hover:bg-[#a81a20] disabled:opacity-50"
              aria-label="Démarrer la capture des zones"
            >
              Démarrer la capture
            </Button>
            <p className="text-center text-[11px] text-gray-500">
              En démarrant, vous certifiez que les photos et la vidéo sont prises sur place, à
              l&apos;instant de l&apos;envoi.
            </p>
          </motion.section>
        ) : null}

        {/* ================= STAGE : ZONES ================= */}
        {stage === 'zones' && zone ? (
          <motion.section
            key={`zone-${zone.id}`}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="flex flex-col"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="lux-display text-lg font-semibold text-gray-900 sm:text-xl">
                Zone {stepIdx + 1}/{total} — <span className="text-[#C21F26]">{zone.name}</span>
              </h2>
              <span className="text-[11px] text-gray-500">Agent : {agentName.trim()}</span>
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
                          className="resize-none border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus-visible:border-[#C21F26] focus-visible:ring-2 focus-visible:ring-[#C21F26]/30"
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
          </motion.section>
        ) : null}

        {/* ================= STAGE : VIDÉO ================= */}
        {stage === 'video' ? (
          <motion.section
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="flex flex-col"
          >
            <p className="text-[10.5px] font-bold uppercase tracking-[0.24em] text-[#C21F26]">
              Dernière étape — la preuve reine
            </p>
            <h2 className="lux-display mt-1 text-lg font-semibold text-gray-900 sm:text-xl">
              VIDÉO WALKTHROUGH — JUSQU&apos;À 120 SECONDES
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Traversez toutes les pièces EN CONTINU : cette traversée ininterrompue est la preuve
              inattaquable de l&apos;état du logement. Elle est scellée (hash SHA-256) avec le
              certificat envoyé à l&apos;hôte.
            </p>

            <div className="mt-4">
              {recState === 'idle' ? (
                <ShieldVideoPicker
                  targetSec={VIDEO_TARGET_SEC}
                  onPickFile={(f) => void onPickVideoFile(f)}
                  onStartLive={() => void startRecording()}
                  camUnavailable={camUnavailable}
                />
              ) : null}

              {recState === 'recording' ? (
                <div className="space-y-3">
                  <div className="relative overflow-hidden rounded-2xl border border-red-300 bg-black shadow-sm">
                    <VideoLivePreview streamRef={streamRef} />
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
                  {/* FIX-CAPTURE-V38 : choix « arrêter ou continuer » à mi-temps (60 s) */}
                  {halfPrompt ? (
                    <div
                      className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-3"
                      role="status"
                    >
                      <p className="min-w-0 flex-1 text-xs font-semibold leading-relaxed text-amber-800">
                        60 secondes atteintes — vous pouvez arrêter ici, ou continuer jusqu&apos;à
                        120 s (arrêt automatique).
                      </p>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={stopRecording}
                          className="inline-flex min-h-[44px] items-center rounded-full bg-amber-600 px-4 text-xs font-bold text-white transition-colors hover:bg-amber-700"
                          aria-label="Arrêter l'enregistrement maintenant"
                        >
                          Arrêter
                        </button>
                        <button
                          type="button"
                          onClick={() => setHalfPrompt(false)}
                          className="inline-flex min-h-[44px] items-center rounded-full border border-amber-300 bg-white px-4 text-xs font-bold text-amber-800 transition-colors hover:bg-amber-100"
                          aria-label="Continuer jusqu'à 120 secondes"
                        >
                          Continuer
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* FIX-CAPTURE-V38 : traitement (coupure 120 s + compression) visible */}
              {recState === 'processing' ? (
                <div
                  className="flex flex-col items-center gap-2.5 rounded-2xl border border-gray-200 bg-white px-4 py-8 shadow-sm"
                  role="status"
                >
                  <Loader2 className="size-7 animate-spin text-[#C21F26]" aria-hidden="true" />
                  <p className="text-sm font-semibold text-gray-900">Préparation de la vidéo…</p>
                  <p className="max-w-xs text-center text-[11px] leading-relaxed text-gray-500">
                    Coupure à 2 minutes et compression automatique — gardez cette page ouverte
                    quelques instants.
                  </p>
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
                  {/* FIX-CAPTURE-V38 : récap de validation photos + vidéo */}
                  {(() => {
                    const photosOK = data.zones.filter((z) => shots[z.id]?.photo).length;
                    const complete = photosOK === total;
                    return (
                      <div
                        className={cn(
                          'rounded-2xl border p-3.5',
                          complete ? 'border-emerald-200 bg-emerald-50' : 'border-amber-300 bg-amber-50',
                        )}
                        role="status"
                      >
                        <p
                          className={cn(
                            'flex items-center gap-2 text-xs font-bold',
                            complete ? 'text-emerald-800' : 'text-amber-800',
                          )}
                        >
                          {complete ? (
                            <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
                          ) : (
                            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
                          )}
                          {photosOK}/{total} zones photographiées · vidéo{' '}
                          {fmtDuration(videoState.durationSec)} prête
                        </p>
                        <p
                          className={cn(
                            'mt-1 text-[11px] leading-relaxed',
                            complete ? 'text-emerald-700' : 'text-amber-700',
                          )}
                        >
                          {complete
                            ? 'Vérifiez l\u2019aperçu puis validez : tout sera scellé (SHA-256) et envoyé à l\u2019hôte.'
                            : 'Il manque des photos : « Revoir les zones » en bas de page pour compléter avant validation.'}
                        </p>
                      </div>
                    );
                  })()}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
                        previewUrlRef.current = null;
                        setVideoState(null);
                        setRecState('idle');
                      }}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-gray-300 bg-white px-4 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900"
                      aria-label="Refaire ou changer la vidéo walkthrough"
                    >
                      <RotateCcw className="size-3.5" aria-hidden="true" /> Refaire
                    </button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void submit()}
                      disabled={sending}
                      className="min-h-[52px] w-full rounded-full bg-[#C21F26] px-6 font-bold text-white hover:bg-[#a81a20] disabled:opacity-60 sm:w-auto"
                      aria-label="Valider les photos et la vidéo, terminer et notifier l'hôte"
                    >
                      {sending ? (
                        <>
                          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Envoi en
                          cours…
                        </>
                      ) : (
                        'Valider photos & vidéo ✓'
                      )}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>

            {inlineError ? (
              <div
                role="alert"
                className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
              >
                <p className="font-semibold">{inlineError}</p>
              </div>
            ) : null}

            {sending && recState !== 'preview' ? (
              <p className="mt-4 flex items-center gap-2 text-sm text-gray-600" role="status">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Envoi en cours…
                la vidéo peut prendre quelques secondes.
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
          </motion.section>
        ) : null}

        {/* ================= STAGE : SUCCÈS ================= */}
        {stage === 'success' && result ? (
          <motion.section
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="flex flex-col items-center justify-center gap-4 py-10 text-center"
          >
            <CheckCircle2 className="size-14 text-emerald-600" aria-hidden="true" />
            <h2 className="lux-display text-xl font-semibold text-gray-900 sm:text-2xl">
              Session enregistrée — merci {agentName.trim().split(' ')[0] ?? ''} !
            </h2>
            <span
              className={cn(
                'inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em]',
                isCheckIn
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-red-200 bg-red-50 text-[#C21F26]',
              )}
            >
              {isCheckIn ? 'Check-in' : 'Check-out'} — {data.propertyName}
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
              className="max-w-md rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[11px] font-semibold leading-relaxed text-emerald-700"
              role="status"
            >
              L&apos;hôte reçoit automatiquement le certificat PDF complet (photos de zones +
              vidéo scellée) par email. Vous pouvez fermer cette page.
            </p>
            <Link
              href="/"
              className="inline-flex min-h-[44px] items-center rounded-full border border-gray-300 bg-white px-5 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-900"
            >
              Retour à l&apos;accueil
            </Link>
          </motion.section>
        ) : null}
      </main>
    </div>
  );
}
