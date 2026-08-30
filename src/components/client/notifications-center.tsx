'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Bell, Check, CheckCheck, Trash2, Info, CheckCircle,
  AlertTriangle, XCircle, Sparkles, Users, Package, Clock,
} from 'lucide-react';
import { toast } from 'sonner';

type NotificationType = 'info' | 'success' | 'warning' | 'error' | 'chore' | 'member' | 'stock' | 'dlc';

interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string | null;
  isRead: boolean;
  createdAt: string;
}

const TYPE_CONFIG: Record<NotificationType, { color: string; bgClass: string; icon: React.ReactNode }> = {
  info: { color: 'text-blue-600', bgClass: 'bg-blue-500/15', icon: <Info className="h-4 w-4 text-blue-600" /> },
  success: { color: 'text-emerald-600', bgClass: 'bg-emerald-500/15', icon: <CheckCircle className="h-4 w-4 text-emerald-600" /> },
  warning: { color: 'text-amber-600', bgClass: 'bg-amber-500/15', icon: <AlertTriangle className="h-4 w-4 text-amber-600" /> },
  error: { color: 'text-red-600', bgClass: 'bg-red-500/15', icon: <XCircle className="h-4 w-4 text-red-600" /> },
  chore: { color: 'text-violet-600', bgClass: 'bg-violet-500/15', icon: <Sparkles className="h-4 w-4 text-violet-600" /> },
  member: { color: 'text-teal-600', bgClass: 'bg-teal-500/15', icon: <Users className="h-4 w-4 text-teal-600" /> },
  stock: { color: 'text-orange-600', bgClass: 'bg-orange-500/15', icon: <Package className="h-4 w-4 text-orange-600" /> },
  dlc: { color: 'text-rose-600', bgClass: 'bg-rose-500/15', icon: <Clock className="h-4 w-4 text-rose-600" /> },
};

function relativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);
  if (diffMin < 1) return "\u00e0 l'instant";
  if (diffMin < 60) return `il y a ${diffMin}min`;
  if (diffH < 24) return `il y a ${diffH}h`;
  if (diffD < 7) return `il y a ${diffD}j`;
  return `il y a ${Math.floor(diffD / 7)}sem`;
}

function NotificationSkeleton() {
  return (
    <div className="flex items-start gap-4 p-4">
      <Skeleton className="h-9 w-9 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-1/4" />
      </div>
    </div>
  );
}

export function NotificationCenter() {
  const { data: session } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNotifications = useCallback(async (unreadOnly = false) => {
    if (!userId) return;
    try {
      const params = new URLSearchParams({ userId, limit: '50' });
      if (unreadOnly) params.set('unreadOnly', 'true');
      const res = await fetch(`/api/client/notifications?${params}`);
      const data = await res.json();
      if (res.ok) {
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      }
    } catch {
      // silent
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    fetchNotifications(activeTab === 'unread').finally(() => setLoading(false));
  }, [userId, activeTab, fetchNotifications]);

  useEffect(() => {
    if (!userId) return;
    intervalRef.current = setInterval(() => fetchNotifications(activeTab === 'unread'), 30000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [userId, activeTab, fetchNotifications]);

  const handleMarkAsRead = async (id: string) => {
    try {
      const res = await fetch(`/api/client/notifications/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRead: true }),
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
        setUnreadCount((prev) => Math.max(0, prev - 1));
        toast.success('Marqu\u00e9e comme lue');
      }
    } catch { toast.error('Erreur'); }
  };

  const handleMarkAllAsRead = async () => {
    if (!userId) return;
    setMarkingAll(true);
    try {
      const res = await fetch('/api/client/notifications', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        setUnreadCount(0);
        toast.success(`${data.count} notification(s) lue(s)`);
      }
    } catch { toast.error('Erreur'); }
    finally { setMarkingAll(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/client/notifications/${id}`, { method: 'DELETE' });
      if (res.ok) {
        const notif = notifications.find((n) => n.id === id);
        if (notif && !notif.isRead) setUnreadCount((c) => Math.max(0, c - 1));
        setNotifications((prev) => prev.filter((n) => n.id !== id));
        toast.success('Supprim\u00e9e');
      }
    } catch { toast.error('Erreur'); }
  };

  const getTypeConfig = (type: string) => TYPE_CONFIG[type as NotificationType] || TYPE_CONFIG.info;

  const notificationList = (items: Notification[]) => {
    if (loading) {
      return (
        <Card><CardContent className="p-0 divide-y">
          {Array.from({ length: 5 }).map((_, i) => <NotificationSkeleton key={i} />)}
        </CardContent></Card>
      );
    }
    if (items.length === 0) {
      return (
        <Card><CardContent className="py-16">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
              <Bell className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-1">Aucune notification</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Les \u00e9v\u00e9nements de votre foyer appara\u00eetront ici.
            </p>
          </div>
        </CardContent></Card>
      );
    }
    return (
      <Card><CardContent className="p-0 divide-y">
        {items.map((notif) => {
          const config = getTypeConfig(notif.type);
          return (
            <div
              key={notif.id}
              className={`flex items-start gap-4 p-4 transition-colors hover:bg-muted/50 ${
                !notif.isRead ? 'bg-violet-50/50 dark:bg-violet-950/10' : ''
              }`}
            >
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${config.bgClass}`}>
                {config.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-sm leading-snug ${!notif.isRead ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground'}`}>
                    {notif.title}
                  </p>
                  {!notif.isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-violet-500" />}
                </div>
                {notif.body && (
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{notif.body}</p>
                )}
                <p className="mt-1.5 text-[11px] text-muted-foreground/70">{relativeTime(notif.createdAt)}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!notif.isRead && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-violet-600" onClick={() => handleMarkAsRead(notif.id)} title="Marquer comme lu">
                    <Check className="h-4 w-4" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-500" onClick={() => handleDelete(notif.id)} title="Supprimer">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent></Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Centre de notifications</h2>
          <p className="text-sm text-muted-foreground">Restez inform\u00e9 de l&apos;activit\u00e9 de votre foyer.</p>
        </div>
        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <Badge className="bg-violet-600 hover:bg-violet-700 text-white px-3 py-1">
              {unreadCount} non lue{unreadCount > 1 ? 's' : ''}
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={handleMarkAllAsRead} disabled={markingAll || unreadCount === 0} className="gap-2">
            <CheckCheck className="h-4 w-4" />
            {markingAll ? 'Mise \u00e0 jour...' : 'Tout marquer comme lu'}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all" className="gap-2">
            Toutes
            {unreadCount > 0 && (
              <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-violet-600 text-[10px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="unread">Non lues</TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="mt-4">{notificationList(notifications)}</TabsContent>
        <TabsContent value="unread" className="mt-4">{notificationList(notifications)}</TabsContent>
      </Tabs>
    </div>
  );
}
