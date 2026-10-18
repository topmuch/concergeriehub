'use client';

// =============================================================
// VOICE REPLY BUTTON — le propriétaire répond par message vocal
// enregistré à un message de son invité.
//
// Flux : 🎙️ Répondre → enregistrement (timer 60 s) → STOP →
// PRÉ-ÉCOUTE locale (<audio> sur blob URL) → « Envoyer » ou
// « Réenregistrer » → POST /api/airbnb/voice-reply.
//
// Compatibilité Safari/iOS : mimeType choisi via pickRecorderMime()
// (webm/opus sur Chrome-Firefox, mp4/AAC sur Safari) — extension
// fichier alignée via extForMime().
// =============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Mic, RotateCcw, Send, Square } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { pickRecorderMime, extForMime } from '@/lib/voice-audio';

const MAX_SEC = 60;

interface VoiceReplyButtonProps {
  /** Id du message vocal invité auquel répondre (recommandé). */
  voiceMessageId?: string;
  /** Fallback : réponse générale sur le bien. */
  propertyId?: string;
  onSent?: () => void;
  /** Variante compacte (dialog du Hub). */
  compact?: boolean;
  /** FIX-32 — Mode Hôte du HUB (authentification par PIN, sans
   * session NextAuth) : slug du hub + PIN vérifié → l'envoi passe
   * par /api/public/hub/[slug]/host-reply (PIN bcrypt) au lieu de
   * /api/airbnb/voice-reply (session) qui renvoyait 401.
   */
  slug?: string;
  pin?: string;
}

export function VoiceReplyButton({
  voiceMessageId,
  propertyId,
  onSent,
  compact,
  slug,
  pin,
}: VoiceReplyButtonProps) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [ready, setReady] = useState<{ url: string; blob: Blob; mime: string; duration: number } | null>(null);
  const [sending, setSending] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef('audio/webm');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const secondsRef = useRef(0);
  const previewUrlRef = useRef<string | null>(null);

  const fullCleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    recorderRef.current?.stream?.getTracks?.().forEach((t) => t.stop());
    recorderRef.current = null;
    chunksRef.current = [];
    secondsRef.current = 0;
    setRecording(false);
    setSeconds(0);
    setReady((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
  }, []);

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    recorderRef.current?.stream?.getTracks?.().forEach((t) => t.stop());
  }, []);

  const startRecording = async () => {
    fullCleanup();
    // FIX-32 : messages d'erreur MICRO explicites — avant, tout echec
    // (permission refusée, micro occupé, navigateur non supporté)
    // affichait le même message générique « Micro inaccessible ».
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      toast.error(
        "L'enregistrement vocal n'est pas supporté par ce navigateur. Utilisez Chrome, Safari ou Edge récent.",
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickRecorderMime();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mimeRef.current = recorder.mimeType || mimeType || 'audio/webm';
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const mimeTypeReal = mimeRef.current.split(';')[0].trim() || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mimeTypeReal });
        if (blob.size === 0) {
          toast.error('Enregistrement vide. Réessayez.');
          return;
        }
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        setReady({ url, blob, mime: mimeTypeReal, duration: secondsRef.current });
      };
      recorder.start();
      recorderRef.current = recorder;
      secondsRef.current = 0;
      setSeconds(0);
      setRecording(true);
      timerRef.current = setInterval(() => {
        secondsRef.current += 1;
        setSeconds(secondsRef.current);
        if (secondsRef.current >= MAX_SEC) {
          stopRecording();
        }
      }, 1000);
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
        toast.error(
          'Micro refusé. Autorisez le microphone pour ce site (icône cadenas dans la barre d’adresse), puis réessayez.',
        );
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        toast.error('Aucun microphone détecté sur cet appareil.');
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        toast.error('Micro occupé par une autre application. Fermez-la puis réessayez.');
      } else {
        toast.error('Micro inaccessible. Vérifiez les autorisations du navigateur.');
      }
    }
  };

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRecording(false);
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  const send = async () => {
    if (!ready) return;
    setSending(true);
    try {
      const fd = new FormData();
      fd.append('audio', new File([ready.blob], `reponse.${extForMime(ready.mime)}`, { type: ready.mime }));
      fd.append('durationSec', String(ready.duration));
      // FIX-32 — deux contextes d'envoi :
      //  • Espace Hôte du HUB (PIN, sans session NextAuth) →
      //    /api/public/hub/[slug]/host-reply avec le PIN vérifié ;
      //  • Dashboard (session NextAuth) → /api/airbnb/voice-reply.
      let res: Response;
      if (slug && pin) {
        fd.append('pin', pin);
        if (voiceMessageId) fd.append('voiceMessageId', voiceMessageId);
        res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/host-reply`, { method: 'POST', body: fd });
      } else {
        if (voiceMessageId) fd.append('voiceMessageId', voiceMessageId);
        if (propertyId) fd.append('propertyId', propertyId);
        res = await fetch('/api/airbnb/voice-reply', { method: 'POST', body: fd });
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      toast.success('Réponse vocale envoyée ✅ Vos invités la retrouveront dans le hub.');
      fullCleanup();
      onSent?.();
    } catch (e) {
      toast.error(e instanceof Error && !e.message.startsWith('HTTP') ? e.message : 'Envoi impossible. Réessayez.');
    } finally {
      setSending(false);
    }
  };

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // ── Pré-écoute : écouter AVANT d'envoyer ──
  if (ready && !recording) {
    return (
      <div className={`rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2.5 ${compact ? 'w-full' : ''}`}>
        <p className="text-xs font-semibold text-slate-600">
          🎧 Écoutez votre réponse avant de l&apos;envoyer ({ready.duration}s)
        </p>
        <audio controls autoPlay src={ready.url} className="h-9 w-full" aria-label="Pré-écoute de votre réponse" />
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 flex-1 border-slate-300 text-slate-600"
            onClick={fullCleanup}
            disabled={sending}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Réenregistrer
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold"
            onClick={send}
            disabled={sending}
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Send className="h-3.5 w-3.5" aria-hidden="true" />}
            Envoyer
          </Button>
        </div>
      </div>
    );
  }

  if (recording) {
    return (
      <div className={`inline-flex items-center gap-2.5 ${compact ? 'w-full' : ''}`}>
        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-red-600">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
          {fmt(seconds)}
        </span>
        <Button
          type="button"
          size="sm"
          className="h-9 bg-slate-900 hover:bg-slate-800 text-white font-semibold"
          onClick={stopRecording}
        >
          <Square className="h-3.5 w-3.5" aria-hidden="true" /> Arrêter
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-9 border-slate-300 text-slate-600"
          onClick={fullCleanup}
        >
          Annuler
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className={`h-9 border-blue-300 text-blue-700 hover:bg-blue-50 font-semibold ${compact ? 'w-full' : ''}`}
      onClick={() => void startRecording()}
      aria-label="Répondre par message vocal"
    >
      <Mic className="h-3.5 w-3.5" aria-hidden="true" /> Répondre en vocal
    </Button>
  );
}
