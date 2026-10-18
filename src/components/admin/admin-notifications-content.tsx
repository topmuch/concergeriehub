'use client';

// =============================================================
// AdminNotificationsContent — v4.74 PHASE 5 « Smart Prompts »
// -------------------------------------------------------------
// Console Superadmin — contrôle global des notifications :
//   • 4 KPIs (biens configurés, notifications 30 j par type,
//     commandes + CA souvenirs 30 j, conversions 24 h) ;
//   • kill switch « Interruption globale » (tous hubs, tous hôtes) ;
//   • messages par défaut (templates) appliqués aux nouveaux hôtes.
// API : GET/PATCH /api/admin/notification-settings (Superadmin).
// Refonte « SAPHIR LUXE » : sombre bleuté, sans icônes.
// =============================================================
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

// ── Types (contrat API) ──────────────────────────────────────
type NotificationType = 'breakfast' | 'lunch' | 'dinner' | 'checkout_reminder';

interface StatsPayload {
  configuredProperties: number;
  logs30d: { type: NotificationType; count: number }[];
  souvenirOrders30d: number;
  souvenirRevenue30d: number;
  conversions30d: number;
}

interface SettingsPayload {
  ok: boolean;
  globalDisabled: boolean;
  templates: Record<NotificationType, string>;
  stats: StatsPayload;
}

type TemplatesDraft = Record<NotificationType, string>;

const TEMPLATE_FIELDS: { key: NotificationType; label: string }[] = [
  { key: 'breakfast', label: 'Petit-déjeuner' },
  { key: 'lunch', label: 'Déjeuner' },
  { key: 'dinner', label: 'Dîner' },
  { key: 'checkout_reminder', label: 'Veille de départ' },
];

const MAX_TEMPLATE_LENGTH = 160;

const eur = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;

// CTA « lux » — pilule saphir du design system.
const AIR_CTA_CLASS =
  'lux-btn inline-flex items-center justify-center rounded-full px-4 text-xs font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5c8af0]/50 disabled:pointer-events-none disabled:opacity-60';

// Couleurs des points par type de notification (décompte 30 j).
const TYPE_DOT: Record<NotificationType, string> = {
  breakfast: '#e9c47c',
  lunch: '#2dd4bf',
  dinner: '#cdb6ff',
  checkout_reminder: '#5c8af0',
};

