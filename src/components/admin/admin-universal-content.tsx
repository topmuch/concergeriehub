// =============================================================
// AdminUniversalContent — Éditeur « 📚 Contenu universel » (v4.47)
// -------------------------------------------------------------
// Le Superadmin définit le contenu de référence partagé par TOUTES
// les maisons de la plateforme :
//   1. 📖 Guidebook universel  (titre + sections) — affiché dans les
//      hubs sans guidebook propre, importable en 1 clic côté hôte.
//   2. 🛠️ Pack universel d'appareils (nom + emoji + instructions) —
//      affiché comme Guide des appareils si l'hôte n'a rien saisi,
//      importable en 1 clic dans la Conciergerie.
// API : GET/PUT /api/admin/universal-content (Superadmin, audit).
// =============================================================
'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';

// ---------- Design « Saphir Luxe » : champs & boutons sombres ----------
const LUX_FIELD =
  'rounded-xl! border-white/12! bg-white/[0.04]! text-white! placeholder:text-[#8fabc2]/60! focus-visible:ring-[#5cadf0]/50!';
const LUX_BTN_GHOST_SM =
  'inline-flex h-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-white transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50';

interface UniversalAppliance {
  id: string;
  name: string;
  emoji?: string;
  instructions: string;
  videoUrl?: string;
  imageUrl?: string;
}

interface UniversalGuidebook {
  title: string;
  sections: string[];
}

interface UniversalContent {
  guidebook: UniversalGuidebook;
  appliances: UniversalAppliance[];
}

