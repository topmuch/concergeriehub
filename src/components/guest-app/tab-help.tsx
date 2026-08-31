'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GuestPayload } from './types';

// =============================================================
// ÉTAPE 16 (V3) — Onglet 🚨 Aide
// Contact urgence (appel / email) + répondeur vocal (30 s max)
// → même canal que le Hub V1 (POST /api/public/hub/{slug}/voice,
//   désormais compatible avec le slug du BIEN).
// Feedback inline (pas de toaster global → cohérence du scope).
// =============================================================

type RecorderState = 'idle' | 'recording' | 'sending' | 'sent' | 'error';

export function TabHelp({ slug, contact, propertyName }: {
  slug: string;
  contact: GuestPayload['guest']['contact'];
  propertyName: string;
}) {
  return (
    <div className="space-y-4">
      <div className="px-1">
        <h1 className="text-lg font-bold text-card-foreground">Besoin d&apos;aide&nbsp;?</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Un souci dans {propertyName}&nbsp;? {contact.name} vous répond rapidement.
        </p>
      </div>

      {/* Contact urgence */}
      <section className="bg-card border border-border rounded-2xl shadow-sm p-5" aria-label="Contact urgence">
        <h2 className="text-sm font-bold text-card-foreground">📞 Contact direct</h2>
        <div className="mt-3 space-y-2.5">
          {contact.phone ? (
            <a
              href={`tel:${contact.phone.replace(/\s/g, '')}`}
              className="flex items-center gap-3 bg-secondary border border-border rounded-xl p-3.5 hover:bg-accent hover:text-accent-foreground hover:border-accent transition-colors"
            >
              <span className="text-2xl select-none" aria-hidden="true">📞</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold">Appeler {contact.name}</p>
                <p className="text-xs opacity-80">{contact.phone}</p>
              </div>
              <span className="text-xs font-bold uppercase tracking-wide" aria-hidden="true">Appel ›</span>
            </a>
          ) : (
            <p className="text-xs text-muted-foreground">Numéro de téléphone non renseigné par votre hôte.</p>
          )}
          {contact.email && (
            <a
              href={`mailto:${contact.email}?subject=${encodeURIComponent(`Message du Hub — ${propertyName}`)}`}
              className="flex items-center gap-3 bg-secondary border border-border rounded-xl p-3.5 hover:bg-accent hover:text-accent-foreground hover:border-accent transition-colors"
            >
              <span className="text-2xl select-none" aria-hidden="true">✉️</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold">Écrire un email</p>
                <p className="text-xs opacity-80 truncate">{contact.email}</p>
              </div>
              <span className="text-xs font-bold uppercase tracking-wide" aria-hidden="true">Écrire ›</span>
            </a>
          )}
        </div>
      </section>

      {/* Répondeur vocal — réclamation */}
      <VoiceReporter slug={slug} propertyName={propertyName} />

      {/* Astuces urgence */}
      <section className="bg-card border border-border rounded-2xl shadow-sm p-5" aria-label="Urgences">
        <h2 className="text-sm font-bold text-card-foreground">🆘 Urgences (hors logement)</h2>
        <ul className="mt-3 space-y-2 text-sm text-card-foreground/90">
          <li className="flex items-center justify-between gap-3">
            <span>Police / Gendarmerie</span>
            <a href="tel:17" className="font-bold text-accent hover:underline">17</a>
          </li>
          <li className="flex items-center justify-between gap-3">
            <span>Pompiers</span>
            <a href="tel:18" className="font-bold text-accent hover:underline">18</a>
          </li>
          <li className="flex items-center justify-between gap-3">
            <span>SAMU (medical)</span>
            <a href="tel:15" className="font-bold text-accent hover:underline">15</a>
          </li>
          <li className="flex items-center justify-between gap-3">
            <span>Numéro européen</span>
            <a href="tel:112" className="font-bold text-accent hover:underline">112</a>
          </li>
        </ul>
      </section>
    </div>
  );
}

