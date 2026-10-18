'use client';

// =============================================================
// PlatformVoicesContent — Éditeur « Voix plateforme » (WP-BACK v4.61)
// -------------------------------------------------------------
// Le Superadmin définit les voix audio PAR DÉFAUT des messages vocaux
// du Hub, servies aux biens dont l'hôte n'a rien configuré :
//   bien définit sa voix → voix du bien (prioritaire) ;
//   sinon                → voix plateforme (source 'platform').
// Grille : 4 kinds (welcome, checkout_eve, checkout_day, guidebook)
//          × 4 langues (fr, en, es, ar).
// Par cellule : statut (défini/vide), TTS (texte → Générer), upload
// d'un fichier audio, pré-écoute <audio>, suppression.
// API : GET/POST/DELETE /api/admin/platform-voices (Superadmin, audit).
// Design v5.2 « Saphir Luxe » : sombre bleuté, sans icônes.
// =============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

// ---------- Design « Saphir Luxe » : champs & boutons sombres ----------
const LUX_FIELD =
  'rounded-xl! border-white/12! bg-white/[0.04]! text-white! placeholder:text-[#8fa0c2]/60! focus-visible:ring-[#5c8af0]/50!';
const LUX_BTN_PRIMARY_SM =
  'inline-flex h-8 items-center justify-center rounded-full bg-gradient-to-br from-[#3d6fe0] to-[#24479c] px-3 text-xs font-semibold text-white shadow-[0_8px_20px_-10px_rgba(61,111,224,0.6)] transition-[filter,transform] hover:brightness-110 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50';
const LUX_BTN_GHOST_SM =
  'inline-flex h-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-white transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50';

/** Libellé affiché sans le préfixe emoji décoratif (données KIND_META inchangées). */
const displayKindLabel = (label: string): string => label.replace(/^\S+\s/, '');

const KINDS = ['welcome', 'checkout_eve', 'checkout_day', 'guidebook'] as const;
type Kind = (typeof KINDS)[number];

const LANGS = ['fr', 'en', 'es', 'ar'] as const;
type Lang = (typeof LANGS)[number];

const KIND_META: Record<Kind, { label: string; hint: string }> = {
  welcome: {
    label: '🎙️ Voix de bienvenue',
    hint: 'Jouée au premier « Mode Invité » de chaque appareil.',
  },
  checkout_eve: {
    label: '🌙 Voix de la veille du départ',
    hint: 'Jouée au premier scan après 20 h la veille du départ.',
  },
  checkout_day: {
    label: '🧳 Voix du jour de départ',
    hint: 'Jouée à chaque ouverture du hub le jour du départ.',
  },
  guidebook: {
    label: '📖 Voix du guidebook',
    hint: 'Lecture audio du guide de bienvenue (app invitée + hub).',
  },
};

const LANG_LABELS: Record<Lang, string> = {
  fr: 'Français',
  en: 'English',
  es: 'Español',
  ar: 'العربية',
};

const MAX_TTS_CHARS = 600; // lib/voice-tts.ts — même plafond que le hub

interface VoiceItemMeta {
  kind: string;
  lang: string;
  source: 'tts' | 'upload';
  text: string | null;
  audioMime: string;
  durationSec: number | null;
  sizeKb: number;
  updatedAt: string;
}