function newRowKey(): string {
  try {
    return crypto.randomUUID().slice(0, 8);
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}

export function AdminUniversalContent() {
  const [content, setContent] = useState<UniversalContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/universal-content');
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        content?: UniversalContent;
        error?: string;
      } | null;
      if (!res.ok || !json?.ok || !json.content) {
        toast.error(json?.error || 'Chargement impossible.');
        return;
      }
      setContent(json.content);
    } catch {
      toast.error('Connexion impossible. Réessayez.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!content) return;
    if (!content.guidebook.title.trim()) {
      toast.error('Le guidebook universel doit avoir un titre.');
      return;
    }
    const cleanSections = content.guidebook.sections.map((s) => s.trim()).filter(Boolean);
    if (cleanSections.length === 0) {
      toast.error('Ajoutez au moins une section au guidebook universel.');
      return;
    }
    for (const a of content.appliances) {
      if (!a.name.trim()) {
        toast.error('Chaque appareil du pack universel doit avoir un nom.');
        return;
      }
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/universal-content', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guidebook: { title: content.guidebook.title.trim(), sections: cleanSections },
          appliances: content.appliances.map((a, i) => ({
            id: a.id || `ua-${i + 1}`,
            name: a.name.trim(),
            emoji: a.emoji?.trim() || '🛠️',
            instructions: a.instructions.trim() || '—',
            // v4.48 — préserver photo + vidéo (elles étaient perdues à la sauvegarde).
            imageUrl: a.imageUrl?.trim() || undefined,
            videoUrl: a.videoUrl?.trim() || undefined,
          })),
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        content?: UniversalContent;
        error?: string;
        message?: string;
      } | null;
      if (!res.ok || !json?.ok) {
        toast.error(json?.error || 'Échec de la sauvegarde.');
        return;
      }
      if (json.content) setContent(json.content);
      toast.success(json.message || 'Contenu universel enregistré ✅');
    } catch {
      toast.error('Connexion impossible. Réessayez.');
    } finally {
      setSaving(false);
    }
  };

  // ── Handlers guidebook ──
  const setTitle = (title: string) =>
    setContent((c) => (c ? { ...c, guidebook: { ...c.guidebook, title } } : c));
  const setSection = (i: number, value: string) =>
    setContent((c) =>
      c
        ? {
            ...c,
            guidebook: {
              ...c.guidebook,
              sections: c.guidebook.sections.map((s, idx) => (idx === i ? value : s)),
            },
          }
        : c,
    );
  const addSection = () =>
    setContent((c) =>
      c ? { ...c, guidebook: { ...c.guidebook, sections: [...c.guidebook.sections, ''] } } : c,
    );
  const removeSection = (i: number) =>
    setContent((c) =>
      c
        ? {
            ...c,
            guidebook: {
              ...c.guidebook,
              sections: c.guidebook.sections.filter((_, idx) => idx !== i),
            },
          }
        : c,
    );

  // ── Handlers appareils ──
  const setAppliance = (id: string, patch: Partial<UniversalAppliance>) =>
    setContent((c) =>
      c
        ? {
            ...c,
            appliances: c.appliances.map((a) => (a.id === id ? { ...a, ...patch } : a)),
          }
        : c,
    );
  const addAppliance = () =>
    setContent((c) =>
      c
        ? {
            ...c,
            appliances: [...c.appliances, { id: newRowKey(), name: '', emoji: '🛠️', instructions: '' }],
          }
        : c,
    );
  const removeAppliance = (id: string) =>
    setContent((c) =>
      c ? { ...c, appliances: c.appliances.filter((a) => a.id !== id) } : c,
    );

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      {/* ── En-tête ── */}
      <div className="lux-card p-6">
        <p className="lux-eyebrow">Plateforme</p>
        <h2 className="lux-display mt-2 text-2xl font-semibold text-white">Contenu universel</h2>
        <p className="mt-2 text-sm leading-relaxed text-[#8fabc2]">
          Ce contenu de référence s&apos;affiche dans <strong>toutes les maisons</strong> de la
          plateforme dont l&apos;hôte n&apos;a pas encore rempli son propre guidebook ou son guide
          des appareils. Les hôtes peuvent aussi l&apos;importer en 1 clic puis le personnaliser.
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-2xl bg-white/8" />
          <Skeleton className="h-64 w-full rounded-2xl bg-white/8" />
        </div>
      ) : !content ? (
        <div className="rounded-2xl border border-[#f07d6a]/25 bg-[#f07d6a]/10 p-6 text-sm font-semibold text-[#f07d6a]">
          Contenu indisponible — rechargez la page.
        </div>
      ) : (
        <>
          {/* ── 1. Guidebook universel ── */}
          <section className="lux-card p-5 sm:p-6" aria-label="Guidebook universel">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="lux-eyebrow">Guidebook</p>
                <h3 className="lux-display mt-1 text-lg font-semibold text-white">Guidebook universel</h3>
                <p className="mt-0.5 text-xs text-[#8fabc2]">
                  Guide de bienvenue générique — première ligne de chaque section = titre.
                </p>
              </div>
              <button
                type="button"
                onClick={addSection}
                disabled={saving || content.guidebook.sections.length >= 20}
                className={`${LUX_BTN_GHOST_SM} shrink-0`}
              >
                Ajouter une section
              </button>
            </div>

            <div className="mt-4 space-y-1.5">
              <Label htmlFor="ug-title">Titre du guide</Label>
              <Input
                id="ug-title"
                value={content.guidebook.title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                placeholder="Guide universel de la maison"
                className={LUX_FIELD}
              />
            </div>

            <div className="mt-4 space-y-2">
              <Label>Sections ({content.guidebook.sections.length})</Label>
              {content.guidebook.sections.map((section, i) => (
                <div key={i} className="relative">
                  <Textarea
                    value={section}
                    onChange={(e) => setSection(i, e.target.value)}
                    rows={4}
                    maxLength={2000}
                    aria-label={`Section ${i + 1} du guidebook universel`}
                    className={`min-h-[96px] pr-10 text-sm ${LUX_FIELD}`}
                    placeholder={`Section ${i + 1} — ex : 👋 Bienvenue !\nNous sommes ravis de vous accueillir…`}
                  />
                  <button
                    type="button"
                    onClick={() => removeSection(i)}
                    aria-label={`Supprimer la section ${i + 1}`}
                    disabled={saving}
                    className="absolute top-2 right-2 inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-[#8fabc2] transition-colors hover:border-[#f07d6a]/40 hover:text-[#f07d6a] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* ── 2. Pack universel d'appareils ── */}
          <section className="lux-card p-5 sm:p-6" aria-label="Pack universel d'appareils">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="lux-eyebrow">Appareils</p>
                <h3 className="lux-display mt-1 text-lg font-semibold text-white">Pack universel d&apos;appareils</h3>
                <p className="mt-0.5 text-xs text-[#8fabc2]">
                  Catalogue d&apos;appareils courants avec instructions génériques.
                </p>
              </div>
              <button
                type="button"
                onClick={addAppliance}
                disabled={saving || content.appliances.length >= 40}
                className={`${LUX_BTN_GHOST_SM} shrink-0`}
              >
                Ajouter un appareil
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {content.appliances.map((a, i) => (
                <div key={a.id} className="space-y-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center gap-2">
                    {/* v4.48 — vignette de la photo produit universelle embarquée. */}
                    {a.imageUrl ? (
                      <img
                        src={a.imageUrl}
                        alt={`Photo de ${a.name || 'l’appareil'}`}
                        className="h-9 w-9 shrink-0 rounded-lg border border-white/10 object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : null}
                    <Input
                      value={a.emoji ?? ''}
                      onChange={(e) => setAppliance(a.id, { emoji: e.target.value })}
                      maxLength={4}
                      className={`w-14 text-center ${LUX_FIELD}`}
                      placeholder="🛠️"
                      aria-label={`Emoji de l'appareil ${a.name || i + 1}`}
                    />
                    <Input
                      value={a.name}
                      onChange={(e) => setAppliance(a.id, { name: e.target.value })}
                      maxLength={80}
                      className={`flex-1 ${LUX_FIELD}`}
                      placeholder="Nom de l'appareil (ex : Machine à café)"
                      aria-label={`Nom de l'appareil ${i + 1}`}
                    />
                    <button
                      type="button"
                      onClick={() => removeAppliance(a.id)}
                      aria-label={`Supprimer l'appareil ${a.name || i + 1}`}
                      disabled={saving}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-[#8fabc2] transition-colors hover:border-[#f07d6a]/40 hover:text-[#f07d6a] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  </div>
                  <Textarea
                    value={a.instructions}
                    onChange={(e) => setAppliance(a.id, { instructions: e.target.value })}
                    rows={3}
                    maxLength={4000}
                    aria-label={`Instructions de l'appareil ${a.name || i + 1}`}
                    placeholder="Instructions génériques — numérotées, avec astuces…"
                    className={`text-sm ${LUX_FIELD}`}
                  />
                </div>
              ))}
            </div>
          </section>

          {/* ── Barre d'enregistrement ── */}
          <div className="sticky bottom-4 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#0b1226]/95 p-4 shadow-[0_24px_60px_-24px_rgba(2,6,18,0.95)] backdrop-blur">
            <p className="text-xs text-[#8fabc2]">
              {content.guidebook.sections.length} section(s) · {content.appliances.length} appareil(s)
            </p>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="lux-btn h-11 rounded-full px-6 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              Enregistrer
            </button>
          </div>
        </>
      )}
    </div>
  );
}
