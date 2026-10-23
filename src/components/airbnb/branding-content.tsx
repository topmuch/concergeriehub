'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DEFAULT_PRIMARY_COLOR, isValidHexColor, normalizeCustomDomain, type PropertyBranding } from '@/lib/branding';
import type { KPITone } from '@/components/airbnb/host/kpi-card';
import { cn } from '@/lib/utils';

// =============================================================
// ÉTAPE 19 (V3) — WHITE-LABEL : configuration de marque par bien.
// v4.60 « AIRBNB PRO » — refonte visuelle (logique intacte) :
// • Chaque bloc = carte air-shadow rounded-2xl avec bulle d'icône
//   dégradée kpi-bubble-{tone} (rausch / violet / teal)
// • Empty state .air-empty, erreur ⚠️ + CTA air-gradient
// • Aperçu live (en-tête app invitée) en carte glass token-based
// • Tokens sémantiques partout — lisible en clair ET en sombre
// =============================================================

const COLOR_PRESETS = ['#055492', '#0d9488', '#d97706', '#dc2626', '#7c3aed', '#db2777'];

interface BrandingResponse {
  properties: { id: string; name: string }[];
  property: { id: string; name: string; qrHubSlug: string | null } | null;
  branding: PropertyBranding | null;
  customDomain: string | null;
  customDomainVerified: boolean;
  dnsTarget: string;
  error?: string;
}

/* ----- Carte de section locale « AIRBNB PRO » (bulle tonée + titre) ----- */
function BrandingCard({
  tone,
  emoji,
  title,
  description,
  headerRight,
  children,
  ariaLabel,
}: {
  tone: KPITone;
  emoji: string;
  title: ReactNode;
  description?: ReactNode;
  headerRight?: ReactNode;
  children: ReactNode;
  ariaLabel: string;
}) {
  return (
    <section aria-label={ariaLabel} className="air-shadow rounded-2xl border border-border bg-card">
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg text-white shadow',
                `kpi-bubble-${tone}`,
              )}
            >
              {emoji}
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-foreground sm:text-base">{title}</h2>
              {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
            </div>
          </div>
          {headerRight}
        </div>
        {children}
      </div>
    </section>
  );
}

