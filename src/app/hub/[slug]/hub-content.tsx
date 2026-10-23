'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  BadgePercent,
  BookOpen,
  CalendarCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock4,
  Copy,
  Globe,
  Home,
  ImagePlus,
  LifeBuoy,
  Loader2,
  Mail,
  MessageCircle,
  Mic,
  Minus,
  Moon,
  Navigation,
  Package,
  PencilLine,
  Phone,
  Play,
  Plus,
  Search,
  ShieldCheck,
  Square,
  Star,
  Sun,
  Trash2,
  TriangleAlert,
  Volume2,
  Wrench,
  X,
} from 'lucide-react';
import { QRTNumericKeypad } from '@/components/qrtags';
// DESIGN PREMIUM « LUXE TECH » (phase 2) — fond animé + reveals +
// cartes d'accueil gradient + module Wi-Fi « carte de crédit ».
import { AnimatedMeshGradient } from '@/components/premium/animated-mesh-gradient';
import { Reveal } from '@/components/premium/reveal';
// REFONTE IMMERSIVE (Task 29) — page d'entrée du hub : fond photo
// villa + overlay, typographie Playfair, cartes glassmorphism.
import { HeroLanding } from '@/components/hub-premium/hero-landing';
import { WifiPremiumCard } from '@/components/hub-premium/wifi-credit-card';
// v4.51 « CENTRE DE CONCIERGERIE TABLETTE — LUXE TOTAL » — SmartHeader
// (prénom + horloge + météo fixés en haut des grands écrans), écran de
// veille « Mode Ambiance » (diaporama + horloge après 2 min d'inactivité),
// barre d'accès rapide flottante et Wake Lock (l'écran ne s'éteint pas).
import { SmartHeader } from '@/components/hub-premium/smart-header';
import { TabletScreensaver } from '@/components/hub-premium/tablet-screensaver';
import { TabletQuickActions } from '@/components/hub-premium/tablet-quick-actions';
import { useWakeLock } from '@/hooks/use-wake-lock';
// v4.52 « LIVRE D'OR VIVANT + MIDDLE-STAY CARE » — galerie de souvenirs
// (overlay masonry + formulaire), carte réassort/ménage des séjours
// longs et dialogs de modération hôte (PIN-guardés).
import { MemoriesGallery } from '@/components/hub-premium/memories-gallery';
import { MiddleStayCard } from '@/components/hub-premium/middle-stay-card';
// v4.80 « ÉTATS DES LIEUX DU HUB » — arrivée (pièces + photos + signature)
// et départ (minibar + pièces + signature) → PDF envoyé invité + hôte.
import {
  CheckInInspectionCard,
  CheckOutInspectionCard,
} from '@/components/hub-premium/inspection-cards';
import SmartNotification, { type SmartNotificationType } from '@/components/hub-premium/smart-notification';
import AudioPlayer from '@/components/hub-premium/audio-player';
import { useSmartNotifications } from '@/hooks/use-smart-notifications';
// v4.75 « LUXURY PIN PAD » — écran de verrouillage haut de gamme
// (photo du bien plein écran + verre dépoli + pavé animé) utilisé par
// l'écran de code invité ET la modale Mode Hôte / Ménage.
import { LuxuryPinPad } from '@/components/hub-premium/luxury-pin-pad';
// v4.109 « ANIMATION PRÉ-ARRIVÉE » — écran d'accueil animé affiché à la
// place du pavé tant que le hub n'est pas ouvert (checkIn − 2 h).
import { HubShowcase } from '@/components/hub-premium/hub-showcase';
import {
  MemoriesModerationDialog,
  MiddleStayHostDialog,
} from '@/components/hub-premium/host-livredor';
import { BrandLogo } from '@/components/ui/brand-logo';
import { EmojiIcon } from '@/components/ui/emoji-icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Toaster } from '@/components/ui/sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
// v4.32 — onglets « Contact / Messages » du dialog Contacter l'hôte.
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
// v4.32 — toggle ACTIVER/DÉSACTIVER des prestataires (mode hôte).
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { formatDistance, formatEur } from '@/lib/b2b';
// FIX-VOCAL : lecture des audios via /api/uploads/voice (public/ n'est pas
// servi en standalone) + enregistrement compatible Safari/iOS (audio/mp4).
// v4.32 — voicePlaybackSrc privilégie la copie dataURL EN BASE (audio
// durable : les fichiers disque disparaissaient à chaque redéploiement).
import { voiceAudioSrc, voicePlaybackSrc, pickRecorderMime, extForMime } from '@/lib/voice-audio';
// v4.43 « ONGLET MÉNAGE DÉDIÉ » — checklist générale partagée hôte/staff
// (la checklist personnalisée arrive via /cleaning/config).
import { DEFAULT_CLEANING_CHECKLIST } from '@/lib/housekeeping';
// v4.50 « VERROUILLAGE DU HUB PAR CODE » — session client (localStorage),
// compte à rebours, fetch avec token x-hub-token + verrouillage immédiat
// sur 403 SESSION_EXPIRED (double vérification client + serveur).
import {
  HubSessionExpiredError,
  clearHubSession,
  formatRemaining,
  getHubSession,
  hubFetch,
  remainingMs,
  setHubSession,
  type HubAccessSessionClient,
} from '@/lib/hub-access-client';
// BUG DASHBOARD→HUB — parité PWA : les modules remplis dans
// /airbnb/concierge (coffre-fort, SOS, bonnes adresses, guide des
// appareils) et l'Expérience Invité (guide visuel, vidéo bienvenue,
// late check-out, bouclier d'avis, kit de survie) partagent les
// mêmes parseurs tolérants.
import {
  accessCodeRows,
  geoDirectionsUrl,
  haversineKm,
  isLocalMediaUrl,
  isYouTubeUrl,
  SHOP_COMMISSION_RATE,
  spotCategoryMeta,
  type GuestAccessCodes,
  type GuestAppliance,
  type GuestEmergencyInfo,
  type GuestMinibarItem,
  type GuestPremiumFeatures,
  type GuestShopItem,
  type GuestSpot,
  type GuestSurvivalItem,
  type GuestVisualStep,
} from '@/lib/concierge';
// RÉPONSE VOCALE HÔTE — bouton d'enregistrement (mode hôte) avec
// pré-écoute avant envoi (POST /api/airbnb/voice-reply).
import { VoiceReplyButton } from '@/components/airbnb/host/voice-reply-button';
// REFONTE SERVICES PREMIUM (V4.14) — le hub QR hérite de l'expérience
// « conciergerie de luxe » de la PWA (header serif, recherche, chips,
// carrousel populaires, panier flottant, checkout créneau, confettis).
import { TabServices } from '@/components/guest-app/tab-services';
// v4.54 « ALERTES STOCK » — contrôle de stock par l'équipe de ménage.
import { INVENTORY_ITEMS, INVENTORY_STATUS_META } from '@/lib/inventory';
// « DEMANDES PARTICULIÈRES » — méta partagées invité/hôte (types de
// demande + statuts de traitement, même source que les routes API).
import {
  SPECIAL_REQUEST_ITEMS,
  specialRequestItemMeta,
  specialRequestStatusMeta,
} from '@/lib/special-requests';
import { ServiceCover } from '@/components/guest-app/service-visual';
import type { GuestServiceOffer } from '@/components/guest-app/types';
// v4.24 « HUB RÉEL » — photos curated des tuiles/modules de l'accueil
// invité (vérifiées visuellement, CDN OSS stable, CSP https: OK).
import { HUB_ARRIVAL_PHOTOS, HUB_VISUALS } from '@/lib/hub-visuals';
// v4.31 « PHOTOS DE MON HUB » + « POUR VOUS » — mapping des photos perso
// de l'hôte (clés allowlist, redimensionnement client, parse tolérant).
import {
  fileToHubPhotoDataUrl,
  HUB_PHOTO_SLOTS,
  MAX_HUB_PHOTO_CHARS,
  type HubPhotoKey,
  type HubPhotoMap,
} from '@/lib/hub-photos';
// v4.33 « TRADUCTION INSTANTANÉE IA » — i18n du Hub invité : détection
// de la langue du smartphone, dictionnaire statique 5 langues (FR source)
// + traduction IA dynamique (POST /api/public/translate, cache local).
import {
  HubLangContext,
  detectLang,
  getStoredLang,
  storeLang,
  translateAiSmart,
  translateBatchAi,
  translateText,
  useHubLang,
  HUB_LANGS,
  type HubLang,
} from '@/lib/hub-i18n';
// v4.77-c2 « ADMIN I18N » — hub HÔTE (Mode Hôte par PIN) en 5 langues,
// 100 % statique (pas d'appel IA). La langue est partagée avec le login
// et le dashboard hôte (localStorage 'admin-lang').
import { AdminLangProvider, useAdminLang } from '@/lib/admin-i18n';
// v4.37 « MESSAGES VOCAUX DU HUB » — annonces audio de l'hôte : détection
// de la langue de voix (fr/en/es/ar), marquages « joué une fois »
// (localStorage) et URL du flux audio public par type de message.
import {
  detectVoiceLang,
  hubVoiceAudioUrl,
  shouldPlayCheckoutDay,
  shouldPlayCheckoutEve,
  shouldPlayWelcome,
  markCheckoutDayPlayed,
  markCheckoutEvePlayed,
  markWelcomePlayed,
  markEveFirstAccess,
  isEveAnnounceDue,
  checkoutDayKey,
  HUB_VOICE_LANG_FLAG,
  type HubVoiceKind,
  type HubVoiceLang,
} from '@/lib/hub-voice';

// =============================================================
// ÉTAPE 5 — LE HUB QR CODE (expérience de scan, ultra-mobile-first)
//
// Écran d'accueil : 2 cartes principales
//   👤 MODE INVITÉ (libre) : Wi-Fi (copie MDP), Guidebook,
//      Commander un service, Signaler un problème / Contacter l'hôte
//   🔐 MODE HÔTE (PIN 4 chiffres via QRTNumericKeypad) :
//      grille de gestion rapide — Modifier le Wi-Fi, Réclamations
//      en attente, Gérer les prestataires.
//
// Design QRTags : fond dégradé subtil slate, cartes blanches
// border-slate-200 rounded-xl p-4 shadow-sm, emojis 24–32 px.
// PHASE 2 — refonte visuelle premium « LUXE TECH » : mesh gradient
// animé, glassmorphism avancé (.glass), chorégraphies framer-motion,
// carte Wi-Fi façon « carte de crédit » à mot de passe grattable.
// La LOGIQUE (auth PIN, appels API, états) reste STRICTEMENT inchangée.
// =============================================================

/** Easing expo partagé (même signature que <Reveal/>). */
const EASE_EXPO = [0.16, 1, 0.3, 1] as const;

interface GuestService {
  id: string;
  name: string;
  emoji: string;
  categoryLabel: string;
  description: string;
  priceLabel: string;
  /** REFONTE SERVICES PREMIUM (V4.14) — parité PWA : catalogue fin. */
  unitPrice: number | null;
  /** REFONTE SERVICES PREMIUM (V4.22) — démonstration sociale. */
  ratingAvg: number;
  totalReviews: number;
  /** v4.23 « hub réel » — photo de couverture (1re offre photographiée). */
  imageUrl?: string | null;
  offers: GuestServiceOffer[];
}

interface HubPayload {
  active: boolean;
  property: {
    id: string;
    name: string;
    propertyType: string;
    propertyTypeLabel: string;
    propertyTypeEmoji: string;
    address: string | null;
    /** v4.43 « RETOUR À LA MAISON » — coordonnées exactes du logement
     *  (stockées via l'autocomplétion d'adresse du dashboard). null =
     *  bouton flottant masqué. */
    latitude: number | null;
    longitude: number | null;
    hasPin: boolean;
    /** v4.31 — photos personnalisées par l'hôte ({ [cardKey]: dataURL }). */
    hubPhotos: HubPhotoMap;
  };
  ownerName: string | null;
  /** v4.31 « POUR VOUS » — moment du séjour dérivé côté serveur de la
   *  réservation en cours (aucune donnée personnelle : un simple enum).
   *  null = pas de réservation en cours → repli sur l'heure locale. */
  stayMoment: 'arrival' | 'midstay' | 'departure' | null;
  /** v4.50 « VERROUILLAGE DU HUB PAR CODE » — config publique du
   *  verrouillage (le code lui-même n'est JAMAIS exposé). null = hub
   *  ouvert (comportement historique). */
  hubLock?: {
    enabled: boolean;
    checkoutInstructions?: string;
    allowLateRequest?: boolean;
  } | null;
  /** v4.109 « ANIMATION PRÉ-ARRIVÉE » — check-in (ISO) du prochain
   *  séjour à venir (date seule, aucune donnée personnelle). Sert à
   *  afficher l'animation d'accueil au lieu du pavé tant que la
   *  fenêtre d'ouverture (checkIn − 2 h) n'est pas atteinte. */
  nextArrival?: string | null;
  /** v4.33 « COMPTE À REBOURS CHECK-OUT » — jour du départ (J) + date de
   *  fin du séjour en cours (neutre : l'heure de départ est publique).
   *  v4.46 « RÉINITIALISATION » — isStayOver : aucun séjour ne couvre
   *  aujourd'hui mais un séjour passé existe → le hub repasse en état
   *  NEUTRE (bandeaux réservation directe / départ définitif / compte à
   *  rebours et modules de départ masqués). */
  /** v4.49 — prénom de l'invité en cours (issu du calendrier/iCal Airbnb)
   *  pour la salutation « Bonjour Marie 👋 ». null = hub non personnalisé. */
  /** v4.50 — checkIn (début du séjour), endAt (fin EFFECTIVE — rallongée
   *  par un départ tardif validé) et lateCheckOutUntil (prolongation). */
  stay: {
    isCheckoutDay: boolean;
    checkOut: string | null;
    isStayOver?: boolean;
    guestName?: string | null;
    checkIn?: string | null;
    endAt?: string | null;
    lateCheckOutUntil?: string | null;
    /** v4.52 — nuits du séjour courant (≥ 7 = séjour long → Middle-Stay). */
    nights?: number | null;
    /** v4.53 « PRÊT POUR L'ARRIVÉE » — ménage validé avant l'arrivée
     *  (flag serveur ≤ 72 h avant le check-in) → bannière verte. */
    readyForArrival?: { sentAt: string; checkIn: string } | null;
  };
  /** v4.37 « MESSAGES VOCAUX DU HUB » — voix disponibles par type
   *  (langues + version). null = aucune voix configurée. L'audio
   *  lui-même est chargé paresseusement depuis /voice-messages/audio. */
  voiceMessages: {
    welcome: { langs: string[]; v: string };
    checkoutEve: { langs: string[]; v: string };
    checkoutDay: { langs: string[]; v: string };
    /** v4.42 — heures de déclenchement choisies par l'hôte (défauts 20 h / 9 h). */
    eveHour?: number;
    dayHour?: number;
    /** v4.68 « VOCALE DU GUIDEBOOK » — kind 'guidebook' (FR) configurable
     *  depuis le dashboard hôte, servi par la route voice-messages/audio.
     *  Optionnel : absent/null = aucune voix du guidebook. */
    guidebook?: { langs: string[]; v: string } | null;
  } | null;
  guest: {
    wifi: { networkName: string; password: string; securityType: string } | null;
    guidebookSlug: string | null;
    /** v4.47 — Guidebook UNIVERSEL : servi si le bien n'a pas son propre
     *  guidebook (QrCode 'home_manual') — contenu de référence partagé
     *  par toutes les maisons (éditable par le Superadmin). */
    universalGuidebook: { title: string; sections: string[] } | null;
    accessCodes: GuestAccessCodes | null;
    localSpots: GuestSpot[];
    visualGuide: GuestVisualStep[];
    emergency: GuestEmergencyInfo | null;
    // BUG DASHBOARD→HUB — parité PWA complète : guide des appareils,
    // modules premium (vidéo, late check-out, bouclier d'avis) et kit
    // de survie servis par /api/public/hub/[slug].
    appliances: GuestAppliance[];
    /** v4.47 — true = pack universel d'appareils affiché (hôte n'a rien saisi). */
    appliancesUniversal: boolean;
    premiumFeatures: GuestPremiumFeatures | null;
    /** v4.33 « SHOP THE STAY » — catalogue de la boutique (serveur). */
    shopItems: GuestShopItem[];
    /** v4.44 « MINIBAR NUMÉRIQUE » (Honesty Bar) — [] si désactivé. */
    minibarItems: GuestMinibarItem[];
    /** v4.50 « MINIBAR DE CONFIANCE » — état du minibar pour le séjour
     *  courant (inventaire validé, consommations, recharge). */
    minibarExtra?: {
      arrivalPhoto: string | null;
      checkedAt: string | null;
      consumed: { name: string; emoji: string; qty: number; lineTotal: number; free: boolean }[];
      totalOpenEur: number;
      totalPaidEur: number;
      restockPending: boolean;
    } | null;
    /** v4.52 « LIVRE D'OR VIVANT » — résumé public (carte du hub). */
    memoriesSummary?: {
      total: number;
      avg: number | null;
      hasPending: boolean;
    } | null;
    /** v4.68 « MESSAGES DE L'HÔTE » — souvenirs du livre d'or AYANT une
     *  réponse publique de l'hôte (approuvés/modérés côté serveur).
     *  Optionnel : absent du payload = bloc simplement masqué (aucune
     *  route dédiée — agrégation de données déjà publiques). */
    memoriesWithHostReply?: {
      id: string;
      guestName: string | null;
      hostReply: string;
      hostReplyAt?: string | null;
      createdAt?: string | null;
    }[] | null;
    survivalKitItems: GuestSurvivalItem[];
    services: GuestService[];
    contact: { name: string; phone: string | null; email: string | null };
  };
}

interface HostProvider {
  id: string;
  name: string;
  emoji: string;
  categoryLabel: string;
  distanceKm: number;
  audience: string;
  priceLabel: string;
  /** v4.32 — false = désactivé par l'hôte (invisible côté invités). */
  enabled: boolean;
}

interface HostWrittenComplaint {
  id: string;
  category: string;
  categoryLabel: string;
  description: string;
  photos: string[];
  isUrgent: boolean;
  guestName: string | null;
  /** v4.32 — notification déjà vue (badge rouge éteint). */
  isRead?: boolean;
  createdAt: string;
}

interface HostGuidebook {
  qrCodeId: string | null;
  title: string;
  sections: string[];
}

/** Commande ServiceOrder sérialisée côté API /orders (montant TOTAL,
 *  jamais le split commission/hôte). */
interface HostOrder {
  id: string;
  status: string;
  statusLabel: string;
  statusBadge: string;
  statusEmoji: string;
  totalEur: string;
  itemsSummary: string;
  providerName: string;
  providerEmoji: string;
  guestName: string;
  createdAt: string;
}

interface HostData {
  wifi: {
    qrCodeId: string;
    networkName: string;
    password: string;
    securityType: string;
  } | null;
  unreadMessages: {
    id: string;
    senderName: string;
    audioUrl: string;
    /** v4.32 — copie dataURL en base (lecture durable). */
    audioData?: string | null;
    durationSec: number;
    createdAt: string;
  }[];
  complaints: HostWrittenComplaint[];
  openComplaints: number;
  /** v4.32 — réclamations OPEN non lues (badge rouge uniquement). */
  unreadComplaints?: number;
  pendingRequests: number;
  guidebook: HostGuidebook;
  providers: HostProvider[];
}

// v4.41 — 'staff' : MODE MÉNAGE (la femme de ménage scanne la même
// plaque et entre via le bouton Staff avec le code 0000).
type HubView = 'loading' | 'error' | 'home' | 'guest' | 'host' | 'staff';

// =============================================================
// v4.50 « VERROUILLAGE DU HUB PAR CODE » — ÉCRAN DE VERROUILLAGE
//
// Premier accès : le voyageur scanne le QR code et tombe sur cette
// page de verrouillage. Il saisit son code d'activation (4 chiffres,
// unique par séjour — généré automatiquement quand l'hôte remplit sa
// réservation dans le calendrier). Code correct → session créée
// (token 48 hex en localStorage) → hub déverrouillé dans ce
// navigateur, avec le compte à rebours visible en haut de l'écran.
//
// v4.75 « LUXURY PIN PAD » — refonte luxe : la logique (POST access,
// session localStorage, erreurs serveur FR) est INCHANGÉE, l'UI est
// déléguée au composant LuxuryPinPad (photo du bien plein écran,
// verre dépoli, pavé animé Framer Motion).
// =============================================================
function HubLockScreen({
  slug,
  propertyName,
  contactPhone,
  guestFirstName,
  propertyImage,
  nextArrivalCheckIn,
  onUnlocked,
}: {
  slug: string;
  propertyName: string;
  contactPhone: string | null;
  guestFirstName?: string | null;
  /** v4.75 — photo principale du bien (hubPhotos.hero) pour le fond immersif. */
  propertyImage?: string | null;
  /** v4.109 — check-in ISO du prochain séjour : tant que la fenêtre
   *  d'ouverture (checkIn − 2 h) n'est pas atteinte, l'animation
   *  d'accueil remplace le pavé (bascule automatique au tick). */
  nextArrivalCheckIn?: string | null;
  onUnlocked: (session: HubAccessSessionClient) => void;
}) {
  // v4.109 — une fois la fenêtre ouverte, on reste sur le pavé (même si
  // le payload rafraîchit nextArrival) : l'ouverture est définitive.
  const [windowOpen, setWindowOpen] = useState(false);
  const handleWindowOpen = useCallback(() => setWindowOpen(true), []);
  const showTeaser = Boolean(nextArrivalCheckIn) && !windowOpen;

  const verify = useCallback(
    async (code: string): Promise<boolean | string> => {
      try {
        const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/access`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          token?: string;
          endAt?: string;
          guestName?: string | null;
        };
        if (!res.ok || !data.token) {
          return data.error || 'Code incorrect. Veuillez réessayer.';
        }
        setHubSession(slug, { token: data.token, endAt: data.endAt ?? null, guestName: data.guestName ?? null });
        onUnlocked({ token: data.token, endAt: data.endAt ?? null, guestName: data.guestName ?? null });
        return true;
      } catch {
        return 'Connexion impossible. Réessayez.';
      }
    },
    [slug, onUnlocked],
  );

  // v4.114 « VITRINE EFFET WAHOU » — avant l'ouverture (checkIn − 2 h),
  // la vitrine immersive remplace le pavé : fond Ken Burns, engagements,
  // compte à rebours + bouton d'accès anticipé (modale LuxuryPinPad).
  // Le code serait de toute façon refusé par l'API (même seuil serveur,
  // source unique lib/hub-access.ts). La bascule reste automatique.
  if (showTeaser && nextArrivalCheckIn) {
    return (
      <HubShowcase
        propertyName={propertyName}
        propertyImage={propertyImage}
        checkIn={nextArrivalCheckIn}
        contactPhone={contactPhone}
        onWindowOpen={handleWindowOpen}
        onVerify={verify}
      />
    );
  }

  return (
    <LuxuryPinPad
      variant="fullscreen"
      propertyImage={propertyImage}
      propertyName={propertyName}
      greeting={guestFirstName}
      contactPhone={contactPhone}
      onVerify={verify}
      footerNote="🔐 Chaque séjour a son code unique — communiqué par votre hôte. Le hub se verrouillera automatiquement à la fin de votre séjour."
    />
  );
}



export function HubPageContent({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  // v4.77-c2 « ADMIN I18N » — le provider i18n hôte enveloppe TOUTE la
  // page hub : la modale PIN + l'Espace Hôte + ses dialogs traduisent via
  // useAdminLang (5 langues, 100 % statique). La vue INVITÉE n'en dépend
  // pas (elle utilise son propre système useHubLang, inchangé).
  return (
    <AdminLangProvider>
      <HubPageInner params={params} />
    </AdminLangProvider>
  );
}

function HubPageInner({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  // v4.77-c2 — traduction de la modale d'accès hôte (clé = texte FR source).
  // Les ERREURS de vérification PIN restent en FR : elles sont traduites à
  // l'affichage par LuxuryPinPad (t(error) — repli FR si clé absente).
  const { t } = useAdminLang();

  const [view, setView] = useState<HubView>('loading');
  const [payload, setPayload] = useState<HubPayload | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [retryTick, setRetryTick] = useState(0);

  // ── v4.50 « VERROUILLAGE DU HUB PAR CODE » — session d'accès ──
  // Le token vit en localStorage ; le hub est verrouillé tant qu'aucune
  // session VALIDE n'existe. La validité est recalculée toutes les 30 s
  // (compte à rebours atteint zéro → verrouillage immédiat) et à chaque
  // 403 SESSION_EXPIRED renvoyé par une action serveur.
  const [session, setSession] = useState<HubAccessSessionClient | null>(() => getHubSession(slug));
  const [sessionTick, setSessionTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSessionTick((k) => k + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  const lockEnabled = payload?.hubLock?.enabled === true;
  // v5.7 — FIN DE SÉJOUR DE RÉFÉRENCE : la SESSION du voyageur D'ABORD
  // (elle porte la fin effective de SON séjour, renvoyée par l'API
  // d'accès au moment du déverrouillage), puis le séjour courant du
  // payload. Avant (payload d'abord) : sur un jour de turnover, le
  // payload pointait le séjour PARTANT déjà terminé (fin passée) →
  // lockRemaining ≤ 0 → le hub RE-VERROUILLAIT INSTANTANÉMENT après
  // un code pourtant valide (« le code ne marche pas »).
  const lockEndAt = session?.endAt ?? payload?.stay?.endAt ?? null;
  const lockRemaining = useMemo(
    () => (lockEnabled ? remainingMs(lockEndAt) : Number.POSITIVE_INFINITY),
    // sessionTick force le recalcul toutes les 30 s.
    [lockEnabled, lockEndAt, sessionTick],
  );
  const hubLocked = lockEnabled && (!session || lockRemaining <= 0);
  /** Verrouille immédiatement (expiration client OU 403 serveur). */
  const lockSession = useCallback(() => {
    clearHubSession(slug);
    setSession(null);
  }, [slug]);
  const unlockSession = useCallback(
    (s: HubAccessSessionClient) => {
      setSession(s);
      setView('home');
    },
    [],
  );

  // Mode Hôte
  // v4.75 « LUXURY PIN PAD » — pinError supprimé : le pad affiche
  // lui-même les erreurs (message animé + secousse) via son contrat
  // onVerify → boolean | string.
  const [pinModal, setPinModal] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);
  const [keypadKey, setKeypadKey] = useState(0); // recharge le pad au changement d'espace
  const [verifiedPin, setVerifiedPin] = useState('');
  const [hostData, setHostData] = useState<HostData | null>(null);
  // v4.45 — Espace actif de la modale d'accès : 'host' (code PIN du
  // bien) ou 'staff' (code équipe 0000). v4.43 a fusionné le Mode
  // Ménage dans le Mode Hôte ; v4.45 affiche les 2 espaces sous forme
  // de 2 GRANDES cartes distinctes (ambre / teal) dans la modale.
  const [pinTarget, setPinTarget] = useState<'host' | 'staff'>('host');

  // ----- THÈME DU HUB — bascule sombre / clair (demande client) -----
  // Le <html> peut porter la classe .dark (thème par défaut de l'app /
  // préférence système). Or les portails (overlay Services, dialogs
  // Radix, toasts) vivent au niveau <body> : ils héritent du thème de
  // <html>. Le hub gère donc SON propre thème : état local (clair par
  // défaut), persisté en localStorage('hub-theme') et appliqué sur
  // <html> via la classe .dark. Au démontage, la classe d'origine de
  // l'app est restituée (la PWA garde son thème sombre par défaut).
  const [hubTheme, setHubTheme] = useState<'light' | 'dark'>(() => {
    // État initial : préférence mémorisée du visiteur (clair par
    // défaut). Lu dès le premier rendu client — la vue invité n'étant
    // JAMAIS rendue côté serveur (elle apparaît après le fetch), il
    // ne peut pas y avoir de mismatch d'hydratation.
    if (typeof window === 'undefined') return 'light';
    try {
      const saved = window.localStorage.getItem('hub-theme');
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {
      // Stockage indisponible (navigation privée stricte) → défaut clair.
    }
    return 'light';
  });
  const originalThemeRef = useRef<'light' | 'dark'>('light');

  // Montage : mémorise le thème d'origine de l'app pour le restituer
  // au démontage (écriture de ref uniquement, pas de setState).
  useEffect(() => {
    const root = document.documentElement;
    originalThemeRef.current = root.classList.contains('dark') ? 'dark' : 'light';
  }, []);

  // Applique le thème du hub sur <html> (portails et toasts inclus).
  useEffect(() => {
    const root = document.documentElement;
    if (hubTheme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }, [hubTheme]);

  // Démontage : restitue le thème d'origine de l'app.
  useEffect(() => {
    return () => {
      const root = document.documentElement;
      if (originalThemeRef.current === 'dark') root.classList.add('dark');
      else root.classList.remove('dark');
    };
  }, []);

  /** Bascule sombre ↔ clair + persistance localStorage. */
  const toggleHubTheme = useCallback(() => {
    setHubTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark';
      try {
        window.localStorage.setItem('hub-theme', next);
      } catch {
        // Stockage indisponible → la bascule fonctionne quand même.
      }
      return next;
    });
  }, []);

  // ----- Chargement du hub (fonction async déclarée DANS l'effet) -----
  /** v4.68 — (re)charge le payload PUBLIC du hub SANS réinitialiser la
   *  vue (setPayload seul, jamais de retour à 'loading') : utilisé au
   *  montage ET après une action hôte qui modifie le contenu invité
   *  (ex. toggle prestataires → la liste invité doit refléter la
   *  désactivation dès le retour en vue invité). */
  const reloadPayload = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}`);
      const json = await res.json();
      if (res.ok) setPayload(json as HubPayload);
    } catch {
      // Silencieux : le payload courant reste affiché.
    }
  }, [slug]);

  // ── v4.83 « RAFFRAÎCHISSEMENT AUTOMATIQUE DU HUB (30 s) » ──────
  // Demande client : « mettre dans le hub un système de
  // raffraîchissement du hub tous les 30 secondes pour afficher les
  // nouveaux infos ». Toutes les 30 s, le payload PUBLIC est rechargé
  // en silence (aucun spinner, aucune perte de saisie en cours) :
  //   • nouveaux modules / photos / contenus modifiés par l'hôte ;
  //   • changements d'état du séjour (jour de départ, départ tardif
  //     validé → le compte à rebours se rallonge) ;
  //   • verrouillage activé/désactivé à chaud (écran code ↔ hub) ;
  //   • messages vocaux et infos du coffre-fort mises à jour.
  // Les données à haute fréquence (réponses hôte, commandes) ont
  // déjà leurs propres pollings — ici on garantit le rafraîchissement
  // GLOBAL. Suspendu quand l'onglet est en arrière-plan (batterie).
  useEffect(() => {
    if (!payload) return; // rien à rafraîchir avant le 1er chargement
    const t = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void reloadPayload();
    }, 30_000);
    return () => window.clearInterval(t);
  }, [payload, reloadPayload]);

  useEffect(() => {
    async function run() {
      try {
        const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}`);
        const json = await res.json();
        if (res.status === 410) {
          setErrorMsg(json.message || 'Cette plaque QR a été désactivée.');
          setView('error');
          return;
        }
        if (!res.ok) {
          setErrorMsg(json.message || 'Ce hub est introuvable.');
          setView('error');
          return;
        }
        setPayload(json as HubPayload);
        setView('home');
      } catch {
        setErrorMsg('Impossible de charger le hub. Vérifiez votre connexion.');
        setView('error');
      }
    }
    run();
  }, [slug, retryTick]);

  /** Bouton Réessayer : retour au chargement + relance de l'effet. */
  const retryLoad = useCallback(() => {
    setView('loading');
    setRetryTick((t) => t + 1);
  }, []);

  /** v4.31 « PHOTOS DE MON HUB » — fusionne les photos sauvegardées par
   *  l'hôte dans le payload local : le passage en vue invité (ou le
   *  retour à l'accueil) montre immédiatement les nouvelles photos,
   *  sans rechargement. */
  const handleHubPhotosSaved = useCallback((map: HubPhotoMap) => {
    setPayload((p) =>
      p ? { ...p, property: { ...p.property, hubPhotos: map } } : p,
    );
  }, []);

  // ----- Vérification PIN + chargement des données hôte -----
  // v4.75 « LUXURY PIN PAD » — le pad affiche lui-même les erreurs
  // (message animé + secousse) : la fonction retourne true | message.
  const verifyPin = useCallback(
    async (pin: string): Promise<boolean | string> => {
      setPinLoading(true);
      try {
        const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin }),
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          return json.error || 'Code incorrect. Veuillez réessayer.';
        }
        const hostRes = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/host`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin }),
        });
        if (!hostRes.ok) {
          return 'Impossible de charger les données hôte.';
        }
        setHostData((await hostRes.json()) as HostData);
        setVerifiedPin(pin);
        setPinModal(false);
        setView('host');
        return true;
      } catch {
        return 'Erreur réseau. Réessayez.';
      } finally {
        setPinLoading(false);
      }
    },
    [slug],
  );

  // ----- Copie presse-papier -----
  const copy = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copié !`, { description: text });
    } catch {
      toast.error('Copie impossible sur ce navigateur.');
    }
  }, []);

  // ── v4.109 « ANIMATION PRÉ-ARRIVÉE » — l'animation ne s'affiche que
  // s'il n'y a AUCUN séjour actif : sinon l'invité en cours, re-verrouillé
  // (session expirée en plein séjour), verrait l'animation du PROCHAIN
  // invité au lieu de ressaisir SON code. Séjour actif = stay.endAt futur.
  const activeStayEnd = payload?.stay?.endAt ? new Date(payload.stay.endAt).getTime() : 0;
  const teaserCheckIn =
    activeStayEnd > Date.now() ? null : (payload?.nextArrival ?? null);

  return (
    // `isolate` : crée un stacking context local pour que les fonds
    // premium fixés en -z-10 (mesh animé) restent AU-DESSUS du dégradé
    // de page mais SOUS tout le contenu.
    // v4.73 — mode sombre « LUXE » : le bleu-nuit ardoise (terne) est
    // remplacé par un charbon chaud (stone bruni) qui habille aussi
    // les écrans de verrouillage / chargement.
    <div className="min-h-screen flex flex-col isolate bg-gradient-to-br from-slate-100 to-slate-200 dark:from-[#0E0C09] dark:to-[#060504]">
      <Toaster position="top-center" richColors />

      {view === 'loading' && <LoadingScreen />}
      {view === 'error' && <ErrorScreen message={errorMsg} onRetry={retryLoad} />}

      {/* ── v4.50 — PORTE DE VERROUILLAGE : tant que le hub est protégé
          par code et qu'aucune session valide n'existe, TOUT le hub
          (accueil + espace invité) est remplacé par l'écran de saisie. ── */}
      {hubLocked && payload ? (
        <HubLockScreen
          slug={slug}
          propertyName={payload.property.name}
          propertyImage={payload.property.hubPhotos?.hero ?? null}
          contactPhone={payload.guest?.contact?.phone ?? null}
          guestFirstName={session?.guestName ?? payload.stay?.guestName ?? null}
          nextArrivalCheckIn={teaserCheckIn}
          onUnlocked={unlockSession}
        />
      ) : (
        <>
      {view === 'home' && payload && (
        <HomeView
          payload={payload}
          onGuestClick={() => setView('guest')}
          onHostClick={() => {
            setPinTarget('host');
            setPinModal(true);
          }}
        />
      )}

      {view === 'guest' && payload && (
        <GuestView
          payload={payload}
          slug={slug}
          onBack={() => setView('home')}
          copy={copy}
          theme={hubTheme}
          onToggleTheme={toggleHubTheme}
          session={session}
          sessionEndAt={lockEndAt}
          onSessionExpired={lockSession}
        />
      )}

      {view === 'host' && payload && (
        <HostView
          payload={payload}
          hostData={hostData}
          slug={slug}
          pin={verifiedPin}
          onBack={() => setView('home')}
          onHostRefresh={(d) => setHostData(d)}
          onPinChanged={(p) => setVerifiedPin(p)}
          onHubPhotosSaved={handleHubPhotosSaved}
          reloadPayload={reloadPayload}
        />
      )}

      {view === 'staff' && payload && (
        <StaffView
          payload={payload}
          slug={slug}
          onBack={() => setView('home')}
        />
      )}
        </>
      )}

      {/* ---- Modale d'accès — v4.45 : 2 GRANDES cartes (Hôte / Ménage) ----
          Refonte « distinction claire » : fini les 2 petits onglets gris.
          L'ESPACE HÔTE (ambre — code PIN du bien) et l'ESPACE MÉNAGE
          (teal — code staff) sont deux cartes larges, colorées et
          explicitement décrites. Codes revérifiés SERVEUR (verifyPin ;
          0000 revérifié à la validation du ménage). */}
      <Dialog open={pinModal} onOpenChange={(open) => !open && !pinLoading && setPinModal(false)}>
        {/* v4.75 « LUXURY PIN PAD » — la modale DEVIENT l'expérience
            immersive (photo du bien + verre dépoli). Titre/description
            sr-only pour l'a11y Radix ; le pad affiche l'en-tête luxe.
            Les 2 espaces (Hôte / Ménage) restent des cartes distinctes,
            restylées verre dépoli, passées en slot `children`. */}
        <DialogContent className="max-w-md overflow-hidden rounded-[28px] border-0 bg-transparent p-0 shadow-none [&>button]:hidden">
          <DialogTitle className="sr-only">{t('Accès protégé — saisie du code')}</DialogTitle>
          <DialogDescription className="sr-only">
            {t('Choisissez votre espace, puis saisissez votre code à 4 chiffres.')}
          </DialogDescription>
          <LuxuryPinPad
            key={`${pinTarget}-${keypadKey}`}
            variant="embedded"
            propertyImage={payload?.property.hubPhotos?.hero ?? null}
            propertyName={payload?.property.name ?? t('Votre logement')}
            title="Accès protégé"
            eyebrow="Mode hôte & ménage"
            subtitle={
              pinTarget === 'host'
                ? '🔑 Saisissez le code PIN de votre logement'
                : '🧹 Saisissez le code staff de votre équipe'
            }
            onVerify={async (code) => {
              if (pinTarget === 'staff') {
                // Code staff (spécification client). Le serveur
                // revérifie le code à la validation du ménage.
                if (code === '0000') {
                  setPinModal(false);
                  setView('staff');
                  return true;
                }
                return 'Code staff incorrect.';
              }
              return verifyPin(code);
            }}
            onCancel={() => setPinModal(false)}
          >
            {/* v4.45 — les 2 espaces côte à côte, restylés verre dépoli */}
            <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label={t("Choix de l'espace d'accès")}>
              {/* ESPACE HÔTE — ambre/or */}
              <button
                type="button"
                role="radio"
                aria-checked={pinTarget === 'host'}
                onClick={() => {
                  setPinTarget('host');
                  setKeypadKey((k) => k + 1);
                }}
                className={cn(
                  'flex flex-col items-center rounded-2xl border px-3 pb-3 pt-4 transition-all duration-300',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
                  pinTarget === 'host'
                    ? 'scale-[1.02] border-amber-400/70 bg-amber-500/15 shadow-lg shadow-amber-500/10'
                    : 'border-white/15 bg-white/5 opacity-70 hover:border-amber-300/40 hover:opacity-100',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-2xl text-3xl transition-all duration-300',
                    pinTarget === 'host' ? 'scale-105' : 'opacity-60 grayscale-[0.4]',
                  )}
                >
                  🔐
                </span>
                <span className="mt-2 block text-center text-sm font-extrabold text-white">
                  {t('Espace Hôte')}
                </span>
                <span className="mt-1 block flex-1 text-center text-[11px] leading-snug text-white/60">
                  {t('Wi-Fi, guidebook, photos, messages vocaux, réclamations & commandes')}
                </span>
                <span
                  className={cn(
                    'mt-2.5 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                    pinTarget === 'host'
                      ? 'border-amber-300/50 bg-amber-400/15 text-amber-200'
                      : 'border-white/15 bg-white/5 text-white/40',
                  )}
                >
                  {t('Code PIN du bien')}
                </span>
              </button>

              {/* ESPACE MÉNAGE — teal */}
              <button
                type="button"
                role="radio"
                aria-checked={pinTarget === 'staff'}
                onClick={() => {
                  setPinTarget('staff');
                  setKeypadKey((k) => k + 1);
                }}
                className={cn(
                  'flex flex-col items-center rounded-2xl border px-3 pb-3 pt-4 transition-all duration-300',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
                  pinTarget === 'staff'
                    ? 'scale-[1.02] border-teal-400/70 bg-teal-500/15 shadow-lg shadow-teal-500/10'
                    : 'border-white/15 bg-white/5 opacity-70 hover:border-teal-300/40 hover:opacity-100',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-2xl text-3xl transition-all duration-300',
                    pinTarget === 'staff' ? 'scale-105' : 'opacity-60 grayscale-[0.4]',
                  )}
                >
                  🧹
                </span>
                <span className="mt-2 block text-center text-sm font-extrabold text-white">
                  {t('Espace Ménage')}
                </span>
                <span className="mt-1 block flex-1 text-center text-[11px] leading-snug text-white/60">
                  {t("Checklist, consigne de l'hôte, photos propres & validation du ménage")}
                </span>
                <span
                  className={cn(
                    'mt-2.5 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                    pinTarget === 'staff'
                      ? 'border-teal-300/50 bg-teal-400/15 text-teal-200'
                      : 'border-white/15 bg-white/5 text-white/40',
                  )}
                >
                  {t('Code staff')}
                </span>
              </button>
            </div>
          </LuxuryPinPad>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =============================================================
// Écran de chargement
// =============================================================
function LoadingScreen() {
  return (
    <div className="flex-1 w-full max-w-lg mx-auto px-4 py-10 space-y-5" aria-busy="true" aria-label="Chargement du hub">
      {/* Fond clair chaud : cohérent avec l'entrée « Airbnb Pro clair »
          qui suit (fini le flash sombre avant le hero). */}
      <div aria-hidden="true" className="fixed inset-0 -z-10 bg-stone-50" />
      <div className="flex justify-center">
        <BrandLogo variant="dark" size="sm" />
      </div>
      <Skeleton className="h-32 w-full rounded-xl bg-stone-200/70" />
      <Skeleton className="h-24 w-full rounded-xl bg-stone-200/70" />
      <Skeleton className="h-24 w-full rounded-xl bg-stone-200/70" />
    </div>
  );
}

// =============================================================
// Écran d'erreur (QR introuvable / inactif / réseau)
// =============================================================
function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex-1 w-full max-w-lg mx-auto px-4 py-16 flex flex-col items-center justify-center text-center">
      <div className="bg-white border border-stone-200/80 rounded-2xl air-shadow p-8 w-full">
        <span className="text-5xl" aria-hidden="true">🔌</span>
        <h1 className="mt-4 text-xl font-bold text-slate-900">Hub indisponible</h1>
        <p className="mt-2 text-sm text-stone-600 leading-relaxed">{message}</p>
        <Button
          type="button"
          onClick={onRetry}
          className="air-gradient mt-6 h-11 min-h-11 px-6 text-white font-semibold hover:opacity-90"
        >
          Réessayer
        </Button>
        <p className="mt-6 text-xs text-slate-400">
          Propulsé par 🗝️ <span className="font-semibold text-slate-500">RoomScan</span>
        </p>
      </div>
    </div>
  );
}

// =============================================================
// ÉCRAN D'ACCUEIL — REFONTE IMMERSIVE « LUXE TECH » (Task 29)
// Le rendu complet (fond photo villa + overlay, typographie
// Playfair, cartes glassmorphism, chorégraphie framer-motion)
// vit dans <HeroLanding/> ; toute la logique (navigation,
// ouverture du PIN hôte) reste ici, inchangée.
// =============================================================
function HomeView({
  payload,
  onGuestClick,
  onHostClick,
}: {
  payload: HubPayload;
  onGuestClick: () => void;
  onHostClick: () => void;
  // v4.43 — l'accès Ménage est passé par l'onglet « Ménage » de la
  // modale Mode Hôte (plus de carte séparée à l'accueil).
}) {
  const { property, ownerName } = payload;
  return (
    <HeroLanding
      propertyName={property.name}
      propertyTypeEmoji={property.propertyTypeEmoji}
      propertyTypeLabel={property.propertyTypeLabel}
      ownerName={ownerName}
      // v4.79 « VILLA IMMERSIVE » — photo du bien en fond plein écran
      // (repli : villa luxueuse curated). Même source que le lock screen.
      propertyImage={property.hubPhotos?.hero ?? null}
      onGuestClick={onGuestClick}
      onHostClick={onHostClick}
    />
  );
}

// =============================================================
// v4.41 « MODE MÉNAGE » — VUE STAFF (équipe de nettoyage)
// La femme de ménage scanne la même plaque en acrylique, entre via le
// bouton « Mode Ménage » (code staff 0000, revérifié SERVEUR) et :
//   1. coche la checklist de nettoyage (10 points) ;
//   2. uploade les photos de l'appartement PROPRE (≤ 6) ;
//   3. valide : heure d'arrivée (auto à l'ouverture) + heure de départ
//      (= validation). L'hôte reçoit la notification « L'appartement
//      est prêt pour le prochain client » et retrouve le rapport (avec
//      photos) dans Messages côté dashboard.
// POST /api/public/hub/[slug]/cleaning — never-throw, toasts, offline
// friendly (erreurs actionnables).
// =============================================================

/** v4.43 — repli local (hors-ligne) : la checklist générale partagée
 *  hôte ↔ femme de ménage (la checklist personnalisée de l'hôte arrive
 *  via GET /cleaning/config). */
const FALLBACK_CHECKLIST: string[] = DEFAULT_CLEANING_CHECKLIST;

const MAX_CLEANING_PHOTOS = 6;
/** v4.43 — durée max du vocal staff accompagnant les preuves. */
const MAX_STAFF_VOICE_SEC = 90;

function StaffView({
  payload,
  slug,
  onBack,
}: {
  payload: HubPayload;
  slug: string;
  onBack: () => void;
}) {
  const { property } = payload;
  const [staffName, setStaffName] = useState('');
  // v4.43 — checklist choisie par l'hôte (personnalisée ou générale).
  const [checklistItems, setChecklistItems] = useState<string[]>(FALLBACK_CHECKLIST);
  // v4.43 — consigne vocale de l'hôte (audio URL publique).
  const [hostNoteUrl, setHostNoteUrl] = useState<string | null>(null);
  const [checks, setChecks] = useState<boolean[]>(() => FALLBACK_CHECKLIST.map(() => false));
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<{ time: string; message: string } | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  // Heure d'arrivée : figée au MONTAGE de la vue (= ouverture par le staff).
  const [startedAt] = useState<Date>(() => new Date());
  const hhmm = (d: Date) => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  // ── v4.50 « HORODATAGE & GÉOLOCALISATION DU MÉNAGE » ──
  // À l'OUVERTURE du mode ménage : position GPS du téléphone du staff
  // (silencieux — refus GPS = null, le ménage reste valable). À la
  // VALIDATION : nouvelle capture (départ). L'hôte voit le temps
  // d'intervention précis + la preuve de présence sur site.
  const [startGeo, setStartGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [endGeo, setEndGeo] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setStartGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => undefined,
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  }, []);

  // v4.43 — vocal de la femme de ménage accompagnant les preuves.
  const [voiceDataUrl, setVoiceDataUrl] = useState<string | null>(null);
  const [voiceSec, setVoiceSec] = useState(0);
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const voiceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const voiceSecRef = useRef(0);

  // ── v4.43 — configuration ménage de l'hôte (checklist + vocal) ──
  // Échec = repli silencieux sur la checklist générale (le staff peut
  // toujours travailler et valider son passage).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/cleaning/config`);
        if (!res.ok) return;
        const json = (await res.json()) as {
          checklist?: { items?: string[] };
          hostNote?: { audioUrl?: string } | null;
        };
        if (cancelled) return;
        const items =
          Array.isArray(json.checklist?.items) && json.checklist!.items!.length > 0
            ? (json.checklist!.items as string[])
            : FALLBACK_CHECKLIST;
        setChecklistItems(items);
        setChecks(items.map(() => false));
        if (json.hostNote?.audioUrl) setHostNoteUrl(json.hostNote.audioUrl);
      } catch {
        // Repli silencieux : checklist générale, pas de consigne vocale.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Stoppe micro + timer au démontage.
  useEffect(() => {
    return () => {
      voiceStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
    };
  }, []);

  const doneCount = checks.filter(Boolean).length;
  const allDone = doneCount === checklistItems.length;

  /** v4.43 — démarre l'enregistrement du vocal pour l'hôte (≤ 90 s). */
  const startVoice = async () => {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      toast.error('Enregistrement non disponible sur ce téléphone.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceStreamRef.current = stream;
      const mimeType = pickRecorderMime();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      voiceChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) voiceChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(voiceChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const sec = voiceSecRef.current;
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            setVoiceDataUrl(reader.result);
            setVoiceSec(sec);
          }
        };
        reader.readAsDataURL(blob);
        voiceStreamRef.current?.getTracks().forEach((t) => t.stop());
        voiceStreamRef.current = null;
        if (voiceTimerRef.current) {
          clearInterval(voiceTimerRef.current);
          voiceTimerRef.current = null;
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setVoiceSec(0);
      voiceSecRef.current = 0;
      voiceTimerRef.current = setInterval(() => {
        setVoiceSec((s) => {
          const next = s + 1;
          voiceSecRef.current = next;
          if (next >= MAX_STAFF_VOICE_SEC && recorderRef.current?.state === 'recording') {
            recorderRef.current.stop();
          }
          return next;
        });
      }, 1000);
    } catch {
      toast.error('Micro inaccessible. Autorisez le micro dans votre navigateur.');
    }
  };

  const stopVoice = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    setRecording(false);
  };

  const clearVoice = () => {
    setVoiceDataUrl(null);
    setVoiceSec(0);
    voiceSecRef.current = 0;
  };

  const addPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setPhotoBusy(true);
    try {
      const next: string[] = [...photos];
      for (const f of Array.from(files).slice(0, MAX_CLEANING_PHOTOS - next.length)) {
        const dataUrl = await fileToHubPhotoDataUrl(f, 1280);
        if (dataUrl && dataUrl.length <= MAX_HUB_PHOTO_CHARS) next.push(dataUrl);
      }
      setPhotos(next.slice(0, MAX_CLEANING_PHOTOS));
    } finally {
      setPhotoBusy(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const submit = async () => {
    if (sending) return;
    if (doneCount === 0) {
      toast.error('Cochez au moins un point de la checklist.');
      return;
    }
    setSending(true);
    // v4.50 — capture GPS de DÉPART (validation) : refus GPS = null.
    let endPosition: { lat: number; lng: number } | null = endGeo;
    if (!endPosition && 'geolocation' in navigator) {
      endPosition = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
        const timer = setTimeout(() => resolve(null), 8000);
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            clearTimeout(timer);
            resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          },
          () => {
            clearTimeout(timer);
            resolve(null);
          },
          { enableHighAccuracy: true, timeout: 7500, maximumAge: 60_000 },
        );
      });
      setEndGeo(endPosition);
    }
    try {
      const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/cleaning`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: '0000',
          staffName: staffName.trim() || null,
          checklist: checklistItems.map((label, i) => ({ label, done: checks[i] })),
          photos,
          startedAt: startedAt.toISOString(),
          // v4.43 — vocal accompagnant les preuves (optionnel).
          voice: voiceDataUrl,
          voiceDurationSec: voiceDataUrl ? voiceSec : 0,
          // v4.50 — géolocalisation arrivée/départ du staff.
          startLat: startGeo?.lat ?? null,
          startLng: startGeo?.lng ?? null,
          endLat: endPosition?.lat ?? null,
          endLng: endPosition?.lng ?? null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        timeLabel?: string;
      };
      if (!res.ok) throw new Error(data.error || 'http');
      const time =
        data.timeLabel ?? new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      setDone({ time, message: data.message || `Ménage validé à ${time} — l'hôte a été prévenu.` });
      toast.success(`L'hôte a été prévenu à ${time}.`);
    } catch (e) {
      const detail = e instanceof Error && !e.message.startsWith('http') ? e.message : null;
      toast.error(detail || 'Envoi impossible. Réessayez dans un instant.');
    } finally {
      setSending(false);
    }
  };

  // ── v4.54 « ALERTES STOCK » — contrôle du stock par l'équipe (2.2) ──
  // 4 postes × 3 états (OK / Stock bas / Épuisé). Tout signalement
  // non-OK déclenche une alerte automatique à l'hôte (cloche + email).
  const [stock, setStock] = useState<Record<string, 'ok' | 'low' | 'empty'>>(() =>
    Object.fromEntries(Object.keys(INVENTORY_ITEMS).map((k) => [k, 'ok'])) as Record<string, 'ok' | 'low' | 'empty'>,
  );
  const [stockSending, setStockSending] = useState(false);
  const [stockSent, setStockSent] = useState<string | null>(null);

  const sendStockCheck = async () => {
    if (stockSending) return;
    setStockSending(true);
    try {
      const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/staff/inventory-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: '0000',
          reportedBy: staffName.trim() || null,
          items: Object.entries(stock).map(([item, status]) => ({ item, status })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) throw new Error(data.error || 'http');
      setStockSent(data.message || 'Contrôle envoyé à l\u2019hôte. Merci !');
      toast.success(data.message || 'Contrôle du stock envoyé ✅');
    } catch (e) {
      const detail = e instanceof Error && !e.message.startsWith('http') ? e.message : null;
      toast.error(detail || 'Envoi impossible. Réessayez dans un instant.');
    } finally {
      setStockSending(false);
    }
  };

  // ── Écran de confirmation ──
  if (done) {
    return (
      <div className="flex-1 w-full max-w-md mx-auto px-4 py-10 flex flex-col items-center justify-center text-center">
        <div aria-hidden="true" className="fixed inset-0 -z-10 bg-gradient-to-b from-teal-50 via-white to-stone-100" />
        <span className="text-6xl" aria-hidden="true">🧹✨</span>
        <h1 className="display-title font-serif! mt-4 text-2xl font-bold text-slate-900">
          Appartement prêt pour le prochain client
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          ✅ {done.message}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Arrivée {hhmm(startedAt)} · fin {done.time} · {doneCount}/{checklistItems.length} points ·{' '}
          {photos.length} photo{photos.length > 1 ? 's' : ''}
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-8 h-11 w-full max-w-xs border-slate-300 text-slate-700"
          onClick={onBack}
        >
          Retour à l'accueil
        </Button>
      </div>
    );
  }

  // ── Formulaire staff ──
  return (
    <div className="flex-1 w-full max-w-md mx-auto px-4 pb-10">
      <div aria-hidden="true" className="fixed inset-0 -z-10 bg-gradient-to-b from-teal-50 via-white to-stone-100" />

      {/* En-tête */}
      <div className="pt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Retour à l'accueil"
          className="h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 active:scale-95"
        >
          ←
        </button>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal-600">🧹 Mode Ménage</p>
          <h1 className="display-title font-serif! truncate text-xl font-bold text-slate-900">{property.name}</h1>
        </div>
      </div>

      {/* Horaires */}
      <div className="mt-4 rounded-2xl border border-teal-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-slate-700">Arrivée</span>
          <span className="rounded-full bg-teal-50 px-3 py-1 font-mono text-sm font-bold text-teal-700">
            {hhmm(startedAt)}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="font-semibold text-slate-700">Départ</span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
            enregistré à la validation
          </span>
        </div>
        <Input
          value={staffName}
          onChange={(e) => setStaffName(e.target.value)}
          maxLength={60}
          placeholder="Votre prénom (optionnel)"
          className="mt-3 h-11"
          aria-label="Votre prénom (optionnel)"
        />
        {/* v4.50 — suivi géolocalisé : preuve de présence horodatée. */}
        <p
          className={cn(
            'mt-2 text-[11px] font-semibold',
            startGeo ? 'text-emerald-600' : 'text-slate-400',
          )}
        >
          {startGeo
            ? `📍 Position enregistrée (${startGeo.lat.toFixed(4)}, ${startGeo.lng.toFixed(4)}) — horodatage activé`
            : '📍 Position GPS en attente (elle sera enregistrée si autorisée)'}
        </p>
      </div>

      {/* v4.43 — consigne vocale de l'hôte (écouter avant de commencer) */}
      {hostNoteUrl && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <p className="text-sm font-bold text-amber-800">🎙️ Message de l&apos;hôte pour vous</p>
          <p className="mt-0.5 text-xs text-amber-700">
            Consigne laissée par l&apos;hôte — écoutez-la avant de commencer.
          </p>
          <audio controls preload="metadata" src={hostNoteUrl} className="mt-2 w-full" />
        </div>
      )}

      {/* Checklist */}
      <div className="mt-4 rounded-2xl border border-teal-200 bg-white p-4 shadow-sm">
        <p className="flex items-center justify-between text-sm font-bold text-slate-800">
          Checklist de nettoyage
          <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-bold', allDone ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600')}>
            {doneCount}/{checklistItems.length}
          </span>
        </p>
        <ul className="mt-2 divide-y divide-slate-100">
          {checklistItems.map((label, i) => (
            <li key={label}>
              <label className="flex min-h-[44px] cursor-pointer items-center gap-3 py-2">
                <Checkbox
                  checked={checks[i]}
                  onCheckedChange={(v) => setChecks((arr) => arr.map((c, j) => (j === i ? v === true : c)))}
                  aria-label={label}
                  className="h-5 w-5"
                />
                <span className={cn('text-sm', checks[i] ? 'text-slate-400 line-through' : 'text-slate-700')}>
                  {label}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>

      {/* Photos de l'appartement propre */}
      <div className="mt-4 rounded-2xl border border-teal-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-bold text-slate-800">
          Photos de l&apos;appartement propre{' '}
          <span className="font-normal text-slate-400">({photos.length}/{MAX_CLEANING_PHOTOS})</span>
        </p>
        {photos.length > 0 && (
          <div className="mt-2 grid grid-cols-3 gap-2">
            {photos.map((p, i) => (
              <div key={i} className="relative h-20 overflow-hidden rounded-lg border border-teal-200">
                <Image src={p} alt={`Photo ménage ${i + 1}`} fill unoptimized className="object-cover" />
                <button
                  type="button"
                  aria-label={`Retirer la photo ${i + 1}`}
                  onClick={() => setPhotos((arr) => arr.filter((_, j) => j !== i))}
                  className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900/80 text-xs font-bold text-white"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        {photos.length < MAX_CLEANING_PHOTOS && (
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            disabled={photoBusy}
            onChange={(e) => void addPhotos(e.target.files)}
            aria-label="Ajouter des photos de l'appartement propre"
            className="mt-2 block w-full cursor-pointer rounded-lg border border-teal-200 bg-white text-xs text-slate-600 file:mr-3 file:cursor-pointer file:border-0 file:bg-teal-600 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-teal-700"
          />
        )}
      </div>

      {/* v4.43 — vocal pour l'hôte (accompagne les preuves, optionnel) */}
      <div className="mt-4 rounded-2xl border border-teal-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-bold text-slate-800">🎙️ Laisser un vocal à l&apos;hôte</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Un souci, une remarque, une demande ? Enregistrez un message ({MAX_STAFF_VOICE_SEC} s max) —
          il accompagnera vos photos.
        </p>
        {recording ? (
          <div className="mt-2 flex items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-sm font-bold text-rose-600">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" aria-hidden="true" />
              {voiceSec} s / {MAX_STAFF_VOICE_SEC} s
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50"
              onClick={stopVoice}
            >
              <Square className="h-4 w-4" aria-hidden="true" />
              Arrêter
            </Button>
          </div>
        ) : voiceDataUrl ? (
          <div className="mt-2 space-y-2">
            <audio controls preload="metadata" src={voiceDataUrl} className="w-full" />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-xl border-slate-200 text-slate-500"
              onClick={clearVoice}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Refaire l&apos;enregistrement
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 h-10 rounded-xl border-teal-200 text-teal-700 hover:bg-teal-50"
            onClick={() => void startVoice()}
          >
            <Mic className="h-4 w-4" aria-hidden="true" />
            Enregistrer un message
          </Button>
        )}
      </div>

      {/* v4.54 « ALERTES STOCK » — contrôle en 3 clics (2.2) */}
      <div className="mt-4 rounded-2xl border border-teal-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-bold text-slate-800">📦 Contrôle du stock</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Signalez l&apos;état du stock — l&apos;hôte reçoit une alerte automatique pour tout manque.
        </p>
        {stockSent ? (
          <div className="mt-3 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm font-semibold text-emerald-700" role="status">
            ✅ {stockSent}
            <button
              type="button"
              className="ml-2 text-xs font-bold text-emerald-800 underline underline-offset-2 cursor-pointer"
              onClick={() => {
                setStockSent(null);
                setStock(Object.fromEntries(Object.keys(INVENTORY_ITEMS).map((k) => [k, 'ok'])) as Record<string, 'ok' | 'low' | 'empty'>);
              }}
            >
              Refaire un contrôle
            </button>
          </div>
        ) : (
          <>
            <ul className="mt-2.5 space-y-2">
              {Object.entries(INVENTORY_ITEMS).map(([item, meta]) => {
                const current = stock[item] ?? 'ok';
                return (
                  <li key={item} className="rounded-xl border border-slate-200 p-2.5">
                    <p className="text-sm font-semibold text-slate-700">
                      {meta.emoji} {meta.label}
                    </p>
                    <div className="mt-1.5 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={`État du stock : ${meta.label}`}>
                      {(['ok', 'low', 'empty'] as const).map((s) => {
                        const active = current === s;
                        const metaS = INVENTORY_STATUS_META[s];
                        return (
                          <button
                            key={s}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => setStock((prev) => ({ ...prev, [item]: s }))}
                            className={`min-h-[40px] rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
                              active ? metaS.className : 'border-slate-200 bg-white text-slate-400 hover:bg-slate-50'
                            }`}
                          >
                            {metaS.short}
                          </button>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 h-10 w-full rounded-xl border-teal-200 text-teal-700 hover:bg-teal-50"
              onClick={() => void sendStockCheck()}
              disabled={stockSending}
            >
              {stockSending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <span aria-hidden="true">📦</span>}
              {stockSending ? 'Envoi…' : 'Envoyer le contrôle du stock'}
            </Button>
          </>
        )}
      </div>

      {/* Validation */}
      <Button
        type="button"
        className="mt-5 h-auto min-h-12 w-full whitespace-normal bg-teal-600 py-3 text-center text-sm font-bold leading-snug text-white shadow-lg shadow-teal-600/25 hover:bg-teal-700"
        onClick={submit}
        disabled={sending || photoBusy}
      >
        {sending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <span aria-hidden="true">✅</span>
        )}
        {sending ? 'Envoi…' : 'Valider le ménage & prévenir l\u2019hôte'}
      </Button>
      <p className="mt-2 text-center text-[11px] text-slate-400">
        L&apos;hôte reçoit immédiatement la notification « appartement prêt ».
      </p>
    </div>
  );
}

// =============================================================
// MODE INVITÉ — « WALLET DE CARTES PREMIUM » (Task 30, itération 3)
// Retour client : « que tous les modules s'affichent comme le carré
// du module Wi-Fi ». La grille de petites tuiles disparaît : chaque
// module devient une CARTE PLEINE LARGEUR reprenant EXACTEMENT
// l'anatomie de la carte Wi-Fi (WifiPremiumCard) :
//   • carte blanche dégradé teinté (rounded-3xl, ombre douce)
//   • puce EMV colorée en haut à gauche + emoji filigrane géant
//   • eyebrow uppercase tracking-[0.25em] coloré par ton sémantique
//   • titre en font-serif (display-title) + aperçu inline (chips)
//   • ZÉRO animation framer-motion — transitions CSS discrètes.
//   • Thème CLAIR, 7 tons (émeraude, ambre, rose, violet, teal,
//     orange, rouge) — la couleur porte l'identité du module.
// itération 4 — bouton ☀️/🌙 dans le hero : bascule sombre/clair
// mémorisée par visiteur (localStorage 'hub-theme') ; la classe .dark
// de <html> pilote fond, cartes, dialogs et portails.
// Organisation : 2 flagship pleine largeur (Wi-Fi, Services) puis
// 3 sections « Votre logement » / « Pendant votre séjour » /
// « Besoin d'aide ? » — 1 colonne mobile, 2 colonnes sm+.
// Toute la LOGIQUE métier (états, API, portails, dialogs existants)
// reste STRICTEMENT identique.
// =============================================================

type TileTone = 'emerald' | 'amber' | 'rose' | 'violet' | 'teal' | 'orange' | 'red';

/** Palettes CLAIRES « carte bancaire » — un ton par module. La couleur
 * vit dans : la bordure teintée, le dégradé de fond, la puce EMV,
 * l'eyebrow et la tuile d'icône des dialogs — comme sur la carte Wi-Fi. */
const CARD_TONES: Record<
  TileTone,
  { border: string; wash: string; chip: string; eyebrow: string; iconTile: string; pastille: string }
> = {
  emerald: {
    border:
      'border-emerald-200/80 hover:border-emerald-300 dark:border-emerald-500/25 dark:hover:border-emerald-400/50',
    wash:
      'bg-gradient-to-br from-white via-white to-emerald-50/80 dark:from-[#181410] dark:via-[#14110C] dark:to-emerald-950/50',
    chip: 'border-emerald-700/40 bg-gradient-to-br from-emerald-200 via-emerald-400 to-emerald-600',
    eyebrow: 'text-emerald-500 dark:text-emerald-300',
    iconTile:
      'bg-gradient-to-br from-emerald-100 to-emerald-300 shadow-[0_10px_26px_-10px_rgba(16,185,129,0.6)]',
    pastille:
      'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20',
  },
  amber: {
    border:
      'border-amber-200/80 hover:border-amber-300 dark:border-amber-500/25 dark:hover:border-amber-400/50',
    wash:
      'bg-gradient-to-br from-white via-white to-amber-50/80 dark:from-[#181410] dark:via-[#14110C] dark:to-amber-950/50',
    chip: 'border-amber-700/40 bg-gradient-to-br from-amber-200 via-yellow-400 to-amber-600',
    eyebrow: 'text-amber-500 dark:text-amber-300',
    iconTile:
      'bg-gradient-to-br from-amber-100 to-amber-300 shadow-[0_10px_26px_-10px_rgba(245,158,11,0.6)]',
    pastille:
      'bg-amber-50 text-amber-600 ring-1 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20',
  },
  rose: {
    border:
      'border-rose-200/80 hover:border-rose-300 dark:border-rose-500/25 dark:hover:border-rose-400/50',
    wash:
      'bg-gradient-to-br from-white via-white to-rose-50/80 dark:from-[#181410] dark:via-[#14110C] dark:to-rose-950/50',
    chip: 'border-rose-700/40 bg-gradient-to-br from-rose-200 via-rose-400 to-rose-600',
    eyebrow: 'text-rose-500 dark:text-rose-300',
    iconTile:
      'bg-gradient-to-br from-rose-100 to-rose-300 shadow-[0_10px_26px_-10px_rgba(244,63,94,0.55)]',
    pastille:
      'bg-rose-50 text-rose-600 ring-1 ring-rose-100 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/20',
  },
  violet: {
    border:
      'border-violet-200/80 hover:border-violet-300 dark:border-violet-500/25 dark:hover:border-violet-400/50',
    wash:
      'bg-gradient-to-br from-white via-white to-violet-50/80 dark:from-[#181410] dark:via-[#14110C] dark:to-violet-950/50',
    chip: 'border-violet-700/40 bg-gradient-to-br from-violet-200 via-violet-400 to-violet-600',
    eyebrow: 'text-violet-500 dark:text-violet-300',
    iconTile:
      'bg-gradient-to-br from-violet-100 to-violet-300 shadow-[0_10px_26px_-10px_rgba(139,92,246,0.55)]',
    pastille:
      'bg-violet-50 text-violet-600 ring-1 ring-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/20',
  },
  teal: {
    border:
      'border-teal-200/80 hover:border-teal-300 dark:border-teal-500/25 dark:hover:border-teal-400/50',
    wash:
      'bg-gradient-to-br from-white via-white to-teal-50/80 dark:from-[#181410] dark:via-[#14110C] dark:to-teal-950/50',
    chip: 'border-teal-700/40 bg-gradient-to-br from-teal-200 via-teal-400 to-teal-600',
    eyebrow: 'text-teal-500 dark:text-teal-300',
    iconTile:
      'bg-gradient-to-br from-teal-100 to-teal-300 shadow-[0_10px_26px_-10px_rgba(20,184,166,0.6)]',
    pastille:
      'bg-teal-50 text-teal-600 ring-1 ring-teal-100 dark:bg-teal-500/10 dark:text-teal-300 dark:ring-teal-500/20',
  },
  orange: {
    border:
      'border-orange-200/80 hover:border-orange-300 dark:border-orange-500/25 dark:hover:border-orange-400/50',
    wash:
      'bg-gradient-to-br from-white via-white to-orange-50/80 dark:from-[#181410] dark:via-[#14110C] dark:to-orange-950/50',
    chip: 'border-orange-700/40 bg-gradient-to-br from-orange-200 via-orange-400 to-orange-600',
    eyebrow: 'text-orange-500 dark:text-orange-300',
    iconTile:
      'bg-gradient-to-br from-orange-100 to-orange-300 shadow-[0_10px_26px_-10px_rgba(249,115,22,0.6)]',
    pastille:
      'bg-orange-50 text-orange-600 ring-1 ring-orange-100 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-500/20',
  },
  red: {
    border:
      'border-red-200/80 hover:border-red-300 dark:border-red-500/25 dark:hover:border-red-400/50',
    wash:
      'bg-gradient-to-br from-white via-white to-red-50/80 dark:from-[#181410] dark:via-[#14110C] dark:to-red-950/50',
    chip: 'border-red-700/40 bg-gradient-to-br from-red-200 via-red-400 to-red-600',
    eyebrow: 'text-red-500 dark:text-red-300',
    iconTile:
      'bg-gradient-to-br from-red-100 to-red-300 shadow-[0_10px_26px_-10px_rgba(239,68,68,0.55)]',
    pastille:
      'bg-red-50 text-red-600 ring-1 ring-red-100 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/20',
  },
};

/** Carte module — v4.28 « PHOTO PLEINE CARTE » (Option A, retour client :
 * « toutes les cards comme le QR code, une GRANDE image ») :
 *   • la VRAIE photo remplit TOUTE la carte (object-cover, comme le héro) ;
 *   • voile dégradé noir + textes blancs posés en bas (eyebrow, titre serif,
 *     sous-titre, chips d'aperçu) — lisibilité garantie ;
 *   • puce EMV translucide en haut à gauche (identité « carte de crédit »
 *     conservée) + flèche blanche en haut à droite ;
 *   • onError ou photo absente → retour à l'anatomie « carte de crédit »
 *     historique (ton sémantique + filigrane emoji) — jamais de carte vide.
 * STATIQUE (demande client : zéro animation framer-motion) — uniquement
 * des transitions CSS discrètes (zoom photo au survol). */
function ModuleCard({
  emoji,
  tone,
  eyebrow,
  title,
  subtitle,
  onClick,
  disabled,
  imageUrl,
  children,
  urgentLabel,
}: {
  emoji: string;
  tone: TileTone;
  /** Petit libellé uppercase au-dessus du titre (ex. « Trousseau numérique »). */
  eyebrow: string;
  title: string;
  subtitle?: string;
  onClick?: () => void;
  disabled?: boolean;
  /** Vraie photo PLEINE CARTE (v4.28) — optionnelle, décorative (alt="") ;
   *  le fallback « carte de crédit » filigrane emoji reste le repli. */
  imageUrl?: string | null;
  children?: React.ReactNode;
  /** v4.32 « SIGNAUX DU SÉJOUR » — clignotement rouge d'urgence : pill
   *  rouge + anneau pulsé (CSS .hub-alert-blink). Ex. « Départ demain »
   *  (veille du départ) ou « Ce soir 20 h » (bouclier d'avis). */
  urgentLabel?: string;
}) {
  const t = CARD_TONES[tone];
  const interactive = !!onClick && !disabled;
  const [photoFailed, setPhotoFailed] = useState(false);
  const showPhoto = !!imageUrl && !photoFailed;

  // ── v4.33 « TRADUCTION INSTANTANÉE IA » — libellés traduits ──
  // Dictionnaire statique d'abord (0 requête), IA ensuite pour les
  // textes libres (sous-titres interpolés, contenus personnalisés hôte).
  // Le FR reste la source et le repli universel — jamais de carte vide.
  const { lang } = useHubLang();
  const [ai, setAi] = useState<Record<string, string>>({});
  useEffect(() => {
    if (lang === 'fr') return;
    const pending = [title, subtitle, eyebrow, urgentLabel].filter(
      (s): s is string => !!s && translateText(s, lang) === s && !ai[s],
    );
    if (pending.length === 0) return;
    let alive = true;
    void translateBatchAi(pending, lang).then((tr) => {
      if (alive && Object.keys(tr).length > 0) setAi((prev) => ({ ...prev, ...tr }));
    });
    return () => {
      alive = false;
    };
  }, [lang, title, subtitle, eyebrow, urgentLabel]);
  const T = (s: string) => {
    if (lang === 'fr') return s;
    const st = translateText(s, lang);
    return st !== s ? st : (ai[s] ?? s);
  };

  // ── FALLBACK (photo absente ou échouée) — carte de crédit historique ──
  if (!showPhoto) {
    return (
      // v4.51 « POLISH WAHOU » — apparition en cascade au scroll.
      <motion.button
        type="button"
        onClick={interactive ? onClick : undefined}
        disabled={!interactive}
        aria-label={`${T(title)}${subtitle ? ` — ${T(subtitle)}` : ''}`}
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '0px 0px -40px 0px' }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        whileHover={interactive ? { y: -4 } : undefined}
        className={cn(
          'group relative flex h-full min-h-52 w-full flex-col overflow-hidden rounded-2xl border p-5 text-left text-slate-900 dark:text-slate-100',
          'air-shadow transition-[border-color,box-shadow] duration-300',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#055492]/40',
          urgentLabel && 'hub-alert-blink border-red-400/70',
          t.border,
          // v5.0 — carte BLANCHE uniforme (le ton vit dans la pastille +
          // l'eyebrow), conformément au design « Airbnb Pro clair ».
          'bg-white dark:bg-slate-900',
          interactive
            ? 'cursor-pointer hover:shadow-[0_16px_40px_-16px_rgba(15,23,42,0.18)]'
            : 'cursor-default opacity-60 saturate-[0.4]',
        )}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-2 -top-6 select-none text-[96px] leading-none opacity-[0.07]"
        >
          {emoji}
        </span>

        {/* Rangée 1 : pastille d'icône douce (bg-{tone}-50) + flèche */}
        <span className="relative flex items-start justify-between">
          <span
            aria-hidden="true"
            className={cn(
              'relative mt-0.5 flex h-11 w-11 items-center justify-center rounded-xl text-xl',
              t.pastille,
            )}
          >
            {emoji}
          </span>
          {interactive && (
            <ArrowRight
              aria-hidden="true"
              className="h-5 w-5 shrink-0 text-stone-400 transition-transform duration-300 group-hover:translate-x-1"
            />
          )}
        </span>

        {/* Eyebrow + titre serif (langage carte Wi-Fi) */}
        <span className={cn('relative mt-3.5 text-[10px] font-bold uppercase tracking-[0.25em]', t.eyebrow)}>
          {T(eyebrow)}
        </span>
        <span className="display-title font-serif! relative mt-0.5 text-xl font-bold leading-tight text-slate-900 dark:text-white lg:text-2xl">
          {T(title)}
        </span>
        {subtitle && (
          <span className="relative mt-1 line-clamp-2 text-xs leading-snug text-stone-500 dark:text-slate-400">{T(subtitle)}</span>
        )}

        {/* Aperçu inline optionnel (chips de contenu) */}
        {children != null && <span className="relative mt-3.5 block">{children}</span>}
      </motion.button>
    );
  }

  // ── v4.28 « PHOTO PLEINE CARTE » + v4.51 « POLISH WAHOU » —
  // apparition en cascade (whileInView once) + soulèvement au survol,
  // overlay dégradé sophistiqué (from-black/90 via-black/40), titre
  // serif agrandi sur tablette (md:text-2xl), ombres 8/32 → 12/48,
  // pastille flèche glassmorphism animée (spec client exacte).
  return (
    <motion.button
      type="button"
      onClick={interactive ? onClick : undefined}
      disabled={!interactive}
      aria-label={`${T(title)}${subtitle ? ` — ${T(subtitle)}` : ''}`}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -40px 0px' }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      whileHover={interactive ? { y: -4 } : undefined}
      className={cn(
        'group relative flex h-52 w-full flex-col justify-between overflow-hidden rounded-3xl border border-white/20 text-left sm:h-60 lg:h-72 xl:h-80',
        'shadow-[0_8px_32px_rgba(0,0,0,0.3)] transition-[border-color,box-shadow] duration-300',
        'hover:shadow-[0_12px_48px_rgba(0,0,0,0.4)] hover:border-white/30',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80',
        urgentLabel && 'hub-alert-blink border-red-400/70',
        interactive
          ? 'cursor-pointer'
          : 'cursor-default opacity-60 saturate-[0.5]',
      )}
    >
      <img
        src={imageUrl ?? undefined}
        alt=""
        loading="lazy"
        decoding="async"
        className="hub-kenburns absolute inset-0 h-full w-full object-cover"
        onError={() => setPhotoFailed(true)}
      />
      {/* v5.0 — dégradé bas doux aligné sur le hero (photo visible,
          texte blanc parfaitement lisible). */}
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent"
      />

      {/* v4.32 — pill rouge d'urgence centrée en haut (clignotement). */}
      {urgentLabel && (
        <span className="absolute left-1/2 top-3 z-10 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-red-600 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white shadow-[0_8px_22px_-6px_rgba(239,68,68,0.75)]">
          {T(urgentLabel)}
        </span>
      )}

      {/* Rangée 1 : puce EMV translucide (identité carte) + flèche blanche */}
      <span className="relative flex items-start justify-between p-4">
        <span
          aria-hidden="true"
          className="relative mt-0.5 block h-8 w-11 rounded-md border border-white/40 bg-white/25 shadow-inner backdrop-blur-sm"
        >
          <span className="absolute inset-x-0 top-1/2 h-px bg-white/50" />
          <span className="absolute inset-y-0 left-1/2 w-px bg-white/50" />
        </span>
        {/* v4.51 — pastille flèche glassmorphism (top-right, glisse au
            survol — spec « flèche animée au hover »). */}
        {interactive && (
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/30 bg-white/20 backdrop-blur-md transition-all duration-300 group-hover:translate-x-1 group-hover:bg-white/30"
          >
            <ArrowRight className="h-4 w-4 text-white" />
          </span>
        )}
      </span>

      {/* Eyebrow + titre serif + sous-titre + chips — blancs sur la photo */}
      <span className="relative flex flex-col p-4 pt-0">
        <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/85 drop-shadow-sm">
          <span aria-hidden="true" className="mr-1.5">{emoji}</span>
          {T(eyebrow)}
        </span>
        <span className="display-title font-serif! mt-0.5 text-xl font-bold leading-tight tracking-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.55)] md:text-2xl lg:text-3xl">
          {T(title)}
        </span>
        {subtitle && (
          <span className="mt-1 line-clamp-2 text-xs leading-snug text-slate-300 drop-shadow-sm sm:text-sm">{T(subtitle)}</span>
        )}

        {/* Aperçu inline optionnel (chips de contenu, verre blanc) */}
        {children != null && <span className="mt-3 block">{children}</span>}
      </span>
    </motion.button>
  );
}

/** Chip d'aperçu inline dans une ModuleCard (non cliquable, purement
 * informative — le contenu réel reste dans les dialogs). */
function PreviewChip({ children }: { children: React.ReactNode }) {
  return (
    // v4.51 — badge glassmorphism (spec « tags/badges améliorés ») :
    // verre blanc translucide + bordure claire + hover légèrement plus
    // opaque. Toujours porté par une photo → lisibilité blanche OK.
    <span className="inline-flex max-w-full cursor-pointer items-center gap-1 truncate rounded-lg border border-white/30 bg-white/20 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-md transition-colors hover:bg-white/30">
      {children}
    </span>
  );
}

/** Séparateur de section (lignes dégradées + libellé tracking). */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    // v5.0 « TYPOGRAPHIE AIRBNB PRO » — sur-titre bleu logo #055492
    // (filet court) + titre serif slate-900. L'ancien filet dégradé
    // ambre est retiré ; le <h2> reste navigable au lecteur d'écran.
    <div className="mb-5 mt-12">
      {/* v5.0 — sur-titre bleu logo (filet court uppercase-tracking) +
          titre slate-900 : langage « Airbnb Pro », filet ambre retiré. */}
      <div
        aria-hidden="true"
        className="mb-2.5 flex items-center gap-2"
      >
        <span className="h-1 w-8 rounded-full bg-[#055492]" />
        <span className="h-1 w-1.5 rounded-full bg-[#055492]/40" />
      </div>
      <h2 className="font-serif text-2xl font-bold tracking-tight text-slate-900 dark:text-white md:text-3xl">
        {children}
      </h2>
    </div>
  );
}

// =============================================================
// v4.33 — LES 4 NOUVELLES FONCTIONNALITÉS CLIENT
//   🌐 LangSwitcher            (traduction instantanée IA)
//   🕦 CheckoutCountdownBanner (compte à rebours check-out automatisé)
//   🚨 SosAlertCard            (SOS Logement — urgence en 1 clic)
//   🛍️ ShopCard               (Shop the Stay — affiliation hôte)
// Tous les libellés passent par useHubLang() : dictionnaire statique
// (0 requête) puis traduction IA dynamique ; le FR reste le repli.
// =============================================================

/** 🌐 Sélecteur de langue (drapeaux) du Hub invité — auto-détecté du
 *  smartphone au 1er scan, choix mémorisé par hub. La liste s'ouvre
 *  INLINE dans le hero (pas de portal : le hero clippe les débords). */
function LangSwitcher({
  lang,
  onChange,
  className,
}: {
  lang: HubLang;
  onChange: (l: HubLang) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = HUB_LANGS.find((l) => l.code === lang) ?? HUB_LANGS[0];
  return (
    <span className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Choisir la langue"
        aria-expanded={open}
        title="Language / Langue"
        className="h-11 min-w-11 inline-flex items-center justify-center gap-1 rounded-xl border border-white/40 bg-white/85 px-2 text-sm font-semibold text-slate-800 shadow-sm backdrop-blur-md transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white active:scale-95"
      >
        <Globe className="h-4 w-4" aria-hidden="true" />
        <span aria-hidden="true">{current.flag}</span>
      </button>
      {open && (
        <span className="absolute right-0 top-[52px] z-20 flex items-center gap-1 rounded-2xl border border-white/40 bg-white/95 p-1.5 shadow-[0_14px_34px_-14px_rgba(15,23,42,0.5)] backdrop-blur-md">
          {HUB_LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => {
                onChange(l.code);
                setOpen(false);
              }}
              aria-label={l.label}
              title={l.label}
              aria-pressed={l.code === lang}
              className={cn(
                'inline-flex h-9 w-9 items-center justify-center rounded-xl text-lg transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30',
                l.code === lang && 'bg-slate-900/10 ring-1 ring-slate-900/20',
              )}
            >
              <span aria-hidden="true">{l.flag}</span>
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

/** 🕦 « COMPTE À REBOURS CHECK-OUT » — jour du départ uniquement :
 *  « Votre départ est prévu à 11 h. Besoin de plus de temps ? Prolongez
 *  jusqu'à {lateHour} h pour {price} » (meilleur moment pour vendre un late
 *  check-out). Compte à rebours live + CTA = demande de départ tardif
 *  (POST /late-checkout — le serveur vérifie le module). Le CTA disparaît
 *  après l'heure limite (message de remerciement). Zéro framer-motion. */
function CheckoutCountdownBanner({
  slug,
  enabled,
  price,
  lateHour,
  lateRequested,
  onLateRequested,
}: {
  slug: string;
  /** Late check-out activé par l'hôte (sinon le CTA est masqué). */
  enabled: boolean;
  price?: number;
  /** v4.44 — heure de fin choisie par l'hôte (défaut 14 h). */
  lateHour?: number;
  /** v4.79 — demande de départ tardif déjà envoyée (ce séjour) :
   *  le CTA disparaît, le compte à rebours reste utile. */
  lateRequested?: boolean;
  /** v4.79 — appelé après l'envoi réussi : persistance + retrait CTA. */
  onLateRequested?: () => void;
}) {
  const { t } = useHubLang();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const lateH = lateHour ?? 14;
  const d = new Date(now);
  const deadline = new Date(d);
  deadline.setHours(11, 0, 0, 0);
  const lateUntil = new Date(d);
  lateUntil.setHours(lateH, 0, 0, 0);
  const before = now < deadline.getTime();
  const during = !before && now < lateUntil.getTime();
  const over = !before && !during;

  const remaining = Math.max(0, deadline.getTime() - now);
  const hh = Math.floor(remaining / 3_600_000);
  const mm = Math.floor((remaining % 3_600_000) / 60_000);
  const ss = Math.floor((remaining % 60_000) / 1_000);
  const pad = (n: number) => String(n).padStart(2, '0');

  const request = async () => {
    setSending(true);
    try {
      const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/late-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) throw new Error(data.error || 'http');
      toast.success(data.message || 'Demande envoyée — votre hôte vous confirme rapidement.');
      setSent(true);
      // v4.79 — succès → CTA retiré (persistance côté parent).
      onLateRequested?.();
    } catch (e) {
      const detail = e instanceof Error && !e.message.startsWith('http') ? e.message : null;
      toast.error(detail || 'Demande impossible. Réessayez dans un instant.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      role="status"
      className="rounded-3xl bg-gradient-to-r from-rose-600 via-red-500 to-amber-500 p-[1.5px] shadow-[0_18px_44px_-20px_rgba(190,18,60,0.55)]"
    >
      <div className="rounded-[22px] bg-white/95 p-5 backdrop-blur-sm dark:bg-slate-900/95">
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-red-600 dark:text-red-400">
          <span aria-hidden="true" className="animate-pulse">
            ⏰
          </span>
          {t('Jour du départ')}
        </p>
        <p className="display-title font-serif! mt-1.5 text-xl font-bold text-slate-900 dark:text-white">
          {before
            ? t('Votre départ est prévu à 11 h')
            : during
              ? t('L’heure limite de départ est passée')
              : t('Merci d’avoir rendu les clés 💙')}
        </p>
        {before && (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {t('Il vous reste')}{' '}
            <span className="font-mono text-sm font-bold tabular-nums text-red-600 dark:text-red-400">
              {pad(hh)} h {pad(mm)} min {pad(ss)} s
            </span>
          </p>
        )}
        {enabled && !over && !sent && !lateRequested && (
          <Button
            type="button"
            size="sm"
            className="mt-3 h-auto min-h-11 w-full whitespace-normal bg-slate-900 py-2.5 text-center font-semibold leading-snug text-white hover:bg-slate-800"
            onClick={request}
            disabled={sending}
            aria-label={`Demander un départ tardif jusqu’à ${lateH} h`}
          >
            {sending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Clock4 className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {sending
              ? 'Envoi…'
              : `${t('Besoin de plus de temps ? Prolongez jusqu’à')} ${lateH} h${price != null ? ` — ${formatEur(price)}` : ''}`}
          </Button>
        )}
        {sent && (
          <p className="mt-3 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            ✅ {t('Demande envoyée — votre hôte vous confirme.')}
          </p>
        )}
      </div>
    </div>
  );
}

/** 🚨 « SOS LOGEMENT » — alerte urgence en 1 clic (fuite d'eau, panne de
 *  chauffage, clé bloquée, électricité). POST …/sos → réclamation urgente
 *  + notification IMMÉDIATE à l'hôte (heure + adresse). L'heure d'envoi
 *  est gardée en localStorage (chip « Hôte alerté à HH:MM »).
 *  v4.41 « SIGNALEMENT DE CASSE EN 1 CLIC » — 6ᵉ type « Casse / objet
 *  abîmé » : l'invité prend une photo (OBLIGATOIRE, ≤ 2) et valide.
 *  L'hôte est prévenu (cloche + Messages avec photos) et le lien
 *  « produit de remplacement » (Amazon / fournisseur local configuré
 *  par l'hôte) est proposé pour racheter exactement le même modèle. */
const SOS_PROBLEMS = [
  { id: 'water', emoji: '💧', label: 'Fuite d’eau' },
  { id: 'heating', emoji: '🔥', label: 'Panne de chauffage' },
  { id: 'key', emoji: '🔑', label: 'Clé bloquée ou perdue' },
  { id: 'power', emoji: '⚡', label: 'Panne d’électricité' },
  { id: 'breakage', emoji: '🫖', label: 'Casse / objet abîmé' },
  { id: 'other', emoji: '🆘', label: 'Autre urgence' },
] as const;

function SosAlertCard({
  slug,
  photoOverride,
  breakageShopUrl,
}: {
  slug: string;
  photoOverride?: string | null;
  /** v4.41 — lien « produit de remplacement » configuré par l'hôte
   *  (Amazon / fournisseur local), proposé après un signalement de casse. */
  breakageShopUrl?: string | null;
}) {
  const { t } = useHubLang();
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState<(typeof SOS_PROBLEMS)[number]['id'] | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  // v4.41 — photos de la casse (≤ 2, dataURL compact côté client).
  const [breakagePhotos, setBreakagePhotos] = useState<string[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const breakageInputRef = useRef<HTMLInputElement | null>(null);
  const isBreakage = problem === 'breakage';
  const [sentAt, setSentAt] = useState<string | null>(() => {
    try {
      return localStorage.getItem(`hub-sos-${slug}`);
    } catch {
      return null;
    }
  });

  const addBreakagePhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setPhotoBusy(true);
    try {
      const next: string[] = [...breakagePhotos];
      for (const f of Array.from(files).slice(0, 2 - next.length)) {
        const dataUrl = await fileToHubPhotoDataUrl(f, 1280);
        if (dataUrl && dataUrl.length <= MAX_HUB_PHOTO_CHARS) next.push(dataUrl);
      }
      setBreakagePhotos(next.slice(0, 2));
    } finally {
      setPhotoBusy(false);
      if (breakageInputRef.current) breakageInputRef.current.value = '';
    }
  };

  const send = async () => {
    if (!problem || sending) return;
    if (isBreakage && breakagePhotos.length === 0) {
      toast.error(t('Ajoutez une photo de l’objet cassé.'));
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/sos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problem,
          note: note.trim() || null,
          ...(isBreakage ? { photos: breakagePhotos } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        timeLabel?: string;
      };
      if (!res.ok) throw new Error(data.error || 'http');
      const time =
        data.timeLabel ??
        new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      setSentAt(time);
      try {
        localStorage.setItem(`hub-sos-${slug}`, time);
      } catch {
        /* stockage indisponible */
      }
      toast.success(data.message || `L’hôte a été alerté à ${time}.`);
      setNote('');
    } catch (e) {
      const detail = e instanceof Error && !e.message.startsWith('http') ? e.message : null;
      toast.error(detail || 'Alerte impossible. Réessayez dans un instant.');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <ModuleCard
        emoji="🚨"
        tone="red"
        eyebrow={t('Urgence en 1 clic')}
        title={t('SOS Logement')}
        subtitle={t('Fuite, panne, clé bloquée — alerte immédiate')}
        imageUrl={photoOverride ?? HUB_VISUALS.sosHome}
        onClick={() => setOpen(true)}
      >
        <span className="flex flex-wrap gap-1.5">
          {sentAt ? (
            <PreviewChip>
              ✅ {t('Hôte alerté à')} {sentAt}
            </PreviewChip>
          ) : (
            <>
              <PreviewChip>💧 {t('Fuite d’eau')}</PreviewChip>
              <PreviewChip>⚡ {t('Alerte immédiate')}</PreviewChip>
            </>
          )}
        </span>
      </ModuleCard>
      <TileDialog
        open={open}
        onOpenChange={setOpen}
        emoji="🚨"
        tone="red"
        title={t('SOS Logement')}
        subtitle={t('L’hôte reçoit l’heure et l’adresse de l’appartement')}
      >
        {sentAt && (
          <p className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
            ✅ {t('Hôte alerté à')} {sentAt} — {t('restez sur place si possible.')}{' '}
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={() => setSentAt(null)}
            >
              {t('Re-signaler')}
            </button>
          </p>
        )}
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
          {t('Quel est le problème ?')}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {SOS_PROBLEMS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setProblem(p.id)}
              aria-pressed={problem === p.id}
              className={cn(
                'flex min-h-[44px] items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60',
                problem === p.id
                  ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-white/10 dark:bg-white/5 dark:text-slate-200',
              )}
            >
              <span aria-hidden="true" className="text-base">
                {p.emoji}
              </span>
              {t(p.label)}
            </button>
          ))}
        </div>
        {/* v4.41 — casse : photo OBLIGATOIRE (≤ 2) pour que l'hôte puisse
            recommander exactement le même modèle en 1 clic. */}
        {isBreakage && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
              🫖 {t('Photo de l’objet cassé')}{' '}
              <span className="font-normal">
                ({t('obligatoire, pour commander le même modèle')})
              </span>
            </p>
            {breakagePhotos.length > 0 && (
              <div className="mt-2 flex gap-2">
                {breakagePhotos.map((p, i) => (
                  <div key={i} className="relative h-20 w-20 overflow-hidden rounded-lg border border-amber-300/60">
                    <Image src={p} alt={`Photo casse ${i + 1}`} fill unoptimized className="object-cover" />
                    <button
                      type="button"
                      aria-label={t('Retirer cette photo')}
                      onClick={() => setBreakagePhotos((arr) => arr.filter((_, j) => j !== i))}
                      className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900/80 text-xs font-bold text-white"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            {breakagePhotos.length < 2 && (
              <input
                ref={breakageInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                disabled={photoBusy}
                onChange={(e) => void addBreakagePhotos(e.target.files)}
                aria-label={t('Ajouter une photo de la casse')}
                className="mt-2 block w-full cursor-pointer rounded-lg border border-amber-300 bg-white text-xs text-slate-600 file:mr-3 file:cursor-pointer file:border-0 file:bg-amber-600 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-amber-700"
              />
            )}
          </div>
        )}
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
          placeholder={t('Précisez si besoin (optionnel)')}
          className="mt-3 h-11"
          aria-label={t('Précisez si besoin (optionnel)')}
        />
        <Button
          type="button"
          className="mt-3 h-auto min-h-11 w-full whitespace-normal bg-red-600 py-2.5 text-center font-semibold leading-snug text-white hover:bg-red-700"
          onClick={send}
          disabled={!problem || sending || photoBusy}
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <TriangleAlert className="h-4 w-4" aria-hidden="true" />
          )}
          {sending
            ? t('Envoi…')
            : isBreakage
              ? t('🫖 Signaler la casse')
              : t('🚨 Alerte immédiate')}
        </Button>
        {/* v4.41 — après une casse : lien « produit de remplacement » de
            l'hôte (Amazon / fournisseur local) = le même modèle en 1 clic. */}
        {isBreakage && sentAt && breakageShopUrl && (
          <a
            href={breakageShopUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex h-auto min-h-11 w-full items-center justify-center gap-2 whitespace-normal rounded-xl bg-[#055492] px-4 py-2.5 text-center text-sm font-semibold leading-snug text-white transition-colors hover:bg-[#04467a]"
          >
            🛒 {t('Commander le produit de remplacement')}
          </a>
        )}
        <p className="mt-2 text-center text-[11px] text-slate-400 dark:text-slate-500">
          {t('En urgence vitale, appelez d’abord les secours (112).')}
        </p>
      </TileDialog>
    </>
  );
}

/** 🛍️ « SHOP THE STAY » — les produits de la maison à acheter (café
 *  local, parure de lit, savon…) : chaque commande notifie l'hôte avec
 *  la commission d'affiliation (10 %). Le règlement et la livraison se
 *  règlent ensuite avec l'hôte. État « commandé » en localStorage. */
function ShopCard({
  slug,
  items,
  photoOverride,
}: {
  slug: string;
  items: GuestShopItem[];
  photoOverride?: string | null;
}) {
  const { lang } = useHubLang();
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [ai, setAi] = useState<Record<string, string>>({});
  const [ordered, setOrdered] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(`hub-shop-orders-${slug}`) ?? '{}') as Record<
        string,
        boolean
      >;
    } catch {
      return {};
    }
  });

  // Traduction IA des noms/descriptions produits (catalogue hôte libre).
  useEffect(() => {
    if (lang === 'fr' || !open) return;
    const pending = [
      ...new Set(
        items
          .flatMap((i) => [i.name, i.description ?? ''])
          .filter((s) => s && translateText(s, lang) === s && !ai[s]),
      ),
    ];
    if (pending.length === 0) return;
    let alive = true;
    void translateBatchAi(pending, lang).then((tr) => {
      if (alive && Object.keys(tr).length > 0) setAi((prev) => ({ ...prev, ...tr }));
    });
    return () => {
      alive = false;
    };
  }, [lang, items, open, ai]);
  const t = (s: string) => {
    if (lang === 'fr') return s;
    const st = translateText(s, lang);
    return st !== s ? st : (ai[s] ?? s);
  };

  const order = async (itemId: string) => {
    if (pendingId) return;
    setPendingId(itemId);
    try {
      const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/shop-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, qty: 1 }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) throw new Error(data.error || 'http');
      toast.success(data.message || 'Demande envoyée — votre hôte vous recontacte pour la livraison.');
      const next = { ...ordered, [itemId]: true };
      setOrdered(next);
      try {
        localStorage.setItem(`hub-shop-orders-${slug}`, JSON.stringify(next));
      } catch {
        /* stockage indisponible */
      }
    } catch (e) {
      const detail = e instanceof Error && !e.message.startsWith('http') ? e.message : null;
      toast.error(detail || 'Demande impossible. Réessayez dans un instant.');
    } finally {
      setPendingId(null);
    }
  };

  return (
    <>
      <ModuleCard
        emoji="🛍️"
        tone="amber"
        eyebrow={t('Boutique de la maison')}
        title="Shop the Stay"
        subtitle={t('Les produits de la maison, livrés chez vous')}
        imageUrl={photoOverride ?? HUB_VISUALS.shop}
        onClick={() => setOpen(true)}
      >
        <span className="flex flex-wrap gap-1.5">
          <PreviewChip>
            🤝 {Math.round(SHOP_COMMISSION_RATE * 100)} % {t('reversés à votre hôte')}
          </PreviewChip>
          <PreviewChip>📦 {t('Livrés chez vous')}</PreviewChip>
        </span>
      </ModuleCard>
      <TileDialog
        open={open}
        onOpenChange={setOpen}
        emoji="🛍️"
        tone="amber"
        title="Shop the Stay"
        subtitle={t('Achetez ce que vous avez aimé pendant votre séjour')}
      >
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          🤝 {Math.round(SHOP_COMMISSION_RATE * 100)} % {t('du montant sont reversés à votre hôte — partenariat boutique.')}
        </p>
        <div className="mt-3 flex flex-col gap-2.5">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/5"
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-xl dark:bg-amber-500/15"
                >
                  {item.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{t(item.name)}</p>
                    <p className="shrink-0 text-sm font-bold text-slate-900 dark:text-white">
                      {formatEur(item.price)}
                    </p>
                  </div>
                  {item.description && (
                    <p className="mt-0.5 text-xs leading-snug text-slate-500 dark:text-slate-400">
                      {t(item.description)}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    {ordered[item.id] ? (
                      <span className="inline-flex h-9 items-center rounded-xl bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                        ✅ {t('Demande envoyée')}
                      </span>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        className="h-9 bg-slate-900 font-semibold text-white hover:bg-slate-800"
                        onClick={() => order(item.id)}
                        disabled={pendingId === item.id}
                      >
                        {pendingId === item.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <Package className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        {t('Commander')}
                      </Button>
                    )}
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold text-slate-500 underline underline-offset-2 hover:text-slate-700 dark:text-slate-400"
                      >
                        {t('Voir en ligne')}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-center text-[11px] text-slate-400 dark:text-slate-500">
          {t('Votre hôte reçoit la demande et vous recontacte pour organiser la livraison.')}
        </p>
      </TileDialog>
    </>
  );
}

// =============================================================
// v4.31 « POUR VOUS » — personnalisation intelligente du hub
// =============================================================
/** Moment du séjour : réservation en cours (serveur) sinon heure locale. */
type StayMoment = 'arrival' | 'midstay' | 'departure' | 'evening';

interface ForYouEntry {
  key: string;
  /** Photo de la mini-carte (perso de l'hôte sinon curated) ; null = repli emoji. */
  photo: string | null;
  emoji: string;
  title: string;
  /** Micro-raison contextuelle (« Vous arrivez aujourd'hui »). */
  reason: string;
  /** Carte cible : ancre à faire défiler OU dialog à ouvrir. */
  targetId?: string;
  openDialog?: 'video' | 'feedback' | 'contact';
}

/** Sélection « Pour vous » selon le moment — 2 à 3 mini-cartes. */
function forYouEntries(moment: StayMoment, photos: HubPhotoMap): ForYouEntry[] {
  const P = (k: HubPhotoKey, curated: string | null): string | null => photos[k] ?? curated;
  switch (moment) {
    case 'arrival':
      return [
        { key: 'arrival', photo: P('arrival', HUB_ARRIVAL_PHOTOS.facade), emoji: '🗺️', title: 'Arrivée pas à pas', reason: 'Vous arrivez aujourd’hui', targetId: 'hub-card-arrival' },
        { key: 'access', photo: P('access', HUB_VISUALS.access), emoji: '🔑', title: 'Accès & Codes', reason: 'Portail, serrure, boîte à clés', targetId: 'hub-card-access' },
        { key: 'video', photo: P('video', HUB_VISUALS.welcome), emoji: '🎬', title: 'Vidéo de bienvenue', reason: 'Bienvenue chez vous !', openDialog: 'video' },
      ];
    case 'departure':
      return [
        { key: 'lateCheckout', photo: P('lateCheckout', HUB_VISUALS.lateCheckout), emoji: '⏱️', title: 'Départ tardif', reason: 'Votre départ approche', targetId: 'hub-card-late' },
        { key: 'review', photo: P('review', HUB_VISUALS.review), emoji: '⭐', title: 'Bouclier d’avis', reason: 'Un mot sur votre séjour ?', openDialog: 'feedback' },
      ];
    case 'evening':
      return [
        { key: 'video', photo: P('video', HUB_VISUALS.welcome), emoji: '🎬', title: 'Vidéo de bienvenue', reason: 'Installez-vous confortablement', openDialog: 'video' },
        { key: 'host', photo: P('host', HUB_VISUALS.host), emoji: '📞', title: 'Contacter l’hôte', reason: 'Une question ce soir ?', openDialog: 'contact' },
      ];
    default: // midstay
      return [
        { key: 'spots', photo: P('spots', HUB_VISUALS.spots), emoji: '🗺️', title: 'Visiter la ville', reason: 'Les coups de cœur de votre hôte', targetId: 'hub-card-spots' },
        { key: 'appliances', photo: P('appliances', HUB_VISUALS.appliances), emoji: '🛠️', title: 'Guide des appareils', reason: 'Maîtrisez toute la maison', targetId: 'hub-card-appliances' },
      ];
  }
}

/** Bandeau horizontal « ✨ Pour vous » — mini-cartes photo (Ken Burns)
 *  qui sautent à la carte ciblée ou ouvrent le dialog correspondant. */
function ForYouStrip({
  entries,
  onJump,
  onOpen,
}: {
  entries: ForYouEntry[];
  onJump: (id: string) => void;
  onOpen: (d: 'video' | 'feedback' | 'contact') => void;
}) {
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  if (entries.length === 0) return null;
  return (
    <div className="mt-6" aria-label="Suggestions personnalisées">
      <p className="px-1 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
        ✨ Pour vous
      </p>
      <div className="mt-2.5 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {entries.map((e) => (
          <button
            key={e.key}
            type="button"
            onClick={() => {
              if (e.targetId) onJump(e.targetId);
              else if (e.openDialog) onOpen(e.openDialog);
            }}
            className="group relative h-32 w-44 shrink-0 snap-start overflow-hidden rounded-2xl border border-black/10 text-left air-shadow-lg transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-[#055492]/50 hover:shadow-[0_18px_40px_-18px_rgba(15,23,42,0.35)] dark:border-white/10"
          >
            {e.photo && !failed[e.key] ? (
              <img
                src={e.photo}
                alt=""
                loading="lazy"
                decoding="async"
                className="hub-kenburns absolute inset-0 h-full w-full object-cover"
                onError={() => setFailed((f) => ({ ...f, [e.key]: true }))}
              />
            ) : (
              <span
                aria-hidden="true"
                className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 text-4xl"
              >
                {e.emoji}
              </span>
            )}
            <span
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/10"
            />
            <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full border border-white/35 bg-black/35 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-white/90 backdrop-blur-sm">
              ✨ Pour vous
            </span>
            <span className="absolute inset-x-0 bottom-0 flex flex-col p-3">
              <span className="text-sm font-bold leading-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.55)]">
                {e.title}
              </span>
              <span className="mt-0.5 text-[11px] leading-snug text-white/85">{e.reason}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Dialog clair ouvert par une tuile — remplace le contenu dépliable
 * inline des anciennes cartes (contenu métier inchangé). Version
 * claire : fond blanc, bordure slate, titre slate-900, tuile
 * d'icône toujours colorée. */
function TileDialog({
  open,
  onOpenChange,
  emoji,
  tone,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  emoji: string;
  tone: TileTone;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const t = CARD_TONES[tone];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-md rounded-3xl border border-slate-200 bg-white p-5 text-slate-900 shadow-xl sm:p-6 dark:border-[#D4AF37]/20 dark:bg-[#181410] dark:text-[#F5EFE6] dark:shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]">
        <DialogHeader className="items-start text-left">
          <div className="flex items-center gap-3 pr-6">
            <span
              aria-hidden="true"
              className={cn(
                'inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl leading-none',
                t.iconTile,
              )}
            >
              {emoji}
            </span>
            <div className="min-w-0">
              <DialogTitle className="display-title font-serif! text-xl font-bold text-slate-900 dark:text-[#F5EFE6]">
                {title}
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs text-slate-500 dark:text-[#A89F91]">{subtitle}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="-mx-1 max-h-[60dvh] overflow-y-auto px-1 pb-1 custom-scrollbar">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================
// v4.35 « ALERTE NOUVEAU MESSAGE » (demande client : « afficher une
// icône rouge et faire scintiller l'onglet contact pour signaler le
// message, mettre un bip sonore mp3 ») — la carte « Contacter l'hôte »
// clignote en rouge + bip sonore quand l'hôte a laissé une réponse
// vocale non vue. Polling léger (?meta=1, SANS audio) + journal des
// ids déjà vus en localStorage (par hub). Premier scan = baseline
// silencieuse (pas de bip pour d'anciens messages).
// =============================================================
const seenRepliesKey = (slug: string) => `hub-guest-seen-replies-${slug}`;

function readSeenReplies(slug: string): string[] {
  try {
    const raw = window.localStorage.getItem(seenRepliesKey(slug));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === 'string').slice(-200)
      : [];
  } catch {
    return [];
  }
}

function persistSeenReplies(slug: string, ids: string[]) {
  try {
    const merged = Array.from(new Set([...readSeenReplies(slug), ...ids])).slice(-200);
    window.localStorage.setItem(seenRepliesKey(slug), JSON.stringify(merged));
  } catch {
    // localStorage indisponible : l'alerte se réaffichera (bénin)
  }
}

function useHostReplyAlert(slug: string) {
  const [newReplyIds, setNewReplyIds] = useState<string[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  /** Bip sonore mp3 — tolérant à la politique d'autoplay : si le
   *  navigateur bloque la lecture, elle est re-jouée au 1er geste. */
  const playBeep = useCallback(() => {
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio('/sounds/message-alert.mp3');
        audioRef.current.volume = 0.7;
      }
      audioRef.current.currentTime = 0;
      const playing = audioRef.current.play();
      if (playing && typeof playing.catch === 'function') {
        playing.catch(() => {
          const retry = () => {
            try {
              audioRef.current?.play().catch(() => undefined);
            } catch {
              // audio indisponible
            }
            window.removeEventListener('pointerdown', retry);
            window.removeEventListener('keydown', retry);
          };
          window.addEventListener('pointerdown', retry, { once: true });
          window.addEventListener('keydown', retry, { once: true });
        });
      }
    } catch {
      // Audio indisponible : l'alerte visuelle reste suffisante
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/voice-replies?meta=1`, {
          cache: 'no-store',
        });
        if (!res.ok || !alive) return;
        const data = (await res.json().catch(() => ({}))) as { replies?: { id: string }[] };
        const ids = (data.replies ?? []).map((r) => r.id).filter(Boolean);
        if (ids.length === 0 || !alive) return;
        let baseline = false;
        try {
          baseline = window.localStorage.getItem(seenRepliesKey(slug)) === null;
        } catch {
          baseline = false;
        }
        if (baseline) {
          // Premier passage sur ce hub : les réponses existantes deviennent
          // la référence — on n'alerte que sur les NOUVELLES ensuite.
          persistSeenReplies(slug, ids);
          return;
        }
        const seen = readSeenReplies(slug);
        const fresh = ids.filter((id) => !seen.includes(id));
        if (fresh.length > 0) {
          setNewReplyIds(fresh);
          playBeep();
        }
      } catch {
        // réseau indisponible : prochain tick
      }
    };
    void check();
    const timer = setInterval(check, 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [slug, playBeep]);

  /** Marquer des réponses comme vues (ouverture de l'onglet Messages). */
  const markRepliesSeen = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      persistSeenReplies(slug, ids);
      setNewReplyIds((prev) => prev.filter((id) => !ids.includes(id)));
    },
    [slug],
  );

  return { newReplyIds, markRepliesSeen };
}

// =============================================================
// v4.35 « RÉSERVATION DIRECTE » — bandeau PERMANENT de la page
// d'accueil du hub (stratégie B2B : la plateforme transforme les
// clients Airbnb en clients DIRECTS de l'hôte) :
//   « Vous avez aimé votre séjour ? Économisez 15 % sur votre
//    prochaine visite en réservant directement ici — sans les
//    frais d'Airbnb. »
// CTA : lien directBookingUrl de l'hôte (dashboard premium), sinon
// repli WhatsApp prérempli avec le message de réservation.
// =============================================================
function DirectBookingBanner({
  discount,
  url,
  waHref,
  propertyName,
}: {
  discount: number;
  url?: string | null;
  waHref: string | null;
  propertyName: string;
}) {
  const { t } = useHubLang();
  const bookHref = url
    ? url
    : waHref
      ? `${waHref}?text=${encodeURIComponent(
          `Bonjour ! J'ai adoré mon séjour à ${propertyName}. Je souhaite réserver à nouveau en direct — avec la remise de ${discount} % (sans frais de plateforme).`,
        )}`
      : null;
  return (
    <div className="mx-auto mt-4 w-full overflow-hidden rounded-3xl bg-gradient-to-r from-[#055492] via-[#04467a] to-[#043455] p-[1.5px] shadow-[0_18px_44px_-20px_rgba(5, 84, 146,0.5)]">
      <div className="rounded-[22px] bg-white/95 p-4 sm:p-5 dark:bg-slate-900/95">
        <p className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[#04467a] dark:text-[#1173c7]">
          <BadgePercent className="h-3.5 w-3.5" aria-hidden="true" />
          {t('Réservation directe')}
          <span className="rounded-full bg-[#055492] px-2 py-0.5 text-[10px] font-bold tracking-normal text-white">
            -{discount} %
          </span>
        </p>
        <p className="display-title font-serif! mt-1.5 text-lg font-bold leading-snug text-slate-900 dark:text-white">
          {t('Vous avez aimé votre séjour ?')}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          {t(
            `Économisez ${discount} % sur votre prochaine visite en réservant directement ici — sans les frais d'Airbnb.`,
          )}
        </p>
        {bookHref && (
          <a
            href={bookHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
          >
            <CalendarCheck className="h-4 w-4" aria-hidden="true" />
            {t('Réserver en direct')}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        )}
      </div>
    </div>
  );
}

// =============================================================
// v4.44 « REVIEW BOOSTER 5 ÉTOILES » — filtre intelligent (demande
// client : « Si le voyageur met 5/5, un bouton géant "Partagez votre
// expérience sur Airbnb" ; si la note est inférieure, un formulaire
// privé "Dites-nous ce qui n'a pas été…" ») :
//   • 5/5 → bouton GÉANT vers reviewUrl (boost de référencement hôte) ;
//   • ≤ 4/5 → formulaire PRIVÉ (POST /private-feedback — alerte hôte,
//     zéro avis public négatif).
// Utilisé 2× : bandeau fin de séjour (veille ≥ 18 h + matin J) et
// ÉCRAN post-départ (redirection après le « Départ définitif »).
// La réponse du bandeau est mémorisée en localStorage (1 fois/séjour).
// =============================================================
const reviewBoosterKey = (slug: string) => `hub-review-booster-${slug}`;

/** Flux d'avis partagé (bandeau fin de séjour + écran post-départ). */
function StarReviewFlow({
  slug,
  reviewUrl,
  waHref,
  propertyName,
  big,
  initialRating,
  onRated,
  onSent,
}: {
  slug: string;
  reviewUrl?: string | null;
  waHref: string | null;
  propertyName: string;
  /** Variante « écran post-départ » : étoiles et bouton agrandis. */
  big?: boolean;
  /** Note déjà choisie (reprise localStorage du bandeau). */
  initialRating?: number | null;
  /** Callback à chaque choix d'étoiles (persistance du bandeau). */
  onRated?: (n: number) => void;
  /** v4.79 — avis privé envoyé : le parent masque les modules avis. */
  onSent?: () => void;
}) {
  const { t } = useHubLang();
  const [rating, setRating] = useState<number | null>(initialRating ?? null);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const praiseHref = reviewUrl
    ? reviewUrl
    : waHref
      ? `${waHref}?text=${encodeURIComponent(`Bonjour ! Nous avons passé un superbe séjour à ${propertyName} 🙏`)}`
      : null;

  const submitPrivate = async () => {
    if (!rating) return;
    setSending(true);
    try {
      const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/private-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, comment: comment.trim() || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'http');
      setSent(true);
      // v4.79 — avis privé envoyé → les modules « avis » disparaissent.
      onSent?.();
    } catch (e) {
      const detail = e instanceof Error && !e.message.startsWith('http') ? e.message : null;
      toast.error(detail || 'Envoi impossible. Réessayez.');
    } finally {
      setSending(false);
    }
  };

  // ── 5/5 → BOUTON GÉANT « Partagez votre expérience sur Airbnb » ──
  if (rating === 5) {
    return (
      <div className="space-y-3">
        <p className="text-center text-sm font-semibold text-emerald-700 dark:text-emerald-300">
          {t('Merci beaucoup ! 🙏 Votre enthousiasme nous aide énormément.')}
        </p>
        {praiseHref ? (
          <a
            href={praiseHref}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'flex w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-[#055492] via-[#04467a] to-[#033a66] font-bold text-white shadow-[0_14px_34px_-14px_rgba(5, 84, 146,0.55)] transition-transform hover:scale-[1.02] active:scale-[0.98]',
              big ? 'min-h-16 px-4 text-center text-base sm:text-lg' : 'min-h-14 px-3 text-center text-sm',
            )}
          >
            <Star className={cn('shrink-0 fill-amber-300 text-amber-300', big ? 'h-6 w-6' : 'h-5 w-5')} aria-hidden="true" />
            <span className="flex-1">{t('Partagez votre expérience sur Airbnb')}</span>
            <ArrowRight className={cn('shrink-0', big ? 'h-6 w-6' : 'h-5 w-5')} aria-hidden="true" />
          </a>
        ) : (
          <p className="mt-2 text-center text-[11px] text-slate-500 dark:text-slate-400">
            {t("Votre hôte prépare son lien d'avis — dites-lui votre enthousiasme via l'onglet Contact !")}
          </p>
        )}
      </div>
    );
  }

  // ── 1-4/5 → FORMULAIRE PRIVÉ (bouclier d'avis) ──
  if (rating != null && rating <= 4) {
    if (sent) {
      return (
        <p className="text-center text-sm font-semibold text-emerald-700 dark:text-emerald-300">
          ✅ {t('Merci, votre hôte est prévenu et va vous répondre. 💬')}
        </p>
      );
    }
    return (
      <div className="space-y-2.5">
        <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          {t("Dites-nous ce qui n'a pas été pour que nous puissions nous améliorer.")}{' '}
          {t('Votre message reste 100 % privé.')}
        </p>
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={t("Ce qui s'est passé, ce qui peut être amélioré…")}
          rows={3}
          maxLength={2000}
          aria-label={t('Votre message privé')}
        />
        <Button
          type="button"
          className="h-auto min-h-11 w-full whitespace-normal bg-slate-900 py-2.5 text-center text-sm font-semibold leading-snug text-white hover:bg-slate-800"
          onClick={submitPrivate}
          disabled={sending}
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          )}
          {sending ? t('Envoi…') : t('Envoyer en privé')}
        </Button>
      </div>
    );
  }

  // ── Sélecteur d'étoiles (filtre intelligent) ──
  return (
    <div
      className="flex items-center justify-center gap-1.5"
      role="radiogroup"
      aria-label={t('Note de 1 à 5 étoiles')}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={rating === n}
          aria-label={`${n} étoile${n > 1 ? 's' : ''}`}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => {
            setRating(n);
            onRated?.(n);
          }}
          className={cn(
            'rounded-lg p-1 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#055492]',
            big && 'p-1.5',
          )}
        >
          <Star
            className={cn(
              big ? 'h-10 w-10' : 'h-8 w-8',
              (hover >= n || (rating ?? 0) >= n)
                ? 'fill-amber-400 text-amber-400'
                : 'text-slate-300 dark:text-slate-600',
            )}
            aria-hidden="true"
          />
        </button>
      ))}
    </div>
  );
}

function ReviewBoosterBanner({
  slug,
  reviewUrl,
  waHref,
  propertyName,
  stayKey,
  onPrivateSent,
}: {
  slug: string;
  reviewUrl?: string | null;
  waHref: string | null;
  propertyName: string;
  /** v4.79 — clé du séjour : l'avis privé envoyé masque le bandeau. */
  stayKey: string;
  /** v4.79 — avis privé envoyé depuis CE bandeau → persistance + retrait. */
  onPrivateSent?: () => void;
}) {
  const { t } = useHubLang();
  // v4.79 — un avis privé a DÉJÀ été envoyé pour ce séjour (via le
  // bandeau OU le Bouclier d'avis) → le bandeau n'existe plus.
  const [alreadySent] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(feedbackDoneKey(slug, stayKey)) != null;
    } catch {
      return false;
    }
  });
  // v4.44 — note mémorisée (1..5) au lieu du simple 👍/👎.
  const [answer, setAnswer] = useState<number | null>(() => {
    try {
      const v = window.localStorage.getItem(reviewBoosterKey(slug));
      const n = v ? parseInt(v, 10) : NaN;
      return n >= 1 && n <= 5 ? n : null;
    } catch {
      return null;
    }
  });

  const pick = (n: number) => {
    setAnswer(n);
    try {
      window.localStorage.setItem(reviewBoosterKey(slug), String(n));
    } catch {
      // localStorage indisponible : le questionnaire réapparaîtra
    }
  };

  // v4.79 — avis déjà envoyé ce séjour : plus aucune trace du bandeau.
  if (alreadySent) return null;

  /** v4.79 — avis privé envoyé depuis CE bandeau : la complétion est
   *  persistée IMMÉDIATEMENT (localStorage), puis le parent retire le
   *  bandeau après 1,5 s — le « ✅ Merci » reste lisible un instant. */
  const handlePrivateSent = () => {
    try {
      window.localStorage.setItem(feedbackDoneKey(slug, stayKey), new Date().toISOString());
    } catch {
      // localStorage indisponible : le retrait ne survivra pas au rechargement
    }
    window.setTimeout(() => onPrivateSent?.(), 1500);
  };

  if (answer === 5) {
    return (
      <div className="mx-auto mt-4 w-full overflow-hidden rounded-3xl bg-gradient-to-r from-amber-500 via-amber-400 to-emerald-500 p-[1.5px] shadow-[0_18px_44px_-20px_rgba(217,119,6,0.5)]">
        <div className="rounded-[22px] bg-white/95 p-4 sm:p-5 dark:bg-slate-900/95">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-600 dark:text-amber-400">
            ⭐ {t('Fin de séjour')}
          </p>
          <p className="display-title font-serif! mt-1.5 text-lg font-bold text-slate-900 dark:text-white">
            {t('Merci beaucoup ! 🙏')}
          </p>
          <div className="mt-3">
            <StarReviewFlow
              slug={slug}
              reviewUrl={reviewUrl}
              waHref={waHref}
              propertyName={propertyName}
              initialRating={5}
              onSent={handlePrivateSent}
            />
          </div>
        </div>
      </div>
    );
  }

  if (answer != null) {
    return (
      <div className="mx-auto mt-4 w-full overflow-hidden rounded-3xl bg-gradient-to-r from-slate-700 via-slate-600 to-emerald-600 p-[1.5px] shadow-[0_18px_44px_-20px_rgba(15,23,42,0.5)]">
        <div className="rounded-[22px] bg-white/95 p-4 sm:p-5 dark:bg-slate-900/95">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            🔒 {t('En toute discrétion')}
          </p>
          <p className="display-title font-serif! mt-1.5 text-lg font-bold text-slate-900 dark:text-white">
            {t('Merci de nous le dire en privé')}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            {t("Dites-nous ce qui n'a pas été — on s'en occupe tout de suite, avant votre départ.")}
          </p>
          <div className="mt-3">
            <StarReviewFlow
              slug={slug}
              reviewUrl={reviewUrl}
              waHref={waHref}
              propertyName={propertyName}
              initialRating={answer}
              onSent={handlePrivateSent}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-4 w-full overflow-hidden rounded-3xl bg-gradient-to-r from-amber-500 via-orange-400 to-emerald-500 p-[1.5px] shadow-[0_18px_44px_-20px_rgba(217,119,6,0.5)]">
      <div className="rounded-[22px] bg-white/95 p-4 sm:p-5 dark:bg-slate-900/95">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-600 dark:text-amber-400">
          ⭐ {t('Fin de séjour')}
        </p>
        <p className="display-title font-serif! mt-1.5 text-lg font-bold text-slate-900 dark:text-white">
          {t('Comment se passe votre séjour ?')}
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {t('Votre note reste entre nous.')}
        </p>
        <div className="mt-3">
          <StarReviewFlow
            slug={slug}
            reviewUrl={reviewUrl}
            waHref={waHref}
            propertyName={propertyName}
            onRated={pick}
            onSent={handlePrivateSent}
          />
        </div>
      </div>
    </div>
  );
}

// =============================================================
// v4.44 « DÉPART DÉFINITIF » — bouton rouge bien visible du Hub
// (demande client) : modal de confirmation anti double-clic, puis
//   1. Fetch POST /checkout-final → heure EXACTE en base de données ;
//   2. alerte AUTOMATIQUE équipe de ménage (« Les voyageurs ont
//      quitté le logement. Vous pouvez intervenir. ») ;
//   3. redirection immédiate vers l'écran de recueil d'avis 5 étoiles
//      (Review Booster — l'invité est encore dans une dynamique positive).
// =============================================================
// v4.79 « DISPARITION APRÈS COMPLÉTION » — les 3 modules de fin de
// séjour (Départ définitif, Départ tardif, Avis) DISPARAISSENT du hub
// dès que l'invité les a remplis (demande client). La complétion est
// mémorisée en localStorage AVEC LA CLÉ DU SÉJOUR (jour de check-out) :
// chaque nouvel invité retrouve les modules, même sur la même tablette.
const checkoutFinalKey = (slug: string, stayKey: string) =>
  `hub-checkout-final-${slug}-${stayKey}`;
const lateRequestedKey = (slug: string, stayKey: string) =>
  `hub-late-requested-${slug}-${stayKey}`;
const feedbackDoneKey = (slug: string, stayKey: string) =>
  `hub-feedback-done-${slug}-${stayKey}`;
// v4.80 « ÉTATS DES LIEUX DU HUB » — disparition après signature
// (même pattern v4.79 : clé PAR SÉJOUR, nouveaux invités les retrouvent).
const checkinInspectionKey = (slug: string, stayKey: string) =>
  `hub-edl-in-${slug}-${stayKey}`;
const checkoutInspectionKey = (slug: string, stayKey: string) =>
  `hub-edl-out-${slug}-${stayKey}`;

// =============================================================
// v4.82 « AU REVOIR + VERROUILLAGE 5 MIN » (demande client)
// Après le départ confirmé (immédiat OU définitif), l'invité dispose
// de 5 minutes pour signer l'état des lieux et laisser son avis :
// le hub lui dit au revoir, un compte à rebours 5:00 s'affiche, et à
// zéro le hub se VERROUILLE (retour à l'écran de code). L'échéance
// est stockée en localStorage (clé PAR SÉJOUR) — un rechargement de
// page ne repousse jamais le verrouillage.
// =============================================================
const FAREWELL_LOCK_MS = 5 * 60 * 1000;
/** Min:SS restants (ex : « 4:07 ») — ceil pour ne jamais afficher 0:00 avant l'expiration. */
const farewellClockMs = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

// v4.54 « ALERTE VOCALE & CHECKLIST DE DÉPART » — les 5 vérifications
// "objets oubliés" que l'invité confirme AVANT le départ définitif
// (spécification client : chargeurs, sous le lit/canapé, coffre-fort,
// salle de bain, frigo). Envoyée au serveur pour traçabilité hôte.
const CHECKOUT_CHECKLIST: string[] = [
  '🔌 Chargeurs récupérés sur les prises',
  '🛏️ Objets sous le lit et sous le canapé',
  '🔐 Coffre-fort vidé',
  '🚿 Salle de bain (trousse de toilette)',
  '🧊 Frigo (courses personnelles)',
];

// v4.112 « TTS PREMIUM DENISE » — le rappel vocal par défaut n'est plus
// lu par la synthèse native du navigateur : il est PRÉ-GÉNÉRÉ en MP3
// (voix Microsoft fr-FR-DeniseNeural, rate -5%) par
// scripts/pre-generate-audio.ts → public/audio/hub/checkout-checklist-fr.mp3.
// Si le fichier est indisponible, AudioPlayer replie sur la Web Speech
// API (voix du navigateur) — l'invité entend toujours son rappel.
const CHECKOUT_VOICE_TEXT =
  'Avant de partir, avez-vous vérifié la sous-pente du lit, les chargeurs sur les prises, et le coffre-fort ?';
const CHECKOUT_VOICE_MP3 = '/audio/hub/checkout-checklist-fr.mp3';

function CheckoutFinalCard({
  slug,
  propertyName,
  stayKey,
  checkoutAudioUrl,
  onConfirmed,
  /** v4.77 « DÉPART D'URGENCE » — jour J : le flux urgence REMPLACE la
   *  checklist (l'invité part maintenant — montant à régler affiché). */
  urgentMode = false,
  /** v4.77 — montant estimé à régler (minibar ouvert + départ tardif validé). */
  amountDue = null,
  /** v4.77 — mise en évidence (bordure rouge renforcée + pastille) dès la veille au soir. */
  highlight = false,
}: {
  slug: string;
  propertyName: string;
  /** v4.79 — clé du séjour (jour de check-out) : la complétion est
   *  mémorisée PAR SÉJOUR (un nouvel invité retrouve le module). */
  stayKey: string;
  /** v4.54 — audio pré-enregistré par l'hôte (joué dans la modale de checklist). */
  checkoutAudioUrl?: string | null;
  /** Départ confirmé → affiche l'écran de recueil d'avis. */
  onConfirmed: () => void;
  urgentMode?: boolean;
  amountDue?: { minibarEur: number; lateCheckoutEur: number; totalEur: number } | null;
  highlight?: boolean;
}) {
  const { t } = useHubLang();
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  // v4.71 « MOT DE VOTRE HÔTE INAUDIBLE » — l'URL hôte est réécrite vers
  // la route de lecture dynamique (les anciens chemins /uploads/voice/
  // sont 404 en build standalone) + repli TTS si le fichier échoue.
  const checkoutAudioSrc = voiceAudioSrc(checkoutAudioUrl ?? '');
  const [audioFailed, setAudioFailed] = useState(false);
  // v4.54 « ALERTE VOCALE & CHECKLIST DE DÉPART » — 2 étapes :
  //   « check » = voix de l'hôte (audio ou TTS) + 5 vérifications cochées
  //   « confirm » = récapitulatif du départ (l'ex-dialog initial)
  const [step, setStep] = useState<'check' | 'confirm' | 'urgent'>('check');
  const [checklist, setChecklist] = useState<boolean[]>(() => CHECKOUT_CHECKLIST.map(() => false));
  const [confirmedAt, setConfirmedAt] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(checkoutFinalKey(slug, stayKey));
    } catch {
      return null;
    }
  });

  const allChecked = checklist.every(Boolean);

  // v4.112 « VOIX DENISE PRÉ-GÉNÉRÉE » — le rappel vocal par défaut est
  // un MP3 Denise (public/audio/hub/checkout-checklist-fr.mp3) joué par
  // <AudioPlayer> (plus de Web Speech API en usage normal). Le repli
  // navigateur vit DANS le composant (déclenché si le MP3 est absent).
  // L'ancien effet speechSynthesis + replayVoice sont supprimés.

  useEffect(() => {
    if (!open) return;
    return () => {
      try {
        window.speechSynthesis?.cancel();
      } catch {
        // silencieux
      }
    };
  }, [open]);

  const confirm = async () => {
    setSending(true);
    try {
      // v4.50 — hubFetch : envoie le token de session (hub verrouillé)
      // et déclenche l'écran de code sur 403 SESSION_EXPIRED.
      const res = await hubFetch(slug, `/api/public/hub/${encodeURIComponent(slug)}/checkout-final`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // v4.54 — checklist confirmée envoyée pour traçabilité hôte.
        // v4.77 — en URGENCE : pas de checklist, le montant estimé
        // (minibar ouvert + départ tardif validé) accompagne l'alerte hôte.
        body: JSON.stringify({
          ...(urgentMode ? { urgent: true, amountDueEur: amountDue?.totalEur ?? 0 } : {}),
          checklist: urgentMode
            ? null
            : CHECKOUT_CHECKLIST.map((label, i) => ({ label, done: checklist[i] ?? false })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) throw new Error(data.error || data.message || 'http');
      try {
        window.localStorage.setItem(checkoutFinalKey(slug, stayKey), new Date().toISOString());
      } catch {
        // localStorage indisponible : le bouton restera actif
      }
      setConfirmedAt(new Date().toISOString());
      setOpen(false);
      toast.success(t('Départ enregistré — l’équipe de ménage a été prévenue. Merci !'));
      onConfirmed();
    } catch (e) {
      const detail = e instanceof Error && !e.message.startsWith('http') ? e.message : null;
      toast.error(detail || 'Confirmation impossible. Réessayez dans un instant.');
    } finally {
      setSending(false);
    }
  };

  // v4.79 « DISPARITION APRÈS COMPLÉTION » (demande client) — une fois
  // le départ confirmé, le module QUITTE le hub : l'écran de recueil
  // d'avis s'affiche immédiatement (onConfirmed), et au retour sur le
  // hub la carte n'existe plus. Rien à rouvrir, rien à re-confirmer.
  if (confirmedAt) return null;

  return (
    <>
      {/* v4.77 — highlight : bordure rouge renforcée (veille au soir / jour J). */}
      <div
        className={`flex h-full flex-col overflow-hidden rounded-3xl bg-gradient-to-r from-red-600 via-orange-500 to-amber-500 p-[1.5px] shadow-[0_18px_44px_-20px_rgba(220,38,38,0.55)] ${
          highlight ? 'ring-2 ring-red-500 ring-offset-2 ring-offset-transparent' : ''
        }`}
      >
        <div className="flex flex-1 flex-col rounded-[22px] bg-white/95 p-5 dark:bg-slate-900/95">
          {highlight && !urgentMode ? (
            <p className="mb-2 flex items-center justify-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white">
              <span aria-hidden="true" className="animate-pulse">🌙</span> {t('Ce soir : préparez votre départ')}
            </p>
          ) : null}
          {/* v4.71 — bandeau immersif « départ » (valise prête, lumière du
              matin) au-dessus de la carte d'action rouge. */}
          <img
            src={HUB_VISUALS.departure}
            alt=""
            loading="lazy"
            decoding="async"
            className="mb-3.5 h-24 w-full rounded-2xl object-cover"
          />
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-100 text-2xl dark:bg-red-500/15"
            >
              🚪
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-red-600 dark:text-red-400">
                {urgentMode ? t('Vous partez maintenant ?') : t('Dernier jour ?')}
              </p>
              <p className="display-title font-serif! text-lg font-bold text-slate-900 dark:text-white">
                {urgentMode ? t('Départ immédiat') : t('Départ définitif')}
              </p>
            </div>
          </div>
          {urgentMode && amountDue && amountDue.totalEur > 0 ? (
            <p className="mt-2.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
              💰 {t('Montant à régler')} : {amountDue.totalEur.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
            </p>
          ) : null}
          <p className="mt-3 flex-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            {urgentMode
              ? t('Vous devez partir tout de suite ? Signalez-le : votre hôte est alerté immédiatement avec le montant à régler et l’équipe de ménage est prévenue.')
              : `${t('Vous quittez')} ${propertyName} ${t('? Confirmez votre départ : l’heure est enregistrée et l’équipe de ménage est alertée automatiquement.')}`}
          </p>
          {urgentMode ? (
            <Button
              type="button"
              className="mt-3 h-auto min-h-12 w-full animate-pulse whitespace-normal bg-gradient-to-r from-red-600 to-red-500 py-3 text-center text-sm font-bold uppercase tracking-wide text-white shadow-lg shadow-red-600/30 transition-transform hover:scale-[1.01] hover:from-red-700 active:scale-[0.99]"
              onClick={() => {
                setStep('urgent');
                setOpen(true);
              }}
              aria-label={t('Départ d’urgence — je pars maintenant')}
            >
              🚨 {t('Départ d’urgence — je pars maintenant')}
            </Button>
          ) : (
            <Button
              type="button"
              className="mt-3 h-auto min-h-12 w-full whitespace-normal bg-gradient-to-r from-red-600 to-orange-500 py-3 text-center text-sm font-bold text-white shadow-md transition-transform hover:scale-[1.01] hover:from-red-700 hover:to-orange-600 active:scale-[0.99]"
              onClick={() => {
                setStep('check');
                setChecklist(CHECKOUT_CHECKLIST.map(() => false));
                setOpen(true);
              }}
              aria-label={t('Confirmer mon départ définitif')}
            >
              🚪 {t('Confirmer mon départ')}
            </Button>
          )}
        </div>
      </div>
      <Dialog open={open} onOpenChange={(v) => !sending && setOpen(v)}>
        <DialogContent className="max-w-sm rounded-3xl border border-slate-200 bg-white text-slate-900 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100">
          {step === 'urgent' ? (
            <>
              {/* ── v4.77 : FLUX URGENCE (jour J, REMPLACE la checklist) ── */}
              <DialogHeader className="items-start text-left">
                <DialogTitle className="text-base font-bold text-red-600 dark:text-red-400">
                  🚨 {t('Départ d’urgence')}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
                  {t('Votre hôte et l’équipe de ménage sont alertés immédiatement.')}
                </DialogDescription>
              </DialogHeader>
              {/* Montant total à régler — minibar ouvert + départ tardif validé. */}
              {amountDue ? (
                <div className="rounded-2xl border border-red-200 bg-red-50/70 p-3.5 dark:border-red-500/30 dark:bg-red-500/10">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-red-700 dark:text-red-300">
                    💰 {t('Montant total de votre séjour à régler')}
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-slate-700 dark:text-slate-200">
                    <li className="flex items-center justify-between gap-2">
                      <span>🍷 {t('Consommations (minibar, extras)')}</span>
                      <span className="font-semibold">{amountDue.minibarEur.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</span>
                    </li>
                    <li className="flex items-center justify-between gap-2">
                      <span>⏱️ {t('Départ tardif validé')}</span>
                      <span className="font-semibold">{amountDue.lateCheckoutEur.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</span>
                    </li>
                    <li className="mt-1 flex items-center justify-between gap-2 border-t border-red-200 pt-1.5 text-sm font-bold text-red-700 dark:border-red-500/40 dark:text-red-300">
                      <span>{t('TOTAL')}</span>
                      <span>{amountDue.totalEur.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</span>
                    </li>
                  </ul>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                    {t('Aucun paiement immédiat — votre hôte vous contactera pour le règlement.')}
                  </p>
                </div>
              ) : null}
              <ul className="space-y-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                <li className="flex items-start gap-2">
                  <span aria-hidden="true">🕐</span>
                  {t('L’heure exacte de votre départ sera enregistrée.')}
                </li>
                <li className="flex items-start gap-2">
                  <span aria-hidden="true">🧹</span>
                  {t('L’équipe de ménage sera alertée immédiatement : « Les voyageurs vont quitter le logement. Vous pouvez intervenir pour le ménage après le départ. »')}
                </li>
                <li className="flex items-start gap-2">
                  <span aria-hidden="true">⭐</span>
                  {t('Vous serez invité à laisser votre avis en 2 clics.')}
                </li>
              </ul>
              <Button
                type="button"
                className="min-h-12 w-full whitespace-normal bg-gradient-to-r from-red-600 to-red-500 py-3 text-center text-sm font-bold text-white hover:from-red-700"
                onClick={confirm}
                disabled={sending}
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="h-4 w-4" aria-hidden="true" />
                )}
                {sending ? t('Envoi…') : t('Confirmer le départ immédiat')}
              </Button>
            </>
          ) : step === 'check' ? (
            <>
              {/* ── ÉTAPE 1 (v4.54) : ALERTE VOCALE + CHECKLIST 5 POINTS ── */}
              <DialogHeader className="items-start text-left">
                <DialogTitle className="text-base font-bold text-slate-900 dark:text-white">
                  🎙️ {t('Avant de partir, on vérifie ensemble')}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
                  {t('Le rappel vocal de votre hôte, puis 5 vérifications rapides pour ne rien oublier.')}
                </DialogDescription>
              </DialogHeader>

              {/* Rappel vocal : audio pré-enregistré par l'hôte, sinon
                  voix de synthèse (TTS navigateur, fr-FR, 0.9). */}
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 dark:border-amber-500/30 dark:bg-amber-500/10">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-300">
                  🔊 {t('Le mot de votre hôte')}
                </p>
                {checkoutAudioUrl && !audioFailed ? (
                  <audio
                    className="mt-2 w-full"
                    controls
                    autoPlay
                    src={checkoutAudioSrc}
                    onError={() => setAudioFailed(true)}
                  />
                ) : (
                  // v4.112 — MP3 Denise pré-généré (lecture instantanée),
                  // repli Web Speech API automatique dans le composant.
                  <AudioPlayer
                    src={CHECKOUT_VOICE_MP3}
                    fallbackText={CHECKOUT_VOICE_TEXT}
                    autoPlay
                    label={t('Réécouter le rappel')}
                    className="mt-2"
                  />
                )}
              </div>

              {/* Checklist interactive 5 points */}
              <ul className="space-y-2" aria-label={t('Vérifications avant de partir')}>
                {CHECKOUT_CHECKLIST.map((label, i) => {
                  const done = checklist[i] ?? false;
                  return (
                    <li key={label}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={done}
                        onClick={() =>
                          setChecklist((prev) => prev.map((v, idx) => (idx === i ? !v : v)))
                        }
                        className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-xs font-semibold transition-colors cursor-pointer ${
                          done
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300'
                            : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-emerald-300 dark:border-white/10 dark:bg-white/5 dark:text-slate-300'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                            done
                              ? 'border-emerald-500 bg-emerald-500 text-white'
                              : 'border-slate-300 bg-white text-transparent dark:border-white/30 dark:bg-transparent'
                          }`}
                        >
                          ✓
                        </span>
                        <span className={done ? 'line-through opacity-70' : ''}>{t(label)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <Button
                type="button"
                className={`min-h-12 w-full whitespace-normal bg-gradient-to-r py-3 text-center text-sm font-bold text-white transition-all ${
                  allChecked
                    ? 'from-emerald-600 to-teal-500 hover:from-emerald-700 hover:to-teal-600'
                    : 'cursor-not-allowed from-slate-300 to-slate-300 dark:from-white/20 dark:to-white/20'
                }`}
                disabled={!allChecked}
                onClick={() => setStep('confirm')}
              >
                ✅ {allChecked ? t("J'ai tout vérifié, je peux partir") : `${checklist.filter(Boolean).length}/${CHECKOUT_CHECKLIST.length} vérifiés — cochez tout`}
              </Button>
            </>
          ) : (
            <>
              {/* ── ÉTAPE 2 : récapitulatif et confirmation définitive ── */}
              <DialogHeader className="items-start text-left">
                <DialogTitle className="text-base font-bold text-slate-900 dark:text-white">
                  🚪 {t('Confirmer votre départ définitif ?')}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
                  {t('Cette action est rapide mais définitive — tout est vérifié ✅')}
                </DialogDescription>
              </DialogHeader>
              <ul className="space-y-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                <li className="flex items-start gap-2">
                  <span aria-hidden="true">🕐</span>
                  {t('L’heure exacte de votre départ sera enregistrée.')}
                </li>
                <li className="flex items-start gap-2">
                  <span aria-hidden="true">🧹</span>
                  {t('L’équipe de ménage sera alertée immédiatement : « Les voyageurs vont quitter le logement. Vous pouvez intervenir pour le ménage après le départ. »')}
                </li>
                <li className="flex items-start gap-2">
                  <span aria-hidden="true">⭐</span>
                  {t('Vous serez invité à laisser votre avis en 2 clics.')}
                </li>
              </ul>
              <div className="grid grid-cols-2 gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 border-slate-300 text-slate-600 dark:border-white/20 dark:text-slate-300 dark:hover:bg-white/10"
                  onClick={() => setStep('check')}
                  disabled={sending}
                >
                  {t('Retour')}
                </Button>
                <Button
                  type="button"
                  className="min-h-11 bg-gradient-to-r from-red-600 to-orange-500 font-bold text-white hover:from-red-700 hover:to-orange-600"
                  onClick={confirm}
                  disabled={sending}
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  )}
                  {sending ? t('Envoi…') : t('Oui, je pars')}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// =============================================================
// v4.82 « ÉCRAN D'AU-REVOIR » (demande client — remplace l'écran de
// recueil d'avis v4.44) — après le départ confirmé (immédiat OU
// définitif), la séquence EXACTE demandée :
//   1. le hub souhaite AU REVOIR à l'invité (départ enregistré) ;
//   2. l'ÉTAT DES LIEUX DE DÉPART s'affiche en priorité tant qu'il
//      n'est pas signé (bouton → dialog de signature) ;
//   3. une fois l'état des lieux signé, le module « Vous avez aimé
//      votre séjour ? » (avis) prend le relais AVANT le verrouillage ;
//   4. un COMPTE À REBOURS 5:00 court en permanence (rouge pulsant à
//      moins d'une minute) : à zéro, le hub se verrouille.
// =============================================================
function FarewellScreen({
  slug,
  propertyName,
  reviewUrl,
  waHref,
  checkoutDone,
  feedbackDone,
  stayOver,
  remainingMs,
  onOpenInspection,
  onFeedbackSent,
  onBack,
}: {
  slug: string;
  propertyName: string;
  reviewUrl?: string | null;
  waHref: string | null;
  /** État des lieux de départ déjà signé (localStorage OU sync serveur). */
  checkoutDone: boolean;
  /** Avis déjà envoyé (ce séjour). */
  feedbackDone: boolean;
  /** Séjour terminé → l'état des lieux n'est plus exigé, l'avis s'affiche. */
  stayOver: boolean;
  /** Millisecondes restantes avant verrouillage (null → bloc masqué). */
  remainingMs: number | null;
  /** Ouvre le dialog de signature de l'état des lieux. */
  onOpenInspection: () => void;
  /** Avis privé envoyé → mémorisé par le parent (clé séjour). */
  onFeedbackSent: () => void;
  onBack: () => void;
}) {
  const { t } = useHubLang();
  const urgent = remainingMs != null && remainingMs <= 60_000;
  return (
    <section
      aria-label={t('Au revoir')}
      className="mx-auto w-full max-w-lg px-4 pb-16 pt-6 sm:pt-10"
    >
      {/* 1 — AU-REVOIR */}
      <div className="overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-600 via-teal-500 to-emerald-500 p-[1.5px] shadow-[0_18px_44px_-20px_rgba(5,150,105,0.55)]">
        <div className="rounded-[22px] bg-white/95 p-6 text-center dark:bg-slate-900/95">
          <p className="text-5xl" aria-hidden="true">
            👋
          </p>
          <h1 className="display-title font-serif! mt-3 text-2xl font-bold text-slate-900 dark:text-white">
            {t('Au revoir et merci !')}
          </h1>
          <p className="mt-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
            ✅ {t('Votre départ a été enregistré — l’équipe de ménage a été alertée.')}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {propertyName} {t('— bonne route et à très bientôt ! 💙')}
          </p>
        </div>
      </div>

      {/* 4 — COMPTE À REBOURS DE VERROUILLAGE (5:00) */}
      {remainingMs != null && remainingMs > 0 ? (
        <div
          role="timer"
          aria-live="polite"
          aria-label={`${t('Verrouillage du hub dans')} ${farewellClockMs(remainingMs)}`}
          className={cn(
            'mt-4 rounded-3xl border p-4 text-center shadow-sm',
            urgent
              ? 'animate-pulse border-red-300 bg-red-50 dark:border-red-500/50 dark:bg-red-950/40'
              : 'border-amber-200 bg-amber-50/70 dark:border-amber-500/40 dark:bg-amber-950/30',
          )}
        >
          <p
            className={cn(
              'text-[11px] font-bold uppercase tracking-[0.2em]',
              urgent ? 'text-red-600 dark:text-red-300' : 'text-amber-700 dark:text-amber-300',
            )}
          >
            🔒 {t('Verrouillage du hub')}
          </p>
          <p
            className={cn(
              'mt-1 text-4xl font-black tabular-nums',
              urgent ? 'text-red-600 dark:text-red-300' : 'text-slate-900 dark:text-white',
            )}
          >
            {farewellClockMs(remainingMs)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {t('Le hub se verrouillera automatiquement à la fin du compte à rebours.')}
          </p>
        </div>
      ) : null}

      {/* 2 — ÉTAT DES LIEUX : dernière étape tant qu'il n'est pas signé */}
      {!checkoutDone && !stayOver ? (
        <div className="mt-4 overflow-hidden rounded-3xl bg-gradient-to-r from-amber-500 via-orange-400 to-rose-500 p-[1.5px] shadow-[0_18px_44px_-20px_rgba(217,119,6,0.5)]">
          <div className="rounded-[22px] bg-white/95 p-5 dark:bg-slate-900/95">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-600 dark:text-amber-400">
              🚪 {t('Dernière étape avant de partir')}
            </p>
            <p className="display-title font-serif! mt-1 text-xl font-bold text-slate-900 dark:text-white">
              {t('Signez l’état des lieux de départ')}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {t('Minibar, pièces, signature — le PDF est envoyé à vous et à votre hôte.')}
            </p>
            <Button
              type="button"
              className="mt-3 min-h-12 w-full whitespace-normal bg-gradient-to-r from-amber-500 to-orange-500 py-3 text-center text-sm font-bold text-white shadow-md transition-transform hover:scale-[1.01] hover:from-amber-600 hover:to-orange-600 active:scale-[0.99]"
              onClick={onOpenInspection}
            >
              ✍️ {t('Signer l’état des lieux')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-500/40 dark:bg-emerald-950/40">
          <span aria-hidden="true" className="text-2xl">
            📄
          </span>
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
            {t('État des lieux signé — le PDF vous a été envoyé par email.')}
          </p>
        </div>
      )}

      {/* 3 — AVIS : une fois l'état des lieux signé, AVANT le verrouillage */}
      {checkoutDone || stayOver ? (
        <div className="mt-4 overflow-hidden rounded-3xl bg-gradient-to-r from-amber-500 via-orange-400 to-emerald-500 p-[1.5px] shadow-[0_18px_44px_-20px_rgba(217,119,6,0.5)]">
          <div className="rounded-[22px] bg-white/95 p-5 dark:bg-slate-900/95">
            {feedbackDone ? (
              <p className="py-2 text-center text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                ⭐ {t('Merci pour votre retour — il a été transmis à votre hôte.')}
              </p>
            ) : (
              <>
                <p className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-amber-600 dark:text-amber-400">
                  ⭐ {t('Le mot de la fin')}
                </p>
                <p className="display-title font-serif! mt-1 text-center text-xl font-bold text-slate-900 dark:text-white">
                  {t('Vous avez aimé votre séjour ?')}
                </p>
                <p className="mt-1 text-center text-xs text-slate-500 dark:text-slate-400">
                  {t('5 étoiles = partagez sur Airbnb — moins = dites-le nous en privé.')}
                </p>
                <div className="mt-4">
                  <StarReviewFlow
                    slug={slug}
                    reviewUrl={reviewUrl}
                    waHref={waHref}
                    propertyName={propertyName}
                    big
                    onSent={onFeedbackSent}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      <Button
        type="button"
        variant="outline"
        className="mt-5 min-h-11 w-full border-slate-300 text-slate-600 dark:border-white/20 dark:text-slate-300 dark:hover:bg-white/10"
        onClick={onBack}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        {t('Retour à l’accueil du hub')}
      </Button>
    </section>
  );
}

// =============================================================
// v4.44 « MINIBAR NUMÉRIQUE » (Honesty Bar) — demande client :
// « Les hôtels ont des minibars, apportez ce concept aux Airbnb.
// L'hôte laisse à disposition des snacks, du vin, des bières locales
// ou même des câbles de recharge neufs. Le voyageur coche ce qu'il
// a consommé et paie instantanément via Stripe ou Apple Pay. »
// Panier local (+/-) → POST /minibar (prix RECALCULÉS serveur) →
// Stripe Checkout (Apple Pay inclus) si configuré, sinon « à régler
// sur place » avec notification hôte.
// =============================================================
/** v4.47 — Visuel d'un article du minibar : VRAIE photo produit si
 *  l'hôte en a uploadé une, sinon l'emoji de secours (jamais de casse :
 *  onError de l'image → repli emoji automatique). */
function MinibarItemVisual({ item }: { item: GuestMinibarItem }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  if (item.photo && !photoFailed) {
    return (
       
      <img
        src={item.photo}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setPhotoFailed(true)}
        className="h-11 w-11 shrink-0 rounded-xl border border-slate-200 object-cover dark:border-white/10"
      />
    );
  }
  return (
    <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-2xl leading-none dark:border-white/10 dark:bg-white/5">
      {item.emoji}
    </span>
  );
}

function MinibarDialog({
  open,
  onOpenChange,
  slug,
  items,
  extra,
  onSessionExpired,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  slug: string;
  items: GuestMinibarItem[];
  /** v4.50 « MINIBAR DE CONFIANCE » — état du séjour. */
  extra?: HubPayload['guest']['minibarExtra'];
  onSessionExpired?: () => void;
}) {
  const { t } = useHubLang();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  // v4.50 — mode de règlement : « Payer maintenant » (CB/Apple Pay via
  // Stripe, sinon à régler sur place) ou « Facturer au départ » (ajouté
  // à la facture de fin de séjour, réglable avec l'hôte).
  const [payMode, setPayMode] = useState<'now' | 'departure'>('now');
  // v4.50 — validation d'inventaire d'arrivée (1 clic) + recharge frigo.
  const [checkedAt, setCheckedAt] = useState<string | null>(extra?.checkedAt ?? null);
  const [checking, setChecking] = useState(false);
  const [restockState, setRestockState] = useState<'idle' | 'requested' | 'pending'>(
    extra?.restockPending ? 'pending' : 'idle',
  );
  const [restockBusy, setRestockBusy] = useState(false);

  // Prix EFFECTIF : un article OFFERT (pack de bienvenue) coûte 0 €.
  const effectivePrice = (i: GuestMinibarItem) => (i.free ? 0 : i.price);
  const total = items.reduce((acc, i) => acc + (qty[i.id] ?? 0) * effectivePrice(i), 0);
  const count = items.reduce((acc, i) => acc + (qty[i.id] ?? 0), 0);
  const hasFree = items.some((i) => i.free);

  const setItemQty = (id: string, q: number) =>
    setQty((prev) => ({ ...prev, [id]: Math.min(9, Math.max(0, q)) }));

  const submit = async () => {
    const list = items
      .filter((i) => (qty[i.id] ?? 0) > 0)
      .map((i) => ({ id: i.id, qty: qty[i.id] }));
    if (list.length === 0) {
      toast.error(t('Cochez au moins un article.'));
      return;
    }
    setSending(true);
    try {
      const res = await hubFetch(slug, `/api/public/hub/${encodeURIComponent(slug)}/minibar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: list, payment: payMode }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string; message?: string; url?: string;
      };
      if (!res.ok) throw new Error(data.error || 'http');
      // Paiement instantané : Stripe Checkout (Apple Pay inclus).
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setDone(data.message || t('Merci d’avoir tout déclaré !'));
      setQty({});
    } catch (e) {
      if (e instanceof HubSessionExpiredError) {
        onSessionExpired?.();
        return;
      }
      const detail = e instanceof Error && !e.message.startsWith('http') ? e.message : null;
      toast.error(detail || t('Commande impossible. Réessayez dans un instant.'));
    } finally {
      setSending(false);
    }
  };

  /** v4.50 — « J'ai vérifié le minibar, tout est là » : validation de
   *  l'inventaire d'arrivée en UN clic (photo de référence + liste). */
  const validateInventory = async () => {
    if (checking || checkedAt) return;
    setChecking(true);
    try {
      const res = await hubFetch(slug, `/api/public/hub/${encodeURIComponent(slug)}/minibar-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string; checkedAt?: string; message?: string;
      };
      if (!res.ok) throw new Error(data.error || 'http');
      setCheckedAt(data.checkedAt ?? new Date().toISOString());
      toast.success(data.message || t('Inventaire validé — merci !'));
    } catch (e) {
      if (e instanceof HubSessionExpiredError) {
        onSessionExpired?.();
        return;
      }
      const detail = e instanceof Error && e.message !== 'http' ? e.message : null;
      toast.error(detail || t('Validation impossible. Réessayez dans un instant.'));
    } finally {
      setChecking(false);
    }
  };

  /** v4.50 — « Recharger le frigo » en 1 clic : réapprovisionnement
   *  automatique pour le lendemain matin par l'équipe d'entretien. */
  const requestRestock = async () => {
    if (restockBusy || restockState !== 'idle') return;
    setRestockBusy(true);
    try {
      const res = await hubFetch(slug, `/api/public/hub/${encodeURIComponent(slug)}/minibar-restock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) throw new Error(data.error || 'http');
      setRestockState('requested');
      toast.success(data.message || t('Recharge demandée — votre minibar sera rechargé demain matin.'));
    } catch (e) {
      if (e instanceof HubSessionExpiredError) {
        onSessionExpired?.();
        return;
      }
      const detail = e instanceof Error && e.message !== 'http' ? e.message : null;
      toast.error(detail || t('Demande impossible. Réessayez dans un instant.'));
    } finally {
      setRestockBusy(false);
    }
  };

  return (
    <TileDialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setTimeout(() => setDone(null), 300);
      }}
      emoji="🍷"
      tone="red"
      title={t('Minibar')}
      subtitle={t('Honesty Bar — système de confiance')}
    >
      {done ? (
        <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">✅ {done}</p>
      ) : (
        <>
          {/* ── v4.50 SYSTÈME DE CONFIANCE — inventaire d'arrivée ──
              Photo du minibar rempli (prise par l'hôte) + validation en
              1 clic à l'entrée. Protège l'hôte ET l'invité. */}
          {!checkedAt ? (
            <div className="rounded-2xl border border-amber-200/80 bg-amber-50/70 p-3.5 dark:border-amber-500/25 dark:bg-amber-500/10">
              <p className="text-sm font-bold text-amber-800 dark:text-amber-200">
                📸 {t('Inventaire d’arrivée')}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-amber-800/90 dark:text-amber-200/85">
                {t('Comparez le minibar avec cette photo de référence, puis validez le contenu en un clic.')}
              </p>
              {extra?.arrivalPhoto ? (
                <img
                  src={extra.arrivalPhoto}
                  alt={t('Minibar rempli à votre arrivée')}
                  className="mt-2.5 max-h-52 w-full rounded-xl border border-amber-200/70 object-cover dark:border-amber-500/20"
                />
              ) : null}
              <Button
                type="button"
                disabled={checking}
                onClick={() => void validateInventory()}
                className="mt-2.5 h-auto min-h-11 w-full bg-amber-500 py-2.5 text-sm font-bold text-white hover:bg-amber-600"
              >
                {checking ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="h-4 w-4" aria-hidden="true" />
                )}
                {t('✔️ J’ai vérifié le minibar, tout est là')}
              </Button>
            </div>
          ) : (
            <p className="rounded-2xl border border-emerald-200/80 bg-emerald-50/70 px-3.5 py-2.5 text-xs font-semibold text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300">
              ✅ {t('Inventaire validé le')}{' '}
              {new Date(checkedAt).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </p>
          )}

          {/* Pack de bienvenue — mise en avant de l'article offert */}
          {hasFree ? (
            <p className="mt-3 rounded-2xl bg-gradient-to-r from-amber-100 to-orange-100 px-3.5 py-2.5 text-xs font-bold text-amber-800 dark:from-amber-500/15 dark:to-orange-500/15 dark:text-amber-200">
              🎁 {t('Offert par votre hôte : les articles marqués « Offert » sont gratuits — goûtez, c’est pour vous !')}
            </p>
          ) : null}

          <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            {t('Tout est en libre-service : cochez ce que vous avez pris — réglez maintenant ou à votre départ.')}
          </p>
          <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
            {items.map((item) => {
              const q = qty[item.id] ?? 0;
              return (
                <div
                  key={item.id}
                  className={cn(
                    // v4.68 — lignes sélectionnées mises en évidence (pastel
                    // bleu marque + anneau) pour rendre les steppers évidents.
                    'flex items-center gap-3 rounded-2xl border p-2.5 transition-colors',
                    q > 0
                      ? 'border-[#055492]/40 bg-[#dceaf5]/70 ring-1 ring-[#055492]/20 dark:border-[#055492]/50 dark:bg-[#055492]/15'
                      : 'border-slate-200 dark:border-white/10',
                  )}
                >
                  <MinibarItemVisual item={item} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                      {item.name}
                      {item.free ? (
                        <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 align-middle text-[9px] font-bold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                          🎁 OFFERT
                        </span>
                      ) : null}
                      {q > 0 ? (
                        <span className="ml-1.5 rounded-full bg-[#055492] px-1.5 py-0.5 align-middle text-[9px] font-bold text-white">
                          ×{q}
                        </span>
                      ) : null}
                    </p>
                    <p className={cn('text-xs', item.free ? 'font-bold text-amber-600 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400')}>
                      {item.free ? t('Offert par votre hôte') : formatEur(item.price)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      aria-label={`${t('Retirer')} ${item.name}`}
                      onClick={() => setItemQty(item.id, q - 1)}
                      disabled={q === 0}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40 dark:border-white/20 dark:text-slate-300 dark:hover:bg-white/10"
                    >
                      <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <span className="w-5 text-center text-sm font-bold tabular-nums text-slate-900 dark:text-white">
                      {q}
                    </span>
                    <button
                      type="button"
                      aria-label={`${t('Ajouter')} ${item.name}`}
                      onClick={() => setItemQty(item.id, q + 1)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 text-slate-600 transition-colors hover:bg-slate-100 dark:border-white/20 dark:text-slate-300 dark:hover:bg-white/10"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* v4.50 — choix du règlement : Payer maintenant / Facturer au départ */}
          <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('Mode de règlement')}>
            {(
              [
                { value: 'now' as const, emoji: '💳', label: t('Payer maintenant'), hint: t('CB / Apple Pay / sur place') },
                { value: 'departure' as const, emoji: '🏨', label: t('Facturer au départ'), hint: t('ajouté à la facture de fin de séjour') },
              ]
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={payMode === opt.value}
                onClick={() => setPayMode(opt.value)}
                className={cn(
                  'rounded-2xl border-2 px-3 py-2.5 text-left transition-all',
                  payMode === opt.value
                    ? 'border-slate-900 bg-slate-900/5 dark:border-white dark:bg-white/10'
                    : 'border-slate-200 opacity-70 hover:opacity-100 dark:border-white/15',
                )}
              >
                <p className="text-xs font-bold text-slate-900 dark:text-white">
                  {opt.emoji} {opt.label}
                </p>
                <p className="mt-0.5 text-[10px] leading-snug text-slate-500 dark:text-slate-400">{opt.hint}</p>
              </button>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 dark:bg-white/5">
            <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">
              {count > 0
                ? t(`${count} article${count > 1 ? 's' : ''} sélectionné${count > 1 ? 's' : ''}`)
                : t('Aucun article sélectionné')}
            </span>
            <span className="display-title text-lg font-bold text-slate-900 dark:text-white">
              {formatEur(total)}
            </span>
          </div>
          {/* v4.68 — CTA de validation TOUJOURS visible et libellé pareil :
              « Valider ma commande » (bleu marque). Quand aucun article
              n'est sélectionné, il reste désactivé avec une ligne d'aide
              explicite — plus jamais de libellé différent qui cachait le
              bouton au client. */}
          <Button
            type="button"
            className="mt-3 h-auto min-h-12 w-full whitespace-normal bg-[#055492] py-3 text-center text-sm font-bold text-white hover:bg-[#04467a] disabled:cursor-not-allowed disabled:opacity-60"
            onClick={submit}
            disabled={sending || count === 0}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="h-4 w-4" aria-hidden="true" />
            )}
            {t('Valider ma commande')}
            {count > 0 ? ` · ${formatEur(total)}` : ''}
          </Button>
          <p className="mt-2 text-center text-[11px] text-slate-500 dark:text-slate-400">
            {count === 0
              ? t('Ajoutez un article avec + pour valider')
              : payMode === 'departure'
                ? t('Règlement avec votre hôte à la fin du séjour')
                : t('Paiement sécurisé (CB, Apple Pay) ou à régler sur place')}
          </p>

          {/* v4.50 — « Recharger le Frigo » (restock en 1 clic) */}
          <div className="mt-4 border-t border-slate-200/70 pt-3.5 dark:border-white/10">
            {restockState === 'idle' ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={restockBusy}
                  onClick={() => void requestRestock()}
                  className="h-auto min-h-11 w-full border-teal-300 bg-teal-50/60 py-2.5 text-sm font-bold text-teal-800 hover:bg-teal-100 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-200 dark:hover:bg-teal-500/20"
                >
                  {restockBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <span aria-hidden="true">🧊</span>
                  )}
                  {t('Recharger le frigo — pour demain matin')}
                </Button>
                <p className="mt-1.5 text-center text-[11px] text-slate-500 dark:text-slate-400">
                  {t('Vous avez consommé l’essentiel ? L’équipe d’entretien réapprovisionnera le minibar demain matin.')}
                </p>
              </>
            ) : (
              <p className="rounded-2xl bg-teal-50/80 px-3.5 py-2.5 text-center text-xs font-semibold text-teal-700 dark:bg-teal-500/10 dark:text-teal-300">
                ✅ {t('Recharge demandée — votre minibar sera rechargé demain matin.')}
              </p>
            )}
          </div>
        </>
      )}
    </TileDialog>
  );
}

// =============================================================
// v4.50 « ONGLET CHECK-IN / CHECK-OUT » — carte « Votre séjour »
// Réunies au même endroit : dates d'arrivée et de départ (heure
// exacte), prolongement de séjour validé (départ tardif), produits
// consommés dans le minibar (persistés par séjour), totaux à régler
// / payés et statut de la recharge minibar. Le hub protégé affiche
// aussi l'heure de verrouillage automatique.
// =============================================================
function StayInfoCard({ payload }: { payload: HubPayload }) {
  const { t } = useHubLang();
  const { stay, hubLock } = payload;
  const extra = payload.guest.minibarExtra ?? null;
  const [open, setOpen] = useState(false);
  const checkIn = stay?.checkIn ? new Date(stay.checkIn) : null;
  const endAt = stay?.endAt ? new Date(stay.endAt) : null;
  const lateUntil = stay?.lateCheckOutUntil ? new Date(stay.lateCheckOutUntil) : null;
  const fmtDay = (d: Date) =>
    d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  const hasStay = !!checkIn && !!endAt;
  if (!hasStay) return null;
  const consumed = extra?.consumed ?? [];
  const hasMinibarInfo = consumed.length > 0 || (extra?.totalOpenEur ?? 0) > 0 || (extra?.totalPaidEur ?? 0) > 0;

  return (
    <div id="hub-card-stay" className="flex h-full flex-col">
      {/* v4.71 « TUILE CLIQUABLE CHECK-IN / CHECK-OUT » — demande client :
          les infos ne s'affichent plus à plat ; une tuile illustrée (même
          anatomie que les autres modules, photo premium) ouvre le détail
          du séjour en dialog. */}
      <ModuleCard
        emoji="📆"
        tone="teal"
        eyebrow="Check-in / Check-out"
        title="Votre séjour"
        subtitle="Dates d'arrivée et de départ, consommations du minibar"
        imageUrl={HUB_VISUALS.stay}
        onClick={() => setOpen(true)}
      >
        <span className="flex flex-wrap gap-1.5">
          <PreviewChip>📥 {fmtDay(checkIn!)}</PreviewChip>
          <PreviewChip>📤 {fmtDay(endAt!)}</PreviewChip>
          {lateUntil ? <PreviewChip>⏱️ {t('Départ tardif')}</PreviewChip> : null}
          {hasMinibarInfo ? (
            <PreviewChip>
              🍷 {t('À régler')} {formatEur(extra?.totalOpenEur ?? 0)}
            </PreviewChip>
          ) : null}
        </span>
      </ModuleCard>
      <TileDialog
        open={open}
        onOpenChange={setOpen}
        emoji="📆"
        tone="teal"
        title="Votre séjour"
        subtitle="Check-in / Check-out"
      >
        <div className="space-y-2.5">
          {/* Arrivée */}
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-200/70 bg-emerald-50/60 px-3.5 py-2.5 dark:border-emerald-500/25 dark:bg-emerald-500/10">
            <span aria-hidden="true" className="text-xl">📥</span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700 dark:text-emerald-300">
                {t('Arrivée')}
              </p>
              <p className="truncate text-sm font-bold capitalize text-slate-900 dark:text-white">
                {fmtDay(checkIn!)}
              </p>
            </div>
          </div>
          {/* Départ */}
          <div className="flex items-center gap-3 rounded-2xl border border-rose-200/70 bg-rose-50/60 px-3.5 py-2.5 dark:border-rose-500/25 dark:bg-rose-500/10">
            <span aria-hidden="true" className="text-xl">📤</span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-rose-700 dark:text-rose-300">
                {t('Départ')}
              </p>
              <p className="truncate text-sm font-bold capitalize text-slate-900 dark:text-white">
                {fmtDay(endAt!)} ·{' '}
                {endAt!.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
          {/* Prolongement de séjour validé */}
          {lateUntil ? (
            <div className="flex items-center gap-2 rounded-2xl border border-amber-200/70 bg-amber-50/70 px-3.5 py-2.5 dark:border-amber-500/25 dark:bg-amber-500/10">
              <span aria-hidden="true" className="text-lg">⏱️</span>
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                {t('Séjour prolongé — départ tardif validé jusqu’à')}{' '}
                <span className="font-bold tabular-nums">
                  {lateUntil.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </p>
            </div>
          ) : null}
          {/* Verrouillage automatique (hub protégé) */}
          {hubLock?.enabled ? (
            <p className="rounded-2xl bg-slate-100/80 px-3.5 py-2 text-[11px] font-medium text-slate-500 dark:bg-white/5 dark:text-slate-400">
              🔒 {t('Le hub se verrouille automatiquement à la fin de votre séjour.')}
            </p>
          ) : null}
        </div>

        {/* Minibar : produits consommés + totaux */}
        {hasMinibarInfo ? (
          <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-white/10 dark:bg-white/5">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">
              🍷 {t('Minibar consommé')}
            </p>
            <ul className="mt-2 space-y-1.5">
              {consumed.slice(0, 6).map((c) => (
                <li key={c.name} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">
                    {c.emoji} {c.name} <span className="text-slate-400">×{c.qty}</span>
                    {c.free ? (
                      <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                        🎁 {t('Offert')}
                      </span>
                    ) : null}
                  </span>
                  <span className={cn('shrink-0 text-xs font-bold tabular-nums', c.free ? 'text-amber-600 dark:text-amber-300' : 'text-slate-900 dark:text-white')}>
                    {c.free ? t('Offert') : formatEur(c.lineTotal)}
                  </span>
                </li>
              ))}
              {consumed.length > 6 && (
                <li className="text-[11px] text-slate-400">+ {consumed.length - 6} autres articles…</li>
              )}
            </ul>
            <div className="mt-2.5 flex items-center justify-between border-t border-slate-200/80 pt-2.5 text-xs font-semibold dark:border-white/10">
              <span className="text-slate-500 dark:text-slate-400">{t('À régler')}</span>
              <span className="tabular-nums text-slate-900 dark:text-white">
                {formatEur(extra?.totalOpenEur ?? 0)}
              </span>
            </div>
            {(extra?.totalPaidEur ?? 0) > 0 && (
              <div className="mt-1 flex items-center justify-between text-xs font-semibold">
                <span className="text-slate-500 dark:text-slate-400">{t('Déjà réglé')}</span>
                <span className="tabular-nums text-emerald-600 dark:text-emerald-400">
                  {formatEur(extra!.totalPaidEur)}
                </span>
              </div>
            )}
          </div>
        ) : null}

        {/* Recharge minibar demandée */}
        {extra?.restockPending ? (
          <p className="mt-3 rounded-2xl bg-teal-50/80 px-3.5 py-2 text-[11px] font-semibold text-teal-700 dark:bg-teal-500/10 dark:text-teal-300">
            🧊 {t('Recharge du minibar demandée — prévue demain matin.')}
          </p>
        ) : null}
      </TileDialog>
    </div>
  );
}

function MinibarCard({
  slug,
  items,
  photoOverride,
  urgentLabel,
  extra,
  onSessionExpired,
}: {
  slug: string;
  items: GuestMinibarItem[];
  photoOverride?: string | null;
  urgentLabel?: string;
  /** v4.50 « MINIBAR DE CONFIANCE » — état du séjour (inventaire, recharge). */
  extra?: HubPayload['guest']['minibarExtra'];
  onSessionExpired?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const hasFree = items.some((i) => i.free);
  const checked = !!extra?.checkedAt || !!extra?.consumed.length;
  return (
    <>
      <ModuleCard
        emoji="🍷"
        tone="red"
        eyebrow="Honesty Bar"
        title="Minibar"
        subtitle="Validez l'inventaire, déclarez vos consommations"
        imageUrl={photoOverride ?? HUB_VISUALS.minibar}
        onClick={() => setOpen(true)}
        urgentLabel={urgentLabel}
      >
        <span className="flex flex-wrap gap-1.5">
          {hasFree ? <PreviewChip>🎁 Offerts</PreviewChip> : null}
          {extra?.checkedAt ? (
            <PreviewChip>✅ Inventaire validé</PreviewChip>
          ) : checked ? (
            <PreviewChip>🍷 {items.length} articles</PreviewChip>
          ) : (
            <PreviewChip>🍷 {items.length} articles</PreviewChip>
          )}
          {extra?.restockPending ? <PreviewChip>🧊 Recharge prévue</PreviewChip> : null}
        </span>
      </ModuleCard>
      <MinibarDialog
        open={open}
        onOpenChange={setOpen}
        slug={slug}
        items={items}
        extra={extra}
        onSessionExpired={onSessionExpired}
      />
    </>
  );
}

// =============================================================
// v4.74 « BOUTIQUE DE SOUVENIRS » — module hub invité (section
// « Pendant votre séjour ») : produits actifs de la boutique tenue
// par l'hôte, commande en 3 gestes (produit → quantité + livraison
// → envoi). L'hôte reçoit la notification (in-app + email). La tuile
// n'est rendue que si la boutique contient au moins un produit actif
// (count récupéré par GuestView). Image : photo de l'hôte > visuel.
// =============================================================
interface SouvenirLite {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  category: string;
}

const SOUVENIR_CATEGORY_EMOJI: Record<string, string> = {
  food: '🫙',
  wine: '🍷',
  craft: '🏺',
  other: '🎁',
};

function SouvenirsCard({
  slug,
  products,
  photoOverride,
  onSessionExpired,
}: {
  slug: string;
  products: SouvenirLite[];
  photoOverride?: string | null;
  onSessionExpired?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(products[0]?.id ?? '');
  const [qty, setQty] = useState(1);
  const [delivery, setDelivery] = useState<'in_lodging' | 'at_checkout'>('in_lodging');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  // Le produit sélectionné doit toujours exister dans la liste.
  useEffect(() => {
    if (products.length > 0 && !products.some((p) => p.id === selectedId)) {
      setSelectedId(products[0].id);
    }
  }, [products, selectedId]);

  const selected = products.find((p) => p.id === selectedId) ?? null;

  const submit = async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const res = await hubFetch(slug, `/api/public/hub/${encodeURIComponent(slug)}/souvenir-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: selected.id,
          quantity: qty,
          deliveryMode: delivery,
          ...(note.trim() ? { guestNote: note.trim() } : {}),
        }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        toast.error(json?.error || 'Commande impossible.');
        return;
      }
      setOpen(false);
      setQty(1);
      setNote('');
      toast.success(`🛍️ ${selected.name} — commande envoyée ! Votre hôte la prépare.`);
    } catch (err) {
      if (err instanceof HubSessionExpiredError) {
        onSessionExpired?.();
        return;
      }
      toast.error('Connexion impossible. Réessayez.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ModuleCard
        emoji="🛍️"
        tone="rose"
        eyebrow="Souvenirs & cadeaux"
        title="Boutique de souvenirs"
        subtitle="Rapportez un morceau de votre séjour — produits de la maison"
        imageUrl={photoOverride ?? HUB_VISUALS.souvenirs}
        onClick={() => setOpen(true)}
      >
        <span className="flex flex-wrap gap-1.5">
          <PreviewChip>🛍️ {products.length} produits</PreviewChip>
          <PreviewChip>🤲 Artisans locaux</PreviewChip>
        </span>
      </ModuleCard>
      <TileDialog
        open={open}
        onOpenChange={setOpen}
        emoji="🛍️"
        tone="rose"
        title="Boutique de souvenirs"
        subtitle="Commandez, votre hôte vous remet le colis"
      >
        <div className="flex flex-col gap-4">
          {/* ── Sélection du produit ── */}
          <div className="flex flex-col gap-2">
            {products.map((p) => {
              const active = p.id === selectedId;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  aria-pressed={active}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl border p-2.5 text-left transition-all',
                    active
                      ? 'border-rose-300 bg-rose-50/70 ring-2 ring-rose-200 dark:border-rose-400/40 dark:bg-rose-500/10 dark:ring-rose-400/20'
                      : 'border-slate-200 bg-white hover:border-rose-200 dark:border-white/10 dark:bg-white/5 dark:hover:border-rose-400/30',
                  )}
                >
                  {p.imageUrl ? (
                    <img
                      src={p.imageUrl}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded-xl object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-2xl dark:bg-rose-500/15"
                    >
                      {SOUVENIR_CATEGORY_EMOJI[p.category] ?? '🎁'}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-slate-900 dark:text-[#F5EFE6]">
                      {p.name}
                    </span>
                    {p.description ? (
                      <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-slate-500 dark:text-[#A89F91]">
                        {p.description}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 font-serif text-base font-bold text-slate-900 dark:text-[#F5EFE6]">
                    {p.price.toFixed(2).replace('.', ',')} €
                  </span>
                </button>
              );
            })}
          </div>

          {/* ── Quantité ── */}
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-slate-700 dark:text-[#DDD5C7]">Quantité</span>
            <span className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Diminuer la quantité"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-lg font-bold text-slate-700 transition-colors hover:bg-slate-50 dark:border-white/15 dark:text-[#F5EFE6] dark:hover:bg-white/10"
              >
                −
              </button>
              <span className="w-8 text-center font-serif text-lg font-bold tabular-nums text-slate-900 dark:text-[#F5EFE6]">
                {qty}
              </span>
              <button
                type="button"
                aria-label="Augmenter la quantité"
                onClick={() => setQty((q) => Math.min(10, q + 1))}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-lg font-bold text-slate-700 transition-colors hover:bg-slate-50 dark:border-white/15 dark:text-[#F5EFE6] dark:hover:bg-white/10"
              >
                +
              </button>
            </span>
          </div>

          {/* ── Mode de remise ── */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-slate-700 dark:text-[#DDD5C7]">Remise du colis</span>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { key: 'in_lodging', emoji: '🏡', label: 'Livré au logement' },
                  { key: 'at_checkout', emoji: '🧳', label: 'Au check-out' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  aria-pressed={delivery === opt.key}
                  onClick={() => setDelivery(opt.key)}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-2xl border px-3 py-3 text-xs font-bold transition-all',
                    delivery === opt.key
                      ? 'border-rose-300 bg-rose-50/70 text-rose-700 ring-2 ring-rose-200 dark:border-rose-400/40 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-rose-200 dark:border-white/10 dark:bg-white/5 dark:text-[#C9BFAE]',
                  )}
                >
                  <span aria-hidden="true" className="text-xl">{opt.emoji}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Note (optionnelle) ── */}
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Un mot pour votre hôte (emballage cadeau, allergies…)"
            rows={2}
            maxLength={300}
          />

          {/* ── Total + envoi ── */}
          <div className="sticky bottom-0 -mx-1 flex items-center justify-between gap-3 border-t border-slate-100 bg-white/95 px-1 pt-3 pb-1 dark:border-white/10 dark:bg-[#181410]/95">
            <span className="text-sm text-slate-500 dark:text-[#A89F91]">
              Total{' '}
              <strong className="font-serif text-lg text-slate-900 dark:text-[#F5EFE6]">
                {selected ? (selected.price * qty).toFixed(2).replace('.', ',') : '0,00'} €
              </strong>
            </span>
            <Button
              type="button"
              disabled={busy || !selected}
              onClick={() => void submit()}
              className="air-gradient rounded-full px-5 font-bold text-white shadow-md disabled:opacity-50"
            >
              {busy ? 'Envoi…' : 'Envoyer ma commande'}
            </Button>
          </div>
        </div>
      </TileDialog>
    </>
  );
}

// =============================================================
// « DEMANDES PARTICULIÈRES » (v5.x) — carte hub invité
//
// L'invité demande un équipement / service à l'hôte en 2 gestes :
// grille de sélection rapide avec emojis (lit d'appoint, lit bébé,
// siège bébé, chaise haute, serviettes, fer & table à repasser,
// ménage, autre) + quantité + note optionnelle → POST
// /api/public/hub/[slug]/special-requests (session hub via hubFetch).
// L'hôte reçoit une notification unifiée (cloche + email + push) et
// suit le traitement depuis son dashboard (onglet Ménage & stock).
// En bas de carte : la liste des demandes existantes avec badges de
// statut — synchronisée au montage ET après chaque envoi.
// =============================================================

interface SpecialRequestLite {
  id: string;
  itemType: string;
  quantity: number;
  note: string | null;
  status: string;
  requestedAt: string;
}

function SpecialRequestsCard({
  slug,
  guestName,
  onSessionExpired,
}: {
  slug: string;
  guestName?: string | null;
  onSessionExpired?: () => void;
}) {
  const { t } = useHubLang();
  const [itemType, setItemType] = useState<string>(SPECIAL_REQUEST_ITEMS[0].id);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  // Sync serveur au montage : skeletons tant que la première réponse
  // n'est pas arrivée (pattern CheckOutInspectionCard).
  const [syncing, setSyncing] = useState(true);
  const [requests, setRequests] = useState<SpecialRequestLite[] | null>(null);

  const load = useCallback(async () => {
    const res = await hubFetch(slug, `/api/public/hub/${encodeURIComponent(slug)}/special-requests`);
    if (!res.ok) {
      setRequests(null);
      return;
    }
    const json = (await res.json().catch(() => null)) as { requests?: SpecialRequestLite[] } | null;
    setRequests(Array.isArray(json?.requests) ? json.requests : []);
  }, [slug]);

  useEffect(() => {
    let alive = true;
    load()
      .catch(() => {
        if (alive) setRequests(null);
      })
      .finally(() => {
        if (alive) setSyncing(false);
      });
    return () => {
      alive = false;
    };
  }, [load]);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await hubFetch(slug, `/api/public/hub/${encodeURIComponent(slug)}/special-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemType,
          quantity,
          ...(note.trim() ? { note: note.trim() } : {}),
          ...(guestName ? { guestName } : {}),
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        message?: string;
      } | null;
      if (!res.ok || !json?.ok) {
        toast.error(json?.error || t('Demande impossible. Réessayez dans un instant.'));
        return;
      }
      toast.success(json.message || t('Demande envoyée — votre hôte revient vers vous ✨'));
      setNote('');
      setQuantity(1);
      // Rechargement des données après envoi (statut « En attente »
      // immédiatement visible dans la liste).
      await load().catch(() => undefined);
    } catch (err) {
      if (err instanceof HubSessionExpiredError) {
        onSessionExpired?.();
        toast.error(err.message);
        return;
      }
      toast.error(t('Connexion impossible. Vérifiez votre connexion.'));
    } finally {
      setBusy(false);
    }
  };

  const list = requests ?? [];

  return (
    <article
      aria-label={t('Demandes particulières')}
      className="flex h-full min-w-0 flex-col overflow-hidden rounded-3xl border border-teal-200/70 bg-card shadow-sm transition-shadow hover:shadow-md dark:border-teal-500/20"
    >
      {/* En-tête dégradé — même langage visuel que les cartes du hub */}
      <div className="relative overflow-hidden bg-gradient-to-br from-teal-500 via-emerald-500 to-green-600 px-5 pb-7 pt-5 text-white">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-8 -top-10 text-[7rem] leading-none opacity-20 select-none"
        >
          🛎️
        </div>
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/80">
          {t('Conciergerie')}
        </p>
        <h3 className="mt-1 text-lg font-black leading-tight">{t('Demandes particulières')}</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-white/85">
          {t("Lit d'appoint, lit bébé, siège bébé… — demandez, votre hôte s'occupe du reste.")}
        </p>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-4 p-4">
        {/* ── Sélection rapide (grille emojis) ── */}
        <div
          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
          role="radiogroup"
          aria-label={t('Que souhaitez-vous ?')}
        >
          {SPECIAL_REQUEST_ITEMS.map((item) => {
            const active = itemType === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setItemType(item.id)}
                className={cn(
                  'flex min-h-[72px] cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 px-2 py-2.5 text-center transition-all duration-200',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2',
                  active
                    ? 'border-emerald-400 bg-gradient-to-b from-emerald-50 to-white shadow-lg shadow-emerald-500/20 scale-[1.02] dark:border-emerald-400/60 dark:from-emerald-500/15 dark:to-transparent'
                    : 'border-border bg-secondary/50 opacity-80 hover:border-emerald-200 hover:opacity-100 dark:border-white/10 dark:bg-white/5 dark:hover:border-emerald-400/30',
                )}
              >
                <span aria-hidden="true" className="text-2xl leading-none">
                  {item.emoji}
                </span>
                <span
                  className={cn(
                    'text-[11px] font-bold leading-tight',
                    active
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-muted-foreground',
                  )}
                >
                  {t(item.label)}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Quantité ── */}
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-card-foreground">{t('Quantité')}</span>
          <span className="flex items-center gap-2">
            <button
              type="button"
              aria-label={t('Diminuer la quantité')}
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-lg font-bold text-card-foreground transition-colors hover:bg-secondary"
            >
              −
            </button>
            <span className="w-8 text-center text-base font-bold tabular-nums text-card-foreground" aria-live="polite">
              {quantity}
            </span>
            <button
              type="button"
              aria-label={t('Augmenter la quantité')}
              onClick={() => setQuantity((q) => Math.min(20, q + 1))}
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-lg font-bold text-card-foreground transition-colors hover:bg-secondary"
            >
              +
            </button>
          </span>
        </div>

        {/* ── Note optionnelle ── */}
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('Un mot pour votre hôte (heures souhaitées, précisions…) — optionnel')}
          rows={2}
          maxLength={300}
          aria-label={t('Note optionnelle')}
        />

        {/* ── Envoi ── */}
        <Button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="h-12 w-full rounded-xl bg-emerald-500 text-sm font-bold text-white shadow hover:bg-emerald-600"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : '🛎️'}
          {busy ? t('Envoi en cours…') : t('Envoyer la demande')}
        </Button>

        {/* ── Vos demandes (sync montage + après envoi) ── */}
        <div className="mt-1 border-t border-border pt-3" aria-label={t('Vos demandes')}>
          <p className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            <span>{t('Vos demandes')}</span>
            {syncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : null}
          </p>

          {syncing && requests === null ? (
            <div className="mt-2 space-y-2" aria-hidden="true">
              <Skeleton className="h-14 w-full rounded-2xl bg-secondary/60" />
              <Skeleton className="h-14 w-full rounded-2xl bg-secondary/60" />
            </div>
          ) : list.length === 0 ? (
            <p className="mt-2 rounded-2xl border border-dashed border-border bg-secondary/40 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
              {t('Aucune demande pour le moment — sélectionnez un article ci-dessus ✨')}
            </p>
          ) : (
            <ul className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-0.5 sm:max-h-64">
              {list.map((r) => {
                const item = specialRequestItemMeta(r.itemType);
                const statusMeta = specialRequestStatusMeta(r.status);
                return (
                  <motion.li
                    key={r.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                    className="flex items-start gap-3 rounded-2xl border border-border bg-secondary/40 px-3.5 py-2.5"
                  >
                    <span aria-hidden="true" className="text-xl leading-none">
                      {item.emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-sm font-bold text-card-foreground">
                          {t(item.label)}
                          {r.quantity > 1 ? (
                            <span className="ml-1 font-semibold text-muted-foreground">×{r.quantity}</span>
                          ) : null}
                        </span>
                        <span
                          className={cn(
                            'inline-block rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide',
                            statusMeta.className,
                          )}
                        >
                          {t(statusMeta.label)}
                        </span>
                      </span>
                      {r.note ? (
                        <span className="mt-0.5 block break-words text-xs leading-snug text-muted-foreground">
                          « {r.note.slice(0, 160)} »
                        </span>
                      ) : null}
                      <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                        {new Date(r.requestedAt).toLocaleString(undefined, {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </span>
                  </motion.li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </article>
  );
}

function GuestView({
  payload,
  slug,
  onBack,
  copy,
  theme,
  onToggleTheme,
  // v4.50 « VERROUILLAGE DU HUB PAR CODE » — session + compte à rebours.
  session,
  sessionEndAt,
  onSessionExpired,
}: {
  payload: HubPayload;
  slug: string;
  onBack: () => void;
  copy: (text: string, label: string) => Promise<void>;
  /** Thème du hub (« light » par défaut, mémorisé par visiteur). */
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  /** v4.50 — session hub active (token) ; null si hub non verrouillé. */
  session: HubAccessSessionClient | null;
  /** v4.50 — fin de séjour EFFECTIVE (ISO) : session du voyageur
   *  d'abord (v5.7), sinon séjour courant du payload. */
  sessionEndAt: string | null;
  /** v4.50 — déclenché sur expiration client OU 403 serveur : le hub
   *  bascule immédiatement sur l'écran de saisie du code. */
  onSessionExpired: () => void;
}) {
  const [contactOpen, setContactOpen] = useState(false);
  // v4.49 « RETOUR À LA MAISON » — écran explicatif avant ouverture du GPS
  // (demande client : expliquer le module PUIS « cliquez pour rentrer »).
  const [homeGuideOpen, setHomeGuideOpen] = useState(false);
  // Modules premium (dialogs vidéo / bouclier d'avis).
  const [videoOpen, setVideoOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  // v4.52 « LIVRE D'OR VIVANT » — galerie plein écran des souvenirs.
  const [memoriesOpen, setMemoriesOpen] = useState(false);
  // v4.68 « MESSAGES DE L'HÔTE » — onglet regroupant TOUT ce que l'hôte
  // a envoyé à l'invité (réponses vocales, annonces du hub, voix du
  // guidebook, réponses aux souvenirs). L'agrégation n'utilise QUE des
  // données publiques déjà disponibles (voice-replies + payload).
  const [messagesOpen, setMessagesOpen] = useState(false);
  // v4.69 « NOTIFICATIONS COMMANDES » (PHASE 4) — flux de statuts des
  // commandes récentes (room service / minibar / pressing) servi par
  // /api/public/hub/[slug]/order-updates : quand l'hôte passe une
  // commande « En préparation », l'invité voit l'alerte dans l'onglet
  // « Messages de l'hôte » (rassurance demandée par le client).
  const [orderUpdates, setOrderUpdates] = useState<HubOrderUpdate[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch(`/api/public/hub/${encodeURIComponent(slug)}/order-updates`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : { updates: [] }))
        .then((j: { updates?: HubOrderUpdate[] }) => {
          if (alive) setOrderUpdates(Array.isArray(j.updates) ? j.updates : []);
        })
        .catch(() => undefined);
    };
    load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [slug]);
  const preparingOrders = orderUpdates.filter((u) => u.preparing);
  // ── v4.74 « BOUTIQUE DE SOUVENIRS » — produits actifs du bien :
  // la tuile n'apparaît que si la boutique en contient au moins un.
  const [souvenirProducts, setSouvenirProducts] = useState<SouvenirLite[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/public/hub/${encodeURIComponent(slug)}/souvenirs`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { products: [] }))
      .then((j: { products?: SouvenirLite[] }) => {
        if (alive) setSouvenirProducts(Array.isArray(j.products) ? j.products : []);
      })
      .catch(() => {
        if (alive) setSouvenirProducts([]);
      });
    return () => {
      alive = false;
    };
  }, [slug]);
  // v4.44 « DÉPART DÉFINITIF » → redirection vers l'écran de recueil d'avis
  // (« page /avis » du hub — Review Booster 5 étoiles plein écran).
  // v4.82 « AU REVOIR + VERROUILLAGE 5 MIN » (demande client) — après la
  // confirmation du départ (immédiat OU définitif) : écran d'AU-REVOIR qui
  // enchaîne état des lieux (si nécessaire) → avis → compte à rebours
  // 5:00 → VERROUILLAGE du hub. L'échéance est PERSISTÉE en localStorage
  // (clé par séjour) : un rechargement de page ne repousse PAS le
  // verrouillage — le compte continue et expire au bon moment.
  // Clé du séjour courant (jour de check-out) — scoping du farewell.
  const stayKey = payload.stay?.checkOut ? checkoutDayKey(payload.stay.checkOut) : 'none';
  const farewellKey = `hub-farewell-${slug}-${stayKey}`;
  const [postCheckout, setPostCheckout] = useState<boolean>(() => {
    // v4.82 — un rechargement de page pendant le compte à rebours
    // réaffiche l'écran d'au-revoir (l'échéance future persistée).
    try {
      const raw = window.localStorage.getItem(farewellKey);
      return !!raw && Number.isFinite(Number(raw)) && Number(raw) > Date.now();
    } catch {
      return false;
    }
  });
  const [farewellDeadline, setFarewellDeadline] = useState<number | null>(() => {
    try {
      const raw = window.localStorage.getItem(farewellKey);
      if (!raw) return null;
      const t = Number(raw);
      return Number.isFinite(t) && t > Date.now() ? t : null;
    } catch {
      return null;
    }
  });
  const [farewellNow, setFarewellNow] = useState(() => Date.now());
  useEffect(() => {
    if (farewellDeadline == null) return;
    // Tick 1 s : le compte à rebours est affiché à la seconde près.
    const t = setInterval(() => setFarewellNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [farewellDeadline]);
  const farewellRemainingMs =
    farewellDeadline != null ? farewellDeadline - farewellNow : null;
  // Expiration → VERROUILLAGE du hub (écran de code) + purge de la clé.
  useEffect(() => {
    if (farewellRemainingMs != null && farewellRemainingMs <= 0) {
      try {
        window.localStorage.removeItem(farewellKey);
      } catch {
        // localStorage indisponible — le verrouillage reste déclenché
      }
      setFarewellDeadline(null);
      onSessionExpired();
    }
  }, [farewellRemainingMs, farewellKey, onSessionExpired]);
  // Purge d'une clé EXPIRÉE au montage (hub re-scanné après verrouillage)
  // → le verrouillage reste GARANTI même si la page a été fermée au moment
  // de l'expiration : un re-scan avec une échéance périmée re-verrouille.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(farewellKey);
      if (raw && Number.isFinite(Number(raw)) && Number(raw) <= Date.now()) {
        window.localStorage.removeItem(farewellKey);
        onSessionExpired();
      }
    } catch {
      // silencieux
    }
  }, [farewellKey, onSessionExpired]);
  /** v4.82 — départ confirmé → au-revoir + lancement du compte à rebours. */
  const startFarewell = useCallback(() => {
    const deadline = Date.now() + FAREWELL_LOCK_MS;
    try {
      window.localStorage.setItem(farewellKey, String(deadline));
    } catch {
      // localStorage indisponible : le verrouillage fonctionnera si la
      // page reste ouverte (tick 1 s sur l'état en mémoire)
    }
    setFarewellDeadline(deadline);
    setFarewellNow(Date.now());
    setPostCheckout(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [farewellKey]);
  // v4.82 — signal d'ouverture du dialog EDL depuis l'écran d'au-revoir.
  const [farewellInspectionSignal, setFarewellInspectionSignal] = useState(0);
  // ── v4.74 « SMART PROMPTS » — notifications temporelles (repas /
  //  veille de départ) configurées par l'hôte : détection ±5 min,
  //  anti-doublon serveur + localStorage, UNE carte à la fois. ──
  const smart = useSmartNotifications({
    slug,
    enabled: true,
    // v5.7 — session d'abord : la fin de séjour DU voyageur déverrouillé
    // est autoritaire (le payload peut pointer un autre séjour, jour de
    // turnover — ex. le départ précédent déjà terminé).
    checkoutDate: sessionEndAt ?? payload.stay?.endAt,
    // v4.76 — fenêtre de séjour stricte : aucun prompt hors du séjour.
    checkInDate: payload.stay?.checkIn ?? null,
  });
  /** Cibler la carte concernée par l'action de la notification.
   *  v4.112 — nouvelles clés du moteur de recommandation contextuel :
   *  minibar/food → minibar (commande en 1 clic), activity → spots
   *  (« Visiter la ville » : coups de cœur + événements). */
  const smartActionTarget: Record<SmartNotificationType, string> = {
    breakfast: 'hub-card-minibar',
    lunch: 'hub-card-minibar',
    dinner: 'hub-card-minibar',
    checkout_reminder: 'hub-card-souvenirs',
    minibar: 'hub-card-minibar',
    food: 'hub-card-minibar',
    activity: 'hub-card-spots',
  };
  const smartActionLabel: Partial<Record<SmartNotificationType, string>> = {
    checkout_reminder: 'Voir la boutique',
    food: 'Réserver',
    activity: 'Découvrir',
  };
  // ── v4.50 « VERROUILLAGE DU HUB PAR CODE » — bouton compte à rebours ──
  // Un badge discret mais clair dans le header du hub (en haut à
  // droite) : état normal = « Temps restant : 01j 14h 22m ». Au clic,
  // une modal rappelle l'heure exacte de check-out, les consignes de
  // départ et propose « Demander un départ tardif » (si activé).
  const [countdownOpen, setCountdownOpen] = useState(false);
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  const [lateRequestBusy, setLateRequestBusy] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setCountdownNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const lockActive = payload.hubLock?.enabled === true && !!session;
  const stayEndTime = useMemo(() => {
    // v5.7 — session d'abord : le payload peut pointer un autre séjour
    // (jour de turnover) déjà terminé → stayRemainingMs ≤ 0 →
    // onSessionExpired() appelé immédiatement = re-verrouillage instantané
    // après un code valide (bug « le code ne marche pas »).
    const iso = sessionEndAt ?? payload.stay?.endAt;
    if (!iso) return null;
    const t = new Date(iso).getTime();
    return Number.isNaN(t) ? null : t;
  }, [sessionEndAt, payload.stay?.endAt]);
  const stayRemainingMs = lockActive && stayEndTime ? stayEndTime - countdownNow : null;
  // Expiration client : temps écoulé → clé locale effacée + écran de code.
  useEffect(() => {
    if (stayRemainingMs != null && stayRemainingMs <= 0 && lockActive) {
      onSessionExpired();
    }
  }, [stayRemainingMs, lockActive, onSessionExpired]);
  /** Départ tardif demandé depuis la modal du compte à rebours. */
  const requestLateFromModal = useCallback(async () => {
    if (lateRequestBusy) return;
    setLateRequestBusy(true);
    try {
      const res = await hubFetch(slug, `/api/public/hub/${encodeURIComponent(slug)}/late-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // v5.7 — le nom du voyageur DÉVERROUILLÉ (sa session) d'abord :
          // payload.stay peut pointer le séjour précédent (jour de turnover)
          // → l'hôte recevait une demande de départ tardif au nom du
          // mauvais invité.
          guestName: session?.guestName ?? payload.stay?.guestName ?? null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) throw new Error(data.error || 'http');
      toast.success(data.message || 'Demande envoyée — votre hôte vous répondra rapidement.');
      setCountdownOpen(false);
    } catch (e) {
      if (e instanceof HubSessionExpiredError) {
        onSessionExpired();
        return;
      }
      const detail = e instanceof Error && e.message !== 'http' ? e.message : null;
      toast.error(detail || 'Demande impossible. Réessayez dans un instant.');
    } finally {
      setLateRequestBusy(false);
    }
  }, [slug, payload.stay?.guestName, onSessionExpired, lateRequestBusy]);
  const router = useRouter();
  const { property, guest } = payload;

  // ── v4.51 « WAKE LOCK » — l'écran de la tablette posée dans le salon
  // ne s'éteint plus pendant la lecture du guidebook / de la vidéo
  // (ré-acquisition auto au retour sur l'onglet, échec silencieux). ──
  useWakeLock();

  // ── v4.31 « POUR VOUS » + « PHOTOS DE MON HUB » ──
  // Photos personnalisées de l'hôte (fallback : visuels curated).
  const photos = payload.property.hubPhotos ?? {};

  // ── v4.51 « MODE AMBIANCE » — diaporama de l'écran de veille : les
  // photos de l'hôte en priorité, complétées par les visuels curated
  // (8 max — fondu toutes les 10 s sur la tablette en veille). ──
  const screensaverPhotos = useMemo(() => {
    const list: string[] = [];
    const push = (u?: string | null) => {
      if (u && !list.includes(u)) list.push(u);
    };
    push(photos.hero ?? '/hub-hero-villa.jpg');
    for (const v of Object.values(photos)) push(v);
    push(HUB_VISUALS.guidebook);
    push(HUB_VISUALS.welcome);
    push(HUB_VISUALS.lateCheckout);
    push(HUB_VISUALS.spots);
    push(HUB_VISUALS.access);
    return list.slice(0, 8);
  }, [photos]);
  // Moment du séjour : réservation en cours (serveur, sans données
  // personnelles) sinon repli sur l'heure locale du téléphone.
  // Lazy init client-only — la vue invité n'est jamais rendue en SSR.
  const [moment] = useState<StayMoment>(() => {
    if (payload.stayMoment) return payload.stayMoment;
    const h = new Date().getHours();
    return h >= 18 || h < 5 ? 'evening' : 'midstay';
  });
  const jumpTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);
  const openForYou = useCallback((d: 'video' | 'feedback' | 'contact') => {
    if (d === 'video') setVideoOpen(true);
    else if (d === 'feedback') setFeedbackOpen(true);
    else setContactOpen(true);
  }, []);
  // ── v4.33 « TRADUCTION INSTANTANÉE IA » — langue du voyageur ──
  // Auto-détection du smartphone au 1er scan ; choix mémorisé par hub
  // (localStorage). Lazy init client-only : la vue invité n'est JAMAIS
  // rendue en SSR (le composant n'apparaît qu'après le fetch du payload).
  const [lang, setLang] = useState<HubLang>(() => getStoredLang(slug) ?? detectLang());
  const changeLang = useCallback(
    (l: HubLang) => {
      setLang(l);
      storeLang(slug, l);
    },
    [slug],
  );
  const tL = useCallback((s: string) => translateText(s, lang), [lang]);

  // ── v4.35 « SOIR DE DÉPART » + « REVIEW BOOSTER » + v4.41 MASQUAGE ──
  // Heure locale rafraîchie chaque minute. La veille du départ le soir
  // (≥ 18 h), « Départ tardif » et « Bouclier d'avis » passent EN TÊTE
  // DE PAGE (demande client : « en haut pour plus de visibilité ») ; le
  // Review Booster (👍/👎 → avis public ou privé) s'affiche dès 18 h la
  // veille et le matin du jour J jusqu'à 11 h. Alerte « nouveau message
  // hôte » : la carte Contact clignote + bip mp3 quand une réponse attend.
  const [nowHour, setNowHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const update = () => setNowHour(new Date().getHours());
    update();
    const t = setInterval(update, 60_000);
    return () => clearInterval(t);
  }, []);
  // ── v4.41 « MASQUAGE APRÈS L'HEURE DE CHECK-OUT » (demande client) ──
  // Le jour du départ, dès 11 h (heure du téléphone — même référence que
  // le compte à rebours), les modules « Départ tardif », « Bouclier
  // d'avis / Review Booster » et « Réservation directe » disparaissent :
  // l'invité est parti (ou part), les modules n'ont plus de sens.
  // ── v4.46 « RÉINITIALISATION FIN DE SÉJOUR » (demande client) ──
  // Quand le séjour est TERMINÉ (aucun séjour couvrant + un séjour
  // passé en base, signalé serveur par stay.isStayOver), le hub se
  // RÉINITIALISE : réservation directe, départ définitif, compte à
  // rebours, départ tardif et bouclier d'avis sont masqués — état
  // neutre prêt pour le prochain invité.
  const isCheckoutDay = !!payload.stay?.isCheckoutDay;
  const stayOver = !!payload.stay?.isStayOver;
  const checkoutPassed = (isCheckoutDay && nowHour >= 11) || stayOver;
  const eveningBeforeDeparture = moment === 'departure' && !isCheckoutDay && nowHour >= 18;

  // ── v4.79 « DISPARITION APRÈS COMPLÉTION » (demande client) ──
  // Les 3 modules de fin de séjour (Départ tardif, Avis/Bouclier,
  // Départ définitif) QUITTENT le hub dès que l'invité les a remplis :
  //   • Départ tardif → demande envoyée ;
  //   • Avis → retour privé soumis (Bouclier d'avis OU bandeau booster) ;
  //   • Départ définitif → départ confirmé.
  // La complétion est mémorisée en localStorage PAR SÉJOUR (clé = jour
  // de check-out) : au rechargement comme au retour sur le hub, la
  // carte n'existe plus ; un NOUVEAU séjour (nouvelle clé) réaffiche
  // les modules — même tablette, nouveaux voyageurs.
  // v4.82 — stayKey est défini plus haut (scoping du farewell).
  const [lateRequested, setLateRequested] = useState(false);
  const [feedbackDone, setFeedbackDone] = useState(false);
  useEffect(() => {
    try {
      setLateRequested(window.localStorage.getItem(lateRequestedKey(slug, stayKey)) != null);
      setFeedbackDone(window.localStorage.getItem(feedbackDoneKey(slug, stayKey)) != null);
    } catch {
      // localStorage indisponible → les modules restent affichés
    }
  }, [slug, stayKey]);
  const markLateRequested = useCallback(() => {
    try {
      window.localStorage.setItem(lateRequestedKey(slug, stayKey), new Date().toISOString());
    } catch {
      // localStorage indisponible : le retrait ne survivra pas au rechargement
    }
    setLateRequested(true);
  }, [slug, stayKey]);
  const markFeedbackDone = useCallback(() => {
    try {
      window.localStorage.setItem(feedbackDoneKey(slug, stayKey), new Date().toISOString());
    } catch {
      // localStorage indisponible : le retrait ne survivra pas au rechargement
    }
    setFeedbackDone(true);
  }, [slug, stayKey]);
  // ── v4.80 « ÉTATS DES LIEUX » — mêmes règles de disparition ──
  const [checkinDone, setCheckinDone] = useState(false);
  const [checkoutDone, setCheckoutDone] = useState(false);
  useEffect(() => {
    try {
      setCheckinDone(window.localStorage.getItem(checkinInspectionKey(slug, stayKey)) != null);
      setCheckoutDone(window.localStorage.getItem(checkoutInspectionKey(slug, stayKey)) != null);
    } catch {
      // localStorage indisponible → les cartes restent affichées
    }
  }, [slug, stayKey]);
  const markCheckinDone = useCallback(() => {
    try {
      window.localStorage.setItem(checkinInspectionKey(slug, stayKey), new Date().toISOString());
    } catch {
      // localStorage indisponible : le retrait ne survivra pas au rechargement
    }
    setCheckinDone(true);
  }, [slug, stayKey]);
  const markCheckoutDone = useCallback(() => {
    try {
      window.localStorage.setItem(checkoutInspectionKey(slug, stayKey), new Date().toISOString());
    } catch {
      // localStorage indisponible : le retrait ne survivra pas au rechargement
    }
    setCheckoutDone(true);
  }, [slug, stayKey]);
  // v4.41 — Review Booster : le matin du jour J, fenêtre raccourcie à
  // « jusqu'à 11 h » (au lieu de 14 h) ; le soir du jour J, masqué
  // également (checkoutPassed le couvre).
  const reviewBoosterWindow =
    moment === 'departure' && (nowHour >= 18 || nowHour < 11) && !checkoutPassed;

  const forYou = useMemo(
    () =>
      // v4.33 — libellés « Pour vous » traduits (dictionnaire statique).
      // v4.41 — après l'heure de check-out le jour J, les entrées
      // « Départ tardif » et « Bouclier d'avis » sortent de la strip.
      // v4.79 — idem dès que le module correspondant est complété.
      forYouEntries(moment, photos)
        .filter((e) => !(lateRequested && e.key === 'lateCheckout'))
        .filter((e) => !(feedbackDone && e.key === 'review'))
        .filter((e) => !checkoutPassed || (e.key !== 'lateCheckout' && e.key !== 'review'))
        .map((e) => ({
          ...e,
          title: translateText(e.title, lang),
          reason: translateText(e.reason, lang),
        })),
    [moment, photos, lang, checkoutPassed, lateRequested, feedbackDone],
  );

  // ── v4.32 « SIGNAUX DU SÉJOUR » (heure du jour J gérée plus haut) ──
  // Départ tardif : clignote en rouge la VEILLE du départ ET le jour même
  // (stayMoment='departure' est calculé serveur : checkOut - aujourd'hui ≤ 1 j).
  const lateCheckoutUrgent = moment === 'departure';
  // Bouclier d'avis : clignote tous les jours à partir de 20 h (heure du
  // téléphone de l'invité) — rafraîchi chaque minute si la page reste ouverte.
  const [eveningBlink, setEveningBlink] = useState(false);
  useEffect(() => {
    const update = () => setEveningBlink(new Date().getHours() >= 20);
    update();
    const t = setInterval(update, 60_000);
    return () => clearInterval(t);
  }, []);

  const { newReplyIds, markRepliesSeen } = useHostReplyAlert(slug);

  // ── v4.37 « MESSAGES VOCAUX DU HUB » — les 3 déclencheurs client ──
  // Spécifications exactes du client : (1) BIENVENUE au 1er clic « Mode
  // Invité », jouée 1 seule fois par appareil (ré-armée si l'hôte
  // régénère la voix — nouvelle version — ou après 14 jours = nouveau
  // séjour probable) ; (2) VEILLE DU DÉPART, 1er scan après 20 h (heure
  // du téléphone), jouée 1 seule fois par date de départ ; (3) JOUR DU
  // DÉPART dès 9 h, CHAQUE ouverture de l'espace invité (pont 3 min par
  // session pour éviter le spam de va-et-vient). Le montage de
  // GuestView suit immédiatement le clic « Mode Invité » → l'activation
  // utilisateur est fraîche : l'autoplay du navigateur n'est PAS bloqué
  // (cœur du concept validé en discussion). Langue : celle du téléphone
  // (fr/en/es/ar), repli FR géré côté route audio.
  const [voiceLang] = useState<HubVoiceLang>(() => detectVoiceLang());
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const [voiceKind, setVoiceKind] = useState<HubVoiceKind | null>(null);
  // ── v4.77 « VOIX DU GUIDEBOOK : SEULEMENT DANS LE GUIDEBOOK » ──
  // (Option A validée par le client) — suppression de la lecture auto et
  // de la carte « Un mot de votre hôte » qui surgissaient sur l'ACCUEIL à
  // la sortie du guidebook (v4.71) : plus aucun son ni carte hors du
  // guide. La voix reste écoutable DANS le guide universel (lecteur du
  // dialog Guide universel).
  const playVoiceKind = useCallback(
    (kind: HubVoiceKind, info: { langs: string[]; v: string }) => {
      const lang = (info.langs.includes(voiceLang) ? voiceLang : 'fr') as HubVoiceLang;
      if (!info.langs.includes(lang)) return; // ni la langue de l'appareil, ni le FR
      const audio = new Audio(hubVoiceAudioUrl(slug, kind, lang, info.v));
      audio.preload = 'auto';
      voiceAudioRef.current = audio;
      void audio
        .play()
        .catch(() => {
          /* autoplay refusé → la pill flottante permet la lecture en 1 tap */
        })
        .finally(() => {
          // Pill « réécouter » affichée dès que la lecture démarre (ou échoue).
          setVoiceKind(kind);
        });
    },
    [slug, voiceLang],
  );
  useEffect(() => {
    const vm = payload.voiceMessages;
    if (!vm) return;
    const entries: Partial<Record<HubVoiceKind, { langs: string[]; v: string }>> = {
      welcome: vm.welcome,
      checkout_eve: vm.checkoutEve,
      checkout_day: vm.checkoutDay,
    };
    const hour = new Date().getHours();
    // v4.71 — mémorise le 1er accès au hub de CE séjour (clé par date de
    // départ) : si cet accès est postérieur à l'heure configurée de
    // l'annonce de veille, elle se déclenchera 30 min après — jamais
    // dans la minute qui suit l'installation de l'invité.
    const dayKey = payload.stay?.checkOut ? checkoutDayKey(payload.stay.checkOut) : null;
    if (dayKey) markEveFirstAccess(slug, dayKey);
    // v4.42 — heures de déclenchement configurées par l'hôte dans le
    // dashboard (Conciergerie) ; défauts = spécification v4.37 (20 h / 9 h).
    const eveHour =
      typeof vm.eveHour === 'number' && vm.eveHour >= 0 && vm.eveHour <= 23
        ? vm.eveHour
        : 20;
    const dayHour =
      typeof vm.dayHour === 'number' && vm.dayHour >= 0 && vm.dayHour <= 23
        ? vm.dayHour
        : 9;
    let kind: HubVoiceKind | null = null;
    // 1) Jour du départ (dès l'heure configurée) — chaque ouverture (pont 3 min).
    if (
      payload.stay?.isCheckoutDay &&
      hour >= dayHour &&
      !!entries.checkout_day && entries.checkout_day.langs.length > 0 &&
      shouldPlayCheckoutDay(slug)
    ) {
      kind = 'checkout_day';
      markCheckoutDayPlayed(slug);
    }
    // 2) Veille du départ — v4.71 : due à l'heure configurée, OU 30 min
    // après un 1er accès tardif (arrivée à 23 h ⇒ annonce à 23 h 30).
    else if (
      moment === 'departure' &&
      !payload.stay?.isCheckoutDay &&
      dayKey &&
      isEveAnnounceDue(slug, dayKey, eveHour) &&
      !!entries.checkout_eve && entries.checkout_eve.langs.length > 0 &&
      shouldPlayCheckoutEve(slug, dayKey)
    ) {
      kind = 'checkout_eve';
      markCheckoutEvePlayed(slug, dayKey);
    }
    // 3) Bienvenue — v4.77 : 1× PAR SÉJOUR (clé = date de check-out du
    //    séjour courant, 'none' entre deux séjours). Chaque nouvel invité
    //    entend la voix, même sur la même tablette.
    else if (
      !!entries.welcome && entries.welcome.langs.length > 0 &&
      shouldPlayWelcome(slug, dayKey ?? 'none')
    ) {
      kind = 'welcome';
      markWelcomePlayed(slug, dayKey ?? 'none');
    }
    if (!kind) return;
    const info = entries[kind];
    if (!info) return;
    playVoiceKind(kind, info);
    return () => {
      voiceAudioRef.current?.pause();
      voiceAudioRef.current = null;
    };
    // Un seul passage par montée de la vue invité (= chaque « Mode Invité »).
  }, []);
  // v4.71 — re-check périodique (60 s) de l'annonce de veille : si
  // l'invité garde le hub ouvert, l'annonce se déclenche à l'heure
  // prévue (heure configurée, ou accès tardif + 30 min) sans attendre
  // une nouvelle ouverture de l'espace invité.
  useEffect(() => {
    const vm = payload.voiceMessages;
    if (!vm?.checkoutEve || !payload.stay?.checkOut) return;
    const eveHourCfg =
      typeof vm.eveHour === 'number' && vm.eveHour >= 0 && vm.eveHour <= 23
        ? vm.eveHour
        : 20;
    const timer = window.setInterval(() => {
      if (moment !== 'departure' || payload.stay?.isCheckoutDay || !payload.stay?.checkOut) return;
      const dk = checkoutDayKey(payload.stay.checkOut);
      if (!shouldPlayCheckoutEve(slug, dk)) return;
      if (!isEveAnnounceDue(slug, dk, eveHourCfg)) return;
      markCheckoutEvePlayed(slug, dk);
      playVoiceKind('checkout_eve', vm.checkoutEve);
    }, 60_000);
    return () => window.clearInterval(timer);
    // payload/moment sont stables pendant la vie de la vue invité.
  }, [payload, moment, slug, playVoiceKind]);
  const replayVoice = useCallback(() => {
    const audio = voiceAudioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    void audio.play().catch(() => {
      toast.error('Lecture impossible sur cet appareil.');
    });
  }, []);
  const waHostHref = useMemo(() => waMeHref(payload.guest.contact.phone), [payload.guest.contact.phone]);

  // ── v4.81 (AUDIT QA) — Vidéo de bienvenue : fenêtre « < 1 h depuis le
  // 1er scan » (même règle que la PWA TimeLimitedWelcomeVideo), clé
  // localStorage PAR SÉJOUR (ch-hub-firstscan-{slug}-{stayKey}) : chaque
  // nouvel invité revoit la vidéo, mais elle disparaît après 1 h.
  const [welcomeVideoVisible, setWelcomeVideoVisible] = useState(false);
  useEffect(() => {
    const firstScanKey = `ch-hub-firstscan-${slug}-${stayKey}`;
    try {
      const first = window.localStorage.getItem(firstScanKey);
      const now = Date.now();
      if (!first) {
        window.localStorage.setItem(firstScanKey, String(now));
        setWelcomeVideoVisible(true);
      } else {
        setWelcomeVideoVisible(now - Number(first) < 3_600_000);
      }
    } catch {
      setWelcomeVideoVisible(true); // localStorage indisponible → comportement historique
    }
  }, [slug, stayKey]);

  // ── SECTION 1 « Votre logement » — ordre adapté au moment ──
  // (jour d'arrivée, demande client : « Arrivée pas à pas » PUIS
  // « Accès & Codes » PUIS la vidéo de bienvenue, avant le reste).
  // Les divs id servent d'ancres au bandeau « Pour vous » (scroll fluide).
  // v4.32 — la carte vidéo vit en section 1 le jour d'arrivée (3e position
  // après Arrivée pas à pas + Accès & Codes), en section 2 les autres jours.
  // v4.77 « AUDIO AVANT VIDÉO » — la carte Vidéo de bienvenue disparaît
  // dès que l'hôte a enregistré un message vocal de bienvenue (l'audio
  // se joue automatiquement au 1er « Mode Invité », la vidéo ferait
  // doublon). Elle revient si l'hôte supprime ses voix de bienvenue.
  const videoNode =
    welcomeVideoVisible &&
    guest.premiumFeatures?.videoWelcomeUrl &&
    !(payload.voiceMessages?.welcome?.langs.length ?? 0) ? (
    <WelcomeVideoCard
      key="video"
      url={guest.premiumFeatures.videoWelcomeUrl}
      propertyName={property.name}
      open={videoOpen}
      onOpenChange={setVideoOpen}
      photoOverride={photos.video}
    />
  ) : null;
  const sec1Items: { key: string; node: React.ReactNode }[] = [
    {
      key: 'access',
      node: guest.accessCodes ? (
        <div id="hub-card-access" key="access" className="flex h-full flex-col">
          <AccessCodesCard codes={guest.accessCodes} copy={copy} photoOverride={photos.access} />
        </div>
      ) : null,
    },
    {
      key: 'guidebook',
      node: guest.guidebookSlug ? (
        <div id="hub-card-guidebook" key="guidebook" className="flex h-full flex-col">
          <ModuleCard
            emoji="📖"
            tone="teal"
            eyebrow="Guide de la maison"
            title="Guidebook"
            subtitle="Accès, équipements, règles & bonnes adresses"
            imageUrl={photos.guidebook ?? HUB_VISUALS.guidebook}
            onClick={() => {
              if (!guest.guidebookSlug) return;
              router.push(`/view/${guest.guidebookSlug}`);
            }}
          >
            <span className="flex flex-wrap gap-1.5">
              <PreviewChip>🗝️ Arrivée</PreviewChip>
              <PreviewChip>🛏️ Équipements</PreviewChip>
              <PreviewChip>📋 Règles</PreviewChip>
            </span>
          </ModuleCard>
          {/* v4.77 — lecteur vocal SUPPRIMÉ de l'accueil (option A : la voix
              du guidebook est écoutable uniquement DANS le guidebook). */}
        </div>
      ) : guest.universalGuidebook ? (
        // v4.47 — GUIDEBOOK UNIVERSEL : si l'hôte n'a pas encore rédigé
        // son propre guide, le guide de référence partagé par toutes les
        // maisons s'affiche (lisible dans le hub — plus de carte vide).
        <div id="hub-card-guidebook" key="guidebook" className="flex h-full flex-col">
          <UniversalGuidebookCard
            slug={slug}
            guidebook={guest.universalGuidebook}
            photoOverride={photos.guidebook}
            voiceInfo={payload.voiceMessages?.guidebook ?? null}
          />
        </div>
      ) : (
        <div id="hub-card-guidebook" key="guidebook" className="flex h-full flex-col">
          <ModuleCard
            emoji="📖"
            tone="teal"
            eyebrow="Guide de la maison"
            title="Guidebook"
            subtitle="Votre hôte prépare son guide"
            imageUrl={photos.guidebook ?? HUB_VISUALS.guidebook}
            disabled
          />
        </div>
      ),
    },
    {
      key: 'arrival',
      node:
        guest.visualGuide.length > 0 ? (
          <div id="hub-card-arrival" key="arrival" className="flex h-full flex-col">
            <VisualGuideCard steps={guest.visualGuide} photoOverride={photos.arrival} />
          </div>
        ) : null,
    },
    {
      // v4.80 « ÉTAT DES LIEUX D'ARRIVÉE » — l'invité vérifie les pièces,
      // ajoute des photos, signe : PDF « entrée » envoyé à l'invité ET à
      // l'hôte + preuve publique à vie. La carte DISPARAÎT une fois signée
      // (clé par séjour) — et un séjour déjà signé côté serveur aussi.
      key: 'checkininspection',
      node:
        moment !== 'departure' && !checkinDone && !stayOver ? (
          <div id="hub-card-checkin-inspection" key="checkininspection" className="flex h-full flex-col">
            <CheckInInspectionCard
              slug={slug}
              propertyName={property.name}
              guestNameHint={payload.stay?.guestName ?? null}
              onDone={markCheckinDone}
              onSessionExpired={onSessionExpired}
            />
          </div>
        ) : null,
    },
    {
      key: 'video',
      node: moment === 'arrival' ? videoNode : null,
    },
    {
      key: 'appliances',
      node:
        guest.appliances.length > 0 ? (
          <div id="hub-card-appliances" key="appliances" className="flex h-full flex-col">
            <AppliancesCard appliances={guest.appliances} photoOverride={photos.appliances} universal={guest.appliancesUniversal} />
          </div>
        ) : null,
    },
    {
      key: 'survival',
      node:
        guest.survivalKitItems.length > 0 ? (
          <SurvivalKitCard key="survival" items={guest.survivalKitItems} photoOverride={photos.survival} />
        ) : null,
    },
    {
      key: 'wifighost',
      node: !guest.wifi ? (
        <ModuleCard
          key="wifighost"
          emoji="📶"
          tone="teal"
          eyebrow="Connexion"
          title="Wi-Fi"
          subtitle="Informations en cours de préparation"
          imageUrl={HUB_VISUALS.wifi}
          disabled
        />
      ) : null,
    },
  ];
  const sec1Order =
    moment === 'arrival'
      ? ['arrival', 'checkininspection', 'access', 'video', 'guidebook', 'appliances', 'survival', 'wifighost']
      : ['access', 'guidebook', 'arrival', 'checkininspection', 'appliances', 'survival', 'wifighost'];
  const sec1Nodes = sec1Order
    .map((k) => sec1Items.find((i) => i.key === k)?.node)
    .filter((n): n is React.ReactNode => !!n);

  // ── SECTION 2 « Pendant votre séjour » — ordre adapté au moment ──
  // (veille du départ : Départ tardif + Bouclier d'avis passent devant).
  // v4.71 — la carte « Messages de l'hôte » QUITTE cette section : elle
  // déménage dans « Besoin d'aide ? » (1er élément), demande client.
  // v4.77-c2 FIX TDZ — `checkoutAmountDue` (utilisé par la tuile
  // 'checkoutfinal' ci-dessous) doit être déclaré AVANT le tableau
  // sec2Items : il était déclaré APRÈS → ReferenceError au rendu de la
  // vue invité (et erreur tsc). Déplacement pur, aucune logique changée.
  // v4.77 « DÉPART D'URGENCE » — montant estimé à régler au départ :
  // minibar ouvert (totalOpenEur = vérité serveur du payload) + frais de
  // départ tardif VALIDÉ (lateCheckOutUntil posé sur la réservation).
  const checkoutAmountDue = useMemo(() => {
    const minibarEur = guest.minibarExtra?.totalOpenEur ?? 0;
    const lateCheckoutEur = payload.stay?.lateCheckOutUntil
      ? guest.premiumFeatures?.lateCheckoutPrice ?? 0
      : 0;
    return { minibarEur, lateCheckoutEur, totalEur: minibarEur + lateCheckoutEur };
  }, [guest.minibarExtra, guest.premiumFeatures, payload.stay?.lateCheckOutUntil]);
  const sec2Items: { key: string; node: React.ReactNode }[] = [
    {
      // v4.50 « ONGLET CHECK-IN/CHECK-OUT » — dates du séjour, heure de
      // départ exacte, prolongation validée, minibar consommé, recharge.
      key: 'stayinfo',
      node: <StayInfoCard key="stayinfo" payload={payload} />,
    },
    {
      key: 'video',
      node: moment === 'arrival' ? null : videoNode,
    },
    {
      key: 'late',
      // v4.41 — masqué après l'heure de check-out le jour J (demande client).
      // v4.79 — masqué aussi dès que la demande est envoyée (disparition).
      node:
        guest.premiumFeatures?.enableLateCheckout && !checkoutPassed && !lateRequested ? (
        <div id="hub-card-late" key="late" className="flex h-full flex-col">
          <LateCheckoutCard
            slug={slug}
            price={guest.premiumFeatures.lateCheckoutPrice}
            propertyName={property.name}
            stayKey={stayKey}
            onRequested={markLateRequested}
            photoOverride={photos.lateCheckout}
            lateUntilHour={guest.premiumFeatures.lateCheckoutHour}
            urgentLabel={lateCheckoutUrgent ? tL('⏰ Départ imminent') : undefined}
          />
        </div>
      ) : null,
    },
    {
      key: 'spots',
      node: guest.localSpots.length > 0 ? (
        <div id="hub-card-spots" key="spots" className="flex h-full flex-col">
          <LocalSpotsCard
            spots={guest.localSpots}
            photoOverride={photos.spots}
            originLat={property.latitude}
            originLng={property.longitude}
          />
        </div>
      ) : null,
    },
    {
      key: 'review',
      // v4.41 — masqué après l'heure de check-out le jour J (demande client).
      // v4.79 — masqué aussi dès que l'avis privé est envoyé (disparition),
      // MAIS le composant reste monté tant que son dialog de remerciement
      // est ouvert (l'invité voit « Merci ! » avant que tout disparaisse).
      // v4.82 — l'avis REVIENT/RASTE visible après l'heure de check-out
      // dès que l'ÉTAT DES LIEUX DE DÉPART est signé : c'est lui qui doit
      // s'afficher AVANT le verrouillage du hub (demande client).
      node:
        guest.premiumFeatures?.enableReviewShield &&
        (!checkoutPassed || checkoutDone) &&
        (!feedbackDone || feedbackOpen) ? (
        <ReviewShieldCard
          key="review"
          slug={slug}
          propertyName={property.name}
          stayKey={stayKey}
          onSubmitted={markFeedbackDone}
          reviewUrl={guest.premiumFeatures.reviewUrl}
          open={feedbackOpen}
          onOpenChange={setFeedbackOpen}
          photoOverride={photos.review}
          urgentLabel={eveningBlink ? tL('⭐ Ce soir 20 h') : undefined}
        />
      ) : null,
    },
    {
      // v4.33 « SHOP THE STAY » — boutique de la maison (affiliation hôte).
      key: 'shop',
      node: (
        <div id="hub-card-shop" key="shop" className="flex h-full flex-col">
          <ShopCard slug={slug} items={guest.shopItems ?? []} photoOverride={photos.shop} />
        </div>
      ),
    },
    {
      // v4.74 « BOUTIQUE DE SOUVENIRS » — produits artisanaux de la maison :
      // commande simple (livraison au logement ou au check-out) + le hôte
      // est notifié. Tuile affichée uniquement si ≥ 1 produit actif.
      key: 'souvenirs',
      node:
        souvenirProducts && souvenirProducts.length > 0 ? (
          <div id="hub-card-souvenirs" key="souvenirs" className="flex h-full flex-col">
            <SouvenirsCard
              slug={slug}
              products={souvenirProducts}
              photoOverride={photos.souvenirs ?? null}
              onSessionExpired={onSessionExpired}
            />
          </div>
        ) : null,
    },
    {
      // v4.44 « MINIBAR NUMÉRIQUE » (Honesty Bar) — consommations + paiement.
      // v4.50 — inventaire d'arrivée, offerts, facturation au départ, restock.
      key: 'minibar',
      node:
        guest.premiumFeatures?.enableMinibar && (guest.minibarItems?.length ?? 0) > 0 ? (
          <div id="hub-card-minibar" key="minibar" className="flex h-full flex-col">
            <MinibarCard
              slug={slug}
              items={guest.minibarItems}
              photoOverride={photos.shop}
              extra={guest.minibarExtra}
              onSessionExpired={onSessionExpired}
            />
          </div>
        ) : null,
    },
    {
      // v4.52 « LIVRE D'OR VIVANT » — mur de souvenirs partagé : le
      // nouveau voyageur feuillette les photos/messages/vocaux des
      // précédents (modérés par l'hôte) et laisse le sien.
      key: 'memories',
      node: (
        <div id="hub-card-memories" key="memories" className="flex h-full flex-col">
          <ModuleCard
            emoji="📖"
            tone="amber"
            eyebrow="Livre d'or"
            title="Les souvenirs des voyageurs"
            subtitle={
              (payload.guest.memoriesSummary?.total ?? 0) > 0
                ? `${payload.guest.memoriesSummary?.total} ${tL('souvenirs partagés')} — ⭐ ${payload.guest.memoriesSummary?.avg}/5`
                : tL('Soyez le premier à écrire dans le livre d’or')
            }
            imageUrl={HUB_VISUALS.memories}
            onClick={() => setMemoriesOpen(true)}
          />
        </div>
      ),
    },
    {
      // v4.52 « MIDDLE-STAY CARE » — séjours longs (≥ 7 nuits) :
      // réassort / ménage intermédiaire en 2 clics.
      key: 'middlestay',
      node:
        (payload.stay?.nights ?? 0) >= 7 && payload.stay?.nights != null ? (
          <div id="hub-card-middlestay" key="middlestay" className="flex h-full flex-col">
            <MiddleStayCard
              slug={slug}
              nights={payload.stay.nights}
              guestName={payload.stay?.guestName ?? null}
              /* v4.71 — visuel dédié « serviettes + panier de soin » */
              photoOverride={HUB_VISUALS.middlestay}
            />
          </div>
        ) : null,
    },
    {
      // « DEMANDES PARTICULIÈRES » — l'invité demande un équipement ou
      // un service (lit d'appoint, lit bébé, siège bébé, serviettes…),
      // l'hôte est notifié et suit le traitement depuis son dashboard.
      key: 'special',
      node: (
        <div id="hub-card-special" key="special" className="flex h-full flex-col">
          <SpecialRequestsCard
            slug={slug}
            guestName={payload.stay?.guestName ?? null}
            onSessionExpired={onSessionExpired}
          />
        </div>
      ),
    },
    {
      // v4.80 « ÉTAT DES LIEUX DE DÉPART » — minibar (consommations
      // déclarées par article) + 5 pièces + inventaire rendu + signature :
      // PDF « sortie » envoyé à l'invité ET à l'hôte. Disparaît une fois
      // signé — clé par séjour + sync serveur.
      // v4.166 « COHÉRENCE CHECK-IN / CHECK-OUT » (demande client : « le
      // lien du checkin est généré et activé mais si la personne veut
      // faire le checkout le lien n'apparaît pas ») — la carte était
      // limitée à (moment === 'departure' || isCheckoutDay) : invisible
      // pendant tout le séjour, elle ne pouvait PAS être remplie en
      // avance. Elle est désormais visible DÈS L'ARRIVÉE, au même titre
      // que l'EDL d'entrée (même règle !checkoutDone && !stayOver) ;
      // la remontée en tête de section + la mise en évidence le jour J
      // restent gérées par sec2Order (isCheckoutDay / eveningBefore).
      key: 'checkoutinspection',
      node:
        !checkoutDone && !stayOver ? (
          <div id="hub-card-checkout-inspection" key="checkoutinspection" className="flex h-full flex-col">
            <CheckOutInspectionCard
              slug={slug}
              propertyName={property.name}
              guestNameHint={payload.stay?.guestName ?? null}
              minibarItems={guest.minibarItems}
              onDone={markCheckoutDone}
              onSessionExpired={onSessionExpired}
            />
          </div>
        ) : null,
    },
    {
      // v4.44 « DÉPART DÉFINITIF » — bouton rouge + alerte ménage + avis.
      // v4.46 — masqué quand le séjour est TERMINÉ (réinitialisation :
      // le bandeau ne doit plus s'afficher une fois le séjour passé).
      // v4.77 « DÉPART D'URGENCE » — le jour J le flux urgence REMPLACE
      // la checklist (montant minibar + départ tardif affiché) ; dès la
      // veille au soir la carte est mise en ÉVIDENCE (bordure + pastille).
      key: 'checkoutfinal',
      node: stayOver ? null : (
        <div id="hub-card-checkout-final" key="checkoutfinal" className="flex h-full flex-col">
          <CheckoutFinalCard
            slug={slug}
            propertyName={property.name}
            stayKey={stayKey}
            checkoutAudioUrl={guest.premiumFeatures?.checkoutAudioUrl}
            urgentMode={isCheckoutDay}
            amountDue={checkoutAmountDue}
            highlight={eveningBeforeDeparture || isCheckoutDay}
            onConfirmed={startFarewell}
          />
        </div>
      ),
    },
  ];
  const sec2BaseOrder =
    moment === 'departure'
      ? ['stayinfo', 'late', 'review', 'video', 'spots', 'shop', 'souvenirs', 'minibar', 'memories', 'middlestay', 'special', 'checkoutinspection', 'checkoutfinal']
      : ['stayinfo', 'video', 'shop', 'souvenirs', 'late', 'spots', 'review', 'minibar', 'memories', 'middlestay', 'special', 'checkoutinspection', 'checkoutfinal'];
  // v4.35 — le soir de la veille du départ, « Départ tardif » et
  // « Bouclier d'avis » SORTENT de la section 2 : ils sont remontés en
  // tête de page dans le bandeau « Ce soir : préparez votre départ ».
  // v4.77 — mise en ÉVIDENCE du Départ définitif : dès la veille au soir
  // ET le jour J, la carte passe en TÊTE de la section 2.
  const sec2Order = (() => {
    let order = sec2BaseOrder;
    if (eveningBeforeDeparture) order = order.filter((k) => k !== 'late' && k !== 'review');
    // v4.82 (demande client) — LE JOUR DU DÉPART, l'ÉTAT DES LIEUX DE
    // DÉPART monte EN TÊTE de section (devant le Départ immédiat/définitif)
    // pour plus de visibilité : signature EDL → avis → verrouillage.
    // La veille au soir : le Départ définitif reste en tête (préparation).
    if (isCheckoutDay) {
      order = [
        'checkoutinspection',
        'checkoutfinal',
        ...order.filter((k) => k !== 'checkoutinspection' && k !== 'checkoutfinal'),
      ];
    } else if (eveningBeforeDeparture) {
      order = ['checkoutfinal', ...order.filter((k) => k !== 'checkoutfinal')];
    }
    return order;
  })();
  const lateNode = sec2Items.find((i) => i.key === 'late')?.node ?? null;
  const reviewNode = sec2Items.find((i) => i.key === 'review')?.node ?? null;
  const sec2Nodes = sec2Order
    .map((k) => sec2Items.find((i) => i.key === k)?.node)
    .filter((n): n is React.ReactNode => !!n);

  // ── v4.82 « ÉCRAN D'AU-REVOIR » (remplace l'écran de recueil d'avis
  // v4.44) — départ confirmé : au-revoir → état des lieux (si besoin) →
  // avis → compte à rebours → verrouillage. La carte d'état des lieux
  // CACHÉE ci-dessous porte le dialog de signature (piloté par le
  // bouton de l'écran) + la sync serveur (déjà signé → avis direct). ──
  if (postCheckout) {
    return (
      <HubLangContext.Provider value={lang}>
        <div className="flex-1 w-full">
          <div
            aria-hidden="true"
            className="fixed inset-0 -z-10 bg-gradient-to-b from-amber-50/70 via-white to-stone-100 dark:from-slate-950 dark:via-slate-950 dark:to-black"
          />
          <FarewellScreen
            slug={slug}
            propertyName={property.name}
            reviewUrl={guest.premiumFeatures?.reviewUrl}
            waHref={waHostHref}
            checkoutDone={checkoutDone}
            feedbackDone={feedbackDone}
            stayOver={stayOver}
            remainingMs={farewellRemainingMs}
            onOpenInspection={() => setFarewellInspectionSignal((s) => s + 1)}
            onFeedbackSent={markFeedbackDone}
            onBack={() => setPostCheckout(false)}
          />
          {!checkoutDone && !stayOver ? (
            <CheckOutInspectionCard
              slug={slug}
              propertyName={property.name}
              guestNameHint={payload.stay?.guestName ?? null}
              minibarItems={guest.minibarItems}
              hidden
              openSignal={farewellInspectionSignal}
              onDone={markCheckoutDone}
              onSessionExpired={onSessionExpired}
            />
          ) : null}
        </div>
      </HubLangContext.Provider>
    );
  }

  return (
    // v4.33 — la langue choisie (auto-détectée/mémorisée) est fournie à
    // TOUTE l'arborescence invité via HubLangContext (ModuleCard, sections,
    // bandeaux et nouveaux modules traduisent via useHubLang()).
    <HubLangContext.Provider value={lang}>
      <div className="flex-1 w-full">
      {/* Fond fixe — dégradé neutre chaud très léger, zéro animation */}
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-10 bg-[radial-gradient(1100px_480px_at_50%_-8%,rgba(5, 84, 146,0.10),transparent_70%),radial-gradient(900px_420px_at_88%_6%,rgba(245,158,11,0.08),transparent_65%),linear-gradient(to_bottom,#FBFBFA,#FFFFFF,#F2F1EF)] dark:bg-[radial-gradient(1100px_500px_at_50%_-8%,rgba(212,175,55,0.13),transparent_68%),radial-gradient(900px_440px_at_88%_8%,rgba(217,119,6,0.08),transparent_62%),linear-gradient(to_bottom,#131009,#0B0906,#040302)]"
      />

      {/* ── v4.51 « SMART HEADER » — bandeau fixe des grands écrans :
          prénom de l'invité + date/heure temps réel + météo locale.
          Masqué < lg (mobile garde le hero compact historique) — le
          hero reçoit un padding haut équivalent sur lg. ── */}
      <SmartHeader
        slug={slug}
        guestName={payload.stay?.guestName}
        className="hidden lg:flex"
      />

      {/* ── v4.78 « HUB IMMERSIF » — HERO PHOTO PLEIN ÉCRAN ──
          Le hub déverrouillé devient un écran immersif : la photo du
          bien (ou un appartement premium curated) occupe toute la
          largeur de l'écran (edge-to-edge), et les cartes du hub
          remontent EN SUPERPOSITION sur le bas de l'image (verre
          dépoli). La page d'accueil invité (avant hub) reste
          inchangée — refonte demandée pour le hub uniquement. ── */}
      <section aria-label="Espace invité" className="relative w-full">
        <div className="relative h-[440px] w-full overflow-hidden sm:h-[60svh] sm:max-h-[760px] lg:h-[70svh]">
          <Image
            src={photos.hero ?? '/hub-apartment-hero.jpg'}
            alt=""
            fill
            priority
            unoptimized
            sizes="100vw"
            className="hub-kenburns object-cover object-center"
          />
          {/* Voile haut léger — lisibilité des contrôles blancs */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/45 via-black/15 to-transparent"
          />
          {/* v4.78 — fondu bas vers le fond de page : la photo se fond
              dans le hub, les cartes « flottent » en superposition. */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent via-[#FBFBFA]/50 to-[#FBFBFA] sm:h-44 lg:h-48 dark:via-[#131009]/45 dark:to-[#131009]"
          />

          {/* Retour + pill signature + langue + thème — au-dessus de la photo.
              lg : décalé sous le SmartHeader fixe (barre verre). */}
          <div className="absolute top-4 left-4 right-4 flex items-center lg:top-[4.5rem] lg:left-8 lg:right-8">
            <button
              type="button"
              onClick={onBack}
              aria-label="Retour à l’accueil"
              className="h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-xl border border-white/40 bg-white/85 text-slate-800 shadow-sm backdrop-blur-md transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white active:scale-95"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <span className="ml-3 hidden min-[420px]:inline-flex items-center gap-1.5 rounded-full border border-white/40 bg-white/80 px-3 py-1.5 text-[11px] font-medium tracking-wide text-slate-700 shadow-sm backdrop-blur-md">
              {tL('✨ Expérience RoomScan')}
            </span>
            {/* v4.50 « COMPTE À REBOURS DU SÉJOUR » — badge discret mais
                clair en haut du hub : « ⏳ 01j 14h 22m ». Au clic, la
                modal rappelle l'heure de check-out + consignes + départ
                tardif. Rouge clignotant quand il reste moins de 2 h. */}
            {lockActive && stayRemainingMs != null && stayRemainingMs > 0 ? (
              <button
                type="button"
                onClick={() => setCountdownOpen(true)}
                aria-label={`Temps restant avant le départ : ${formatRemaining(stayRemainingMs)} — voir les détails`}
                className={cn(
                  'ml-2 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold shadow-sm backdrop-blur-md transition-colors',
                  stayRemainingMs < 2 * 3_600_000
                    ? 'animate-pulse border-red-300/60 bg-red-600/90 text-white'
                    : 'border-white/40 bg-white/85 text-slate-800 hover:bg-white',
                )}
              >
                <span aria-hidden="true">⏳</span>
                <span className="tabular-nums">{formatRemaining(stayRemainingMs)}</span>
              </button>
            ) : null}
            {/* v4.33 — langue (traduction instantanée IA) puis thème */}
            <LangSwitcher lang={lang} onChange={changeLang} className="ml-auto" />
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? 'Activer le mode clair' : 'Activer le mode sombre'}
              title={theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
              className="ml-2 h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-xl border border-white/40 bg-white/85 text-slate-800 shadow-sm backdrop-blur-md transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white active:scale-95"
            >
              {theme === 'dark' ? (
                <Sun className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Moon className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </section>

      {/* ── CONTENU — « wallet » de cartes premium (Task 30, itération 3)
          v4.78 « SUPERPOSITION » — le bloc remonte sur le bas de la
          photo (marge négative) : la carte d'accueil flottante en verre
          dépoli porte le titre du bien + la salutation de l'invité. ── */}
      <div className="relative z-10 -mt-32 w-full max-w-lg sm:max-w-2xl sm:-mt-36 lg:max-w-4xl lg:-mt-40 xl:max-w-6xl 2xl:max-w-7xl mx-auto px-4 flex-1 flex flex-col">
        {/* Carte flottante — titre du bien + salutation (verre dépoli) */}
        <div className="mx-auto w-full rounded-[28px] border border-white/60 bg-white/85 p-5 text-center shadow-[0_28px_70px_-30px_rgba(15,23,42,0.45)] backdrop-blur-xl sm:p-6 dark:border-white/10 dark:bg-slate-900/85 dark:shadow-[0_28px_70px_-30px_rgba(0,0,0,0.8)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500 dark:text-[#A89F91]">
            {tL('👤 Espace Invité')}
          </p>
          <h1 className="display-title font-serif! mt-1.5 text-2xl font-bold leading-tight text-slate-900 dark:text-[#F5EFE6] sm:text-3xl lg:text-4xl">
            {property.name}
          </h1>
          {/* v5.0 — sous-titre localisation (donnée existante, repli silencieux). */}
          {property.address ? (
            <p className="mt-1.5 flex min-w-0 items-center justify-center gap-1.5 text-xs font-medium text-stone-500 dark:text-[#A89F91] sm:text-sm">
              <span aria-hidden="true" className="shrink-0">📍</span>
              <span className="truncate">{property.address}</span>
            </p>
          ) : null}
          {/* ── v4.49 « PERSONNALISATION » — salutation du prénom de
              l'invité en cours (issu du calendrier/iCal Airbnb). Le
              prénom est rendu BRUT (jamais passé au traducteur tL). ── */}
          <div className="mt-3 border-t border-stone-200/70 pt-3 dark:border-white/10">
            <p className="text-[13px] text-slate-500 dark:text-slate-400">
              {payload.stay?.guestName ? (
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  {`👋 ${tL('Bonjour')} ${payload.stay.guestName}`}
                </span>
              ) : null}
              {payload.stay?.guestName ? <br /> : null}
              {tL('✨ Tout votre séjour au même endroit.')}
            </p>
          </div>
        </div>

        {/* ── v4.49 « WIDGET MÉTÉO » — temps actuel + 3 jours du logement
            (Open-Meteo, sans clé, cache serveur 30 min). Masqué si le
            bien n'a pas de coordonnées ou si l'API échoue. ── */}
        {property.latitude != null && property.longitude != null && (
          <WeatherCard slug={slug} />
        )}

        {/* ── v4.74 « SMART PROMPTS » — carte notification contextuelle
            (petit-déjeuner / déjeuner / dîner / veille de départ).
            Overlay fixe, jamais bloquant, disparaît seule après la
            durée configurée par l'hôte. ── */}
        {smart.active && (
          <SmartNotification
            type={smart.active.type}
            title={smart.active.title}
            message={smart.active.message}
            duration={smart.active.duration}
            onClose={smart.dismiss}
            actionLabel={
              smart.active.type === 'checkout_reminder'
                ? 'Voir la boutique'
                : (smartActionLabel[smart.active.type] ?? 'Commander')
            }
            onAction={() => {
              const target = smartActionTarget[smart.active?.type ?? 'breakfast'];
              smart.dismiss();
              requestAnimationFrame(() => {
                document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              });
            }}
          />
        )}

        {/* ── v4.82 « AU-REVOIR EN COURS » — l'invité a confirmé son
            départ (écran d'au-revoir) puis est revenu sur le hub : le
            compte à rebours de verrouillage CONTINUE et un bandeau
            discret le rappelle en permanence. ── */}
        {!postCheckout && farewellRemainingMs != null && farewellRemainingMs > 0 ? (
          <div
            role="status"
            className={cn(
              'mx-auto mt-4 flex w-full items-center gap-3 rounded-2xl border p-4 shadow-[0_12px_32px_-16px_rgba(217,119,6,0.45)]',
              farewellRemainingMs <= 60_000
                ? 'animate-pulse border-red-300/70 bg-gradient-to-r from-red-50 to-orange-50 dark:border-red-500/40 dark:from-red-950/60 dark:to-orange-950/50'
                : 'border-amber-300/70 bg-gradient-to-r from-amber-50 to-orange-50 dark:border-amber-500/40 dark:from-amber-950/60 dark:to-orange-950/50',
            )}
          >
            <span aria-hidden="true" className="text-2xl leading-none">👋</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
                {tL('Départ confirmé — merci pour votre séjour !')}
              </p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-amber-800/90 dark:text-amber-300/90">
                {tL('Le hub se verrouille automatiquement dans')}{' '}
                <strong className="tabular-nums">{farewellClockMs(farewellRemainingMs)}</strong>
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              className="h-10 shrink-0 bg-amber-500 font-bold text-white hover:bg-amber-600"
              onClick={() => setPostCheckout(true)}
            >
              {tL('Voir l’écran de départ')}
            </Button>
          </div>
        ) : null}

        {/* ── v4.53 « PRÊT POUR L'ARRIVÉE » — la femme de ménage a validé
            ses preuves et fermé le hub Clean AVANT l'arrivée : le
            voyageur (scannant avant son check-in ou déjà sur place)
            voit la bonne nouvelle en tête de son Hub. ── */}
        {payload.stay?.readyForArrival && !stayOver ? (
          <div
            role="status"
            className="mx-auto mt-4 flex w-full items-start gap-3 rounded-2xl border border-emerald-300/70 bg-gradient-to-r from-emerald-50 to-teal-50 p-4 shadow-[0_12px_32px_-16px_rgba(5,150,105,0.45)] dark:border-emerald-500/40 dark:from-emerald-950/60 dark:to-teal-950/50"
          >
            <span aria-hidden="true" className="text-2xl leading-none">✅</span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                {tL('Bonne nouvelle ! Votre logement est prêt.')}
              </p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-emerald-800/90 dark:text-emerald-300/90">
                {tL('Votre logement est propre et prêt à vous accueillir plus tôt que prévu — arrivez dès que vous le souhaitez.')}
              </p>
            </div>
          </div>
        ) : null}

        {/* ── v4.33 « COMPTE À REBOURS CHECK-OUT » — jour du départ (J) :
            « Votre départ est prévu à 11 h. Besoin de plus de temps ?
            Prolongez jusqu'à 14 h pour 25 € » — le meilleur moment pour
            vendre un late check-out. Masqué les autres jours ET après
            l'heure de check-out (v4.41, demande client).
            v4.79 — le CTA de prolongation disparaît dès que la demande
            est envoyée (le compte à rebours reste utile). */}
        {payload.stay?.isCheckoutDay && !checkoutPassed ? (
          <div className="mx-auto mt-4 w-full">
            <CheckoutCountdownBanner
              slug={slug}
              enabled={!!guest.premiumFeatures?.enableLateCheckout}
              price={guest.premiumFeatures?.lateCheckoutPrice}
              lateHour={guest.premiumFeatures?.lateCheckoutHour}
              lateRequested={lateRequested}
              onLateRequested={markLateRequested}
            />
          </div>
        ) : null}

        {/* ── v4.35 « REVIEW BOOSTER » — la veille du départ (soir) et le
            matin J : micro-questionnaire 👍/👎 → avis public 2 clics ou
            retour PRIVÉ (bouclier d'avis). Mémo localStorage.
            v4.79 — masqué dès qu'un avis privé est envoyé (ce séjour). ── */}
        {reviewBoosterWindow && !feedbackDone ? (
          <ReviewBoosterBanner
            slug={slug}
            reviewUrl={guest.premiumFeatures?.reviewUrl}
            waHref={waHostHref}
            propertyName={property.name}
            stayKey={stayKey}
            onPrivateSent={markFeedbackDone}
          />
        ) : null}

        {/* ── v4.35 « SOIR DE DÉPART » — la veille au soir (≥ 18 h),
            « Départ tardif » et « Bouclier d'avis » montent EN TÊTE DE
            PAGE (demande client : plus de visibilité) avec habillage
            rouge « Ce soir : préparez votre départ ». ── */}
        {eveningBeforeDeparture && (lateNode || reviewNode) ? (
          <div className="mx-auto mt-4 w-full overflow-hidden rounded-3xl border-2 border-red-200/70 bg-white/90 shadow-[0_18px_44px_-20px_rgba(190,18,60,0.3)] dark:border-red-500/40 dark:bg-slate-900/85">
            <div className="rounded-[22px] bg-white/85 p-3 dark:bg-slate-900/85">
              <p className="flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-red-600 dark:text-red-400">
                <span aria-hidden="true" className="animate-pulse">🌙</span>
                {tL('Ce soir : préparez votre départ')}
              </p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {lateNode}
                {reviewNode}
              </div>
            </div>
          </div>
        ) : null}

        {/* ── FLAGSHIP 1+2 : 📶 Wi-Fi + 🥐 Services — côte à côte en desktop
            (responsive v4.36 : grille 2 colonnes ≥ lg, empilés en mobile)
            v4.46 : le bandeau « Réservation directe » quitte le HAUT de
            page — les essentiels d'abord, la conversion en fin de parcours
            (le bandeau est déplacé sous la section « Besoin d'aide ? »). ── */}
        <div className="mx-auto grid w-full grid-cols-1 items-start gap-0 lg:grid-cols-2 lg:gap-6">
          {guest.wifi ? <WifiPremiumCard wifi={guest.wifi} copy={copy} /> : null}

          {/* ── FLAGSHIP 2 : 🥐 Services & Expériences — même anatomie carte ── */}
          <ServicesCard
            services={guest.services}
            contact={guest.contact}
            property={property}
            slug={slug}
            photoOverride={photos.services}
          />
        </div>

        {/* ── v4.31 « POUR VOUS » — sélection adaptée au moment du séjour ── */}
        <ForYouStrip entries={forYou} onJump={jumpTo} onOpen={openForYou} />

        {/* ── SECTION 1 : VOTRE LOGEMENT (ordre adapté au moment — v4.31) ── */}
        <SectionLabel>{tL('🏠 Votre logement')}</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5 xl:gap-6 items-stretch">
          {sec1Nodes}
        </div>

        {/* ── SECTION 2 : PENDANT VOTRE SÉJOUR (ordre adapté au moment — v4.31) ── */}
        <SectionLabel>{tL('✨ Pendant votre séjour')}</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5 xl:gap-6 items-stretch">
          {sec2Nodes}
        </div>

        {/* ── SECTION 3 : BESOIN D'AIDE ? ── */}
        <SectionLabel>{tL('🆘 Besoin d’aide ?')}</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5 xl:gap-6 items-stretch">
          {/* 📨 v4.71 « MESSAGES DE L'HÔTE » — déménagé depuis « Pendant
              votre séjour » : la messagerie est le 1er réflexe d'aide
              (demande client). Badge non-lu partagé avec « Contacter
              l'hôte » + pastille commande en préparation. */}
          <div id="hub-card-messages" className="flex h-full flex-col">
            <ModuleCard
              emoji="📨"
              tone="emerald"
              eyebrow="Votre hôte"
              title="Messages de l'hôte"
              subtitle="Vocaux de votre hôte et vos réponses — au même endroit"
              imageUrl={photos.host ?? HUB_VISUALS.host}
              onClick={() => setMessagesOpen(true)}
              urgentLabel={
                newReplyIds.length > 0
                  ? tL('💬 Nouveau message !')
                  : preparingOrders.length > 0
                    ? tL('🧺 Commande en préparation !')
                    : undefined
              }
            >
              <span className="flex flex-wrap gap-1.5">
                <PreviewChip>🎤 Vocaux</PreviewChip>
                <PreviewChip>🎙️ Répondre par vocal</PreviewChip>
                <PreviewChip>✍️ Réponses</PreviewChip>
                {preparingOrders.length > 0 && <PreviewChip>🧺 Commande en préparation</PreviewChip>}
              </span>
            </ModuleCard>
          </div>

          {/* 🚨 v4.33 SOS Logement — urgence en 1 clic (notification hôte
              immédiate : heure + adresse) + v4.41 casse 1 clic avec photo
              et lien « produit de remplacement » configuré par l'hôte.
              v4.51 — ancre #hub-card-sos pour la barre rapide tablette. */}
          <div id="hub-card-sos" className="flex h-full flex-col">
            <SosAlertCard
              slug={slug}
              photoOverride={photos.sos}
              breakageShopUrl={guest.emergency?.breakageShopUrl ?? null}
            />
          </div>

          {/* 🆘 SOS & Urgences — toujours visible (numéros nationaux + DB) */}
          <SosCard key="sos" emergency={guest.emergency} photoOverride={photos.sos} />

          {/* v4.47 — « Signaler un problème » SUPPRIMÉ (redondant avec
              SOS Logement qui devient la voie unique de signalement).

          📞 Contacter l'hôte — v4.35 : clignote en ROUGE + pill
              « Nouveau message ! » tant qu'une réponse vocale de l'hôte
              n'a pas été vue (plus bip mp3 au polling). */}
          <ModuleCard
            key="hostcontact"
            emoji="📞"
            tone="emerald"
            eyebrow="Votre hôte"
            title="Contacter l'hôte"
            subtitle={`${guest.contact.name} — appel, email, vocal`}
            imageUrl={photos.host ?? HUB_VISUALS.host}
            onClick={() => setContactOpen(true)}
            urgentLabel={newReplyIds.length > 0 ? tL('💬 Nouveau message !') : undefined}
          >
            <span className="flex flex-wrap gap-1.5">
              <PreviewChip>📞 Appel</PreviewChip>
              <PreviewChip>✉️ Email</PreviewChip>
              <PreviewChip>🎤 Vocal</PreviewChip>
            </span>
          </ModuleCard>
        </div>

        {/* ── v4.46 « RÉSERVATION DIRECTE » — déplacé en BAS de page
            (réorganisation accueil invité) : l'invité voit d'abord les
            essentiels (Wi-Fi, services, logement, aide), la conversion
            B2B « -15 % sans frais » arrive en fin de parcours, au moment
            où il pense déjà à son prochain séjour. Toujours masqué dès
            que le séjour est terminé (réinitialisation v4.46) ou le
            jour J après l'heure de check-out (v4.41). ── */}
        {!checkoutPassed && (
          <DirectBookingBanner
            discount={guest.premiumFeatures?.directBookingDiscount ?? 15}
            url={guest.premiumFeatures?.directBookingUrl}
            waHref={waHostHref}
            propertyName={property.name}
          />
        )}

        {/* ── v4.71 « UN MOT DE VOTRE HÔTE » — carte mise en avant au
            retour du guidebook : lecture 1 clic (l'autoplay a déjà été
            tenté à la sortie ; cette carte reste si le navigateur
            l'a bloqué). Dismissible. ── */}
        {/* ── v4.77 — carte amber « Un mot de votre hôte » SUPPRIMÉE de
            l'accueil (option A : voix du guidebook seulement dans le guide). ── */}

        {/* ── v4.37 « MESSAGES VOCAUX » — pill flottante « réécouter » :
            visible dès qu'une voix s'est déclenchée (secours autoplay
            refusé + réécoute libre). Discret, au-dessus du footer. ── */}
        {voiceKind ? (
          <div className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 lg:bottom-28">
            <button
              type="button"
              onClick={replayVoice}
              aria-label="Réécouter le message vocal de votre hôte"
              className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-amber-200/80 bg-white/95 px-4 py-2.5 text-[13px] font-semibold text-slate-700 shadow-[0_14px_36px_-14px_rgba(15,23,42,0.45)] backdrop-blur-md transition-transform active:scale-95 dark:border-amber-500/30 dark:bg-slate-900/90 dark:text-slate-200"
            >
              <Volume2 className="h-4 w-4 text-amber-500" aria-hidden="true" />
              {tL('🔊 Réécouter le message')}
            </button>
          </div>
        ) : null}

        {/* ── v4.51 « MODE AMBIANCE » — écran de veille intelligent des
            tablettes posées dans le salon : après 2 min d'inactivité,
            diaporama des plus belles photos du bien + horloge massive
            + météo + citation voyage. Toute interaction réveille le hub. ── */}
        <TabletScreensaver
          photos={screensaverPhotos}
          propertyName={property.name}
          slug={slug}
        />

        {/* ── v4.51 « BARRE D'ACCÈS RAPIDE » — pilule glassmorphism
            flottante (grands écrans) : Accueil, Wi-Fi 1 clic, SOS,
            Mode nuit. ── */}
        <TabletQuickActions
          wifiPassword={guest.wifi?.password ?? null}
          theme={theme}
          onHome={onBack}
          onCopyWifi={() => {
            if (guest.wifi) void copy(guest.wifi.password, 'Mot de passe Wi-Fi');
          }}
          onSos={() => jumpTo('hub-card-sos')}
          onToggleTheme={onToggleTheme}
        />

        {/* ── v4.43 « RETOUR À LA MAISON » — bouton flottant GPS ──
            Si l'hôte a renseigné les coordonnées exactes du logement
            (autocomplétion d'adresse du dashboard), l'invité perdu en
            ville retrouve son logement.
            v4.49 (demande client) : le clic n'ouvre PLUS Google Maps
            directement — il ouvre un écran explicatif (« ce module va
            vous aider à retourner à la maison… ») avec le grand bouton
            « 🧭 Cliquez pour rentrer » qui lance le GPS NATIF du
            téléphone (Plans sur iPhone, Maps sur Android, à pied). */}
        {property.latitude != null && property.longitude != null && (
          <>
            <motion.button
              type="button"
              onClick={() => setHomeGuideOpen(true)}
              aria-label="Retour à la maison — ouvrir le guide de rentrée GPS"
              initial={{ opacity: 0, scale: 0.8, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 0.5, type: 'spring', stiffness: 260, damping: 18 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="fixed bottom-6 right-4 z-40 inline-flex items-center gap-2.5 rounded-full border border-stone-200/80 bg-white/95 px-6 py-3.5 text-sm font-bold text-slate-800 air-shadow-lg backdrop-blur-md transition-shadow hover:shadow-xl dark:border-white/15 dark:bg-slate-900/90 dark:text-slate-100 sm:right-6 lg:right-8"
            >
              <Home
                className="h-5 w-5 shrink-0 animate-pulse text-[#055492]"
                aria-hidden="true"
              />
              {tL('🚶 Retour à la maison')}
            </motion.button>
            <HomeGuideDialog
              open={homeGuideOpen}
              onOpenChange={setHomeGuideOpen}
              lat={property.latitude}
              lng={property.longitude}
              propertyName={property.name}
            />
          </>
        )}

      <footer className="mt-auto pt-10 pb-6 text-center">
        <div aria-hidden="true" className="mx-auto mb-6 h-px w-full max-w-md bg-gradient-to-r from-transparent via-stone-200 to-transparent" />
        <p className="text-xs text-stone-400 dark:text-slate-500">
          {tL('Propulsé par')}{' '}
          <span className="font-semibold text-stone-500 dark:text-slate-400">RoomScan</span>
        </p>
      </footer>

      <ContactDialog
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        slug={slug}
        contact={guest.contact}
        propertyName={property.name}
        newReplyCount={newReplyIds.length}
        onRepliesSeen={markRepliesSeen}
      />

      {/* ── v4.77 « MESSAGES DE L'HÔTE » — onglet messagerie threadée :
          vocaux de l'hôte + réponses vocales de l'invité (couleurs
          distinctes), réponses écrites aux souvenirs, suivi commandes. ── */}
      <HostMessagesDialog
        open={messagesOpen}
        onOpenChange={setMessagesOpen}
        slug={slug}
        guestName={payload.stay?.guestName ?? null}
        memoriesWithHostReply={payload.guest.memoriesWithHostReply}
        newReplyIds={newReplyIds}
        onRepliesSeen={markRepliesSeen}
        orderUpdates={orderUpdates}
      />

      {/* ── v4.52 « LIVRE D'OR VIVANT » — galerie plein écran : souvenirs
          modérés (épinglés d'abord), filtres, lecteur audio, réponses
          hôte + formulaire « Laisser mon souvenir ». ── */}
      <MemoriesGallery
        open={memoriesOpen}
        onClose={() => setMemoriesOpen(false)}
        slug={slug}
        propertyName={property.name}
        guestName={payload.stay?.guestName ?? null}
      />

      {/* ── v4.50 « COMPTE À REBOURS DU SÉJOUR » — modal au clic du badge :
          heure exacte de check-out obligatoire, consignes de départ,
          bouton « Demander un départ tardif » (si activé par l'hôte).
          Le hub se verrouille automatiquement à la fin du compte. ── */}
      {lockActive && (
        <TileDialog
          open={countdownOpen}
          onOpenChange={setCountdownOpen}
          emoji="⏳"
          tone="amber"
          title={tL('Votre départ')}
          subtitle={tL('Le hub se verrouille automatiquement à la fin de votre séjour')}
        >
          {stayEndTime ? (
            <>
              <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-center dark:border-amber-500/20 dark:bg-amber-500/10">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
                  {tL('Check-out obligatoire')}
                </p>
                <p className="mt-1 font-serif text-xl font-bold text-slate-900 dark:text-white">
                  {new Date(stayEndTime).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}{' '}
                  ·{' '}
                  {new Date(stayEndTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </p>
                {stayRemainingMs != null && stayRemainingMs > 0 ? (
                  <p className="mt-1 text-sm font-bold tabular-nums text-amber-700 dark:text-amber-300">
                    {tL('Temps restant')} : {formatRemaining(stayRemainingMs)}
                  </p>
                ) : (
                  <p className="mt-1 text-sm font-bold text-red-600 dark:text-red-400">
                    {tL('Temps écoulé — le hub va se verrouiller')}
                  </p>
                )}
                {payload.stay?.lateCheckOutUntil ? (
                  <p className="mt-2 rounded-xl bg-emerald-100/70 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                    ✅ {tL('Départ tardif validé par votre hôte — prolongé jusqu’à')}{' '}
                    {new Date(payload.stay.lateCheckOutUntil).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                ) : null}
              </div>

              {/* Consignes de départ */}
              <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/5">
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">
                  {tL('📋 Consignes de départ')}
                </p>
                <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                  {payload.hubLock?.checkoutInstructions
                    ? payload.hubLock.checkoutInstructions
                    : tL('Laissez les clés sur la table de la cuisine, éteignez la climatisation et le chauffage, fermez les fenêtres et rendez les clés à votre hôte.')}
                </p>
              </div>

              {/* Départ tardif (si activé par l'hôte) */}
              {guest.premiumFeatures?.enableLateCheckout && payload.hubLock?.allowLateRequest !== false ? (
                <Button
                  type="button"
                  disabled={lateRequestBusy}
                  onClick={() => void requestLateFromModal()}
                  className="mt-3 h-auto min-h-12 w-full bg-amber-500 py-3 text-sm font-bold text-white hover:bg-amber-600"
                >
                  {lateRequestBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Clock4 className="h-4 w-4" aria-hidden="true" />
                  )}
                  {tL('Demander un départ tardif')}
                  {guest.premiumFeatures?.lateCheckoutPrice
                    ? ` (${formatEur(guest.premiumFeatures.lateCheckoutPrice)})`
                    : ''}
                </Button>
              ) : null}
              <p className="mt-2 text-center text-[11px] text-slate-500 dark:text-slate-400">
                {tL('En cas de prolongement validé, votre compte à rebours se rallonge automatiquement.')}
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {tL('Les informations de votre séjour ne sont pas encore disponibles.')}
            </p>
          )}
        </TileDialog>
      )}
      </div>
      </div>
    </HubLangContext.Provider>
  );
}

/** Carte « Commander un service » — REFONTE SERVICES PREMIUM (V4.14).
 * Tuile XXL flagship (icône 64 px ambre + promesse « 1 clic »)
 * qui ouvre un OVERLAY PLEIN ÉCRAN reprenant l'expérience complète de la
 * PWA : header serif, recherche, chips catégories, carrousel
 * « Les plus demandés », panier flottant, checkout créneau 30 min,
 * paiement Stripe et confirmation confettis. Fini le mailto ! */
function ServicesCard({
  services,
  contact,
  property,
  slug,
  photoOverride,
}: {
  services: GuestService[];
  contact: HubPayload['guest']['contact'];
  property: HubPayload['property'];
  slug: string;
  /** v4.31 — photo perso de l'hôte (sinon 1re offre photographiée sinon curated). */
  photoOverride?: string | null;
}) {
  const [open, setOpen] = useState(false);

  // Scroll lock du fond pendant l'overlay (comme les Dialog shadcn).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const previews = services.slice(0, 4);
  const orderableCount = services.filter(
    (s) => s.offers.length > 0 || s.unitPrice != null,
  ).length;
  // v4.24 « HUB RÉEL » — la carte flagship porte la VRAIE photo du 1er
  // service photographié en filigrane (fallback : viennoiseries curated,
  // puis emoji 🥐 si la photo échoue — progressif).
  const cardPhoto =
    photoOverride ?? services.find((s) => s.imageUrl)?.imageUrl ?? HUB_VISUALS.breakfast;
  const [cardPhotoFailed, setCardPhotoFailed] = useState(false);

  return (
    <>
      {/* ── Carte flagship — v4.28 « PHOTO PLEINE CARTE » (Option A) :
          la photo du 1er service remplit TOUTE la carte ; onError →
          retour carte de crédit ambre historique (jamais de carte vide). ── */}
      {!cardPhotoFailed ? (
        <button
          type="button"
          onClick={() => services.length > 0 && setOpen(true)}
          disabled={services.length === 0}
          aria-label="Room Services & Expériences — commander"
          className={cn(
            'group relative mt-4 flex h-56 w-full flex-col justify-between overflow-hidden rounded-3xl border border-black/10 text-left sm:h-64 lg:mt-0',
            'shadow-[0_18px_44px_-20px_rgba(15,23,42,0.45)] transition-[border-color,box-shadow] duration-300',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80',
            services.length === 0 && 'cursor-default opacity-60 saturate-[0.5]',
          )}
        >
          <img
            src={cardPhoto}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            onError={() => setCardPhotoFailed(true)}
          />
          <span
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/15"
          />
          {/* Rangée 1 : puce EMV dorée + flèche */}
          <span className="relative flex items-start justify-between p-4">
            <span
              aria-hidden="true"
              className="relative mt-0.5 block h-8 w-11 rounded-md border border-amber-700/40 bg-gradient-to-br from-amber-200 via-yellow-400 to-amber-600 shadow-inner"
            >
              <span className="absolute inset-x-0 top-1/2 h-px bg-amber-900/30" />
              <span className="absolute inset-y-0 left-1/2 w-px bg-amber-900/30" />
            </span>
            {services.length > 0 && (
              <ArrowRight
                aria-hidden="true"
                className="h-5 w-5 shrink-0 text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)] transition-transform duration-300 group-hover:translate-x-1"
              />
            )}
          </span>
          {/* Textes blancs posés sur la photo */}
          <span className="relative flex flex-col p-4 pt-0">
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-200 drop-shadow-sm">
              <span aria-hidden="true" className="mr-1.5">🥐</span>
              Conciergerie · Commande en 1 clic
            </span>
            <span className="display-title font-serif! mt-0.5 text-xl font-bold leading-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.55)]">
              Room Services &amp; Expériences
            </span>
            <span className="mt-1 line-clamp-2 text-xs leading-snug text-white/85 drop-shadow-sm">
              {services.length > 0
                ? `Commandez en 1 clic, livré à votre porte — ${services.length} expérience${services.length > 1 ? 's' : ''} autour de ${property.name}`
                : 'Aucun service pour le moment'}
            </span>
            {services.length > 0 && (
              <span className="mt-3 flex flex-col gap-2.5 border-t border-white/25 pt-3">
                {/* Aperçus des couvertures — vignettes verre sur la photo */}
                <span className="flex flex-wrap items-center gap-2">
                  {previews.map((svc) => (
                    <ServiceCover
                      key={svc.id}
                      emoji={svc.emoji}
                      categoryLabel={svc.categoryLabel}
                      imageUrl={svc.imageUrl}
                      alt={`Photo — ${svc.name}`}
                      className="h-14 w-14 rounded-xl shrink-0"
                      emojiClassName="text-2xl"
                    />
                  ))}
                  {services.length > previews.length && (
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-white/30 bg-white/20 backdrop-blur-sm">
                      <span className="text-xs font-bold text-white drop-shadow-sm">
                        +{services.length - previews.length}
                      </span>
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-1 text-[11px] font-semibold text-white/90 drop-shadow-sm">
                  {orderableCount > 0 ? (
                    <>
                      <span aria-hidden="true">⚡</span>
                      Paiement sécurisé · Créneau au choix · Suivi en direct
                    </>
                  ) : (
                    <>
                      <span aria-hidden="true">✉️</span>
                      Votre hôte organise la réservation pour vous
                    </>
                  )}
                </span>
              </span>
            )}
          </span>
        </button>
      ) : (
        /* FALLBACK — carte de crédit ambre historique (photo échouée) */
        <button
          type="button"
          onClick={() => services.length > 0 && setOpen(true)}
          disabled={services.length === 0}
          aria-label="Room Services & Expériences — commander"
          className={cn(
            'group relative mt-4 flex w-full flex-col overflow-hidden rounded-3xl border border-amber-200/80 p-5 text-left text-slate-900 dark:border-amber-500/25 dark:hover:border-amber-400/50 dark:text-slate-100 lg:mt-0',
            'bg-gradient-to-br from-white via-white to-amber-50/80 dark:from-[#181410] dark:via-[#14110C] dark:to-amber-950/50',
            'shadow-[0_18px_44px_-20px_rgba(15,23,42,0.28)] transition-[border-color,box-shadow] duration-300',
            'hover:border-amber-300 hover:shadow-[0_24px_52px_-20px_rgba(15,23,42,0.4)]',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40',
            services.length === 0 && 'cursor-default opacity-60',
          )}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-2 -top-6 select-none text-[96px] leading-none opacity-[0.09]"
          >
            🥐
          </span>
        {/* Rangée 1 : puce EMV dorée + flèche */}
        <span className="relative flex items-start justify-between">
          <span
            aria-hidden="true"
            className="relative mt-0.5 block h-8 w-11 rounded-md border border-amber-700/40 bg-gradient-to-br from-amber-200 via-yellow-400 to-amber-600 shadow-inner"
          >
            <span className="absolute inset-x-0 top-1/2 h-px bg-amber-900/30" />
            <span className="absolute inset-y-0 left-1/2 w-px bg-amber-900/30" />
          </span>
          {services.length > 0 && (
            <ArrowRight
              aria-hidden="true"
              className="h-5 w-5 shrink-0 text-slate-400 transition-transform duration-300 group-hover:translate-x-1"
            />
          )}
        </span>

        {/* Eyebrow + titre serif */}
        <span className="relative mt-3.5 text-[10px] font-bold uppercase tracking-[0.25em] text-amber-500 dark:text-amber-300">
          <span aria-hidden="true" className="mr-1.5">🥐</span>
          Conciergerie · Commande en 1 clic
        </span>
        <span className="display-title font-serif! relative mt-0.5 text-xl font-bold leading-tight text-slate-900 dark:text-white lg:text-2xl">
          Room Services &amp; Expériences
        </span>
        <span className="relative mt-1 line-clamp-2 text-xs leading-snug text-slate-500 dark:text-slate-400">
          {services.length > 0
            ? `Commandez en 1 clic, livré à votre porte — ${services.length} expérience${services.length > 1 ? 's' : ''} autour de ${property.name}`
            : 'Aucun service pour le moment'}
        </span>

        {services.length > 0 && (
          <span className="relative mt-3.5 flex flex-col gap-2.5 border-t border-amber-200/60 pt-3.5 dark:border-white/10">
            {/* Aperçus des couvertures — VRAIES PHOTOS (v4.23 « hub réel »,
                fallback gradient+emoji si l'offre n'a pas de photo) */}
            <span className="flex items-center gap-2">
              {previews.map((svc) => (
                <ServiceCover
                  key={svc.id}
                  emoji={svc.emoji}
                  categoryLabel={svc.categoryLabel}
                  imageUrl={svc.imageUrl}
                  alt={`Photo — ${svc.name}`}
                  className="h-14 w-14 rounded-xl shrink-0"
                  emojiClassName="text-2xl"
                />
              ))}
              {services.length > previews.length && (
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-white/10">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                    +{services.length - previews.length}
                  </span>
                </span>
              )}
            </span>
            <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
              {orderableCount > 0 ? (
                <>
                  <span aria-hidden="true">⚡</span>
                  Paiement sécurisé · Créneau au choix · Suivi en direct
                </>
              ) : (
                <>
                  <span aria-hidden="true">✉️</span>
                  Votre hôte organise la réservation pour vous
                </>
              )}
            </span>
          </span>
        )}
      </button>
      )}

      {/* ── Overlay plein écran — expérience conciergerie complète ──
       * createPortal(document.body) : le portail rattache l'overlay
       * (panier flottant, checkout, bottom-sheet en fixed) au viewport,
       * indépendamment de l'arbre d'origine. */}
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex flex-col bg-background"
            role="dialog"
            aria-modal="true"
            aria-label="Room Services & Expériences"
          >
            {/* Header sticky : retour + titre serif */}
            <header className="shrink-0 border-b border-slate-200/70 dark:border-white/10 bg-background/85 backdrop-blur-xl">
              <div className="mx-auto max-w-lg sm:max-w-2xl px-4 h-14 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="h-9 w-9 -ml-1.5 rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
                  aria-label="Retour au hub"
                >
                  <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                </button>
                <h1 className="font-serif text-lg font-bold text-slate-900 dark:text-white truncate">
                  🛎️ Room Services &amp; Expériences
                </h1>
              </div>
            </header>

            {/* Contenu scrollable = l'expérience PWA complète */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              <div className="mx-auto max-w-lg sm:max-w-2xl px-4 py-5 pb-40">
                <TabServices
                  slug={slug}
                  services={services}
                  contact={contact}
                  propertyName={property.name}
                  booking={null}
                  bookingId={null}
                  online={typeof navigator === 'undefined' ? true : navigator.onLine}
                  embedded
                  onNavigate={() => setOpen(false)}
                />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

// =============================================================
// MODULES PREMIUM (parité PWA) — vidéo bienvenue, guide des
// appareils, kit de survie, late check-out (upselling), bouclier
// d'avis. Données Expérience Invité + concierge servies par
// /api/public/hub/[slug] (propriétés Property.appliances /
// premiumFeatures / survivalKitItems).
// =============================================================

/** 🎬 Vidéo de bienvenue — média local → lecteur intégré (<video>) ;
 * YouTube/Vimeo/Loom → bouton d'ouverture (la CSP bloque les iframes
 * externes, choix sécurité assumé — cf. isYouTubeUrl()). */
function WelcomeVideoCard({
  url,
  propertyName,
  open,
  onOpenChange,
  photoOverride,
}: {
  url: string;
  propertyName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** v4.31 — photo perso de l'hôte. */
  photoOverride?: string | null;
}) {
  const local = isLocalMediaUrl(url);
  const yt = isYouTubeUrl(url);
  return (
    <>
      <ModuleCard
        emoji="🎬"
        tone="rose"
        eyebrow="Message de votre hôte"
        title="Vidéo de bienvenue"
        subtitle="Votre hôte vous explique tout en vidéo"
        imageUrl={photoOverride ?? HUB_VISUALS.welcome}
        onClick={local ? () => onOpenChange(true) : () => window.open(url, '_blank', 'noopener,noreferrer')}
      >
        <span className="flex flex-wrap gap-1.5">
          <PreviewChip>{local ? '▶ Lecture intégrée' : '▶ Ouvrir la vidéo'}</PreviewChip>
        </span>
      </ModuleCard>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md bg-white border border-slate-200 rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              🎬 Vidéo de bienvenue — {propertyName}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              {local ? 'Lecture intégrée.' : 'La vidéo est hébergée en externe (YouTube, Vimeo, Loom) — elle s’ouvre dans un nouvel onglet.'}
            </DialogDescription>
          </DialogHeader>
          {local ? (
            <video
              controls
              autoPlay
              playsInline
              className="w-full rounded-xl border border-slate-200 bg-black"
              src={url}
            />
          ) : (
            <Button
              type="button"
              className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white font-semibold"
              onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
            >
              <Play className="h-4 w-4" aria-hidden="true" /> Ouvrir la vidéo
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** v4.68 « VOCALE DU GUIDEBOOK » — lecteur compact « 🎙️ Écouter
 *  l'explication de l'hôte » (kind 'guidebook' — route audio publique
 *  /voice-messages/audio, repli FR géré côté serveur). Rend null si
 *  aucune voix n'est configurée : le bloc disparaît proprement. */
function GuidebookVoicePlayer({
  slug,
  info,
}: {
  slug: string;
  info?: { langs: string[]; v: string } | null;
}) {
  const { t } = useHubLang();
  const [failed, setFailed] = useState(false);
  const hasVoice = !!info && Array.isArray(info.langs) && info.langs.length > 0;
  if (!hasVoice || failed) return null;
  // Langue du téléphone si disponible, sinon FR (le serveur gère aussi
  // le repli FR si la langue demandée n'existe pas).
  const deviceLang = detectVoiceLang();
  const lang = (info!.langs.includes(deviceLang) ? deviceLang : 'fr') as HubVoiceLang;
  const url =
    `/api/public/hub/${encodeURIComponent(slug)}/voice-messages/audio` +
    `?kind=guidebook&lang=${lang}&v=${encodeURIComponent(info!.v)}`;
  return (
    <div className="mt-3 rounded-2xl border border-[#055492]/25 bg-[#dceaf5]/70 p-3 dark:border-[#055492]/40 dark:bg-[#055492]/10">
      <p className="flex items-center gap-2 text-[13px] font-bold text-[#0642A8] dark:text-[#8FB8FF]">
        <span aria-hidden="true">🎙️</span>
        {t("Écouter l'explication de l'hôte")}
      </p>
      <audio
        controls
        preload="none"
        src={url}
        onError={() => setFailed(true)}
        className="mt-2 h-9 w-full"
        aria-label={t('Explication du guidebook par votre hôte')}
      />
    </div>
  );
}

/** v4.47 — GUIDEBOOK UNIVERSEL : carte + dialog de lecture du guide de
 *  référence partagé par toutes les maisons (servi par le payload quand
 *  l'hôte n'a pas encore rédigé son propre guidebook). Même anatomie
 *  que la carte Guidebook classique (ModuleCard → TileDialog). */
function UniversalGuidebookCard({
  slug,
  guidebook,
  photoOverride,
  voiceInfo,
  onExit,
}: {
  slug: string;
  guidebook: { title: string; sections: string[] };
  photoOverride?: string | null;
  /** v4.68 — voix du guidebook (payload.voiceMessages.guidebook). */
  voiceInfo?: { langs: string[]; v: string } | null;
  /** v4.71 — appelé à la fermeture du guide (« Un mot de votre hôte »). */
  onExit?: () => void;
}) {
  const [open, setOpen] = useState(false);

  // ── v4.76 « i18n GUIDEBOOK » — le CORPS du guide est traduit par l'IA
  // (dictionnaire statique d'abord, IA ensuite via translateAiSmart qui
  // gère les textes longs). Traduction au moment d'OUVRIR le dialog —
  // zéro appel réseau quand la carte est simplement affichée. Les textes
  // s'affichent en FR puis basculent traduits (jamais de trou). ──
  const { lang } = useHubLang();
  const [ai, setAi] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open || lang === 'fr') return;
    const texts: string[] = [];
    for (const section of guidebook.sections) {
      const [firstLine, ...rest] = section.split('\n');
      if (firstLine?.trim()) texts.push(firstLine);
      const body = rest.join('\n');
      if (body.trim()) texts.push(body);
    }
    const pending = texts.filter((s) => !ai[s] && translateText(s, lang) === s);
    if (pending.length === 0) return;
    let alive = true;
    void translateAiSmart(pending, lang).then((tr) => {
      if (alive && Object.keys(tr).length > 0) setAi((prev) => ({ ...prev, ...tr }));
    });
    return () => {
      alive = false;
    };
  }, [open, lang, guidebook.sections]);
  const G = (s: string): string => {
    if (lang === 'fr') return s;
    const st = translateText(s, lang);
    return st !== s ? st : (ai[s] ?? s);
  };
  // État DÉRIVÉ (aucun setState d'effet) : reste « en cours » tant qu'un
  // texte n'a ni traduction dictionnaire ni traduction IA.
  const aiPending =
    open &&
    lang !== 'fr' &&
    guidebook.sections.some((section) => {
      const [firstLine, ...rest] = section.split('\n');
      return [firstLine, rest.join('\n')].some(
        (s) => !!s?.trim() && translateText(s, lang) === s && !ai[s],
      );
    });

  return (
    <>
      <ModuleCard
        emoji="📖"
        tone="teal"
        eyebrow="Guide de la maison"
        title="Guidebook"
        subtitle={guidebook.title || 'Guide universel — fourni avec votre séjour'}
        imageUrl={photoOverride ?? HUB_VISUALS.guidebook}
        onClick={() => setOpen(true)}
      >
        <span className="flex flex-wrap gap-1.5">
          <PreviewChip>{G('🗝️ Arrivée')}</PreviewChip>
          <PreviewChip>{G('🛏️ Équipements')}</PreviewChip>
          <PreviewChip>{G('📋 Règles')}</PreviewChip>
        </span>
      </ModuleCard>
      <TileDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          // v4.71 — fermeture du guide = sortie du guidebook → la voix de
          // l'hôte se propose (« Un mot de votre hôte »).
          if (!v) onExit?.();
        }}
        emoji="📖"
        tone="teal"
        title={G(guidebook.title || 'Guide universel de la maison')}
        subtitle={G('Guide universel — fourni avec votre séjour')}
      >
        {/* v4.68 — lecture de l'explication audio de l'hôte (si configurée). */}
        <GuidebookVoicePlayer slug={slug} info={voiceInfo ?? null} />
        <div className="space-y-3">
          {guidebook.sections.map((section, i) => {
            const [firstLine, ...rest] = section.split('\n');
            return (
              <div
                key={i}
                className="rounded-2xl border border-slate-200 bg-white/80 p-3.5 dark:border-white/10 dark:bg-white/5"
              >
                {rest.length === 0 ? (
                  <p className="text-sm leading-relaxed whitespace-pre-line text-slate-700 dark:text-slate-200">
                    {G(section)}
                  </p>
                ) : (
                  <>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{G(firstLine)}</p>
                    <p className="mt-1 text-xs leading-relaxed whitespace-pre-line text-slate-600 dark:text-slate-300">
                      {G(rest.join('\n'))}
                    </p>
                  </>
                )}
              </div>
            );
          })}
          {aiPending && (
            <p className="text-center text-[11px] text-slate-400" role="status">
              {translateText('🌐 Traduction en cours…', lang)}
            </p>
          )}
          <p className="text-center text-[11px] text-slate-500 dark:text-slate-400">
            {G('Votre hôte peut personnaliser ce guide depuis son espace.')}
          </p>
        </div>
      </TileDialog>
    </>
  );
}

/** 🛠️ Guide des appareils — Property.appliances (rempli dans
 * /airbnb/concierge) : instructions + photo + vidéo par appareil.
 * Task 30 : tuile grille + dialog immersif (accordéons inchangés).
 * v4.47 — fallback « pack universel » : si l'hôte n'a rien saisi, le
 * payload sert le catalogue universel (flag `universal` → sous-titre). */
function AppliancesCard({
  appliances,
  photoOverride,
  universal,
}: {
  appliances: GuestAppliance[];
  /** v4.31 — photo perso de l'hôte. */
  photoOverride?: string | null;
  /** v4.47 — pack universel affiché (hôte n'a rien saisi). */
  universal?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});
  const subtitle = universal
    ? `Pack universel — ${appliances.length} équipement${appliances.length > 1 ? 's' : ''} courants, avec photos et astuces`
    : `${appliances.length} équipement${appliances.length > 1 ? 's' : ''} expliqué${appliances.length > 1 ? 's' : ''} par votre hôte`;
  return (
    <>
      <ModuleCard
        emoji="🛠️"
        tone="violet"
        eyebrow="Équipements"
        title="Guide des appareils"
        subtitle={subtitle}
        imageUrl={photoOverride ?? HUB_VISUALS.appliances}
        onClick={() => setOpen(true)}
      >
        <span className="flex flex-wrap gap-1.5">
          {appliances.slice(0, 3).map((app) => (
            <PreviewChip key={app.id}>
              <span aria-hidden="true">{app.emoji || '🛠️'}</span> {app.name}
            </PreviewChip>
          ))}
          {appliances.length > 3 && <PreviewChip>+{appliances.length - 3}</PreviewChip>}
        </span>
      </ModuleCard>
      <TileDialog
        open={open}
        onOpenChange={setOpen}
        emoji="🛠️"
        tone="violet"
        title="Guide des appareils"
        subtitle={subtitle}
      >
        <div className="space-y-2.5">
          {appliances.map((app) => {
            const isOpen = !!openIds[app.id];
            return (
              <div key={app.id} className="bg-slate-50 border border-slate-200 rounded-lg dark:bg-white/5 dark:border-white/10">
                <button
                  type="button"
                  className="w-full flex items-center gap-3 p-3 text-left"
                  onClick={() => setOpenIds((m) => ({ ...m, [app.id]: !m[app.id] }))}
                  aria-expanded={isOpen}
                >
                  <span className="text-2xl leading-none select-none" aria-hidden="true">{app.emoji || '🛠️'}</span>
                  <span className="flex-1 min-w-0 text-sm font-bold text-slate-900 dark:text-white">{app.name}</span>
                  <ChevronRight
                    className={cn('h-4 w-4 text-slate-400 transition-transform shrink-0', isOpen && 'rotate-90')}
                    aria-hidden="true"
                  />
                </button>
                {isOpen && (
                  <div className="px-3 pb-3">
                    <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap dark:text-slate-300">
                      {app.instructions}
                    </p>
                    {app.imageUrl && (
                      <img
                        src={app.imageUrl}
                        alt={`Photo de ${app.name}`}
                        loading="lazy"
                        decoding="async"
                        className="mt-2 w-full rounded-xl object-cover aspect-[4/3] border border-slate-200 dark:border-white/10"
                      />
                    )}
                    {app.videoUrl && (
                      isLocalMediaUrl(app.videoUrl) ? (
                        <video
                          controls
                          playsInline
                          preload="metadata"
                          className="mt-2 w-full rounded-xl border border-slate-200 bg-black dark:border-white/10"
                          src={app.videoUrl}
                        />
                      ) : (
                        <a
                          href={app.videoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 mt-2 text-xs font-semibold text-[#055492] hover:text-[#04467a] dark:text-[#1173c7]"
                        >
                          <Play className="h-3.5 w-3.5" aria-hidden="true" /> Voir la vidéo {isYouTubeUrl(app.videoUrl) ? '(YouTube)' : ''}
                        </a>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </TileDialog>
    </>
  );
}

/** 🧰 Kit de survie — Property.survivalKitItems (Expérience Invité) :
 * où sont rangés les objets utiles (trousse, parapluie, piles…).
 * Task 30 : tuile grille + dialog immersif (liste inchangée). */
function SurvivalKitCard({
  items,
  photoOverride,
}: {
  items: GuestSurvivalItem[];
  /** v4.31 — photo perso de l'hôte. */
  photoOverride?: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ModuleCard
        emoji="🧰"
        tone="orange"
        eyebrow="Rangement malin"
        title="Kit de survie"
        subtitle={`${items.length} objet${items.length > 1 ? 's' : ''} indispensable${items.length > 1 ? 's' : ''} et leur emplacement`}
        imageUrl={photoOverride ?? HUB_VISUALS.survival}
        onClick={() => setOpen(true)}
      >
        <span className="flex flex-wrap gap-1.5">
          {items.slice(0, 3).map((item) => (
            <PreviewChip key={item.id}>{item.name}</PreviewChip>
          ))}
          {items.length > 3 && <PreviewChip>+{items.length - 3}</PreviewChip>}
        </span>
      </ModuleCard>
      <TileDialog
        open={open}
        onOpenChange={setOpen}
        emoji="🧰"
        tone="orange"
        title="Kit de survie"
        subtitle={`${items.length} objet${items.length > 1 ? 's' : ''} indispensable${items.length > 1 ? 's' : ''} et leur emplacement`}
      >
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3 dark:bg-white/5 dark:border-white/10">
              <span className="text-xl leading-none select-none" aria-hidden="true">🧰</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-white">{item.name}</p>
                {item.location && (
                  <p className="text-xs text-slate-500 mt-0.5 dark:text-slate-400">📍 {item.location}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </TileDialog>
    </>
  );
}

/** ⏱️ Départ tardif (upselling) — demande POST /api/public/hub/[slug]/
 * late-checkout (le serveur vérifie que le service est activé).
 * Task 30 : tuile grille + dialog avec CTA (logique d'envoi inchangée). */
function LateCheckoutCard({
  slug,
  price,
  propertyName,
  stayKey,
  onRequested,
  photoOverride,
  urgentLabel,
  lateUntilHour,
}: {
  slug: string;
  price?: number;
  propertyName: string;
  /** v4.79 — clé du séjour (jour de check-out) : la demande est
   *  mémorisée PAR SÉJOUR (un nouvel invité retrouve le module). */
  stayKey: string;
  /** v4.79 « DISPARITION APRÈS COMPLÉTION » — appelé après l'envoi
   *  réussi : le parent persiste + retire la carte du hub. */
  onRequested: () => void;
  /** v4.31 — photo perso de l'hôte. */
  photoOverride?: string | null;
  /** v4.32 — clignotement rouge (veille/jour du départ). */
  urgentLabel?: string;
  /** v4.44 — heure de fin choisie par l'hôte (défaut 14 h). */
  lateUntilHour?: number;
}) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  // v4.79 — demande déjà envoyée (ce séjour) ? → le module n'existe plus.
  const [requested] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(lateRequestedKey(slug, stayKey)) != null;
    } catch {
      return false;
    }
  });
  // v4.44 « DÉPART TARDIF DYNAMIQUE » — le serveur VÉRIFIE LE CALENDRIER :
  // true = logement libre après le départ (prolongation possible) ;
  // false = logement déjà loué ce jour-là (bouton désactivé) ; null = inconnu.
  const [avail, setAvail] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/public/hub/${encodeURIComponent(slug)}/late-checkout`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        setAvail(typeof d?.available === 'boolean' ? (d.available as boolean) : null);
      })
      .catch(() => {
        // indisponible → bouton neutre (le serveur re-vérifie au POST)
      });
    return () => {
      alive = false;
    };
  }, [slug]);
  const lateHour = lateUntilHour ?? 14;
  const request = async () => {
    setSending(true);
    try {
      const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/late-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) throw new Error(data.error || 'http');
      toast.success(data.message || 'Demande envoyée — votre hôte vous confirme rapidement.');
      // v4.79 — succès → le module DISPARAÎT du hub (dialog fermé puis
      // démonté par le parent qui masque la carte).
      setOpen(false);
      onRequested();
    } catch (e) {
      const detail = e instanceof Error && !e.message.startsWith('http') ? e.message : null;
      toast.error(detail || 'Demande impossible. Réessayez dans un instant.');
    } finally {
      setSending(false);
    }
  };
  // v4.79 — complété : plus aucune trace (carte + dialog démontés).
  if (requested) return null;
  return (
    <>
      <ModuleCard
        emoji="⏱️"
        tone="amber"
        eyebrow="Extension de séjour"
        title="Départ tardif"
        subtitle={
          price != null
            ? `Restez jusqu’à ${lateHour} h — ${formatEur(price)}`
            : `Restez jusqu’à ${lateHour} h`
        }
        imageUrl={photoOverride ?? HUB_VISUALS.lateCheckout}
        onClick={avail === false ? undefined : () => setOpen(true)}
        urgentLabel={urgentLabel}
      >
        <span className="flex flex-wrap gap-1.5">
          {avail === false ? (
            <PreviewChip>❌ Indisponible ce jour-là</PreviewChip>
          ) : avail === true ? (
            <PreviewChip>✅ Logement libre après vous</PreviewChip>
          ) : (
            <PreviewChip>🕑 Jusqu’à {lateHour} h</PreviewChip>
          )}
        </span>
      </ModuleCard>
      <TileDialog
        open={open}
        onOpenChange={setOpen}
        emoji="⏱️"
        tone="amber"
        title="Départ tardif"
        subtitle={
          price != null
            ? `Restez jusqu’à ${lateHour} h — ${formatEur(price)} (proposé par votre hôte)`
            : `Restez jusqu’à ${lateHour} h — proposé par votre hôte`
        }
      >
        {/* v4.44 — vérification AUTOMATIQUE du calendrier du logement. */}
        {avail === true && (
          <p className="mb-2 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-2.5 text-xs font-semibold leading-relaxed text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
            ✅ Le logement est libre après votre départ — la prolongation est possible.
          </p>
        )}
        {avail === false && (
          <p className="mb-2 rounded-2xl border border-red-200 bg-red-50/70 px-3.5 py-2.5 text-xs font-semibold leading-relaxed text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            ❌ Un autre voyageur arrive ce jour-là — le départ tardif n’est pas disponible.
          </p>
        )}
        <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          Envie de profiter encore un peu de {propertyName} ? Demandez un départ tardif :
          votre hôte vous confirme rapidement par notification.
        </p>
        {avail !== false && (
          <Button
            type="button"
            size="sm"
            className="mt-3 w-full h-10 bg-slate-900 hover:bg-slate-800 text-white font-semibold"
            onClick={request}
            disabled={sending}
            aria-label={`Demander un départ tardif pour ${propertyName}`}
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Clock4 className="h-3.5 w-3.5" aria-hidden="true" />}
            {sending ? 'Envoi…' : 'Demander un départ tardif'}
          </Button>
        )}
      </TileDialog>
    </>
  );
}

/** ⭐ Bouclier d'avis — l'invité ravi est dirigé vers l'avis public
 * (reviewUrl) ; l'invité déçu s'exprime EN PRIVÉ (POST …/private-feedback,
 * alerte immédiate hôte) — le mauvais avis n'atterrit jamais sur
 * Airbnb/Booking avant que l'hôte ait pu régler le souci. */
function ReviewShieldCard({
  slug,
  propertyName,
  stayKey,
  onSubmitted,
  reviewUrl,
  open,
  onOpenChange,
  photoOverride,
  urgentLabel,
}: {
  slug: string;
  propertyName: string;
  /** v4.79 — clé du séjour (jour de check-out) : la complétion est
   *  mémorisée PAR SÉJOUR (un nouvel invité retrouve le module). */
  stayKey: string;
  /** v4.79 « DISPARITION APRÈS COMPLÉTION » — appelé après l'envoi
   *  réussi de l'avis privé : le parent persiste + retire la carte. */
  onSubmitted: () => void;
  reviewUrl?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** v4.31 — photo perso de l'hôte. */
  photoOverride?: string | null;
  /** v4.32 — clignotement rouge (tous les jours à partir de 20 h). */
  urgentLabel?: string;
}) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [guestName, setGuestName] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  // v4.79 — avis déjà envoyé (ce séjour) ? → la carte n'existe plus.
  const [persistedDone, setPersistedDone] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(feedbackDoneKey(slug, stayKey)) != null;
    } catch {
      return false;
    }
  });

  const submit = async () => {
    if (rating < 1) {
      toast.error('Choisissez une note (1 à 5 étoiles).');
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/private-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating,
          comment: comment.trim() || undefined,
          guestName: guestName.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'http');
      setDone(true);
      // v4.79 — succès → la carte disparaît derrière le dialog (qui
      // affiche le remerciement) et le module quitte le hub à la fermeture.
      setPersistedDone(true);
      onSubmitted();
    } catch (e) {
      const detail = e instanceof Error && !e.message.startsWith('http') ? e.message : null;
      toast.error(detail || 'Envoi impossible. Réessayez.');
    } finally {
      setSending(false);
    }
  };

  const reset = () => {
    onOpenChange(false);
    setTimeout(() => {
      setDone(false);
      setRating(0);
      setComment('');
      setGuestName('');
    }, 300);
  };

  // v4.79 — complété ET dialog fermé : plus aucune trace du module.
  if (persistedDone && !open) return null;

  return (
    <>
      {!persistedDone && (
        <ModuleCard
          emoji="⭐"
          tone="rose"
          eyebrow="Votre avis compte"
          title="Bouclier d’avis"
          subtitle="Dites-le d’abord à votre hôte, en privé"
          imageUrl={photoOverride ?? HUB_VISUALS.review}
          onClick={() => onOpenChange(true)}
          urgentLabel={urgentLabel}
        >
          <span className="flex flex-wrap gap-1.5">
            <PreviewChip>🔒 100 % privé</PreviewChip>
            <PreviewChip>⭐ 1 à 5 étoiles</PreviewChip>
          </span>
        </ModuleCard>
      )}
      <Dialog open={open} onOpenChange={(v) => !sending && (v ? onOpenChange(true) : reset())}>
        <DialogContent className="max-w-sm bg-white border border-slate-200 rounded-xl dark:border-white/10 dark:bg-slate-900 dark:text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 dark:text-white">
              ⭐ Votre avis — {propertyName}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
              {done
                ? 'Merci ! Votre retour a été transmis.'
                : 'Un souci ? Votre message arrive directement et en privé à votre hôte, qui pourra le corriger.'}
            </DialogDescription>
          </DialogHeader>

          {done ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                {rating >= 4
                  ? 'Merci beaucoup ! 🎉'
                  : 'Merci, votre hôte est prévenu et va vous répondre. 💬'}
              </p>
              {rating >= 4 && reviewUrl && (
                <Button
                  type="button"
                  className="w-full h-11 bg-[#055492] hover:bg-[#04467a] text-white font-semibold"
                  onClick={() => window.open(reviewUrl, '_blank', 'noopener,noreferrer')}
                >
                  <Star className="h-4 w-4" aria-hidden="true" /> Laisser un avis public
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                className="w-full h-10 border-slate-300 text-slate-600 dark:border-white/20 dark:text-slate-300 dark:hover:bg-white/10"
                onClick={reset}
              >
                Fermer
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-center gap-1.5" role="radiogroup" aria-label="Note de 1 à 5 étoiles">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={rating === n}
                    aria-label={`${n} étoile${n > 1 ? 's' : ''}`}
                    onMouseEnter={() => setHover(n)}
                    onMouseLeave={() => setHover(0)}
                    onClick={() => setRating(n)}
                    className="p-1 rounded-lg transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#055492]"
                  >
                    <Star
                      className={cn(
                        'h-8 w-8 transition-colors',
                        (hover || rating) >= n
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-slate-300 dark:text-slate-600',
                      )}
                      aria-hidden="true"
                    />
                  </button>
                ))}
              </div>
              <Textarea
                placeholder="Votre message (optionnel) — ce qui vous a plu ou déplu"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={2000}
                rows={3}
                className="resize-none text-sm"
              />
              <Input
                placeholder="Votre prénom (optionnel)"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                maxLength={80}
                className="h-10 text-sm"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 flex-1 border-slate-300 text-slate-600 dark:border-white/20 dark:text-slate-300 dark:hover:bg-white/10"
                  onClick={reset}
                  disabled={sending}
                >
                  Annuler
                </Button>
                <Button
                  type="button"
                  className="h-10 flex-1 bg-slate-900 hover:bg-slate-800 text-white font-semibold dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                  onClick={submit}
                  disabled={sending || rating < 1}
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
                  Envoyer
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// =============================================================
// MODULES INVITÉS (parité PWA) — coffre-fort, guide visuel,
// quartier, SOS. Bug dashboard→hub : les données remplies dans
// /airbnb/concierge et l'Expérience Invité apparaissent désormais
// dans le hub QR, avec le même design premium glass.
// =============================================================

/** 🔑 Accès & Codes — coffre-fort numérique (bâtiment, boîte aux
 * lettres, parking, alarme, coffre). Valeur masquée par défaut,
 * révélation au clic + copie avec toast (même copy() que le Wi-Fi). */
function AccessCodesCard({
  codes,
  copy,
  photoOverride,
}: {
  codes: GuestAccessCodes;
  copy: (text: string, label: string) => Promise<void>;
  /** v4.31 — photo perso de l'hôte. */
  photoOverride?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const rows = accessCodeRows(codes);

  return (
    <>
      <ModuleCard
        emoji="🔑"
        tone="emerald"
        eyebrow="Trousseau numérique"
        title="Accès & Codes"
        subtitle="Portes, coffre-fort, parking… vos codes en un clin d’œil"
        imageUrl={photoOverride ?? HUB_VISUALS.access}
        onClick={() => setOpen(true)}
      >
        <span className="flex flex-wrap gap-1.5">
          {rows.slice(0, 3).map((row) => (
            <PreviewChip key={row.label}>
              <span aria-hidden="true">{row.emoji}</span> {row.label}
            </PreviewChip>
          ))}
          {rows.length > 3 && <PreviewChip>+{rows.length - 3}</PreviewChip>}
        </span>
      </ModuleCard>
      <TileDialog
        open={open}
        onOpenChange={setOpen}
        emoji="🔑"
        tone="emerald"
        title="Accès & Codes"
        subtitle="Bâtiment, coffre-fort, parking… votre trousseau numérique"
      >
        <div className="space-y-2.5">
          {rows.map((row) => {
            const shown = !!revealed[row.label];
            return (
              <div key={row.label} className="bg-slate-50 border border-slate-200 rounded-lg p-3 dark:bg-white/5 dark:border-white/10">
                <div className="flex items-center gap-3">
                  <span className="text-xl leading-none select-none" aria-hidden="true">{row.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{row.label}</p>
                    <p className={cn(
                      'font-mono text-sm font-bold mt-0.5 truncate',
                      shown ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500',
                    )}>
                      {shown ? row.value : '••••••'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 px-2.5"
                      onClick={() => setRevealed((m) => ({ ...m, [row.label]: !m[row.label] }))}
                      aria-label={shown ? `Masquer ${row.label}` : `Révéler ${row.label}`}
                    >
                      <span aria-hidden="true">{shown ? '🙈' : '👁️'}</span>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 px-2.5"
                      onClick={() => copy(row.value, row.label)}
                      aria-label={`Copier ${row.label}`}
                    >
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
          {codes.note && (
            <p className="text-xs text-slate-500 leading-relaxed px-1 dark:text-slate-400">📝 {codes.note}</p>
          )}
          <p className="text-[11px] text-slate-400 text-center">
            Codes confidentiels — ne les partagez qu’avec vos compagnons de voyage.
          </p>
        </div>
      </TileDialog>
    </>
  );
}

/** 🗺️ Arrivée pas à pas — guide visuel (façade, digicode, porte…)
 * rempli dans l'Expérience Invité → Property.visualGuide.
 * Task 30 : tuile grille + dialog immersif (étapes inchangées). */
function VisualGuideCard({
  steps,
  photoOverride,
}: {
  steps: GuestVisualStep[];
  /** v4.31 — photo perso de l'hôte. */
  photoOverride?: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ModuleCard
        emoji="🗺️"
        tone="emerald"
        eyebrow="Arrivée"
        title="Arrivée pas à pas"
        subtitle={`${steps.length} étape${steps.length > 1 ? 's' : ''} illustrée${steps.length > 1 ? 's' : ''} jusqu’à votre logement`}
        imageUrl={photoOverride ?? HUB_ARRIVAL_PHOTOS.facade}
        onClick={() => setOpen(true)}
      >
        <span className="flex flex-wrap gap-1.5">
          {steps.slice(0, 2).map((step) => (
            <PreviewChip key={step.id}>{step.title}</PreviewChip>
          ))}
          {steps.length > 2 && <PreviewChip>+{steps.length - 2}</PreviewChip>}
        </span>
      </ModuleCard>
      <TileDialog
        open={open}
        onOpenChange={setOpen}
        emoji="🗺️"
        tone="emerald"
        title="Arrivée pas à pas"
        subtitle={`${steps.length} étape${steps.length > 1 ? 's' : ''} illustrée${steps.length > 1 ? 's' : ''} jusqu’à votre logement`}
      >
        <div className="space-y-3">
          {steps.map((step, i) => (
            <div key={step.id} className="bg-slate-50 border border-slate-200 rounded-lg p-3 dark:bg-white/5 dark:border-white/10">
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-slate-900 text-white text-[10px] font-bold mr-1.5 align-middle dark:bg-white dark:text-slate-900">
                  {i + 1}
                </span>
                {step.title}
              </p>
              {step.description && (
                <p className="text-xs text-slate-600 mt-1 leading-relaxed dark:text-slate-300">{step.description}</p>
              )}
              {step.imageUrl && (
                <img
                  src={step.imageUrl}
                  alt={step.title}
                  loading="lazy"
                  className="mt-2 w-full rounded-xl object-cover aspect-[4/3] border border-slate-200 dark:border-white/10"
                />
              )}
            </div>
          ))}
        </div>
      </TileDialog>
    </>
  );
}

// =============================================================
// v4.49 « VISITER LA VILLE » (ex « Bonnes adresses », Task 30) —
// demande client : onglet invité premium affichant les coups de cœur
// de l'hôte (Property.localSpots — SANS nouvel appel API externe :
// tout vient du payload, zéro coût, zéro latence) avec :
//  • la « Note de l'hôte » mise en scène (citation ambre, italique) ;
//  • la distance Haversine depuis le logement ;
//  • le bouton « 📍 Y aller » qui ouvre le GPS NATIF du téléphone
//    (Apple Plans sur iOS, Maps/Google ailleurs — geoDirectionsUrl).
// =============================================================
function LocalSpotsCard({
  spots,
  photoOverride,
  originLat,
  originLng,
}: {
  spots: GuestSpot[];
  /** v4.31 — photo perso de l'hôte. */
  photoOverride?: string | null;
  /** v4.49 — coordonnées du logement (distances « à 1,2 km »). */
  originLat?: number | null;
  originLng?: number | null;
}) {
  const { t } = useHubLang();
  const [open, setOpen] = useState(false);
  const hasOrigin = typeof originLat === 'number' && typeof originLng === 'number';
  const distanceLabel = (s: GuestSpot): string | null => {
    if (!hasOrigin) return null;
    const km = haversineKm(originLat as number, originLng as number, s.lat, s.lng);
    if (km < 1) return `${Math.round(km * 1000)} m`;
    return `à ${km.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`;
  };
  // ── v4.77 « RECHERCHE D'ADRESSE » (demande client : « au cas où le
  // client veut rechercher une adresse ») — barre de recherche intégrée
  // au dialog : Nominatim (OpenStreetMap, gratuit, sans clé), résultats
  // biaisés autour du logement (±0.25° ≈ 25 km). En cas d'échec réseau
  // ou d'indisponibilité du service → repli automatique Google Maps
  // (la recherche s'ouvre dans Maps autour du logement). ──
  const [spotQuery, setSpotQuery] = useState('');
  const [spotSearching, setSpotSearching] = useState(false);
  const [spotResults, setSpotResults] = useState<
    { id: string; name: string; detail: string; lat: number; lng: number }[] | null
  >(null);
  const searchAddress = async () => {
    const q = spotQuery.trim();
    if (!q || spotSearching) return;
    setSpotSearching(true);
    try {
      // Viewbox autour du logement (si coordonnées connues) : résultats
      // proches d'abord, sans les restreindre exclusivement (bounded=0).
      const vb = hasOrigin
        ? `&viewbox=${originLng! - 0.25},${originLat! + 0.25},${originLng! + 0.25},${originLat! - 0.25}`
        : '';
      const url =
        'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&addressdetails=1' +
        vb +
        `&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error('nominatim');
      const json = (await res.json()) as {
        place_id: number;
        display_name: string;
        name?: string;
        lat: string;
        lon: string;
        type?: string;
      }[];
      setSpotResults(
        json.map((r) => {
          const parts = r.display_name.split(',');
          const label = r.name || parts[0] || r.display_name;
          return {
            id: String(r.place_id),
            name: label,
            detail: parts.slice(1, 4).join(',').trim(),
            lat: parseFloat(r.lat),
            lng: parseFloat(r.lon),
          };
        }),
      );
    } catch {
      // Repli Google Maps : la recherche s'ouvre autour du logement.
      const center = hasOrigin ? `${originLat},${originLng}` : '';
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        center ? `${q} near ${center}` : q,
      )}`;
      window.open(mapsUrl, '_blank', 'noopener,noreferrer');
      toast.info(t('Recherche ouverte dans Google Maps.'));
    } finally {
      setSpotSearching(false);
    }
  };
  return (
    <>
      <ModuleCard
        emoji="🗺️"
        tone="teal"
        eyebrow="Visiter la ville"
        title="Les coups de cœur de votre hôte"
        subtitle={`${spots.length} adresse${spots.length > 1 ? 's' : ''} sélectionnée${spots.length > 1 ? 's' : ''} pour vous, juste à côté`}
        imageUrl={photoOverride ?? HUB_VISUALS.spots}
        onClick={() => setOpen(true)}
      >
        <span className="flex flex-wrap gap-1.5">
          {spots.slice(0, 3).map((spot) => (
            <PreviewChip key={spot.id}>
              <span aria-hidden="true">{spotCategoryMeta(spot.category).emoji}</span> {spot.name}
            </PreviewChip>
          ))}
          {spots.length > 3 && <PreviewChip>+{spots.length - 3}</PreviewChip>}
        </span>
      </ModuleCard>
      <TileDialog
        open={open}
        onOpenChange={setOpen}
        emoji="🗺️"
        tone="teal"
        title="Visiter la ville"
        subtitle="Les coups de cœur de votre hôte — sélectionnés juste pour vous"
      >
        {/* ── v4.77 — RECHERCHE D'ADRESSE (Nominatim/OSM, repli Google Maps) ── */}
        <div className="rounded-2xl border border-teal-200/80 bg-teal-50/60 p-3.5 dark:border-teal-500/25 dark:bg-teal-500/10">
          <p className="text-[11px] font-bold uppercase tracking-wide text-teal-700 dark:text-teal-300">
            🔎 {t('Rechercher une adresse')}
          </p>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void searchAddress();
            }}
          >
            <input
              value={spotQuery}
              onChange={(e) => setSpotQuery(e.target.value)}
              placeholder={t('Restaurant, musée, adresse…')}
              aria-label={t('Rechercher une adresse')}
              className="h-11 min-w-0 flex-1 rounded-xl border border-teal-200 bg-white px-3.5 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-teal-400 dark:border-teal-500/30 dark:bg-slate-900 dark:text-slate-100"
            />
            <Button
              type="submit"
              size="sm"
              className="h-11 min-h-11 shrink-0 bg-teal-600 px-4 text-sm font-bold text-white hover:bg-teal-700"
              disabled={spotSearching || !spotQuery.trim()}
            >
              {spotSearching ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Search className="h-4 w-4" aria-hidden="true" />
              )}
              {spotSearching ? t('…') : t('Rechercher')}
            </Button>
          </form>
          {spotResults && spotResults.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {t('Aucun résultat — essayez un autre mot-clé.')}
            </p>
          ) : null}
          {spotResults && spotResults.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {spotResults.map((r) => {
                const km =
                  hasOrigin
                    ? haversineKm(originLat as number, originLng as number, r.lat, r.lng)
                    : null;
                return (
                  <li
                    key={r.id}
                    className="rounded-xl border border-teal-200 bg-white p-2.5 dark:border-teal-500/30 dark:bg-slate-900"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-slate-900 dark:text-white">{r.name}</p>
                        {r.detail ? (
                          <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{r.detail}</p>
                        ) : null}
                      </div>
                      {km != null ? (
                        <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                          {km < 1 ? `${Math.round(km * 1000)} m` : `à ${km.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`}
                        </span>
                      ) : null}
                    </div>
                    <a
                      href={geoDirectionsUrl(r.lat, r.lng)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 text-xs font-bold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
                    >
                      <span aria-hidden="true">📍</span> {t('Y aller')}
                    </a>
                  </li>
                );
              })}
              <li>
                <button
                  type="button"
                  onClick={() => setSpotResults(null)}
                  className="w-full text-center text-[10px] font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                >
                  {t('Effacer les résultats')}
                </button>
              </li>
            </ul>
          ) : null}
        </div>
        <div className="space-y-3">
          {spots.map((spot) => {
            const meta = spotCategoryMeta(spot.category);
            const dist = distanceLabel(spot);
            return (
              <div
                key={spot.id}
                className="rounded-2xl border border-white/50 bg-stone-50/80 p-4 shadow-sm backdrop-blur transition-shadow hover:shadow-md dark:border-white/10 dark:bg-white/5"
              >
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <p className="font-serif text-base font-bold text-slate-900 dark:text-white">
                    {spot.name}
                  </p>
                  <Badge className="shrink-0 border-amber-200 bg-amber-50 font-semibold text-amber-700 hover:bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/10">
                    <span aria-hidden="true">{meta.emoji}</span> {meta.label}
                  </Badge>
                </div>
                {spot.hostNote && (
                  <div className="mt-2 rounded-r-xl border-l-2 border-amber-400 bg-amber-50/80 px-3 py-2 dark:border-amber-500/50 dark:bg-amber-500/10">
                    <p className="text-[13px] italic leading-relaxed text-amber-800 dark:text-amber-200">
                      <span aria-hidden="true">✨ </span>« {spot.hostNote} »
                    </p>
                  </div>
                )}
                <div className="mt-2 flex items-center gap-2 flex-wrap text-[11px] text-slate-500 dark:text-slate-400">
                  {spot.address && <span className="max-w-[220px] truncate">📍 {spot.address}</span>}
                  {dist && (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                      {dist}
                    </span>
                  )}
                </div>
                <a
                  href={geoDirectionsUrl(spot.lat, spot.lng)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-bold text-white transition-transform hover:scale-[1.01] active:scale-95 dark:bg-white dark:text-slate-900"
                >
                  <span aria-hidden="true">📍</span> Y aller
                </a>
              </div>
            );
          })}
        </div>
      </TileDialog>
    </>
  );
}

// =============================================================
// v4.49 « WIDGET MÉTÉO » — temps réel du logement + 3 jours à venir.
// Open-Meteo via /api/public/hub/[slug]/weather (gratuit, sans clé,
// cache serveur 30 min). Chargement = skeleton douce ; erreur ou
// latence → la carte disparaît silencieusement (jamais bloquante).
// =============================================================
/** Code météo WMO → emoji + libellé FR court (miroir de la route weather). */
function wmoMeta(code: number): { emoji: string; label: string } {
  if (code === 0) return { emoji: '☀️', label: 'Ensoleillé' };
  if (code === 1) return { emoji: '🌤️', label: 'Plutôt clair' };
  if (code === 2) return { emoji: '⛅', label: 'Quelques nuages' };
  if (code === 3) return { emoji: '☁️', label: 'Couvert' };
  if (code === 45 || code === 48) return { emoji: '🌫️', label: 'Brouillard' };
  if (code >= 51 && code <= 57) return { emoji: '🌦️', label: 'Bruine' };
  if (code >= 61 && code <= 67) return { emoji: '🌧️', label: 'Pluie' };
  if (code >= 71 && code <= 77) return { emoji: '❄️', label: 'Neige' };
  if (code >= 80 && code <= 82) return { emoji: '🌦️', label: 'Averses' };
  if (code === 85 || code === 86) return { emoji: '🌨️', label: 'Neigeux' };
  if (code >= 95) return { emoji: '⛈️', label: 'Orage' };
  return { emoji: '🌡️', label: 'Variable' };
}

function WeatherCard({ slug }: { slug: string }) {
  const [data, setData] = useState<{
    current: { temp: number; code: number; wind: number };
    daily: { date: string; code: number; tmax: number; tmin: number }[];
  } | null>(null);
  const [failed, setFailed] = useState(false);
  // v4.50 « WIDGET HEURE & DATE » — horloge live du smartphone de
  // l'invité intégrée à la carte météo (rafraîchie chaque seconde).
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const dateLabel = clock.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const timeLabel = clock.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const secondsLabel = String(clock.getSeconds()).padStart(2, '0');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/weather`);
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          current?: { temp: number; code: number; wind: number };
          daily?: { date: string; code: number; tmax: number; tmin: number }[];
        } | null;
        if (!cancelled && res.ok && json?.ok && json.current && Array.isArray(json.daily)) {
          setData({ current: json.current, daily: json.daily });
        } else if (!cancelled) {
          setFailed(true);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // v4.50 — même si la météo échoue (API indisponible), la carte reste
  // visible pour l'heure et la date : le widget horloge n'est JAMAIS
  // bloqué par le service météo.
  if (failed) {
    return (
      <motion.section
        aria-label="Heure et date sur place"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="mx-auto mt-4 w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_44px_-20px_rgba(15,23,42,0.18)] dark:border-[#D4AF37]/20 dark:bg-gradient-to-br dark:from-[#1B1610] dark:via-[#141009] dark:to-[#0C0906] dark:shadow-[0_24px_60px_-24px_rgba(0,0,0,0.8)]"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-bold uppercase tracking-[0.18em] text-[#0642A8] dark:text-[#E7C66B]">
              📅 <span className="capitalize">{dateLabel}</span>
            </p>
            <p className="mt-0.5 text-[11px] font-medium text-slate-500 dark:text-[#A89F91]">
              Météo momentanément indisponible
            </p>
          </div>
          <p className="shrink-0 font-serif text-2xl font-bold tabular-nums text-slate-900 dark:text-[#F5EFE6]">
            {timeLabel}
            <span className="ml-1 text-xs font-semibold text-slate-400">:{secondsLabel}</span>
          </p>
        </div>
      </motion.section>
    );
  }
  const today = data?.daily?.[0] ?? null;
  const upcoming = data?.daily?.slice(1, 4) ?? [];
  const dayLabel = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');

  return (
    <motion.section
      aria-label="Météo sur place"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="mx-auto mt-4 w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_44px_-20px_rgba(15,23,42,0.18)] dark:border-[#D4AF37]/20 dark:bg-gradient-to-br dark:from-[#1B1610] dark:via-[#141009] dark:to-[#0C0906] dark:shadow-[0_24px_60px_-24px_rgba(0,0,0,0.8)]"
    >
      {!data ? (
        <div className="flex items-center gap-4 p-5" aria-hidden="true">
          <div className="h-14 w-14 animate-pulse rounded-2xl bg-slate-200/80 dark:bg-[#D4AF37]/15" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-36 animate-pulse rounded bg-slate-200/80 dark:bg-[#D4AF37]/15" />
            <div className="h-3 w-24 animate-pulse rounded bg-slate-200/60 dark:bg-[#D4AF37]/10" />
          </div>
        </div>
      ) : (
        <div className="p-4 sm:p-5">
          {/* ── v4.50 « HEURE & DATE » — bandeau horloge live (téléphone
              de l'invité) au-dessus du temps actuel. v4.68 — bandeau
              pastel bleu marque (clair) / bandeau or sombre (luxe). ── */}
          <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-[#DBE8FF] bg-[#dceaf5]/80 px-3.5 py-2 dark:border-[#D4AF37]/20 dark:bg-[#D4AF37]/[0.07]">
            <p className="min-w-0 truncate text-[11px] font-bold uppercase tracking-[0.16em] text-[#0642A8] dark:text-[#E7C66B]">
              📅 <span className="capitalize">{dateLabel}</span>
            </p>
            <p className="shrink-0 font-serif text-xl font-bold tabular-nums text-slate-900 dark:text-[#F5EFE6]">
              {timeLabel}
              <span className="ml-1 text-[10px] font-semibold text-slate-400">:{secondsLabel}</span>
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-5xl leading-none select-none" aria-hidden="true">
              {wmoMeta(data.current.code).emoji}
            </span>
            <div className="min-w-0 flex-1">
              {/* v4.68 — pastille accent bleu marque (lisible en light).
                  v4.73 — pastille or (lisible en sombre luxueux). */}
              <p className="inline-flex items-center rounded-full bg-[#dceaf5] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#0642A8] dark:bg-[#D4AF37]/15 dark:text-[#E7C66B]">
                Météo sur place
              </p>
              <p className="display-title font-serif! mt-1 text-3xl font-bold text-slate-900 dark:text-[#F5EFE6]">
                {data.current.temp}°C{' '}
                <span className="text-sm font-semibold text-slate-600 dark:text-[#C9BFAE]">
                  {wmoMeta(data.current.code).label}
                </span>
              </p>
            </div>
            <div className="shrink-0 text-right text-xs font-semibold text-slate-600 dark:text-[#C9BFAE]">
              {today && (
                <p>
                  ↑ {today.tmax}° <span className="opacity-60">/ ↓ {today.tmin}°</span>
                </p>
              )}
              {data.current.wind > 0 && <p className="mt-0.5">💨 {data.current.wind} km/h</p>}
            </div>
          </div>
          {upcoming.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-200/80 pt-3 dark:border-[#D4AF37]/15">
              {upcoming.map((d) => (
                <div
                  key={d.date}
                  className="flex items-center justify-center gap-1.5 rounded-2xl bg-slate-50 px-2 py-1.5 dark:bg-white/[0.045]"
                >
                  <span className="text-lg leading-none select-none" aria-hidden="true">
                    {wmoMeta(d.code).emoji}
                  </span>
                  <span className="text-[11px] font-semibold capitalize text-slate-700 dark:text-[#DDD5C7]">
                    {dayLabel(d.date)}
                  </span>
                  <span className="text-[11px] text-slate-600 dark:text-[#A89F91]">
                    {d.tmax}°/{d.tmin}°
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </motion.section>
  );
}

// =============================================================
// v4.49 « RETOUR À LA MAISON » — écran explicatif (demande client :
// « au lieu d'ouvrir Google Maps, ouvrir une page pour expliquer à
// l'invité : ce module va vous aider à retourner à la maison, en
// cliquant dessus vous allez être guidé… + un bouton cliquez pour
// rentrer »). Le bouton lance le GPS NATIF (geoDirectionsUrl :
// Apple Plans sur iOS, Maps/Google sur Android & desktop, à pied).
// =============================================================
function HomeGuideDialog({
  open,
  onOpenChange,
  lat,
  lng,
  propertyName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lat: number;
  lng: number;
  propertyName: string;
}) {
  const steps = [
    { emoji: '👆', text: 'Cliquez sur le gros bouton vert ci-dessous' },
    { emoji: '📱', text: 'Votre application GPS s’ouvre avec l’itinéraire à pied' },
    { emoji: '🏡', text: 'Suivez le guide — vous êtes bientôt chez vous' },
  ];
  return (
    <TileDialog
      open={open}
      onOpenChange={onOpenChange}
      emoji="🏡"
      tone="emerald"
      title="Retour à la maison"
      subtitle={`Votre GPS personnel jusqu'à « ${propertyName} »`}
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-relaxed text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
          🧭{' '}
          <strong>Ce module va vous aider à retourner à la maison.</strong>{' '}
          Où que vous soyez, cliquez sur le bouton ci-dessous : vous serez guidé pas à pas jusqu’au logement par l’application GPS de votre téléphone.
        </div>
        <ol className="space-y-2">
          {steps.map((s, i) => (
            <li
              key={i}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/70 px-3 py-2.5 text-[13px] font-medium text-slate-700 backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
            >
              <span className="text-xl leading-none select-none" aria-hidden="true">
                {s.emoji}
              </span>
              {s.text}
            </li>
          ))}
        </ol>
        <motion.a
          href={geoDirectionsUrl(lat, lng)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onOpenChange(false)}
          aria-label="Cliquez pour rentrer — ouvrir le GPS natif (itinéraire à pied)"
          className="flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-base font-bold text-white shadow-[0_16px_36px_-14px_rgba(16,185,129,0.7)] transition-transform hover:scale-[1.02] active:scale-95"
        >
          <Navigation className="h-5 w-5 shrink-0" aria-hidden="true" />
          🧭 Cliquez pour rentrer
        </motion.a>
        <p className="text-center text-[11px] text-slate-400 dark:text-slate-500">
          Itinéraire à pied — ouverture de votre application GPS native.
        </p>
      </div>
    </TileDialog>
  );
}

/** 🆘 SOS & Urgences — TOUJOURS visible : numéros nationaux (112/15/18),
 * police (custom ou 17), urgence logement (emergencyInfo.hostPhone),
 * hôpital/pharmacie de garde (Property.emergencyInfo) et pannes courantes. */
function SosCard({
  emergency,
  photoOverride,
}: {
  emergency: GuestEmergencyInfo | null;
  /** v4.31 — photo perso de l'hôte. */
  photoOverride?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const telHref = (n: string) => `tel:${n.replace(/[^+\d]/g, '')}`;
  const numbers = [
    { label: 'Urgences (UE)', number: '112', tone: 'red' as const },
    { label: 'SAMU', number: '15', tone: 'red' as const },
    { label: 'Pompiers', number: '18', tone: 'red' as const },
    { label: 'Police', number: emergency?.police ?? '17', tone: 'red' as const },
    ...(emergency?.hostPhone
      ? [{ label: 'Urgence logement', number: emergency.hostPhone, tone: 'emerald' as const }]
      : []),
  ];
  return (
    <>
      <ModuleCard
        emoji="🆘"
        tone="red"
        eyebrow="Urgences 24/7"
        title="SOS & Urgences"
        subtitle="Numéros, hôpital, pharmacie de garde"
        imageUrl={photoOverride ?? HUB_VISUALS.sos}
        onClick={() => setOpen(true)}
      >
        <span className="flex flex-wrap gap-1.5">
          {numbers.slice(0, 4).map((n) => (
            <PreviewChip key={n.label}>☎️ {n.number}</PreviewChip>
          ))}
        </span>
      </ModuleCard>
      <TileDialog
        open={open}
        onOpenChange={setOpen}
        emoji="🆘"
        tone="red"
        title="SOS & Urgences"
        subtitle="Numéros d’urgence, hôpital, pharmacie de garde"
      >
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            {numbers.map((n) => (
              <a
                key={n.label}
                href={telHref(n.number)}
                className={cn(
                  'rounded-lg border p-3 flex items-center gap-2.5 transition-transform active:scale-[0.98]',
                  n.tone === 'emerald'
                    ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/30'
                    : 'bg-red-50 border-red-200 dark:bg-red-500/10 dark:border-red-500/30',
                )}
              >
                <Phone
                  className={cn(
                    'h-4 w-4 shrink-0',
                    n.tone === 'emerald' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
                  )}
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className={cn(
                    'block text-[11px] font-semibold uppercase tracking-wide',
                    n.tone === 'emerald' ? 'text-emerald-500' : 'text-red-400',
                  )}>
                    {n.label}
                  </span>
                  <span className={cn(
                    'block text-sm font-bold truncate',
                    n.tone === 'emerald' ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300',
                  )}>
                    {n.number}
                  </span>
                </span>
              </a>
            ))}
          </div>

          {(emergency?.hospital || emergency?.pharmacy) && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-3 dark:bg-white/5 dark:border-white/10">
              {emergency?.hospital && (
                <div className="flex items-start gap-2.5">
                  <span className="text-xl leading-none select-none" aria-hidden="true">🏥</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Hôpital le plus proche</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{emergency.hospital}</p>
                    {emergency.hospitalLat != null && emergency.hospitalLng != null && (
                      <a
                        href={geoDirectionsUrl(emergency.hospitalLat, emergency.hospitalLng)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 mt-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-300"
                      >
                        <span aria-hidden="true">🧭</span> Y aller
                      </a>
                    )}
                  </div>
                </div>
              )}
              {emergency?.pharmacy && (
                <div className="flex items-start gap-2.5">
                  <span className="text-xl leading-none select-none" aria-hidden="true">💊</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Pharmacie de garde</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{emergency.pharmacy}</p>
                    {emergency.pharmacyPhone && (
                      <a
                        href={telHref(emergency.pharmacyPhone)}
                        className="inline-flex items-center gap-1 mt-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-300"
                      >
                        <Phone className="h-3 w-3" aria-hidden="true" /> {emergency.pharmacyPhone}
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {(emergency?.commonIssues.length ?? 0) > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Pannes courantes</p>
              {emergency!.commonIssues.map((issue) => (
                <details key={issue.id} className="bg-slate-50 border border-slate-200 rounded-lg p-3 dark:bg-white/5 dark:border-white/10">
                  <summary className="text-sm font-bold text-slate-900 cursor-pointer dark:text-white">
                    <span className="mr-1.5" aria-hidden="true">🔧</span>{issue.title}
                  </summary>
                  <p className="text-xs text-slate-600 mt-2 leading-relaxed whitespace-pre-line dark:text-slate-300">
                    {issue.instructions}
                  </p>
                </details>
              ))}
            </div>
          )}
        </div>
      </TileDialog>
    </>
  );
}

// =============================================================
// MODE HÔTE — grille de gestion rapide (après PIN)
// =============================================================
function HostView({
  payload,
  hostData,
  slug,
  pin,
  onBack,
  onHostRefresh,
  onPinChanged,
  onHubPhotosSaved,
  /** v4.68 — recharge le payload invité sans réinitialiser la vue. */
  reloadPayload,
}: {
  payload: HubPayload;
  hostData: HostData | null;
  slug: string;
  pin: string;
  onBack: () => void;
  onHostRefresh: (d: HostData) => void;
  onPinChanged: (pin: string) => void;
  /** v4.31 — photos perso sauvegardées (répercutées sur le payload invité). */
  onHubPhotosSaved: (map: HubPhotoMap) => void;
  /** v4.68 « PRESTATAIRES — la désactivation ne marchait pas » — après
   *  un toggle, le payload PUBLIC (services construits depuis les
   *  prestataires visibles) doit être rechargé : refreshHost ne
   *  rafraîchit que les données hôte, pas la liste invité. */
  reloadPayload: () => Promise<void>;
}) {
  // v4.77-c2 — Espace Hôte traduit (clé = texte FR source ; tf pour les
  // phrases interpolées {name}). Les données dynamiques (noms, dates)
  // restent telles quelles.
  const { t, tf } = useAdminLang();
  const [wifiEditOpen, setWifiEditOpen] = useState(false);
  const [complaintsOpen, setComplaintsOpen] = useState(false);
  const [providersOpen, setProvidersOpen] = useState(false);
  const [guidebookOpen, setGuidebookOpen] = useState(false);
  const [upsellingOpen, setUpsellingOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // v4.31 « PHOTOS DE MON HUB » — état local initialisé depuis le payload.
  const [photosOpen, setPhotosOpen] = useState(false);
  // v4.37 « MESSAGES VOCAUX » — dialog hôte (bienvenue / veille / jour J).
  const [voiceOpen, setVoiceOpen] = useState(false);
  // v4.52 « LIVRE D'OR VIVANT + MIDDLE-STAY CARE » — modération hôte.
  const [memoriesOpen, setMemoriesOpen] = useState(false);
  const [middleStayOpen, setMiddleStayOpen] = useState(false);
  const [photosMap, setPhotosMap] = useState<HubPhotoMap>(
    () => payload.property.hubPhotos ?? {},
  );
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  // v4.68 « SUPPRIMER SUR TOUS LES VOCAUX » — suppression d'un message
  // vocal listé dans le dialog Réclamations (DELETE /voice?id&pin).
  const [deletingVoiceId, setDeletingVoiceId] = useState<string | null>(null);
  // ── v4.32 — BADGE « NON LUS » ──
  // Le badge rouge ne compte plus les réclamations OPEN mais les
  // notifications NON LUES (vocaux non écoutés + réclamations jamais
  // affichées). Une réclamation lue mais encore ouverte reste dans la
  // liste, sans allumer le badge. Les marques locales (seenVoiceIds /
  // complaintsSeen) décrémentent immédiatement sans retirer l'élément
  // de la liste affichée (pas de disparition en pleine écoute) ; un
  // refreshHost resynchronise sur la vérité serveur.
  const [seenVoiceIds, setSeenVoiceIds] = useState<Set<string>>(new Set());
  const [complaintsSeen, setComplaintsSeen] = useState(false);
  const unread = (hostData?.unreadMessages ?? []).filter((m) => !seenVoiceIds.has(m.id)).length;
  const written = hostData?.openComplaints ?? 0;
  const unreadComplaints = complaintsSeen ? 0 : (hostData?.unreadComplaints ?? written);
  const totalAlerts = unread + unreadComplaints;

  /** v4.32 — marque des vocaux « lus » côté serveur (POST host-read, PIN). */
  const markVoicesRead = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      setSeenVoiceIds((prev) => new Set([...prev, ...ids]));
      try {
        await fetch(`/api/public/hub/${encodeURIComponent(slug)}/host-read`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin, voiceIds: ids }),
        });
      } catch {
        // silencieux : la marque locale reste, re-synchronisée au refresh
      }
    },
    [slug, pin],
  );

  // Ouverture du dialog Réclamations = notifications vues (badge éteint),
  // y compris pour les messages vocaux listés dedans.
  useEffect(() => {
    if (!complaintsOpen) return;
    setComplaintsSeen(true);
    const ids = (hostData?.unreadMessages ?? []).map((m) => m.id);
    if (ids.length > 0) void markVoicesRead(ids);
  }, [complaintsOpen]);

  /** Rafraîchit les données hôte (après édition guidebook / résolution /
   *  suppression de vocal) — DOIT être déclaré AVANT deleteVoice qui le
   *  référence dans ses dépendances (sinon erreur TDZ au rendu). */
  const refreshHost = useCallback(async () => {
    try {
      const hostRes = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/host`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      if (hostRes.ok) {
        onHostRefresh((await hostRes.json()) as HostData);
        // La vérité serveur remplace les marques locales.
        setSeenVoiceIds(new Set());
        setComplaintsSeen(false);
      }
    } catch {
      toast.error(t('Erreur réseau. Réessayez.'));
    }
  }, [slug, pin, onHostRefresh, t]);

  /** v4.68 — supprime un vocal listé (message d'invité, ou réponse hôte
   *  stockée sur le même modèle) : DELETE /voice?id=<id>&pin=<pin> — le
   *  serveur vérifie le PIN et répond { ok: true }. La liste est
   *  rafraîchie via refreshHost() (véracité serveur). */
  const deleteVoice = useCallback(
    async (voiceId: string, senderName: string) => {
      if (
        !window.confirm(
          tf('Supprimer définitivement le message vocal de {name} ? Cette action est irréversible.', { name: senderName }),
        )
      ) {
        return;
      }
      setDeletingVoiceId(voiceId);
      try {
        const res = await fetch(
          `/api/public/hub/${encodeURIComponent(slug)}/voice?id=${encodeURIComponent(voiceId)}`,
          {
            method: 'DELETE',
            // v4.76 — le PIN passe dans un header (jamais en query) : il ne
            // doit apparaître dans AUCUN log d'accès serveur/proxy.
            headers: { 'x-hub-pin': pin },
          },
        );
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok) {
          toast.error(json.error || t('Suppression impossible. Réessayez.'));
          return;
        }
        toast.success(t('Message vocal supprimé.'));
        await refreshHost();
      } catch {
        toast.error(t('Erreur réseau. Réessayez.'));
      } finally {
        setDeletingVoiceId(null);
      }
    },
    [slug, pin, refreshHost, t, tf],
  );

  // ── Commandes ServiceOrder (badge Upselling + dialog) ──
  // Fetch au montage et à chaque refreshOrders() (après PATCH ou
  // réouverture du dialog) — le badge compte les PENDING.
  const [orders, setOrders] = useState<HostOrder[] | null>(null);
  const [ordersTick, setOrdersTick] = useState(0);
  const refreshOrders = useCallback(() => setOrdersTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin }),
        });
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { orders: HostOrder[] };
        if (!cancelled) setOrders(json.orders);
      } catch {
        // Silencieux : le badge reste absent, une nouvelle tentative
        // est déclenchée à la réouverture du dialog.
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [slug, pin, ordersTick]);

  const pendingOrders = orders?.filter((o) => o.status === 'PENDING').length ?? 0;
  const [patching, setPatching] = useState<string | null>(null);

  /** Marque une réclamation écrite résolue (garde PIN) puis rafraîchit. */
  const resolveComplaint = async (id: string) => {
    setResolvingId(id);
    try {
      const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/complaint`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, id, status: 'RESOLVED' }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error || t('Impossible de marquer comme résolue.'));
        return;
      }
      toast.success(t('Réclamation marquée résolue ✓'));
      await refreshHost();
    } catch {
      toast.error(t('Erreur réseau. Réessayez.'));
    } finally {
      setResolvingId(null);
    }
  };

  /** Confirme ou annule une commande PENDING (PATCH /orders, garde PIN). */
  const patchOrder = async (orderId: string, action: 'CONFIRM' | 'CANCEL') => {
    setPatching(orderId);
    try {
      const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/orders`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, orderId, action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || t('Action impossible.'));
        return;
      }
      toast.success(action === 'CONFIRM' ? t('Commande confirmée ✓') : t('Commande annulée.'));
      refreshOrders();
    } catch {
      toast.error(t('Erreur réseau. Réessayez.'));
    } finally {
      setPatching(null);
    }
  };

  // ── v4.32 « PRESTATAIRES AUTOUR » — ACTIVER / DÉSACTIVER (demande client :
  // au cas où l'hôte ne veut pas activer un prestataire proposé). L'état
  // optimiste (providerOverrides) rend le toggle instantané ; un
  // refreshHost resynchronise ensuite sur la vérité serveur. Un
  // prestataire désactivé disparaît des services invités (hub + PWA).
  const [providerOverrides, setProviderOverrides] = useState<Record<string, boolean>>({});
  const [togglingProviderId, setTogglingProviderId] = useState<string | null>(null);
  const providerEnabled = (p: HostProvider) => providerOverrides[p.id] ?? p.enabled;
  const toggleProvider = async (p: HostProvider) => {
    const next = !providerEnabled(p);
    setTogglingProviderId(p.id);
    setProviderOverrides((prev) => ({ ...prev, [p.id]: next }));
    try {
      const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/providers-toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, providerId: p.id, enabled: next }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(json.error || t('Action impossible.'));
        setProviderOverrides((prev) => ({ ...prev, [p.id]: !next }));
        return;
      }
      toast.success(
        next
          ? tf('{name} activé ✓ — visible côté invité.', { name: p.name })
          : tf('{name} désactivé — masqué côté invité.', { name: p.name }),
      );
      await refreshHost();
      // v4.68 FIX — le payload invité contient `services` construit depuis
      // les prestataires VISIBLES : sans ce rechargement, la désactivation
      // n'apparaissait jamais côté invité (refreshHost ne couvre que les
      // données hôte). Le guard interne évite tout retour à 'loading'.
      await reloadPayload();
      setProviderOverrides((prev) => {
        const copy = { ...prev };
        delete copy[p.id];
        return copy;
      });
    } catch {
      toast.error(t('Erreur réseau. Réessayez.'));
      setProviderOverrides((prev) => ({ ...prev, [p.id]: !next }));
    } finally {
      setTogglingProviderId(null);
    }
  };

  return (
    <div className="flex-1 w-full max-w-lg sm:max-w-2xl mx-auto px-4 py-8 flex flex-col">
      {/* Fond premium animé (fixed, -z-10) */}
      <AnimatedMeshGradient />

      {/* En-tête — fade-in + slide-down */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: EASE_EXPO }}
        className="flex items-center gap-3 mb-2"
      >
        <button
          type="button"
          onClick={onBack}
          aria-label={t("Retour à l'accueil")}
          className="h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-xl glass glass-hover backdrop-blur-xl backdrop-saturate-[1.4] text-slate-600 hover:text-slate-900 transition-colors dark:text-slate-300 dark:hover:text-white"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="min-w-0">
          <h1 className="display-title font-serif! text-lg font-bold text-slate-900 leading-tight dark:text-white">{t('🔐 Espace Hôte')}</h1>
          <p className="text-xs text-slate-500 truncate dark:text-slate-400">{payload.property.name}</p>
        </div>
        <Badge className="ml-auto bg-emerald-50 border-emerald-200 text-emerald-700 font-semibold hover:bg-emerald-50 shrink-0 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-300 dark:hover:bg-emerald-500/10">
          {t('✓ Déverrouillé')}
        </Badge>
      </motion.div>
      <p className="text-sm text-slate-600 mb-5 dark:text-slate-400">{t('Gestion rapide du logement')}</p>

      {!hostData ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
      ) : (
        <div className="grid gap-3">
          {/* ── v4.45 — BANDEAU D'ALERTES : 3 chiffres clés en un coup d'œil ──
              Rouge = action requise / Vert ✓ = rien à traiter. */}
          <Reveal delay={0.03} y={18}>
            <div className="grid grid-cols-3 gap-2.5">
              <HostAlertChip
                emoji="🚨"
                label={t('Réclamations')}
                count={hostData.openComplaints}
              />
              <HostAlertChip emoji="💬" label={t('Vocaux')} count={unread} />
              <HostAlertChip emoji="💰" label={t('Commandes')} count={pendingOrders} />
            </div>
          </Reveal>

          {/* ── v4.45 — 🏠 SECTION : MON LOGEMENT (2 colonnes ≥ sm) ── */}
          <SectionLabel>{t('🏠 Mon logement')}</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-2">
            <Reveal delay={0.05} y={20}>
              <HostActionCard
                emoji="📶"
                title={t('Modifier le Wi-Fi')}
                subtitle={
                  hostData.wifi?.networkName ? `${t('Réseau')} : ${hostData.wifi.networkName}` : t('Aucun réseau configuré')
                }
                onClick={() => setWifiEditOpen(true)}
              />
            </Reveal>
            <Reveal delay={0.08} y={20}>
              <HostActionCard
                emoji="📖"
                title={t('Guidebook')}
                subtitle={
                  hostData.guidebook.sections.length > 0
                    ? `${hostData.guidebook.sections.length} ${t('section(s) — éditer le guide de bienvenue')}`
                    : t('Aucune section — écrire le guide de bienvenue')
                }
                onClick={() => setGuidebookOpen(true)}
              />
            </Reveal>
            <Reveal delay={0.11} y={20}>
              <HostActionCard
                emoji="📸"
                title={t('Photos de mon hub')}
                subtitle={
                  Object.keys(photosMap).length > 0
                    ? `${Object.keys(photosMap).length} ${t('photo(s) personnalisée(s) — votre hub 100 % à vous')}`
                    : t('Remplacez les visuels par vos vraies photos')
                }
                onClick={() => setPhotosOpen(true)}
              />
            </Reveal>
            <Reveal delay={0.14} y={20}>
              <HostActionCard
                emoji="🎙️"
                title={t('Messages vocaux')}
                subtitle={t("Bienvenue, veille et jour du départ — votre voix ou l'IA, en 4 langues")}
                onClick={() => setVoiceOpen(true)}
              />
            </Reveal>
          </div>

          {/* ── v4.45 — 👥 SECTION : MES INVITÉS (alertes pleine largeur) ── */}
          <SectionLabel>{t('👥 Mes invités')}</SectionLabel>
          <div className="grid gap-3">
            <Reveal delay={0.17} y={20}>
              <HostActionCard
                emoji="🚨"
                title={t('Réclamations en attente')}
                subtitle={
                  totalAlerts > 0
                    ? `${written} ${t('écrite(s)')} · ${unread} ${t('vocale(s)')}${
                        hostData.pendingRequests > 0 ? ` · ${hostData.pendingRequests} ${t('demande(s) de service')}` : ''
                      }`
                    : t('Aucune réclamation en attente ✓')
                }
                badge={totalAlerts > 0 ? String(totalAlerts) : undefined}
                onClick={() => setComplaintsOpen(true)}
              />
            </Reveal>
            <Reveal delay={0.2} y={20}>
              <HostActionCard
                emoji="💰"
                title={t('Upselling — Commandes')}
                subtitle={
                  pendingOrders > 0
                    ? `${pendingOrders} ${t('commande(s) à confirmer')}`
                    : orders && orders.length > 0
                      ? `${orders.length} ${t('commande(s) — rien à confirmer ✓')}`
                      : t('Aucune commande pour le moment')
                }
                badge={pendingOrders > 0 ? String(pendingOrders) : undefined}
                onClick={() => {
                  setUpsellingOpen(true);
                  refreshOrders();
                }}
              />
            </Reveal>
            {/* ── v4.52 « LIVRE D'OR VIVANT » — modération des souvenirs ── */}
            <Reveal delay={0.22} y={20}>
              <HostActionCard
                emoji="📖"
                title={t("Livre d'or — souvenirs")}
                subtitle={t('Validez, épinglez et répondez aux souvenirs de vos voyageurs')}
                onClick={() => setMemoriesOpen(true)}
              />
            </Reveal>
            {/* ── v4.52 « MIDDLE-STAY CARE » — file réassort/ménage ── */}
            <Reveal delay={0.24} y={20}>
              <HostActionCard
                emoji="🧺"
                title={t('Middle-Stay Care')}
                subtitle={t('Réassorts & ménages demandés par vos invités en séjour long')}
                onClick={() => setMiddleStayOpen(true)}
              />
            </Reveal>
          </div>

          {/* ── v4.45 — 🧹 SECTION : ÉQUIPE & AUTOUR DU BIEN ── */}
          <SectionLabel>{t('🧹 Équipe & prestataires')}</SectionLabel>
          <div className="grid gap-3">
            <Reveal delay={0.23} y={20}>
              <HostActionCard
                emoji="🧹"
                title={t('Gérer les prestataires')}
                subtitle={`${hostData.providers.length} ${t('intervenant(s) autour du bien')}`}
                onClick={() => setProvidersOpen(true)}
              />
            </Reveal>
          </div>

          {/* ── v4.45 — ⚙️ SECTION : RÉGLAGES ── */}
          <SectionLabel>{t('⚙️ Réglages')}</SectionLabel>
          <div className="grid gap-3">
            <Reveal delay={0.26} y={20}>
              <HostActionCard
                emoji="⚙️"
                title={t('Paramètres')}
                subtitle={t("Gérer le code PIN d'accès au mode hôte")}
                onClick={() => setSettingsOpen(true)}
              />
            </Reveal>
          </div>
        </div>
      )}

      <footer className="mt-auto pt-10 pb-6 text-center">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {t('Propulsé par')} 🗝️ <span className="font-semibold text-slate-600 dark:text-slate-300">RoomScan</span>
        </p>
      </footer>

      {/* ----- Dialog : Modifier le Wi-Fi ----- */}
      {hostData && wifiEditOpen && (
        <WifiEditDialog
          onClose={() => setWifiEditOpen(false)}
          slug={slug}
          pin={pin}
          wifi={hostData.wifi}
          onSaved={(w) => onHostRefresh({ ...hostData, wifi: w })}
        />
      )}

      {/* ----- Dialog : Édition du Guidebook ----- */}
      {hostData && guidebookOpen && (
        <GuidebookEditDialog
          onClose={() => setGuidebookOpen(false)}
          slug={slug}
          pin={pin}
          guidebook={hostData.guidebook}
          onSaved={refreshHost}
        />
      )}

      {/* ----- Dialog : Upselling (commandes invitées) ----- */}
      {upsellingOpen && (
        <UpsellingDialog
          onClose={() => setUpsellingOpen(false)}
          orders={orders}
          patchingId={patching}
          onPatch={patchOrder}
        />
      )}

      {/* ----- Dialog : Paramètres (changement de PIN) ----- */}
      {settingsOpen && (
        <SettingsPinDialog
          onClose={() => setSettingsOpen(false)}
          slug={slug}
          pin={pin}
          onPinChanged={onPinChanged}
        />
      )}

      {/* ----- v4.52 — Dialog : 📖 Livre d'or (modération souvenirs) ----- */}
      <MemoriesModerationDialog
        open={memoriesOpen}
        onClose={() => setMemoriesOpen(false)}
        slug={slug}
        pin={pin}
      />

      {/* ----- v4.52 — Dialog : 🧺 Middle-Stay Care (file de traitement) ----- */}
      <MiddleStayHostDialog
        open={middleStayOpen}
        onClose={() => setMiddleStayOpen(false)}
        slug={slug}
        pin={pin}
      />

      {/* ----- Dialog : 📸 Photos de mon hub (v4.31) ----- */}
      {photosOpen && (
        <HubPhotosDialog
          onClose={() => setPhotosOpen(false)}
          slug={slug}
          pin={pin}
          initial={photosMap}
          onSaved={(m) => {
            setPhotosMap(m);
            onHubPhotosSaved(m);
          }}
        />
      )}

      {/* ----- Dialog : 🎙️ Messages vocaux (v4.37) ----- */}
      {voiceOpen && (
        <VoiceMessagesDialog
          onClose={() => setVoiceOpen(false)}
          slug={slug}
          pin={pin}
        />
      )}

      {/* ----- Dialog : Réclamations ----- */}
      <Dialog open={complaintsOpen} onOpenChange={setComplaintsOpen}>
        <DialogContent className="max-w-md bg-white border border-slate-200 rounded-xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <TriangleAlert className="h-4 w-4 text-amber-500" aria-hidden="true" /> {t('Réclamations en attente')}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              {t('Réclamations écrites (formulaire Hub) et messages vocaux de vos voyageurs.')}
            </DialogDescription>
          </DialogHeader>

          {/* ── Section : réclamations écrites ── */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">
              📝 {t('Écrites')} ({hostData?.complaints.length ?? 0})
            </p>
            {!hostData || hostData.complaints.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">{t('Aucune réclamation écrite en attente ✓')}</p>
            ) : (
              <div className="space-y-2.5">
                {hostData.complaints.map((c) => (
                  <div key={c.id} className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge className="bg-white border-slate-200 text-slate-700 font-semibold hover:bg-white shrink-0">
                          {c.categoryLabel}
                        </Badge>
                        {c.isUrgent && (
                          <Badge className="bg-red-50 border-red-200 text-red-700 font-bold hover:bg-red-50 shrink-0">
                            {t('⚠️ Urgent')}
                          </Badge>
                        )}
                        {/* v4.32 — badge « Nouvelle » si la notification n'est pas lue. */}
                        {c.isRead === false && (
                          <Badge className="bg-red-500 text-white font-bold hover:bg-red-500 shrink-0">
                            {t('Nouvelle')}
                          </Badge>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400 shrink-0">
                        {new Date(c.createdAt).toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-700 leading-relaxed">{c.description}</p>
                    {c.guestName && (
                      <p className="mt-1 text-[11px] text-slate-400">{t('De :')} {c.guestName}</p>
                    )}
                    {c.photos.length > 0 && (
                      <div className="mt-2 flex gap-2">
                        {c.photos.map((p, i) => (
                           
                          <img
                            key={i}
                            src={p}
                            alt={tf('Photo {n} de la réclamation', { n: i + 1 })}
                            className="h-16 w-16 rounded-lg border border-slate-200 object-cover"
                            loading="lazy"
                            decoding="async"
                          />
                        ))}
                      </div>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={resolvingId === c.id}
                      className="mt-2.5 h-8 border-emerald-300 text-emerald-700 hover:bg-emerald-50 font-semibold"
                      onClick={() => resolveComplaint(c.id)}
                    >
                      {resolvingId === c.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {t('Marquer résolue')}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Section : messages vocaux ── */}
          <div className="pt-2 border-t border-slate-100">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2 mt-2">
              🎙️ {t('Vocales')} ({unread})
            </p>
            {!hostData || hostData.unreadMessages.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">{t('Aucun message vocal en attente ✓')}</p>
            ) : (
              <div className="space-y-2.5">
                {hostData.unreadMessages.map((m) => (
                  <div key={m.id} className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-slate-900">
                        {m.senderName}
                        {seenVoiceIds.has(m.id) && (
                          <span className="ml-1.5 text-[10px] font-semibold text-slate-400">{t('lu ✓')}</span>
                        )}
                      </p>
                      {/* v4.68 — suppression du vocal (DELETE /voice?id&pin). */}
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="text-[11px] text-slate-400">
                          {new Date(m.createdAt).toLocaleDateString('fr-FR', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <button
                          type="button"
                          disabled={deletingVoiceId === m.id}
                          onClick={() => void deleteVoice(m.id, m.senderName)}
                          aria-label={tf('Supprimer le message vocal de {name}', { name: m.senderName })}
                          title={t('Supprimer ce vocal')}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-rose-200 text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50 dark:border-rose-500/40 dark:text-rose-400 dark:hover:bg-rose-500/10"
                        >
                          {deletingVoiceId === m.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      {m.audioData || (m.audioUrl && !m.audioUrl.startsWith('/demo/')) ? (
                        <audio
                          controls
                          preload="metadata"
                          src={voicePlaybackSrc(m.audioData, m.audioUrl)}
                          className="h-9 w-full max-w-[260px]"
                          aria-label={tf('Message de {name}', { name: m.senderName })}
                          onPlay={() => void markVoicesRead([m.id])}
                        />
                      ) : (
                        <span className="text-xs text-slate-400">
                          {tf('🎙️ Message vocal de {n} s (audio indisponible en démo)', { n: m.durationSec })}
                        </span>
                      )}
                    </div>
                    {/* RÉPONSE VOCALE — le propriétaire répond d'un simple
                        tap (pré-écoute avant envoi) ; l'invité la retrouvera
                        dans « Contacter l'hôte » et le guidebook. */}
                    <div className="mt-2">
                      <VoiceReplyButton voiceMessageId={m.id} compact slug={slug} pin={pin} onSent={() => void refreshHost()} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ----- Dialog : Prestataires ----- */}
      <Dialog open={providersOpen} onOpenChange={setProvidersOpen}>
        <DialogContent className="max-w-md bg-white border border-slate-200 rounded-xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Wrench className="h-4 w-4 text-slate-500" aria-hidden="true" /> {t('Prestataires autour du bien')}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              {t("Dans leur rayon d'intervention. Activez ou désactivez chaque prestataire — un prestataire désactivé est masqué pour vos invités.")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {(['OWNER_SERVICE', 'GUEST_EXPERIENCE'] as const).map((aud) => {
              const list = hostData?.providers.filter((p) => p.audience === aud) ?? [];
              return (
                <div key={aud}>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">
                    {aud === 'OWNER_SERVICE' ? t('🔧 Services Propriétaire') : t('🥂 Expériences Invité')} ({list.length})
                  </p>
                  {list.length === 0 ? (
                    <p className="text-xs text-slate-400">{t('Aucun prestataire dans le rayon.')}</p>
                  ) : (
                    <div className="space-y-2">
                      {list.map((p) => {
                        const enabled = providerEnabled(p);
                        return (
                          <div
                            key={p.id}
                            className={cn(
                              'flex items-center gap-3 border rounded-lg p-2.5 transition-colors',
                              enabled
                                ? 'bg-slate-50 border-slate-200'
                                : 'bg-slate-100/70 border-slate-200 opacity-70',
                            )}
                          >
                            <span className="text-xl select-none" aria-hidden="true">
                              {p.emoji}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-900 truncate">
                                {p.name}
                                {!enabled && (
                                  <span className="ml-1.5 inline-flex items-center rounded-full bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500 align-middle">
                                    {t('Désactivé')}
                                  </span>
                                )}
                              </p>
                              <p className="text-[11px] text-slate-500">
                                {p.categoryLabel} · {formatDistance(p.distanceKm)}
                              </p>
                            </div>
                            <span className="text-[11px] font-semibold text-slate-600 shrink-0">{p.priceLabel}</span>
                            {/* v4.32 — bouton ACTIVER / DÉSACTIVER (demande client :
                                « au cas où l'hôte ne veut pas les activer »). */}
                            <span className="flex shrink-0 items-center">
                              <Switch
                                checked={enabled}
                                disabled={togglingProviderId === p.id}
                                onCheckedChange={() => void toggleProvider(p)}
                                aria-label={
                                  enabled
                                    ? tf('Désactiver {name} pour ce bien', { name: p.name })
                                    : tf('Activer {name} pour ce bien', { name: p.name })
                                }
                              />
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Carte d'action hôte — glassmorphism premium (phase 2). */
/** v4.45 — puce KPI du bandeau d'alertes (Espace Hôte réorganisé).
 *  Rouge + nombre = action requise · Vert ✓ = rien à traiter. */
function HostAlertChip({
  emoji,
  label,
  count,
}: {
  emoji: string;
  label: string;
  count: number;
}) {
  const alert = count > 0;
  // v4.77-c2 — aria-label traduit (le label lui-même est déjà traduit
  // par l'appelant HostView ; « en attente » / « aucun » le sont ici).
  const { t } = useAdminLang();
  return (
    <div
      aria-label={`${label} : ${alert ? `${count} ${t('en attente')}` : t('aucun')}`}
      className={cn(
        'flex flex-col items-center justify-center gap-1 rounded-2xl border p-3 text-center backdrop-blur-xl transition-colors',
        alert
          ? 'border-red-200 bg-red-50/90 shadow-sm shadow-red-500/10 dark:border-red-500/30 dark:bg-red-500/10'
          : 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/30 dark:bg-emerald-500/10',
      )}
    >
      <span aria-hidden="true" className="text-lg leading-none">
        {emoji}
      </span>
      <span
        className={cn(
          'text-xl font-extrabold leading-none',
          alert ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400',
        )}
      >
        {alert ? count : '✓'}
      </span>
      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </span>
    </div>
  );
}

function HostActionCard({
  emoji,
  title,
  subtitle,
  badge,
  onClick,
}: {
  emoji: string;
  title: string;
  subtitle: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative w-full text-left glass glass-hover backdrop-blur-xl backdrop-saturate-[1.4] rounded-2xl p-4 transition-all duration-500 hover:-translate-y-0.5 active:scale-[0.99] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#055492]"
    >
      {badge && (
        <span className="absolute top-3 right-3 inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold shadow-lg shadow-red-500/30">
          {badge}
        </span>
      )}
      <div className="flex items-center gap-3.5">
        <EmojiIcon emoji={emoji} size="lg" variant="default" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed dark:text-slate-400">{subtitle}</p>
        </div>
        <PencilLine className="h-4 w-4 text-slate-400 shrink-0 dark:text-slate-500" aria-hidden="true" />
      </div>
    </button>
  );
}

/** Dialog : modification des identifiants Wi-Fi (PUT update + PIN).
 * Monté uniquement quand ouvert → l'état initial repart du contenu courant. */
function WifiEditDialog({
  onClose,
  slug,
  pin,
  wifi,
  onSaved,
}: {
  onClose: () => void;
  slug: string;
  pin: string;
  wifi: HostData['wifi'];
  onSaved: (w: HostData['wifi']) => void;
}) {
  // v4.77-c2 — dialog traduit (clé = texte FR source).
  const { t } = useAdminLang();
  const [ssid, setSsid] = useState(wifi?.networkName ?? '');
  const [password, setPassword] = useState(wifi?.password ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!wifi || !ssid.trim() || !password.trim()) {
      toast.error(t('Renseignez le nom du réseau et le mot de passe.'));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin,
          updates: [
            {
              qrCodeId: wifi.qrCodeId,
              content: {
                network_name: ssid.trim(),
                password: password.trim(),
                security_type: wifi.securityType || 'WPA2',
              },
            },
          ],
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || t('Échec de la mise à jour.'));
        setSaving(false);
        return;
      }
      onSaved({ ...wifi, networkName: ssid.trim(), password: password.trim() });
      toast.success(t('Wi-Fi mis à jour ✅'), {
        description: t('Vos voyageurs voient le nouveau réseau immédiatement.'),
      });
      setSaving(false);
      onClose();
    } catch {
      toast.error(t('Erreur réseau.'));
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !saving) onClose();
      }}
    >
      <DialogContent className="max-w-sm bg-white border border-slate-200 rounded-xl">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-slate-900">📶 {t('Modifier le Wi-Fi')}</DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            {t('Les nouveaux identifiants sont visibles immédiatement par vos voyageurs.')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="wifi-ssid">{t('Nom du réseau (SSID)')}</Label>
            <Input
              id="wifi-ssid"
              value={ssid}
              onChange={(e) => setSsid(e.target.value)}
              placeholder="MonLogement_5G"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wifi-pwd">{t('Mot de passe')}</Label>
            <Input
              id="wifi-pwd"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <Button
            type="button"
            disabled={saving}
            onClick={save}
            className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white font-semibold"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
            {saving ? t('Enregistrement…') : t('Enregistrer')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================
// Dialog : édition du Guidebook (QrCode 'home_manual').
// Même schéma de contenu que l'affichage invité /view :
// { title, body } avec sections séparées par un double saut de ligne.
// Monté uniquement quand ouvert → l'état initial repart du contenu courant.
// =============================================================
function GuidebookEditDialog({
  onClose,
  slug,
  pin,
  guidebook,
  onSaved,
}: {
  onClose: () => void;
  slug: string;
  pin: string;
  guidebook: HostGuidebook;
  onSaved: () => void;
}) {
  // v4.77-c2 — dialog traduit (clé = texte FR source).
  const { t, tf } = useAdminLang();
  const [title, setTitle] = useState(guidebook.title);
  const [sections, setSections] = useState<string[]>(
    guidebook.sections.length > 0 ? guidebook.sections : [''],
  );
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);

  /** v4.47 — « 📚 Charger le guidebook universel » : remplit le guide
   *  avec le contenu de référence partagé par toutes les maisons
   *  (GET /api/public/universal-content). Confirmation si un contenu
   *  existe déjà (l'import REMPLACE le brouillon courant). */
  const importUniversal = async () => {
    if (title.trim() && sections.some((s) => s.trim())) {
      if (!window.confirm(t('Charger le guidebook universel remplacera le contenu en cours d’édition. Continuer ?'))) {
        return;
      }
    }
    setImporting(true);
    try {
      const res = await fetch('/api/public/universal-content');
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        guidebook?: { title: string; sections: string[] };
        error?: string;
      } | null;
      if (!res.ok || !json?.ok || !json.guidebook) {
        toast.error(json?.error || t('Guidebook universel indisponible.'));
        return;
      }
      setTitle(json.guidebook.title);
      setSections(json.guidebook.sections.length > 0 ? json.guidebook.sections : ['']);
      toast.success(t('📚 Guidebook universel chargé.'), {
        description: t('Personnalisez-le avec les spécificités de votre bien, puis enregistrez.'),
      });
    } catch {
      toast.error(t('Connexion impossible. Réessayez.'));
    } finally {
      setImporting(false);
    }
  };

  const updateSection = (i: number, value: string) =>
    setSections((prev) => prev.map((s, idx) => (idx === i ? value : s)));
  const addSection = () => setSections((prev) => [...prev, '']);
  const removeSection = (i: number) =>
    setSections((prev) => prev.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!guidebook.qrCodeId) {
      toast.error(t('Aucun Guidebook actif pour ce bien. Créez-le depuis le dashboard hôte.'));
      return;
    }
    const cleanSections = sections.map((s) => s.trim()).filter((s) => s.length > 0);
    if (!title.trim() || cleanSections.length === 0) {
      toast.error(t('Renseignez un titre et au moins une section.'));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin,
          updates: [
            {
              qrCodeId: guidebook.qrCodeId,
              // Même schéma que /view : le body est découpé en sections
              // par double saut de ligne côté affichage invité.
              content: { title: title.trim(), body: cleanSections.join('\n\n') },
            },
          ],
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || t('Échec de la mise à jour.'));
        setSaving(false);
        return;
      }
      toast.success(t('Guidebook mis à jour ✅'), {
        description: t('Vos voyageurs voient le nouveau guide immédiatement.'),
      });
      setSaving(false);
      onSaved();
      onClose();
    } catch {
      toast.error(t('Erreur réseau.'));
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !saving) onClose();
      }}
    >
      <DialogContent className="max-w-md bg-white border border-slate-200 rounded-xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-emerald-600" aria-hidden="true" /> {t('Éditer le Guidebook')}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            {t('Le guide de bienvenue consulté par vos invités depuis le Hub.')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="guidebook-title">{t('Titre du guide')}</Label>
            <Input
              id="guidebook-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('Guide de bienvenue')}
              maxLength={120}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('Sections')} ({sections.length})</Label>
            {sections.map((section, i) => (
              <div key={i} className="relative">
                <Textarea
                  value={section}
                  onChange={(e) => updateSection(i, e.target.value)}
                  placeholder={tf('Section {n} — ex : 🔑 Accès, code de la boîte à clés…', { n: i + 1 })}
                  className="min-h-[72px] pr-10 text-sm"
                  maxLength={2000}
                  aria-label={tf('Section {n} du guide', { n: i + 1 })}
                />
                <button
                  type="button"
                  onClick={() => removeSection(i)}
                  aria-label={tf('Supprimer la section {n}', { n: i + 1 })}
                  disabled={saving}
                  className="absolute top-2 right-2 h-7 w-7 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-red-600 hover:border-red-200 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving || sections.length >= 12}
              onClick={addSection}
              className="w-full h-9 border-dashed border-slate-300 text-slate-600"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" /> {t('Ajouter une section')}
            </Button>
            {/* v4.47 — contenu de référence partagé par toutes les maisons. */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={importing || saving}
              onClick={() => void importUniversal()}
              className="w-full h-9 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
            >
              {importing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {t('Charger le guidebook universel')}
            </Button>
          </div>

          <Button
            type="button"
            disabled={saving}
            onClick={save}
            className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white font-semibold"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="h-4 w-4" aria-hidden="true" />
            )}
            {saving ? t('Enregistrement…') : t('Enregistrer le guide')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================
// Dialog : Upselling — commandes ServiceOrder des invités.
// Liste + boutons Confirmer/Annuler sur les PENDING (le serveur
// revalide chaque transition). État vide honnête si aucune commande.
// =============================================================
function UpsellingDialog({
  onClose,
  orders,
  patchingId,
  onPatch,
}: {
  onClose: () => void;
  orders: HostOrder[] | null;
  patchingId: string | null;
  onPatch: (orderId: string, action: 'CONFIRM' | 'CANCEL') => void;
}) {
  // v4.77-c2 — dialog traduit (clé = texte FR source).
  const { t } = useAdminLang();
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-md bg-white border border-slate-200 rounded-xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Package className="h-4 w-4 text-emerald-600" aria-hidden="true" /> {t('Commandes des invités')}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            {t("Prestations commandées via l'app invitée. Confirmez ou annulez les demandes en attente.")}
          </DialogDescription>
        </DialogHeader>

        {!orders ? (
          <div className="space-y-2.5 py-2" aria-busy="true">
            <Skeleton className="h-20 rounded-lg" />
            <Skeleton className="h-20 rounded-lg" />
          </div>
        ) : orders.length === 0 ? (
          <div className="py-8 text-center">
            <span className="text-3xl" aria-hidden="true">
              🧾
            </span>
            <p className="mt-2 text-sm font-semibold text-slate-700">{t("Aucune commande pour l'instant")}</p>
            <p className="mt-1 text-xs text-slate-400">
              {t("Les commandes passées par vos invités depuis l'app apparaîtront ici.")}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {orders.map((o) => (
              <div key={o.id} className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <Badge
                    className={cn(
                      'text-white border-transparent font-semibold shrink-0',
                      o.statusBadge,
                    )}
                  >
                    {o.statusEmoji} {o.statusLabel}
                  </Badge>
                  <span className="text-[11px] text-slate-400 shrink-0">
                    {new Date(o.createdAt).toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="mt-2 text-sm font-bold text-slate-900 leading-snug">{o.itemsSummary}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {o.providerEmoji} {o.providerName} · {t('Invité :')} {o.guestName}
                </p>
                <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-bold text-slate-900">{o.totalEur}</span>
                  {o.status === 'PENDING' && (
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={patchingId === o.id}
                        className="h-8 border-emerald-300 text-emerald-700 hover:bg-emerald-50 font-semibold"
                        onClick={() => onPatch(o.id, 'CONFIRM')}
                      >
                        {patchingId === o.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        {t('Confirmer')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={patchingId === o.id}
                        className="h-8 border-red-200 text-red-600 hover:bg-red-50 font-semibold"
                        onClick={() => onPatch(o.id, 'CANCEL')}
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                        {t('Annuler')}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// =============================================================
// Dialog : Paramètres — changement du code PIN hôte.
// Double saisie sur clavier numérique (nouveau PIN + confirmation,
// les 2 saisies doivent matcher) → PUT /update { pin, newPin }.
// Le PIN ne vit QUE le temps de la saisie en mémoire (jamais
// persisté, jamais affiché) ; après succès, le PIN de session
// (état parent, en mémoire) est mis à jour.
// =============================================================
function SettingsPinDialog({
  onClose,
  slug,
  pin,
  onPinChanged,
}: {
  onClose: () => void;
  slug: string;
  pin: string;
  onPinChanged: (pin: string) => void;
}) {
  // v4.77-c2 — dialog traduit (clé = texte FR source).
  const { t } = useAdminLang();
  const [step, setStep] = useState<'new' | 'confirm'>('new');
  const [hasFirst, setHasFirst] = useState(false); // affichage •••• uniquement
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [keypadKey, setKeypadKey] = useState(0);
  const firstPinRef = useRef('');

  /** Fermeture : purge immédiate de la première saisie en mémoire. */
  const close = () => {
    firstPinRef.current = '';
    onClose();
  };

  const handleComplete = async (entered: string) => {
    if (step === 'new') {
      firstPinRef.current = entered;
      setHasFirst(true);
      setStep('confirm');
      setError('');
      setKeypadKey((k) => k + 1); // clavier neuf pour la confirmation
      return;
    }
    if (entered !== firstPinRef.current) {
      setError(t('Les deux codes ne correspondent pas. Recommencez.'));
      firstPinRef.current = '';
      setHasFirst(false);
      setStep('new');
      setKeypadKey((k) => k + 1);
      return;
    }
    // Confirmation OK → PUT /update { pin, newPin }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, newPin: entered }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || t('Échec du changement de PIN.'));
        setSaving(false);
        setKeypadKey((k) => k + 1);
        return;
      }
      firstPinRef.current = '';
      setHasFirst(false);
      toast.success(t('PIN modifié ✅'), {
        description: t('Votre nouveau code est actif immédiatement.'),
      });
      onPinChanged(entered); // le PIN de session (mémoire) passe au nouveau code
      setSaving(false);
      onClose();
    } catch {
      toast.error(t('Erreur réseau. Réessayez.'));
      setSaving(false);
      setKeypadKey((k) => k + 1);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !saving) close();
      }}
    >
      <DialogContent className="max-w-sm bg-white border border-slate-200 rounded-xl p-6 [&>button]:hidden">
        <DialogHeader className="items-center text-center">
          <span className="mx-auto" aria-hidden="true">
            <EmojiIcon emoji="⚙️" size="lg" variant="dark" />
          </span>
          <DialogTitle className="text-lg font-bold text-slate-900 text-center">
            {t('Modifier le code PIN')}
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-600 text-center">
            {step === 'new'
              ? t('Saisissez votre nouveau code à 4 chiffres.')
              : t('Confirmez le nouveau code en le saisissant à nouveau.')}
          </DialogDescription>
        </DialogHeader>

        {saving ? (
          <div className="flex flex-col items-center gap-3 py-8" aria-busy="true">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" aria-hidden="true" />
            <p className="text-sm text-slate-500">{t('Enregistrement du nouveau code…')}</p>
          </div>
        ) : (
          <div className="mt-2">
            {hasFirst && (
              <p className="mb-3 text-center text-xs font-semibold text-slate-500" aria-live="polite">
                {t('Code saisi :')} <span className="tracking-widest">••••</span>
              </p>
            )}
            <QRTNumericKeypad key={keypadKey} onComplete={handleComplete} />
            {error && (
              <p role="alert" className="mt-4 text-center text-sm font-semibold text-red-600">
                {error}
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              className="mt-4 w-full h-11 border-slate-300 text-slate-600"
              onClick={close}
            >
              {t('Annuler')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// =============================================================
// v4.31 « PHOTOS DE MON HUB » — dialog hôte de personnalisation
// =============================================================
/** Dialog « 📸 Photos de mon hub » — l'hôte remplace chaque visuel
 *  d'illustration par une VRAIE photo du bien (redimensionnée côté
 *  client en dataURL JPEG ≤ 1280 px, stockée dans Property.hubPhotos
 *  via PUT /update, garde PIN). Sauvegarde immédiate par photo + reset.
 *  Le hub démo (demo-hub) ne persiste pas — comportement historique. */
function HubPhotosDialog({
  onClose,
  slug,
  pin,
  initial,
  onSaved,
}: {
  onClose: () => void;
  slug: string;
  pin: string;
  initial: HubPhotoMap;
  onSaved: (map: HubPhotoMap) => void;
}) {
  // v4.77-c2 — dialog traduit (clé = texte FR source ; les libellés des
  // slots HUB_PHOTO_SLOTS sont traduits à l'affichage via t(slot.label)).
  const { t, tf } = useAdminLang();
  const [map, setMap] = useState<HubPhotoMap>(initial);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const fileRef = useRef<HTMLInputElement | null>(null);
  const activeKeyRef = useRef<HubPhotoKey | null>(null);

  const openPicker = (key: HubPhotoKey) => {
    activeKeyRef.current = key;
    if (fileRef.current) {
      fileRef.current.value = '';
      fileRef.current.click();
    }
  };

  /** Image choisie → redimensionnement client → PUT immédiat (garde PIN).
   *  v4.68 « PHOTOS DE MON HUB — upload impossible » — compression plus
   *  forte (1024 px), plafond de sécurité 440 000 caractères AVANT le
   *  PUT (les photos d'appareil photo dépassaient l'ancien cap et étaient
   *  rejetées côté serveur sans retour clair) et messages d'erreur
   *  explicites (HEIC non décodable par canvas → JPG/PNG demandé). */
  const handlePick = async (file: File | undefined) => {
    const key = activeKeyRef.current;
    if (!file || !key) return;
    if (!file.type.startsWith('image/')) {
      toast.error(t('Choisissez une image (JPG, PNG…).'));
      return;
    }
    setBusyKey(key);
    try {
      // La conversion canvas peut lever (HEIC non supporté) — message
      // explicite plutôt que l'erreur réseau générique.
      let dataUrl: string | null = null;
      try {
        dataUrl = await fileToHubPhotoDataUrl(file, 1024);
      } catch {
        dataUrl = null;
      }
      if (!dataUrl) {
        toast.error(t('Format d’image non pris en charge — utilisez JPG ou PNG.'));
        return;
      }
      // Garde-fou AVANT l'envoi (marge sous le plafond serveur) : un
      // dataURL trop lourd était rejeté silencieusement par l'API.
      if (dataUrl.length > 440_000) {
        toast.error(t('Photo trop lourde — réessayez avec une image plus petite.'));
        return;
      }
      if (dataUrl.length > MAX_HUB_PHOTO_CHARS) {
        toast.error(t('Photo trop lourde — réessayez avec une image plus petite.'));
        return;
      }
      const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, hubPhotos: { [key]: dataUrl } }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(json.error || t('Enregistrement impossible.'));
        return;
      }
      const next: HubPhotoMap = { ...map, [key]: dataUrl };
      setMap(next);
      onSaved(next);
      toast.success(t('Photo enregistrée ✓ — visible immédiatement par vos invités.'));
    } catch {
      toast.error(t('Erreur réseau. Réessayez.'));
    } finally {
      setBusyKey(null);
    }
  };

  /** Retire la photo perso → retour au visuel curated. */
  const resetPhoto = async (key: HubPhotoKey) => {
    setBusyKey(key);
    try {
      const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, hubPhotos: { [key]: null } }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(json.error || t('Suppression impossible.'));
        return;
      }
      const next: HubPhotoMap = { ...map };
      delete next[key];
      setMap(next);
      onSaved(next);
      toast.success(t('Visuel d’illustration restauré.'));
    } catch {
      toast.error(t('Erreur réseau. Réessayez.'));
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !busyKey) onClose();
      }}
    >
      <DialogContent className="max-w-lg bg-white border border-slate-200 rounded-xl">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-slate-900">
            {t('📸 Photos de mon hub')}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            {t('Remplacez les visuels d’illustration par vos vraies photos — vos invités les voient immédiatement sur la page invitée.')}
          </DialogDescription>
        </DialogHeader>

        {/* Input fichier partagé (une seule ouverture à la fois) */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.jpg,.jpeg,.png,.webp"
          className="hidden"
          onChange={(e) => handlePick(e.target.files?.[0] ?? undefined)}
        />

        <div className="max-h-[58dvh] overflow-y-auto pr-0.5 custom-scrollbar">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {HUB_PHOTO_SLOTS.map((slot) => {
              const custom = map[slot.key];
              const busy = busyKey === slot.key;
              return (
                <div
                  key={slot.key}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/5"
                >
                  <div className="relative h-24 w-full">
                    {custom && !failed[slot.key] ? (
                      <img
                        src={custom}
                        alt={tf('Photo actuelle — {name}', { name: slot.label })}
                        className="h-full w-full object-cover"
                        onError={() => setFailed((f) => ({ ...f, [slot.key]: true }))}
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="flex h-full w-full items-center justify-center bg-gradient-to-br from-amber-100 to-orange-100 text-3xl dark:from-amber-500/15 dark:to-orange-500/10"
                      >
                        {slot.emoji}
                      </span>
                    )}
                    {busy && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/45" aria-busy="true">
                        <Loader2 className="h-5 w-5 animate-spin text-white" aria-hidden="true" />
                      </span>
                    )}
                    {custom && (
                      <span className="absolute right-1.5 top-1.5 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow">
                        {t('Perso')}
                      </span>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="truncate text-[11px] font-bold text-slate-800 dark:text-slate-100">
                      {slot.emoji} {t(slot.label)}
                    </p>
                    <p className="mt-0.5 line-clamp-2 h-7 text-[10px] leading-snug text-slate-400 dark:text-slate-500">
                      {t(slot.hint)}
                    </p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 flex-1 border-slate-300 text-[11px] dark:border-white/20"
                        disabled={!!busyKey}
                        onClick={() => openPicker(slot.key)}
                      >
                        {custom ? t('Changer') : t('Ajouter')}
                      </Button>
                      {custom && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-slate-400 hover:text-red-600"
                          disabled={!!busyKey}
                          aria-label={tf('Retirer la photo — {name}', { name: slot.label })}
                          onClick={() => resetPhoto(slot.key)}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          {t('Astuce : photos redimensionnées automatiquement (1024 px, JPEG) — formats JPG, PNG ou WebP conseillés. Format paysage.')}
        </p>
      </DialogContent>
    </Dialog>
  );
}

/**
 * FIX VOCAL « Contacter l'hôte » — lien WhatsApp wa.me dérivé du
 * téléphone de l'hôte (aucun champ dédié en base) :
 *  - chiffres uniquement ; préfixe international « 00 » retiré ;
 *  - numéro FR à 10 chiffres commençant par 0 → indicatif 33 ;
 *  - +33/+221… passés tels quels (wa.me accepte le format E.164
 *    sans le « + »).
 * Retourne null si aucun numéro exploitable (carte masquée).
 */
// =============================================================
// 🎙️ MESSAGES VOCAUX DU HUB (v4.37) — Dialog hôte
// 3 moments (Bienvenue / Veille du départ / Jour du départ) × 4 langues
// (FR source · EN · ES · AR). Flux validé avec le client :
//   1. l'hôte écrit son texte en FRANÇAIS ;
//   2. « 🤖 Traduire » remplit EN/ES/AR via l'IA (POST
//      /api/public/translate — arabe ajouté v4.37), textes éditables ;
//   3. par langue : « 🎙️ Générer la voix » (TTS serveur → MP3 lamejs,
//      upsert unique kind+lang) OU « 📤 Ma propre voix » (fichier
//      audio ≤ 30 s) — pré-écoute instantanée via le flux public
//      /voice-messages/audio?v=updatedAt.
// « ⚡ Générer les 4 voix » : boucle séquentielle FR→EN→ES→AR (l'API
// TTS est limitée en débit : pauses naturelles entre chaque appel).
// Démo ('demo-hub') : la génération est RÉELLE et renvoyée dans la
// réponse (item.audioData) — pré-écoute locale sans écriture en base.
// =============================================================

interface HubVoiceItem {
  id: string;
  kind: string;
  lang: string;
  source: string;
  text: string | null;
  durationSec: number;
  fileSizeKb: number;
  updatedAt: string;
  /** Démo uniquement — audio renvoyé sans écriture (pré-écoute locale). */
  audioData?: string;
  audioMime?: string;
}

/** v4.68 — le kind 'guidebook' (voix du guidebook) est ajouté côté API
 *  (route voice-messages + payload) ; le type lib ne l'expose pas encore,
 *  donc l'union locale étend HubVoiceKind pour l'UI hôte du hub. */
type HubVoiceKindAll = HubVoiceKind | 'guidebook';

const VOICE_KIND_META: {
  kind: HubVoiceKindAll;
  emoji: string;
  title: string;
  trigger: string;
  hint: string;
}[] = [
  {
    kind: 'welcome',
    emoji: '👋',
    title: 'Bienvenue',
    trigger: 'Joué au 1er clic « Mode Invité » — 1× par téléphone',
    hint: 'Souhaitez la bienvenue, présentez-vous, donnez le ton de votre maison.',
  },
  {
    kind: 'checkout_eve',
    emoji: '🌙',
    title: 'Veille du départ',
    trigger: '1er scan après l’heure choisie dans la Conciergerie (onglet ⏰, défaut 20 h) la veille du départ — 1× seulement',
    hint: 'Rappelez : départ tardif possible, préparer les affaires, laisser un avis.',
  },
  {
    kind: 'checkout_day',
    emoji: '📋',
    title: 'Jour du départ',
    trigger: 'Dès l’heure choisie dans la Conciergerie (onglet ⏰, défaut 9 h) le jour J — chaque ouverture de l’espace invité',
    hint: 'Consignes : départ, clés, ranger la maison, poubelles, linge…',
  },
  {
    // v4.68 « VOCALE DU GUIDEBOOK » — configurable aussi depuis le hub
    // (la configuration fine reste possible dans le dashboard hôte).
    kind: 'guidebook',
    emoji: '📖',
    title: 'Voix du guidebook',
    trigger: 'Écoute libre : bouton « 🎙️ Écouter l’explication de l’hôte » dans le guidebook et l’onglet Messages de l’hôte',
    hint: 'Expliquez votre guidebook à voix haute — en français uniquement.',
  },
];

const VOICE_LANG_META: {
  lang: HubVoiceLang;
  flag: string;
  label: string;
  source?: boolean;
}[] = [
  { lang: 'fr', flag: '🇫🇷', label: 'Français', source: true },
  { lang: 'en', flag: '🇬🇧', label: 'English' },
  { lang: 'es', flag: '🇪🇸', label: 'Español' },
  { lang: 'ar', flag: '🇸🇦', label: 'العربية' },
];

/** Plafond client du texte TTS (miroir serveur MAX_TTS_CHARS ≈ 30 s). */
const VOICE_TEXT_MAX = 600;

function voiceTextKey(kind: HubVoiceKindAll, lang: HubVoiceLang): string {
  return `${kind}:${lang}`;
}

/** Uint8Array → base64 (par tranches : évite l'éclatement de la pile
 *  sur un audio de 30 s). */
function voiceBytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/** Durée réelle d'un fichier audio via les métadonnées <audio> (0 si
 *  illisible — l'hôte est alors prévenu que la durée n'a pu être vérifiée). */
function voiceProbeDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const el = new Audio();
      const done = (d: number) => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* déjà révoqué */
        }
        resolve(Number.isFinite(d) ? Math.round(d) : 0);
      };
      el.preload = 'metadata';
      el.onloadedmetadata = () => done(el.duration);
      el.onerror = () => done(0);
      el.src = url;
      setTimeout(() => done(el.duration || 0), 4000);
    } catch {
      resolve(0);
    }
  });
}

function VoiceMessagesDialog({
  onClose,
  slug,
  pin,
}: {
  onClose: () => void;
  slug: string;
  pin: string;
}) {
  const [items, setItems] = useState<HubVoiceItem[] | null>(null);
  const [demo, setDemo] = useState(false);
  const [kind, setKind] = useState<HubVoiceKindAll>('welcome');
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null); // `${kind}:${lang}`
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkLang, setBulkLang] = useState<HubVoiceLang | null>(null);
  const [translating, setTranslating] = useState(false);
  const [uploadBusy, setUploadBusy] = useState<HubVoiceLang | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const uploadLangRef = useRef<HubVoiceLang>('fr');
  const uploadKindRef = useRef<HubVoiceKindAll>('welcome');
  // v4.77-c2 — dialog traduit (clé = texte FR source ; tf pour les
  // phrases interpolées {lang}/{flag}/{n}).
  const { t, tf } = useAdminLang();

  const meta = VOICE_KIND_META.find((m) => m.kind === kind) ?? VOICE_KIND_META[0];
  const itemOf = useCallback(
    (k: HubVoiceKindAll, l: HubVoiceLang) =>
      (items ?? []).find((i) => i.kind === k && i.lang === l) ?? null,
    [items],
  );
  // v4.68 — la voix du guidebook est en FRANÇAIS UNIQUEMENT (demande
  // client) : une seule rangée de langue pour cet onglet.
  const langRows = kind === 'guidebook' ? VOICE_LANG_META.filter(({ lang }) => lang === 'fr') : VOICE_LANG_META;

  // Chargement initial : liste des voix + pré-remplissage des textes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/public/hub/${encodeURIComponent(slug)}/voice-messages`,
          {
            cache: 'no-store',
            // v4.76 — PIN en header (jamais en query → jamais loggé).
            headers: { 'x-hub-pin': pin },
          },
        );
        const json = (await res.json().catch(() => ({}))) as {
          demo?: boolean;
          items?: HubVoiceItem[];
        };
        if (!res.ok || cancelled) {
          if (res.status === 403 && !cancelled) {
            toast.error(t('PIN incorrect — rouvrez le mode hôte.'));
            onClose();
          }
          return;
        }
        if (cancelled) return;
        setDemo(!!json.demo);
        setItems(json.items ?? []);
        const prefilled: Record<string, string> = {};
        for (const it of json.items ?? []) {
          if (it.text) prefilled[voiceTextKey(it.kind as HubVoiceKind, it.lang as HubVoiceLang)] = it.text;
        }
        setTexts((prev) => ({ ...prefilled, ...prev }));
      } catch {
        if (!cancelled) toast.error(t('Impossible de charger vos messages vocaux.'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, pin, t]);

  /** Génère la voix TTS d'une langue (puis met à jour la liste). */
  const generateVoice = useCallback(
    async (k: HubVoiceKindAll, l: HubVoiceLang) => {
      const key = voiceTextKey(k, l);
      const text = (texts[key] ?? '').trim();
      if (!text) {
        toast.error(tf("Écrivez d'abord le message en {lang}.", { lang: VOICE_LANG_META.find((m) => m.lang === l)?.label ?? l }));
        return;
      }
      setBusy(key);
      try {
        const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/voice-messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin, kind: k, lang: l, action: 'tts', text }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          demo?: boolean;
          item?: HubVoiceItem;
          error?: string;
        };
        if (!res.ok || !json.item) {
          toast.error(json.error || t('Génération impossible. Réessayez dans un instant.'));
          return;
        }
        setItems((prev) => [
          ...(prev ?? []).filter((i) => !(i.kind === k && i.lang === l)),
          json.item as HubVoiceItem,
        ]);
        if (!json.demo) {
          toast.success(
            tf('Voix {flag} prête ✓ ({n} s)', {
              flag: VOICE_LANG_META.find((m) => m.lang === l)?.flag ?? '',
              n: json.item.durationSec,
            }),
          );
        }
      } catch {
        toast.error(t('Erreur réseau. Réessayez.'));
      } finally {
        setBusy(null);
      }
    },
    [texts, slug, pin, t, tf],
  );

  /** ⚡ Génère les 4 voix du moment courant, en séquence (l'API TTS est
   *  limitée en débit : les appels s'enchaînent avec pauses naturelles). */
  const generateAll = useCallback(async () => {
    if (bulkBusy) return;
    setBulkBusy(true);
    try {
      for (const { lang } of VOICE_LANG_META) {
        const key = voiceTextKey(kind, lang);
        const text = (texts[key] ?? '').trim();
        if (!text) continue; // on ne génère que les langues écrites
        setBulkLang(lang);
        await generateVoice(kind, lang);
      }
      toast.success(t('Génération terminée ✓ — vos invités entendent la voix dans leur langue.'));
    } finally {
      setBulkLang(null);
      setBulkBusy(false);
    }
  }, [bulkBusy, kind, texts, generateVoice, t]);

  /** 🤖 Traduit le texte FR vers EN·ES·AR (POST /api/public/translate). */
  const translateAll = useCallback(async () => {
    const fr = (texts[voiceTextKey(kind, 'fr')] ?? '').trim();
    if (!fr) {
      toast.error(t('Écrivez d’abord votre message en français.'));
      return;
    }
    setTranslating(true);
    try {
      for (const target of ['en', 'es', 'ar'] as const) {
        const res = await fetch('/api/public/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texts: [fr], lang: target }),
        });
        if (!res.ok) continue;
        const json = (await res.json().catch(() => ({}))) as {
          translations?: Record<string, string>;
        };
        const out = json.translations?.[fr];
        if (out) {
          setTexts((prev) => ({ ...prev, [voiceTextKey(kind, target)]: out }));
        }
      }
      toast.success(t('Traductions prêtes ✓ — relisez et ajustez si besoin.'));
    } catch {
      toast.error(t('Traduction indisponible pour le moment.'));
    } finally {
      setTranslating(false);
    }
  }, [kind, texts, t]);

  /** 📤 Voix du propriétaire : fichier audio ≤ 30 s → upload base64. */
  const onFilePicked = useCallback(
    async (file: File) => {
      const lang = uploadLangRef.current;
      const k = uploadKindRef.current;
      const mime = (file.type || '').split(';')[0].toLowerCase();
      const fallbackMime =
        file.name.toLowerCase().endsWith('.m4a') ? 'audio/mp4' : mime || 'audio/mpeg';
      setUploadBusy(lang);
      try {
        const duration = await voiceProbeDuration(file);
        if (duration > 31) {
          toast.error(t('Trop long — maximum 30 secondes (comme les vocaux).'));
          return;
        }
        const base64 = voiceBytesToBase64(new Uint8Array(await file.arrayBuffer()));
        const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/voice-messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pin,
            kind: k,
            lang,
            action: 'upload',
            audioData: base64,
            audioMime: fallbackMime,
            durationSec: Math.max(1, duration),
          }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          demo?: boolean;
          item?: HubVoiceItem;
          error?: string;
        };
        if (!res.ok || !json.item) {
          toast.error(json.error || t('Envoi impossible. Réessayez.'));
          return;
        }
        setItems((prev) => [
          ...(prev ?? []).filter((i) => !(i.kind === k && i.lang === lang)),
          json.item as HubVoiceItem,
        ]);
        if (!json.demo) {
          toast.success(t('Votre voix est enregistrée ✓ — audible par vos invités.'));
        }
      } catch {
        toast.error(t('Erreur réseau. Réessayez.'));
      } finally {
        setUploadBusy(null);
      }
    },
    [slug, pin, t],
  );

  /** 🗑️ Supprime la voix d'une langue. */
  const removeVoice = useCallback(
    async (k: HubVoiceKindAll, l: HubVoiceLang) => {
      try {
        const res = await fetch(
          `/api/public/hub/${encodeURIComponent(slug)}/voice-messages?kind=${k}&lang=${l}`,
          {
            method: 'DELETE',
            // v4.76 — PIN en header (jamais en query → jamais loggé).
            headers: { 'x-hub-pin': pin },
          },
        );
        if (!res.ok) {
          toast.error(t('Suppression impossible. Réessayez.'));
          return;
        }
        setItems((prev) => (prev ?? []).filter((i) => !(i.kind === k && i.lang === l)));
        toast.success(t('Voix supprimée — vos invités ne l’entendront plus.'));
      } catch {
        toast.error(t('Erreur réseau. Réessayez.'));
      }
    },
    [slug, pin, t],
  );

  const kindCount = langRows.filter(({ lang }) => !!itemOf(kind, lang)).length;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg bg-white border border-slate-200 rounded-xl max-h-[85vh] overflow-y-auto dark:bg-slate-900 dark:border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-slate-900 dark:text-white">
            {t('🎙️ Messages vocaux')}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
            {t('Vos invités entendent la voix dans leur langue (repli : français) aux bons moments du séjour. Texte FR → traduction IA → voix générée, ou votre propre enregistrement (30 s max, comme les vocaux).')}
            {demo ? t(' Mode démo : pré-écoute sans enregistrement.') : ''}
          </DialogDescription>
        </DialogHeader>

        {/* ── Onglets : 3 moments + voix du guidebook (v4.68) ── */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {VOICE_KIND_META.map((m) => (
            <button
              key={m.kind}
              type="button"
              onClick={() => setKind(m.kind)}
              aria-pressed={kind === m.kind}
              className={cn(
                'rounded-xl border px-2 py-2.5 text-center transition-colors',
                kind === m.kind
                  ? 'border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10'
                  : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/60',
              )}
            >
              <span className="block text-lg leading-none" aria-hidden="true">{m.emoji}</span>
              <span
                className={cn(
                  'mt-1 block text-[11px] font-bold leading-tight',
                  kind === m.kind ? 'text-amber-700 dark:text-amber-300' : 'text-slate-600 dark:text-slate-300',
                )}
              >
                {t(m.title)}
              </span>
            </button>
          ))}
        </div>
        <p className="-mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
          <span className="font-semibold text-slate-600 dark:text-slate-300">{t(meta.trigger)}.</span>{' '}
          {t(meta.hint)}
        </p>

        {/* ── Langues (v4.68 : FR uniquement pour la voix du guidebook) ── */}
        <div className="space-y-3">
          {langRows.map(({ lang, flag, label, source }) => {
            const key = voiceTextKey(kind, lang);
            const item = itemOf(kind, lang);
            const text = texts[key] ?? '';
            const isBusy = busy === key;
            const previewSrc =
              item?.audioData && item?.audioMime
                ? `data:${item.audioMime};base64,${item.audioData}`
                : item
                  ? `/api/public/hub/${encodeURIComponent(slug)}/voice-messages/audio?kind=${item.kind}&lang=${item.lang}&v=${encodeURIComponent(item.updatedAt)}`
                  : null;
            return (
              <div
                key={lang}
                className={cn(
                  'rounded-xl border p-3',
                  source
                    ? 'border-amber-200 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-500/5'
                    : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800/60',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base leading-none" aria-hidden="true">{flag}</span>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{label}</span>
                  {source ? (
                    <Badge className="h-4 border-amber-200 bg-white px-1.5 text-[9px] font-bold text-amber-700 hover:bg-white dark:border-amber-500/40 dark:bg-transparent dark:text-amber-300">
                      SOURCE
                    </Badge>
                  ) : null}
                  {item ? (
                    <Badge className="ml-auto h-4 border-emerald-200 bg-emerald-50 px-1.5 text-[9px] font-bold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300">
                      {item.source === 'tts' ? t('🤖 IA') : t('🎙️ Votre voix')} · {item.durationSec} s
                    </Badge>
                  ) : null}
                </div>
                <Textarea
                  value={text}
                  maxLength={VOICE_TEXT_MAX}
                  onChange={(e) => setTexts((prev) => ({ ...prev, [key]: e.target.value }))}
                  placeholder={
                    source
                      ? t('Votre message en français…')
                      : t('Traduction (éditable) — ou « 🤖 Traduire » ci-dessous.')
                  }
                  rows={source ? 3 : 2}
                  className="mt-2 min-h-[52px] resize-y bg-white text-[13px] dark:bg-slate-900"
                  aria-label={tf('Message {lang}', { lang: label })}
                />
                <p className="mt-1 text-right text-[10px] text-slate-400">{text.length}/{VOICE_TEXT_MAX}</p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={isBusy || bulkBusy || !text.trim()}
                    onClick={() => void generateVoice(kind, lang)}
                    className="h-8 flex-1 bg-slate-900 text-[12px] font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                  >
                    {isBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Mic className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {isBusy ? t('Génération… (5-15 s)') : t('🎙️ Générer la voix')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={uploadBusy === lang || bulkBusy}
                    onClick={() => {
                      uploadLangRef.current = lang;
                      uploadKindRef.current = kind;
                      fileRef.current?.click();
                    }}
                    className="h-8 border-slate-300 px-2.5 text-[12px] text-slate-600 dark:border-slate-600 dark:text-slate-300"
                    title={t('Ma propre voix (fichier audio ≤ 30 s)')}
                  >
                    {uploadBusy === lang ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      '📤'
                    )}
                  </Button>
                  {item ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void removeVoice(kind, lang)}
                      className="h-8 border-red-200 px-2.5 text-[12px] text-red-600 hover:bg-red-50 dark:border-red-500/40 dark:text-red-400"
                      title={t('Supprimer cette voix')}
                      aria-label={tf('Supprimer la voix {lang}', { lang: label })}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>
                {previewSrc ? (
                  <audio
                    controls
                    preload="none"
                    src={previewSrc}
                    className="mt-2 h-9 w-full"
                    aria-label={tf('Pré-écoute {lang}', { lang: label })}
                  />
                ) : null}
              </div>
            );
          })}
        </div>

        {/* ── Actions globales du moment (masquées pour la voix du
            guidebook : FR uniquement — v4.68) ── */}
        {kind === 'guidebook' ? (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-center text-[11px] font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
            {t('📖 La voix du guidebook est en français uniquement — écrivez votre texte ci-dessus puis générez la voix.')}
          </p>
        ) : (
        <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <Button
            type="button"
            variant="outline"
            disabled={translating || bulkBusy}
            onClick={() => void translateAll()}
            className="h-10 border-slate-300 text-[13px] font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200"
          >
            {translating ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <span aria-hidden="true">🤖</span>
            )}
            {translating ? t('Traduction…') : t('Traduire en 🇬🇧 · 🇪🇸 · 🇸🇦')}
          </Button>
          <Button
            type="button"
            disabled={bulkBusy || translating}
            onClick={() => void generateAll()}
            className="h-11 bg-amber-500 text-[13px] font-bold text-white hover:bg-amber-600"
          >
            {bulkBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <span aria-hidden="true">⚡</span>
            )}
            {bulkBusy
              ? tf('Génération {flag}… (≈ 1 min)', { flag: VOICE_LANG_META.find((m) => m.lang === bulkLang)?.flag ?? '' })
              : kindCount > 0
                ? tf('Générer les 4 voix (déjà {n}/4)', { n: kindCount })
                : t('Générer les 4 voix')}
          </Button>
          <p className="text-center text-[10px] leading-relaxed text-slate-400">
            {t('Les voix se jouent automatiquement côté invité : bienvenue au 1er clic « Mode Invité », veille après 20 h, jour J dès 9 h. Régénérer une voix la rejoue une nouvelle fois sur les téléphones déjà venus.')}
          </p>
        </div>
        )}

        {/* Input fichier caché (📤 voix du propriétaire) */}
        <input
          ref={fileRef}
          type="file"
          accept="audio/mpeg,audio/mp4,audio/webm,audio/wav,audio/ogg,.mp3,.m4a,.wav,.webm,.ogg"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ''; // permet de re-choisir le même fichier
            if (file) void onFilePicked(file);
          }}
          aria-hidden="true"
          tabIndex={-1}
        />
      </DialogContent>
    </Dialog>
  );
}

function waMeHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith('0')) digits = `33${digits.slice(1)}`;
  return digits.length >= 6 && digits.length <= 15 ? `https://wa.me/${digits}` : null;
}

// Dialog contact hôte + message vocal (répondeur).
// FIX « TOUT BLANC » + UX : PRÉ-ÉCOUTE obligatoire avant envoi
// (lecteur local sur blob URL → Envoyer / Réenregistrer) et
// RÉPONSES VOCALES DE L'HÔTE affichées à l'invité
// (GET /api/public/hub/[slug]/voice-replies — uniquement les
// messages senderType='HOST').
// FIX-32 (v4.21) : BUG BLOQUANT — recorder.ondataavailable n'était
// JAMAIS assigné → chunksRef restait vide → blob vide → erreur
// « Enregistrement vide » systématique. Le handler est restauré
// (même pattern que le guidebook /view et VoiceReplyButton).
// =============================================================
interface HostVoiceReply {
  id: string;
  senderName: string;
  audioUrl: string;
  /** v4.32 — copie dataURL en base (lecture durable). */
  audioData?: string | null;
  durationSec: number;
  createdAt: string;
  /** v4.77 — 'host'/'HOST' (vocal de l'hôte) ou 'guest' (réponse threadée invité). */
  senderType?: string;
  /** v4.77 — id du vocal hôte auquel répond CE message (thread). */
  replyToId?: string | null;
}

// =============================================================
// v4.77 « MESSAGES DE L'HÔTE — REFONTE » (validée par le client) :
// L'onglet ne contient PLUS QUE la vraie messagerie du séjour :
//   1. 🎤 Vocaux de l'hôte + réponses threadées de l'invité —
//      chaque vocal hôte porte un bouton « 🎙️ Répondre » : l'invité
//      enregistre (max 30 s), pré-écoute, envoie → POST /voice avec
//      replyToVoiceId (validé serveur : existe + même bien + vocal hôte).
//      COULEURS distinctes : reçus de l'hôte = bulles émerald à gauche,
//      envoyés par l'invité = bulles slate à droite (« Vous »).
//   2. ✍️ Réponses de l'hôte aux souvenirs du livre d'or.
//   3. 🧺 Suivi des commandes (en préparation…).
// SUPPRIMÉS de l'onglet (décision client) : les annonces vocales du hub
// (bienvenue / veille / jour J / guidebook) — elles continuent de se
// déclencher automatiquement aux bons moments, elles ne sont plus
// listées ici.
// =============================================================
/** v4.69 — Miroir client de HubOrderUpdate (route order-updates).
 *  Dupliqué volontairement : `import type` depuis un fichier de route
 *  API est interdit côté bundle client. */
interface HubOrderUpdate {
  id: string;
  kind: 'service' | 'minibar' | 'laundry';
  title: string;
  summary: string;
  statusLabel: string;
  statusEmoji: string;
  preparing: boolean;
  totalEur: number | null;
  at: string;
}

function HostMessagesDialog({
  open,
  onOpenChange,
  slug,
  guestName,
  memoriesWithHostReply,
  newReplyIds = [],
  onRepliesSeen,
  orderUpdates = [],
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  slug: string;
  /** v4.77 — prénom de l'invité (expéditeur des réponses vocales). */
  guestName?: string | null;
  memoriesWithHostReply?: HubPayload['guest']['memoriesWithHostReply'];
  /** ids des réponses vocales NON VUES (alerte partagée). */
  newReplyIds?: string[];
  /** Marque les réponses comme vues (éteint le badge « Contacter l'hôte »). */
  onRepliesSeen?: (ids: string[]) => void;
  /** v4.69 — statuts des commandes récentes (PHASE 4). */
  orderUpdates?: HubOrderUpdate[];
}) {
  const { t } = useHubLang();
  // 1) Vocaux de l'hôte + réponses threadées — chargés à chaque ouverture.
  const [replies, setReplies] = useState<HostVoiceReply[] | null>(null);
  const refreshReplies = useCallback(() => {
    let alive = true;
    fetch(`/api/public/hub/${encodeURIComponent(slug)}/voice-replies`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { replies: [] }))
      .then((j: { replies?: HostVoiceReply[] }) => {
        if (!alive) return;
        const list = Array.isArray(j.replies) ? j.replies : [];
        setReplies(list);
      })
      .catch(() => {
        if (alive) setReplies([]);
      });
    return () => {
      alive = false;
    };
  }, [slug]);
  useEffect(() => {
    if (!open) return;
    return refreshReplies();
  }, [open, refreshReplies]);

  /** Fermeture : les réponses affichées passent « vues » (badge éteint). */
  const handleOpenChange = useCallback(
    (v: boolean) => {
      if (!v && replies && replies.length > 0) {
        onRepliesSeen?.(replies.map((r) => r.id));
      }
      onOpenChange(v);
    },
    [replies, onRepliesSeen, onOpenChange],
  );

  // ── v4.77 — THREADS : vocaux hôtes (nouveaux en premier) + réponses
  // invité attachées (ordre chronologique) regroupées sous leur vocal. ──
  const threads = useMemo(() => {
    const list = replies ?? [];
    const hosts = list
      .filter((r) => (r.senderType ?? 'host').toLowerCase() === 'host')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return hosts.map((h) => ({
      host: h,
      guestReplies: list
        .filter((r) => r.replyToId === h.id)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    }));
  }, [replies]);

  // ── v4.77 — ENREGISTREUR DE RÉPONSE (invité, max 30 s — même
  // contrainte que « Contacter l'hôte »). Un thread à la fois. ──
  const MAX_REPLY_SEC = 30;
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const [preview, setPreview] = useState<{ url: string; blob: Blob; mime: string } | null>(null);
  const [sendingReply, setSendingReply] = useState(false);
  const replyRecorderRef = useRef<MediaRecorder | null>(null);
  const replyChunksRef = useRef<Blob[]>([]);
  const replyTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const replyMimeRef = useRef('audio/webm');
  const replyStreamRef = useRef<MediaStream | null>(null);

  const cleanupReplyRecording = useCallback(() => {
    if (replyTimerRef.current) {
      clearInterval(replyTimerRef.current);
      replyTimerRef.current = null;
    }
    replyStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    replyStreamRef.current = null;
    replyRecorderRef.current = null;
    replyChunksRef.current = [];
  }, []);

  const startReply = useCallback(
    async (hostVoiceId: string) => {
      if (recording || sendingReply) return;
      if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        toast.error(t("L'enregistrement vocal n'est pas disponible sur cet appareil."));
        return;
      }
      try {
        setReplyingTo(hostVoiceId);
        setPreview(null);
        setRecSec(0);
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        replyStreamRef.current = stream;
        const mimeType = pickRecorderMime();
        replyMimeRef.current = mimeType;
        const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        replyChunksRef.current = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) replyChunksRef.current.push(e.data);
        };
        recorder.onstop = () => {
          const blob = new Blob(replyChunksRef.current, { type: replyMimeRef.current || 'audio/webm' });
          setPreview({ url: URL.createObjectURL(blob), blob, mime: replyMimeRef.current || 'audio/webm' });
          setRecording(false);
          cleanupReplyRecording();
        };
        recorder.start();
        replyRecorderRef.current = recorder;
        setRecording(true);
        replyTimerRef.current = setInterval(() => {
          setRecSec((prev) => {
            const next = prev + 1;
            if (next >= MAX_REPLY_SEC) {
              const rec = replyRecorderRef.current;
              if (rec && rec.state === 'recording') rec.stop();
            }
            return next;
          });
        }, 1000);
      } catch {
        toast.error(t('Micro indisponible — autorisez l\'accès au microphone.'));
        setReplyingTo(null);
        setRecording(false);
        cleanupReplyRecording();
      }
    },
    [recording, sendingReply, t, cleanupReplyRecording],
  );

  const stopReplyRecording = useCallback(() => {
    const rec = replyRecorderRef.current;
    if (rec && rec.state === 'recording') rec.stop();
  }, []);

  const cancelReply = useCallback(() => {
    stopReplyRecording();
    setReplyingTo(null);
    setPreview((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
    setRecSec(0);
  }, [stopReplyRecording]);

  const sendReply = useCallback(
    async (hostVoiceId: string) => {
      if (!preview || sendingReply) return;
      setSendingReply(true);
      try {
        const fd = new FormData();
        fd.append('audio', new File([preview.blob], `reply.${extForMime(preview.mime)}`, { type: preview.mime }));
        fd.append('senderName', (guestName || 'Invité').trim().slice(0, 50));
        fd.append('durationSec', String(recSec || 1));
        fd.append('replyToVoiceId', hostVoiceId);
        const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/voice`, {
          method: 'POST',
          body: fd,
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        if (!res.ok) throw new Error(data.error || 'http');
        toast.success(data.message || t('Réponse envoyée à votre hôte !'));
        setReplyingTo(null);
        setPreview((prev) => {
          if (prev?.url) URL.revokeObjectURL(prev.url);
          return null;
        });
        setRecSec(0);
        refreshReplies();
      } catch (e) {
        const detail = e instanceof Error && !e.message.startsWith('http') ? e.message : null;
        toast.error(detail || t('Envoi impossible. Réessayez.'));
      } finally {
        setSendingReply(false);
      }
    },
    [preview, sendingReply, guestName, recSec, slug, t, refreshReplies],
  );

  // Nettoyage micro/objet-URL au démontage.
  useEffect(
    () => () => {
      cleanupReplyRecording();
    },
    [cleanupReplyRecording],
  );

  const hostMemoryReplies = memoriesWithHostReply ?? [];
  // État vide : affiché uniquement quand les réponses sont CHARGÉES (pas
  // pendant le fetch — sinon le message « Aucun message » clignoterait).
  const empty =
    replies !== null &&
    replies.length === 0 &&
    hostMemoryReplies.length === 0 &&
    orderUpdates.length === 0;

  return (
    <TileDialog
      open={open}
      onOpenChange={handleOpenChange}
      emoji="📨"
      tone="emerald"
      title={t("Messages de l'hôte")}
      subtitle={t('Vocaux et réponses de votre hôte — répondez par vocal')}
    >
      {empty ? (
        <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
          {t('Aucun message de votre hôte pour le moment')}
        </p>
      ) : (
        <div className="space-y-4">
          {/* 1 — 🎤 MESSAGERIE THREADÉE : vocaux de l'hôte (émerald, gauche)
              + réponses de l'invité (slate, droite) + bouton « Répondre ».
              Toujours affiché : le vide guide vers « Contacter l'hôte ». */}
          {(replies === null || threads.length >= 0) && (
            <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/60 p-3.5 dark:border-emerald-500/25 dark:bg-emerald-500/10">
              <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                🎤 {t('Messages vocaux')}
              </p>
              {replies === null ? (
                <p className="mt-2 flex items-center gap-2 text-xs text-emerald-800/70 dark:text-emerald-200/70">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> {t('Chargement…')}
                </p>
              ) : threads.length === 0 ? (
                <p className="mt-2 text-xs text-emerald-800/70 dark:text-emerald-200/70">
                  {t("Votre hôte n'a pas encore envoyé de vocal — écrivez-lui via « Contacter l'hôte ».")}
                </p>
              ) : (
                <div className="mt-2 space-y-3">
                  {threads.map(({ host, guestReplies }) => {
                    const isNew = newReplyIds.includes(host.id);
                    const isReplying = replyingTo === host.id;
                    return (
                      <div key={host.id} className="space-y-1.5">
                        {/* ── Vocal REÇU de l'hôte — bulle émerald à gauche ── */}
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-2.5 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-xs font-bold text-emerald-900 dark:text-emerald-200">
                              🎙️ {host.senderName}
                            </p>
                            <div className="flex shrink-0 items-center gap-1.5">
                              {isNew ? (
                                <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                                  {t('Nouveau')}
                                </span>
                              ) : (
                                <span className="text-[10px] font-semibold text-slate-400">{t('lu ✓')}</span>
                              )}
                              <span className="text-[10px] text-slate-400">
                                {new Date(host.createdAt).toLocaleDateString('fr-FR', {
                                  day: 'numeric',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                                {host.durationSec > 0 ? ` · ${host.durationSec}s` : ''}
                              </span>
                            </div>
                          </div>
                          <audio
                            controls
                            preload="metadata"
                            src={voicePlaybackSrc(host.audioData, host.audioUrl)}
                            className="mt-1.5 h-9 w-full"
                            aria-label={t('Message vocal de votre hôte')}
                          />
                          {/* Répondre par vocal — enregistreur inline 30 s */}
                          {isReplying ? (
                            <div className="mt-2 rounded-xl border border-slate-200 bg-white p-2.5 dark:border-white/10 dark:bg-slate-900">
                              {recording ? (
                                <div className="flex items-center justify-between gap-2">
                                  <p className="flex items-center gap-2 text-xs font-bold text-red-600 dark:text-red-400">
                                    <span aria-hidden="true" className="animate-pulse">⏺️</span>
                                    {t('Enregistrement…')} {recSec}s / {MAX_REPLY_SEC}s
                                  </p>
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="h-9 min-h-9 bg-red-600 px-3 text-xs font-bold text-white hover:bg-red-700"
                                    onClick={stopReplyRecording}
                                  >
                                    ⏹️ {t('Arrêter')}
                                  </Button>
                                </div>
                              ) : preview ? (
                                <div className="space-y-2">
                                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                                    👂 {t('Pré-écoutez votre réponse')}
                                  </p>
                                  <audio
                                    controls
                                    src={preview.url}
                                    className="h-9 w-full"
                                    aria-label={t('Pré-écoute de votre réponse')}
                                  />
                                  <div className="grid grid-cols-2 gap-2">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-9 min-h-9 border-slate-300 text-xs text-slate-600 dark:border-white/20 dark:text-slate-300"
                                      onClick={() => {
                                        setPreview((prev) => {
                                          if (prev?.url) URL.revokeObjectURL(prev.url);
                                          return null;
                                        });
                                        setRecSec(0);
                                        void startReply(host.id);
                                      }}
                                      disabled={sendingReply}
                                    >
                                      🔁 {t('Réenregistrer')}
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      className="h-9 min-h-9 bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-700"
                                      onClick={() => void sendReply(host.id)}
                                      disabled={sendingReply}
                                    >
                                      {sendingReply ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                                      ) : (
                                        '📤'
                                      )}
                                      {sendingReply ? t('Envoi…') : t('Envoyer')}
                                    </Button>
                                  </div>
                                </div>
                              ) : null}
                              <button
                                type="button"
                                className="mt-1.5 w-full text-center text-[10px] font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                                onClick={cancelReply}
                              >
                                {t('Annuler ma réponse')}
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void startReply(host.id)}
                              disabled={!!replyingTo || sendingReply}
                              className="mt-2 inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-3 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-500/40 dark:bg-slate-900 dark:text-emerald-300 dark:hover:bg-emerald-500/10 cursor-pointer"
                            >
                              🎙️ {t('Répondre par vocal')}
                            </button>
                          )}
                        </div>
                        {/* ── Réponses ENVOYÉES par l'invité — bulles slate à droite ── */}
                        {guestReplies.map((g) => (
                          <div
                            key={g.id}
                            className="ml-auto w-[92%] rounded-xl border border-slate-300 bg-slate-100 p-2.5 dark:border-white/15 dark:bg-slate-800"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">
                                🗣️ {t('Vous')}
                              </p>
                              <span className="shrink-0 text-[10px] text-slate-400">
                                {new Date(g.createdAt).toLocaleDateString('fr-FR', {
                                  day: 'numeric',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                                {g.durationSec > 0 ? ` · ${g.durationSec}s` : ''}
                              </span>
                            </div>
                            <audio
                              controls
                              preload="metadata"
                              src={voicePlaybackSrc(g.audioData, g.audioUrl)}
                              className="mt-1.5 h-9 w-full"
                              aria-label={t('Votre réponse vocale')}
                            />
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 2 — ✍️ Réponses écrites de l'hôte aux souvenirs du livre d'or
              (bloc masqué si le payload ne contient pas la liste) */}
          {hostMemoryReplies.length > 0 && (
            <div className="rounded-2xl border border-amber-200/80 bg-amber-50/60 p-3.5 dark:border-amber-500/25 dark:bg-amber-500/10">
              <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                ✍️ {t("Réponses de l'hôte à vos souvenirs")}
              </p>
              <div className="mt-2 space-y-2">
                {hostMemoryReplies.map((m) => (
                  <div
                    key={m.id}
                    className="rounded-xl border border-slate-200 bg-white p-2.5 dark:border-white/10 dark:bg-slate-900"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
                        {m.guestName ? m.guestName : t('Un voyageur')}
                      </p>
                      <span className="shrink-0 text-[10px] text-slate-400">
                        {(m.hostReplyAt ?? m.createdAt)
                          ? new Date((m.hostReplyAt ?? m.createdAt) as string).toLocaleDateString('fr-FR', {
                              day: 'numeric',
                              month: 'short',
                            })
                          : ''}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                      {m.hostReply}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3 — 🧺 v4.69 « NOTIFICATIONS COMMANDES » (PHASE 4) : suivi des
              commandes récentes — l'alerte « En préparation » rassure
              l'invité pendant que l'hôte s'occupe de sa demande. */}
          {orderUpdates.length > 0 && (
            <div className="rounded-2xl border border-sky-200/80 bg-sky-50/60 p-3.5 dark:border-sky-500/25 dark:bg-sky-500/10">
              <p className="text-[11px] font-bold uppercase tracking-wide text-sky-700 dark:text-sky-300">
                🧺 {t('Vos commandes')}
              </p>
              <div className="mt-2 space-y-2">
                {orderUpdates.map((u) => {
                  const d = new Date(u.at);
                  return (
                    <div
                      key={u.id}
                      className={`rounded-xl border p-2.5 ${
                        u.preparing
                          ? 'border-amber-300 bg-amber-50 ring-1 ring-amber-300/60 dark:border-amber-500/40 dark:bg-amber-500/10 dark:ring-amber-500/30'
                          : 'border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
                          <span aria-hidden="true">{u.statusEmoji}</span> {u.title}
                        </p>
                        <span className="shrink-0 text-[10px] text-slate-400">
                          {Number.isNaN(d.getTime())
                            ? ''
                            : d.toLocaleDateString('fr-FR', {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                        </span>
                      </div>
                      {u.summary && (
                        <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">{u.summary}</p>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            u.preparing
                              ? 'animate-pulse bg-amber-500 text-white'
                              : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'
                          }`}
                        >
                          {u.statusEmoji} {u.statusLabel}
                        </span>
                        {typeof u.totalEur === 'number' && u.totalEur > 0 && (
                          <span className="text-[10px] font-semibold text-slate-400">
                            {u.totalEur.toFixed(2).replace('.', ',')} €
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </TileDialog>
  );
}

// v4.32 « ONGLET MESSAGES » — journal local des messages envoyés depuis
// CET appareil (localStorage, par slug) : l'invité voit ses messages en
// attente et leur statut (En attente / Lu par l'hôte). Aucune donnée
// personnelle : uniquement des ids de messages déjà envoyés.
interface SentMessageEntry {
  id: string;
  at: number;
}
const sentMessagesKey = (slug: string) => `hub-guest-msgs-${slug}`;

function readSentMessages(slug: string): SentMessageEntry[] {
  try {
    const raw = window.localStorage.getItem(sentMessagesKey(slug));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e): e is SentMessageEntry => !!e && typeof (e as SentMessageEntry).id === 'string')
      .slice(-20);
  } catch {
    return [];
  }
}

function rememberSentMessage(slug: string, id: string) {
  try {
    const list = readSentMessages(slug).filter((e) => e.id !== id);
    list.push({ id, at: Date.now() });
    window.localStorage.setItem(sentMessagesKey(slug), JSON.stringify(list.slice(-20)));
  } catch {
    // localStorage indisponible (navigation privée) : onglet Messages vide
  }
}

function ContactDialog({
  open,
  onClose,
  slug,
  contact,
  propertyName,
  newReplyCount = 0,
  onRepliesSeen,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  contact: HubPayload['guest']['contact'];
  propertyName: string;
  /** v4.35 — nombre de réponses vocales de l'hôte NON VUES (badge). */
  newReplyCount?: number;
  /** v4.35 — marque les réponses comme vues (alerte carte Contact éteinte). */
  onRepliesSeen?: (ids: string[]) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [sending, setSending] = useState(false);
  // PRÉ-ÉCOUTE : blob local avant envoi (url révoquée au nettoyage).
  const [preview, setPreview] = useState<{ url: string; blob: Blob; mime: string; duration: number } | null>(null);
  // Réponses vocales de l'hôte (senderType='HOST').
  const [replies, setReplies] = useState<HostVoiceReply[] | null>(null);
  // v4.32 — onglet Messages : journal local + statuts serveur.
  const [sentMessages, setSentMessages] = useState<SentMessageEntry[]>([]);
  const [msgStatuses, setMsgStatuses] = useState<Record<string, 'pending' | 'read' | 'unknown'>>({});
  const [activeTab, setActiveTab] = useState<'contact' | 'messages'>('contact');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const secondsRef = useRef(0);
  // FIX-VOCAL : mimeType réellement utilisé par le recorder (Safari/iOS
  // n'enregistre PAS en webm — il faut audio/mp4 → extension .m4a).
  const mimeRef = useRef('audio/webm');

  const stopTimers = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const cleanup = useCallback(() => {
    stopTimers();
    setRecording(false);
    setSeconds(0);
    secondsRef.current = 0;
    recorderRef.current?.stream?.getTracks?.().forEach((t) => t.stop());
    recorderRef.current = null;
    chunksRef.current = [];
    setPreview((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
    setReplies(null);
    setActiveTab('contact');
  }, []);

  useEffect(() => {
    if (!open) cleanup();
  }, [open, cleanup]);

  // v4.35 — réponses vocales de l'hôte : POLLING toutes les 25 s tant que
  // le dialog est ouvert (avant : un seul chargement à l'ouverture → une
  // réponse arrivée pendant la conversation n'apparaissait JAMAIS sans
  // fermer/réouvrir — « la réponse n'est pas lisible dans la page contact »).
  // L'ouverture de l'onglet Messages marque les réponses comme vues.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const load = () => {
      fetch(`/api/public/hub/${encodeURIComponent(slug)}/voice-replies`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : { replies: [] }))
        .then((j: { replies?: HostVoiceReply[] }) => {
          if (!alive) return;
          const list = Array.isArray(j.replies) ? j.replies : [];
          setReplies(list);
          if (activeTab === 'messages' && list.length > 0) {
            onRepliesSeen?.(list.map((r) => r.id));
          }
        })
        .catch(() => undefined);
    };
    load();
    const timer = setInterval(load, 25_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [open, slug, activeTab, onRepliesSeen]);

  // v4.32 — journal local des messages envoyés + statuts serveur.
  // Rechargé à l'ouverture et à chaque activation de l'onglet Messages.
  useEffect(() => {
    if (!open) return;
    const list = readSentMessages(slug);
    setSentMessages(list);
    if (list.length === 0) return;
    let cancelled = false;
    const ids = list.map((e) => e.id).join(',');
    fetch(`/api/public/hub/${encodeURIComponent(slug)}/guest-messages?ids=${encodeURIComponent(ids)}`, {
      cache: 'no-store',
    })
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((j: { messages?: { id: string; status: 'pending' | 'read' | 'unknown' }[] }) => {
        if (cancelled || !Array.isArray(j.messages)) return;
        const map: Record<string, 'pending' | 'read' | 'unknown'> = {};
        for (const m of j.messages) map[m.id] = m.status;
        setMsgStatuses((prev) => ({ ...prev, ...map }));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, slug, activeTab]);

  const stopRecording = (send: boolean) => {
    const recorder = recorderRef.current;
    stopTimers();
    if (!recorder) return;
    const duration = secondsRef.current;
    recorder.onstop = async () => {
      recorder.stream.getTracks().forEach((t) => t.stop());
      recorderRef.current = null;
      setRecording(false);
      if (!send) {
        toast.info('Enregistrement annulé.');
        return;
      }
      // FIX-VOCAL : type MIME réel du recorder (jamais forcé en webm —
      // Safari/iOS produit de l'audio/mp4 ; l'étiqueter webm cassait la lecture).
      const mimeType = mimeRef.current.split(';')[0].trim() || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type: mimeType });
      if (blob.size === 0) {
        toast.error('Enregistrement vide. Réessayez.');
        return;
      }
      // PRÉ-ÉCOUTE — on ne POSTe plus immédiatement : l'invité écoute
      // son message puis choisit « Envoyer » ou « Réenregistrer ».
      const url = URL.createObjectURL(blob);
      setPreview({ url, blob, mime: mimeType, duration });
    };
    recorder.stop();
  };

  const sendPreview = async () => {
    if (!preview) return;
    setSending(true);
    try {
      const fd = new FormData();
      fd.append('audio', new File([preview.blob], `message.${extForMime(preview.mime)}`, { type: preview.mime }));
      fd.append('senderName', 'Invité');
      fd.append('durationSec', String(preview.duration));
      const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/voice`, {
        method: 'POST',
        body: fd,
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; id?: string };
      if (!res.ok) {
        throw new Error(data.error || 'http');
      }
      // v4.32 — journalise l'envoi : l'onglet « Messages » affiche ce
      // message avec son statut (En attente / Lu par l'hôte).
      if (data.id) {
        rememberSentMessage(slug, data.id);
        setSentMessages((prev) => [...prev.filter((e) => e.id !== data.id!), { id: data.id!, at: Date.now() }]);
        setMsgStatuses((prev) => ({ ...prev, [data.id!]: 'pending' }));
      }
      toast.success('Message envoyé à votre hôte ✅');
      onClose();
    } catch (e) {
      const detail = e instanceof Error && e.message !== 'http' ? e.message : null;
      toast.error(detail || 'Envoi impossible. Réessayez.');
    } finally {
      setSending(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // FIX-VOCAL : sélection du premier mimeType supporté par le navigateur
      // (webm/opus sur Chrome-Firefox, mp4/AAC sur Safari/iOS — avant, un
      // format non supporté levait une NotSupportedError ici).
      const mimeType = pickRecorderMime();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mimeRef.current = recorder.mimeType || mimeType || 'audio/webm';
      chunksRef.current = [];
      // FIX-32 : sans ce handler, les chunks audio ne sont JAMAIS
      // collectés → enregistrement vide à l'arrêt (bug bloquant).
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setSeconds(0);
      secondsRef.current = 0;
      timerRef.current = setInterval(() => {
        secondsRef.current += 1;
        setSeconds(secondsRef.current);
        if (secondsRef.current >= 30) {
          stopRecording(true);
        }
      }, 1000);
    } catch {
      toast.error('Micro inaccessible. Vérifiez les autorisations du navigateur.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !sending && onClose()}>
      <DialogContent className="max-w-sm overflow-hidden rounded-3xl border border-slate-200 bg-white p-0 sm:max-w-md dark:border-white/10 dark:bg-slate-900">
        <div className="max-h-[86dvh] overflow-y-auto custom-scrollbar">
          {/* ── v4.35 — EN-TÊTE « VOTRE HÔTE » : avatar initiales + nom +
              promesse de réponse (refonte : clarté du canal avant tout) ── */}
          <div className="sticky top-0 z-10 border-b border-emerald-100 bg-gradient-to-r from-emerald-600 to-teal-600 px-5 pb-4 pt-5 text-white dark:border-white/10 dark:from-emerald-700 dark:to-teal-800">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/40 bg-white/20 text-base font-bold uppercase backdrop-blur-sm"
              >
                {contact.name
                  .trim()
                  .split(/\s+/)
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join('') || '🏠'}
              </span>
              <div className="min-w-0 flex-1">
                <DialogTitle className="display-title font-serif! truncate text-lg font-bold text-white">
                  {contact.name}
                </DialogTitle>
                <DialogDescription className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium text-emerald-50/95">
                  <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-emerald-300" />
                  Votre hôte · répond en quelques minutes
                </DialogDescription>
              </div>
            </div>
          </div>

          <div className="px-4 pb-5 pt-4 sm:px-5">
        {/* v4.32 — ONGLETS Contact / Messages (demande client : « créer un
            onglet messages dans contacter l'hôte et y loger les messages
            en attente »). v4.35 — le badge rouge compte désormais les
            réponses de l'hôte NON VUES (💬 n) avant les messages en attente. */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v === 'messages' ? 'messages' : 'contact')}
        >
          <TabsList className="grid h-11 w-full grid-cols-2 rounded-2xl bg-slate-100 p-1 dark:bg-white/10">
            <TabsTrigger
              value="contact"
              className="rounded-xl text-[13px] font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-slate-900"
            >
              📞 Contact
            </TabsTrigger>
            <TabsTrigger
              value="messages"
              className="rounded-xl text-[13px] font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-slate-900"
            >
              📨 Messages
              {(() => {
                const pending = sentMessages.filter((m) => (msgStatuses[m.id] ?? 'pending') === 'pending').length;
                return newReplyCount > 0 ? (
                  <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center gap-0.5 rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                    💬 {newReplyCount}
                  </span>
                ) : pending > 0 ? (
                  <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                    {pending}
                  </span>
                ) : null;
              })()}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="contact" className="mt-4">
            <div className="space-y-3">
              {/* ÉTAPE 1 — joindre l'hôte tout de suite (3 canaux clairs) */}
              <p className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                1 · Joindre votre hôte maintenant
              </p>
              {contact.phone && (
                <a
                  href={`tel:${contact.phone.replace(/\s/g, '')}`}
                  className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                >
                  <span
                    aria-hidden="true"
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-xl"
                  >
                    📞
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-slate-900 dark:text-white">
                      Appeler {contact.name}
                    </span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">{contact.phone}</span>
                  </span>
                  <Phone className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                </a>
              )}
              {/* FIX-32 — WhatsApp (wa.me) dérivé du téléphone de l'hôte */}
              {(() => {
                const waHref = waMeHref(contact.phone);
                return waHref ? (
                  <a
                    href={waHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Contacter ${contact.name} sur WhatsApp`}
                    className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 shadow-sm transition-colors hover:border-emerald-300 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10"
                  >
                    <span
                      aria-hidden="true"
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-xl text-white"
                    >
                      💬
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-emerald-900 dark:text-emerald-100">
                        WhatsApp — le plus rapide
                      </span>
                      <span className="block text-xs text-emerald-700 dark:text-emerald-300">
                        Écrire à {contact.name} sur WhatsApp
                      </span>
                    </span>
                    <MessageCircle className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
                  </a>
                ) : null;
              })()}
              {contact.email && (
                <a
                  href={`mailto:${contact.email}?subject=${encodeURIComponent(`Message du Hub — ${propertyName}`)}`}
                  className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 shadow-sm transition-colors hover:border-amber-300 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10"
                >
                  <span
                    aria-hidden="true"
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-xl text-white"
                  >
                    ✉️
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-amber-900 dark:text-amber-100">
                      Écrire un email
                    </span>
                    <span className="block truncate text-xs text-amber-700 dark:text-amber-300">{contact.email}</span>
                  </span>
                  <Mail className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
                </a>
              )}

              {/* ÉTAPE 2 — répondeur vocal (pré-écoute avant envoi) */}
              <p className="pt-1 text-[10.5px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                2 · Ou laisser un message vocal
              </p>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                <p className="text-sm font-bold text-emerald-900 dark:text-emerald-100">
                  🎙️ Répondeur de votre hôte
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-emerald-800 dark:text-emerald-200">
                  Décrivez votre demande en 30 s max — vous pouvez l&apos;écouter avant de l&apos;envoyer.
                </p>
                {sending ? (
                  <div className="mt-3 flex items-center gap-2 text-sm text-emerald-800 dark:text-emerald-200">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Envoi en cours…
                  </div>
                ) : preview ? (
                  <div className="mt-3 space-y-2.5">
                    <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-100">
                      🎧 Écoutez votre message ({preview.duration}s) avant de l&apos;envoyer
                    </p>
                    <audio
                      controls
                      autoPlay
                      src={preview.url}
                      className="h-9 w-full"
                      aria-label="Pré-écoute de votre message vocal"
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-9 flex-1 border-slate-300 text-slate-600 dark:border-white/20 dark:text-slate-300"
                        onClick={() => {
                          setPreview((prev) => {
                            if (prev?.url) URL.revokeObjectURL(prev.url);
                            return null;
                          });
                        }}
                      >
                        Réenregistrer
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-9 flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                        onClick={sendPreview}
                      >
                        Envoyer
                      </Button>
                    </div>
                  </div>
                ) : recording ? (
                  <div className="mt-3 flex items-center gap-2.5 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 text-sm font-bold text-red-600">
                      <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
                      {String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      className="h-9 bg-slate-900 hover:bg-slate-800 text-white font-semibold"
                      onClick={() => stopRecording(true)}
                    >
                      <Square className="h-3.5 w-3.5" aria-hidden="true" /> Écouter avant envoi
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-9 border-slate-300 text-slate-600 dark:border-white/20 dark:text-slate-300"
                      onClick={() => stopRecording(false)}
                    >
                      Annuler
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    className="mt-3 w-full h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                    onClick={startRecording}
                  >
                    <Mic className="h-4 w-4" aria-hidden="true" /> Démarrer l&apos;enregistrement
                  </Button>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ── v4.32 — ONGLET « MESSAGES » : les messages EN ATTENTE de
              l'invité (journal de cet appareil) + les réponses de l'hôte.
              v4.35 — re-design clair + réponses ACTUALISÉES toutes les
              25 s (le propriétaire répond → visible sans fermer) ── */}
          <TabsContent value="messages" className="mt-4">
            <div className="space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-white/10 dark:bg-white/5">
                <p className="text-sm font-bold text-slate-900 dark:text-white">📨 Vos messages</p>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  Envoyés depuis cet appareil — suivez leur statut.
                </p>
                {sentMessages.length === 0 ? (
                  <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    Aucun message pour le moment. Laissez un vocal dans l&apos;onglet
                    <span className="font-semibold"> Contact</span> — il apparaîtra ici avec son statut.
                  </p>
                ) : (
                  <div className="mt-2.5 space-y-2 max-h-44 overflow-y-auto custom-scrollbar">
                    {[...sentMessages].reverse().map((m) => {
                      const status = msgStatuses[m.id] ?? 'pending';
                      return (
                        <div key={m.id} className="flex items-center gap-2.5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 dark:bg-white/5 dark:border-white/10">
                          <span className="text-base shrink-0" aria-hidden="true">🎙️</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-900 dark:text-white">Message vocal</p>
                            <p className="text-[10px] text-slate-400">
                              {new Date(m.at).toLocaleDateString('fr-FR', {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                          </div>
                          {status === 'read' ? (
                            <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                              ✓ Lu par l&apos;hôte
                            </span>
                          ) : status === 'unknown' ? (
                            <span className="shrink-0 text-[10px] font-semibold text-slate-400">—</span>
                          ) : (
                            <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                              ⏳ En attente
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Réponses vocales de votre hôte — v4.35 : actualisation auto */}
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-emerald-900 dark:text-emerald-100">
                    💬 Réponses de votre hôte
                  </p>
                  <span className="shrink-0 text-[10px] font-medium text-emerald-700/80 dark:text-emerald-300/80">
                    Actualisé auto
                  </span>
                </div>
                {replies === null ? (
                  <p className="mt-2 flex items-center gap-2 text-xs text-emerald-800/70 dark:text-emerald-200/70">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Chargement…
                  </p>
                ) : replies.length === 0 ? (
                  <p className="mt-2 text-xs leading-relaxed text-emerald-800/80 dark:text-emerald-200/80">
                    Votre hôte n&apos;a pas encore laissé de réponse vocale — il vous répondra ici.
                  </p>
                ) : (
                  <div className="mt-2 space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                    {replies.map((r) => (
                      <div key={r.id} className="bg-white border border-slate-200 rounded-lg p-2.5 dark:bg-slate-900 dark:border-white/10">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-bold text-slate-900 truncate dark:text-white">{r.senderName}</p>
                          <span className="text-[10px] text-slate-400 shrink-0">
                            {new Date(r.createdAt).toLocaleDateString('fr-FR', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                            {r.durationSec > 0 ? ` · ${r.durationSec}s` : ''}
                          </span>
                        </div>
                        <audio
                          controls
                          preload="metadata"
                          src={voicePlaybackSrc(r.audioData, r.audioUrl)}
                          className="mt-1.5 h-9 w-full"
                          aria-label={`Réponse vocale de ${r.senderName}`}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