function VoiceReporter({ slug, propertyName }: { slug: string; propertyName: string }) {
  const [state, setState] = useState<RecorderState>('idle');
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const secondsRef = useRef(0);

  const stopTimers = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const cleanup = useCallback(() => {
    stopTimers();
    recorderRef.current?.stream?.getTracks?.().forEach((t) => t.stop());
    recorderRef.current = null;
    chunksRef.current = [];
    secondsRef.current = 0;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const stopRecording = (send: boolean) => {
    const recorder = recorderRef.current;
    stopTimers();
    if (!recorder) return;
    const duration = secondsRef.current;
    recorder.onstop = async () => {
      recorder.stream.getTracks().forEach((t) => t.stop());
      recorderRef.current = null;
      if (!send) {
        setState('idle');
        setSeconds(0);
        return;
      }
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      if (blob.size === 0) {
        setState('error');
        return;
      }
      setState('sending');
      try {
        const fd = new FormData();
        fd.append('audio', new File([blob], 'message.webm', { type: 'audio/webm' }));
        fd.append('senderName', 'Invité (app)');
        fd.append('durationSec', String(duration));
        const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/voice`, {
          method: 'POST',
          body: fd,
        });
        setState(res.ok ? 'sent' : 'error');
      } catch {
        setState('error');
      }
    };
    recorder.stop();
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.start();
      recorderRef.current = recorder;
      setState('recording');
      setSeconds(0);
      secondsRef.current = 0;
      timerRef.current = setInterval(() => {
        secondsRef.current += 1;
        setSeconds(secondsRef.current);
        if (secondsRef.current >= 30) stopRecording(true);
      }, 1000);
    } catch {
      setState('error');
    }
  };

  return (
    <section
      className="rounded-2xl border p-5 bg-card border-border shadow-sm"
      aria-label="Laisser un message vocal"
    >
      <h2 className="text-sm font-bold text-card-foreground">🎙️ Signaler un problème</h2>
      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
        Décrivez le problème en 30&nbsp;s max — votre hôte reçoit votre message vocal instantanément.
      </p>

      <div className="mt-3.5">
        {state === 'sent' ? (
          <div className="rounded-xl bg-accent/10 border border-accent/30 p-4 text-center" role="status">
            <p className="text-sm font-bold text-accent">✅ Message envoyé à votre hôte&nbsp;!</p>
            <button
              type="button"
              onClick={() => setState('idle')}
              className="mt-2 text-xs font-semibold text-muted-foreground hover:text-card-foreground underline underline-offset-2 cursor-pointer"
            >
              Envoyer un autre message
            </button>
          </div>
        ) : state === 'error' ? (
          <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-4 text-center" role="alert">
            <p className="text-sm font-bold text-destructive">Envoi impossible</p>
            <p className="text-xs text-muted-foreground mt-1">
              Micro inaccessible ou réseau indisponible. Réessayez.
            </p>
            <button
              type="button"
              onClick={() => setState('idle')}
              className="mt-2 text-xs font-semibold text-card-foreground underline underline-offset-2 cursor-pointer"
            >
              Réessayer
            </button>
          </div>
        ) : state === 'sending' ? (
          <p className="text-sm font-semibold text-card-foreground text-center py-3" aria-busy="true">
            ⏳ Envoi en cours…
          </p>
        ) : state === 'recording' ? (
          <div className="flex items-center gap-2.5 flex-wrap" role="status" aria-live="polite">
            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-destructive">
              <span className="h-2.5 w-2.5 rounded-full bg-destructive animate-pulse" aria-hidden="true" />
              {String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}
            </span>
            <button
              type="button"
              onClick={() => stopRecording(true)}
              className="flex-1 min-w-28 h-10 rounded-xl bg-accent text-accent-foreground font-bold text-sm hover:opacity-90 cursor-pointer"
            >
              Envoyer
            </button>
            <button
              type="button"
              onClick={() => stopRecording(false)}
              className="h-10 px-4 rounded-xl border border-border bg-card text-card-foreground text-sm font-semibold hover:bg-secondary cursor-pointer"
            >
              Annuler
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={startRecording}
            className="w-full h-11 rounded-xl bg-accent text-accent-foreground font-bold text-sm hover:opacity-90 active:scale-[0.99] transition-all cursor-pointer"
          >
            🎙️ Démarrer l&apos;enregistrement
          </button>
        )}
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground">
        Votre message est rattaché au hub de {propertyName}.
      </p>
    </section>
  );
}
