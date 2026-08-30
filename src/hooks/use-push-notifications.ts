'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

interface PushState {
  supported: boolean;
  permission: NotificationPermission;
  subscribed: boolean;
  loading: boolean;
}

export function usePushNotifications() {
  const [state, setState] = useState<PushState>({
    supported: false,
    permission: 'default',
    subscribed: false,
    loading: true,
  });

  // Check support and current status
  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window;
    if (!supported) {
      setState({ supported: false, permission: 'denied', subscribed: false, loading: false });
      return;
    }

    // Check current permission
    const permission = Notification.permission;
    
    // Check if subscribed on server
    fetch('/api/client/push')
      .then((r) => r.json())
      .then((data) => {
        setState({
          supported: true,
          permission,
          subscribed: !!data.subscribed,
          loading: false,
        });
      })
      .catch(() => {
        setState({ supported: true, permission, subscribed: false, loading: false });
      });
  }, []);

  const subscribe = useCallback(async () => {
    if (!state.supported) {
      toast.error('Les notifications ne sont pas supportées par ce navigateur');
      return false;
    }

    setState((s) => ({ ...s, loading: true }));

    try {
      // Request notification permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState({ supported: true, permission, subscribed: false, loading: false });
        toast.error('Permission de notification refusée');
        return false;
      }

      // Register service worker
      const registration = await navigator.serviceWorker.ready;

      // Get VAPID key
      const keyRes = await fetch('/api/client/push');
      const keyData = await keyRes.json();
      const vapidKey = keyData.vapidPublicKey;

      if (!vapidKey) {
        toast.error('Clé VAPID non configurée');
        setState((s) => ({ ...s, loading: false }));
        return false;
      }

      // Subscribe
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      // Send subscription to server
      const res = await fetch('/api/client/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });

      if (!res.ok) throw new Error('Erreur serveur');

      setState({ supported: true, permission: 'granted', subscribed: true, loading: false });
      toast.success('Notifications activées !');
      return true;
    } catch (err) {
      console.error('[push] Subscribe error:', err);
      toast.error('Erreur lors de l\'activation des notifications');
      setState((s) => ({ ...s, loading: false }));
      return false;
    }
  }, [state.supported]);

  const unsubscribe = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();
      }

      // Remove from server
      await fetch('/api/client/push', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription?.endpoint }),
      });

      setState({ supported: true, permission: Notification.permission, subscribed: false, loading: false });
      toast.success('Notifications désactivées');
      return true;
    } catch (err) {
      console.error('[push] Unsubscribe error:', err);
      setState((s) => ({ ...s, loading: false }));
      return false;
    }
  }, []);

  const toggle = useCallback(async () => {
    if (state.subscribed) {
      return unsubscribe();
    }
    return subscribe();
  }, [state.subscribed, subscribe, unsubscribe]);

  return { ...state, subscribe, unsubscribe, toggle };
}

// Utility: convert VAPID key from base64 to Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
