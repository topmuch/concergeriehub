'use client';

// =============================================================
// NotificationsBell — ÉTAPE 13 V2 : centre de notifications hôte
// Déclencheur TYPOGRAPHIQUE « Alertes » du header (v5.2 SAPHIR LUXE,
// sans icône) : pastille .lux-dot pour les non-lues, panneau déroulant
// (Popover), marquage lu individuel/global.
// Polling 45 s + rafraîchissement à l'ouverture.
// =============================================================
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { relativeFrTime } from '@/lib/automations';

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
  // v5.0 — « Tout marquer comme lu » : spinner pendant l'appel PUT.
  const [markingAll, setMarkingAll] = useState(false);

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

  // v5.0 — marque TOUTES les notifications lues : mise à jour
  // optimiste immédiate (badge → 0, plus de non-lues), puis PUT
  // /api/airbnb/notifications (updateMany côté API). En cas
  // d'échec on resynchronise avec le serveur + toast d'erreur.
  const markAllRead = async () => {
    if (markingAll || unreadCount === 0) return;
    setMarkingAll(true);
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    try {
      const res = await fetch('/api/airbnb/notifications', { method: 'PUT' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success('Toutes les notifications sont marquées comme lues');
    } catch {
      toast.error('Impossible de tout marquer comme lu');
      await load(); // resynchronise l'état réel (badge + liste)
    } finally {
      setMarkingAll(false);
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
        className="inline-block h-9 w-[78px] rounded-full border border-white/10 bg-white/[0.03]"
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
          aria-label={`Alertes${unreadCount > 0 ? ` (${unreadCount} non lues)` : ''}`}
          className="relative inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-xs font-semibold tracking-[0.04em] text-white/70 transition-colors hover:bg-white/8 hover:text-white"
        >
          Alertes
          {unreadCount > 0 && (
            <span
              aria-hidden="true"
              className="lux-dot"
              style={{ backgroundColor: '#e9c47c' }}
            />
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] border-white/10 bg-[#0b1226] p-0 text-white">
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
          <p className="lux-display text-sm font-semibold text-white">Alertes</p>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void markAllRead()}
              disabled={markingAll}
              aria-label="Tout marquer comme lu"
              className="inline-flex items-center rounded-full px-3 py-2 text-xs font-semibold text-[#a9c4ff] transition-colors hover:bg-white/8 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5c8af0]/50 disabled:cursor-wait disabled:opacity-60"
            >
              {markingAll && (
                <span
                  className="lux-dot mr-1.5 animate-pulse"
                  style={{ backgroundColor: '#a9c4ff' }}
                  aria-hidden="true"
                />
              )}
              Tout marquer comme lu
            </button>
          )}
        </div>

        <div className="lux-scroll max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="lux-display text-sm font-semibold text-white">Aucune notification</p>
              <p className="mt-1 text-xs text-[#8fa0c2]">
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
                      'flex w-full gap-3 border-b border-white/8 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-white/8 focus-visible:bg-white/8 focus-visible:text-white focus-visible:outline-none',
                      !n.isRead && 'bg-[#e9c47c]/[0.05]',
                    )}
                  >
                    <span
                      aria-label={n.isRead ? undefined : 'Non lue'}
                      aria-hidden={n.isRead || undefined}
                      className="lux-dot mt-2 shrink-0"
                      style={{ backgroundColor: n.isRead ? 'rgba(143,160,194,0.4)' : '#e9c47c' }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-white">
                          {n.title}
                        </span>
                      </span>
                      {n.body && (
                        <span className="mt-0.5 block text-xs text-[#8fa0c2] line-clamp-2">
                          {n.body}
                        </span>
                      )}
                      <span className="mt-1 block text-[11px] text-[#8fa0c2]/70">
                        {relativeFrTime(n.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-white/10 px-4 py-2.5">
          <Link
            href="/airbnb/dashboard/automations"
            onClick={() => setOpen(false)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#8fa0c2] transition-colors hover:text-white"
          >
            Gérer les automatisations
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
