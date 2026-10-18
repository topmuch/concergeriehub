'use client';

// =============================================================
// DIGITAL CONCIERGE (V4.1) — ÉDITEURS CÔTÉ HÔTE (« Espace Hôte »)
// Page /airbnb/concierge : les 6 modules du Hub Invité remplis par
// l'hôte, sauvegardés via PATCH /api/airbnb/concierge :
//   Coffre-fort     → Property.accessCodes
//   Appareils       → Property.appliances (+ vidéo YouTube / photo)
//   Bonnes adresses → Property.localSpots (Carte Secrète)
//   SOS             → Property.emergencyInfo (+ pannes courantes)
//   Boutique        → Property.premiumFeatures.shop (v4.42 — Shop the Stay)
//   Horaires vocaux → Property.premiumFeatures.voiceTriggers (v4.42)
//
// v5.2 « SAPHIR LUXE » — refonte design profonde (demande client) :
// • Design SIMPLE, LUXUEUX, PROFESSIONNEL — mode sombre BLEUTÉ
// • SANS ICÔNES : typographie (lux-eyebrow / lux-display / lux-num),
//   points colorés .lux-dot et glyphes purs (+ × ✓) — aucun lucide,
//   aucun emoji décoratif (titres, boutons, badges, empty states)
// • Cartes .lux-card, onglets visuels à point coloré, champs nuit
//   saphir, blocs CODES D'ACCÈS en or ambré (#e9c47c) avec .lux-num,
//   portails Radix stylés explicitement (Select sur bg-[#0d1530]),
//   barre d'enregistrement sticky luxueuse.
// • DONNÉES, HANDLERS, VALIDATIONS ET LIBELLÉS MÉTIER INTACTS —
//   les emojis SAISIS (appareils, produits) restent des données.
//
// Historique :
// v4.69 — PHASE 1 refonte UI : la TabsList Radix est remplacée par une
//   GRILLE D'ONGLETS VISUELS (cartes titre + mini-compteur d'éléments
//   remplis) qui pilote setActiveTab — Tabs/TabsContent inchangés.
// =============================================================

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DEFAULT_SHOP_ITEMS,
  DEFAULT_VOICE_TRIGGERS,
  SHOP_COMMISSION_RATE,
  SPOT_CATEGORY_META,
  type GuestAppliance,
  type GuestShopItem,
  type GuestSpot,
  type GuestSpotCategory,
} from '@/lib/concierge';

// ── Types locaux (brouillons éditables — strings pour la saisie) ──

interface DraftCodes {
  building: string;
  letterbox: string;
  parking: string;
  alarm: string;
  safe: string;
  note: string;
}

interface DraftAppliance {
  key: string;
  emoji: string;
  name: string;
  instructions: string;
  videoUrl: string;
  imageUrl: string;
}

interface DraftSpot {
  key: string;
  name: string;
  category: GuestSpotCategory;
  address: string;
  lat: string;
  lng: string;
  hostNote: string;
}

interface DraftIssue {
  key: string;
  title: string;
  instructions: string;
  imageUrl: string;
}

interface DraftSos {
  hostPhone: string;
  // AUDIT 4-c — email de contact INVITÉ (anti-exposition de l'email
  // de connexion de l'hôte : une adresse dédiée type
  // contact@ma-conciergerie.fr est affichée dans le Hub invité).
  hostEmail: string;
  police: string;
  hospital: string;
  hospitalLat: string;
  hospitalLng: string;
  pharmacy: string;
  pharmacyPhone: string;
  // v4.41 — lien « produit de remplacement » (casse 1 clic) : Amazon,
  // Castorama, fournisseur local… proposé à l'invité après son signalement.
  breakageShopUrl: string;
  issues: DraftIssue[];
}

// v4.42 — produit « Shop the Stay » éditable (price en string pour la
// saisie libre — virgule acceptée — puis converti en number au save).
interface DraftShopItem {
  key: string;
  name: string;
  emoji: string;
  description: string;
  price: string;
  url: string;
}

// v4.42 — horaires des messages vocaux (strings pour les <select>).
interface DraftVoice {
  eveHour: string;
  dayHour: string;
}

interface ConciergeDraft {
  codes: DraftCodes;
  appliances: DraftAppliance[];
  spots: DraftSpot[];
  sos: DraftSos;
  shop: DraftShopItem[];
  voice: DraftVoice;
}

interface ConciergeGetResponse {
  properties: { id: string; name: string }[];
  property: { id: string; name: string; qrHubSlug: string | null } | null;
  concierge: {
    accessCodes: Record<string, unknown> | null;
    appliances: GuestAppliance[];
    localSpots: GuestSpot[];
    emergencyInfo: Record<string, unknown> | null;
    // v4.42 — boutique « Shop the Stay » + horaires des messages vocaux
    // (optionnels : tolère une API légèrement plus ancienne).
    shopItems?: GuestShopItem[];
    hasCustomShop?: boolean;
    voiceTriggers?: { eveHour: number; dayHour: number };
  } | null;
  error?: string;
}

const CODE_FIELDS: { key: keyof Omit<DraftCodes, 'note'>; label: string; placeholder: string }[] = [
  { key: 'building', label: 'Bâtiment / Entrée', placeholder: 'ex : 8452#' },
  { key: 'letterbox', label: 'Boîte aux lettres', placeholder: 'ex : B-12' },
  { key: 'parking', label: 'Parking', placeholder: 'ex : B2-12' },
  { key: 'alarm', label: 'Alarme', placeholder: 'ex : 2468' },
  { key: 'safe', label: 'Coffre-fort', placeholder: 'ex : 0000' },
];

const SPOT_CATEGORIES = Object.entries(SPOT_CATEGORY_META) as [GuestSpotCategory, { emoji: string; label: string }][];

/** v4.69 — métadonnées des onglets visuels (grille de cartes, point coloré = identité). */
const CONCIERGE_TABS: { value: string; label: string; hint: string; dot: string }[] = [
  { value: 'codes', label: 'Coffre-fort', hint: 'Codes d’accès', dot: '#e9c47c' },
  { value: 'appliances', label: 'Appareils', hint: 'Modes d’emploi', dot: '#2dd4bf' },
  { value: 'spots', label: 'Adresses', hint: 'Carte secrète', dot: '#86e9cb' },
  { value: 'sos', label: 'SOS', hint: 'Urgences & pannes', dot: '#f07d6a' },
  { value: 'shop', label: 'Boutique', hint: 'Shop the Stay', dot: '#cdb6ff' },
  { value: 'voice', label: 'Vocaux', hint: 'Horaires des messages', dot: '#5c8af0' },
];

const EMPTY_CODES: DraftCodes = { building: '', letterbox: '', parking: '', alarm: '', safe: '', note: '' };
const EMPTY_SOS: DraftSos = {
  hostPhone: '',
  hostEmail: '',
  police: '',
  hospital: '',
  hospitalLat: '',
  hospitalLng: '',
  pharmacy: '',
  pharmacyPhone: '',
  breakageShopUrl: '',
  issues: [],
};

// v4.42 — même borne que l’API (validateShopItemsInput : 8 produits max).
const MAX_SHOP_ITEMS = 8;
const EMPTY_VOICE: DraftVoice = {
  eveHour: String(DEFAULT_VOICE_TRIGGERS.eveHour),
  dayHour: String(DEFAULT_VOICE_TRIGGERS.dayHour),
};
// Bornes de choix des horaires vocaux (larges) : veille 18→23 h, jour J 6→12 h.
// Si la valeur chargée est hors bornes, elle est réinjectée dans la liste.
const VOICE_EVE_HOURS = Array.from({ length: 6 }, (_, i) => 18 + i);
const VOICE_DAY_HOURS = Array.from({ length: 7 }, (_, i) => 6 + i);

