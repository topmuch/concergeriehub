'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Loader2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { isLocalMediaUrl } from '@/lib/concierge';
import { cn } from '@/lib/utils';
// v4.53 « RAPPORT DE CONSOMMATION AUTOMATIQUE AU CHECK-OUT » — panneau
// hôte + export PDF (jspdf, généré côté navigateur).
import { downloadCheckoutReportPdf } from '@/lib/checkout-report-pdf';
import { downloadStayJournalPdf, type StayJournalPdfInput } from '@/lib/stay-journal-pdf';
import type { ReportMinibarLine, ReportSignalement } from '@/lib/checkout-report';

// =============================================================
// PREMIUM « CONCIERGERIE 5 ÉTOILES » (V5) — ÉDITEUR CÔTÉ HÔTE
// Page /airbnb/properties/[id]/guest-experience : 4 sections qui
// alimentent les modules premium du Hub Invité, sauvegardées via
// PATCH /api/airbnb/properties/[id]/premium :
//   🎬 Vidéo de bienvenue   → premiumFeatures.videoWelcomeUrl
//   🖼️ Guide visuel pas à pas → visualGuide (upload + réordonnancement)
//   ⏱️ Services & upselling  → premiumFeatures (late check-out, bouclier d'avis)
//   🧰 Kit de survie        → survivalKitItems
// Design system v4.60 « AIRBNB PRO » : cartes air-shadow rounded-2xl
// border-border bg-card, bulles de module kpi-bubble-{tone}, empty
// states .air-empty, CTA air-gradient, tokens dark-safe, toasts
// sonner, barre d'enregistrement sticky. Logique inchangée.
// v4.69 — PHASE 1 refonte UI : grille d'onglets visuels (4 groupes :
//   🛬 Arrivée / 🛎️ Services & Extras / 🔐 Sécurité & Départ / 📊 Suivi &
//   Rapports) au-dessus des sections existantes — regroupement par
//   visibility toggle (aucune section démontée, state/hooks préservés) :
//   Arrivée en 2 colonnes (vidéo + voix, guide pleine largeur), Services
//   en 2 colonnes (minibar pleine largeur), Sécurité 2 colonnes. La barre
//   sticky « Enregistrer » reste toujours visible.
// v5.2 « SAPHIR LUXE » — refonte design profonde (demande client) :
//   nuit saphir, SANS icônes lucide ni emojis décoratifs (typographie,
//   .lux-dot, glyphes purs → ↑ ↓ × ✓ +), cartes .lux-card, CTA .lux-btn,
//   onglets visuels saphir, barre sticky #0b1226 — données, handlers,
//   libellés métier et logique strictement inchangés.
// =============================================================

// ── Types locaux (brouillons éditables — strings pour la saisie) ──

interface DraftStep {
  key: string;
  title: string;
  description: string;
  imageUrl: string;
}

interface DraftKitItem {
  key: string;
  name: string;
  location: string;
}

interface DraftMinibarItem {
  key: string;
  emoji: string;
  name: string;
  price: string;
  /** v4.47 — VRAIE photo du produit (URL retournée par l'upload). */
  photo: string;
  /** v4.50 « PACK DE BIENVENUE » — article OFFERT (badge 🎁 côté invité,
   *  facturé 0 € — prix serveur forcé). */
  free: boolean;
}

interface PremiumDraft {
  videoUrl: string;
  enableLateCheckout: boolean;
  lateCheckoutPrice: string;
  /** v4.44 — heure de fin du départ tardif (12–18 h, défaut 14). */
  lateCheckoutHour: string;
  enableReviewShield: boolean;
  reviewUrl: string;
  /** v4.44 « MINIBAR NUMÉRIQUE » (Honesty Bar). */
  enableMinibar: boolean;
  minibar: DraftMinibarItem[];
  /** v4.50 « SYSTÈME DE CONFIANCE » — photo du minibar rempli à l'arrivée
   *  (inventaire validé en 1 clic par l'invité). */
  minibarArrivalPhoto: string;
  steps: DraftStep[];
  kit: DraftKitItem[];
  /** v4.50 « VERROUILLAGE DU HUB PAR CODE » — configuration du verrou
   *  (le CODE d'accès est généré automatiquement par réservation dans
   *  le calendrier — voir /airbnb/calendar). */
  hubLockEnabled: boolean;
  hubLockInstructions: string;
  hubLockAllowLate: boolean;
  /** v4.54 « ALERTE VOCALE DE DÉPART » — audio pré-enregistré (URL). */
  checkoutAudioUrl: string;
}

interface PremiumGetResponse {
  properties: { id: string; name: string }[];
  property: { id: string; name: string; qrHubSlug: string | null } | null;
  premium: {
    premiumFeatures: Record<string, unknown> | null;
    /** v4.44 — minibar parsé ({ enabled, items }). */
    minibar?: {
      enabled: boolean;
      arrivalPhoto?: string;
      items: { id: string; emoji: string; name: string; price: number; photo?: string; free?: boolean }[];
    };
    visualGuide: { id: string; title: string; description?: string; imageUrl?: string }[];
    survivalKitItems: { id: string; name: string; location?: string }[];
  } | null;
  error?: string;
}

const MAX_STEPS = 12;
const MAX_KIT_ITEMS = 30;
const MAX_MINIBAR_ITEMS = 20;

/** v4.44 — catalogue d'exemple affiché quand le minibar est activé vide. */
const MINIBAR_SUGGESTIONS: { emoji: string; name: string; price: string }[] = [
  { emoji: '💧', name: 'Eau minérale 50 cl', price: '2' },
  { emoji: '🍺', name: 'Bière locale', price: '4' },
  { emoji: '🍷', name: 'Bouteille de vin', price: '12' },
  { emoji: '🥨', name: 'Paquet de chips / biscuits', price: '2.5' },
  { emoji: '🍫', name: 'Tablette de chocolat', price: '3.5' },
  { emoji: '🔌', name: 'Câble de recharge neuf', price: '12' },
];

// ── v4.69 — groupes des onglets visuels (l'ordre des sections du DOM
//    ne change pas : les wrappers utilisent des classes CSS `order`). ──
type GuestGroup = 'arrivee' | 'services' | 'securite' | 'rapports';

const GUEST_GROUPS: { id: GuestGroup; title: string; desc: string }[] = [
  { id: 'arrivee', title: 'Arrivée', desc: 'Vidéo de bienvenue · Guide visuel · Voix du guidebook' },
  { id: 'services', title: 'Services & Extras', desc: 'Late check-out · Bouclier d’avis · Minibar' },
  { id: 'securite', title: 'Sécurité & Départ', desc: 'Verrouillage du hub · Kit de survie' },
  { id: 'rapports', title: 'Suivi & Rapports', desc: 'Rapports de check-out' },
];

const EMPTY_DRAFT: PremiumDraft = {
  videoUrl: '',
  enableLateCheckout: false,
  lateCheckoutPrice: '',
  lateCheckoutHour: '14',
  enableReviewShield: false,
  reviewUrl: '',
  enableMinibar: false,
  minibar: [],
  minibarArrivalPhoto: '',
  steps: [],
  kit: [],
  hubLockEnabled: false,
  hubLockInstructions: '',
  hubLockAllowLate: true,
  checkoutAudioUrl: '',
};