export function BrandingContent() {
  const [data, setData] = useState<BrandingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [propertyId, setPropertyId] = useState<string>('');

  // Brouillon éditable (locales) — enregistré via PATCH
  const [draft, setDraft] = useState<PropertyBranding>({
    logoUrl: null,
    primaryColor: DEFAULT_PRIMARY_COLOR,
    companyName: null,
    welcomeMessage: null,
  });
  const [colorInput, setColorInput] = useState<string>(DEFAULT_PRIMARY_COLOR);
  const [companyInput, setCompanyInput] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [domainInput, setDomainInput] = useState('');
  const [domainVerified, setDomainVerified] = useState(false);
  const [savedDomain, setSavedDomain] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [dirty, setDirty] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (pid?: string) => {
    setLoading(true);
    setError('');
    try {
      const qs = pid ? `?propertyId=${encodeURIComponent(pid)}` : '';
      const res = await fetch(`/api/airbnb/branding${qs}`);
      const json = (await res.json()) as BrandingResponse;
      if (!res.ok) {
        setError(json.error || 'Impossible de charger la configuration.');
        setData(null);
      } else {
        setData(json);
        const b = json.branding ?? {
          logoUrl: null,
          primaryColor: DEFAULT_PRIMARY_COLOR,
          companyName: null,
          welcomeMessage: null,
        };
        setDraft(b);
        setColorInput(b.primaryColor);
        setCompanyInput(b.companyName ?? '');
        setMessageInput(b.welcomeMessage ?? '');
        setDomainInput(json.customDomain ?? '');
        setSavedDomain(json.customDomain);
        setDomainVerified(json.customDomainVerified);
        setPropertyId(json.property?.id ?? '');
        setDirty(false);
      }
    } catch {
      setError('Connexion impossible. Réessayez.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const changeProperty = (pid: string) => {
    setPropertyId(pid);
    load(pid);
  };

  const markDirty = () => setDirty(true);

  // ── Upload / retrait du logo (effet immédiat, pas via PATCH) ──
  const uploadLogo = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/airbnb/branding/logo?propertyId=${encodeURIComponent(propertyId)}`, {
        method: 'POST',
        body: fd,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        toast.error(json?.error || 'Upload impossible.');
        return;
      }
      setDraft((d) => ({ ...d, logoUrl: json.logoUrl }));
      toast.success('🖼️ Logo enregistré — visible dans l’app invitée.');
    } catch {
      toast.error('Connexion impossible. Réessayez.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeLogo = async () => {
    setUploading(true);
    try {
      const res = await fetch(`/api/airbnb/branding/logo?propertyId=${encodeURIComponent(propertyId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        toast.error('Retrait impossible.');
        return;
      }
      setDraft((d) => ({ ...d, logoUrl: null }));
      toast.success('Logo retiré.');
    } catch {
      toast.error('Connexion impossible. Réessayez.');
    } finally {
      setUploading(false);
    }
  };

  // ── Enregistrement (couleur, nom, message, domaine) ──
  const save = async () => {
    if (!isValidHexColor(draft.primaryColor)) {
      toast.error('Couleur invalide (format #RRGGBB).');
      return;
    }
    setSaving(true);
    try {
      const domainToSend =
        domainInput.trim() === ''
          ? null
          : normalizeCustomDomain(domainInput);
      const res = await fetch(`/api/airbnb/branding?propertyId=${encodeURIComponent(propertyId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryColor: draft.primaryColor,
          companyName: companyInput.trim() || null,
          welcomeMessage: messageInput.trim() || null,
          customDomain: domainToSend,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        toast.error(json?.error || 'Enregistrement impossible.');
        return;
      }
      setSavedDomain(json.customDomain);
      setDomainVerified(json.customDomainVerified);
      if (domainToSend && json.customDomain !== savedDomain) {
        toast.info('🔒 Domaine enregistré — vérifiez le CNAME pour l’activer.');
      } else {
        toast.success('🎨 Branding enregistré.');
      }
      setDirty(false);
    } catch {
      toast.error('Connexion impossible. Réessayez.');
    } finally {
      setSaving(false);
    }
  };

  // ── Vérification DNS du CNAME ──
  const verifyDomain = async () => {
    setVerifying(true);
    try {
      const res = await fetch(
        `/api/airbnb/branding/domain-verify?propertyId=${encodeURIComponent(propertyId)}`,
        { method: 'POST' },
      );
      const json = await res.json().catch(() => null);
      if (res.ok && json?.verified) {
        setDomainVerified(true);
        toast.success('🌍 CNAME vérifié — votre app invitée est en ligne sur votre domaine !');
      } else {
        toast.error(json?.error || 'Vérification impossible.');
      }
    } catch {
      toast.error('Connexion impossible. Réessayez.');
    } finally {
      setVerifying(false);
    }
  };

  const domainChanged = domainInput.trim() === '' ? null : normalizeCustomDomain(domainInput);
  const domainIsNew = domainChanged !== null && domainChanged !== savedDomain;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8">
      {/* ----- En-tête + switch propriété ----- */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">🎨 Branding &amp; domaine</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Votre marque dans l&apos;app de vos invités : logo, couleurs, message — et votre propre domaine.
          </p>
        </div>
        {data && data.properties.length > 0 && (
          <Select value={data.property?.id ?? ''} onValueChange={changeProperty}>
            <SelectTrigger className="w-full bg-card sm:w-64" aria-label="Choisir le bien">
              <SelectValue placeholder="Choisir un bien" />
            </SelectTrigger>
            <SelectContent>
              {data.properties.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {loading && !data && <LoadingSkeleton />}

      {!loading && error && (
        <div className="air-empty flex flex-col items-center gap-3 rounded-2xl p-8 text-center" role="alert">
          <span aria-hidden="true" className="air-float text-3xl">⚠️</span>
          <p className="text-sm font-semibold text-foreground">{error}</p>
          <Button
            className="air-gradient h-9 rounded-full px-4 text-xs font-bold text-white shadow transition-transform hover:scale-[1.03]"
            onClick={() => load(propertyId || undefined)}
          >
            Réessayer
          </Button>
        </div>
      )}

      {!loading && data && data.property && (
        <div className="grid items-start gap-6 lg:grid-cols-[1fr_300px]">
          {/* ──────── Colonne principale ──────── */}
          <div className="min-w-0 space-y-4">
            {/* Logo */}
            <BrandingCard
              tone="rausch"
              emoji="🖼️"
              ariaLabel="Logo"
              title="Logo"
              description={
                <>
                  Affiché dans l&apos;en-tête de l&apos;app invitée. PNG, JPEG, WebP ou GIF — 2 Mo max
                  (normalisé en 512&nbsp;px par le serveur).
                </>
              }
            >
              <div className="flex flex-wrap items-center gap-4">
                {draft.logoUrl ? (
                  <img
                    src={draft.logoUrl}
                    alt="Logo actuel"
                    className="h-16 w-16 rounded-xl border border-border bg-muted object-contain"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="grid h-16 w-16 place-items-center rounded-xl border-2 border-dashed border-border bg-muted/40 text-xl text-muted-foreground">
                    🗝️
                  </div>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? '…' : draft.logoUrl ? 'Remplacer' : 'Choisir un fichier'}
                </Button>
                {draft.logoUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-full text-rose-600 dark:text-rose-400"
                    disabled={uploading}
                    onClick={removeLogo}
                  >
                    Retirer
                  </Button>
                )}
              </div>
            </BrandingCard>

            {/* Couleur + nom + message */}
            <BrandingCard
              tone="violet"
              emoji="🎨"
              ariaLabel="Identité visuelle"
              title="Identité visuelle & messages"
            >
              <div className="space-y-5">
                <div>
                  <label htmlFor="brand-color" className="text-xs font-semibold text-muted-foreground">
                    Couleur principale (boutons, onglets, accents de l&apos;app invitée)
                  </label>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <input
                      id="brand-color"
                      type="color"
                      value={isValidHexColor(colorInput) ? colorInput : DEFAULT_PRIMARY_COLOR}
                      onChange={(e) => {
                        setColorInput(e.target.value);
                        setDraft((d) => ({ ...d, primaryColor: e.target.value }));
                        markDirty();
                      }}
                      className="h-10 w-14 cursor-pointer rounded-lg border border-border bg-card p-1"
                      aria-label="Choisir la couleur principale"
                    />
                    <Input
                      value={colorInput}
                      onChange={(e) => {
                        const v = e.target.value;
                        setColorInput(v);
                        if (isValidHexColor(v)) {
                          setDraft((d) => ({ ...d, primaryColor: v.toLowerCase() }));
                          markDirty();
                        }
                      }}
                      className="w-28 font-mono"
                      placeholder="#055492"
                      aria-label="Couleur en hexadécimal"
                    />
                    <div className="flex gap-1.5" role="group" aria-label="Couleurs suggérées">
                      {COLOR_PRESETS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          aria-label={`Couleur ${c}`}
                          onClick={() => {
                            setColorInput(c);
                            setDraft((d) => ({ ...d, primaryColor: c }));
                            markDirty();
                          }}
                          className={cn(
                            'h-8 w-8 cursor-pointer rounded-full border-2 transition-transform hover:scale-110',
                            draft.primaryColor === c ? 'border-foreground' : 'border-transparent',
                          )}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label htmlFor="brand-company" className="text-xs font-semibold text-muted-foreground">
                    Nom commercial (remplace « RoomScan » dans l&apos;app)
                  </label>
                  <Input
                    id="brand-company"
                    value={companyInput}
                    maxLength={60}
                    onChange={(e) => {
                      setCompanyInput(e.target.value);
                      markDirty();
                    }}
                    className="mt-1.5"
                    placeholder="ex : Les Clés du Marais"
                  />
                </div>

                <div>
                  <label htmlFor="brand-message" className="text-xs font-semibold text-muted-foreground">
                    Message d&apos;accueil ({messageInput.length}/280)
                  </label>
                  <Textarea
                    id="brand-message"
                    value={messageInput}
                    maxLength={280}
                    rows={3}
                    onChange={(e) => {
                      setMessageInput(e.target.value);
                      markDirty();
                    }}
                    className="mt-1.5"
                    placeholder="ex : Bienvenue chez Les Clés du Marais — votre séjour commence ici ✨"
                  />
                </div>
              </div>
            </BrandingCard>

            {/* Domaine personnalisé */}
            <BrandingCard
              tone="teal"
              emoji="🌍"
              ariaLabel="Domaine personnalisé"
              title="Domaine personnalisé"
              description="Vos invités ouvrent l'app directement sur VOTRE domaine (white-label total)."
              headerRight={
                <DomainStatusBadge
                  domain={domainChanged ?? savedDomain}
                  verified={domainIsNew ? false : domainVerified}
                  isNew={domainIsNew}
                />
              }
            >
              <div>
                <Input
                  value={domainInput}
                  onChange={(e) => {
                    setDomainInput(e.target.value);
                    markDirty();
                  }}
                  className="font-mono"
                  placeholder="guests.ma-conciergerie.com"
                  aria-label="Nom de domaine personnalisé"
                />

                {/* Instructions DNS */}
                <div className="mt-3 rounded-xl border border-border bg-muted p-3.5 text-xs">
                  <p className="font-semibold text-foreground">📋 Enregistrement DNS à créer (type CNAME)</p>
                  <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-[11px] text-foreground">
                    <span className="font-sans font-semibold text-muted-foreground">Hôte :</span>
                    <span>{domainChanged || (savedDomain ?? 'guests.votre-domaine.com')}</span>
                    <span className="font-sans font-semibold text-muted-foreground">Valeur :</span>
                    <span className="break-all">{data.dnsTarget}</span>
                  </div>
                  <p className="mt-2 leading-snug text-muted-foreground">
                    Enregistrez puis cliquez sur « Vérifier le DNS » — la propagation peut prendre
                    quelques heures selon votre registrar.
                  </p>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    disabled={verifying || !domainChanged || domainIsNew || domainVerified}
                    onClick={verifyDomain}
                  >
                    {verifying ? '…' : domainVerified ? '✓ CNAME vérifié' : 'Vérifier le DNS'}
                  </Button>
                  {domainVerified && !domainIsNew && (
                    <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                      Votre domaine diffuse l&apos;app invitée.
                    </span>
                  )}
                </div>
              </div>
            </BrandingCard>
          </div>

          {/* ──────── Aperçu live ──────── */}
          <aside className="lg:sticky lg:top-6" aria-label="Aperçu de l'app invitée">
            <div className="air-shadow rounded-2xl border border-border bg-muted p-4">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Aperçu app invitée
              </p>
              {/* En-tête simulé */}
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                <div className="flex items-center gap-2.5 border-b border-border px-3 py-2.5">
                  {draft.logoUrl ? (
                    <img src={draft.logoUrl} alt="" className="h-7 w-7 rounded-lg object-contain" loading="lazy" decoding="async" />
                  ) : (
                    <span aria-hidden="true" className="text-base">🗝️</span>
                  )}
                  <div className="min-w-0">
                    <p
                      className="truncate text-[9px] font-bold uppercase leading-none tracking-widest"
                      style={{ color: draft.primaryColor }}
                    >
                      {companyInput.trim() || 'RoomScan'}
                    </p>
                    <p className="truncate text-[11px] font-bold text-foreground">
                      {data.property.name}
                    </p>
                  </div>
                </div>
                <div className="space-y-2 p-3">
                  <p className="text-[12px] font-bold text-foreground">Bienvenue 👋</p>
                  <p className="line-clamp-3 text-[10px] leading-snug text-muted-foreground">
                    {messageInput.trim() ||
                      'Tout ce dont vous avez besoin pendant votre séjour est ici : Wi-Fi, guide, services et assistance.'}
                  </p>
                  <div className="rounded-lg px-2.5 py-1.5 text-center text-[10px] font-semibold text-white" style={{ backgroundColor: draft.primaryColor }}>
                    Se connecter au Wi-Fi
                  </div>
                  {/* Nav simulée */}
                  <div className="grid grid-cols-4 border-t border-border pt-1.5 text-center text-[8px] text-muted-foreground">
                    <span className="font-bold" style={{ color: draft.primaryColor }}>🏠 Accueil</span>
                    <span>📖 Guide</span>
                    <span>🥐 Services</span>
                    <span>🚨 Aide</span>
                  </div>
                </div>
              </div>
              <Button
                onClick={save}
                disabled={saving || uploading || !dirty}
                className="air-gradient mt-4 w-full rounded-full text-xs font-bold text-white shadow transition-transform hover:scale-[1.03]"
                aria-label="Enregistrer le branding"
              >
                {saving ? 'Enregistrement…' : dirty ? '💾 Enregistrer' : '✓ À jour'}
              </Button>
              <p className="mt-2 text-center text-[10px] leading-snug text-muted-foreground">
                Le logo s&apos;applique immédiatement — la couleur, le nom, le message et le domaine à l&apos;enregistrement.
              </p>
            </div>
          </aside>
        </div>
      )}

      {!loading && data && !data.property && (
        <div className="air-empty flex flex-col items-center gap-2 rounded-2xl p-10 text-center">
          <span aria-hidden="true" className="air-float text-3xl">🎨</span>
          <h2 className="mt-1 text-base font-semibold text-foreground">Aucun bien</h2>
          <p className="text-sm text-muted-foreground">Ajoutez d&apos;abord un bien pour personnaliser son branding.</p>
        </div>
      )}
    </div>
  );
}

function DomainStatusBadge({ domain, verified, isNew }: { domain: string | null; verified: boolean; isNew: boolean }) {
  if (!domain) {
    return (
      <Badge className="rounded-full border border-border bg-muted text-[10px] text-muted-foreground">
        Aucun domaine
      </Badge>
    );
  }
  if (isNew || !verified) {
    return (
      <Badge className="rounded-full border border-amber-200 bg-amber-50 text-[10px] text-amber-700 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-300">
        ⏳ En attente de vérification
      </Badge>
    );
  }
  return (
    <Badge className="rounded-full border border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-300">
      ✓ Vérifié
    </Badge>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Chargement du branding">
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" aria-hidden="true" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-2xl" aria-hidden="true" />
      </div>
    </div>
  );
}
