'use client';

// =============================================================
// v5.12 « GUIDAGE VOCAL DES ÉTATS DES LIEUX » — HOOK CLIENT
// src/components/inspection/shield/use-voice-guide.ts
//
// Voix guide « Denise » (MP3 pré-générés via Edge TTS, moteur Hub
// existant) + repli automatique Web Speech API (voix du navigateur)
// si le MP3 n'est pas encore prêt — l'agent entend TOUJOURS sa
// consigne, même hors ligne ou au premier lancement.
//
//  · say(key)        — joue un message (étape, intro vidéo, repère) ;
//  · replay()        — rejoue le message courant ;
//  · toggleMuted()   — coupe/rétablit la voix (préférence mémorisée,
//                      le sous-titre reste affiché même coupé) ;
//  · current         — message courant (sous-titre, aria-live).
//
// <VoiceGuideBar /> : bandeau réutilisable (sous-titre + rejouer +
// muet) affiché dans les flux CleanerCapture et ShieldCapture.
// =============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface VoiceGuideMessage {
  key: string;
  text: string;
  url: string;
}

export type VoiceGuideType = 'CHECK_IN' | 'CHECK_OUT';

interface UseVoiceGuideParams {
  type: VoiceGuideType;
  propertyName: string;
  zoneNames: string[];
  videoTargetSec: number;
}

const MUTE_STORAGE_KEY = 'shield-voice-muted';

export function useVoiceGuide({ type, propertyName, zoneNames, videoTargetSec }: UseVoiceGuideParams) {
  const [messages, setMessages] = useState<Record<string, VoiceGuideMessage>>({});
  // Préférence « muet » lue une seule fois (rendu initial client) — la
  // barre étant invisible tant qu'aucun message n'existe, aucun risque
  // d'écart d'hydratation SSR.
  const [muted, setMuted] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(MUTE_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [current, setCurrent] = useState<VoiceGuideMessage | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mutedRef = useRef(muted);

  // Signature stable (le parent recrée souvent le tableau zoneNames).
  const signature = useMemo(
    () => JSON.stringify({ type, propertyName, zoneNames, videoTargetSec }),
    [type, propertyName, zoneNames, videoTargetSec],
  );

  // Chargement des textes + URL des MP3 (génération lancée côté serveur).
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const parsed = JSON.parse(signature) as {
          type: VoiceGuideType;
          propertyName: string;
          zoneNames: string[];
          videoTargetSec: number;
        };
        const res = await fetch('/api/shield/voice-guide', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed),
        });
        const json = (await res.json().catch(() => null)) as
          | { ok?: boolean; messages?: VoiceGuideMessage[] }
          | null;
        if (cancelled || !res.ok || !json?.ok || !Array.isArray(json.messages)) return;
        const map: Record<string, VoiceGuideMessage> = {};
        for (const m of json.messages) map[m.key] = m;
        setMessages(map);
      } catch {
        /* silencieux — repli Web Speech API à la demande */
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [signature]);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  /** Repli navigateur (voix française) si le MP3 est absent/en erreur. */
  const speakFallback = useCallback((text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'fr-FR';
      utterance.rate = 0.95; // même ton posé que Denise (-5 %)
      const frVoice = window.speechSynthesis
        .getVoices()
        .find((v) => v.lang?.toLowerCase().startsWith('fr'));
      if (frVoice) utterance.voice = frVoice;
      window.speechSynthesis.speak(utterance);
    } catch {
      /* noop */
    }
  }, []);

  const say = useCallback(
    (key: string) => {
      const msg = messages[key];
      if (!msg) return;
      stop();
      setCurrent(msg);
      if (mutedRef.current) return;
      const audio = new Audio(msg.url);
      audioRef.current = audio;
      const fallBack = () => {
        if (audioRef.current === audio) speakFallback(msg.text);
      };
      audio.onerror = fallBack;
      audio.play().catch(fallBack);
    },
    [messages, stop, speakFallback],
  );

  const replay = useCallback(() => {
    if (current) say(current.key);
  }, [current, say]);

  const toggleMuted = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      mutedRef.current = next;
      try {
        window.localStorage.setItem(MUTE_STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* noop */
      }
      if (next) stop();
      return next;
    });
  }, [stop]);

  // Nettoyage à la sortie de la session (fin, quitter, démontage).
  useEffect(
    () => () => {
      if (audioRef.current) audioRef.current.pause();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    },
    [],
  );

  return { messages, current, muted, say, stop, replay, toggleMuted };
}

// =============================================================
// VoiceGuideBar — bandeau « voix guide » : sous-titre du message
// courant + boutons rejouer / muet. Thème clair des flux capture.
// =============================================================

export function VoiceGuideBar({
  current,
  muted,
  onReplay,
  onToggleMuted,
  className,
}: {
  current: VoiceGuideMessage | null;
  muted: boolean;
  onReplay: () => void;
  onToggleMuted: () => void;
  className?: string;
}) {
  if (!current) return null;
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-2xl border border-[#055492]/25 bg-white p-3 shadow-sm',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-[#055492] text-white">
        <Volume2 className="size-4" aria-hidden="true" />
      </span>
      <p className="min-w-0 flex-1 pt-1 text-xs leading-relaxed text-gray-700">{current.text}</p>
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          onClick={onReplay}
          className="inline-flex size-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
          aria-label="Réécouter la consigne"
        >
          <RotateCcw className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onToggleMuted}
          className={cn(
            'inline-flex size-9 items-center justify-center rounded-full border transition-colors',
            muted
              ? 'border-gray-300 bg-gray-100 text-gray-500 hover:bg-gray-200'
              : 'border-[#055492]/30 bg-[#055492]/10 text-[#055492] hover:bg-[#055492]/20',
          )}
          aria-label={muted ? 'Réactiver la voix guide' : 'Couper la voix guide'}
          aria-pressed={muted}
        >
          {muted ? <VolumeX className="size-4" aria-hidden="true" /> : <Volume2 className="size-4" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

/**
 * Repères vocaux de la vidéo (Option 3) — seuils calculés sur la
 * cible : ⅓ écoulé, 5/8 écoulés, puis « il reste 30 secondes ».
 * Le compteur est séquentiel : les repères partent toujours dans
 * l'ordre, même si un tick est sauté (throttling navigateur).
 */
export const VIDEO_VOICE_CUES: { atSec: (target: number) => number; key: string }[] = [
  { atSec: (t) => Math.floor(t / 3), key: 'video-cue-1' },
  { atSec: (t) => Math.round(t * 0.625), key: 'video-cue-2' },
  { atSec: (t) => t - 30, key: 'video-cue-3' },
];
