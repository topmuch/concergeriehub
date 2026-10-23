'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

// =============================================================
// v4.74 « SMART PROMPTS » — CONFIGURATION CÔTÉ HÔTE
// Page /airbnb/properties/[id]/notifications : les 4 notifications
// temporelles qui s'affichent seules dans le Hub Invité au bon
// moment du séjour, sauvegardées via
// GET/POST /api/airbnb/properties/[id]/notification-settings :
//   Petit-déjeuner → enableBreakfast / breakfastTime / Message
//   Déjeuner       → enableLunch / lunchTime / lunchMessage
//   Dîner          → enableDinner / dinnerTime / dinnerMessage
//   Veille de départ → enableCheckoutReminder / checkoutReminderTime /
//     checkoutReminderMessage (déclenchée uniquement la veille du départ)
// + durée d'affichage (10–60 min) et recommandations de restaurants.
// v5.2 « SAPHIR LUXE » — refonte design (aucune logique modifiée) :
// cartes lux-card, typographie sans icône, inputs sombres bleutés.
// L'APERÇU repose à l'identique le style de la carte INVITÉ
// (hub-premium/smart-notification.tsx) et est volontairement conservé
// tel quel — il représente le rendu réel côté hub, hors thème hôte.
// =============================================================

// ── Types ────────────────────────────────────────────────────────

type NotifType = 'breakfast' | 'lunch' | 'dinner' | 'checkout_reminder';

/** Objet complet attendu par l'API (zod : tous les champs requis). */
interface NotificationSettings {
  enableBreakfast: boolean;
  breakfastTime: string;
  breakfastMessage: string;
  enableLunch: boolean;
  lunchTime: string;
  lunchMessage: string;
  enableDinner: boolean;
  dinnerTime: string;
  dinnerMessage: string;
  enableCheckoutReminder: boolean;
  checkoutReminderTime: string;
  checkoutReminderMessage: string;
  displayDuration: number;
  enableRestaurantRecommendations: boolean;
}

type EnabledKey = 'enableBreakfast' | 'enableLunch' | 'enableDinner' | 'enableCheckoutReminder';
type TimeKey = 'breakfastTime' | 'lunchTime' | 'dinnerTime' | 'checkoutReminderTime';
type MessageKey =
  | 'breakfastMessage'
  | 'lunchMessage'
  | 'dinnerMessage'
  | 'checkoutReminderMessage';

// ── Constantes ───────────────────────────────────────────────────