export function PlatformVoicesContent() {
  const [items, setItems] = useState<VoiceItemMeta[] | null>(null);
  const [loading, setLoading] = useState(true);
  // brouillons TTS + états par cellule (clé `${kind}:${lang}`)
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/platform-voices', { cache: 'no-store' });
      const json = (await res.json().catch(() => null)) as { items?: VoiceItemMeta[]; error?: string } | null;
      if (!res.ok) {
        toast.error(json?.error || 'Chargement impossible.');
        setItems([]);
        return;
      }
      setItems(Array.isArray(json?.items) ? json.items : []);
    } catch {
      toast.error('Connexion impossible. Réessayez.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byKey = useMemo(() => {
    const map = new Map<string, VoiceItemMeta>();
    (items ?? []).forEach((it) => map.set(`${it.kind}:${it.lang}`, it));
    return map;
  }, [items]);

  /** Bust du cache <audio> après mutation. */
  const audioSrc = (kind: Kind, lang: Lang, v?: string) =>
    `/api/admin/platform-voices?format=audio&kind=${kind}&lang=${lang}${v ? `&v=${encodeURIComponent(v)}` : ''}`;

  const generateTts = async (kind: Kind, lang: Lang) => {
    const key = `${kind}:${lang}`;
    const text = (texts[key] ?? '').trim();
    if (!text) {
      toast.error('Écrivez d’abord le message à synthétiser.');
      return;
    }
    setBusy(key);
    try {
      const res = await fetch('/api/admin/platform-voices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, lang, action: 'tts', text }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; item?: VoiceItemMeta; error?: string } | null;
      if (!res.ok || !json?.ok) {
        toast.error(json?.error || 'Génération impossible.');
        return;
      }
      toast.success(`Voix générée (${LANG_LABELS[lang]}) — ${KIND_META[kind].label.replace(/^\S+\s/, '')} ✅`);
      await load();
    } catch {
      toast.error('Connexion impossible. Réessayez.');
    } finally {
      setBusy(null);
    }
  };

  const uploadFile = async (kind: Kind, lang: Lang, file: File) => {
    const key = `${kind}:${lang}`;
    setUploading(key);
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(new Error('read_error'));
        reader.readAsDataURL(file);
      });
      // dataURL → base64 pur (le serveur décape aussi, double garde).
      const pure = b64.slice(b64.indexOf(',') + 1);
      const res = await fetch('/api/admin/platform-voices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, lang, action: 'upload', audioBase64: pure, audioMime: file.type }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; item?: VoiceItemMeta; error?: string } | null;
      if (!res.ok || !json?.ok) {
        toast.error(json?.error || 'Import impossible.');
        return;
      }
      toast.success(`Voix importée (${LANG_LABELS[lang]}) ✅`);
      await load();
    } catch {
      toast.error('Lecture du fichier impossible. Réessayez.');
    } finally {
      setUploading(null);
    }
  };

  const removeVoice = async (kind: Kind, lang: Lang) => {
    if (!window.confirm(`Supprimer la voix plateforme « ${KIND_META[kind].label} » (${LANG_LABELS[lang]}) ?`)) return;
    const key = `${kind}:${lang}`;
    setBusy(key);
    try {
      const res = await fetch(`/api/admin/platform-voices?kind=${kind}&lang=${lang}`, { method: 'DELETE' });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        toast.error(json?.error || 'Suppression impossible.');
        return;
      }
      toast.success('Voix plateforme supprimée 🗑️');
      await load();
    } catch {
      toast.error('Connexion impossible. Réessayez.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      {/* ── En-tête ── */}
      <div className="lux-card p-6">
        <p className="lux-eyebrow">Plateforme</p>
        <h2 className="lux-display mt-2 text-2xl font-semibold text-white">Voix plateforme</h2>
        <p className="mt-2 text-sm leading-relaxed text-[#8fa0c2]">
          Voix par défaut des messages vocaux du Hub, définies pour{' '}
          <strong>toutes les maisons</strong> de la plateforme. Un hôte qui configure
          sa propre voix dans son tableau de bord reste prioritaire — la voix
          plateforme n&apos;est utilisée qu&apos;en son absence.
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {KINDS.map((k) => (
            <Skeleton key={k} className="h-40 w-full rounded-2xl bg-white/8" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {KINDS.map((kind) => (
            <section
              key={kind}
              className="lux-card p-5 sm:p-6"
              aria-label={KIND_META[kind].label}
            >
              <h3 className="lux-display text-lg font-semibold text-white">{displayKindLabel(KIND_META[kind].label)}</h3>
              <p className="mt-0.5 text-xs text-[#8fa0c2]">{KIND_META[kind].hint}</p>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {LANGS.map((lang) => {
                  const key = `${kind}:${lang}`;
                  const item = byKey.get(key);
                  const cellBusy = busy === key || uploading === key;
                  return (
                    <div key={lang} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-xs font-bold uppercase tracking-[0.14em] text-[#8fa0c2]">
                          {LANG_LABELS[lang]}
                        </Label>
                        {item ? (
                          <span className="lux-chip px-2! py-0.5! text-[10px]!">
                            <span className="lux-dot" style={{ backgroundColor: '#34d399' }} aria-hidden="true" />
                            Défini · {item.source === 'tts' ? 'TTS' : 'import'} · {item.sizeKb} Ko
                          </span>
                        ) : (
                          <span className="lux-chip px-2! py-0.5! text-[10px]!">
                            <span className="lux-dot" style={{ backgroundColor: '#8fa0c2' }} aria-hidden="true" />
                            Vide
                          </span>
                        )}
                      </div>

                      {item?.text && (
                        <p className="mt-2 line-clamp-2 text-xs italic text-[#8fa0c2]">« {item.text} »</p>
                      )}

                      {/* Pré-écoute */}
                      {item && (
                        <audio
                          controls
                          preload="none"
                          src={audioSrc(kind, lang, item.updatedAt)}
                          className="mt-3 h-9 w-full"
                          aria-label={`Pré-écoute ${KIND_META[kind].label} — ${LANG_LABELS[lang]}`}
                        />
                      )}

                      {/* TTS */}
                      <Textarea
                        value={texts[key] ?? ''}
                        onChange={(e) =>
                          setTexts((t) => ({ ...t, [key]: e.target.value.slice(0, MAX_TTS_CHARS) }))
                        }
                        rows={2}
                        maxLength={MAX_TTS_CHARS}
                        placeholder={`Texte à synthétiser en ${LANG_LABELS[lang]} (max ${MAX_TTS_CHARS} caractères)…`}
                        aria-label={`Texte TTS ${KIND_META[kind].label} — ${LANG_LABELS[lang]}`}
                        className={`mt-3 ${LUX_FIELD}`}
                      />
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void generateTts(kind, lang)}
                          disabled={cellBusy || !(texts[key] ?? '').trim()}
                          className={LUX_BTN_PRIMARY_SM}
                        >
                          Générer la voix
                        </button>
                        <button
                          type="button"
                          onClick={() => fileInputs.current[key]?.click()}
                          disabled={cellBusy}
                          className={LUX_BTN_GHOST_SM}
                        >
                          Importer un audio
                        </button>
                        {item && (
                          <button
                            type="button"
                            onClick={() => void removeVoice(kind, lang)}
                            disabled={cellBusy}
                            className="inline-flex h-8 items-center justify-center rounded-full border border-[#f07d6a]/25 bg-[#f07d6a]/10 px-3 text-xs font-semibold text-[#f07d6a] transition-colors hover:bg-[#f07d6a]/20 disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label={`Supprimer la voix ${KIND_META[kind].label} — ${LANG_LABELS[lang]}`}
                          >
                            Supprimer
                          </button>
                        )}
                      </div>
                      {/* Input fichier caché (déclenché par « Importer un audio ») */}
                      <input
                        ref={(el) => {
                          fileInputs.current[key] = el;
                        }}
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        aria-hidden="true"
                        tabIndex={-1}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = '';
                          if (f) void uploadFile(kind, lang, f);
                        }}
                      />
                      <p className="mt-2 text-[11px] text-[#8fa0c2]/70">
                        MP3, M4A, WAV, WEBM ou OGG — max 1 Mo.
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
