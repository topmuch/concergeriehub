'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, BellRing } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';

// =============================================================
// AdminNotifications — cloche de notifications du header
// Alertes RÉELLES agrégées via /api/admin/notifications :
// emails en échec, commandes impayées > 48 h, abonnements
// past_due, plaques perdues. Polling 60 s.
// =============================================================

interface NotificationItem {
  kind: string;
  emoji: string;
  title: string;
  detail: string;
  href: string;
  at: string;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'à l\u2019instant';
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  return `il y a ${d} j`;
}

export function AdminNotifications() {
  const [count, setCount] = useState<number | null>(null);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/admin/notifications');
        if (!res.ok) throw new Error('unavailable');
        const data = await res.json();
        if (!cancelled) {
          setCount(Number(data.count) || 0);
          setItems(Array.isArray(data.items) ? data.items : []);
        }
      } catch {
        if (!cancelled) setCount(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const timer = setInterval(load, 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Notifications (${count ?? '…'})`}
          title="Notifications plateforme"
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          {count !== null && count > 0 ? (
            <BellRing className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Bell className="h-5 w-5" aria-hidden="true" />
          )}
          {count !== null && count > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-extrabold text-white">
              {count > 20 ? '20+' : count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 sm:w-96">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-bold text-slate-900">🔔 Alertes plateforme</p>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
            {count ?? '…'}
          </span>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {loading && count === null && (
            <div className="space-y-2 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          )}
          {count === 0 && (
            <p className="px-4 py-8 text-center text-sm text-slate-500">
              ✅ Aucune alerte — tout roule.
            </p>
          )}
          {items.map((n, i) => (
            <Link
              key={`${n.kind}-${i}`}
              href={n.href}
              className="flex gap-3 border-b border-slate-50 px-4 py-3 transition-colors last:border-0 hover:bg-slate-50"
            >
              <span aria-hidden="true" className="text-lg leading-none">{n.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-900">{n.title}</span>
                <span className="block truncate text-xs text-slate-500">{n.detail}</span>
                <span className="mt-0.5 block text-[11px] text-slate-400">{relativeTime(n.at)}</span>
              </span>
            </Link>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