function newRowKey(): string {
  try {
    return crypto.randomUUID().slice(0, 8);
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}

/** "20" ou "20,5" → nombre (null si invalide). */
function parsePriceInput(raw: string): number | null {
  const n = Number(raw.trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0 && n <= 1000 ? Math.round(n * 100) / 100 : null;
}

export function GuestExperienceContent({ initialPropertyId }: { initialPropertyId: string }) {
  const router = useRouter();
  const [data, setData] = useState<PremiumGetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [propertyId, setPropertyId] = useState(initialPropertyId);

  const [draft, setDraft] = useState<PremiumDraft>({ ...EMPTY_DRAFT });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const dragIndex = useRef<number | null>(null);
  // v4.69 — onglet visuel actif (regroupement sans démonter les sections).
  const [activeGroup, setActiveGroup] = useState<GuestGroup>('arrivee');

  // ── Chargement ──
  const load = useCallback(async (pid: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/airbnb/properties/${encodeURIComponent(pid)}/premium`);
      const json = (await res.json()) as PremiumGetResponse;
      if (!res.ok) {
        setError(json.error || 'Impossible de charger l’expérience invité.');
        setData(null);
        return;
      }
      setData(json);
      setPropertyId(json.property?.id ?? pid);
      setDraft(hydrateDraft(json));
      setDirty(false);
    } catch {
      setError('Connexion impossible. Réessayez.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialPropertyId) void load(initialPropertyId);
  }, [initialPropertyId, load]);

  const changeProperty = (pid: string) => {
    if (pid === propertyId) return;
    if (dirty && !window.confirm('Des modifications ne sont pas enregistrées — changer de bien ?')) return;
    router.push(`/airbnb/properties/${encodeURIComponent(pid)}/guest-experience`);
  };

  // ── Mise à jour du brouillon (marque « dirty » automatiquement) ──
  const update = (fn: (d: PremiumDraft) => PremiumDraft) => {
    setDraft(fn);
    setDirty(true);
  };

  const setPremium = (patch: Partial<Omit<PremiumDraft, 'steps' | 'kit'>>) =>
    update((d) => ({ ...d, ...patch }));

  // ── Étapes du guide visuel ──
  const setStep = (key: string, patch: Partial<DraftStep>) =>
    update((d) => ({ ...d, steps: d.steps.map((s) => (s.key === key ? { ...s, ...patch } : s)) }));

  const addStep = () =>
    update((d) => ({
      ...d,
      steps: [...d.steps, { key: newRowKey(), title: '', description: '', imageUrl: '' }],
    }));

  const removeStep = (key: string) =>
    update((d) => ({ ...d, steps: d.steps.filter((s) => s.key !== key) }));

  const moveStep = (from: number, to: number) => {
    if (to < 0 || to >= draft.steps.length || from === to) return;
    update((d) => {
      const arr = [...d.steps];
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      return { ...d, steps: arr };
    });
  };

  // ── Kit de survie ──
  const setKit = (key: string, patch: Partial<DraftKitItem>) =>
    update((d) => ({ ...d, kit: d.kit.map((k) => (k.key === key ? { ...k, ...patch } : k)) }));

  const addKit = () =>
    update((d) => ({ ...d, kit: [...d.kit, { key: newRowKey(), name: '', location: '' }] }));

  const removeKit = (key: string) =>
    update((d) => ({ ...d, kit: d.kit.filter((k) => k.key !== key) }));

  // ── v4.44 — Minibar (Honesty Bar) ──
  const setMb = (key: string, patch: Partial<DraftMinibarItem>) =>
    update((d) => ({
      ...d,
      minibar: d.minibar.map((m) => (m.key === key ? { ...m, ...patch } : m)),
    }));

  const addMb = () =>
    update((d) => ({
      ...d,
      minibar: [...d.minibar, { key: newRowKey(), emoji: '🍷', name: '', price: '', photo: '', free: false }],
    }));

  const addMbSuggestion = (s: { emoji: string; name: string; price: string }) =>
    update((d) => ({
      ...d,
      minibar: [
        ...d.minibar,
        { key: newRowKey(), emoji: s.emoji, name: s.name, price: s.price, photo: '', free: false },
      ],
    }));

  const removeMb = (key: string) =>
    update((d) => ({ ...d, minibar: d.minibar.filter((m) => m.key !== key) }));

  // ── Upload photo (étape du guide visuel OU article du minibar — v4.47) ──
  const uploadImage = async (
    rowKey: string,
    file: File,
    target: 'step' | 'minibar' = 'step',
  ) => {
    if (!propertyId) return;
    setUploadingKey(rowKey);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/airbnb/concierge/upload?propertyId=${encodeURIComponent(propertyId)}`, {
        method: 'POST',
        body: fd,
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; url?: string; error?: string } | null;
      if (!res.ok || !json?.ok || !json.url) {
        toast.error(json?.error || 'Upload impossible.');
        return;
      }
      if (target === 'step') {
        setStep(rowKey, { imageUrl: json.url });
      } else if (rowKey === '__arrival__') {
        // v4.50 — photo du minibar rempli (inventaire d'arrivée).
        setPremium({ minibarArrivalPhoto: json.url });
      } else {
        setMb(rowKey, { photo: json.url });
      }
      toast.success('📷 Photo ajoutée.');
    } catch {
      toast.error('Connexion impossible. Réessayez.');
    } finally {
      setUploadingKey(null);
    }
  };

  const pickImage = (rowKey: string, target: 'step' | 'minibar' = 'step') => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif';
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) void uploadImage(rowKey, f, target);
    };
    input.click();
  };

  // ── WP-BACK v4.61 « 🎙️ VOIX DU GUIDEBOOK » ──
  // Voix audio de lecture du guide de bienvenue (app invitée + hub).
  // Stockée en HubVoiceMessage kind='guidebook' lang='fr' via la route
  // session /api/airbnb/properties/[id]/voice-messages (équivalent
  // session-gardé de la route PIN du hub). NB : le plafond TTS (600)
  // est dupliqué localement — lib/voice-tts.ts est SERVER ONLY.
  const MAX_GUIDEBOOK_TTS_CHARS = 600;
  const [guidebookVoice, setGuidebookVoice] = useState<{
    source: string;
    text: string | null;
    durationSec: number;
    fileSizeKb: number;
    updatedAt: string;
  } | null>(null);
  const [guidebookText, setGuidebookText] = useState('');
  const [voiceLoading, setVoiceLoading] = useState(true);
  const [voiceGenerating, setVoiceGenerating] = useState(false);
  const [voiceUploading, setVoiceUploading] = useState(false);
  const [voiceVersion, setVoiceVersion] = useState('');

  const loadGuidebookVoice = useCallback(async (pid: string) => {
    setVoiceLoading(true);
    try {
      const res = await fetch(`/api/airbnb/properties/${encodeURIComponent(pid)}/voice-messages`, {
        cache: 'no-store',
      });
      const json = (await res.json().catch(() => null)) as {
        items?: {
          kind: string;
          lang: string;
          source: string;
          text: string | null;
          durationSec: number;
          fileSizeKb: number;
          updatedAt: string;
        }[];
      } | null;
      const fr = json?.items?.find((v) => v.kind === 'guidebook' && v.lang === 'fr') ?? null;
      if (fr) {
        setGuidebookVoice(fr);
        setGuidebookText(fr.text ?? '');
        setVoiceVersion(fr.updatedAt);
      } else {
        setGuidebookVoice(null);
        setGuidebookText('');
        setVoiceVersion('');
      }
    } catch {
      // silencieux : la carte reste éditable même si la lecture échoue
      setGuidebookVoice(null);
    } finally {
      setVoiceLoading(false);
    }
  }, []);

  // WP-BACK v4.61 — charge la voix du guidebook du bien courant
  // (déclaré après loadGuidebookVoice — ordre des déclarations TS).
  useEffect(() => {
    if (initialPropertyId) void loadGuidebookVoice(initialPropertyId);
  }, [initialPropertyId, loadGuidebookVoice]);

  const generateGuidebookVoice = async () => {
    if (!propertyId) return;
    const text = guidebookText.trim();
    if (!text) {
      toast.error('Écrivez d’abord le texte à faire lire.');
      return;
    }
    setVoiceGenerating(true);
    try {
      const res = await fetch(`/api/airbnb/properties/${encodeURIComponent(propertyId)}/voice-messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'tts', kind: 'guidebook', lang: 'fr', text }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        toast.error(json?.error || 'Génération de la voix impossible.');
        return;
      }
      toast.success('✨ Voix du guidebook générée — vos invités l’entendront dans l’app.');
      await loadGuidebookVoice(propertyId);
    } catch {
      toast.error('Connexion impossible. Réessayez.');
    } finally {
      setVoiceGenerating(false);
    }
  };

  const uploadGuidebookVoice = (file: File) => {
    if (!propertyId) return;
    setVoiceUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = String(reader.result ?? '');
        const res = await fetch(`/api/airbnb/properties/${encodeURIComponent(propertyId)}/voice-messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'upload',
            kind: 'guidebook',
            lang: 'fr',
            audioBase64: dataUrl.slice(dataUrl.indexOf(',') + 1),
            audioMime: file.type,
            text: guidebookText.trim() || null,
          }),
        });
        const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
        if (!res.ok || !json?.ok) {
          toast.error(json?.error || 'Import impossible.');
          return;
        }
        toast.success('📤 Votre voix est enregistrée pour le guidebook ✅');
        await loadGuidebookVoice(propertyId);
      } catch {
        toast.error('Import impossible. Réessayez.');
      } finally {
        setVoiceUploading(false);
      }
    };
    reader.onerror = () => {
      setVoiceUploading(false);
      toast.error('Lecture du fichier impossible. Réessayez.');
    };
    reader.readAsDataURL(file);
  };

  const deleteGuidebookVoice = async () => {
    if (!propertyId) return;
    if (!window.confirm('Supprimer la voix du guidebook ? Vos invités n’auront plus de lecture audio.')) return;
    setVoiceGenerating(true);
    try {
      const res = await fetch(`/api/airbnb/properties/${encodeURIComponent(propertyId)}/voice-messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', kind: 'guidebook', lang: 'fr' }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        toast.error(json?.error || 'Suppression impossible.');
        return;
      }
      toast.success('Voix du guidebook supprimée 🗑️');
      setGuidebookVoice(null);
      setVoiceVersion('');
    } catch {
      toast.error('Connexion impossible. Réessayez.');
    } finally {
      setVoiceGenerating(false);
    }
  };

  // ── Enregistrement — validation client (miroir de l'API) + PATCH ──
  const save = async () => {
    if (!propertyId) return;

    // 1. Options premium
    const videoUrl = draft.videoUrl.trim();
    if (videoUrl && !/^https?:\/\//.test(videoUrl) && !videoUrl.startsWith('/')) {
      toast.error('Collez un lien vidéo public (YouTube, Vimeo ou Loom) commençant par https://.');
      return;
    }
    // v4.54 — audio de rappel de départ (URL publique ou /uploads/…).
    const checkoutAudioUrl = draft.checkoutAudioUrl.trim();
    if (checkoutAudioUrl && !/^https?:\/\//.test(checkoutAudioUrl) && !checkoutAudioUrl.startsWith('/')) {
      toast.error('Le lien audio du rappel de départ doit commencer par https:// ou /.');
      return;
    }
    const price = parsePriceInput(draft.lateCheckoutPrice);
    if (draft.enableLateCheckout && price === null) {
      toast.error('Indiquez le prix du late check-out (entre 1 et 1000 €).');
      return;
    }
    const lateHour = Number(draft.lateCheckoutHour);
    if (draft.enableLateCheckout && (!Number.isFinite(lateHour) || lateHour < 12 || lateHour > 18)) {
      toast.error('Heure de départ tardif invalide (entre 12 et 18 h).');
      return;
    }
    const reviewUrl = draft.reviewUrl.trim();
    if (draft.enableReviewShield && !/^https?:\/\//.test(reviewUrl)) {
      toast.error('Collez le lien de votre annonce (https://…) pour le bouclier d’avis.');
      return;
    }
    // v4.44 — minibar : nom + prix obligatoires (prix recalculé serveur).
    const minibarPayload: Record<string, unknown>[] = [];
    for (const m of draft.minibar) {
      const name = m.name.trim();
      const emoji = m.emoji.trim();
      const p = parsePriceInput(m.price);
      if (!name && !p) continue;
      if (!name || p === null) {
        toast.error('Chaque article du minibar doit avoir un nom et un prix (0,50 à 500 €).');
        return;
      }
      minibarPayload.push({
        id: m.key,
        name,
        price: p,
        ...(emoji ? { emoji } : {}),
        // v4.47 — photo produit (le hub remplace l'emoji par la photo).
        ...(m.photo.trim() ? { photo: m.photo.trim() } : {}),
        // v4.50 « PACK DE BIENVENUE » — article offert (0 € facturé).
        ...(m.free ? { free: true } : {}),
      });
    }
    if (draft.enableMinibar && minibarPayload.length === 0) {
      toast.error('Ajoutez au moins un article au minibar (ou désactivez-le).');
      return;
    }
    const premiumFeatures =
      videoUrl || checkoutAudioUrl || draft.enableLateCheckout || draft.enableReviewShield || draft.enableMinibar || draft.hubLockEnabled
        ? {
            ...(videoUrl ? { videoWelcomeUrl: videoUrl } : {}),
            // v4.54 — rappel vocal de départ (fallback TTS côté invité).
            ...(checkoutAudioUrl ? { checkoutAudioUrl } : {}),
            ...(draft.enableLateCheckout
              ? { enableLateCheckout: true, lateCheckoutPrice: price, lateCheckoutHour: Math.round(lateHour) }
              : {}),
            ...(draft.enableReviewShield ? { enableReviewShield: true, reviewUrl } : {}),
            ...(draft.enableMinibar ? { enableMinibar: true } : {}),
            // v4.50 « VERROUILLAGE DU HUB PAR CODE » — activé = le hub
            // exige le code d'activation du séjour (écran de verrouillage
            // + compte à rebours + fin de session serveur 403).
            ...(draft.hubLockEnabled
              ? {
                  hubLock: {
                    enabled: true,
                    ...(draft.hubLockInstructions.trim()
                      ? { checkoutInstructions: draft.hubLockInstructions.trim() }
                      : {}),
                    ...(draft.hubLockAllowLate ? { allowLateRequest: true } : {}),
                  },
                }
              : {}),
          }
        : null;

    // 2. Guide visuel — lignes vides ignorées, titre obligatoire
    const stepsPayload: Record<string, unknown>[] = [];
    for (const s of draft.steps) {
      const title = s.title.trim();
      const description = s.description.trim();
      const imageUrl = s.imageUrl.trim();
      if (!title && !description && !imageUrl) continue;
      if (!title) {
        toast.error('Chaque étape du guide visuel doit avoir un titre (ex : « La façade »).');
        return;
      }
      stepsPayload.push({
        id: s.key,
        title,
        ...(description ? { description } : {}),
        ...(imageUrl ? { imageUrl } : {}),
      });
    }

    // 3. Kit de survie — lignes vides ignorées, nom obligatoire
    const kitPayload: Record<string, unknown>[] = [];
    for (const k of draft.kit) {
      const name = k.name.trim();
      const location = k.location.trim();
      if (!name && !location) continue;
      if (!name) {
        toast.error('Chaque objet du kit de survie doit avoir un nom.');
        return;
      }
      kitPayload.push({ id: k.key, name, ...(location ? { location } : {}) });
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/airbnb/properties/${encodeURIComponent(propertyId)}/premium`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          premiumFeatures,
          minibarItems: draft.enableMinibar ? minibarPayload : null,
          // v4.50 — photo du minibar rempli (inventaire d'arrivée).
          minibarArrivalPhoto: draft.enableMinibar
            ? draft.minibarArrivalPhoto.trim() || null
            : null,
          visualGuide: stepsPayload,
          survivalKitItems: kitPayload,
        }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        toast.error(json?.error || 'Enregistrement impossible.');
        return;
      }
      setDirty(false);
      toast.success('✨ Expérience invité enregistrée — visible dans l’app de vos invités !');
    } catch {
      toast.error('Connexion impossible. Réessayez.');
    } finally {
      setSaving(false);
    }
  };

  // ── Compteurs ──
  const stepsCount = draft.steps.filter((s) => s.title.trim() || s.imageUrl.trim()).length;
  const kitCount = draft.kit.filter((k) => k.name.trim()).length;
  const premiumCount = [draft.videoUrl.trim(), draft.enableLateCheckout, draft.enableReviewShield, draft.enableMinibar].filter(Boolean).length;

  const previewHref = data?.property?.qrHubSlug ? `/app/hub/${data.property.qrHubSlug}/guest` : null;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6 sm:py-8">
      {/* ----- En-tête + switch propriété + aperçu ----- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="lux-display text-2xl font-semibold text-white sm:text-3xl">Expérience Invité</h1>
          <p className="mt-1.5 text-xs text-[#8fa0c2] sm:text-sm">
            Vidéo de bienvenue, arrivée guidée en photos, upselling et kit de survie — l’expérience 5 étoiles, dans l’app de vos invités.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {data && data.properties.length > 0 && (
            <Select value={data.property?.id ?? ''} onValueChange={changeProperty}>
              <SelectTrigger
                className="w-full rounded-full border-white/12 bg-white/[0.04] text-sm text-white sm:w-56"
                aria-label="Choisir le bien"
              >
                <SelectValue placeholder="Choisir un bien" />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-[#0d1530] text-white">
                {data.properties.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="focus:bg-white/8 focus:text-white">
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {previewHref && (
            <a
              href={previewHref}
              target="_blank"
              rel="noopener noreferrer"
              className="lux-btn-ghost h-9 whitespace-nowrap px-4 text-xs"
              title="Ouvrir l’app de vos invités dans un nouvel onglet"
            >
              Aperçu
            </a>
          )}
        </div>
      </div>

      {loading && !data && <LoadingSkeleton />}

      {!loading && error && (
        <div className="lux-card flex flex-col items-center gap-3 rounded-2xl p-8 text-center" role="alert">
          <span className="lux-dot" style={{ backgroundColor: '#f07d6a' }} aria-hidden="true" />
          <p className="text-sm font-semibold text-white">{error}</p>
          <button
            type="button"
            onClick={() => void load(propertyId || initialPropertyId)}
            className="lux-btn mt-1"
          >
            Réessayer
          </button>
        </div>
      )}

      {!loading && data && data.property && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="flex flex-col gap-4"
        >
          {/* ═══ v4.69 — GRILLE D'ONGLETS VISUELS (4 groupes) ═══ */}
          <div
            className="grid grid-cols-2 gap-3 xl:grid-cols-4"
            role="tablist"
            aria-label="Sections de l’expérience invité"
          >
            {GUEST_GROUPS.map((g) => {
              const active = activeGroup === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveGroup(g.id)}
                  className={cn(
                    'flex flex-col items-start gap-1 rounded-2xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5c8af0]/50',
                    active
                      ? 'border-[#5c8af0]/45 bg-[#5c8af0]/12 shadow-[0_12px_32px_-14px_rgba(61,111,224,0.55)] ring-2 ring-[#5c8af0]/25'
                      : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="lux-dot"
                      style={{ backgroundColor: active ? '#a9c4ff' : '#5c8af0' }}
                      aria-hidden="true"
                    />
                    <span className={cn('text-sm font-semibold uppercase tracking-[0.1em]', active ? 'text-white' : 'text-[#c7d3ec]')}>
                      {g.title}
                    </span>
                  </span>
                  <span className="text-[11px] leading-snug text-[#8fa0c2]">{g.desc}</span>
                </button>
              );
            })}
          </div>

          {/* ═══ GROUPE 🛬 ARRIVÉE — vidéo + voix côte à côte, guide pleine largeur
              (visibility toggle : les sections restent montées, state préservé) ═══ */}
          <div className={activeGroup === 'arrivee' ? 'grid items-start gap-4 lg:grid-cols-2' : 'hidden'}>
            <div className="order-1 min-w-0">
          {/* ═══════════ VIDÉO DE BIENVENUE ═══════════ */}
          <section className="lux-card p-5 sm:p-6" aria-label="Vidéo de bienvenue">
            <div className="min-w-0">
              <h2 className="lux-display flex flex-wrap items-center gap-2 text-lg font-semibold text-white">
                Vidéo de bienvenue
                <CountBadge n={premiumCount} />
              </h2>
              <p className="mt-1 text-xs text-[#8fa0c2] sm:text-sm">
                « Un mot de votre hôte » — la carte s’affiche en tête de l’accueil de vos invités.
              </p>
            </div>
            <div className="mt-4 flex flex-col gap-1.5">
              <Label htmlFor="premium-video" className="text-xs font-semibold text-[#8fa0c2]">
                Collez un lien YouTube, Vimeo ou Loom (public)
              </Label>
              <Input
                id="premium-video"
                value={draft.videoUrl}
                onChange={(e) => setPremium({ videoUrl: e.target.value })}
                maxLength={500}
                placeholder="https://youtube.com/watch?v=…"
                autoComplete="off"
                className="rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fa0c2]/60 focus-visible:ring-[#5c8af0]/50"
              />
            </div>
            {draft.videoUrl.trim() && (
              <VideoPreview url={draft.videoUrl.trim()} />
            )}
            <p className="mt-2 text-xs text-[#8fa0c2]/80">
              Astuce : une vidéo de 60–90 s suffit. Collez un lien PUBLIC (YouTube, Vimeo ou Loom) :
              il s’ouvre dans un lecteur dédié côté invité. Aucun fichier à téléverser.
            </p>

            {/* v4.54 « ALERTE VOCALE DE DÉPART » — audio pré-enregistré */}
            <div className="mt-4 border-t border-white/8 pt-4">
              <Label htmlFor="premium-checkout-audio" className="text-xs font-semibold text-[#8fa0c2]">
                Rappel vocal du départ <span className="font-normal text-[#8fa0c2]/70">(optionnel — modale de check-out)</span>
              </Label>
              <Input
                id="premium-checkout-audio"
                value={draft.checkoutAudioUrl}
                onChange={(e) => setPremium({ checkoutAudioUrl: e.target.value })}
                maxLength={500}
                placeholder="https://…/mon-message-depart.mp3 (ou /uploads/voice/…)"
                autoComplete="off"
                className="mt-1.5 rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fa0c2]/60 focus-visible:ring-[#5c8af0]/50"
              />
              <p className="mt-2 text-xs text-[#8fa0c2]/80">
                Lorsque l’invité confirme son départ, votre message est joué AVANT la checklist finale
                (chargeurs, sous le lit, coffre-fort…). Sans audio, une voix de synthèse française joue le rappel.
              </p>
            </div>
          </section>
            </div>
            {/* Guide visuel : pleine largeur (visuellement 3ᵉ via `order`). */}
            <div className="order-3 min-w-0 lg:col-span-2">
          {/* ═══════════ GUIDE VISUEL PAS À PAS ═══════════ */}
          <section className="lux-card p-5 sm:p-6" aria-label="Guide visuel d’arrivée">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <h2 className="lux-display flex flex-wrap items-center gap-2 text-lg font-semibold text-white">
                  Guide visuel d’arrivée
                  <CountBadge n={stepsCount} />
                </h2>
                <p className="mt-1 text-xs text-[#8fa0c2] sm:text-sm">
                  Pas à pas en photos : façade → digicode → porte… Fin des « C’est laquelle la porte ? ».
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 shrink-0 rounded-full border-white/12 bg-white/[0.04] text-xs font-semibold text-[#d5def0] hover:bg-white/8 hover:text-white"
                onClick={addStep}
                disabled={draft.steps.length >= MAX_STEPS}
              >
                Ajouter une étape
              </Button>
            </div>

            {draft.steps.length === 0 ? (
              <div className="lux-empty mt-4 flex flex-col items-center gap-2 rounded-2xl p-8 text-center">
                <p className="lux-display text-lg text-white">Aucune étape</p>
                <p className="mx-auto max-w-sm text-xs text-[#8fa0c2] sm:text-sm">
                  Ajoutez la façade, le digicode, la porte, l’ascenseur… dans l’ordre réel de l’arrivée.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3 h-8 rounded-full border-white/12 bg-white/[0.04] text-xs font-semibold text-[#d5def0] hover:bg-white/8 hover:text-white"
                  onClick={addStep}
                >
                  Ajouter une étape
                </Button>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {draft.steps.map((s, i) => (
                  <motion.div
                    key={s.key}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.03 * i, duration: 0.25 }}
                    draggable
                    onDragStart={() => {
                      dragIndex.current = i;
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragIndex.current !== null) moveStep(dragIndex.current, i);
                      dragIndex.current = null;
                    }}
                    onDragEnd={() => {
                      dragIndex.current = null;
                    }}
                    className="rounded-2xl border border-white/8 bg-white/[0.03] p-4"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="hidden cursor-grab select-none text-[#8fa0c2]/50 hover:text-[#8fa0c2] sm:block"
                        title="Glisser pour réordonner"
                        aria-hidden="true"
                      >
                        ↕
                      </span>
                      <span className="lux-num inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#3d6fe0]/15 text-sm font-semibold text-[#a9c4ff] ring-1 ring-[#5c8af0]/25" aria-hidden="true">
                        {i + 1}
                      </span>
                      <Input
                        value={s.title}
                        onChange={(e) => setStep(s.key, { title: e.target.value })}
                        maxLength={80}
                        className="flex-1 rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fa0c2]/60 focus-visible:ring-[#5c8af0]/50"
                        placeholder={`Titre de l’étape ${i + 1} (ex : « La façade »)`}
                        aria-label={`Titre de l’étape ${i + 1}`}
                      />
                      <div className="flex shrink-0 flex-col gap-0.5">
                        <button
                          type="button"
                          className="rounded p-0.5 text-[#8fa0c2]/80 transition-colors hover:bg-white/8 hover:text-white disabled:opacity-30"
                          onClick={() => moveStep(i, i - 1)}
                          disabled={i === 0}
                          aria-label={`Monter l’étape ${i + 1}`}
                        >
                          <span aria-hidden="true" className="text-sm leading-none">↑</span>
                        </button>
                        <button
                          type="button"
                          className="rounded p-0.5 text-[#8fa0c2]/80 transition-colors hover:bg-white/8 hover:text-white disabled:opacity-30"
                          onClick={() => moveStep(i, i + 1)}
                          disabled={i === draft.steps.length - 1}
                          aria-label={`Descendre l’étape ${i + 1}`}
                        >
                          <span aria-hidden="true" className="text-sm leading-none">↓</span>
                        </button>
                      </div>
                      <DeleteRowButton onClick={() => removeStep(s.key)} label={`Supprimer l’étape ${s.title || i + 1}`} />
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-[auto_1fr]">
                      {/* Zone photo — glisser-déposer ou clic */}
                      {s.imageUrl ? (
                        <div className="flex flex-col gap-1.5">
                          <img
                            src={s.imageUrl}
                            alt={`Photo de l’étape ${s.title || i + 1}`}
                            className="h-28 w-44 rounded-xl border border-white/10 object-cover"
                            loading="lazy"
                            decoding="async"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-full border-white/12 bg-white/[0.04] text-xs font-semibold text-[#d5def0] hover:bg-white/8 hover:text-white"
                            onClick={() => setStep(s.key, { imageUrl: '' })}
                          >
                            Retirer la photo
                          </Button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onDragOver={(e) => {
                            e.preventDefault();
                            setDragOverKey(s.key);
                          }}
                          onDragLeave={() => setDragOverKey(null)}
                          onDrop={(e) => {
                            e.preventDefault();
                            setDragOverKey(null);
                            const f = e.dataTransfer.files?.[0];
                            if (f) void uploadImage(s.key, f);
                          }}
                          onClick={() => pickImage(s.key)}
                          disabled={uploadingKey === s.key}
                          className={cn(
                            'flex h-28 w-44 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-center text-xs transition-colors',
                            dragOverKey === s.key
                              ? 'border-[#5c8af0]/70 bg-[#5c8af0]/10 text-[#a9c4ff]'
                              : 'border-white/12 bg-white/[0.03] text-[#8fa0c2] hover:border-white/25 hover:bg-white/[0.05]',
                          )}
                          aria-label={`Ajouter la photo de l’étape ${s.title || i + 1} (glisser-déposer ou cliquer)`}
                        >
                          {uploadingKey === s.key ? (
                            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                          ) : (
                            <span className="px-2 font-semibold">Glissez une photo ou cliquez</span>
                          )}
                        </button>
                      )}
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-col gap-1.5">
                          <Label className="text-xs font-semibold text-[#8fa0c2]">Texte court pour l’invité</Label>
                          <Textarea
                            value={s.description}
                            onChange={(e) => setStep(s.key, { description: e.target.value })}
                            maxLength={280}
                            rows={3}
                            placeholder="ex : Immeuble bleu avec la porte verte — le digicode est à droite."
                            aria-label={`Description de l’étape ${s.title || i + 1}`}
                            className="rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fa0c2]/60 focus-visible:ring-[#5c8af0]/50"
                          />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-0 rounded-full border-white/12 bg-white/[0.04] text-xs font-semibold text-[#d5def0] hover:bg-white/8 hover:text-white"
                  onClick={addStep}
                  disabled={draft.steps.length >= MAX_STEPS}
                >
                  Ajouter une étape
                </Button>
              </div>
            )}
          </section>
            </div>
            {/* Voix du guidebook : à côté de la vidéo (visuellement 2ᵉ via `order`). */}
            <div className="order-2 min-w-0">
          {/* ═══════════ VOIX DU GUIDEBOOK (WP-BACK v4.61) ═══════════ */}
          <section className="lux-card p-5 sm:p-6" aria-label="Voix du guidebook">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <h2 className="lux-display flex flex-wrap items-center gap-2 text-lg font-semibold text-white">
                  Voix du guidebook
                </h2>
                <p className="mt-1 text-xs text-[#8fa0c2] sm:text-sm">
                  Une voix qui lit votre guide de bienvenue aux invités — dans l’app invitée et le hub.
                </p>
              </div>
              {guidebookVoice && (
                <Badge variant="outline" className="shrink-0 gap-1.5 rounded-full border-[#34d399]/30 bg-[#34d399]/10 px-2.5 text-[11px] font-semibold text-[#86e9cb]">
                  <span className="lux-dot" style={{ backgroundColor: '#34d399' }} aria-hidden="true" />
                  {guidebookVoice.source === 'tts' ? 'Voix générée' : 'Votre voix'} · {guidebookVoice.durationSec} s
                </Badge>
              )}
            </div>

            {voiceLoading ? (
              <div className="mt-4 space-y-2">
                <Skeleton className="h-20 w-full rounded-xl bg-white/8" aria-hidden="true" />
                <Skeleton className="h-9 w-48 rounded-full bg-white/8" aria-hidden="true" />
              </div>
            ) : (
              <>
                {guidebookVoice && (
                  <audio
                    controls
                    preload="none"
                    src={`/api/airbnb/properties/${encodeURIComponent(propertyId)}/voice-messages?format=audio&kind=guidebook&lang=fr&v=${encodeURIComponent(voiceVersion)}`}
                    className="mt-4 h-10 w-full"
                    aria-label="Écouter la voix actuelle du guidebook"
                  />
                )}
                <div className="mt-4 flex flex-col gap-1.5">
                  <Label htmlFor="guidebook-voice-text" className="text-xs font-semibold text-[#8fa0c2]">
                    Texte à faire lire ({guidebookText.length}/{MAX_GUIDEBOOK_TTS_CHARS} caractères)
                  </Label>
                  <Textarea
                    id="guidebook-voice-text"
                    value={guidebookText}
                    onChange={(e) => setGuidebookText(e.target.value.slice(0, MAX_GUIDEBOOK_TTS_CHARS))}
                    maxLength={MAX_GUIDEBOOK_TTS_CHARS}
                    rows={4}
                    placeholder="ex : Bienvenue ! Récupérez les clés dans le coffre à gauche de la porte, le code est 4821. Le wifi s’appelle Maison-Verte…"
                    aria-label="Texte de la voix du guidebook"
                    className="rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fa0c2]/60 focus-visible:ring-[#5c8af0]/50"
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void generateGuidebookVoice()}
                    disabled={voiceGenerating || voiceUploading || !guidebookText.trim()}
                    className="lux-btn h-9 px-4 text-xs"
                  >
                    {voiceGenerating && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    Générer la voix
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'audio/*';
                      input.onchange = () => {
                        const f = input.files?.[0];
                        if (f) uploadGuidebookVoice(f);
                      };
                      input.click();
                    }}
                    disabled={voiceGenerating || voiceUploading}
                    className="h-9 rounded-full border-white/12 bg-white/[0.04] text-xs font-semibold text-[#d5def0] hover:bg-white/8 hover:text-white"
                  >
                    {voiceUploading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    Enregistrer ma voix
                  </Button>
                  {guidebookVoice && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => void deleteGuidebookVoice()}
                      disabled={voiceGenerating || voiceUploading}
                      className="h-9 rounded-full text-xs font-semibold text-[#f6a293] hover:bg-[#f07d6a]/10 hover:text-[#f6a293]"
                      aria-label="Supprimer la voix du guidebook"
                    >
                      Supprimer
                    </Button>
                  )}
                </div>
                <p className="mt-2 text-xs text-[#8fa0c2]/80">
                  « Générer la voix » synthétise votre texte en français (max {MAX_GUIDEBOOK_TTS_CHARS} caractères ≈ 30 s).
                  « Enregistrer ma voix » importe votre propre audio (MP3, M4A, WAV, WEBM ou OGG — max 1 Mo) :
                  elle remplace la voix générée et reste prioritaire sur la voix par défaut de la plateforme.
                </p>
              </>
            )}
          </section>
            </div>
          </div>

          {/* ═══ GROUPE 🛎️ SERVICES & EXTRAS ═══ */}
          <div className={activeGroup === 'services' ? 'space-y-4' : 'hidden'}>
          {/* ═══════════ SERVICES & UPSELLING ═══════════ */}
          <section className="lux-card p-5 sm:p-6" aria-label="Services et upselling">
            <div className="min-w-0">
              <h2 className="lux-display text-lg font-semibold text-white">Services &amp; Upselling</h2>
              <p className="mt-1 text-xs text-[#8fa0c2] sm:text-sm">
                Transformez l’app en source de revenus — et protégez votre note en cas de couac.
              </p>
            </div>

            <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
              {/* Late check-out */}
              <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Label htmlFor="toggle-late" className="text-sm font-semibold text-white">
                      Late Check-out payant
                    </Label>
                    <p className="mt-0.5 text-xs text-[#8fa0c2]">
                      L’invité voit une carte « Prolonger votre séjour ? » sur son accueil.
                    </p>
                  </div>
                  <Switch
                    id="toggle-late"
                    checked={draft.enableLateCheckout}
                    onCheckedChange={(v) => setPremium({ enableLateCheckout: v })}
                    aria-label="Activer le late check-out payant"
                  />
                </div>
                {draft.enableLateCheckout && (
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="late-price" className="text-xs font-semibold text-[#8fa0c2]">
                        Prix (€)
                      </Label>
                      <Input
                        id="late-price"
                        value={draft.lateCheckoutPrice}
                        onChange={(e) => setPremium({ lateCheckoutPrice: e.target.value })}
                        inputMode="decimal"
                        maxLength={7}
                        className="w-28 rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fa0c2]/60 focus-visible:ring-[#5c8af0]/50"
                        placeholder="20"
                        aria-label="Prix du late check-out en euros"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="late-hour" className="text-xs font-semibold text-[#8fa0c2]">
                        Départ jusqu’à
                      </Label>
                      <Select
                        value={draft.lateCheckoutHour}
                        onValueChange={(v) => setPremium({ lateCheckoutHour: v })}
                      >
                        <SelectTrigger
                          id="late-hour"
                          className="w-24 rounded-full border-white/12 bg-white/[0.04] text-white"
                          aria-label="Heure de fin du départ tardif"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="border-white/10 bg-[#0d1530] text-white">
                          {[12, 13, 14, 15, 16, 17, 18].map((h) => (
                            <SelectItem key={h} value={String(h)} className="focus:bg-white/8 focus:text-white">
                              {h} h
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
                {draft.enableLateCheckout && (
                  <p className="mt-2 rounded-xl border border-[#34d399]/25 bg-[#34d399]/8 px-3 py-2 text-xs leading-relaxed text-[#9fe8d4]">
                    <strong>Automatisation v4.44 :</strong> le serveur vérifie votre calendrier — si le logement est libre le jour du départ, l’invité voit « Prolongez jusqu’à {draft.lateCheckoutHour} h pour {draft.lateCheckoutPrice || '…'} € » ; s’il est déjà loué, le départ tardif est automatiquement indisponible.
                  </p>
                )}
              </div>

              {/* Bouclier d'avis */}
              <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Label htmlFor="toggle-shield" className="text-sm font-semibold text-white">
                      Bouclier d’avis (Review Shield)
                    </Label>
                    <p className="mt-0.5 text-xs text-[#8fa0c2]">
                      Invités ravis → guidés vers votre annonce. Invités déçus → message privé d’abord.
                    </p>
                  </div>
                  <Switch
                    id="toggle-shield"
                    checked={draft.enableReviewShield}
                    onCheckedChange={(v) => setPremium({ enableReviewShield: v })}
                    aria-label="Activer le bouclier d’avis"
                  />
                </div>
                {draft.enableReviewShield && (
                  <div className="mt-3 flex flex-col gap-1.5">
                    <Label htmlFor="review-url" className="text-xs font-semibold text-[#8fa0c2]">
                      Lien de votre annonce (Airbnb, Booking…)
                    </Label>
                    <Input
                      id="review-url"
                      value={draft.reviewUrl}
                      onChange={(e) => setPremium({ reviewUrl: e.target.value })}
                      maxLength={500}
                      placeholder="https://www.airbnb.com/rooms/…"
                      autoComplete="off"
                      aria-label="Lien de l’annonce pour le bouclier d’avis"
                      className="rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fa0c2]/60 focus-visible:ring-[#5c8af0]/50"
                    />
                  </div>
                )}
              </div>
              {/* v4.44 — Minibar numérique (Honesty Bar) — pleine largeur */}
              <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4 lg:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Label htmlFor="toggle-minibar" className="text-sm font-semibold text-white">
                      Minibar numérique (Honesty Bar)
                    </Label>
                    <p className="mt-0.5 text-xs text-[#8fa0c2]">
                      Snacks, vin, bières locales, câbles neufs… L’invité coche sa consommation et paie (CB / Apple Pay) ou règle sur place.
                    </p>
                  </div>
                  <Switch
                    id="toggle-minibar"
                    checked={draft.enableMinibar}
                    onCheckedChange={(v) => setPremium({ enableMinibar: v })}
                    aria-label="Activer le minibar numérique"
                  />
                </div>
                {draft.enableMinibar && (
                  <div className="mt-3">
                    {draft.minibar.length === 0 && (
                      <div className="rounded-xl border border-dashed border-white/12 p-3">
                        <p className="text-xs text-[#8fa0c2]">
                          Ajoutez vos articles (ou partez d’une suggestion) — prix recalculés côté serveur à chaque commande.
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {MINIBAR_SUGGESTIONS.map((s) => (
                            <button
                              key={s.name}
                              type="button"
                              onClick={() => addMbSuggestion(s)}
                              disabled={draft.minibar.length >= MAX_MINIBAR_ITEMS}
                              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-[#c7d3ec] transition-colors hover:bg-white/8 hover:text-white disabled:opacity-50"
                            >
                              {s.emoji} {s.name} · {s.price} €
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="mt-2 space-y-2">
                      {draft.minibar.map((m, i) => (
                        <div key={m.key} className="flex items-center gap-2">
                          {/* v4.47 — VRAIE photo produit (remplace l'icône emoji côté invité). */}
                          <div className="relative shrink-0">
                            <button
                              type="button"
                              onClick={() => pickImage(m.key, 'minibar')}
                              disabled={uploadingKey === m.key}
                              aria-label={`Photo de l’article ${m.name || i + 1}`}
                              className={cn(
                                'flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border-2 text-[#8fa0c2]/70 transition-colors hover:border-[#5c8af0]/60 hover:text-[#a9c4ff]',
                                m.photo
                                  ? 'border-solid border-white/10 bg-white/[0.04]'
                                  : 'border-dashed border-white/12 bg-white/[0.03]',
                                uploadingKey === m.key && 'animate-pulse opacity-60',
                              )}
                            >
                              {m.photo ? (
                                
                                <img src={m.photo} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <span aria-hidden="true" className="text-base leading-none">+</span>
                              )}
                            </button>
                            {m.photo && (
                              <button
                                type="button"
                                onClick={() => setMb(m.key, { photo: '' })}
                                aria-label={`Retirer la photo de l’article ${m.name || i + 1}`}
                                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-[#0b1226] text-[#8fa0c2] shadow-sm transition-colors hover:text-[#f6a293]"
                              >
                                <span aria-hidden="true" className="text-xs leading-none">×</span>
                              </button>
                            )}
                          </div>
                          <Input
                            value={m.emoji}
                            onChange={(e) => setMb(m.key, { emoji: e.target.value })}
                            maxLength={4}
                            className="w-12 rounded-xl border-white/12 bg-white/[0.04] text-center text-white placeholder:text-[#8fa0c2]/60 focus-visible:ring-[#5c8af0]/50 max-sm:hidden"
                            placeholder="🍷"
                            aria-label={`Emoji de secours de l’article ${m.name || i + 1}`}
                          />
                          <Input
                            value={m.name}
                            onChange={(e) => setMb(m.key, { name: e.target.value })}
                            maxLength={60}
                            className="flex-1 rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fa0c2]/60 focus-visible:ring-[#5c8af0]/50"
                            placeholder="Article (ex : Bière locale)"
                            aria-label={`Nom de l’article ${i + 1}`}
                          />
                          <Input
                            value={m.price}
                            onChange={(e) => setMb(m.key, { price: e.target.value })}
                            inputMode="decimal"
                            maxLength={7}
                            className={cn('w-20 rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fa0c2]/60 focus-visible:ring-[#5c8af0]/50', m.free && 'opacity-40')}
                            placeholder="€"
                            disabled={m.free}
                            aria-label={`Prix de l’article ${m.name || i + 1}`}
                          />
                          {/* v4.50 « PACK DE BIENVENUE » — article offert. */}
                          <button
                            type="button"
                            onClick={() => setMb(m.key, { free: !m.free })}
                            aria-pressed={m.free}
                            aria-label={`Article offert (pack de bienvenue) : ${m.name || i + 1}`}
                            className={cn(
                              'h-9 shrink-0 rounded-lg border px-2 text-xs font-bold transition-colors max-sm:hidden',
                              m.free
                                ? 'border-[#e9c47c]/40 bg-[#e9c47c]/12 text-[#e9c47c]'
                                : 'border-white/10 bg-white/[0.04] text-[#8fa0c2] hover:border-[#e9c47c]/40 hover:text-[#e9c47c]',
                            )}
                          >
                            <span aria-hidden="true">✓</span>
                          </button>
                          <DeleteRowButton onClick={() => removeMb(m.key)} label={`Supprimer l’article ${m.name || i + 1}`} />
                        </div>
                      ))}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2 h-8 rounded-full border-white/12 bg-white/[0.04] text-xs font-semibold text-[#d5def0] hover:bg-white/8 hover:text-white"
                      onClick={addMb}
                      disabled={draft.minibar.length >= MAX_MINIBAR_ITEMS}
                    >
                      Ajouter un article
                    </Button>
                    <p className="mt-1.5 text-[11px] text-[#8fa0c2]/80">
                      ✓ = article OFFERT (pack de bienvenue) : mis en avant côté invité pour l’inciter à ouvrir le minibar, facturé 0 €.
                    </p>

                    {/* ── v4.50 SYSTÈME DE CONFIANCE — photo du minibar rempli ──
                        L'invité voit cette photo à son arrivée et valide
                        l'inventaire EN 1 CLIC (« tout est là »). */}
                    <div className="mt-4 rounded-xl border border-[#e9c47c]/25 bg-[#e9c47c]/8 p-3">
                      <div className="flex items-start gap-3">
                        <div className="relative shrink-0">
                          <button
                            type="button"
                            onClick={() => pickImage('__arrival__', 'minibar')}
                            disabled={uploadingKey === '__arrival__'}
                            aria-label="Photo du minibar rempli à l’arrivée"
                            className={cn(
                              'flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border-2 text-[#8fa0c2]/70 transition-colors hover:border-[#e9c47c]/60 hover:text-[#e9c47c]',
                              draft.minibarArrivalPhoto
                                ? 'border-solid border-white/10 bg-white/[0.04]'
                                : 'border-dashed border-[#e9c47c]/40 bg-white/[0.03]',
                              uploadingKey === '__arrival__' && 'animate-pulse opacity-60',
                            )}
                          >
                            {draft.minibarArrivalPhoto ? (
                              <img src={draft.minibarArrivalPhoto} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <span aria-hidden="true" className="text-lg leading-none">+</span>
                            )}
                          </button>
                          {draft.minibarArrivalPhoto && (
                            <button
                              type="button"
                              onClick={() => setPremium({ minibarArrivalPhoto: '' })}
                              aria-label="Retirer la photo d’arrivée du minibar"
                              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-[#0b1226] text-[#8fa0c2] shadow-sm transition-colors hover:text-[#f6a293]"
                            >
                              <span aria-hidden="true" className="text-xs leading-none">×</span>
                            </button>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#f3d795]">
                            Photo du minibar rempli (à l’arrivée)
                          </p>
                          <p className="mt-0.5 text-xs leading-relaxed text-[#e9c47c]/80">
                            Prenez en photo le minibar prêt pour l’invité. À son entrée, il compare et valide le contenu en un clic — confiance réciproque, zéro litige.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* v4.50 — suivi des commandes / validations / réappro. */}
                    <MinibarOpsPanel propertyId={propertyId} />
                  </div>
                )}
              </div>
            </div>
          </section>
          </div>

          {/* ═══ GROUPE 📊 SUIVI & RAPPORTS ═══ */}
          <div className={activeGroup === 'rapports' ? 'space-y-4' : 'hidden'}>
          {/* ═══════════ 📋 RAPPORTS DE CHECK-OUT (v4.53) ═══════════ */}
          <CheckoutReportsPanel
            propertyId={propertyId}
            propertyName={data?.property?.name ?? 'Logement'}
          />
          </div>

          {/* ═══ GROUPE 🔐 SÉCURITÉ & DÉPART ═══ */}
          <div className={activeGroup === 'securite' ? 'grid items-start gap-4 lg:grid-cols-2' : 'hidden'}>
            <div className="min-w-0">
          {/* ═══════════ VERROUILLAGE DU HUB PAR CODE (v4.50) ═══════════ */}
          <section
            className="lux-card p-5 sm:p-6"
            aria-label="Verrouillage du hub par code"
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <h2 className="lux-display text-lg font-semibold text-white">Verrouillage du hub par code</h2>
                <p className="mt-1 text-xs text-[#8fa0c2]">
                  Chaque réservation du calendrier reçoit automatiquement un code PIN unique (4 chiffres). L&apos;invité le saisit au scan du QR pour déverrouiller son hub — qui se verrouille seul à l&apos;heure exacte de fin de séjour (compte à rebours visible en haut de l&apos;écran).
                </p>
              </div>
              <Switch
                id="toggle-hublock"
                checked={draft.hubLockEnabled}
                onCheckedChange={(v) => setPremium({ hubLockEnabled: v })}
                aria-label="Activer le verrouillage du hub par code"
              />
            </div>
            {draft.hubLockEnabled && (
              <div className="mt-3 space-y-3 rounded-xl border border-white/8 bg-white/[0.03] p-4">
                <div className="rounded-lg border border-[#e9c47c]/25 bg-[#e9c47c]/8 p-3 text-xs leading-relaxed text-[#f3d795]">
                  <p className="font-bold">Où trouver le code de chaque séjour ?</p>
                  <p className="mt-1">
                    Il est généré automatiquement et affiché dans le <strong>Calendrier</strong> (fiche de la réservation + après création) : 4 derniers chiffres du téléphone de l&apos;invité, sinon 4 derniers du code Airbnb/Booking, sinon aléatoire unique. Un départ tardif validé dans le calendrier prolonge le verrouillage automatiquement.
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="hublock-instructions" className="text-xs font-semibold text-[#8fa0c2]">
                    Consignes de départ (affichées dans la modal du compte à rebours)
                  </Label>
                  <Textarea
                    id="hublock-instructions"
                    value={draft.hubLockInstructions}
                    onChange={(e) => setPremium({ hubLockInstructions: e.target.value })}
                    maxLength={600}
                    rows={3}
                    placeholder="Laissez les clés sur la table, éteignez la climatisation, triez les déchets…"
                    aria-label="Consignes de départ"
                    className="rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fa0c2]/60 focus-visible:ring-[#5c8af0]/50"
                  />
                  <p className="text-[11px] text-[#8fa0c2]/80">
                    Où laisser les clés, éteindre la clim, tri… {draft.hubLockInstructions.length}/600
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">
                      Autoriser « Demander un départ tardif »
                    </p>
                    <p className="mt-0.5 text-xs text-[#8fa0c2]">
                      Bouton dans la modal du compte à rebours (si le module Départ tardif est activé). Une prolongation validée rallonge automatiquement le verrouillage.
                    </p>
                  </div>
                  <Switch
                    id="toggle-hublock-late"
                    checked={draft.hubLockAllowLate}
                    onCheckedChange={(v) => setPremium({ hubLockAllowLate: v })}
                    aria-label="Autoriser les demandes de départ tardif"
                  />
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs text-[#8fa0c2]">
                  <p className="font-semibold text-white">Double vérification intégrée</p>
                  <p className="mt-1 leading-relaxed">
                    Côté téléphone : compte à rebours en continu, effacement de la clé locale à zéro. Côté serveur : chaque action du hub (minibar, commandes, tickets…) est refusée (403 Session expirée) dès que l&apos;heure de fin de séjour est passée — même si l&apos;onglet reste ouvert.
                  </p>
                </div>
              </div>
            )}
          </section>
            </div>
            <div className="min-w-0">
          {/* ═══════════ KIT DE SURVIE ═══════════ */}
          <section className="lux-card p-5 sm:p-6" aria-label="Kit de survie">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <h2 className="lux-display flex flex-wrap items-center gap-2 text-lg font-semibold text-white">
                  Kit de survie
                  <CountBadge n={kitCount} />
                </h2>
                <p className="mt-1 text-xs text-[#8fa0c2] sm:text-sm">
                  Les objets qu’on oublie toujours — et leur emplacement exact dans le logement.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 shrink-0 rounded-full border-white/12 bg-white/[0.04] text-xs font-semibold text-[#d5def0] hover:bg-white/8 hover:text-white"
                onClick={addKit}
                disabled={draft.kit.length >= MAX_KIT_ITEMS}
              >
                Ajouter
              </Button>
            </div>

            {draft.kit.length === 0 ? (
              <div className="lux-empty mt-4 flex flex-col items-center gap-2 rounded-2xl p-8 text-center">
                <p className="lux-display text-lg text-white">Aucun objet</p>
                <p className="mx-auto max-w-sm text-xs text-[#8fa0c2] sm:text-sm">
                  Chargeur iPhone, adaptateur, parapluie… Listez-les avec leur emplacement — fin des appels paniques à 23 h.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3 h-8 rounded-full border-white/12 bg-white/[0.04] text-xs font-semibold text-[#d5def0] hover:bg-white/8 hover:text-white"
                  onClick={addKit}
                >
                  Ajouter un objet
                </Button>
              </div>
            ) : (
              <div className="mt-4 space-y-2.5">
                {draft.kit.map((k, i) => (
                  <motion.div
                    key={k.key}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.03 * i, duration: 0.25 }}
                    className="flex flex-col gap-2 rounded-xl border border-white/8 bg-white/[0.03] p-3 sm:flex-row sm:items-center"
                  >
                    <Input
                      value={k.name}
                      onChange={(e) => setKit(k.key, { name: e.target.value })}
                      maxLength={60}
                      className="rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fa0c2]/60 focus-visible:ring-[#5c8af0]/50 sm:w-56"
                      placeholder="Objet (ex : Chargeur iPhone)"
                      aria-label={`Nom de l’objet ${i + 1}`}
                    />
                    <Input
                      value={k.location}
                      onChange={(e) => setKit(k.key, { location: e.target.value })}
                      maxLength={120}
                      className="flex-1 rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fa0c2]/60 focus-visible:ring-[#5c8af0]/50"
                      placeholder="Emplacement (ex : Tiroir de la cuisine, sous le micro-ondes)"
                      aria-label={`Emplacement de l’objet ${k.name || i + 1}`}
                    />
                    <DeleteRowButton onClick={() => removeKit(k.key)} label={`Supprimer l’objet ${k.name || i + 1}`} />
                  </motion.div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-full border-white/12 bg-white/[0.04] text-xs font-semibold text-[#d5def0] hover:bg-white/8 hover:text-white"
                  onClick={addKit}
                  disabled={draft.kit.length >= MAX_KIT_ITEMS}
                >
                  Ajouter un objet
                </Button>
              </div>
            )}
          </section>
            </div>
          </div>

          {/* ----- Barre d'enregistrement sticky ----- */}
          <div
            className={cn(
              'sticky bottom-4 z-30 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#0b1226]/95 p-3 shadow-[0_18px_44px_-24px_rgba(2,6,18,0.9)] backdrop-blur',
              dirty && 'border-[#e9c47c]/50',
            )}
          >
            <p className="flex items-center gap-2 text-sm font-semibold text-white" aria-live="polite">
              {dirty ? (
                <>
                  <span className="lux-dot" style={{ backgroundColor: '#e9c47c' }} aria-hidden="true" />
                  Modifications non enregistrées
                </>
              ) : (
                <>
                  <span className="lux-dot" style={{ backgroundColor: '#34d399' }} aria-hidden="true" />
                  Tout est à jour
                </>
              )}
            </p>
            <Button
              onClick={() => void save()}
              disabled={saving || loading || !propertyId}
              className="lux-btn h-9 px-5 text-xs"
              aria-label="Enregistrer l’expérience invité"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Enregistrer
            </Button>
          </div>
        </motion.div>
      )}

      {!loading && data && !data.property && (
        <div className="lux-empty rounded-2xl p-10 text-center">
          <h2 className="lux-display text-lg text-white">Aucun bien</h2>
          <p className="mt-2 text-xs text-[#8fa0c2] sm:text-sm">Ajoutez d’abord un bien pour créer son expérience invité.</p>
        </div>
      )}
    </div>
  );
}

// =============================================================
// Helpers de rendu
// =============================================================

/** Aperçu de la vidéo : lecteur local (<video>) ou carte lien (CSP-safe). */
function VideoPreview({ url }: { url: string }) {
  if (isLocalMediaUrl(url)) {
    return (
      <video
        src={url}
        controls
        muted
        playsInline
        preload="metadata"
        className="mt-3 aspect-video w-full max-w-md rounded-xl border border-white/10 bg-black"
        aria-label="Aperçu de la vidéo de bienvenue"
      />
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-3 flex max-w-md items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 transition-colors hover:bg-white/[0.05]"
      title="Prévisualiser la vidéo dans un nouvel onglet"
    >
      <span className="lux-rule w-6 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-white">{url}</span>
        <span className="block text-xs text-[#8fa0c2]">Cliquez pour prévisualiser — l’invité la verra en tête d’accueil</span>
      </span>
      <span className="shrink-0 text-sm text-[#8fa0c2]" aria-hidden="true">→</span>
    </a>
  );
}

function hydrateDraft(json: PremiumGetResponse): PremiumDraft {
  const pf = (json.premium?.premiumFeatures ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  const num = (v: unknown): string => (typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
  const bool = (v: unknown): boolean => v === true;

  return {
    videoUrl: str(pf.videoWelcomeUrl),
    // v4.54 — audio pré-enregistré du rappel de départ.
    checkoutAudioUrl: str(pf.checkoutAudioUrl),
    enableLateCheckout: bool(pf.enableLateCheckout),
    lateCheckoutPrice: num(pf.lateCheckoutPrice),
    // v4.44 — heure de fin du départ tardif (12–18, défaut 14).
    lateCheckoutHour:
      typeof pf.lateCheckoutHour === 'number' &&
      Number.isFinite(pf.lateCheckoutHour) &&
      pf.lateCheckoutHour >= 12 &&
      pf.lateCheckoutHour <= 18
        ? String(Math.round(pf.lateCheckoutHour))
        : '14',
    enableReviewShield: bool(pf.enableReviewShield),
    reviewUrl: str(pf.reviewUrl),
    // v4.44 — minibar (items parsés côté serveur).
    enableMinibar: bool(pf.enableMinibar) || json.premium?.minibar?.enabled === true,
    minibar: (json.premium?.minibar?.items ?? []).map((m) => ({
      key: m.id || newRowKey(),
      emoji: m.emoji ?? '🍷',
      name: m.name ?? '',
      price: typeof m.price === 'number' && Number.isFinite(m.price) ? String(m.price) : '',
      // v4.47 — photo produit (champ optionnel).
      photo: typeof m.photo === 'string' ? m.photo : '',
      // v4.50 « PACK DE BIENVENUE » — article offert.
      free: m.free === true,
    })),
    // v4.50 — photo du minibar rempli (inventaire d'arrivée).
    minibarArrivalPhoto:
      typeof json.premium?.minibar?.arrivalPhoto === 'string' ? json.premium.minibar.arrivalPhoto : '',
    steps: (json.premium?.visualGuide ?? []).map((s) => ({
      key: s.id || newRowKey(),
      title: s.title ?? '',
      description: s.description ?? '',
      imageUrl: s.imageUrl ?? '',
    })),
    kit: (json.premium?.survivalKitItems ?? []).map((k) => ({
      key: k.id || newRowKey(),
      name: k.name ?? '',
      location: k.location ?? '',
    })),
    // v4.50 « VERROUILLAGE DU HUB PAR CODE ».
    hubLockEnabled: (pf.hubLock as Record<string, unknown> | undefined)?.enabled === true,
    hubLockInstructions:
      typeof (pf.hubLock as Record<string, unknown> | undefined)?.checkoutInstructions === 'string'
        ? String((pf.hubLock as Record<string, unknown>).checkoutInstructions)
        : '',
    hubLockAllowLate:
      (pf.hubLock as Record<string, unknown> | undefined)?.allowLateRequest !== false,
  };
}

function CountBadge({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="ml-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#e9c47c]/12 px-1 text-[10px] font-bold text-[#e9c47c]">
      {n}
    </span>
  );
}

function DeleteRowButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="shrink-0 text-[#8fa0c2]/70 hover:bg-[#f07d6a]/10 hover:text-[#f6a293]"
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <span aria-hidden="true" className="text-base leading-none">×</span>
    </Button>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Chargement de l’expérience invité">
      <Skeleton className="h-10 w-56 rounded-full bg-white/8" aria-hidden="true" />
      <Skeleton className="h-44 w-full rounded-2xl bg-white/8" aria-hidden="true" />
      <Skeleton className="h-64 w-full rounded-2xl bg-white/8" aria-hidden="true" />
      <Skeleton className="h-56 w-full rounded-2xl bg-white/8" aria-hidden="true" />
    </div>
  );
}

// =============================================================
// v4.50 « MINIBAR DE CONFIANCE » — PANNEAU DE SUIVI HÔTE
// Commandes persistées (payer maintenant / facturer au départ),
// validations d'inventaire d'arrivée et demandes « Recharger le
// frigo ». Données : GET/PATCH /api/airbnb/properties/[id]/minibar-ops
// =============================================================
interface OpsOrderLine {
  name: string;
  emoji: string;
  qty: number;
  lineTotal: number;
  free: boolean;
}
interface OpsOrder {
  id: string;
  guestName: string | null;
  items: OpsOrderLine[];
  totalEur: number;
  payment: string;
  status: string;
  createdAt: string;
}
interface OpsCheck {
  id: string;
  guestName: string | null;
  checkedAt: string;
}
interface OpsRestock {
  id: string;
  guestName: string | null;
  status: string;
  createdAt: string;
  handledAt: string | null;
}

function MinibarOpsPanel({ propertyId }: { propertyId: string }) {
  const [orders, setOrders] = useState<OpsOrder[]>([]);
  const [checks, setChecks] = useState<OpsCheck[]>([]);
  const [restocks, setRestocks] = useState<OpsRestock[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (pid: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/airbnb/properties/${encodeURIComponent(pid)}/minibar-ops`);
      const json = (await res.json().catch(() => null)) as {
        orders?: OpsOrder[];
        checks?: OpsCheck[];
        restocks?: OpsRestock[];
      } | null;
      if (res.ok && json) {
        setOrders(json.orders ?? []);
        setChecks(json.checks ?? []);
        setRestocks(json.restocks ?? []);
      }
    } catch {
      // Panneau silencieux (données secondaires).
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (propertyId) void load(propertyId);
  }, [propertyId, load]);

  const patch = async (body: Record<string, string>) => {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/airbnb/properties/${encodeURIComponent(propertyId)}/minibar-ops`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(j.error || 'Action impossible.');
        return;
      }
      await load(propertyId);
    } catch {
      toast.error('Connexion impossible. Réessayez.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <Skeleton className="mt-4 h-24 w-full rounded-2xl bg-white/8" />;
  }

  const pendingRestocks = restocks.filter((r) => r.status === 'PENDING');
  const openOrders = orders.filter((o) => o.status === 'OPEN' && o.payment !== 'free');
  const eur = (v: number) =>
    v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <p className="lux-display text-sm font-semibold text-white">Suivi minibar du bien</p>

      {/* Réapprovisionnements à traiter */}
      <div className="mt-2">
        <p className="lux-eyebrow">
          Demandes « Recharger le frigo » {pendingRestocks.length > 0 ? `(${pendingRestocks.length} en attente)` : ''}
        </p>
        {pendingRestocks.length === 0 ? (
          <p className="mt-1 text-[11px] text-[#8fa0c2]/80">Aucune demande en attente.</p>
        ) : (
          <ul className="mt-1.5 space-y-1.5">
            {pendingRestocks.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-[#2dd4bf]/25 bg-[#2dd4bf]/8 px-2.5 py-1.5"
              >
                <span className="min-w-0 text-xs text-[#8de8dc]">
                  <span className="font-semibold">{r.guestName || 'Un invité'}</span> · demandé le{' '}
                  {new Date(r.createdAt).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
                <Button
                  size="sm"
                  className="h-8 shrink-0 rounded-full bg-[#2dd4bf] text-xs font-bold text-[#06231f] hover:bg-[#4be0cc]"
                  disabled={busy}
                  onClick={() => void patch({ restockId: r.id, action: 'MARK_DONE' })}
                >
                  Rechargé ✓
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Commandes à encaisser */}
      <div className="mt-3">
        <p className="lux-eyebrow">
          Consommations à encaisser {openOrders.length > 0 ? `(${openOrders.length})` : ''}
        </p>
        {openOrders.length === 0 ? (
          <p className="mt-1 text-[11px] text-[#8fa0c2]/80">Aucune consommation ouverte.</p>
        ) : (
          <ul className="lux-scroll mt-1.5 max-h-40 space-y-1.5 overflow-y-auto pr-1">
            {openOrders.map((o) => (
              <li
                key={o.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-2.5 py-1.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-white">
                    {o.guestName || 'Un invité'} · <span className="lux-num text-[#e9c47c]">{eur(o.totalEur)}</span>
                    {o.payment === 'departure' ? (
                      <span className="ml-1 rounded-full bg-[#e9c47c]/12 px-1.5 py-0.5 text-[9px] font-bold text-[#e9c47c]">
                        au départ
                      </span>
                    ) : (
                      <span className="ml-1 rounded-full bg-white/8 px-1.5 py-0.5 text-[9px] font-bold text-[#8fa0c2]">
                        sur place
                      </span>
                    )}
                  </p>
                  <p className="truncate text-[11px] text-[#8fa0c2]/80">
                    {o.items.map((l) => `${l.emoji} ×${l.qty}${l.free ? ' 🎁' : ''}`).join(', ')}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 shrink-0 rounded-full border-white/12 bg-white/[0.04] text-xs font-semibold text-[#d5def0] hover:bg-white/8 hover:text-white"
                  disabled={busy}
                  onClick={() => void patch({ orderId: o.id, action: 'MARK_PAID' })}
                >
                  Encaissé
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Validations d'inventaire (historique court) */}
      {checks.length > 0 && (
        <div className="mt-3">
          <p className="lux-eyebrow">Inventaires validés (arrivée)</p>
          <p className="mt-1 text-[11px] text-[#8fa0c2]/80">
            Dernière validation :{' '}
            {new Date(checks[0].checkedAt).toLocaleString('fr-FR', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
            {checks[0].guestName ? ` — ${checks[0].guestName}` : ''} · {checks.length} au total
          </p>
        </div>
      )}
    </div>
  );
}

// =============================================================
// v4.53 « RAPPORT DE CONSOMMATION AUTOMATIQUE AU CHECK-OUT »
// PANNEAU HÔTE — au moment où le compte à rebours expire, RoomScan
// génère un récapitulatif net : « Consommations Minibar : 2 eaux,
// 1 vin. Signalements : Aucun. Preuve Ménage : Validée à 14h15. »
// Données : GET /api/airbnb/properties/[id]/checkout-reports
// (génération paresseuse incluse — aucun cron).
// Export PDF : src/lib/checkout-report-pdf.ts (jspdf, 1 clic).
// =============================================================
interface CheckoutReportItem {
  id: string;
  bookingId: string | null;
  guestName: string | null;
  checkIn: string | null;
  checkOut: string | null;
  minibar: ReportMinibarLine[];
  minibarTotal: number;
  minibarCheckedAt: string | null;
  signalements: ReportSignalement[];
  signalementsCount: number;
  cleaningValidatedAt: string | null;
  cleaningStaffName: string | null;
  departedAt: string | null;
  restockPending: boolean;
  generatedAt: string;
  updatedAt: string;
}

function frShort(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function frHour(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function CheckoutReportsPanel({ propertyId, propertyName }: { propertyId: string; propertyName: string }) {
  const [reports, setReports] = useState<CheckoutReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [exportingId, setExportingId] = useState<string | null>(null);
  // v4.54 — export « Journal de Séjour » en cours (id du rapport).
  const [journalingId, setJournalingId] = useState<string | null>(null);

  const load = useCallback(async (pid: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/airbnb/properties/${encodeURIComponent(pid)}/checkout-reports`,
      );
      const json = (await res.json().catch(() => null)) as {
        reports?: CheckoutReportItem[];
      } | null;
      if (res.ok && json) setReports(json.reports ?? []);
    } catch {
      // Panneau silencieux (données secondaires).
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (propertyId) void load(propertyId);
  }, [propertyId, load]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const exportPdf = async (r: CheckoutReportItem) => {
    setExportingId(r.id);
    try {
      await downloadCheckoutReportPdf({
        propertyName,
        guestName: r.guestName,
        checkIn: r.checkIn,
        checkOut: r.checkOut,
        minibar: r.minibar,
        minibarTotal: r.minibarTotal,
        minibarCheckedAt: r.minibarCheckedAt,
        signalements: r.signalements,
        cleaningValidatedAt: r.cleaningValidatedAt,
        cleaningStaffName: r.cleaningStaffName,
        departedAt: r.departedAt,
        restockPending: r.restockPending,
      });
      toast.success('Rapport de check-out exporté en PDF ✅');
    } catch {
      toast.error('Export impossible. Réessayez.');
    } finally {
      setExportingId(null);
    }
  };

  // v4.54 « JOURNAL DE SÉJOUR » — agrégat comptable complet du séjour
  // (minibar + départ tardif + pressing + services payés + ménage).
  const exportJournal = async (r: CheckoutReportItem) => {
    if (!r.bookingId) {
      toast.error('Ce séjour n\u2019est pas rattaché à une réservation.');
      return;
    }
    setJournalingId(r.id);
    try {
      const res = await fetch(
        `/api/airbnb/properties/${encodeURIComponent(propertyId)}/stay-report?bookingId=${encodeURIComponent(r.bookingId)}`,
      );
      const json = (await res.json().catch(() => null)) as
        | (StayJournalPdfInput & { error?: string })
        | null;
      if (!res.ok || !json || json.error) {
        throw new Error(json?.error || 'http');
      }
      await downloadStayJournalPdf({
        propertyName: json.propertyName,
        propertyAddress: json.propertyAddress,
        guestName: json.guestName,
        guestEmail: json.guestEmail,
        checkIn: json.checkIn,
        checkOut: json.checkOut,
        lateCheckOutUntil: json.lateCheckOutUntil,
        nights: json.nights,
        guests: json.guests,
        minibar: json.minibar,
        lateCheckout: json.lateCheckout,
        laundry: json.laundry,
        services: json.services,
        cleaning: json.cleaning,
        totals: json.totals,
      });
      toast.success('Journal de Séjour exporté en PDF ✅');
    } catch {
      toast.error('Export du journal impossible. Réessayez.');
    } finally {
      setJournalingId(null);
    }
  };

  const eur = (v: number) => v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

  return (
    <section
      className="lux-card p-5 sm:p-6"
      aria-label="Rapports de check-out"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="lux-display text-lg font-semibold text-white">Rapports de check-out</h2>
          <p className="mt-1 text-xs text-[#8fa0c2] sm:text-sm">
            À l&apos;expiration du compte à rebours de chaque séjour, un récapitulatif net est
            généré automatiquement : consommations minibar, signalements, preuve ménage horodatée.
          </p>
        </div>
        {reports.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 rounded-full border-white/12 bg-white/[0.04] text-xs font-semibold text-[#d5def0] hover:bg-white/8 hover:text-white"
            onClick={() => void load(propertyId)}
            aria-label="Rafraîchir les rapports de check-out"
          >
            <Loader2
              className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            Actualiser
          </Button>
        )}
      </div>

      {loading && reports.length === 0 ? (
        <Skeleton className="mt-4 h-24 w-full rounded-2xl bg-white/8" />
      ) : reports.length === 0 ? (
        <div className="lux-empty mt-4 rounded-xl p-6 text-center">
          <p className="lux-display text-lg text-white">Aucun rapport pour le moment</p>
          <p className="mx-auto mt-2 max-w-md text-xs text-[#8fa0c2] sm:text-sm">
            Le premier rapport apparaîtra dès qu&apos;un séjour se terminera (compte à rebours
            expiré ou départ confirmé dans le Hub).
          </p>
        </div>
      ) : (
        <ul className="lux-scroll mt-4 max-h-[46vh] space-y-3 overflow-y-auto pr-1">
          {reports.map((r) => {
            const isOpen = expanded.has(r.id);
            const stayed = r.minibarCheckedAt
              ? 'Inventaire d’arrivée validé'
              : 'Inventaire non validé';
            return (
              <li key={r.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">
                      {r.guestName || 'Séjour'}
                    </p>
                    <p className="mt-0.5 text-xs text-[#8fa0c2]">
                      {frShort(r.checkIn)} → {frShort(r.checkOut)}
                      {r.departedAt ? ` · départ confirmé ${frHour(r.departedAt)}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0 rounded-full border-white/12 bg-white/[0.04] text-xs font-semibold text-[#d5def0] hover:bg-white/8 hover:text-white"
                      disabled={exportingId === r.id}
                      onClick={() => void exportPdf(r)}
                      aria-label={`Exporter le rapport PDF du séjour de ${r.guestName ?? 'invité'}`}
                    >
                      {exportingId === r.id && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      )}
                      Exporter PDF
                    </Button>
                    {r.bookingId && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 shrink-0 rounded-full border-[#34d399]/25 bg-[#34d399]/10 text-xs font-semibold text-[#86e9cb] hover:bg-[#34d399]/20 hover:text-[#86e9cb]"
                        disabled={journalingId === r.id}
                        onClick={() => void exportJournal(r)}
                        aria-label={`Exporter le Journal de Séjour (PDF) de ${r.guestName ?? 'invité'}`}
                      >
                        {journalingId === r.id && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        )}
                        Journal de séjour
                      </Button>
                    )}
                  </div>
                </div>

                {/* Résumé net — 3 puces clés (spec client) */}
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <span
                    className={`lux-chip whitespace-nowrap ${
                      r.minibar.length > 0 ? '!border-[#e9c47c]/25 !bg-[#e9c47c]/8 !text-[#e9c47c]' : ''
                    }`}
                  >
                    <span
                      className="lux-dot"
                      style={{ backgroundColor: r.minibar.length > 0 ? '#e9c47c' : '#8fa0c2' }}
                      aria-hidden="true"
                    />
                    Consommations :{' '}
                    {r.minibar.length > 0
                      ? `${r.minibar.map((l) => `${l.qty} ${l.name}`).join(', ')} — ${eur(r.minibarTotal)}`
                      : 'Aucune'}
                  </span>
                  <span
                    className={`lux-chip whitespace-nowrap ${
                      r.signalementsCount > 0
                        ? '!border-[#f07d6a]/25 !bg-[#f07d6a]/8 !text-[#f6a293]'
                        : '!border-[#34d399]/25 !bg-[#34d399]/8 !text-[#86e9cb]'
                    }`}
                  >
                    <span
                      className="lux-dot"
                      style={{ backgroundColor: r.signalementsCount > 0 ? '#f07d6a' : '#34d399' }}
                      aria-hidden="true"
                    />
                    Signalements : {r.signalementsCount > 0 ? `${r.signalementsCount}` : 'Aucun'}
                  </span>
                  <span
                    className={`lux-chip whitespace-nowrap ${
                      r.cleaningValidatedAt
                        ? '!border-[#2dd4bf]/25 !bg-[#2dd4bf]/8 !text-[#8de8dc]'
                        : ''
                    }`}
                  >
                    <span
                      className="lux-dot"
                      style={{ backgroundColor: r.cleaningValidatedAt ? '#2dd4bf' : '#8fa0c2' }}
                      aria-hidden="true"
                    />
                    Preuve Ménage :{' '}
                    {r.cleaningValidatedAt
                      ? `Validée à ${frHour(r.cleaningValidatedAt)}`
                      : 'En attente'}
                  </span>
                  {r.restockPending && (
                    <span className="lux-chip whitespace-nowrap !border-[#f07d6a]/25 !bg-[#f07d6a]/8 !text-[#f6a293]">
                      <span
                        className="lux-dot"
                        style={{ backgroundColor: '#f07d6a' }}
                        aria-hidden="true"
                      />
                      Recharge du frigo à faire
                    </span>
                  )}
                </div>

                {/* Détail dépliable */}
                <div className="mt-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#8fa0c2] transition-colors hover:text-white"
                    onClick={() => toggle(r.id)}
                    aria-expanded={isOpen}
                  >
                    <span
                      aria-hidden="true"
                      className={`inline-block text-[11px] leading-none transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    >
                      ▾
                    </span>
                    {isOpen ? 'Masquer le détail' : 'Voir le détail'}
                  </button>
                  {isOpen && (
                    <div className="mt-2 space-y-2 rounded-xl bg-white/[0.04] p-3">
                      <p className="flex items-center gap-1.5 text-[11px] text-[#8fa0c2]">
                        <span
                          className="lux-dot"
                          style={{ backgroundColor: r.minibarCheckedAt ? '#34d399' : '#fbbf24' }}
                          aria-hidden="true"
                        />
                        {stayed}
                        {r.minibarCheckedAt ? ` — ${frShort(r.minibarCheckedAt)}` : ''}
                      </p>
                      {r.minibar.length > 0 && (
                        <ul className="space-y-1">
                          {r.minibar.map((l, i) => (
                            <li key={`${r.id}-l-${i}`} className="text-xs text-[#d5def0]">
                              {l.emoji} {l.qty} × {l.name}
                              {l.free ? ' 🎁 offert' : ` — ${eur(l.total)}`}
                            </li>
                          ))}
                        </ul>
                      )}
                      {r.signalements.length > 0 && (
                        <ul className="space-y-1.5">
                          {r.signalements.map((s, i) => (
                            <li key={`${r.id}-s-${i}`} className="text-xs text-[#d5def0]">
                              <span className="font-semibold">{s.label}</span>{' '}
                              ({s.status === 'RESOLVED' ? 'résolu' : 'ouvert'}) —{' '}
                              {s.description.slice(0, 160)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
