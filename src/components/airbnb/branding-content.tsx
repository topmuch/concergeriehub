'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

// =============================================================
// ÉTAPE 19 (V3) — WHITE-LABEL : configuration de marque par bien.
// • Logo (upload → PNG normalisé 512px côté serveur)
// • Couleur principale (picker + hex + presets) → thème de l'app
//   invitée via variables CSS --primary/--accent
// • Nom commercial + message d'accueil (onglet Accueil invité)
// • Domaine personnalisé : saisie + instructions DNS (CNAME) +
//   vérification serveur (resolveCname) + statut
// • Aperçu live (en-tête app invitée) avant enregistrement
// =============================================================

const COLOR_PRESETS = ['#059669', '#0d9488', '#d97706', '#dc2626', '#7c3aed', '#db2777'];

interface BrandingResponse {
  properties: { id: string; name: string }[];
  property: { id: string; name: string; qrHubSlug: string | null } | null;
  branding: PropertyBranding | null;
  customDomain: string | null;
  customDomainVerified: boolean;
  dnsTarget: string;
  error?: string;
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
    <div className="max-w-4xl mx-auto w-full px-4 py-8 space-y-6">
      {/* ----- En-tête + switch propriété ----- */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">🎨 Branding &amp; domaine</h1>
          <p className="text-sm text-slate-500 mt-1">
            Votre marque dans l&apos;app de vos invités : logo, couleurs, message — et votre propre domaine.
          </p>
        </div>
        {data && data.properties.length > 0 && (
          <Select value={data.property?.id ?? ''} onValueChange={changeProperty}>
            <SelectTrigger className="w-full sm:w-64 bg-white" aria-label="Choisir le bien">
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
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center" role="alert">
          <p className="text-3xl" aria-hidden="true">🔌</p>
          <p className="mt-2 text-sm text-slate-600">{error}</p>
          <Button className="mt-4" onClick={() => load(propertyId || undefined)}>
            Réessayer
          </Button>
        </div>
      )}

      {!loading && data && data.property && (
        <div className="grid lg:grid-cols-[1fr_300px] gap-6 items-start">
          {/* ──────── Colonne principale ──────── */}
          <div className="space-y-4 min-w-0">
            {/* Logo */}
            <section className="bg-white border border-slate-200 rounded-xl p-5" aria-label="Logo">
              <h2 className="text-sm font-bold text-slate-900">🖼️ Logo</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Affiché dans l&apos;en-tête de l&apos;app invitée. PNG, JPEG, WebP ou GIF — 2 Mo max
                (normalisé en 512&nbsp;px par le serveur).
              </p>
              <div className="mt-3 flex items-center gap-4 flex-wrap">
                {draft.logoUrl ? (
                  <img
                    src={draft.logoUrl}
                    alt="Logo actuel"
                    className="h-16 w-16 rounded-xl object-contain border border-slate-200 bg-slate-50"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-xl border-2 border-dashed border-slate-300 grid place-items-center text-xl text-slate-400">
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
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? '…' : draft.logoUrl ? 'Remplacer' : 'Choisir un fichier'}
                </Button>
                {draft.logoUrl && (
                  <Button variant="ghost" size="sm" disabled={uploading} onClick={removeLogo} className="text-rose-600">
                    Retirer
                  </Button>
                )}
              </div>
            </section>

            {/* Couleur + nom + message */}
            <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-5" aria-label="Identité visuelle">
              <h2 className="text-sm font-bold text-slate-900">🎨 Identité visuelle &amp; messages</h2>

              <div>
                <label htmlFor="brand-color" className="text-xs font-semibold text-slate-600">
                  Couleur principale (boutons, onglets, accents de l&apos;app invitée)
                </label>
                <div className="mt-2 flex items-center gap-3 flex-wrap">
                  <input
                    id="brand-color"
                    type="color"
                    value={isValidHexColor(colorInput) ? colorInput : DEFAULT_PRIMARY_COLOR}
                    onChange={(e) => {
                      setColorInput(e.target.value);
                      setDraft((d) => ({ ...d, primaryColor: e.target.value }));
                      markDirty();
                    }}
                    className="h-10 w-14 rounded-lg border border-slate-300 cursor-pointer bg-white p-1"
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
                    placeholder="#059669"
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
                        className={`h-8 w-8 rounded-full border-2 cursor-pointer transition-transform hover:scale-110 ${
                          draft.primaryColor === c ? 'border-slate-900' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="brand-company" className="text-xs font-semibold text-slate-600">
                  Nom commercial (remplace « Conciergerie Hub » dans l&apos;app)
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
                <label htmlFor="brand-message" className="text-xs font-semibold text-slate-600">
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
            </section>

            {/* Domaine personnalisé */}
            <section className="bg-white border border-slate-200 rounded-xl p-5" aria-label="Domaine personnalisé">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="text-sm font-bold text-slate-900">🌍 Domaine personnalisé</h2>
                <DomainStatusBadge
                  domain={domainChanged ?? savedDomain}
                  verified={domainIsNew ? false : domainVerified}
                  isNew={domainIsNew}
                />
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Vos invités ouvrent l&apos;app directement sur VOTRE domaine (white-label total).
              </p>

              <Input
                value={domainInput}
                onChange={(e) => {
                  setDomainInput(e.target.value);
                  markDirty();
                }}
                className="mt-3 font-mono"
                placeholder="guests.ma-conciergerie.com"
                aria-label="Nom de domaine personnalisé"
              />

              {/* Instructions DNS */}
              <div className="mt-3 rounded-lg bg-slate-50 border border-slate-200 p-3.5 text-xs">
                <p className="font-semibold text-slate-700">📋 Enregistrement DNS à créer (type CNAME)</p>
                <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-[11px] text-slate-600">
                  <span className="font-sans font-semibold text-slate-500">Hôte :</span>
                  <span>{domainChanged || (savedDomain ?? 'guests.votre-domaine.com')}</span>
                  <span className="font-sans font-semibold text-slate-500">Valeur :</span>
                  <span className="break-all">{data.dnsTarget}</span>
                </div>
                <p className="mt-2 text-slate-500 leading-snug">
                  Enregistrez puis cliquez sur « Vérifier le DNS » — la propagation peut prendre
                  quelques heures selon votre registrar.
                </p>
              </div>

              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={verifying || !domainChanged || domainIsNew || domainVerified}
                  onClick={verifyDomain}
                >
                  {verifying ? '…' : domainVerified ? '✓ CNAME vérifié' : 'Vérifier le DNS'}
                </Button>
                {domainVerified && !domainIsNew && (
                  <span className="text-[11px] text-emerald-700 font-medium">
                    Votre domaine diffuse l&apos;app invitée.
                  </span>
                )}
              </div>
            </section>
          </div>

          {/* ──────── Aperçu live ──────── */}
          <aside className="lg:sticky lg:top-6" aria-label="Aperçu de l'app invitée">
            <div className="bg-slate-100 border border-slate-200 rounded-2xl p-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-3">
                Aperçu app invitée
              </p>
              {/* En-tête simulé */}
              <div className="rounded-xl bg-white border border-slate-200 overflow-hidden shadow-sm">
                <div className="px-3 py-2.5 border-b border-slate-100 flex items-center gap-2.5">
                  {draft.logoUrl ? (
                    <img src={draft.logoUrl} alt="" className="h-7 w-7 rounded-lg object-contain" />
                  ) : (
                    <span className="text-base" aria-hidden="true">🗝️</span>
                  )}
                  <div className="min-w-0">
                    <p
                      className="text-[9px] font-bold uppercase tracking-widest leading-none truncate"
                      style={{ color: draft.primaryColor }}
                    >
                      {companyInput.trim() || 'Conciergerie Hub'}
                    </p>
                    <p className="text-[11px] font-bold text-slate-900 truncate">
                      {data.property.name}
                    </p>
                  </div>
                </div>
                <div className="p-3 space-y-2">
                  <p className="text-[12px] font-bold text-slate-900">Bienvenue 👋</p>
                  <p className="text-[10px] text-slate-500 leading-snug line-clamp-3">
                    {messageInput.trim() ||
                      'Tout ce dont vous avez besoin pendant votre séjour est ici : Wi-Fi, guide, services et assistance.'}
                  </p>
                  <div className="rounded-lg px-2.5 py-1.5 text-[10px] font-semibold text-white text-center" style={{ backgroundColor: draft.primaryColor }}>
                    Se connecter au Wi-Fi
                  </div>
                  {/* Nav simulée */}
                  <div className="pt-1.5 border-t border-slate-100 grid grid-cols-4 text-center text-[8px] text-slate-400">
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
                className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white"
                aria-label="Enregistrer le branding"
              >
                {saving ? 'Enregistrement…' : dirty ? '💾 Enregistrer' : '✓ À jour'}
              </Button>
              <p className="text-[10px] text-slate-400 mt-2 text-center leading-snug">
                Le logo s&apos;applique immédiatement — la couleur, le nom, le message et le domaine à l&apos;enregistrement.
              </p>
            </div>
          </aside>
        </div>
      )}

      {!loading && data && !data.property && (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <p className="text-4xl" aria-hidden="true">🎨</p>
          <h2 className="mt-3 text-lg font-bold text-slate-900">Aucun bien</h2>
          <p className="mt-1 text-sm text-slate-500">Ajoutez d&apos;abord un bien pour personnaliser son branding.</p>
        </div>
      )}
    </div>
  );
}

function DomainStatusBadge({ domain, verified, isNew }: { domain: string | null; verified: boolean; isNew: boolean }) {
  if (!domain) {
    return <Badge className="bg-slate-100 text-slate-600 border-slate-300 border text-[10px]">Aucun domaine</Badge>;
  }
  if (isNew || !verified) {
    return <Badge className="bg-amber-100 text-amber-800 border-amber-300 border text-[10px]">⏳ En attente de vérification</Badge>;
  }
  return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 border text-[10px]">✓ Vérifié</Badge>;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Chargement du branding">
      <div className="grid lg:grid-cols-[1fr_300px] gap-6">
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}
