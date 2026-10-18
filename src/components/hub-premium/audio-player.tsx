'use client';

// =============================================================
// v4.112 « LECTEUR AUDIO PREMIUM » — src/components/hub-premium/audio-player.tsx
//
// Lit les MP3 PRÉ-GÉNÉRÉS par la voix Microsoft « Denise »
// (fr-FR-DeniseNeural, rate -5% — voir src/lib/tts-service.ts) via
// un simple élément <audio> HTML5 : plus de synthèse vocale native
// du navigateur en usage normal (rendu constant sur tous les
// appareils, zéro délai de chargement — le fichier est servi en
// statique).
//
// REPLI (spécification v4.112) : si le MP3 est indisponible
// (fichier non pré-généré, réseau, 404…), bascule automatiquement
// sur la Web Speech API (window.speechSynthesis, voix française du
// navigateur) et journalise un message discret (console.warn) —
// l'invité entend TOUJOURS son rappel, quoi qu'il arrive.
// =============================================================

import { useCallback, useEffect, useRef, useState } from 'react';

export interface AudioPlayerProps {
  /** URL du MP3 pré-généré (ex. /audio/hub/checkout-checklist-fr.mp3). */
  src: string;
  /** Texte de repli lu par la Web Speech API si le MP3 est indisponible. */
  fallbackText?: string;
  /** Libellé accessible du bouton (défaut : « Écouter le message »). */
  label?: string;
  /** Tenter la lecture dès le montage (geste utilisateur en amont
   *  recommandé — sinon l'autoplay est bloqué par le navigateur). */
  autoPlay?: boolean;
  /** Voix du repli Web Speech (défaut : fr-FR). */
  fallbackLang?: string;
  className?: string;
}

/** Message d'échec discret (spécification : « petit message d'erreur
 *  discret dans les logs ») — jamais de toast bloquant pour l'invité. */
function warnFallback(detail: string): void {
  console.warn(`[audio-player] MP3 indisponible → repli synthèse vocale navigateur (${detail})`);
}

export default function AudioPlayer({
  src,
  fallbackText,
  label = 'Écouter le message',
  autoPlay = false,
  fallbackLang = 'fr-FR',
  className = '',
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [mp3Failed, setMp3Failed] = useState(false);

  const speakFallback = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !fallbackText) {
      return false;
    }
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(fallbackText);
      utterance.lang = fallbackLang;
      utterance.rate = 0.9; // même ton posé que Denise (-5%)
      const langVoice = window.speechSynthesis
        .getVoices()
        .find((v) => v.lang?.toLowerCase().startsWith(fallbackLang.slice(0, 2)));
      if (langVoice) utterance.voice = langVoice;
      utterance.onerror = () => warnFallback('synthèse vocale en erreur');
      window.speechSynthesis.speak(utterance);
      setPlaying(true);
      const onEnd = () => setPlaying(false);
      utterance.onend = onEnd;
      return true;
    } catch {
      warnFallback('speechSynthesis indisponible');
      return false;
    }
  }, [fallbackText, fallbackLang]);

  const toggle = useCallback(() => {
    // Repli Web Speech : un seul « bouton » gère les deux mondes.
    if (mp3Failed) {
      if (window.speechSynthesis?.speaking) {
        window.speechSynthesis.cancel();
        setPlaying(false);
        return;
      }
      speakFallback();
      return;
    }
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play().catch(() => {
        // Lecture refusée (autoplay policy, fichier manquant…) → repli.
        setMp3Failed(true);
        warnFallback('play() refusé');
        speakFallback();
      });
    } else {
      el.pause();
    }
  }, [mp3Failed, speakFallback]);

  // Autoplay au montage si demandé (l'ouverture du dialog vient d'un
  // clic — le geste utilisateur autorise généralement la lecture).
  useEffect(() => {
    if (!autoPlay || mp3Failed) return;
    const el = audioRef.current;
    if (!el) return;
    const attempt = () => el.play().catch(() => {
      // Autoplay bloqué → le bouton reste disponible, pas de repli
      // parlant sans geste (la synthèse serait coupée de toute façon).
      setPlaying(false);
    });
    const timer = setTimeout(attempt, 350);
    return () => clearTimeout(timer);
  }, [autoPlay, mp3Failed]);

  // Arrêt propre au démontage (ne pas laisser une voix parlant seule).
  useEffect(() => {
    return () => {
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* silencieux */
      }
    };
  }, []);

  return (
    <div className={className}>
      {/* MP3 pré-généré (voix Denise) — élément audio invisible piloté
          par le bouton ; onError → repli Web Speech une seule fois. */}
      {!mp3Failed && (
        <audio
          ref={audioRef}
          src={src}
          preload="auto"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={() => {
            setMp3Failed(true);
            warnFallback(`erreur de chargement (${src})`);
            if (autoPlay) speakFallback();
          }}
          className="hidden"
        />
      )}
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        aria-pressed={playing}
        className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl bg-amber-500/15 px-4 text-sm font-bold text-amber-800 transition-colors hover:bg-amber-500/25 dark:text-amber-200"
      >
        <span aria-hidden="true">{playing ? '⏸️' : '▶️'}</span>
        {playing ? 'Pause' : 'Réécouter le rappel'}
      </button>
    </div>
  );
}
