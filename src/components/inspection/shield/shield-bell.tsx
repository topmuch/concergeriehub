'use client';

// =============================================================
// BOUCLIER V2 — CLOCHE DE NOTIFICATIONS (v4.167 — Problème 12).
// Badge rouge + panneau déroulant listant les actions requises :
//   · 🔴 séjours EN_RETARD (check-in / check-out non validés) ;
//   · ⚠️ anomalies détectées dans les 7 derniers jours ;
//   · 📸 photos de référence attendues de l'équipe (délégation).
// Données réelles : GET /api/shield/notifications. Le badge rouge
// disparaît à l'ouverture (état « vu » persisté en localStorage)
// mais la liste reste consultable.
// =============================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, BellRing, Camera, CircleAlert, Clock } from 'lucide-react';
import { fetchJson, formatDateTime } from './shield-ui';

interface NotifLate {
  id: string;
  kind: 'late';
  type: string;
  guestName: string | null;
  sessionRef: string;
  scheduledDate: string;
  propertyName: string;
}
interface NotifAnomaly {
  id: string;
  kind: 'anomaly';
  zoneName: string;
  shotStatus: string;
  comment: string | null;
  capturedAt: string;
  sessionId: string;
  sessionRef: string;
  sessionType: string;
  guestName: string | null;
  propertyName: string;
}
interface NotifPhotos {
  id: string;
  kind: 'photos';
  propertyName: string;
  since: string;
}
type NotifItem =
  | ({ key: string } & NotifLate)
  | ({ key: string } & NotifAnomaly)
  | ({ key: string } & NotifPhotos);

interface NotificationsResponse {
  late: NotifLate[];
  anomalies: NotifAnomaly[];
  photos: NotifPhotos[];
  checkoutLateCount: number;
  total: number;
}

const SEEN_KEY = 'shieldNotifSeenAt';

export function ShieldBell({ variant = 'dark' }: { variant?: 'dark' | 'light' }) {
  // v5.0 — l'icône et le panneau s'adaptent au mode clair ET sombre.
  const iconClass =
    variant === 'dark'
      ? 'text-white hover:bg-white/10'
      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10';
  const badgeRing = variant === 'dark' ? 'ring-[#1e3a8a]' : 'ring-white dark:ring-[#0a1226]';
  const [data, setData] = useState<NotificationsResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [seenAt, setSeenAt] = useState<number>(() => {
    // Lazy init : évite tout mismatch d'hydratation (valeur SSR = 0).
    return 0;
  });
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // État « vu » lu après montage (localStorage indisponible côté SSR)
    // via un micro-task : évite le setState synchrone dans l'effet.
    let cancelled = false;
    const t = setTimeout(() => {
      if (!cancelled) setSeenAt(Number(window.localStorage.getItem(SEEN_KEY) ?? '0'));
    }, 0);
    const load = () =>
      fetchJson<NotificationsResponse>('/api/shield/notifications')
        .then((d) => {
          if (!cancelled) setData(d);
        })
        .catch(() => {
          if (!cancelled) setData(null);
        });
    load();
    const interval = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearTimeout(t);
      clearInterval(interval);
    };
  }, []);

  // Fermeture au clic extérieur + Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const items: NotifItem[] = data
    ? [
        ...data.late.map((l) => ({ ...l, kind: 'late' as const, key: `late-${l.id}` })),
        ...data.anomalies.map((a) => ({ ...a, kind: 'anomaly' as const, key: `anom-${a.id}` })),
        ...data.photos.map((p) => ({ ...p, kind: 'photos' as const, key: `ph-${p.id}` })),
      ]
    : [];

  // Badge rouge = items plus récents que le dernier « vu ».
  const unreadCount = data
    ? items.filter((i) => {
        const ts =
          i.kind === 'late'
            ? new Date(i.scheduledDate).getTime()
            : i.kind === 'anomaly'
              ? new Date(i.capturedAt).getTime()
              : new Date(i.since).getTime();
        return ts > seenAt;
      }).length
    : 0;

  const markSeen = useCallback(() => {
    const now = Date.now();
    window.localStorage.setItem(SEEN_KEY, String(now));
    setSeenAt(now);
  }, []);

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) markSeen();
        }}
        aria-label={`Notifications${unreadCount > 0 ? ` — ${unreadCount} nouvelle${unreadCount > 1 ? 's' : ''}` : ''}`}
        aria-expanded={open}
        className={`relative flex h-11 w-11 items-center justify-center rounded-lg transition-colors ${iconClass}`}
      >
        {unreadCount > 0 ? (
          <BellRing className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Bell className="h-5 w-5" aria-hidden="true" />
        )}
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className={`absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#C41E3A] px-1 text-[10px] font-bold text-white ring-2 ${badgeRing}`}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            role="dialog"
            aria-label="Notifications"
            className="fixed inset-x-3 top-16 z-50 sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-96"
          >
            <div className="max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl shield-scrollbar dark:border-[#283a66] dark:bg-[#0d1530]">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-[#22305a]">
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Notifications</p>
                {data && data.total > 0 && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700 dark:bg-red-500/15 dark:text-red-300">
                    {data.total} à traiter
                  </span>
                )}
              </div>

              {data === null ? (
                <p className="px-4 py-6 text-center text-sm text-slate-400 dark:text-slate-500">Chargement…</p>
              ) : items.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <span aria-hidden="true" className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
                    <Bell className="h-5 w-5" />
                  </span>
                  <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">Tout est sous contrôle</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Aucun retard, aucune anomalie — continuez comme ça !
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-[#1a2749]">
                  {items.map((i) =>
                    i.kind === 'late' ? (
                      <li key={i.key}>
                        <Link
                          href="/inspection/menage"
                          onClick={() => setOpen(false)}
                          className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-[#13204a]"
                        >
                          <span aria-hidden="true" className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400">
                            <Clock className="h-4 w-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {i.type === 'CHECK_OUT' ? 'Check-out' : 'Check-in'} en retard
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">
                              {i.guestName ?? 'Invité'} — {i.propertyName} · prévu le {formatDateTime(i.scheduledDate)}
                            </span>
                          </span>
                        </Link>
                      </li>
                    ) : i.kind === 'anomaly' ? (
                      <li key={i.key}>
                        <Link
                          href="/inspection/check-outs"
                          onClick={() => setOpen(false)}
                          className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-[#13204a]"
                        >
                          <span aria-hidden="true" className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
                            <CircleAlert className="h-4 w-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                              Anomalie — {i.zoneName}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">
                              {i.shotStatus === 'DEGRADATION' ? 'Dégradation' : 'À nettoyer'}
                              {i.comment ? ` : ${i.comment}` : ''} · {i.propertyName}
                            </span>
                          </span>
                        </Link>
                      </li>
                    ) : (
                      <li key={i.key}>
                        <Link
                          href="/inspection/biens"
                          onClick={() => setOpen(false)}
                          className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-[#13204a]"
                        >
                          <span aria-hidden="true" className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#1e3a8a] dark:bg-[#2f6fed]/20 dark:text-[#60a5fa]">
                            <Camera className="h-4 w-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                              Photos de référence attendues
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">
                              {i.propertyName} — l&apos;équipe doit photographier les zones
                            </span>
                          </span>
                        </Link>
                      </li>
                    ),
                  )}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
