'use client';

// =============================================================
// NotificationsBell — ÉTAPE 13 V2 : centre de notifications hôte
// Cloche dans le header de l'Espace Hôte : badge non-lues,
// panneau déroulant (Popover), marquage lu individuel/global.
// Polling 45 s + rafraîchissement à l'ouverture.
// =============================================================
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck, Zap } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { notificationEmoji, relativeFrTime } from '@/lib/automations';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
}

export function NotificationsBell() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/airbnb/notifications?limit=25', {
        cache: 'no-store',
      });
      if (!res.ok) return; // 401 visiteur, erreurs passagères : on retente
      const data = (await res.json()) as {
        notifications: NotificationItem[];
        unreadCount: number;
      };
      setItems(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {
      // réseau indisponible : on retentera au prochain cycle
    }
  }, []);

  // Chargement initial (macrotâche) + polling léger (45 s)
  useEffect(() => {
    const initial = setTimeout(() => {
      load();
    }, 0);
    const poll = setInterval(() => {
      load();
    }, 45_000);
    return () => {
      clearTimeout(initial);
      clearInterval(poll);
    };
  }, [load]);

  const markRead = async (id: string) => {
    // Optimiste
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      const res = await fetch(`/api/airbnb/notifications?notificationId=${encodeURIComponent(id)}`, {
        method: 'PATCH',
      });
      if (res.ok) {
        const data = (await res.json()) as { unreadCount: number };
        setUnreadCount(data.unreadCount);
      }
    } catch {
      // silencieux — l'état optimiste reste
    }
  };

  const markAllRead = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    try {
      await fetch('/api/airbnb/notifications', { method: 'PUT' });
    } catch {
      // silencieux
    }
  };

  // ÉTAPE 17.3 : une notification peut porter un deep-link (ex. une
  // commande atterrit sur /airbnb/dashboard/orders). Au clic on
  // marque comme lu puis on navigue.
  const openNotification = (id: string) => {
    void markRead(id);
    const target = items.find((n) => n.id === id);
    const url = typeof target?.data?.url === 'string' ? target.data.url : '';
    if (url && url.startsWith('/')) {
      setOpen(false);
      router.push(url);
    }
  };

  // Visiteur non connecté : la cloche reste visible mais vide
  // (elle n'est rendue que pour les utilisateurs connectés via le shell).

  // Monté uniquement après hydratation : évite le mismatch des IDs
  // Radix auto-générés (aria-controls) entre SSR et client.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  if (!mounted) {
    return (
      <span
        aria-hidden="true"
        className="h-9 w-9 inline-block rounded-lg border border-slate-200 bg-white"
      />
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void load();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} non lues)` : ''}`}
          className="relative h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span
              aria-hidden="true"
              className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-0 bg-white text-slate-900">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
          <p className="text-sm font-bold text-slate-900">Notifications</p>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Tout marquer comme lu
            </button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto custom-scrollbar">
          {items.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-2xl" aria-hidden="true">
                🔔
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-700">Aucune notification</p>
              <p className="mt-1 text-xs text-slate-400">
                Réservations, ménages et réclamations arriveront ici.
              </p>
            </div>
          ) : (
            <ul role="list">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openNotification(n.id)}
                    aria-label={
                      typeof n.data?.url === 'string'
                        ? `${n.title} — ouvrir`
                        : n.title
                    }
                    className={cn(
                      'w-full text-left px-4 py-3 flex gap-3 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-b-0',
                      !n.isRead && 'bg-amber-50/60',
                    )}
                  >
                    <span aria-hidden="true" className="text-lg leading-6 shrink-0">
                      {notificationEmoji(n.type)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900 truncate">
                          {n.title}
                        </span>
                        {!n.isRead && (
                          <span
                            aria-label="Non lue"
                            className="h-2 w-2 rounded-full bg-red-500 shrink-0"
                          />
                        )}
                      </span>
                      {n.body && (
                        <span className="block text-xs text-slate-600 mt-0.5 line-clamp-2">
                          {n.body}
                        </span>
                      )}
                      <span className="block text-[11px] text-slate-400 mt-1">
                        {relativeFrTime(n.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-slate-100 px-4 py-2.5">
          <Link
            href="/airbnb/dashboard/automations"
            onClick={() => setOpen(false)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
          >
            <Zap className="h-3.5 w-3.5" aria-hidden="true" />
            Gérer les automatisations
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