export function AdminNotificationsContent() {
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Kill switch global (état serveur + retour optimiste).
  const [globalDisabled, setGlobalDisabled] = useState(false);
  const [savingGlobal, setSavingGlobal] = useState(false);

  // Brouillon des messages par défaut.
  const [draft, setDraft] = useState<TemplatesDraft>({
    breakfast: '',
    lunch: '',
    dinner: '',
    checkout_reminder: '',
  });
  const [savingTemplates, setSavingTemplates] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/admin/notification-settings', { cache: 'no-store' });
      const json = (await res.json()) as (Partial<SettingsPayload> & { error?: string }) | null;
      if (!res.ok || !json?.ok) {
        const msg = json?.error || 'Chargement impossible.';
        toast.error(msg);
        setLoadError(msg);
        setData(null);
        return;
      }
      const raw = (json.templates ?? {}) as Partial<Record<NotificationType, string>>;
      const templates: TemplatesDraft = {
        breakfast: typeof raw.breakfast === 'string' ? raw.breakfast : '',
        lunch: typeof raw.lunch === 'string' ? raw.lunch : '',
        dinner: typeof raw.dinner === 'string' ? raw.dinner : '',
        checkout_reminder: typeof raw.checkout_reminder === 'string' ? raw.checkout_reminder : '',
      };
      const stats = json.stats;
      const logs = stats?.logs30d;
      setData({
        ok: true,
        globalDisabled: json.globalDisabled ?? false,
        templates,
        stats: {
          configuredProperties: stats?.configuredProperties ?? 0,
          logs30d: Array.isArray(logs) ? logs : [],
          souvenirOrders30d: stats?.souvenirOrders30d ?? 0,
          souvenirRevenue30d: stats?.souvenirRevenue30d ?? 0,
          conversions30d: stats?.conversions30d ?? 0,
        },
      });
      setGlobalDisabled(json.globalDisabled ?? false);
      setDraft(templates);
    } catch {
      const msg = 'Connexion impossible. Réessayez.';
      toast.error(msg);
      setLoadError(msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Bascule le kill switch global (PATCH + retour optimiste). */
  async function toggleGlobal(next: boolean) {
    if (savingGlobal) return;
    setSavingGlobal(true);
    const prev = globalDisabled;
    setGlobalDisabled(next);
    try {
      const res = await fetch('/api/admin/notification-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ globalDisabled: next }),
      });
      const json = (await res.json()) as { ok?: boolean; globalDisabled?: boolean; error?: string };
      if (!res.ok) {
        toast.error(json.error || 'Mise à jour impossible.');
        setGlobalDisabled(prev);
        return;
      }
      setGlobalDisabled(json.globalDisabled ?? next);
      toast.success(next ? 'Notifications interrompues' : 'Notifications réactivées');
    } catch {
      toast.error('Connexion impossible. Réessayez.');
      setGlobalDisabled(prev);
    } finally {
      setSavingGlobal(false);
    }
  }

  /** Enregistre les messages par défaut (templates). */
  async function saveTemplates() {
    const payloads: TemplatesDraft = {
      breakfast: draft.breakfast.trim(),
      lunch: draft.lunch.trim(),
      dinner: draft.dinner.trim(),
      checkout_reminder: draft.checkout_reminder.trim(),
    };
    for (const field of TEMPLATE_FIELDS) {
      if (payloads[field.key].length < 1) {
        toast.error(`Le message « ${field.label} » ne peut pas être vide.`);
        return;
      }
    }
    setSavingTemplates(true);
    try {
      const res = await fetch('/api/admin/notification-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templates: payloads }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        templates?: Partial<Record<NotificationType, string>>;
        error?: string;
      };
      if (!res.ok) {
        toast.error(json.error || 'Enregistrement impossible.');
        return;
      }
      toast.success('Messages par défaut enregistrés ✓');
      if (json.templates) {
        const saved = json.templates;
        setDraft((d) => ({ ...d, ...saved }));
      }
    } catch {
      toast.error('Connexion impossible. Réessayez.');
    } finally {
      setSavingTemplates(false);
    }
  }

  // ── Dérivés KPIs ────────────────────────────────────────────
  const logsSum = data ? data.stats.logs30d.reduce((acc, l) => acc + l.count, 0) : 0;
  const logsCount = (t: NotificationType) => data?.stats.logs30d.find((l) => l.type === t)?.count ?? 0;
  const conversionPct =
    data && logsSum > 0 ? ((data.stats.conversions30d / logsSum) * 100).toFixed(0) : null;

  function counterTone(length: number): string {
    if (length >= MAX_TEMPLATE_LENGTH) return 'text-[#f07d6a]';
    if (length >= MAX_TEMPLATE_LENGTH - 20) return 'text-[#fbbf24]';
    return 'text-[#8fa0c2]';
  }

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col gap-2">
        <div>
          <p className="lux-eyebrow">Smart Prompts</p>
          <h1 className="lux-display mt-1 text-2xl font-semibold text-white">Notifications intelligentes</h1>
          <p className="text-sm text-[#8fa0c2]">
            Contrôle global des Smart Prompts affichés dans les hubs invités — messages par défaut des
            nouveaux hôtes et impact sur les commandes.
          </p>
        </div>
      </div>

      {loading ? (
        /* Chargement — squelettes */
        <div className="space-y-6" aria-busy="true">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="lux-card flex items-center gap-3 p-4">
                <Skeleton className="h-10 w-10 shrink-0 rounded-xl bg-white/8" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-3 w-28 bg-white/8" />
                  <Skeleton className="h-5 w-16 bg-white/8" />
                </div>
              </div>
            ))}
          </div>
          <div className="lux-card flex items-center justify-between gap-4 p-4 sm:p-6">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-5 w-48 bg-white/8" />
              <Skeleton className="h-4 w-full max-w-xl bg-white/8" />
            </div>
            <Skeleton className="h-7 w-12 shrink-0 rounded-full bg-white/8" />
          </div>
          <div className="lux-card space-y-4 p-4 sm:p-6">
            <Skeleton className="h-5 w-72 bg-white/8" />
            <div className="grid gap-4 md:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-36 bg-white/8" />
                  <Skeleton className="h-16 w-full rounded-xl bg-white/8" />
                </div>
              ))}
            </div>
            <Skeleton className="ml-auto h-10 w-64 rounded-full bg-white/8" />
          </div>
        </div>
      ) : loadError || !data ? (
        /* Erreur — bloc lux + réessayer */
        <div
          className="lux-empty flex flex-col gap-3 rounded-2xl px-4 py-3 sm:flex-row sm:items-center"
          role="alert"
        >
          <span aria-hidden="true" className="lux-dot shrink-0" style={{ backgroundColor: '#f07d6a' }} />
          <p className="min-w-0 flex-1 text-sm font-medium text-[#f07d6a]">
            {loadError ?? 'Une erreur est survenue.'}
          </p>
          <button type="button" className={cn(AIR_CTA_CLASS, 'h-9 shrink-0')} onClick={() => void load()}>
            Réessayer
          </button>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="luxkpi luxkpi-gold">
              <p className="luxkpi-label">Biens configurés</p>
              <p className="luxkpi-value mt-2.5 truncate text-[28px] leading-none">{data.stats.configuredProperties}</p>
            </div>

            <div className="luxkpi luxkpi-sapphire">
              <p className="luxkpi-label">Notifications 30 j</p>
              <p className="luxkpi-value mt-2.5 truncate text-[28px] leading-none">{logsSum}</p>
              <p className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] font-medium text-white/80">
                {(Object.keys(TYPE_DOT) as NotificationType[]).map((t) => (
                  <span key={t} className="inline-flex items-center gap-1.5">
                    <span className="lux-dot !h-[5px] !w-[5px]" style={{ backgroundColor: TYPE_DOT[t] }} aria-hidden="true" />
                    {logsCount(t)}
                  </span>
                ))}
              </p>
            </div>

            <div className="luxkpi luxkpi-rose">
              <p className="luxkpi-label">Commandes souvenirs 30 j</p>
              <p className="luxkpi-value mt-2.5 truncate text-[28px] leading-none">
                {data.stats.souvenirOrders30d}
                <span className="ml-1.5 align-middle text-xs font-medium text-white/80">
                  {eur(data.stats.souvenirRevenue30d)}
                </span>
              </p>
            </div>

            <div className="luxkpi luxkpi-violet">
              <p className="luxkpi-label">Conversions 30 j</p>
              <p className="luxkpi-value mt-2.5 truncate text-[28px] leading-none">
                {data.stats.conversions30d}
              </p>
              {conversionPct !== null && <span className="luxkpi-chip">{conversionPct} %</span>}
              <p className="mt-2 text-[11px] font-medium text-white/80">
                commandes souvenir dans les 24 h après une notification
              </p>
            </div>
          </div>

          {/* Kill switch global */}
          <Card className={cn('lux-card', globalDisabled && 'border-[#f07d6a]/25 bg-[#f07d6a]/[0.08]')}>
            <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="lux-dot" style={{ backgroundColor: globalDisabled ? '#f07d6a' : '#34d399' }} aria-hidden="true" />
                  <h2 className="lux-display text-lg text-white">Interruption globale</h2>
                  <Badge
                    variant="outline"
                    className={
                      globalDisabled
                        ? 'border-[#f07d6a]/25 bg-[#f07d6a]/10 text-[#f07d6a]'
                        : 'border-[#34d399]/25 bg-[#34d399]/10 text-[#86e9cb]'
                    }
                  >
                    {globalDisabled ? 'ACTIVÉE — notifications coupées' : 'Notifications actives'}
                  </Badge>
                </div>
                <p className="text-sm text-[#8fa0c2]">
                  Coupe IMMÉDIATEMENT toutes les notifications de la plateforme (tous hubs, tous hôtes). À
                  utiliser en cas de bug.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3 sm:pl-6">
                {savingGlobal && (
                  <span className="text-xs text-[#8fa0c2]" role="status">
                    Enregistrement…
                  </span>
                )}
                <Switch
                  checked={globalDisabled}
                  onCheckedChange={(v) => void toggleGlobal(v)}
                  disabled={savingGlobal}
                  aria-label="Interruption globale des notifications"
                  className="h-7 w-12 data-[state=checked]:bg-[#f07d6a] [&_[data-slot=switch-thumb]]:size-5"
                />
              </div>
            </CardContent>
          </Card>

          {/* Messages par défaut (templates) */}
          <Card className="lux-card">
            <CardContent className="space-y-4 p-4 sm:p-6">
              <div>
                <p className="lux-eyebrow">Templates</p>
                <h2 className="lux-display mt-1 text-lg text-white">Messages par défaut des nouveaux hôtes</h2>
                <p className="mt-1 text-sm text-[#8fa0c2]">
                  Ces messages sont les valeurs PAR DÉFAUT appliquées aux nouveaux hôtes — chaque hôte peut
                  les personnaliser pour son bien.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {TEMPLATE_FIELDS.map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <Label htmlFor={`tpl-${field.key}`} className="text-xs font-semibold text-[#c7d3ec]">
                      {field.label}
                    </Label>
                    <Textarea
                      id={`tpl-${field.key}`}
                      value={draft[field.key]}
                      onChange={(e) => setDraft((d) => ({ ...d, [field.key]: e.target.value }))}
                      maxLength={MAX_TEMPLATE_LENGTH}
                      rows={2}
                      className="min-h-[64px] resize-none rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fa0c2]/60 focus-visible:ring-[#5c8af0]/50"
                      aria-describedby={`tpl-${field.key}-count`}
                    />
                    <p
                      id={`tpl-${field.key}-count`}
                      className={cn('text-right text-[11px] tabular-nums', counterTone(draft[field.key].length))}
                    >
                      {draft[field.key].length}/{MAX_TEMPLATE_LENGTH}
                    </p>
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  className={cn(AIR_CTA_CLASS, 'h-10 px-5 text-sm')}
                  onClick={() => void saveTemplates()}
                  disabled={savingTemplates}
                >
                  {savingTemplates ? 'Enregistrement…' : 'Enregistrer les messages par défaut'}
                </button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