/** Borne inférieure / supérieure de la durée d'affichage (miroir API). */
const DISPLAY_MIN = 10;
const DISPLAY_MAX = 60;
const MESSAGE_MAX = 160;
const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Valeurs par défaut — uniquement l'état d'amorçage avant le GET
 * (l'API renvoie toujours un objet complet, normalisé côté serveur).
 * Miroir de DEFAULT_NOTIFICATION_SETTINGS (@/lib/smart-notifications).
 */
const DEFAULT_SETTINGS: NotificationSettings = {
  enableBreakfast: true,
  breakfastTime: '08:00',
  breakfastMessage: '☀️ Bonjour ! Souhaitez-vous commander votre petit-déjeuner ce matin ?',
  enableLunch: true,
  lunchTime: '12:00',
  lunchMessage: "🍽️ C'est l'heure du déjeuner ! Découvrez nos suggestions.",
  enableDinner: true,
  dinnerTime: '19:00',
  dinnerMessage: "🌙 Bonne soirée ! Envie d'un dîner ou d'une réservation au restaurant ?",
  enableCheckoutReminder: true,
  checkoutReminderTime: '18:00',
  checkoutReminderMessage: '🛍️ Demain est votre dernier jour ! Découvrez notre boutique de souvenirs.',
  displayDuration: 30,
  enableRestaurantRecommendations: true,
};

interface NotifCardMeta {
  type: NotifType;
  /** Titre de la carte côté hôte. */
  label: string;
  /** Titre SERIF affiché à l'invité dans la carte (miroir du hook hub). */
  guestTitle: string;
  hint: string;
  enabledKey: EnabledKey;
  timeKey: TimeKey;
  messageKey: MessageKey;
  placeholder: string;
}

const NOTIF_CARDS: NotifCardMeta[] = [
  {
    type: 'breakfast',
    label: 'Petit-déjeuner',
    guestTitle: 'Petit-déjeuner',
    hint: 'Affichée au réveil pour proposer vos formules du matin (livraison, panier gourmand…).',
    enabledKey: 'enableBreakfast',
    timeKey: 'breakfastTime',
    messageKey: 'breakfastMessage',
    placeholder: 'ex : ☀️ Bonjour ! Souhaitez-vous commander votre petit-déjeuner ce matin ?',
  },
  {
    type: 'lunch',
    label: 'Déjeuner',
    guestTitle: 'Déjeuner',
    hint: 'Affichée à midi pour suggérer vos plats, adresses ou services autour du logement.',
    enabledKey: 'enableLunch',
    timeKey: 'lunchTime',
    messageKey: 'lunchMessage',
    placeholder: "ex : 🍽️ C'est l'heure du déjeuner ! Découvrez nos suggestions.",
  },
  {
    type: 'dinner',
    label: 'Dîner',
    guestTitle: 'Dîner',
    hint: 'Affichée en soirée pour proposer un dîner, une réservation ou une bouteille au frais.',
    enabledKey: 'enableDinner',
    timeKey: 'dinnerTime',
    messageKey: 'dinnerMessage',
    placeholder: "ex : 🌙 Bonne soirée ! Envie d'un dîner ou d'une réservation au restaurant ?",
  },
  {
    type: 'checkout_reminder',
    label: 'Veille de départ',
    guestTitle: 'Souvenirs & cadeaux',
    hint: 'Affichée UNIQUEMENT la veille du départ — dernier moment pour la boutique de souvenirs.',
    enabledKey: 'enableCheckoutReminder',
    timeKey: 'checkoutReminderTime',
    messageKey: 'checkoutReminderMessage',
    placeholder: 'ex : 🛍️ Demain est votre dernier jour ! Découvrez notre boutique de souvenirs.',
  },
];

/**
 * Métadonnées de l'APERÇU — copiées à l'identique de TYPE_META de la
 * carte invité (hub-premium/smart-notification.tsx) pour un rendu
 * pixel-faithful (gradients ambré / émeraude / violet / rose).
 */
const PREVIEW_META: Record<
  NotifType,
  { emoji: string; label: string; wrap: string; ring: string; bar: string; accent: string }
> = {
  breakfast: {
    emoji: '☕',
    label: 'Petit-déjeuner',
    wrap: 'from-amber-50/95 via-orange-50/90 to-white/90 dark:from-[#22190C]/95 dark:via-[#1A1309]/90 dark:to-[#121009]/95',
    ring: 'border-amber-200/80 dark:border-[#D4AF37]/25',
    bar: 'from-amber-400 to-orange-500 dark:from-[#D4AF37] dark:to-amber-600',
    accent: 'text-amber-700 dark:text-[#E7C66B]',
  },
  lunch: {
    emoji: '🍽️',
    label: 'Déjeuner',
    wrap: 'from-emerald-50/95 via-teal-50/90 to-white/90 dark:from-[#0C1F16]/95 dark:via-[#0A1710]/90 dark:to-[#091009]/95',
    ring: 'border-emerald-200/80 dark:border-emerald-400/25',
    bar: 'from-emerald-400 to-teal-500 dark:from-emerald-400 dark:to-teal-500',
    accent: 'text-emerald-700 dark:text-emerald-300',
  },
  dinner: {
    emoji: '🌙',
    label: 'Dîner',
    wrap: 'from-violet-50/95 via-purple-50/90 to-white/90 dark:from-[#1A0F22]/95 dark:via-[#130A1A]/90 dark:to-[#0E0812]/95',
    ring: 'border-violet-200/80 dark:border-violet-400/25',
    bar: 'from-violet-400 to-purple-500 dark:from-violet-400 dark:to-purple-500',
    accent: 'text-violet-700 dark:text-violet-300',
  },
  checkout_reminder: {
    emoji: '🛍️',
    label: 'Souvenirs',
    wrap: 'from-rose-50/95 via-pink-50/90 to-white/90 dark:from-[#23100F]/95 dark:via-[#180B0B]/90 dark:to-[#120809]/95',
    ring: 'border-rose-200/80 dark:border-rose-400/25',
    bar: 'from-rose-400 to-pink-500 dark:from-rose-400 dark:to-pink-500',
    accent: 'text-rose-700 dark:text-rose-300',
  },
};

// ── Composant ────────────────────────────────────────────────────

export function NotificationsContent({ initialPropertyId }: { initialPropertyId: string }) {
  const [properties, setProperties] = useState<{ id: string; name: string }[]>([]);
  const [propertyId, setPropertyId] = useState(initialPropertyId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState<NotificationSettings>({ ...DEFAULT_SETTINGS });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewType, setPreviewType] = useState<NotifType>('breakfast');

  // ── Chargement (liste des biens + réglages du bien courant) ──
  const load = useCallback(async (pid: string) => {
    setLoading(true);
    setError('');
    try {
      const [propsRes, settingsRes] = await Promise.all([
        fetch('/api/airbnb/properties', { cache: 'no-store' }),
        fetch(`/api/airbnb/properties/${encodeURIComponent(pid)}/notification-settings`, {
          cache: 'no-store',
        }),
      ]);
      const propsJson = (await propsRes.json().catch(() => null)) as
        | { properties?: { id: string; name: string }[]; error?: string }
        | null;
      const settingsJson = (await settingsRes.json().catch(() => null)) as
        | { ok?: boolean; settings?: NotificationSettings; error?: string }
        | null;

      if (!propsRes.ok || !propsJson?.properties) {
        setError(propsJson?.error || 'Impossible de charger vos biens.');
        return;
      }
      if (!settingsRes.ok || !settingsJson?.ok || !settingsJson.settings) {
        // 401 / 403 / 500 — le message API est explicite (zod côté POST).
        setError(settingsJson?.error || 'Impossible de charger les notifications.');
        return;
      }

      setProperties(propsJson.properties.map((p) => ({ id: p.id, name: p.name })));
      const s = settingsJson.settings;
      setSettings({
        ...s,
        displayDuration: Math.min(DISPLAY_MAX, Math.max(DISPLAY_MIN, s.displayDuration || 30)),
      });
      setDirty(false);
    } catch {
      setError('Connexion impossible. Réessayez.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(initialPropertyId);
  }, [load, initialPropertyId]);

  const changeProperty = (pid: string) => {
    if (pid === propertyId) return;
    if (dirty && !window.confirm('Des modifications ne sont pas enregistrées — changer de bien ?')) {
      return;
    }
    setPropertyId(pid);
    void load(pid);
  };

  // ── Mise à jour du brouillon (marque « dirty » automatiquement) ──
  const patch = (p: Partial<NotificationSettings>) => {
    setSettings((prev) => ({ ...prev, ...p }));
    setDirty(true);
  };

  const setCardField = (c: NotifCardMeta, key: 'time' | 'message', value: string) => {
    const field = key === 'time' ? c.timeKey : c.messageKey;
    patch({ [field]: value } as Partial<NotificationSettings>);
  };

  const setCardEnabled = (c: NotifCardMeta, enabled: boolean) =>
    patch({ [c.enabledKey]: enabled } as Partial<NotificationSettings>);

  // ── Sauvegarde (POST — l'objet COMPLET est requis par le zod) ──
  const save = async () => {
    if (!propertyId) return;
    // Pré-validation client (miroir du schéma zod serveur) : sur une
    // carte activée, heure et message sont obligatoires.
    for (const c of NOTIF_CARDS) {
      if (!settings[c.enabledKey]) continue;
      if (!HHMM_RE.test(settings[c.timeKey])) {
        toast.error(`${c.label} : choisissez une heure d'affichage valide (HH:mm).`);
        return;
      }
      if (!settings[c.messageKey].trim()) {
        toast.error(`${c.label} : le message affiché à l'invité est requis.`);
        return;
      }
    }
    setSaving(true);
    try {
      const res = await fetch(
        `/api/airbnb/properties/${encodeURIComponent(propertyId)}/notification-settings`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settings),
        },
      );
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; settings?: NotificationSettings; error?: string }
        | null;
      if (!res.ok || !json?.ok) {
        toast.error(json?.error || 'Enregistrement impossible.');
        return;
      }
      if (json.settings) {
        setSettings({
          ...json.settings,
          displayDuration: Math.min(
            DISPLAY_MAX,
            Math.max(DISPLAY_MIN, json.settings.displayDuration || 30),
          ),
        });
      }
      setDirty(false);
      toast.success('Paramètres sauvegardés ✓');
    } catch {
      toast.error('Connexion impossible. Réessayez.');
    } finally {
      setSaving(false);
    }
  };

  // ── Données dérivées pour l'aperçu ──
  const previewCard = NOTIF_CARDS.find((c) => c.type === previewType) ?? NOTIF_CARDS[0];
  const previewMeta = PREVIEW_META[previewCard.type];
  const previewEnabled = settings[previewCard.enabledKey];
  const previewMessage = settings[previewCard.messageKey];

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-8">
      {/* ----- En-tête + switch propriété ----- */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
      >
        <div className="min-w-0">
          <p className="lux-eyebrow">Espace hôte</p>
          <h1 className="lux-display mt-1.5 text-2xl font-semibold text-white">
            Notifications intelligentes
          </h1>
          <p className="mt-1 text-sm text-[#8fabc2]">
            Des cartes élégantes s&rsquo;affichent automatiquement dans le hub de vos invités au bon
            moment — repas, veille de départ — pour booster vos commandes.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {properties.length > 0 && (
            <Select value={propertyId} onValueChange={changeProperty}>
              <SelectTrigger className="w-full rounded-full border-white/12 bg-white/[0.04] text-white sm:w-56" aria-label="Choisir le bien">
                <SelectValue placeholder="Choisir un bien" />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-[#0b1226] text-white">
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="focus:bg-white/8 focus:text-white">
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </motion.div>

      {loading && <LoadingSkeleton />}

      {!loading && error && (
        <div
          className="lux-empty flex flex-col items-center gap-3 rounded-2xl p-8 text-center"
          role="alert"
        >
          <p className="lux-display text-lg font-semibold text-white">{error}</p>
          <button
            type="button"
            onClick={() => void load(propertyId || initialPropertyId)}
            className="lux-btn-ghost"
          >
            Réessayer
          </button>
        </div>
      )}

      {!loading && !error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="flex flex-col gap-5"
        >
          {/* ═══════════ APERÇU EN DIRECT ═══════════ */}
          <section className="lux-card rounded-2xl p-5 sm:p-6" aria-label="Aperçu en direct">
            <div className="flex items-start gap-3">
              <div className="min-w-0">
                <h2 className="lux-display text-lg font-semibold text-white">Aperçu en direct</h2>
                <p className="mt-0.5 text-xs text-[#8fabc2] sm:text-sm">
                  Exactement ce que verront vos invités — la carte se met à jour au fil de vos
                  réglages.
                </p>
              </div>
            </div>

            {/* Sélecteur du type à prévisualiser */}
            <div
              className="mt-4 flex flex-wrap gap-2"
              role="group"
              aria-label="Choisir la notification à prévisualiser"
            >
              {NOTIF_CARDS.map((c) => {
                const active = previewType === c.type;
                return (
                  <button
                    key={c.type}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPreviewType(c.type)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5cadf0]/50',
                      active
                        ? 'border-[#5cadf0]/50 bg-[#5cadf0]/15 text-white'
                        : 'border-white/10 bg-white/[0.03] text-[#8fabc2] hover:bg-white/[0.06] hover:text-white',
                    )}
                  >
                    {c.label}
                    <span
                      aria-hidden="true"
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        settings[c.enabledKey] ? 'bg-[#34d399]' : 'bg-white/20',
                      )}
                    />
                  </button>
                );
              })}
            </div>

            {/* Carte = rendu invité (miroir de smart-notification.tsx).
                lux-keep-dark : en mode « Jour », cet aperçu reste rendu
                exactement comme sur le téléphone (v5.3). */}
            <div className="mx-auto mt-5 w-full max-w-md">
              <div
                className={cn(
                  'lux-keep-dark relative overflow-hidden rounded-3xl border bg-gradient-to-br shadow-[0_30px_70px_-24px_rgba(15,23,42,0.45)] backdrop-blur-xl transition-opacity dark:shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85)]',
                  previewMeta.wrap,
                  previewMeta.ring,
                  !previewEnabled && 'opacity-50 saturate-50',
                )}
              >
                {/* Barre de progression factice (aperçu statique) */}
                <div className="absolute inset-x-0 top-0 h-1 bg-slate-200/70 dark:bg-white/10">
                  <div
                    className={cn('h-full bg-gradient-to-r', previewMeta.bar)}
                    style={{ width: '72%' }}
                  />
                </div>

                <div className="flex items-start gap-4 p-5 pt-6">
                  <span
                    aria-hidden="true"
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-3xl shadow-md dark:bg-white/10"
                  >
                    {previewMeta.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'text-[10px] font-bold uppercase tracking-[0.18em]',
                        previewMeta.accent,
                      )}
                    >
                      {previewMeta.label}
                    </p>
                    <h3 className="mt-0.5 font-serif text-lg font-bold text-slate-900 dark:text-[#F5EFE6]">
                      {previewCard.guestTitle}
                    </h3>
                    <p className="mt-1 break-words text-sm leading-relaxed text-slate-600 dark:text-[#C9BFAE]">
                      {previewMessage || '—'}
                    </p>
                    <span
                      aria-hidden="true"
                      className="air-gradient mt-3 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-white shadow-md"
                    >
                      Voir les options
                      <span>→</span>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 px-5 pb-3 text-[11px] text-slate-400 dark:text-slate-500">
                  <span aria-hidden="true">⏳</span>
                  <span>Disponible encore {settings.displayDuration} min</span>
                </div>
              </div>

              {!previewEnabled && (
                <p className="mt-2 text-center text-xs font-semibold text-[#fbbf24]">
                  Notification désactivée — vos invités ne verront pas cette carte.
                </p>
              )}
            </div>
          </section>

          {/* ═══════════ LES 4 NOTIFICATIONS ═══════════ */}
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {NOTIF_CARDS.map((c) => {
              const enabled = settings[c.enabledKey];
              return (
                <section
                  key={c.type}
                  aria-label={`Notification ${c.label}`}
                  className={cn(
                    'rounded-2xl border p-5 transition-colors sm:p-6',
                    enabled
                      ? 'lux-card'
                      : 'border-dashed border-white/12 bg-white/[0.015]',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="lux-display text-lg font-semibold text-white">{c.label}</h2>
                      <p className="mt-0.5 text-xs text-[#8fabc2] sm:text-sm">{c.hint}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={cn(
                          'text-xs font-semibold',
                          enabled ? 'text-[#86e9cb]' : 'text-[#8fabc2]',
                        )}
                      >
                        {enabled ? 'Activée' : 'Désactivée'}
                      </span>
                      <Switch
                        checked={enabled}
                        onCheckedChange={(v) => setCardEnabled(c, v)}
                        aria-label={`${enabled ? 'Désactiver' : 'Activer'} la notification ${c.label}`}
                      />
                    </div>
                  </div>

                  {/* Champs repliés quand la carte est OFF — restent
                      MONTÉS (inert) pour préserver l'état de saisie. */}
                  <div
                    inert={!enabled}
                    aria-hidden={!enabled}
                    className={cn(
                      'grid gap-4 transition-all duration-300 ease-out',
                      enabled
                        ? 'mt-4 max-h-[480px] opacity-100'
                        : 'pointer-events-none mt-0 max-h-0 overflow-hidden opacity-0',
                    )}
                  >
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`notif-time-${c.type}`} className="text-xs font-semibold text-[#8fabc2]">
                        Heure d&rsquo;affichage
                      </Label>
                      <Input
                        id={`notif-time-${c.type}`}
                        type="time"
                        value={settings[c.timeKey]}
                        onChange={(e) => setCardField(c, 'time', e.target.value)}
                        className="w-40 rounded-xl border-white/12 bg-white/[0.04] text-white focus-visible:ring-[#5cadf0]/50"
                      />
                      <p className="text-xs text-[#8fabc2]/70">
                        La carte apparaît ±5 minutes autour de cette heure.
                      </p>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`notif-message-${c.type}`} className="text-xs font-semibold text-[#8fabc2]">
                        Message personnalisé
                      </Label>
                      <Textarea
                        id={`notif-message-${c.type}`}
                        value={settings[c.messageKey]}
                        onChange={(e) => setCardField(c, 'message', e.target.value)}
                        maxLength={MESSAGE_MAX}
                        rows={3}
                        placeholder={c.placeholder}
                        className="rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fabc2]/60 focus-visible:ring-[#5cadf0]/50"
                      />
                      <p className="text-xs text-[#8fabc2]/70">
                        {settings[c.messageKey].length}/{MESSAGE_MAX}
                      </p>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>

          {/* ═══════════ RÉGLAGES GLOBAUX ═══════════ */}
          <section className="lux-card rounded-2xl p-5 sm:p-6" aria-label="Réglages globaux">
            <div className="min-w-0">
              <h2 className="lux-display text-lg font-semibold text-white">Affichage &amp; options</h2>
              <p className="mt-0.5 text-xs text-[#8fabc2] sm:text-sm">
                Communs à toutes les cartes — discrétion garantie : le hub reste utilisable
                dessous.
              </p>
            </div>

            {/* Durée d'affichage */}
            <div className="mt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="notif-duration" className="text-sm font-semibold text-white">
                  Durée d&rsquo;affichage de la carte
                </Label>
                <span className="lux-chip">
                  <span className="lux-num text-sm text-white">{settings.displayDuration}</span>
                  minutes
                </span>
              </div>
              <Slider
                id="notif-duration"
                value={[settings.displayDuration]}
                min={DISPLAY_MIN}
                max={DISPLAY_MAX}
                step={5}
                onValueChange={(values) =>
                  patch({
                    displayDuration: Math.min(
                      DISPLAY_MAX,
                      Math.max(DISPLAY_MIN, values[0] ?? settings.displayDuration),
                    ),
                  })
                }
                aria-label="Durée d'affichage des notifications"
                className="mt-3 w-full max-w-md"
              />
              <div className="mt-1 flex max-w-md justify-between text-[11px] text-[#8fabc2]/70">
                <span>{DISPLAY_MIN} min</span>
                <span>{DISPLAY_MAX} min</span>
              </div>
              <p className="mt-1.5 text-xs text-[#8fabc2]/70">
                Après ce délai, la carte disparaît d&rsquo;elle-même (fermable à tout moment par
                l&rsquo;invité).
              </p>
            </div>

            {/* Recommandations de restaurants */}
            <div className="mt-5 border-t border-white/8 pt-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Label
                    htmlFor="notif-restaurants"
                    className="text-sm font-semibold text-white"
                  >
                    Inclure les recommandations de restaurants à proximité
                  </Label>
                  <p className="mt-0.5 text-xs text-[#8fabc2]">
                    Ajoute sous les cartes repas des adresses recommandées autour du logement.
                  </p>
                </div>
                <Switch
                  id="notif-restaurants"
                  checked={settings.enableRestaurantRecommendations}
                  onCheckedChange={(v) => patch({ enableRestaurantRecommendations: v })}
                  aria-label="Inclure les recommandations de restaurants à proximité"
                  className="mt-1"
                />
              </div>
            </div>
          </section>

          {/* ----- Barre d'enregistrement sticky ----- */}
          <div
            className={cn(
              'sticky bottom-4 z-30 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#0b1226]/90 p-3 shadow-[0_18px_44px_-24px_rgba(2,6,18,0.9)] backdrop-blur',
              dirty && 'border-[#fbbf24]/40',
            )}
          >
            <p className="text-sm font-semibold text-white" aria-live="polite">
              {dirty ? 'Modifications non enregistrées' : '✓ Tout est à jour'}
            </p>
            <Button
              onClick={() => void save()}
              disabled={saving || loading || !propertyId}
              className="lux-btn gap-2 rounded-full px-5 font-semibold"
              aria-label="Enregistrer les notifications intelligentes"
            >
              {saving && (
                <span
                  className="lux-dot animate-pulse"
                  style={{ backgroundColor: '#a9d8ff' }}
                  aria-hidden="true"
                />
              )}
              Enregistrer
            </Button>
          </div>

          {/* ----- État vide : aucun bien ----- */}
          {properties.length === 0 && (
            <div className="lux-empty rounded-2xl p-10 text-center">
              <h2 className="lux-display text-lg font-semibold text-white">Aucun bien</h2>
              <p className="mt-1 text-xs text-[#8fabc2]">
                Ajoutez d&rsquo;abord un bien pour configurer ses notifications intelligentes.
              </p>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

// =============================================================
// Helpers de rendu
// =============================================================

function LoadingSkeleton() {
  return (
    <div
      className="flex flex-col gap-4"
      aria-busy="true"
      aria-label="Chargement des notifications intelligentes"
    >
      <Skeleton className="h-10 w-64 rounded-full bg-white/8" aria-hidden="true" />
      <Skeleton className="h-72 w-full rounded-2xl bg-white/8" aria-hidden="true" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-48 w-full rounded-2xl bg-white/8" aria-hidden="true" />
        <Skeleton className="h-48 w-full rounded-2xl bg-white/8" aria-hidden="true" />
        <Skeleton className="h-48 w-full rounded-2xl bg-white/8" aria-hidden="true" />
        <Skeleton className="h-48 w-full rounded-2xl bg-white/8" aria-hidden="true" />
      </div>
      <Skeleton className="h-40 w-full rounded-2xl bg-white/8" aria-hidden="true" />
    </div>
  );
}
