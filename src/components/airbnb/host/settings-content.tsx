'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  KeyRound,
  Link2,
  Palette,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useHostContext } from '@/components/airbnb/host/host-context';
import { BrandingContent } from '@/components/airbnb/branding-content';
import {
  NOTIFICATION_EVENTS,
  type NotificationPrefsMap,
} from '@/lib/notification-prefs';
import { cn } from '@/lib/utils';

// =============================================================
// SettingsContent — page « Paramètres » du Dashboard Client
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

export function SettingsContent() {
  const { properties, plan } = useHostContext();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">⚙️ Paramètres</h1>
        <p className="mt-1 text-sm text-slate-600">
          Gérez votre profil, votre abonnement, vos notifications et vos intégrations.
        </p>
      </div>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-xl border border-slate-200 bg-white p-1.5 sm:flex-nowrap">
          <TabsTrigger value="profile" className="gap-1.5 data-[state=active]:bg-[#FEF1EF] data-[state=active]:text-[#E23F2B]">
            <UserRound className="h-4 w-4" aria-hidden="true" /> Profil
          </TabsTrigger>
          <TabsTrigger value="properties" className="gap-1.5 data-[state=active]:bg-[#FEF1EF] data-[state=active]:text-[#E23F2B]">
            🏠 Propriétés
          </TabsTrigger>
          <TabsTrigger value="white-label" className="gap-1.5 data-[state=active]:bg-[#FEF1EF] data-[state=active]:text-[#E23F2B]">
            <Palette className="h-4 w-4" aria-hidden="true" /> White-Label
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5 data-[state=active]:bg-[#FEF1EF] data-[state=active]:text-[#E23F2B]">
            🔔 Notifications
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-1.5 data-[state=active]:bg-[#FEF1EF] data-[state=active]:text-[#E23F2B]">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Sécurité
          </TabsTrigger>
          <TabsTrigger value="integrations" className="gap-1.5 data-[state=active]:bg-[#FEF1EF] data-[state=active]:text-[#E23F2B]">
            <Link2 className="h-4 w-4" aria-hidden="true" /> Intégrations
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
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
              <span aria-hidden="true" className="text-3xl">🎨</span>
              <h2 className="mt-2 text-lg font-bold text-slate-900">White-Label réservé au plan Pro</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
                Personnalisez le Hub invité avec votre logo, vos couleurs et votre propre domaine
                en passant à l&apos;offre Airbnb Pro.
              </p>
              <Link
                href="/airbnb/billing"
                className="mt-4 inline-flex h-10 items-center rounded-lg bg-[#E23F2B] px-4 text-sm font-bold text-white hover:bg-[#c93725]"
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
    <div className="max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-bold text-slate-900">Mon profil</h2>
      <p className="mt-0.5 text-sm text-slate-500">Ces informations apparaissent pour votre équipe.</p>
      {loading ? (
        <div className="mt-4 flex flex-col gap-4">
          <Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="st-email">Email (identifiant de connexion)</Label>
            <Input id="st-email" value={profile?.email ?? ''} disabled className="bg-slate-50 text-slate-500" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="st-name">Nom complet *</Label>
            <Input id="st-name" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={80} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="st-phone">Téléphone</Label>
            <Input id="st-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="06 12 34 56 78" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="st-address">Adresse</Label>
            <Input id="st-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="12 rue de Exemple, Paris" />
          </div>
          <div>
            <Button
              className="h-10 bg-[#E23F2B] font-bold text-white hover:bg-[#c93725]"
              disabled={busy || fullName.trim().length < 2}
              onClick={() => void save()}
            >
              {busy ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================
// Onglet Propriétés — renvoi vers le portfolio (source de vérité)
// =============================================================

function PropertiesTab() {
  const { properties, plan } = useHostContext();
  return (
    <div className="max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-bold text-slate-900">Mes biens</h2>
      <p className="mt-0.5 text-sm text-slate-500">
        La gestion complète (création, édition, plaques) se fait depuis « Mes Propriétés ».
      </p>
      <ul className="mt-4 flex flex-col gap-2">
        {properties.map((p) => (
          <li key={p.id} className="flex items-center gap-3 rounded-lg border border-slate-100 p-3">
            <span aria-hidden="true" className="text-xl">🏠</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-900">{p.name}</p>
              <p className="truncate text-xs text-slate-500">{p.address ?? 'Adresse non renseignée'}</p>
            </div>
            <Link href="/airbnb/properties" className="shrink-0 text-xs font-bold text-[#E23F2B] hover:underline">
              Gérer →
            </Link>
          </li>
        ))}
      </ul>
      {plan && (
        <p className="mt-4 text-xs text-slate-400">
          Plan {plan.planName} — {plan.ownedCount}/{plan.maxProperties} biens.
        </p>
      )}
    </div>
  );
}

// =============================================================
// Onglet Notifications — GET/PUT /api/airbnb/notifications/prefs
// =============================================================

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
    <div className="max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-bold text-slate-900">Choisissez quels événements vous alertent</h2>
      <p className="mt-0.5 text-sm text-slate-500">
        Par canal : email et notification push (l&apos;application doit avoir autorisé les push).
      </p>
      {loading || !prefs ? (
        <div className="mt-4 flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : (
        <>
          <ul className="mt-4 flex flex-col divide-y divide-slate-100">
            {NOTIFICATION_EVENTS.map((ev) => (
              <li key={ev.key} className="flex items-center gap-3 py-3">
                <span aria-hidden="true" className="text-xl">{ev.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900">{ev.label}</p>
                  <p className="text-xs text-slate-500">{ev.description}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    ✉️
                    <Switch
                      checked={prefs[ev.key]?.email ?? true}
                      onCheckedChange={() => toggle(ev.key, 'email')}
                      aria-label={`Email pour ${ev.label}`}
                    />
                  </label>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    📲
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
          <div className="mt-4 flex items-center gap-3">
            <Button
              className="h-10 bg-[#E23F2B] font-bold text-white hover:bg-[#c93725]"
              disabled={!dirty || saving}
              onClick={() => void save()}
            >
              {saving ? 'Enregistrement…' : 'Enregistrer les préférences'}
            </Button>
            {!dirty && <span className="text-xs text-slate-400">Aucune modification en attente</span>}
          </div>
        </>
      )}
    </div>
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
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
          <KeyRound className="h-4 w-4 text-slate-400" aria-hidden="true" /> Changer de mot de passe
        </h2>
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sec-cur">Mot de passe actuel</Label>
            <Input id="sec-cur" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sec-new">Nouveau mot de passe</Label>
            <Input id="sec-new" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
            {next.length > 0 && (
              <p className={cn('text-xs', strengthOk ? 'text-emerald-600' : 'text-amber-600')}>
                {strengthOk
                  ? '✓ Format valide (8+ caractères, 1 lettre, 1 chiffre)'
                  : '8 caractères minimum, avec au moins une lettre et un chiffre'}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sec-conf">Confirmer le nouveau mot de passe</Label>
            <Input id="sec-conf" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            {confirm.length > 0 && confirm !== next && (
              <p className="text-xs text-rose-600">Les mots de passe ne correspondent pas.</p>
            )}
          </div>
          <div>
            <Button
              className="h-10 bg-[#E23F2B] font-bold text-white hover:bg-[#c93725]"
              disabled={busy || !current || !strengthOk || next !== confirm}
              onClick={() => void changePassword()}
            >
              {busy ? 'Vérification…' : 'Mettre à jour le mot de passe'}
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-slate-900">Double authentification (2FA)</h2>
        <p className="mt-1 text-sm text-slate-600">
          État actuel : <span className="font-bold text-slate-900">Non configurée</span> sur ce compte.
        </p>
        <p className="mt-2 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
          La 2FA TOTP (application d&apos;authentification) sera disponible prochainement — elle
          nécessite l&apos;intégration de l&apos;étape de vérification à la connexion. Le changement
          de mot de passe ci-dessus est effectif immédiatement et appliqué par bcrypt côté serveur.
        </p>
      </div>
    </div>
  );
}

// =============================================================
// Onglet Intégrations — webhooks réels + Stripe + iCal
// =============================================================

function IntegrationsTab() {
  const [webhooks, setWebhooks] = useState<WebhookRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/client/webhooks', { cache: 'no-store' });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { webhooks?: WebhookRow[] };
        if (alive) setWebhooks(data.webhooks ?? []);
      } catch {
        if (alive) setWebhooks([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {/* Stripe */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-slate-900">💳 Stripe (abonnement &amp; paiements)</h2>
        <p className="mt-1 text-sm text-slate-600">
          Les paiements invités et votre abonnement sont traités par Stripe. Le portail client vous
          permet de gérer vos moyens de paiement et vos factures.
        </p>
        <Link
          href="/airbnb/billing"
          className="mt-3 inline-flex h-9 items-center rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
        >
          Ouvrir la facturation →
        </Link>
      </div>

      {/* iCal */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-slate-900">📅 Calendriers iCal (Airbnb, Booking, Abritel)</h2>
        <p className="mt-1 text-sm text-slate-600">
          Connectez les calendriers externes de vos biens pour importer automatiquement les séjours
          dans votre planning.
        </p>
        <Link
          href="/airbnb/calendar"
          className="mt-3 inline-flex h-9 items-center rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
        >
          Ouvrir le calendrier →
        </Link>
      </div>

      {/* Webhooks */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-slate-900">🔗 Webhooks</h2>
        <p className="mt-1 text-sm text-slate-600">
          Recevez un appel HTTP à chaque scan, message invité ou entrée de livre d&apos;or.
          {webhooks && webhooks.length === 0 && ' Aucun webhook configuré sur vos biens pour le moment.'}
        </p>
        {webhooks && webhooks.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {webhooks.slice(0, 5).map((w) => (
              <li key={w.id} className="rounded-lg border border-slate-100 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-bold text-slate-900">{w.name}</p>
                  <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold', w.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                    {w.isActive ? 'Actif' : 'Inactif'}
                  </span>
                </div>
                <p className="truncate text-xs text-slate-400">{w.url}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {w.successCount} succès · {w.failCount} échec(s)
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
