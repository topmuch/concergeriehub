'use client';

// =============================================================
// v4.76 « PUSH VAPID — FRONTEND » — ABONNEMENT AUX NOTIFICATIONS WEB
// -------------------------------------------------------------
// Le backend est complet depuis v4.74 :
//   • src/lib/push-sender.ts     → web-push (TTL 60 s, purge 404/410) ;
//   • public/sw.js               → handlers `push` + `notificationclick` ;
//   • /api/client/push           → GET (clé publique + état) / POST
//                                  (upsert par endpoint) / DELETE.
// Ce hook branche le DERNIER maillon : la permission navigateur et
// l'abonnement PushManager de l'appareil courant.
//
// Flux `enable()` :
//   1. `Notification.requestPermission()` (si pas encore décidée) ;
//   2. clé publique VAPID — l'API la renvoie (source unique de vérité,
//      fallback process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) ;
//   3. `registration.pushManager.subscribe({ userVisibleOnly: true,
//      applicationServerKey })` (réutilise la subscription existante) ;
//   4. POST /api/client/push avec la subscription JSON.
// `disable()` : DELETE /api/client/push + `subscription.unsubscribe()`.
//
// Note iOS/iPadOS : les notifications push web nécessitent que le site
// soit installé sur l'écran d'accueil (PWA) — mention affichée dans l'UI.
// =============================================================

import { useCallback, useEffect, useState } from 'react';

export interface PushNotificationsState {
  /** true si le navigateur supporte SW + PushManager + Notification. */
  supported: boolean;
  /** Permission navigateur ('unsupported' si non supporté). */
  permission: NotificationPermission | 'unsupported';
  /** Un abonnement actif existe pour ce compte (côté serveur). */
  subscribed: boolean;
  /** Opération en cours (requestPermission / subscribe / delete). */
  busy: boolean;
  /** Dernier message d'erreur (affichable tel quel). */
  error: string | null;
}

/** Décodage base64url → Uint8Array (applicationServerKey VAPID). */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

function browserSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function usePushNotifications() {
  const [state, setState] = useState<PushNotificationsState>(() => ({
    supported: false,
    permission: 'unsupported',
    subscribed: false,
    busy: false,
    error: null,
  }));

  // ── État initial : support navigateur + abonnement serveur existant ──
  useEffect(() => {
    let alive = true;
    if (!browserSupported()) return; // supported=false, permission='unsupported'
    const permission = Notification.permission;
    setState((s) => ({ ...s, supported: true, permission }));
    (async () => {
      try {
        const res = await fetch('/api/client/push', { cache: 'no-store' });
        if (!res.ok) return;
        const json = (await res.json().catch(() => null)) as
          | { subscribed?: boolean }
          | null;
        if (alive) setState((s) => ({ ...s, subscribed: !!json?.subscribed }));
      } catch {
        /* serveur injoignable — l'état sera rafraîchi à la prochaine action */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  /** Registration du service worker (existant sinon /sw.js enregistré). */
  const getRegistration =
    useCallback(async (): Promise<ServiceWorkerRegistration | null> => {
      try {
        const existing = await navigator.serviceWorker.getRegistration('/');
        if (existing) return existing;
        try {
          await navigator.serviceWorker.register('/sw.js');
        } catch {
          /* déjà enregistré par le layout → `ready` le retrouvera */
        }
        return await navigator.serviceWorker.ready;
      } catch {
        return null;
      }
    }, []);

  /**
   * Active les push : permission → abonnement → enregistrement serveur.
   * Retourne true si l'appareil est bien abonné à la fin de l'appel.
   */
  const enable = useCallback(async (): Promise<boolean> => {
    if (!browserSupported()) {
      setState((s) => ({ ...s, error: 'Navigateur non compatible avec les notifications push.' }));
      return false;
    }
    setState((s) => ({ ...s, busy: true, error: null }));
    try {
      // 1) Permission (visible dans l'UI : 'granted' | 'denied' | 'default').
      let permission = Notification.permission;
      if (permission === 'default') {
        permission = await Notification.requestPermission();
      }
      if (permission !== 'granted') {
        setState((s) => ({ ...s, permission, busy: false }));
        return false;
      }

      // 2) Clé publique VAPID — l'API est la source de vérité (env serveur).
      let vapidKey: string | null = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null;
      try {
        const cfg = (await fetch('/api/client/push', { cache: 'no-store' }).then((r) =>
          r.json(),
        )) as { vapidPublicKey?: string | null } | null;
        if (cfg?.vapidPublicKey) vapidKey = cfg.vapidPublicKey;
      } catch {
        /* repli sur la clé build-time */
      }
      if (!vapidKey) {
        setState((s) => ({
          ...s,
          busy: false,
          error: 'Push non configuré côté serveur (clés VAPID absentes).',
        }));
        return false;
      }

      // 3) Abonnement PushManager (réutilise une subscription existante).
      const reg = await getRegistration();
      if (!reg) {
        setState((s) => ({ ...s, busy: false, error: 'Service worker indisponible.' }));
        return false;
      }
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
        });
      }

      // 4) Envoi serveur (upsert par endpoint).
      const json = sub.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error('Abonnement push invalide.');
      }
      const res = await fetch('/api/client/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      if (!res.ok) throw new Error("L'enregistrement a été refusé par le serveur.");

      setState((s) => ({ ...s, permission: 'granted', subscribed: true, busy: false }));
      return true;
    } catch (e) {
      setState((s) => ({
        ...s,
        busy: false,
        error: e instanceof Error ? e.message : 'Erreur lors de l’activation.',
      }));
      return false;
    }
  }, [getRegistration]);

  /** Désactive les push sur cet appareil (serveur + navigateur). */
  const disable = useCallback(async (): Promise<void> => {
    setState((s) => ({ ...s, busy: true, error: null }));
    try {
      let endpoint: string | undefined;
      try {
        const reg = await getRegistration();
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        endpoint = sub?.endpoint ?? undefined;
        await sub?.unsubscribe();
      } catch {
        /* le navigateur peut refuser — la suppression serveur suffit */
      }
      await fetch('/api/client/push', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      }).catch(() => undefined);
      setState((s) => ({ ...s, subscribed: false, busy: false }));
    } catch {
      setState((s) => ({ ...s, busy: false }));
    }
  }, [getRegistration]);

  return { ...state, enable, disable };
}
