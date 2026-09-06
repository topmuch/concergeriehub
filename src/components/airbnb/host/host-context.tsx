'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

// =============================================================
// HostContext — contexte global du Dashboard Client (Espace Hôte)
//
// Charge le portfolio (/api/airbnb/properties) une seule fois pour
// tout le shell : biens accessibles (possédés + équipe acceptée),
// limites de plan, invitations en attente, propriété sélectionnée
// (persistée en localStorage pour survivre à la navigation).
//
// `selectedId` vaut 'all' (toutes les propriétés) par défaut ;
// les pages décident de l'agrégat adapté via selectedIds().
// =============================================================

/** Stats d'un bien renvoyées par /api/airbnb/properties (30 derniers jours). */
export interface PropertyStats {
  occupancyRate: number;
  bookedNights: number;
  upcomingBookings: number;
  nextBooking: { guestName: string; checkIn: string; checkOut: string } | null;
  scans30d: number;
  lastScanAt: string | null;
  upsellRevenue30d: number;
  upsellOrders30d: number;
  qrCount: number;
  membersCount: number;
  pendingInvites: number;
  unreadGuestMessages: number;
}

export interface HostProperty {
  id: string;
  name: string;
  propertyType: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
  qrHubSlug: string | null;
  createdAt: string | null;
  myRole: string;
  isOwner: boolean;
  stats: PropertyStats;
}

export interface HostInvitation {
  membershipId: string;
  role: string;
  invitedAt: string;
  property: { id: string; name: string; propertyType: string; address: string | null };
}

export interface HostPlanInfo {
  planId: string | null;
  planName: string;
  maxProperties: number;
  isPro: boolean;
  ownedCount: number;
  canAddProperty: boolean;
}

interface HostContextValue {
  /** Biens accessibles (possédés + équipe acceptée). */
  properties: HostProperty[];
  propertiesLoading: boolean;
  propertiesError: string | null;
  /** 'all' ou id de propriété — persisté en localStorage. */
  selectedId: string;
  setSelectedId: (id: string) => void;
  /** ['all'] si toutes, sinon [id] — prêt pour les clauses Prisma `in`. */
  selectedIds: () => string[];
  selectedProperty: HostProperty | null;
  plan: HostPlanInfo | null;
  invitations: HostInvitation[];
  /** Recharge le portfolio (après création de bien, invitation…). */
  refreshProperties: () => Promise<void>;
  /** Niveau d'accès calculé côté serveur par le layout. */
  accessLevel: 'full' | 'team';
  userFirstName: string;
  /** Chantier ONBOARD — false tant que l'assistant post-inscription
   *  n'a pas été terminé (renseigné par /api/airbnb/properties). */
  onboardingCompleted: boolean;
}

const STORAGE_KEY = 'ch-host:selected-property';

const HostContext = createContext<HostContextValue | null>(null);

interface HostProviderProps {
  children: ReactNode;
  accessLevel: 'full' | 'team';
  userFirstName: string;
}

export function HostProvider({ children, accessLevel, userFirstName }: HostProviderProps) {
  const [properties, setProperties] = useState<HostProperty[]>([]);
  const [propertiesLoading, setPropertiesLoading] = useState(true);
  const [propertiesError, setPropertiesError] = useState<string | null>(null);
  const [plan, setPlan] = useState<HostPlanInfo | null>(null);
  const [invitations, setInvitations] = useState<HostInvitation[]>([]);
  const [selectedId, setSelectedIdState] = useState<string>('all');
  // Défaut true : ne déclenche PAS le wizard tant que la base n'a pas répondu.
  const [onboardingCompleted, setOnboardingCompleted] = useState(true);

  // ----- Restauration de la sélection (effet post-hydration) -----
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setSelectedIdState(saved);
    } catch {
      /* localStorage indisponible — valeur par défaut 'all' */
    }
  }, []);

  const fetchProperties = useCallback(async () => {
    try {
      setPropertiesError(null);
      const res = await fetch('/api/airbnb/properties', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        properties: HostProperty[];
        plan: HostPlanInfo;
        invitations: HostInvitation[];
        user?: { onboardingCompleted?: boolean };
      };
      setProperties(data.properties ?? []);
      setPlan(data.plan ?? null);
      setInvitations(data.invitations ?? []);
      setOnboardingCompleted(data.user?.onboardingCompleted ?? true);
    } catch (error) {
      console.error('[HostProvider] properties fetch failed:', error);
      setPropertiesError('Impossible de charger vos propriétés. Rechargez la page.');
    } finally {
      setPropertiesLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchProperties();
  }, [fetchProperties]);

  // ----- Sélection : persiste + garde la validité -----
  const setSelectedId = useCallback(
    (id: string) => {
      setSelectedIdState(id);
      try {
        window.localStorage.setItem(STORAGE_KEY, id);
      } catch {
        /* ignore */
      }
    },
    [],
  );

  // Si la propriété sauvegardée n'existe plus (supprimée / accès retiré),
  // retombe sur 'all' dès le chargement du portfolio.
  useEffect(() => {
    if (propertiesLoading) return;
    if (selectedId !== 'all' && !properties.some((p) => p.id === selectedId)) {
      setSelectedId('all');
    }
  }, [properties, propertiesLoading, selectedId, setSelectedId]);

  const selectedIds = useCallback(() => {
    if (selectedId === 'all') return properties.map((p) => p.id);
    return properties.some((p) => p.id === selectedId) ? [selectedId] : [];
  }, [selectedId, properties]);

  const selectedProperty = useMemo(
    () => (selectedId === 'all' ? null : properties.find((p) => p.id === selectedId) ?? null),
    [selectedId, properties],
  );

  const value = useMemo<HostContextValue>(
    () => ({
      properties,
      propertiesLoading,
      propertiesError,
      selectedId,
      setSelectedId,
      selectedIds,
      selectedProperty,
      plan,
      invitations,
      refreshProperties: fetchProperties,
      accessLevel,
      userFirstName,
      onboardingCompleted,
    }),
    [
      properties,
      propertiesLoading,
      propertiesError,
      selectedId,
      setSelectedId,
      selectedIds,
      selectedProperty,
      plan,
      invitations,
      fetchProperties,
      accessLevel,
      userFirstName,
      onboardingCompleted,
    ],
  );

  return <HostContext.Provider value={value}>{children}</HostContext.Provider>;
}

/** Accès au contexte hôte — à utiliser sous <HostProvider>. */
export function useHostContext(): HostContextValue {
  const ctx = useContext(HostContext);
  if (!ctx) {
    throw new Error('useHostContext doit être utilisé sous <HostProvider>');
  }
  return ctx;
}