function newRowKey(): string {
  try {
    return crypto.randomUUID().slice(0, 8);
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}

/** "48,8566" → 48.8566 (les coordonnées copiées de Maps peuvent contenir une virgule). */
function parseCoordInput(raw: string): number | null {
  const n = Number(raw.trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** "12,90" → 12.9 (les prix saisis avec une virgule sont acceptés). */
function parsePriceInput(raw: string): number | null {
  const n = Number(raw.trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// ── Classes communes « Saphir Luxe » ──
const LUX_FIELD =
  'rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fa0c2]/60 focus-visible:ring-[#5c8af0]/50';
const LUX_GHOST_BTN =
  'rounded-full border-white/12 bg-white/[0.04] font-semibold text-[#d5def0] hover:bg-white/8 hover:text-white';
/** Bloc code d'accès / PIN — or ambré luxueux (demande client). */
const LUX_CODE_FIELD =
  'lux-num rounded-xl border-[#e9c47c]/25 bg-[#e9c47c]/8 text-[#e9c47c] placeholder:text-[#8fa0c2]/50 focus-visible:ring-[#e9c47c]/40';
const LUX_SELECT_ITEM = 'focus:bg-white/8 focus:text-white';

export function ConciergeContent() {
  const [data, setData] = useState<ConciergeGetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [activeTab, setActiveTab] = useState('codes');
  // v4.42 — true = l’hôte a SA propre boutique (sinon catalogue d’exemple).
  const [hasCustomShop, setHasCustomShop] = useState(false);

  const [draft, setDraft] = useState<ConciergeDraft>({
    codes: { ...EMPTY_CODES },
    appliances: [],
    spots: [],
    sos: { ...EMPTY_SOS, issues: [] },
    shop: [],
    voice: { ...EMPTY_VOICE },
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  // ── Chargement ──
  const load = useCallback(async (pid?: string) => {
    setLoading(true);
    setError('');
    try {
      const qs = pid ? `?propertyId=${encodeURIComponent(pid)}` : '';
      const res = await fetch(`/api/airbnb/concierge${qs}`);
      const json = (await res.json()) as ConciergeGetResponse;
      if (!res.ok) {
        setError(json.error || 'Impossible de charger la conciergerie.');
        setData(null);
        return;
      }
      setData(json);
      setPropertyId(json.property?.id ?? '');
      setHasCustomShop(json.concierge?.hasCustomShop ?? false);
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
    void load();
  }, [load]);

  const changeProperty = (pid: string) => {
    if (dirty && !window.confirm('Des modifications ne sont pas enregistrées — changer de bien ?')) return;
    setPropertyId(pid);
    void load(pid);
  };

  // ── Mise à jour du brouillon (marque « dirty » automatiquement) ──
  const update = (fn: (d: ConciergeDraft) => ConciergeDraft) => {
    setDraft(fn);
    setDirty(true);
  };

  const setCode = (key: keyof DraftCodes, value: string) =>
    update((d) => ({ ...d, codes: { ...d.codes, [key]: value } }));

  const setAppliance = (key: string, patch: Partial<DraftAppliance>) =>
    update((d) => ({ ...d, appliances: d.appliances.map((a) => (a.key === key ? { ...a, ...patch } : a)) }));

  const addAppliance = () =>
    update((d) => ({
      ...d,
      appliances: [...d.appliances, { key: newRowKey(), emoji: '', name: '', instructions: '', videoUrl: '', imageUrl: '' }],
    }));

  const removeAppliance = (key: string) =>
    update((d) => ({ ...d, appliances: d.appliances.filter((a) => a.key !== key) }));

  /** v4.47 — « ⚡ Pack universel » : importe le catalogue d'appareils de
   *  référence partagé par toutes les maisons (GET /api/public/
   *  universal-content). Les appareils déjà présents (même nom) ne sont
   *  PAS dupliqués — l'hôte retire/ajuste ensuite ce qui ne s'applique
   *  pas au bien. */
  const importUniversalPack = async () => {
    try {
      const res = await fetch('/api/public/universal-content');
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        appliances?: { id: string; name: string; emoji?: string; instructions: string; imageUrl?: string }[];
        error?: string;
      } | null;
      if (!res.ok || !json?.ok || !Array.isArray(json.appliances)) {
        toast.error(json?.error || 'Pack universel indisponible.');
        return;
      }
      const existing = new Set(draft.appliances.map((a) => a.name.trim().toLowerCase()));
      const additions = json.appliances.filter((a) => !existing.has(a.name.trim().toLowerCase()));
      if (additions.length === 0) {
        toast.info('Tous les appareils du pack universel sont déjà dans votre liste.');
        return;
      }
      update((d) => ({
        ...d,
        appliances: [
          ...d.appliances,
          ...additions.map((a) => ({
            key: newRowKey(),
            emoji: a.emoji ?? '🛠️',
            name: a.name,
            instructions: a.instructions,
            videoUrl: '',
            // v4.48 — la photo produit universelle accompagne l'import
            // (l'hôte peut ensuite la remplacer par la photo de SON appareil).
            imageUrl: a.imageUrl ?? '',
          })),
        ],
      }));
      toast.success(`⚡ ${additions.length} appareil(s) du pack universel ajouté(s).`, {
        description: 'Ajustez les instructions, puis retirez ce qui ne s’applique pas à votre bien.',
      });
    } catch {
      toast.error('Connexion impossible. Réessayez.');
    }
  };

  const setSpot = (key: string, patch: Partial<DraftSpot>) =>
    update((d) => ({ ...d, spots: d.spots.map((s) => (s.key === key ? { ...s, ...patch } : s)) }));

  const addSpot = () =>
    update((d) => ({
      ...d,
      spots: [...d.spots, { key: newRowKey(), name: '', category: 'food', address: '', lat: '', lng: '', hostNote: '' }],
    }));

  const removeSpot = (key: string) =>
    update((d) => ({ ...d, spots: d.spots.filter((s) => s.key !== key) }));

  const setSos = (patch: Partial<Omit<DraftSos, 'issues'>>) =>
    update((d) => ({ ...d, sos: { ...d.sos, ...patch } }));

  const setIssue = (key: string, patch: Partial<DraftIssue>) =>
    update((d) => ({ ...d, sos: { ...d.sos, issues: d.sos.issues.map((i) => (i.key === key ? { ...i, ...patch } : i)) } }));

  const addIssue = () =>
    update((d) => ({ ...d, sos: { ...d.sos, issues: [...d.sos.issues, { key: newRowKey(), title: '', instructions: '', imageUrl: '' }] } }));

  const removeIssue = (key: string) =>
    update((d) => ({ ...d, sos: { ...d.sos, issues: d.sos.issues.filter((i) => i.key !== key) } }));

  // ── v4.42 — Boutique « Shop the Stay » ──
  const setShopItem = (key: string, patch: Partial<DraftShopItem>) =>
    update((d) => ({ ...d, shop: d.shop.map((it) => (it.key === key ? { ...it, ...patch } : it)) }));

  const addShopItem = () =>
    update((d) => ({
      ...d,
      shop: [...d.shop, { key: newRowKey(), name: '', emoji: '', description: '', price: '', url: '' }],
    }));

  const removeShopItem = (key: string) =>
    update((d) => ({ ...d, shop: d.shop.filter((it) => it.key !== key) }));

  /** Remplit le brouillon avec le catalogue d’exemple (4 produits démo). */
  const restoreShopDefaults = () => update((d) => ({ ...d, shop: defaultShopDraft() }));

  // ── v4.42 — Horaires des messages vocaux ──
  const setVoice = (patch: Partial<DraftVoice>) =>
    update((d) => ({ ...d, voice: { ...d.voice, ...patch } }));

  // ── Upload photo (appareil / panne) ──
  const uploadImage = async (kind: 'appliance' | 'issue', rowKey: string, file: File) => {
    if (!propertyId) return;
    const busyKey = `${kind}:${rowKey}`;
    setUploadingKey(busyKey);
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
      if (kind === 'appliance') {
        setAppliance(rowKey, { imageUrl: json.url });
      } else {
        setIssue(rowKey, { imageUrl: json.url });
      }
      toast.success('📷 Photo ajoutée.');
    } catch {
      toast.error('Connexion impossible. Réessayez.');
    } finally {
      setUploadingKey(null);
    }
  };

  const pickImage = (kind: 'appliance' | 'issue', rowKey: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif';
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) void uploadImage(kind, rowKey, f);
    };
    input.click();
  };

  // ── Enregistrement — validation client + PATCH complet ──
  const save = async () => {
    if (!propertyId) return;

    // 1. Codes — lignes vides ignorées
    const codes = draft.codes;
    const codesPayload = {
      building: codes.building.trim(),
      letterbox: codes.letterbox.trim(),
      parking: codes.parking.trim(),
      alarm: codes.alarm.trim(),
      safe: codes.safe.trim(),
      note: codes.note.trim() || undefined,
    };
    const accessCodes =
      codesPayload.building || codesPayload.letterbox || codesPayload.parking || codesPayload.alarm || codesPayload.safe
        ? codesPayload
        : null;

    // 2. Appareils
    const appliancesPayload: Record<string, unknown>[] = [];
    for (const a of draft.appliances) {
      const name = a.name.trim();
      const instructions = a.instructions.trim();
      if (!name && !instructions && !a.videoUrl.trim() && !a.imageUrl.trim() && !a.emoji.trim()) continue;
      if (!name) {
        setActiveTab('appliances');
        toast.error('Chaque appareil doit avoir un nom.');
        return;
      }
      if (!instructions) {
        setActiveTab('appliances');
        toast.error(`Ajoutez les instructions de « ${name} ».`);
        return;
      }
      appliancesPayload.push({
        id: a.key,
        name,
        emoji: a.emoji.trim() || undefined,
        instructions,
        videoUrl: a.videoUrl.trim() || undefined,
        imageUrl: a.imageUrl.trim() || undefined,
      });
    }

    // 3. Bonnes adresses
    const spotsPayload: Record<string, unknown>[] = [];
    for (const s of draft.spots) {
      const name = s.name.trim();
      if (!name && !s.lat.trim() && !s.lng.trim() && !s.address.trim() && !s.hostNote.trim()) continue;
      if (!name) {
        setActiveTab('spots');
        toast.error('Chaque adresse doit avoir un nom.');
        return;
      }
      const lat = parseCoordInput(s.lat);
      const lng = parseCoordInput(s.lng);
      if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        setActiveTab('spots');
        toast.error(`Coordonnées invalides pour « ${name} » (ex : 48.8566 et 2.3522).`);
        return;
      }
      spotsPayload.push({
        id: s.key,
        name,
        category: s.category,
        lat,
        lng,
        address: s.address.trim() || undefined,
        hostNote: s.hostNote.trim() || undefined,
      });
    }

    // 4. SOS
    const issuesPayload: Record<string, unknown>[] = [];
    for (const it of draft.sos.issues) {
      const title = it.title.trim();
      const instructions = it.instructions.trim();
      if (!title && !instructions && !it.imageUrl.trim()) continue;
      if (!title || !instructions) {
        setActiveTab('sos');
        toast.error('Chaque panne doit avoir un titre ET des instructions.');
        return;
      }
      issuesPayload.push({
        id: it.key,
        title,
        instructions,
        imageUrl: it.imageUrl.trim() || undefined,
      });
    }
    const hospitalLat = parseCoordInput(draft.sos.hospitalLat);
    const hospitalLng = parseCoordInput(draft.sos.hospitalLng);
    if ((draft.sos.hospitalLat.trim() && hospitalLat === null) || (draft.sos.hospitalLng.trim() && hospitalLng === null)) {
      setActiveTab('sos');
      toast.error('Coordonnées de l’hôpital invalides (ex : 48.8566 et 2.3522).');
      return;
    }
    const sosTrim = {
      hostPhone: draft.sos.hostPhone.trim(),
      hostEmail: draft.sos.hostEmail.trim(),
      police: draft.sos.police.trim(),
      hospital: draft.sos.hospital.trim(),
      pharmacy: draft.sos.pharmacy.trim(),
      pharmacyPhone: draft.sos.pharmacyPhone.trim(),
      breakageShopUrl: draft.sos.breakageShopUrl.trim(),
    };
    if (sosTrim.hostEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sosTrim.hostEmail)) {
      setActiveTab('sos');
      toast.error('Email de contact invité invalide (ex : contact@ma-conciergerie.fr).');
      return;
    }
    if (sosTrim.breakageShopUrl && !/^https:\/\/\S+$/.test(sosTrim.breakageShopUrl)) {
      setActiveTab('sos');
      toast.error('Lien produit de remplacement invalide (doit commencer par https://).');
      return;
    }
    const emergencyInfo =
      sosTrim.hostPhone ||
      sosTrim.hostEmail ||
      sosTrim.police ||
      sosTrim.hospital ||
      sosTrim.pharmacy ||
      sosTrim.pharmacyPhone ||
      sosTrim.breakageShopUrl ||
      issuesPayload.length > 0
        ? {
            ...sosTrim,
            ...(hospitalLat !== null ? { hospitalLat } : {}),
            ...(hospitalLng !== null ? { hospitalLng } : {}),
            commonIssues: issuesPayload,
          }
        : null;

    // 5. Boutique « Shop the Stay » (v4.42) — produits envoyés SANS id ni
    // key : uniquement { name, emoji, description, price, url }, les champs
    // optionnels vides sont omis (l’API régénère les identifiants).
    const shopPayload: Record<string, unknown>[] = [];
    for (const it of draft.shop) {
      const name = it.name.trim();
      const emoji = it.emoji.trim();
      const description = it.description.trim();
      const priceText = it.price.trim();
      const url = it.url.trim();
      if (!name && !emoji && !description && !priceText && !url) continue; // ligne entièrement vide ignorée
      if (!name) {
        setActiveTab('shop');
        toast.error('Chaque produit doit avoir un nom.');
        return;
      }
      const price = parsePriceInput(it.price);
      if (price === null || price <= 0 || price > 1000) {
        setActiveTab('shop');
        toast.error(`Prix invalide pour « ${name} » (entre 0,01 € et 1 000 €).`);
        return;
      }
      shopPayload.push({
        name,
        ...(emoji ? { emoji } : {}),
        ...(description ? { description } : {}),
        price: Math.round(price * 100) / 100,
        ...(url ? { url } : {}),
      });
    }
    // null = retour au catalogue par défaut : liste vide OU strictement
    // identique au catalogue d’exemple (évite de figer la démo en « boutique
    // personnalisée » dès le premier enregistrement d’un autre onglet).
    const shopItems = shopPayload.length === 0 || shopPayloadMatchesDefaults(shopPayload) ? null : shopPayload;

    // 6. Horaires des messages vocaux (v4.42) — valeurs issues des <select>.
    const eveHour = Number(draft.voice.eveHour);
    const dayHour = Number(draft.voice.dayHour);
    const voiceTriggers = {
      eveHour: Number.isInteger(eveHour) && eveHour >= 0 && eveHour <= 23 ? eveHour : DEFAULT_VOICE_TRIGGERS.eveHour,
      dayHour: Number.isInteger(dayHour) && dayHour >= 0 && dayHour <= 23 ? dayHour : DEFAULT_VOICE_TRIGGERS.dayHour,
    };

    setSaving(true);
    try {
      const res = await fetch(`/api/airbnb/concierge?propertyId=${encodeURIComponent(propertyId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessCodes,
          appliances: appliancesPayload,
          localSpots: spotsPayload,
          emergencyInfo,
          shopItems,
          voiceTriggers,
        }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        toast.error(json?.error || 'Enregistrement impossible.');
        return;
      }
      setDirty(false);
      toast.success('🗝️ Conciergerie enregistrée — visible dans l’app de vos invités !');
    } catch {
      toast.error('Connexion impossible. Réessayez.');
    } finally {
      setSaving(false);
    }
  };

  // ── Compteurs (badges des onglets) ──
  const codesCount = CODE_FIELDS.filter((f) => draft.codes[f.key].trim()).length;
  const appliancesCount = draft.appliances.filter((a) => a.name.trim() || a.instructions.trim()).length;
  const spotsCount = draft.spots.filter((s) => s.name.trim() || s.lat.trim() || s.lng.trim()).length;
  const sosCount = draft.sos.issues.length + [draft.sos.hostPhone, draft.sos.hostEmail, draft.sos.police, draft.sos.hospital, draft.sos.pharmacy].filter((v) => v.trim()).length;
  const shopCount = draft.shop.filter((s) => s.name.trim() || s.price.trim()).length;
  // v4.69 — horaires vocaux personnalisés (≠ valeurs par défaut).
  const voiceCount =
    (draft.voice.eveHour !== String(DEFAULT_VOICE_TRIGGERS.eveHour) ? 1 : 0) +
    (draft.voice.dayHour !== String(DEFAULT_VOICE_TRIGGERS.dayHour) ? 1 : 0);

  // v4.69 — libellé du mini-compteur affiché sur chaque carte d'onglet.
  const tabCountLabel = (value: string): string => {
    switch (value) {
      case 'codes':
        return `${codesCount}/${CODE_FIELDS.length}`;
      case 'appliances':
        return String(appliancesCount);
      case 'spots':
        return String(spotsCount);
      case 'sos':
        return String(sosCount);
      case 'shop':
        return String(shopCount);
      case 'voice':
        return `${voiceCount}/2`;
      default:
        return '';
    }
  };

  // v4.42 — options d’horaires vocaux : bornes larges, et la valeur chargée
  // hors bornes est réinjectée dans la liste pour rester sélectionnable.
  const eveHourValue = Number(draft.voice.eveHour);
  const dayHourValue = Number(draft.voice.dayHour);
  const eveOptions =
    Number.isInteger(eveHourValue) && !VOICE_EVE_HOURS.includes(eveHourValue)
      ? [...VOICE_EVE_HOURS, eveHourValue].sort((a, b) => a - b)
      : VOICE_EVE_HOURS;
  const dayOptions =
    Number.isInteger(dayHourValue) && !VOICE_DAY_HOURS.includes(dayHourValue)
      ? [...VOICE_DAY_HOURS, dayHourValue].sort((a, b) => a - b)
      : VOICE_DAY_HOURS;

  const previewHref = data?.property?.qrHubSlug ? `/app/hub/${data.property.qrHubSlug}/guest` : null;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-8">
      {/* ----- En-tête + switch propriété + aperçu ----- */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
      >
        <div className="min-w-0">
          <p className="lux-eyebrow">Hub invité — contenu de l’app</p>
          <h1 className="lux-display mt-1.5 text-2xl font-semibold text-white sm:text-3xl">Conciergerie digitale</h1>
          <p className="mt-1 text-sm text-[#8fa0c2]">
            Remplissez le coffre-fort, les appareils, vos bonnes adresses, le SOS, la boutique et les horaires vocaux — tout apparaît dans l’app de vos invités.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {data && data.properties.length > 0 && (
            <Select value={data.property?.id ?? ''} onValueChange={changeProperty}>
              <SelectTrigger
                className="h-9 w-full rounded-full border-white/12 bg-white/[0.04] text-sm text-white sm:w-56"
                aria-label="Choisir le bien"
              >
                <SelectValue placeholder="Choisir un bien" />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-[#0d1530] text-white">
                {data.properties.map((p) => (
                  <SelectItem key={p.id} value={p.id} className={LUX_SELECT_ITEM}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {data?.property && (
            <a
              href={`/airbnb/properties/${data.property.id}/guest-experience`}
              className={cn('inline-flex h-9 items-center gap-1.5 whitespace-nowrap px-4 text-xs', LUX_GHOST_BTN)}
              title="Vidéo de bienvenue, guide visuel, upselling et kit de survie"
            >
              Expérience
            </a>
          )}
          {previewHref && (
            <a
              href={previewHref}
              target="_blank"
              rel="noopener noreferrer"
              className={cn('inline-flex h-9 items-center gap-1.5 whitespace-nowrap px-4 text-xs', LUX_GHOST_BTN)}
              title="Ouvrir l’app de vos invités dans un nouvel onglet"
            >
              Aperçu
            </a>
          )}
        </div>
      </motion.div>

      {loading && !data && <LoadingSkeleton />}

      {!loading && error && (
        <div className="lux-empty flex flex-col items-center gap-3 rounded-2xl p-8 text-center" role="alert">
          <span className="lux-dot" style={{ backgroundColor: '#f07d6a' }} aria-hidden="true" />
          <p className="text-sm font-semibold text-white">{error}</p>
          <button type="button" onClick={() => void load(propertyId || undefined)} className="lux-btn mt-1">
            Réessayer
          </button>
        </div>
      )}

      {!loading && data && data.property && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {/* v4.69 — GRILLE D'ONGLETS VISUELS (remplace la TabsList Radix :
              point coloré + titre + mini-compteur d'éléments remplis).
              Les TabsContent restent inchangés en dessous. */}
          <div
            className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6"
            role="tablist"
            aria-label="Modules de la conciergerie digitale"
          >
            {CONCIERGE_TABS.map((t) => {
              const active = activeTab === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(t.value)}
                  className={cn(
                    'flex flex-col items-start gap-1 rounded-2xl border p-3.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5c8af0]/60',
                    active
                      ? 'border-[#5c8af0]/50 bg-[#5c8af0]/12 ring-1 ring-[#5c8af0]/30'
                      : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.05]',
                  )}
                >
                  <span className="flex w-full items-center justify-between gap-1">
                    <span className="lux-dot" style={{ backgroundColor: t.dot }} aria-hidden="true" />
                    <TabCounter label={tabCountLabel(t.value)} />
                  </span>
                  <span className={cn('text-sm font-semibold', active ? 'text-white' : 'text-[#d5def0]')}>
                    {t.label}
                  </span>
                  <span className="text-[10px] leading-tight text-[#8fa0c2]">{t.hint}</span>
                </button>
              );
            })}
          </div>

          {/* ═══════════ COFFRE-FORT ═══════════ */}
          <TabsContent value="codes" className="mt-4 space-y-4">
            <section className="lux-card p-5 sm:p-6" aria-label="Codes d’accès">
              <div className="min-w-0">
                <p className="lux-eyebrow">Coffre-fort du bien</p>
                <h2 className="lux-display mt-1 text-lg text-white">Codes d’accès</h2>
                <p className="mt-0.5 text-sm text-[#8fa0c2]">
                  L’invité les voit masqués (••••••) et les révèle d’un appui. Remplissez uniquement ce qui existe.
                </p>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {CODE_FIELDS.map((f) => (
                  <div
                    key={f.key}
                    className="flex flex-col gap-1.5 rounded-xl border border-[#e9c47c]/25 bg-[#e9c47c]/8 p-3"
                  >
                    <Label htmlFor={`code-${f.key}`} className="text-xs font-semibold uppercase tracking-[0.14em] text-[#e9c47c]/80">
                      {f.label}
                    </Label>
                    <Input
                      id={`code-${f.key}`}
                      value={draft.codes[f.key]}
                      onChange={(e) => setCode(f.key, e.target.value)}
                      maxLength={40}
                      placeholder={f.placeholder}
                      autoComplete="off"
                      className={LUX_CODE_FIELD}
                    />
                  </div>
                ))}
              </div>
            </section>

            <section className="lux-card p-5 sm:p-6" aria-label="Note pour l’invité">
              <h2 className="lux-display text-lg text-white">Note pour l’invité</h2>
              <Textarea
                value={draft.codes.note}
                onChange={(e) => setCode('note', e.target.value)}
                maxLength={280}
                rows={3}
                className={cn('mt-3', LUX_FIELD)}
                placeholder="ex : Le code bâtiment change chaque mois — l’actualité est dans votre email de veille d’arrivée."
                aria-label="Note pour l’invité"
              />
              <p className="mt-1.5 text-xs text-[#8fa0c2]/70">{draft.codes.note.length}/280</p>
            </section>

            <div className="flex items-start gap-3 rounded-2xl border border-[#e9c47c]/25 bg-[#e9c47c]/8 p-4 text-xs leading-relaxed text-[#f3d795]">
              <span className="lux-dot mt-1.5 shrink-0" style={{ backgroundColor: '#e9c47c' }} aria-hidden="true" />
              <p>
                <strong>Confidentialité :</strong> ces codes restent dans l’app de VOS invités (masqués par défaut,
                révélés uniquement par eux). Ne partagez jamais ces informations par email ou SMS.
              </p>
            </div>
          </TabsContent>

          {/* ═══════════ APPAREILS ═══════════ */}
          <TabsContent value="appliances" className="mt-4">
            <section className="lux-card p-5 sm:p-6" aria-label="Appareils">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="lux-eyebrow">Modes d’emploi du guide</p>
                  <h2 className="lux-display mt-1 text-lg text-white">Appareils &amp; équipements</h2>
                  <p className="mt-0.5 text-sm text-[#8fa0c2]">
                    Chaque appareil devient un accordéon dans le Guide : instructions + vidéo YouTube ou photo.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {/* v4.47 — pack universel partagé par toutes les maisons. */}
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn('h-9 shrink-0 rounded-full px-4 text-xs', LUX_GHOST_BTN)}
                    onClick={() => void importUniversalPack()}
                  >
                    Pack universel
                  </Button>
                  <Button variant="outline" size="sm" className={cn('h-9 shrink-0 rounded-full px-4 text-xs', LUX_GHOST_BTN)} onClick={addAppliance}>
                    + Ajouter
                  </Button>
                </div>
              </div>

              {draft.appliances.length === 0 ? (
                <EmptyList
                  text="Aucun appareil pour l’instant. Ajoutez la machine à café, la TV, le lave-linge…"
                  onAdd={addAppliance}
                />
              ) : (
                <div className="mt-4 space-y-4">
                  {draft.appliances.map((a, i) => (
                    <div key={a.key} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Input
                          value={a.emoji}
                          onChange={(e) => setAppliance(a.key, { emoji: e.target.value })}
                          maxLength={4}
                          className={cn('w-16 text-center text-lg', LUX_FIELD)}
                          placeholder="🛠️"
                          aria-label={`Emoji de l’appareil ${i + 1}`}
                        />
                        <Input
                          value={a.name}
                          onChange={(e) => setAppliance(a.key, { name: e.target.value })}
                          maxLength={80}
                          className={cn('flex-1', LUX_FIELD)}
                          placeholder="Nom de l’appareil (ex : Machine à café)"
                          aria-label={`Nom de l’appareil ${i + 1}`}
                        />
                        <DeleteRowButton onClick={() => removeAppliance(a.key)} label={`Supprimer l’appareil ${a.name || i + 1}`} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-semibold text-[#8fa0c2]">Instructions pour l’invité</Label>
                        <Textarea
                          value={a.instructions}
                          onChange={(e) => setAppliance(a.key, { instructions: e.target.value })}
                          maxLength={4000}
                          rows={5}
                          placeholder={'1. Soulevez le levier et insérez une capsule.\n2. Appuyez sur ☕.\n\n💡 Astuce : utilisez des emojis pour guider.'}
                          aria-label={`Instructions de l’appareil ${a.name || i + 1}`}
                          className={LUX_FIELD}
                        />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="flex flex-col gap-1.5">
                          <Label className="text-xs font-semibold text-[#8fa0c2]">Vidéo YouTube (optionnel)</Label>
                          <Input
                            value={a.videoUrl}
                            onChange={(e) => setAppliance(a.key, { videoUrl: e.target.value })}
                            placeholder="https://youtube.com/watch?v=…"
                            aria-label={`Vidéo YouTube de l’appareil ${a.name || i + 1}`}
                            className={LUX_FIELD}
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label className="text-xs font-semibold text-[#8fa0c2]">Photo / GIF (optionnel)</Label>
                          {a.imageUrl ? (
                            <div className="flex items-center gap-2">
                              <img
                                src={a.imageUrl}
                                alt={`Photo de l’appareil ${a.name || i + 1}`}
                                className="h-10 w-10 rounded-lg border border-white/10 object-cover"
                                loading="lazy"
                                decoding="async"
                              />
                              <Button variant="outline" size="sm" className={cn('h-9 rounded-full px-4 text-xs', LUX_GHOST_BTN)} onClick={() => setAppliance(a.key, { imageUrl: '' })}>
                                Retirer
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className={cn('h-9 justify-start rounded-full px-4 text-xs', LUX_GHOST_BTN)}
                              disabled={uploadingKey === `appliance:${a.key}`}
                              onClick={() => pickImage('appliance', a.key)}
                            >
                              {uploadingKey === `appliance:${a.key}` ? (
                                <span aria-hidden="true" className="lux-dot animate-pulse" style={{ backgroundColor: '#e9c47c' }} />
                              ) : (
                                <span aria-hidden="true">+</span>
                              )}
                              <span className="ml-1.5">Ajouter une photo</span>
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" className={cn('h-9 rounded-full px-4 text-xs', LUX_GHOST_BTN)} onClick={addAppliance}>
                    + Ajouter un appareil
                  </Button>
                </div>
              )}
            </section>
          </TabsContent>

          {/* ═══════════ BONNES ADRESSES ═══════════ */}
          <TabsContent value="spots" className="mt-4">
            <section className="lux-card p-5 sm:p-6" aria-label="Visiter la ville">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="lux-eyebrow">Carte secrète</p>
                  <h2 className="lux-display mt-1 text-lg text-white">Visiter la ville — vos coups de cœur</h2>
                  <p className="mt-0.5 text-sm text-[#8fa0c2]">
                    Vos meilleures adresses avec une note perso, la distance depuis le logement et un bouton « Y aller » (GPS natif) — affichées dans l’onglet « Visiter la ville » du hub.
                  </p>
                </div>
                <Button variant="outline" size="sm" className={cn('h-9 shrink-0 rounded-full px-4 text-xs', LUX_GHOST_BTN)} onClick={addSpot}>
                  + Ajouter
                </Button>
              </div>

              {draft.spots.length === 0 ? (
                <EmptyList
                  text="Aucune adresse pour l’instant. Ajoutez votre boulangerie préférée, le rooftop du coin…"
                  onAdd={addSpot}
                />
              ) : (
                <div className="mt-4 space-y-4">
                  {draft.spots.map((s, i) => (
                    <div key={s.key} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Input
                          value={s.name}
                          onChange={(e) => setSpot(s.key, { name: e.target.value })}
                          maxLength={80}
                          className={cn('flex-1', LUX_FIELD)}
                          placeholder="Nom du lieu (ex : Boulangerie Dupont)"
                          aria-label={`Nom de l’adresse ${i + 1}`}
                        />
                        <Select value={s.category} onValueChange={(v) => setSpot(s.key, { category: v as GuestSpotCategory })}>
                          <SelectTrigger
                            className="h-9 w-36 shrink-0 rounded-full border-white/12 bg-white/[0.04] text-sm text-white"
                            aria-label={`Catégorie de l’adresse ${i + 1}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="border-white/10 bg-[#0d1530] text-white">
                            {SPOT_CATEGORIES.map(([cat, meta]) => (
                              <SelectItem key={cat} value={cat} className={LUX_SELECT_ITEM}>
                                {meta.emoji} {meta.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <DeleteRowButton onClick={() => removeSpot(s.key)} label={`Supprimer l’adresse ${s.name || i + 1}`} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-semibold text-[#8fa0c2]">Adresse (optionnel)</Label>
                        <Input
                          value={s.address}
                          onChange={(e) => setSpot(s.key, { address: e.target.value })}
                          maxLength={160}
                          placeholder="ex : 8 rue Dupont"
                          aria-label={`Adresse de ${s.name || `l’adresse ${i + 1}`}`}
                          className={LUX_FIELD}
                        />
                      </div>
                      <div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="flex flex-col gap-1.5">
                            <Label htmlFor={`spot-lat-${s.key}`} className="text-xs font-semibold text-[#8fa0c2]">
                              Latitude
                            </Label>
                            <Input
                              id={`spot-lat-${s.key}`}
                              value={s.lat}
                              onChange={(e) => setSpot(s.key, { lat: e.target.value })}
                              inputMode="decimal"
                              placeholder="48.8661"
                              aria-label={`Latitude de ${s.name || `l’adresse ${i + 1}`}`}
                              className={LUX_FIELD}
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <Label htmlFor={`spot-lng-${s.key}`} className="text-xs font-semibold text-[#8fa0c2]">
                              Longitude
                            </Label>
                            <Input
                              id={`spot-lng-${s.key}`}
                              value={s.lng}
                              onChange={(e) => setSpot(s.key, { lng: e.target.value })}
                              inputMode="decimal"
                              placeholder="2.3280"
                              aria-label={`Longitude de ${s.name || `l’adresse ${i + 1}`}`}
                              className={LUX_FIELD}
                            />
                          </div>
                        </div>
                        <p className="mt-1.5 text-xs text-[#8fa0c2]/70">
                          Astuce : sur Google Maps, clic droit sur le lieu → « Copier les coordonnées », puis collez-les
                          ici (la virgule est acceptée).
                        </p>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-semibold text-[#8fa0c2]">Votre note secrète (optionnel)</Label>
                        <Textarea
                          value={s.hostNote}
                          onChange={(e) => setSpot(s.key, { hostNote: e.target.value })}
                          maxLength={280}
                          rows={2}
                          placeholder="ex : Le meilleur croissant de la rue — allez-y tôt !"
                          aria-label={`Note de l’hôte pour ${s.name || `l’adresse ${i + 1}`}`}
                          className={LUX_FIELD}
                        />
                      </div>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" className={cn('h-9 rounded-full px-4 text-xs', LUX_GHOST_BTN)} onClick={addSpot}>
                    + Ajouter une adresse
                  </Button>
                </div>
              )}
            </section>
          </TabsContent>

          {/* ═══════════ SOS ═══════════ */}
          <TabsContent value="sos" className="mt-4 space-y-4">
            <section className="lux-card p-5 sm:p-6" aria-label="Numéros utiles">
              <div className="min-w-0">
                <p className="lux-eyebrow">Urgences</p>
                <h2 className="lux-display mt-1 text-lg text-white">Numéros utiles</h2>
                <p className="mt-0.5 text-sm text-[#8fa0c2]">
                  Le 15 (SAMU), le 18 (Pompiers) et le 112 (Europe) sont déjà affichés automatiquement — inutile de les saisir.
                </p>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sos-host" className="text-xs font-semibold text-[#8fa0c2]">
                    Urgence logement (vous)
                  </Label>
                  <Input
                    id="sos-host"
                    type="tel"
                    value={draft.sos.hostPhone}
                    onChange={(e) => setSos({ hostPhone: e.target.value })}
                    maxLength={40}
                    placeholder="+33 6 12 34 56 78"
                    className={LUX_FIELD}
                  />
                </div>
                {/* AUDIT 4-c — email dédié affiché aux invités (jamais
                    l'email de connexion du compte). */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sos-host-email" className="text-xs font-semibold text-[#8fa0c2]">
                    Email de contact invité
                  </Label>
                  <Input
                    id="sos-host-email"
                    type="email"
                    value={draft.sos.hostEmail}
                    onChange={(e) => setSos({ hostEmail: e.target.value })}
                    maxLength={160}
                    placeholder="contact@ma-conciergerie.fr"
                    autoComplete="off"
                    className={LUX_FIELD}
                  />
                  <p className="text-xs text-[#8fa0c2]/70">
                    Affiché aux invités pour vous écrire — utilisez une adresse dédiée,
                    pas votre email de connexion.
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sos-police" className="text-xs font-semibold text-[#8fa0c2]">
                    Police locale
                  </Label>
                  <Input
                    id="sos-police"
                    value={draft.sos.police}
                    onChange={(e) => setSos({ police: e.target.value })}
                    maxLength={40}
                    placeholder="17"
                    className={LUX_FIELD}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sos-pharmacy" className="text-xs font-semibold text-[#8fa0c2]">
                    Pharmacie de garde (nom)
                  </Label>
                  <Input
                    id="sos-pharmacy"
                    value={draft.sos.pharmacy}
                    onChange={(e) => setSos({ pharmacy: e.target.value })}
                    maxLength={120}
                    placeholder="ex : Pharmacie du Coin"
                    className={LUX_FIELD}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sos-pharmacy-phone" className="text-xs font-semibold text-[#8fa0c2]">
                    Téléphone pharmacie
                  </Label>
                  <Input
                    id="sos-pharmacy-phone"
                    type="tel"
                    value={draft.sos.pharmacyPhone}
                    onChange={(e) => setSos({ pharmacyPhone: e.target.value })}
                    maxLength={40}
                    placeholder="+33 1 42 00 00 00"
                    className={LUX_FIELD}
                  />
                </div>
              </div>
            </section>

            {/* v4.41 — « Signalement de casse en 1 clic » : le lien produit
                est proposé à l'invité APRÈS son signalement (photo obligatoire)
                pour racheter exactement le même modèle en 1 clic. */}
            <section className="lux-card p-5 sm:p-6" aria-label="Produit de remplacement">
              <h2 className="lux-display text-lg text-white">Casse — produit de remplacement</h2>
              <p className="mt-0.5 text-sm text-[#8fa0c2]">
                Un invité casse un objet ? Il signale avec une photo, vous êtes prévenu, et ce lien
                (Amazon, Castorama, fournisseur local…) lui propose le même modèle en 1 clic.
              </p>
              <div className="mt-4 flex flex-col gap-1.5">
                <Label htmlFor="sos-breakage-url" className="text-xs font-semibold text-[#8fa0c2]">
                  Lien du produit de remplacement (optionnel)
                </Label>
                <Input
                  id="sos-breakage-url"
                  type="url"
                  value={draft.sos.breakageShopUrl}
                  onChange={(e) => setSos({ breakageShopUrl: e.target.value })}
                  maxLength={400}
                  placeholder="https://www.amazon.fr/dp/XXXXXXXXX"
                  className={LUX_FIELD}
                />
              </div>
            </section>

            <section className="lux-card p-5 sm:p-6" aria-label="Hôpital le plus proche">
              <h2 className="lux-display text-lg text-white">Hôpital le plus proche</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="sos-hospital" className="text-xs font-semibold text-[#8fa0c2]">
                    Nom de l’hôpital
                  </Label>
                  <Input
                    id="sos-hospital"
                    value={draft.sos.hospital}
                    onChange={(e) => setSos({ hospital: e.target.value })}
                    maxLength={120}
                    placeholder="ex : Hôtel-Dieu Paris"
                    className={LUX_FIELD}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sos-hospital-lat" className="text-xs font-semibold text-[#8fa0c2]">
                    Latitude (pour l’itinéraire)
                  </Label>
                  <Input
                    id="sos-hospital-lat"
                    value={draft.sos.hospitalLat}
                    onChange={(e) => setSos({ hospitalLat: e.target.value })}
                    inputMode="decimal"
                    placeholder="48.8545"
                    className={LUX_FIELD}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sos-hospital-lng" className="text-xs font-semibold text-[#8fa0c2]">
                    Longitude
                  </Label>
                  <Input
                    id="sos-hospital-lng"
                    value={draft.sos.hospitalLng}
                    onChange={(e) => setSos({ hospitalLng: e.target.value })}
                    inputMode="decimal"
                    placeholder="2.3465"
                    className={LUX_FIELD}
                  />
                </div>
              </div>
            </section>

            <section className="lux-card p-5 sm:p-6" aria-label="Pannes courantes">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <h2 className="lux-display text-lg text-white">Pannes courantes</h2>
                  <p className="mt-0.5 text-sm text-[#8fa0c2]">
                    Les invités débloquent seuls les petits soucis : disjoncteur, eau chaude, chasse d’eau…
                  </p>
                </div>
                <Button variant="outline" size="sm" className={cn('h-9 shrink-0 rounded-full px-4 text-xs', LUX_GHOST_BTN)} onClick={addIssue}>
                  + Ajouter
                </Button>
              </div>

              {draft.sos.issues.length === 0 ? (
                <EmptyList
                  text="Aucune panne documentée. Préparez les réponses aux 2-3 soucis les plus fréquents du logement."
                  onAdd={addIssue}
                />
              ) : (
                <div className="mt-4 space-y-4">
                  {draft.sos.issues.map((it, i) => (
                    <div key={it.key} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Input
                          value={it.title}
                          onChange={(e) => setIssue(it.key, { title: e.target.value })}
                          maxLength={80}
                          className={cn('flex-1', LUX_FIELD)}
                          placeholder="Titre (ex : Le disjoncteur a sauté)"
                          aria-label={`Titre de la panne ${i + 1}`}
                        />
                        <DeleteRowButton onClick={() => removeIssue(it.key)} label={`Supprimer la panne ${it.title || i + 1}`} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-semibold text-[#8fa0c2]">Que faire ?</Label>
                        <Textarea
                          value={it.instructions}
                          onChange={(e) => setIssue(it.key, { instructions: e.target.value })}
                          maxLength={4000}
                          rows={4}
                          placeholder={'1. Ouvrez le tableau électrique (entrée, à gauche).\n2. Repérez le levier baissé.\n3. Remontez-le d’un coup sec.'}
                          aria-label={`Instructions de la panne ${it.title || i + 1}`}
                          className={LUX_FIELD}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-semibold text-[#8fa0c2]">Photo (optionnel)</Label>
                        {it.imageUrl ? (
                          <div className="flex items-center gap-2">
                            <img
                              src={it.imageUrl}
                              alt={`Photo de la panne ${it.title || i + 1}`}
                              className="h-10 w-10 rounded-lg border border-white/10 object-cover"
                              loading="lazy"
                              decoding="async"
                            />
                            <Button variant="outline" size="sm" className={cn('h-9 rounded-full px-4 text-xs', LUX_GHOST_BTN)} onClick={() => setIssue(it.key, { imageUrl: '' })}>
                              Retirer
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className={cn('h-9 justify-start rounded-full px-4 text-xs', LUX_GHOST_BTN)}
                            disabled={uploadingKey === `issue:${it.key}`}
                            onClick={() => pickImage('issue', it.key)}
                          >
                            {uploadingKey === `issue:${it.key}` ? (
                              <span aria-hidden="true" className="lux-dot animate-pulse" style={{ backgroundColor: '#e9c47c' }} />
                            ) : (
                              <span aria-hidden="true">+</span>
                            )}
                            <span className="ml-1.5">Ajouter une photo</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" className={cn('h-9 rounded-full px-4 text-xs', LUX_GHOST_BTN)} onClick={addIssue}>
                    + Ajouter une panne
                  </Button>
                </div>
              )}
            </section>
          </TabsContent>

          {/* ═══════════ BOUTIQUE (v4.42 — Shop the Stay) ═══════════ */}
          <TabsContent value="shop" className="mt-4 space-y-4">
            <section className="lux-card p-5 sm:p-6" aria-label="Boutique Shop the Stay">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="lux-eyebrow">Shop the Stay</p>
                  <h2 className="lux-display mt-1 text-lg text-white">Shop the Stay — votre boutique</h2>
                  <p className="mt-0.5 text-sm text-[#8fa0c2]">
                    Vos invités commandent ces produits depuis l’onglet Shop the Stay du Hub. Vous recevez la commande
                    (commission plateforme {Math.round(SHOP_COMMISSION_RATE * 100)} %). Sans configuration, le catalogue
                    d’exemple s’affiche.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn('h-9 shrink-0 rounded-full px-4 text-xs', LUX_GHOST_BTN)}
                  disabled={draft.shop.length >= MAX_SHOP_ITEMS}
                  onClick={addShopItem}
                >
                  + Ajouter un produit
                </Button>
              </div>

              {!hasCustomShop && (
                <div className="mt-3">
                  <span className="inline-flex items-center gap-2 rounded-full border border-[#e9c47c]/25 bg-[#e9c47c]/8 px-3 py-1 text-xs font-semibold text-[#e9c47c]">
                    <span className="lux-dot" style={{ backgroundColor: '#e9c47c' }} aria-hidden="true" />
                    Catalogue d’exemple — personnalisez-le ci-dessous
                  </span>
                </div>
              )}

              {draft.shop.length === 0 ? (
                <div className="lux-empty mt-4 flex flex-col items-center gap-2 rounded-2xl p-8 text-center">
                  <span className="lux-dot" style={{ backgroundColor: '#cdb6ff' }} aria-hidden="true" />
                  <p className="mx-auto mt-2 max-w-sm text-sm text-[#8fa0c2]">
                    Aucun produit pour l’instant. Restaurez le catalogue d’exemple ou ajoutez le vôtre ({MAX_SHOP_ITEMS} maximum).
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn('h-9 rounded-full px-4 text-xs', LUX_GHOST_BTN)}
                      onClick={restoreShopDefaults}
                    >
                      Restaurer le catalogue d’exemple
                    </Button>
                    <button type="button" onClick={addShopItem} className="lux-btn">
                      + Ajouter un produit
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  {draft.shop.map((it, i) => (
                    <div key={it.key} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Input
                          value={it.emoji}
                          onChange={(e) => setShopItem(it.key, { emoji: e.target.value })}
                          maxLength={4}
                          className={cn('w-16 text-center text-lg', LUX_FIELD)}
                          placeholder="🛍️"
                          aria-label={`Emoji du produit ${i + 1}`}
                        />
                        <Input
                          value={it.name}
                          onChange={(e) => setShopItem(it.key, { name: e.target.value })}
                          maxLength={60}
                          className={cn('flex-1', LUX_FIELD)}
                          placeholder="Nom du produit (ex : Café local — sachet 250 g)"
                          aria-label={`Nom du produit ${i + 1}`}
                        />
                        <DeleteRowButton onClick={() => removeShopItem(it.key)} label={`Supprimer le produit ${it.name || i + 1}`} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-semibold text-[#8fa0c2]">Pitch pour l’invité (optionnel)</Label>
                        <Textarea
                          value={it.description}
                          onChange={(e) => setShopItem(it.key, { description: e.target.value })}
                          maxLength={300}
                          rows={2}
                          placeholder="ex : Le café que vous dégustez dans l’appartement, torréfié par un artisan voisin."
                          aria-label={`Description du produit ${it.name || i + 1}`}
                          className={LUX_FIELD}
                        />
                        <p className="text-xs text-[#8fa0c2]/70">{it.description.length}/300</p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor={`shop-price-${it.key}`} className="text-xs font-semibold text-[#8fa0c2]">
                            Prix TTC (€)
                          </Label>
                          <Input
                            id={`shop-price-${it.key}`}
                            value={it.price}
                            onChange={(e) => setShopItem(it.key, { price: e.target.value })}
                            inputMode="decimal"
                            maxLength={9}
                            placeholder="12,90"
                            aria-label={`Prix du produit ${it.name || i + 1}`}
                            className={LUX_FIELD}
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor={`shop-url-${it.key}`} className="text-xs font-semibold text-[#8fa0c2]">
                            Lien marchand (optionnel)
                          </Label>
                          <Input
                            id={`shop-url-${it.key}`}
                            type="url"
                            value={it.url}
                            onChange={(e) => setShopItem(it.key, { url: e.target.value })}
                            maxLength={500}
                            placeholder="https://www.amazon.fr/…"
                            aria-label={`Lien marchand du produit ${it.name || i + 1}`}
                            className={LUX_FIELD}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn('h-9 rounded-full px-4 text-xs', LUX_GHOST_BTN)}
                      disabled={draft.shop.length >= MAX_SHOP_ITEMS}
                      onClick={addShopItem}
                    >
                      + Ajouter un produit
                    </Button>
                    <Button variant="outline" size="sm" className={cn('h-9 rounded-full px-4 text-xs', LUX_GHOST_BTN)} onClick={restoreShopDefaults}>
                      Restaurer le catalogue d’exemple
                    </Button>
                    {draft.shop.length >= MAX_SHOP_ITEMS && (
                      <span className="text-xs text-[#8fa0c2]/70">Maximum {MAX_SHOP_ITEMS} produits atteint.</span>
                    )}
                  </div>
                </div>
              )}
            </section>

            <div className="flex items-start gap-3 rounded-2xl border border-[#e9c47c]/25 bg-[#e9c47c]/8 p-4 text-xs leading-relaxed text-[#f3d795]">
              <span className="lux-dot mt-1.5 shrink-0" style={{ backgroundColor: '#e9c47c' }} aria-hidden="true" />
              <p>
                <strong>Astuce :</strong> vendez ce que les invités adorent chez vous (café, parure de lit, savon…).
                Le lien marchand (Amazon, boutique locale…) s’ouvre dans un nouvel onglet chez l’invité — sans lien, le
                produit reste visible avec son prix.
              </p>
            </div>
          </TabsContent>

          {/* ═══════════ HORAIRES VOCAUX (v4.42) ═══════════ */}
          <TabsContent value="voice" className="mt-4 space-y-4">
            <section className="lux-card p-5 sm:p-6" aria-label="Horaires des messages vocaux">
              <div className="min-w-0">
                <p className="lux-eyebrow">Messages vocaux automatiques</p>
                <h2 className="lux-display mt-1 text-lg text-white">Horaires des messages vocaux du Hub</h2>
                <p className="mt-0.5 text-sm text-[#8fa0c2]">
                  Bienvenue : joué uniquement à la PREMIÈRE ouverture « Mode Invité » de chaque invité (pas d’horaire).
                  Veille du départ et Jour du départ : choisissez à partir de quelle heure ils se déclenchent.
                </p>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-semibold text-[#8fa0c2]">
                    Veille du départ — se déclenche à partir de
                  </Label>
                  <Select value={draft.voice.eveHour} onValueChange={(v) => setVoice({ eveHour: v })}>
                    <SelectTrigger
                      className="h-9 w-full rounded-full border-white/12 bg-white/[0.04] text-sm text-white"
                      aria-label="Heure de déclenchement la veille du départ"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-white/10 bg-[#0d1530] text-white">
                      {eveOptions.map((h) => (
                        <SelectItem key={h} value={String(h)} className={LUX_SELECT_ITEM}>
                          {h} h
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-[#8fa0c2]/70">Défaut : 20 h — joué une seule fois, la veille du départ.</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-semibold text-[#8fa0c2]">
                    Jour du départ — se déclenche à partir de
                  </Label>
                  <Select value={draft.voice.dayHour} onValueChange={(v) => setVoice({ dayHour: v })}>
                    <SelectTrigger
                      className="h-9 w-full rounded-full border-white/12 bg-white/[0.04] text-sm text-white"
                      aria-label="Heure de déclenchement le jour du départ"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-white/10 bg-[#0d1530] text-white">
                      {dayOptions.map((h) => (
                        <SelectItem key={h} value={String(h)} className={LUX_SELECT_ITEM}>
                          {h} h
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-[#8fa0c2]/70">Défaut : 9 h — joué une seule fois, le jour du départ.</p>
                </div>
              </div>
            </section>

            <div className="flex items-start gap-3 rounded-2xl border border-[#e9c47c]/25 bg-[#e9c47c]/8 p-4 text-xs leading-relaxed text-[#f3d795]">
              <span className="lux-dot mt-1.5 shrink-0" style={{ backgroundColor: '#e9c47c' }} aria-hidden="true" />
              <p>
                <strong>Bon à savoir :</strong> l’heure utilisée est celle du téléphone de l’invité. Chaque vocal n’est
                joué qu’une fois par séjour — la bienvenue reste liée à la première ouverture, sans horaire.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      )}

      {!loading && data && data.property && (
        <div className="lux-card sticky bottom-4 z-30 flex items-center justify-between gap-3 rounded-2xl p-3 backdrop-blur">
          <p
            className={cn('flex items-center gap-2 text-sm font-medium', dirty ? 'text-[#e9c47c]' : 'text-[#86e9cb]')}
            aria-live="polite"
          >
            <span
              className="lux-dot"
              style={{ backgroundColor: dirty ? '#e9c47c' : '#34d399' }}
              aria-hidden="true"
            />
            {dirty ? 'Modifications non enregistrées' : '✓ Tout est à jour'}
          </p>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || loading || !propertyId}
            className="lux-btn rounded-full px-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5c8af0]/60 disabled:pointer-events-none disabled:opacity-60"
            aria-label="Enregistrer la conciergerie"
          >
            {saving && <span aria-hidden="true" className="lux-dot animate-pulse" style={{ backgroundColor: 'rgba(255,255,255,0.9)' }} />}
            Enregistrer
          </button>
        </div>
      )}

      {!loading && data && !data.property && (
        <div className="lux-empty flex flex-col items-center gap-2 rounded-2xl p-10 text-center">
          <span className="lux-dot" style={{ backgroundColor: '#e9c47c' }} aria-hidden="true" />
          <h2 className="lux-display mt-2 text-xl text-white">Aucun bien</h2>
          <p className="mt-1 text-sm text-[#8fa0c2]">Ajoutez d’abord un bien pour remplir sa conciergerie digitale.</p>
        </div>
      )}
    </div>
  );
}

// =============================================================
// Helpers de rendu
// =============================================================

/** Catalogue d’exemple → brouillon éditable (clés de lignes = ids stables). */
function defaultShopDraft(): DraftShopItem[] {
  return DEFAULT_SHOP_ITEMS.map((it) => ({
    key: it.id,
    name: it.name,
    emoji: it.emoji,
    description: it.description ?? '',
    price: String(it.price),
    url: it.url ?? '',
  }));
}

/**
 * Le payload boutique est-il strictement identique au catalogue d’exemple ?
 * Alors on envoie `null` au PATCH (pas de « boutique personnalisée » figée
 * tant que l’hôte n’a rien modifié — le catalogue démo reste évolutif).
 */
function shopPayloadMatchesDefaults(items: Record<string, unknown>[]): boolean {
  if (items.length !== DEFAULT_SHOP_ITEMS.length) return false;
  return items.every((it, i) => {
    const def = DEFAULT_SHOP_ITEMS[i];
    return (
      it.name === def.name &&
      (it.emoji ?? '🛍️') === def.emoji &&
      (it.description ?? '') === (def.description ?? '') &&
      it.price === def.price &&
      (it.url ?? '') === (def.url ?? '')
    );
  });
}

function hydrateDraft(json: ConciergeGetResponse): ConciergeDraft {
  const c = json.concierge;
  const codes = (c?.accessCodes ?? {}) as Record<string, unknown>;
  const sos = (c?.emergencyInfo ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  const num = (v: unknown): string => (typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
  // v4.42 — la boutique : l’API renvoie déjà le catalogue d’exemple quand
  // l’hôte n’a rien configuré (fallback inclus ci-dessous par prudence).
  const rawShop = c?.shopItems ?? [];
  const voice = c?.voiceTriggers;

  return {
    codes: {
      building: str(codes.building),
      letterbox: str(codes.letterbox),
      parking: str(codes.parking),
      alarm: str(codes.alarm),
      safe: str(codes.safe),
      note: str(codes.note),
    },
    appliances: (c?.appliances ?? []).map((a) => ({
      key: a.id || newRowKey(),
      // '🛠️' = défaut du parseur → champ laissé vide pour montrer le placeholder
      emoji: a.emoji && a.emoji !== '🛠️' ? a.emoji : '',
      name: a.name,
      instructions: a.instructions,
      videoUrl: a.videoUrl ?? '',
      imageUrl: a.imageUrl ?? '',
    })),
    spots: (c?.localSpots ?? []).map((s) => ({
      key: s.id || newRowKey(),
      name: s.name,
      category: s.category,
      address: s.address ?? '',
      lat: String(s.lat),
      lng: String(s.lng),
      hostNote: s.hostNote ?? '',
    })),
    sos: {
      hostPhone: str(sos.hostPhone),
      hostEmail: str(sos.hostEmail),
      police: str(sos.police),
      hospital: str(sos.hospital),
      hospitalLat: num(sos.hospitalLat),
      hospitalLng: num(sos.hospitalLng),
      pharmacy: str(sos.pharmacy),
      pharmacyPhone: str(sos.pharmacyPhone),
      breakageShopUrl: str(sos.breakageShopUrl),
      issues: Array.isArray(sos.commonIssues)
        ? (sos.commonIssues as { id?: string; title?: string; instructions?: string; imageUrl?: string }[]).map((it) => ({
            key: it.id || newRowKey(),
            title: it.title ?? '',
            instructions: it.instructions ?? '',
            imageUrl: it.imageUrl ?? '',
          }))
        : [],
    },
    shop:
      rawShop.length > 0
        ? rawShop.map((it) => ({
            key: it.id || newRowKey(),
            // '🛍️' = défaut du parseur → champ laissé vide pour montrer le placeholder
            emoji: it.emoji && it.emoji !== '🛍️' ? it.emoji : '',
            name: it.name,
            description: it.description ?? '',
            price: String(it.price),
            url: it.url ?? '',
          }))
        : defaultShopDraft(),
    voice: {
      eveHour: String(voice?.eveHour ?? DEFAULT_VOICE_TRIGGERS.eveHour),
      dayHour: String(voice?.dayHour ?? DEFAULT_VOICE_TRIGGERS.dayHour),
    },
  };
}

/** v4.69 — mini-compteur des onglets visuels (« 3/5 », « 7 »…). */
function TabCounter({ label }: { label: string }) {
  const empty = label === '0' || label.startsWith('0/');
  return (
    <span
      className={cn(
        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full border px-1.5 text-[10px] font-semibold tabular-nums',
        empty
          ? 'border-white/12 bg-white/[0.04] text-[#8fa0c2]'
          : 'border-[#34d399]/30 bg-[#34d399]/12 text-[#86e9cb]',
      )}
    >
      {label}
    </span>
  );
}

function DeleteRowButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="shrink-0 rounded-full text-[#8fa0c2] hover:bg-[#f07d6a]/10 hover:text-[#f07d6a]"
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <span aria-hidden="true" className="text-base leading-none">
        ×
      </span>
    </Button>
  );
}

function EmptyList({ text, onAdd }: { text: string; onAdd: () => void }) {
  return (
    <div className="lux-empty mt-4 flex flex-col items-center gap-2 rounded-2xl p-8 text-center">
      <span className="lux-dot" style={{ backgroundColor: '#5c8af0' }} aria-hidden="true" />
      <p className="mx-auto mt-2 max-w-sm text-sm text-[#8fa0c2]">{text}</p>
      <button type="button" onClick={onAdd} className="lux-btn mt-2">
        + Ajouter
      </button>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Chargement de la conciergerie">
      <Skeleton className="h-10 w-full max-w-sm rounded-full bg-white/8" />
      <Skeleton className="h-12 w-full rounded-2xl bg-white/8" />
      <Skeleton className="h-56 w-full max-w-2xl rounded-2xl bg-white/8" />
      <Skeleton className="h-36 w-full max-w-2xl rounded-2xl bg-white/8" />
    </div>
  );
}
