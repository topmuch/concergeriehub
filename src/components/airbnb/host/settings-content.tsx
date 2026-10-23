'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useHostContext } from '@/components/airbnb/host/host-context';
import { BrandingContent } from '@/components/airbnb/branding-content';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import {
  NOTIFICATION_EVENTS,
  type NotificationPrefsMap,
} from '@/lib/notification-prefs';
import { cn } from '@/lib/utils';

// =============================================================
// SettingsContent — page « Paramètres » du Dashboard Client
// v5.2 « SAPHIR LUXE » — refonte design profonde (demande client) :
// nuit bleutée, SANS ICÔNES ni emojis (typographie, points colorés,
// glyphes purs). Données, handlers et textes métier intacts.
// Onglets : Profil · Propriétés · White-Label · Notifications ·
// Sécurité · Intégrations. Toutes les mutations passent par les
// API réelles (/api/airbnb/profile, /security/password,
// /notifications/prefs) — aucun état factice.
// =============================================================

interface ProfileState {
  email: string;
  fullName: string;
  phone: string;
  address: string;
}

interface WebhookRow {
  id: string;
  name: string;
  url: string;
  isActive: boolean;
  successCount: number;
  failCount: number;
}

/* ----- Carte de section « SAPHIR LUXE » (titre serif + note) ----- */
function SettingsCard({
  title,
  description,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('lux-card p-5 sm:p-6', className)}>
      <div className="flex flex-col gap-4">
        <div className="min-w-0">
          <h2 className="lux-display text-lg font-semibold text-white">{title}</h2>
          {description ? (
            <p className="mt-1 text-xs text-[#8fabc2] sm:text-sm">{description}</p>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  );
}

export function SettingsContent() {
  const { properties, plan } = useHostContext();

  return (
    <div className="flex flex-col gap-6">
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <p className="lux-eyebrow">Compte</p>
        <h1 className="lux-display mt-1 text-2xl font-semibold text-white">Paramètres</h1>
        <p className="mt-1.5 text-sm text-[#8fabc2]">
          Gérez votre profil, votre abonnement, vos notifications et vos intégrations.
        </p>
      </motion.div>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1.5 sm:flex-nowrap">
          <TabsTrigger
            value="profile"
            className="rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8fabc2] data-[state=active]:bg-white/10 data-[state=active]:text-white dark:data-[state=active]:bg-white/10 dark:data-[state=active]:text-white"
          >
            Profil
          </TabsTrigger>
          <TabsTrigger
            value="properties"
            className="rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8fabc2] data-[state=active]:bg-white/10 data-[state=active]:text-white dark:data-[state=active]:bg-white/10 dark:data-[state=active]:text-white"
          >
            Propriétés
          </TabsTrigger>
          <TabsTrigger
            value="white-label"
            className="rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8fabc2] data-[state=active]:bg-white/10 data-[state=active]:text-white dark:data-[state=active]:bg-white/10 dark:data-[state=active]:text-white"
          >
            White-Label
          </TabsTrigger>
          <TabsTrigger
            value="notifications"
            className="rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8fabc2] data-[state=active]:bg-white/10 data-[state=active]:text-white dark:data-[state=active]:bg-white/10 dark:data-[state=active]:text-white"
          >
            Notifications
          </TabsTrigger>
          <TabsTrigger
            value="security"
            className="rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8fabc2] data-[state=active]:bg-white/10 data-[state=active]:text-white dark:data-[state=active]:bg-white/10 dark:data-[state=active]:text-white"
          >
            Sécurité
          </TabsTrigger>
          <TabsTrigger
            value="integrations"
            className="rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8fabc2] data-[state=active]:bg-white/10 data-[state=active]:text-white dark:data-[state=active]:bg-white/10 dark:data-[state=active]:text-white"
          >
            Intégrations
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <ProfileTab />
        </TabsContent>
        <TabsContent value="properties" className="mt-4">
          <PropertiesTab />
        </TabsContent>
        <TabsContent value="white-label" className="mt-4">
          {plan?.isPro ? (
            <BrandingContent />
          ) : (
            <div className="lux-empty flex flex-col items-center gap-3 p-8 text-center">
              <span className="lux-dot" style={{ backgroundColor: '#e9c47c' }} aria-hidden="true" />
              <h2 className="lux-display text-xl font-semibold text-white">White-Label réservé au plan Pro</h2>
              <p className="mx-auto max-w-md text-sm text-[#8fabc2]">
                Personnalisez le Hub invité avec votre logo, vos couleurs et votre propre domaine
                en passant à l&apos;offre Airbnb Pro.
              </p>
              <Link
                href="/airbnb/billing"
                className="lux-btn-gold mt-1 inline-flex h-9 items-center px-4 text-xs"
              >
                Découvrir l&apos;offre Pro
              </Link>
            </div>
          )}
        </TabsContent>
        <TabsContent value="notifications" className="mt-4">
          <NotificationsTab />
        </TabsContent>
        <TabsContent value="security" className="mt-4">
          <SecurityTab />
        </TabsContent>
        <TabsContent value="integrations" className="mt-4">
          <IntegrationsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =============================================================
// Onglet Profil — GET/PATCH /api/airbnb/profile
// =============================================================

function ProfileTab() {
  const [profile, setProfile] = useState<ProfileState | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/airbnb/profile', { cache: 'no-store' });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { profile: ProfileState };
        if (!alive) return;
        setProfile(data.profile);
        setFullName(data.profile.fullName ?? '');
        setPhone(data.profile.phone ?? '');
        setAddress(data.profile.address ?? '');
      } catch {
        if (alive) toast.error('Impossible de charger votre profil.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch('/api/airbnb/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, phone, address }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Enregistrement refusé');
      toast.success('Profil mis à jour ✅');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur réseau');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsCard
      title="Mon profil"
      description="Ces informations apparaissent pour votre équipe."
      className="max-w-xl"
    >
      {loading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-10 w-full rounded-xl bg-white/8" aria-hidden="true" />
          <Skeleton className="h-10 w-full rounded-xl bg-white/8" aria-hidden="true" />
          <Skeleton className="h-10 w-full rounded-xl bg-white/8" aria-hidden="true" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="st-email" className="text-[#8fabc2]">Email (identifiant de connexion)</Label>
            <Input
              id="st-email"
              value={profile?.email ?? ''}
              disabled
              className="rounded-xl border-white/12 bg-white/[0.04] text-[#8fabc2]"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="st-name" className="text-[#8fabc2]">Nom complet *</Label>
            <Input
              id="st-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={80}
              className="rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fabc2]/60 focus-visible:ring-[#5cadf0]/50"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="st-phone" className="text-[#8fabc2]">Téléphone</Label>
            <Input
              id="st-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="06 12 34 56 78"
              className="rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fabc2]/60 focus-visible:ring-[#5cadf0]/50"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="st-address" className="text-[#8fabc2]">Adresse</Label>
            <Input
              id="st-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="12 rue de Exemple, Paris"
              className="rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fabc2]/60 focus-visible:ring-[#5cadf0]/50"
            />
          </div>
          <div>
            <Button
              className="lux-btn h-9 px-5 text-xs"
              disabled={busy || fullName.trim().length < 2}
              onClick={() => void save()}
            >
              {busy ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      )}
    </SettingsCard>
  );
}

// =============================================================
// Onglet Propriétés — renvoi vers le portfolio (source de vérité)
// =============================================================

function PropertiesTab() {
  const { properties, plan } = useHostContext();
  return (
    <SettingsCard
      title="Mes biens"
      description="La gestion complète (création, édition, plaques) se fait depuis « Mes Propriétés »."
      className="max-w-2xl"
    >
      <ul className="flex flex-col gap-2">
        {properties.map((p) => (
          <li
            key={p.id}
            className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] p-3 transition-colors hover:bg-white/[0.05]"
          >
            <span
              aria-hidden="true"
              className="lux-num flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#3d97e0]/15 text-sm font-semibold text-[#a9d8ff] ring-1 ring-[#5cadf0]/25"
            >
              {p.name.trim().charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{p.name}</p>
              <p className="truncate text-xs text-[#8fabc2]">{p.address ?? 'Adresse non renseignée'}</p>
            </div>
            <Link
              href="/airbnb/properties"
              className="shrink-0 text-xs font-semibold text-[#a9d8ff] transition-colors hover:text-white"
            >
              Gérer <span aria-hidden="true">→</span>
            </Link>
          </li>
        ))}
      </ul>
      {plan && (
        <p className="text-xs text-[#8fabc2]">
          Plan {plan.planName} — {plan.ownedCount}/{plan.maxProperties} biens.
        </p>
      )}
    </SettingsCard>
  );
}

// =============================================================
// Onglet Notifications — GET/PUT /api/airbnb/notifications/prefs
// =============================================================

/** v4.76 — PUSH VAPID SUR CET APPAREIL : le vrai abonnement navigateur
 *  (permission + PushManager + /api/client/push), branché sur le backend
 *  sendPushToUser. S'affiche au-dessus des préférences par canal (qui ne
 *  contrôlent que QUELS événements partent en push, pas l'abonnement). */
function PushDeviceCard() {
  const push = usePushNotifications();
  const active = push.subscribed && push.permission === 'granted';

  const statusLine = !push.supported
    ? 'Non supporté par ce navigateur (essayez Chrome, Edge ou Safari 16.4+).'
    : push.permission === 'denied'
      ? 'Non autorisé — réactivez les notifications dans les réglages du navigateur.'
      : active
        ? 'Activé — vous recevrez les alertes push sur cet appareil.'
        : 'Désactivé — activez pour recevoir les alertes en temps réel.';

  return (
    <div
      className={cn(
        'mb-5 rounded-2xl border p-4',
        active
          ? 'border-[#34d399]/25 bg-[#34d399]/8'
          : 'border-white/10 bg-white/[0.03]',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">
            Notifications push sur cet appareil
          </p>
          <p className="mt-0.5 text-xs text-[#8fabc2]">{statusLine}</p>
          {push.error && <p className="mt-1 text-xs font-semibold text-[#f07d6a]">{push.error}</p>}
        </div>
        <Switch
          checked={active}
          disabled={push.busy || !push.supported || push.permission === 'denied'}
          onCheckedChange={(checked) => {
            if (checked) void push.enable();
            else void push.disable();
          }}
          aria-label="Activer les notifications push sur cet appareil"
        />
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-[#8fabc2]">
        Sur iOS / iPadOS : ajoutez d&apos;abord le site à l&apos;écran d&apos;accueil
        (bouton Partager → « Sur l&apos;écran d&apos;accueil ») pour que les
        notifications push fonctionnent.
      </p>
    </div>
  );
}

function NotificationsTab() {
  const [prefs, setPrefs] = useState<NotificationPrefsMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/airbnb/notifications/prefs', { cache: 'no-store' });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { prefs: NotificationPrefsMap };
        if (alive) setPrefs(data.prefs);
      } catch {
        if (alive) toast.error('Impossible de charger vos préférences.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  function toggle(key: string, channel: 'email' | 'push') {
    setPrefs((prev) => {
      if (!prev) return prev;
      return { ...prev, [key]: { ...prev[key], [channel]: !prev[key]?.[channel] } };
    });
    setDirty(true);
  }

  async function save() {
    if (!prefs) return;
    setSaving(true);
    try {
      const res = await fetch('/api/airbnb/notifications/prefs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefs }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Enregistrement refusé');
      toast.success('Préférences enregistrées ✅');
      setDirty(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur réseau');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsCard
      title="Choisissez quels événements vous alertent"
      description="Par canal : email et notification push (l'application doit avoir autorisé les push)."
      className="max-w-2xl"
    >
      {loading || !prefs ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-2xl bg-white/8" aria-hidden="true" />
          ))}
        </div>
      ) : (
        <>
          {/* v4.76 — abonnement push réel de l'appareil (avant les canaux). */}
          <PushDeviceCard />
          <ul className="flex flex-col divide-y divide-white/8">
            {NOTIFICATION_EVENTS.map((ev) => (
              <li key={ev.key} className="flex items-center gap-3 py-3">
                <span
                  className="lux-dot shrink-0"
                  style={{ backgroundColor: '#5cadf0' }}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">{ev.label}</p>
                  <p className="text-xs text-[#8fabc2]">{ev.description}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                  <label className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8fabc2]">
                    Email
                    <Switch
                      checked={prefs[ev.key]?.email ?? true}
                      onCheckedChange={() => toggle(ev.key, 'email')}
                      aria-label={`Email pour ${ev.label}`}
                    />
                  </label>
                  <label className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8fabc2]">
                    Push
                    <Switch
                      checked={prefs[ev.key]?.push ?? false}
                      onCheckedChange={() => toggle(ev.key, 'push')}
                      aria-label={`Push pour ${ev.label}`}
                    />
                  </label>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              className="lux-btn h-9 px-5 text-xs"
              disabled={!dirty || saving}
              onClick={() => void save()}
            >
              {saving ? 'Enregistrement…' : 'Enregistrer les préférences'}
            </Button>
            {!dirty && (
              <span className="lux-chip text-[#8fabc2]">
                Aucune modification en attente
              </span>
            )}
          </div>
        </>
      )}
    </SettingsCard>
  );
}

// =============================================================
// Onglet Sécurité — changement de mot de passe réel + état 2FA
// =============================================================

function SecurityTab() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const strengthOk = next.length >= 8 && /[A-Za-z]/.test(next) && /[0-9]/.test(next);

  async function changePassword() {
    if (next !== confirm) {
      toast.error('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/airbnb/security/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) throw new Error(json.error ?? 'Changement refusé');
      toast.success(json.message ?? 'Mot de passe mis à jour ✅');
      setCurrent(''); setNext(''); setConfirm('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur réseau');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <SettingsCard title="Changer de mot de passe">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sec-cur" className="text-[#8fabc2]">Mot de passe actuel</Label>
            <Input
              id="sec-cur"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              className="rounded-xl border-white/12 bg-white/[0.04] text-white focus-visible:ring-[#5cadf0]/50"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sec-new" className="text-[#8fabc2]">Nouveau mot de passe</Label>
            <Input
              id="sec-new"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              className="rounded-xl border-white/12 bg-white/[0.04] text-white focus-visible:ring-[#5cadf0]/50"
            />
            {next.length > 0 && (
              <p className={cn('text-xs', strengthOk ? 'text-[#34d399]' : 'text-[#fbbf24]')}>
                {strengthOk
                  ? '✓ Format valide (8+ caractères, 1 lettre, 1 chiffre)'
                  : '8 caractères minimum, avec au moins une lettre et un chiffre'}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sec-conf" className="text-[#8fabc2]">Confirmer le nouveau mot de passe</Label>
            <Input
              id="sec-conf"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className="rounded-xl border-white/12 bg-white/[0.04] text-white focus-visible:ring-[#5cadf0]/50"
            />
            {confirm.length > 0 && confirm !== next && (
              <p className="text-xs text-[#f07d6a]">Les mots de passe ne correspondent pas.</p>
            )}
          </div>
          <div>
            <Button
              className="lux-btn h-9 px-5 text-xs"
              disabled={busy || !current || !strengthOk || next !== confirm}
              onClick={() => void changePassword()}
            >
              {busy ? 'Vérification…' : 'Mettre à jour le mot de passe'}
            </Button>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="Double authentification (2FA)">
        <p className="text-sm text-[#8fabc2]">
          État actuel :{' '}
          <span className="inline-flex items-center rounded-full border border-[#fbbf24]/25 bg-[#fbbf24]/10 px-2.5 py-0.5 text-xs font-semibold text-[#fbbf24]">
            Non configurée
          </span>{' '}
          sur ce compte.
        </p>
        <p className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5 text-xs leading-relaxed text-[#8fabc2]">
          La 2FA TOTP (application d&apos;authentification) sera disponible prochainement — elle
          nécessite l&apos;intégration de l&apos;étape de vérification à la connexion. Le changement
          de mot de passe ci-dessus est effectif immédiatement et appliqué par bcrypt côté serveur.
        </p>
      </SettingsCard>
    </div>
  );
}

// =============================================================
// Onglet Intégrations — webhooks (CRUD COMPLET v4.73) + Stripe + iCal
// =============================================================

/** Événements webhook déclenchables (VALID_EVENTS de l'API). */
const WEBHOOK_EVENTS: { key: string; label: string }[] = [
  { key: 'scan', label: 'Scan de la plaque QR' },
  { key: 'doorbell', label: 'Message / sonnette invité' },
  { key: 'guestbook', label: 'Nouvelle entrée livre d\'or' },
  { key: 'chore_completed', label: 'Tâche terminée' },
  { key: 'notification', label: 'Notification plateforme' },
];

interface WebhookFullRow extends WebhookRow {
  events?: string;
  property?: { id: string; name: string } | null;
  lastTriggerAt?: string | null;
}

function IntegrationsTab() {
  const { properties } = useHostContext();
  const [webhooks, setWebhooks] = useState<WebhookFullRow[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<WebhookFullRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<{ propertyId: string; name: string; url: string; events: string[] }>({
    propertyId: '',
    name: '',
    url: '',
    events: ['scan', 'doorbell', 'guestbook'],
  });

  const fetchWebhooks = useCallback(async () => {
    try {
      const res = await fetch('/api/client/webhooks', { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { webhooks?: WebhookFullRow[] };
      setWebhooks(data.webhooks ?? []);
    } catch {
      setWebhooks([]);
    }
  }, []);

  useEffect(() => {
    void fetchWebhooks();
  }, [fetchWebhooks]);

  // Préremplit le bien avec le premier du portfolio à l'ouverture.
  const openCreate = () => {
    setEditing(null);
    setForm({
      propertyId: properties[0]?.id ?? '',
      name: '',
      url: '',
      events: ['scan', 'doorbell', 'guestbook'],
    });
    setDialogOpen(true);
  };

  const openEdit = (w: WebhookFullRow) => {
    setEditing(w);
    let events: string[] = [];
    try {
      const parsed: unknown = JSON.parse(w.events ?? '[]');
      if (Array.isArray(parsed)) events = parsed.filter((v): v is string => typeof v === 'string');
    } catch {
      events = [];
    }
    setForm({
      propertyId: w.property?.id ?? properties[0]?.id ?? '',
      name: w.name,
      url: w.url,
      events: events.length ? events : ['scan', 'doorbell', 'guestbook'],
    });
    setDialogOpen(true);
  };

  const saveWebhook = async () => {
    if (!form.propertyId) {
      toast.error('Choisissez le bien concerné.');
      return;
    }
    if (!form.name.trim()) {
      toast.error('Donnez un nom à votre webhook.');
      return;
    }
    if (!/^https?:\/\/.+\..+/.test(form.url.trim())) {
      toast.error('URL invalide — https:// attendu.');
      return;
    }
    if (form.events.length === 0) {
      toast.error('Sélectionnez au moins un événement.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        editing ? `/api/client/webhooks/${editing.id}` : '/api/client/webhooks',
        {
          method: editing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            editing
              ? { name: form.name.trim(), url: form.url.trim(), events: form.events }
              : { propertyId: form.propertyId, name: form.name.trim(), url: form.url.trim(), events: form.events },
          ),
        },
      );
      const json = (await res.json().catch(() => null)) as { error?: string; secret?: string } | null;
      if (!res.ok) {
        toast.error(json?.error || 'Enregistrement impossible.');
        return;
      }
      if (!editing && json?.secret) {
        toast.success('Webhook créé ✓', {
          description: `Clé secrète (notez-la, elle ne sera plus affichée) : ${json.secret.slice(0, 12)}…`,
          duration: 10000,
        });
      } else {
        toast.success(editing ? 'Webhook mis à jour ✓' : 'Webhook créé ✓');
      }
      setDialogOpen(false);
      await fetchWebhooks();
    } catch {
      toast.error('Connexion impossible. Réessayez.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (w: WebhookFullRow, isActive: boolean) => {
    setWebhooks((prev) =>
      (prev ?? []).map((r) => (r.id === w.id ? { ...r, isActive } : r)),
    );
    try {
      const res = await fetch(`/api/client/webhooks/${w.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error();
      toast.success(isActive ? 'Webhook activé ✓' : 'Webhook désactivé');
    } catch {
      toast.error('Mise à jour impossible.');
      await fetchWebhooks();
    }
  };

  const testWebhook = async (w: WebhookFullRow) => {
    setTestingId(w.id);
    toast.info('Test en cours…');
    try {
      const res = await fetch(`/api/client/webhooks/${w.id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'test' }),
      });
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        statusCode?: number | null;
        response?: string;
      } | null;
      if (json?.success) {
        toast.success(`Test réussi — HTTP ${json.statusCode ?? 200}`, {
          description: json.response?.slice(0, 120),
        });
      } else {
        toast.error(`Test échoué${json?.statusCode ? ` — HTTP ${json.statusCode}` : ''}`, {
          description: json?.response?.slice(0, 140),
        });
      }
      await fetchWebhooks();
    } catch {
      toast.error('Test impossible — connexion perdue.');
    } finally {
      setTestingId(null);
    }
  };

  const deleteWebhook = async (w: WebhookFullRow) => {
    try {
      const res = await fetch(`/api/client/webhooks/${w.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('Webhook supprimé');
      setConfirmDeleteId(null);
      await fetchWebhooks();
    } catch {
      toast.error('Suppression impossible.');
    }
  };

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      {/* Stripe */}
      <SettingsCard
        title="Stripe (abonnement & paiements)"
        description="Les paiements invités et votre abonnement sont traités par Stripe. Le portail client vous permet de gérer vos moyens de paiement et vos factures."
      >
        <Link
          href="/airbnb/billing"
          className="inline-flex h-9 items-center rounded-full border border-white/12 bg-white/[0.04] px-4 text-xs font-semibold text-[#d5def0] transition-colors hover:bg-white/8 hover:text-white"
        >
          Ouvrir la facturation <span aria-hidden="true">&nbsp;→</span>
        </Link>
      </SettingsCard>

      {/* iCal */}
      <SettingsCard
        title="Calendriers iCal (Airbnb, Booking, Abritel)"
        description="Connectez les calendriers externes de vos biens pour importer automatiquement les séjours dans votre planning."
      >
        <Link
          href="/airbnb/calendar"
          className="inline-flex h-9 items-center rounded-full border border-white/12 bg-white/[0.04] px-4 text-xs font-semibold text-[#d5def0] transition-colors hover:bg-white/8 hover:text-white"
        >
          Ouvrir le calendrier <span aria-hidden="true">&nbsp;→</span>
        </Link>
      </SettingsCard>

      {/* Webhooks — CRUD complet (v4.73) */}
      <SettingsCard
        title="Webhooks"
        description={
          <>
            Recevez un appel HTTP à chaque scan, message invité ou entrée de livre d&apos;or —
            vers Zapier, Make, n8n ou votre propre serveur.
            {webhooks && webhooks.length === 0 && ' Aucun webhook configuré pour le moment.'}
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {webhooks === null && <Skeleton className="h-20 w-full rounded-xl bg-white/8" />}

          {webhooks && webhooks.length === 0 && (
            <p className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-4 text-xs text-[#8fabc2]">
              Créez votre premier webhook : RoomScan enverra un POST JSON à votre URL à chaque
              événement sélectionné (scan, message, livre d&apos;or…).
            </p>
          )}

          {webhooks && webhooks.length > 0 && (
            <ul className="flex flex-col gap-2">
              {webhooks.map((w) => (
                <li key={w.id} className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-semibold text-white">{w.name}</p>
                    <div className="flex shrink-0 items-center gap-2">
                      <Switch
                        checked={w.isActive}
                        onCheckedChange={(v) => void toggleActive(w, v)}
                        aria-label={w.isActive ? 'Désactiver ce webhook' : 'Activer ce webhook'}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-full border-white/12 bg-white/[0.04] px-3 text-xs text-[#d5def0] hover:bg-white/8 hover:text-white"
                        disabled={testingId === w.id}
                        onClick={() => void testWebhook(w)}
                      >
                        {testingId === w.id ? 'Test…' : 'Tester'}
                      </Button>
                      <button
                        type="button"
                        onClick={() => openEdit(w)}
                        className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-[#d5def0] transition-colors hover:bg-white/8 hover:text-white"
                      >
                        Modifier
                      </button>
                      {confirmDeleteId === w.id ? (
                        <span className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void deleteWebhook(w)}
                            className="rounded-full bg-[#f07d6a] px-3 py-1 text-xs font-semibold text-[#2a100a]"
                          >
                            Confirmer
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="rounded-full border border-white/12 px-2 py-1 text-xs text-[#8fabc2] transition-colors hover:bg-white/8 hover:text-white"
                          >
                            Annuler
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          aria-label={`Supprimer ${w.name}`}
                          onClick={() => setConfirmDeleteId(w.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/12 text-[#8fabc2] transition-colors hover:bg-[#f07d6a]/10 hover:text-[#f07d6a]"
                        >
                          <span aria-hidden="true" className="text-sm leading-none">×</span>
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="truncate font-mono text-xs text-[#8fabc2]">{w.url}</p>
                  <p className="mt-0.5 text-[11px] text-[#8fabc2]">
                    {w.property?.name ? `${w.property.name} · ` : ''}
                    {w.successCount} succès · {w.failCount} échec(s)
                    {w.lastTriggerAt
                      ? ` · dernier déclenchement ${new Date(w.lastTriggerAt).toLocaleDateString('fr-FR')}`
                      : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <div>
            <Button
              type="button"
              className="lux-btn h-9 px-4 text-xs"
              onClick={openCreate}
              disabled={properties.length === 0}
            >
              Ajouter un webhook
            </Button>
            {properties.length === 0 && (
              <p className="mt-2 text-[11px] text-[#8fabc2]">
                Créez d&apos;abord un bien pour rattacher vos webhooks.
              </p>
            )}
          </div>
        </div>
      </SettingsCard>

      {/* Dialog création / édition */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto rounded-2xl border-white/10 bg-[#0b1226] text-white shadow-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="lux-display text-xl font-semibold text-white">
              {editing ? 'Modifier le webhook' : 'Nouveau webhook'}
            </DialogTitle>
            <DialogDescription className="text-sm text-[#8fabc2]">
              RoomScan enverra un POST JSON à votre URL à chaque événement sélectionné.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {!editing && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="wh-property" className="text-[#8fabc2]">Bien concerné</Label>
                <Select
                  value={form.propertyId}
                  onValueChange={(v) => setForm((f) => ({ ...f, propertyId: v }))}
                >
                  <SelectTrigger
                    id="wh-property"
                    aria-label="Bien concerné"
                    className="rounded-xl border-white/12 bg-white/[0.04] text-white"
                  >
                    <SelectValue placeholder="Choisir un bien" />
                  </SelectTrigger>
                  <SelectContent className="border-white/10 bg-[#0d1530] text-white">
                    {properties.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="focus:bg-white/8 focus:text-white">
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wh-name" className="text-[#8fabc2]">Nom</Label>
              <Input
                id="wh-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex. Zapier — alertes scans"
                maxLength={60}
                className="rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fabc2]/60 focus-visible:ring-[#5cadf0]/50"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wh-url" className="text-[#8fabc2]">URL de réception (https)</Label>
              <Input
                id="wh-url"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="https://hooks.zapier.com/…"
                inputMode="url"
                className="rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fabc2]/60 focus-visible:ring-[#5cadf0]/50"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-[#8fabc2]">Événements déclencheurs</Label>
              {WEBHOOK_EVENTS.map((ev) => (
                <label
                  key={ev.key}
                  className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-[#d5def0] transition-colors hover:bg-white/[0.05]"
                >
                  <Checkbox
                    checked={form.events.includes(ev.key)}
                    onCheckedChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        events: v
                          ? [...f.events, ev.key]
                          : f.events.filter((e) => e !== ev.key),
                      }))
                    }
                    aria-label={ev.label}
                    className="border-white/25 bg-white/[0.04]"
                  />
                  {ev.label}
                </label>
              ))}
            </div>
          </div>
          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-full border-white/12 bg-white/[0.04] text-[#d5def0] hover:bg-white/8 hover:text-white"
              onClick={() => setDialogOpen(false)}
            >
              Annuler
            </Button>
            <Button
              type="button"
              className="lux-btn h-9 px-4 text-xs"
              disabled={saving}
              onClick={() => void saveWebhook()}
            >
              {saving ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Créer le webhook'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
