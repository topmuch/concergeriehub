'use client';

// =============================================================
// MessagesBadge — COMPTEUR PARTAGÉ DU BOUTON MESSAGES (espace hôte)
//
// Agrège vocales non lues + signalements OUVERTS via
// /api/airbnb/messages?countsOnly=1 et expose :
//   - useMessageCounts()   : hook (store partagé, polling 45 s)
//   - <MessagesNavBadge /> : pastille de la sidebar
//   - <MessagesButton />   : bouton « Messages » du header (avec badge)
//
// Ainsi, un « Signaler un problème » OU un vocal laissé par un
// invité incrémente immédiatement le badge du bouton Messages —
// les deux canaux sont connectés au même centre.
// =============================================================
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

export interface MessageCounts {
  voiceUnread: number;
  complaintsOpen: number;
  total: number;
}

const ZERO: MessageCounts = { voiceUnread: 0, complaintsOpen: 0, total: 0 };

// ── Store partagé (un seul poller pour toute l'application) ──
let counts: MessageCounts = ZERO;
const listeners = new Set<() => void>();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let started = false;

function notify() {
  for (const fn of listeners) fn();
}

async function refreshCounts(): Promise<void> {
  try {
    const res = await fetch('/api/airbnb/messages?propertyId=all&countsOnly=1', {
      cache: 'no-store',
    });
    if (!res.ok) return; // 401 visiteur / erreur passagère → on retentera
    const data = (await res.json()) as { counts?: MessageCounts };
    if (data.counts) {
      counts = {
        voiceUnread: Number(data.counts.voiceUnread) || 0,
        complaintsOpen: Number(data.counts.complaintsOpen) || 0,
        total: Number(data.counts.total) || 0,
      };
      notify();
    }
  } catch {
    // réseau indisponible : on retentera au prochain cycle
  }
}

function startPolling() {
  if (started) return;
  started = true;
  // Macrotâche : évite tout fetch pendant l'hydratation (mismatch SSR).
  setTimeout(() => void refreshCounts(), 0);
  pollTimer = setInterval(() => void refreshCounts(), 45_000);
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  startPolling();
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
      started = false;
    }
  };
}

const getSnapshot = (): MessageCounts => counts;
const getServerSnapshot = (): MessageCounts => ZERO;

/** Compteurs de messages non traités (vocales non lues + signalements ouverts). */
export function useMessageCounts(): MessageCounts {
  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // Rafraîchit à chaque montage d'un consommateur (navigation entre pages).
  useEffect(() => {
    void refreshCounts();
  }, []);
  return value;
}

/** Force un rafraîchissement des compteurs (après une action hôte). */
export function useRefreshMessageCounts(): () => void {
  return useCallback(() => {
    void refreshCounts();
  }, []);
}

// ── Pastille réutilisable ──

export function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-[#5cadf0] px-1 text-[10px] font-bold leading-none text-white ring-1 ring-white/20',
        className,
      )}
    >
      {count > 9 ? '9+' : count}
    </span>
  );
}

/** Badge de l'entrée « Messages » de la sidebar. */
export function MessagesNavBadge() {
  const counts = useMessageCounts();
  return (
    <span className="ml-auto inline-flex items-center" aria-hidden="true">
      <CountBadge count={counts.total} />
    </span>
  );
}

/** Bouton « Messages » du header — liens vers /airbnb/messages avec badge total. */
export function MessagesButton() {
  const router = useRouter();
  const counts = useMessageCounts();
  return (
    <button
      type="button"
      onClick={() => router.push('/airbnb/messages')}
      aria-label={`Messages${counts.total > 0 ? ` (${counts.total} à traiter)` : ''}`}
      className="relative inline-flex h-9 items-center rounded-full px-3.5 text-xs font-semibold tracking-[0.04em] text-white/70 transition-colors hover:bg-white/8 hover:text-white"
    >
      Messages
      <CountBadge count={counts.total} className="absolute -top-1.5 -right-1" />
    </button>
  );
}
