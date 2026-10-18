'use client';

// =============================================================
// MessagesContent — ONGLET MESSAGES du Dashboard Client (/airbnb/messages)
//
// Centre unifié des entrées invitées :
//   Messages vocaux (VoiceMessage) — envoyés via « Contacter l'hôte »
//      du Hub et les modules QR vocaux. Lecture directe via la route
//      /api/uploads/voice/[file] (correction du bug de lecture en
//      standalone). Marquage « lu » automatique à la lecture.
//   Signalements de problème (GuestComplaint) — envoyés via
//      « Signaler un problème » du Hub. Photos, urgence, résolution.
//   Ménage : depuis la v4.43, les preuves de ménage (rapports de
//      passage, photos, vocaux de l'équipe) vivent dans l'ONGLET DÉDIÉ
//      « Ménage » (/airbnb/menage) — demandé par le client.
//
// Filtre : suit la propriété sélectionnée dans le header du shell
// (HostContext). Rafraîchissement : bouton + polling 45 s.
//
// v4.60 « AIRBNB PRO » puis v5.2 « SAPHIR LUXE » — refontes visuelles
// uniquement (zéro logique) : cartes lux-card, typographie sans icône,
// empty states .lux-empty, CTA .lux-btn, thème nuit saphir.
// v4.69 — PHASE 1 refonte UI « messagerie moderne » (maître-détail) :
//   colonne GAUCHE = recherche + segmented Vocaux/Signalements +
//   conversations groupées par expéditeur|bien (avatar monogramme,
//   aperçu, temps relatif, pastille non-lus) ; colonne DROITE = fil de
//   bulles (invités à gauche, hôte à droite) avec lecteur vocal custom
//   (play/pause + waveform), suppression poubelle + rollback, pied de
//   thread « Répondre par vocal » réutilisant VoiceReplyButton ;
//   signalements affichés pleine largeur dans la colonne droite ;
//   mobile : liste seule puis thread plein écran avec retour.
//   Logique/API inchangées (PATCH read/resolve/read-all, DELETE, 45 s).
// =============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
// v5.2 « SAPHIR LUXE » — refonte design (zéro logique modifiée) : le seul
// lucide conservé est le lecteur audio (Play/Pause, strictement fonctionnel) ;
// tout l'habillage passe au thème nuit saphir (.lux-*, teintes white/[0.03..0.06]).
import { Pause, Play } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useHostContext } from '@/components/airbnb/host/host-context';
import { useRefreshMessageCounts } from '@/components/airbnb/messages-badge';
import { voicePlaybackSrc } from '@/lib/voice-audio';
import { relativeFrTime } from '@/lib/automations';
import { cn } from '@/lib/utils';
// RÉPONSE VOCALE — le propriétaire répond par message vocal enregistré.
import { VoiceReplyButton } from '@/components/airbnb/host/voice-reply-button';
// v4.53 « FICHE ASSURANCE / INVENTAIRE EN 1 CLIC » — PDF pré-rempli
// pour les réclamations de caution (Airbnb / assurance habitation).
import { downloadInsurancePdf } from '@/lib/insurance-pdf';

// ── Types (contrat de /api/airbnb/messages) ──

interface VoiceItem {
  id: string;
  propertyId: string;
  propertyName: string | null;
  senderName: string;
  senderType: string;
  audioUrl: string;
  /** v4.32 — copie dataURL en base (lecture durable, v. bug redéploiements). */
  audioData?: string | null;
  durationSec: number;
  fileSizeKb: number;
  isRead: boolean;
  createdAt: string;
}

interface ComplaintItem {
  id: string;
  propertyId: string;
  propertyName: string | null;
  category: string;
  description: string;
  photos: string[];
  isUrgent: boolean;
  guestName: string | null;
  status: string;
  /** v4.32 — notification déjà vue (badge rouge éteint une fois lue). */
  isRead?: boolean;
  createdAt: string;
}

/** v4.69 — conversation = groupe de vocaux partageant le même
 *  expéditeur sur le même bien (clé `${senderName}|${propertyId}`). */
interface Conversation {
  key: string;
  senderName: string;
  propertyId: string;
  propertyName: string | null;
  /** Messages triés du plus ancien au plus récent. */
  messages: VoiceItem[];
  lastAt: number;
  /** Nb de vocaux invités non lus (les réponses de l'hôte ne comptent pas). */
  unread: number;
  totalDurationSec: number;
}

type MessagesTab = 'voice' | 'complaints';

/** v4.42 — rapport de passage ménage : DÉPLACÉ dans l'onglet Ménage
 *  (/airbnb/menage, v4.43) — plus affiché ici. */

const COMPLAINT_LABELS: Record<string, { label: string }> = {
  PLUMBING: { label: 'Plomberie' },
  ELECTRICAL: { label: 'Électricité' },
  CLEANING: { label: 'Ménage' },
  // v4.53 — casse invité : bouton « Fiche assurance » pré-remplie.
  BREAKAGE: { label: 'Casse / objet abîmé' },
  OTHER: { label: 'Autre' },
};

function complaintMeta(category: string) {
  return COMPLAINT_LABELS[category] ?? COMPLAINT_LABELS.OTHER;
}

/** v5.2 — initiales pour l'avatar monogramme (2 lettres max). */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** v4.69 — aperçu de la dernière ligne de la liste de conversations. */
function previewOf(m: VoiceItem): string {
  if (m.senderType === 'host') return 'Réponse vocale envoyée';
  return m.durationSec > 0 ? `Message vocal · ${m.durationSec} s` : 'Message vocal';
}

/** v4.69 — waveform simulée, déterministe par message (hash du id). */
function waveformFor(id: string): number[] {
  let h = 7;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) % 997;
  return Array.from({ length: 22 }, (_, i) => {
    h = (h * 33 + i * 7 + 13) % 997;
    return 4 + (h % 13);
  });
}

export function MessagesContent() {
  const { selectedId, selectedProperty, propertiesLoading } = useHostContext();
  // Synchronise le badge du bouton Messages (header + sidebar) dès qu'une
  // action est effectuée sur cette page.
  const refreshCounts = useRefreshMessageCounts();
  const [voice, setVoice] = useState<VoiceItem[] | null>(null);
  const [complaints, setComplaints] = useState<ComplaintItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  // WP-BACK v4.61 — vocal en cours de suppression (spinner sur la poubelle).
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── v4.69 — état de la messagerie moderne ──
  const [tab, setTab] = useState<MessagesTab>('voice');
  const [search, setSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showReply, setShowReply] = useState(false);

  // ── v4.53 « FICHE ASSURANCE EN 1 CLIC » — modal d'estimation des
  //    dégâts puis PDF pré-rempli (casse invité). ──
  const [insuranceComplaint, setInsuranceComplaint] = useState<ComplaintItem | null>(null);
  const [insuranceItems, setInsuranceItems] = useState('');
  const [insuranceEstimate, setInsuranceEstimate] = useState('');
  const [insuranceComment, setInsuranceComment] = useState('');
  const [insuranceBusy, setInsuranceBusy] = useState(false);

  const openInsuranceDialog = useCallback((c: ComplaintItem) => {
    setInsuranceComplaint(c);
    // Pré-remplissage : l'objet endommagé est déduit de la description
    // (après l'emoji / préfixe), l'estimation reste à la main de l'hôte.
    const cleaned = c.description.replace(/^[^a-zA-Zà-üÀ-Ü]+/, '').trim();
    setInsuranceItems(cleaned.slice(0, 120));
    setInsuranceEstimate('');
    setInsuranceComment('');
  }, []);

  const generateInsurance = useCallback(async () => {
    const c = insuranceComplaint;
    if (!c) return;
    const estimate = Number(insuranceEstimate.trim().replace(',', '.'));
    if (!Number.isFinite(estimate) || estimate < 0 || estimate > 100_000) {
      toast.error('Indiquez une estimation des dégâts valide (ex. 89,99).');
      return;
    }
    setInsuranceBusy(true);
    try {
      await downloadInsurancePdf({
        propertyName: c.propertyName ?? 'Logement',
        propertyAddress: null,
        guestName: c.guestName,
        reportedAtLabel: new Date(c.createdAt).toLocaleString('fr-FR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        categoryLabel: complaintMeta(c.category).label,
        description: c.description,
        photos: c.photos,
        damagedItems: insuranceItems.trim(),
        damageEstimate: estimate,
        hostComment: insuranceComment.trim(),
        statusLabel: c.status === 'RESOLVED' ? 'Résolu' : 'Ouvert',
      });
      toast.success('Fiche assurance générée — prête à joindre à votre réclamation');
      setInsuranceComplaint(null);
    } catch {
      toast.error('Génération du PDF impossible. Réessayez.');
    } finally {
      setInsuranceBusy(false);
    }
  }, [insuranceComplaint, insuranceEstimate, insuranceItems, insuranceComment]);

  const scopeLabel =
    selectedId === 'all' ? 'Toutes les propriétés' : selectedProperty?.name ?? '';

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (mode === 'refresh') setRefreshing(true);
      try {
        const res = await fetch(
          `/api/airbnb/messages?propertyId=${encodeURIComponent(selectedId)}`,
          { cache: 'no-store' },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as {
          voice: VoiceItem[];
          complaints: ComplaintItem[];
        };
        setVoice(data.voice ?? []);
        setComplaints(data.complaints ?? []);
      } catch {
        if (mode === 'initial') {
          setVoice([]);
        }
        toast.error('Impossible de charger les messages. Réessayez.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedId],
  );

  // Chargement à l'ouverture + à chaque changement de propriété + polling 45 s.
  useEffect(() => {
    setLoading(true);
    void load('initial');
  }, [load]);
  useEffect(() => {
    const poll = setInterval(() => void load('refresh'), 45_000);
    return () => clearInterval(poll);
  }, [load]);

  const voiceUnread = useMemo(() => (voice ?? []).filter((v) => !v.isRead).length, [voice]);
  const complaintsOpen = useMemo(
    () => (complaints ?? []).filter((c) => c.status === 'OPEN').length,
    [complaints],
  );

  // Marquer un vocal comme lu (à la lecture) — optimiste.
  const markVoiceRead = useCallback(async (id: string) => {
    setVoice((prev) => (prev ?? []).map((v) => (v.id === id ? { ...v, isRead: true } : v)));
    try {
      await fetch('/api/airbnb/messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'voice', id, action: 'read' }),
      });
    } catch {
      // silencieux — l'état optimiste reste, re-synchronisé au prochain poll
    }
  }, []);

  // v4.69 — lecture d'une bulle : marque « lu » (une seule fois) + badge.
  const handleBubblePlay = useCallback(
    (m: VoiceItem) => {
      if (!m.isRead) {
        void markVoiceRead(m.id);
        refreshCounts();
      }
    },
    [markVoiceRead, refreshCounts],
  );

  // ── WP-BACK v4.61 — Suppression définitive d'un vocal (invité OU
  //    réponse hôte) : confirmation → DELETE → retrait optimiste. ──
  const deleteVoice = useCallback(async (id: string) => {
    if (!window.confirm('Supprimer définitivement ce message vocal ?')) return;
    setDeletingId(id);
    const previous = voice;
    setVoice((prev) => (prev ?? []).filter((v) => v.id !== id));
    try {
      const res = await fetch(`/api/airbnb/messages?type=voice&id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      toast.success('Message vocal supprimé');
      refreshCounts();
    } catch {
      // Rollback optimiste : la carte réapparaît, re-sync au prochain poll.
      setVoice(previous);
      toast.error('Impossible de supprimer le message vocal. Réessayez.');
    } finally {
      setDeletingId(null);
    }
  }, [voice, refreshCounts]);

  // v4.32 — demande client : « le bouton de notification rouge reste rouge
  // même si la notification est lue ». Ouvrir l'onglet Signalements = tout
  // est considéré vu : le badge rouge s'éteint (les réclamations restent
  // ouvertes jusqu'à résolution, sans allumer le badge).
  const markAllComplaintsSeen = useCallback(async () => {
    setComplaints((prev) => (prev ?? []).map((c) => (c.isRead ? c : { ...c, isRead: true })));
    try {
      await fetch('/api/airbnb/messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'complaint', action: 'read-all' }),
      });
      refreshCounts();
    } catch {
      // silencieux — re-synchronisé au prochain poll
    }
  }, [refreshCounts]);

  // Résoudre un signalement — optimiste + rollback si échec.
  const resolveComplaint = useCallback(async (id: string) => {
    setResolvingId(id);
    const previous = complaints;
    setComplaints((prev) =>
      (prev ?? []).map((c) => (c.id === id ? { ...c, status: 'RESOLVED' } : c)),
    );
    try {
      const res = await fetch('/api/airbnb/messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'complaint', id, action: 'resolve' }),
      });
      if (!res.ok) throw new Error();
      toast.success('Signalement marqué comme résolu');
      refreshCounts();
    } catch {
      setComplaints(previous);
      toast.error('Impossible de résoudre le signalement. Réessayez.');
    } finally {
      setResolvingId(null);
    }
  }, [complaints]);

  // ── v4.69 — conversations groupées par `${senderName}|${propertyId}`,
  //    les plus récentes d'abord ; messages triés du plus ancien au + récent. ──
  const conversations = useMemo(() => {
    const map = new Map<string, Conversation>();
    for (const m of voice ?? []) {
      const key = `${m.senderName}|${m.propertyId}`;
      let c = map.get(key);
      if (!c) {
        c = {
          key,
          senderName: m.senderName,
          propertyId: m.propertyId,
          propertyName: m.propertyName,
          messages: [],
          lastAt: 0,
          unread: 0,
          totalDurationSec: 0,
        };
        map.set(key, c);
      }
      c.messages.push(m);
      c.lastAt = Math.max(c.lastAt, new Date(m.createdAt).getTime());
      // Pastille non-lus = isRead=false (même sémantique que le badge serveur).
      if (!m.isRead) c.unread += 1;
      c.totalDurationSec += m.durationSec ?? 0;
    }
    const list = Array.from(map.values());
    for (const c of list) {
      c.messages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }
    list.sort((a, b) => b.lastAt - a.lastAt);
    return list;
  }, [voice]);

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        c.senderName.toLowerCase().includes(q) ||
        (c.propertyName ?? '').toLowerCase().includes(q),
    );
  }, [conversations, search]);

  const filteredComplaints = useMemo(() => {
    const list = complaints ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) =>
      [
        c.guestName ?? '',
        c.propertyName ?? '',
        complaintMeta(c.category).label,
        c.description,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [complaints, search]);

  const selectedConversation = useMemo(
    () => filteredConversations.find((c) => c.key === selectedKey) ?? null,
    [filteredConversations, selectedKey],
  );

  const openConversation = useCallback((key: string) => {
    setSelectedKey(key);
    setShowReply(false);
  }, []);

  const switchTab = useCallback(
    (t: MessagesTab) => {
      setTab(t);
      if (t === 'complaints') void markAllComplaintsSeen();
    },
    [markAllComplaintsSeen],
  );

  const handleReplySent = useCallback(() => {
    setShowReply(false);
    void load('refresh');
  }, [load]);

  if (loading && voice === null) {
    return (
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="lux-card flex w-full shrink-0 flex-col gap-3 p-3 lg:w-80">
          <Skeleton className="h-10 w-full rounded-full bg-white/8" aria-hidden="true" />
          <Skeleton className="h-11 w-full rounded-full bg-white/8" aria-hidden="true" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl bg-white/8" aria-hidden="true" />
          ))}
        </div>
        <div className="lux-card hidden min-w-0 flex-1 flex-col gap-3 p-4 lg:flex">
          <Skeleton className="h-14 w-full rounded-xl bg-white/8" aria-hidden="true" />
          <Skeleton className="h-20 w-2/3 rounded-2xl bg-white/8" aria-hidden="true" />
          <Skeleton className="h-20 w-1/2 rounded-2xl bg-white/8" aria-hidden="true" />
        </div>
      </div>
    );
  }

  const lastGuestMessage = selectedConversation
    ? [...selectedConversation.messages].reverse().find((m) => m.senderType !== 'host') ?? null
    : null;
  const replyTargetId =
    lastGuestMessage?.id ??
    (selectedConversation && selectedConversation.messages.length > 0
      ? selectedConversation.messages[selectedConversation.messages.length - 1].id
      : undefined);

  return (
    <div className="flex flex-col gap-4">
      {/* ----- En-tête ----- */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <p className="lux-eyebrow">Espace hôte</p>
          <h1 className="lux-display mt-1.5 text-2xl font-semibold text-white">Messagerie</h1>
          <p className="mt-1 text-sm text-[#8fa0c2]">
            Vocaux et signalements — {propertiesLoading ? 'chargement…' : scopeLabel}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load('refresh')}
          disabled={refreshing}
          className="lux-btn-ghost gap-2 self-start sm:self-auto"
          aria-label="Rafraîchir les messages"
        >
          {refreshing && (
            <span
              className="lux-dot animate-pulse"
              style={{ backgroundColor: '#a9c4ff' }}
              aria-hidden="true"
            />
          )}
          Rafraîchir
        </button>
      </motion.div>

      {/* ----- Zone maître-détail ----- */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
        {/* ── Colonne GAUCHE : recherche + onglets + conversations ── */}
        {tab === 'voice' && (
          <aside
            aria-label="Liste des conversations"
            className={cn(
              'lux-card w-full shrink-0 flex-col gap-3 p-3 lg:h-[calc(100dvh-210px)] lg:w-80',
              selectedKey ? 'hidden lg:flex' : 'flex',
            )}
          >
            {/* Recherche par nom */}
            <div className="relative">
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un nom…"
                className="h-10 rounded-full border-white/12 bg-white/[0.04] pl-4 text-sm text-white placeholder:text-[#8fa0c2]/60 focus-visible:ring-[#5c8af0]/50"
                aria-label="Rechercher une conversation par nom"
              />
            </div>

            {/* Segmented control Vocaux / Signalements */}
            <SegmentedTabs
              tab={tab}
              onChange={switchTab}
              voiceUnread={voiceUnread}
              complaintsOpen={complaintsOpen}
            />

            {/* Liste des conversations */}
            <div className="scrollbar-thin-light -mx-1 max-h-[46dvh] min-h-0 flex-1 overflow-y-auto px-1 lg:max-h-none">
              {conversations.length === 0 ? (
                <div className="lux-empty flex flex-col items-center rounded-2xl p-6 text-center">
                  <h3 className="lux-display text-base font-semibold text-white">Aucun message vocal</h3>
                  <p className="mt-1.5 max-w-[240px] text-xs text-[#8fa0c2]">
                    Les messages vocaux laissés par vos invités (bouton « Contacter l&apos;hôte »
                    de la plaque QR) apparaîtront ici.
                  </p>
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="lux-empty flex flex-col items-center rounded-2xl p-6 text-center">
                  <p className="mt-2 text-xs text-[#8fa0c2]">
                    Aucune conversation pour « {search.trim()} ».
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {filteredConversations.map((c) => {
                    const last = c.messages[c.messages.length - 1];
                    const active = selectedKey === c.key;
                    return (
                      <li key={c.key}>
                        <button
                          type="button"
                          onClick={() => openConversation(c.key)}
                          aria-current={active || undefined}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5c8af0]/50',
                            active
                              ? 'border-[#5c8af0]/40 bg-[#5c8af0]/10'
                              : 'border-transparent hover:bg-white/[0.04]',
                          )}
                        >
                          <span className="relative shrink-0">
                            <Avatar name={c.senderName} className="h-10 w-10 text-xs" />
                            {c.unread > 0 && (
                              <span
                                aria-label={`${c.unread} message${c.unread > 1 ? 's' : ''} non lu${c.unread > 1 ? 's' : ''}`}
                                className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-[#0b1226] bg-[#5c8af0] px-1 text-[9px] font-bold text-white"
                              >
                                {c.unread > 9 ? '9+' : c.unread}
                              </span>
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2">
                              <span
                                className={cn(
                                  'truncate text-sm text-white',
                                  c.unread > 0 ? 'font-bold' : 'font-semibold',
                                )}
                              >
                                {c.senderName}
                              </span>
                              <span className="shrink-0 text-[10px] tabular-nums text-[#8fa0c2]/70">
                                {relativeFrTime(new Date(c.lastAt).toISOString())}
                              </span>
                            </span>
                            <span className="mt-0.5 flex items-center justify-between gap-2">
                              <span
                                className={cn(
                                  'truncate text-xs',
                                  c.unread > 0 ? 'font-semibold text-[#a9c4ff]' : 'text-[#8fa0c2]',
                                )}
                              >
                                {previewOf(last)}
                              </span>
                            </span>
                            {c.propertyName && (
                              <span className="mt-0.5 block truncate text-[10px] font-medium text-[#8fa0c2]/70">
                                {c.propertyName}
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>
        )}

        {/* ── Colonne DROITE (mode Vocaux) : fil de discussion ── */}
        {tab === 'voice' && (
          <section
            aria-label="Fil de discussion"
            className={cn(
              'lux-card min-h-[420px] min-w-0 flex-1 flex-col overflow-hidden max-h-[78dvh] lg:h-[calc(100dvh-210px)] lg:max-h-none',
              selectedKey ? 'flex' : 'hidden lg:flex',
            )}
          >
            {selectedConversation ? (
              <div key={selectedConversation.key} className="flex min-h-0 flex-1 flex-col">
                {/* En-tête du thread */}
                <div className="flex items-center gap-3 border-b border-white/10 p-3 sm:px-4">
                  <button
                    type="button"
                    onClick={() => setSelectedKey(null)}
                    aria-label="Retour à la liste des conversations"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/12 text-white/80 transition-colors hover:bg-white/8 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5c8af0]/50 lg:hidden"
                  >
                    <span aria-hidden="true">←</span>
                  </button>
                  <Avatar name={selectedConversation.senderName} className="h-10 w-10 text-xs" />
                  <div className="min-w-0 flex-1">
                    <p className="lux-display truncate text-base font-semibold text-white">
                      {selectedConversation.senderName}
                    </p>
                    <p className="truncate text-[11px] text-[#8fa0c2]">
                      {selectedConversation.propertyName ?? 'Bien'} ·{' '}
                      {selectedConversation.messages.length} message
                      {selectedConversation.messages.length > 1 ? 's' : ''} ·{' '}
                      {selectedConversation.totalDurationSec} s de vocal
                    </p>
                  </div>
                  {selectedConversation.unread > 0 && (
                    <span className="lux-chip shrink-0">
                      <span className="lux-dot" style={{ backgroundColor: '#5c8af0' }} aria-hidden="true" />
                      {selectedConversation.unread} non lu
                      {selectedConversation.unread > 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                {/* Fil de bulles */}
                <div className="lux-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3 sm:p-4">
                  {selectedConversation.messages.map((m) => (
                    <VoiceBubble
                      key={m.id}
                      m={m}
                      onFirstPlay={handleBubblePlay}
                      onDelete={(id) => void deleteVoice(id)}
                      deleting={deletingId === m.id}
                    />
                  ))}
                </div>

                {/* Pied de thread : réponse vocale */}
                <div className="border-t border-white/10 p-3">
                  {showReply ? (
                    <div className="flex flex-col gap-2">
                      <VoiceReplyButton
                        voiceMessageId={replyTargetId}
                        onSent={handleReplySent}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 self-center rounded-full text-[#8fa0c2] hover:bg-white/8 hover:text-white"
                        onClick={() => setShowReply(false)}
                        aria-label="Annuler la réponse vocale"
                      >
                        Annuler
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowReply(true)}
                      aria-label="Répondre par message vocal"
                      className="flex w-full items-center justify-between gap-3 rounded-full border border-white/12 bg-white/[0.04] py-1.5 pl-4 pr-1.5 text-left transition-colors hover:border-[#5c8af0]/40 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5c8af0]/50"
                    >
                      <span className="text-sm text-[#8fa0c2]">Répondre par vocal…</span>
                      <span
                        aria-hidden="true"
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#3d6fe0] to-[#24479c] text-sm text-white shadow"
                      >
                        →
                      </span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="lux-empty flex flex-1 flex-col items-center justify-center rounded-2xl p-8 text-center">
                <h3 className="lux-display text-lg font-semibold text-white">
                  Sélectionnez une conversation
                </h3>
                <p className="mt-1.5 max-w-xs text-xs text-[#8fa0c2]">
                  Choisissez un échange dans la liste de gauche pour écouter les vocaux et
                  répondre.
                </p>
              </div>
            )}
          </section>
        )}

        {/* ── Colonne DROITE (mode Signalements) : cartes réclamations ── */}
        {tab === 'complaints' && (
          <section aria-label="Signalements de problème" className="flex min-w-0 flex-1 flex-col gap-3">
            {/* Barre d'outils compacte (le panneau gauche est masqué dans ce mode) */}
            <div className="lux-card flex flex-col gap-2.5 p-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher un signalement…"
                  className="h-10 rounded-full border-white/12 bg-white/[0.04] pl-4 text-sm text-white placeholder:text-[#8fa0c2]/60 focus-visible:ring-[#5c8af0]/50"
                  aria-label="Rechercher un signalement"
                />
              </div>
              <SegmentedTabs
                tab={tab}
                onChange={switchTab}
                voiceUnread={voiceUnread}
                complaintsOpen={complaintsOpen}
              />
            </div>

            <div className="lux-scroll flex max-h-[70dvh] flex-col gap-3 overflow-y-auto pr-1 lg:max-h-[calc(100dvh-230px)]">
              {(complaints ?? []).length === 0 ? (
                <div className="lux-empty flex flex-col items-center rounded-2xl p-8 text-center">
                  <h3 className="lux-display text-lg font-semibold text-white">Aucun signalement</h3>
                  <p className="mt-1.5 max-w-sm text-xs text-[#8fa0c2]">
                    Les problèmes signalés par vos invités (bouton « Signaler un problème »
                    de la plaque QR) arriveront ici, connectés au bouton Messages.
                  </p>
                </div>
              ) : filteredComplaints.length === 0 ? (
                <div className="lux-empty flex flex-col items-center rounded-2xl p-8 text-center">
                  <p className="mt-2 text-xs text-[#8fa0c2]">
                    Aucun signalement pour « {search.trim()} ».
                  </p>
                </div>
              ) : (
                filteredComplaints.map((c) => {
                  const meta = complaintMeta(c.category);
                  const isOpen = c.status === 'OPEN';
                  return (
                    <Card
                      key={c.id}
                      className={cn(
                        'lux-card rounded-2xl',
                        isOpen
                          ? c.isUrgent
                            ? 'border-[#f07d6a]/35 bg-[#f07d6a]/[0.06]'
                            : ''
                          : 'opacity-70',
                      )}
                    >
                      <CardContent className="space-y-2.5 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-white">
                              <span
                                className="lux-dot shrink-0"
                                style={{
                                  backgroundColor: isOpen && c.isUrgent ? '#f07d6a' : isOpen ? '#fbbf24' : '#8fa0c2',
                                }}
                                aria-hidden="true"
                              />
                              {meta.label}
                              {/* v4.32 — point or tant que la notification n'a pas été vue. */}
                              {isOpen && c.isRead === false && (
                                <span
                                  aria-label="Non lue"
                                  className="h-2 w-2 shrink-0 rounded-full bg-[#e9c47c]"
                                />
                              )}
                              {c.isUrgent && isOpen && (
                                <span className="inline-flex items-center rounded-full border border-[#f07d6a]/35 bg-[#f07d6a]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#f07d6a]">
                                  Urgent
                                </span>
                              )}
                              {!isOpen && (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#34d399]/30 bg-[#34d399]/10 px-2 py-0.5 text-[10px] font-bold text-[#86e9cb]">
                                  <span aria-hidden="true">✓</span> Résolu
                                </span>
                              )}
                            </p>
                            <p className="mt-0.5 text-[11px] text-[#8fa0c2]">
                              {relativeFrTime(c.createdAt)}
                              {c.propertyName ? ` · ${c.propertyName}` : ''}
                              {c.guestName ? ` · ${c.guestName}` : ''}
                            </p>
                          </div>
                        </div>

                        <p className="whitespace-pre-wrap break-words text-sm text-white/90">
                          {c.description}
                        </p>

                        {c.photos.length > 0 && (
                          <div className="flex flex-wrap items-center gap-2">
                            {c.photos.map((p, i) => (
                              <a key={i} href={p} target="_blank" rel="noopener noreferrer">
                                {/* Photos stockées en data-URL (≤ 500 Ko) par l'API Hub */}
                                <img
                                  src={p}
                                  alt={`Photo du signalement ${i + 1}`}
                                  className="h-16 w-16 rounded-xl border border-white/10 object-cover transition-opacity hover:opacity-90"
                                  loading="lazy"
                                  decoding="async"
                                />
                              </a>
                            ))}
                          </div>
                        )}

                        {isOpen && (
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={resolvingId === c.id}
                              onClick={() => void resolveComplaint(c.id)}
                              className="h-8 rounded-full border-white/12 bg-transparent font-semibold text-[#a9c4ff] hover:bg-white/[0.06] hover:text-white"
                            >
                              {resolvingId === c.id ? (
                                <span
                                  className="lux-dot animate-pulse"
                                  style={{ backgroundColor: '#a9c4ff' }}
                                  aria-hidden="true"
                                />
                              ) : (
                                <span aria-hidden="true">✓</span>
                              )}
                              Marquer résolu
                            </Button>
                            {/* v4.53 « FICHE ASSURANCE EN 1 CLIC » — estimation
                                des dégâts + rapport PDF pré-rempli (caution
                                Airbnb / assurance habitation). */}
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => openInsuranceDialog(c)}
                              className="h-8 rounded-full border-white/12 bg-transparent font-semibold text-[#8fa0c2] hover:bg-white/[0.06] hover:text-white"
                              aria-label="Générer la fiche assurance PDF"
                            >
                              Fiche assurance
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </section>
        )}
      </div>

      {/* ── v4.53 « FICHE ASSURANCE EN 1 CLIC » — estimation des dégâts
          puis rapport PDF pré-rempli (photos + description + montant). ── */}
      <Dialog open={!!insuranceComplaint} onOpenChange={(o) => !o && setInsuranceComplaint(null)}>
        <DialogContent className="max-w-lg rounded-2xl border-white/10 bg-[#0b1226] text-white">
          <DialogHeader>
            <DialogTitle className="lux-display text-xl font-semibold text-white">
              Fiche assurance / dépôt de garantie
            </DialogTitle>
            <DialogDescription className="text-[#8fa0c2]">
              Le rapport PDF est pré-rempli avec le signalement, les photos et le logement.
              Complétez l&apos;estimation des dégâts — le document est prêt pour Airbnb ou votre
              assurance habitation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-xs text-[#8fa0c2]">
              <p className="font-semibold text-white">
                {insuranceComplaint ? complaintMeta(insuranceComplaint.category).label : ''}
                {insuranceComplaint?.guestName ? ` — ${insuranceComplaint.guestName}` : ''}
              </p>
              <p className="mt-0.5">
                {insuranceComplaint
                  ? new Date(insuranceComplaint.createdAt).toLocaleString('fr-FR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : ''}
                {insuranceComplaint?.propertyName ? ` · ${insuranceComplaint.propertyName}` : ''}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="insurance-items" className="text-xs font-semibold text-[#8fa0c2]">
                Objet(s) endommagé(s)
              </Label>
              <Input
                id="insurance-items"
                value={insuranceItems}
                onChange={(e) => setInsuranceItems(e.target.value)}
                maxLength={120}
                placeholder="Ex. : machine à café Delonghi, verre à pied…"
                className="rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fa0c2]/60 focus-visible:ring-[#5c8af0]/50"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="insurance-estimate" className="text-xs font-semibold text-[#8fa0c2]">
                Estimation des dégâts (€)
              </Label>
              <Input
                id="insurance-estimate"
                inputMode="decimal"
                value={insuranceEstimate}
                onChange={(e) => setInsuranceEstimate(e.target.value)}
                maxLength={10}
                placeholder="89,99"
                className="rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fa0c2]/60 focus-visible:ring-[#5c8af0]/50"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="insurance-comment" className="text-xs font-semibold text-[#8fa0c2]">
                Commentaire (optionnel)
              </Label>
              <Textarea
                id="insurance-comment"
                value={insuranceComment}
                onChange={(e) => setInsuranceComment(e.target.value)}
                maxLength={600}
                rows={3}
                placeholder="Contexte, échanges avec l'invité, remplacement prévu…"
                className="rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fa0c2]/60 focus-visible:ring-[#5c8af0]/50"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-full border-white/12 bg-transparent text-[#8fa0c2] hover:bg-white/[0.06] hover:text-white"
              onClick={() => setInsuranceComplaint(null)}
            >
              Annuler
            </Button>
            <Button
              type="button"
              onClick={() => void generateInsurance()}
              disabled={insuranceBusy}
              className="lux-btn rounded-full font-semibold"
            >
              {insuranceBusy && (
                <span
                  className="lux-dot animate-pulse"
                  style={{ backgroundColor: '#a9c4ff' }}
                  aria-hidden="true"
                />
              )}
              Générer le PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =============================================================
// Helpers de rendu (v4.69 — messagerie moderne)
// =============================================================

/** Monogramme d'initiales (thème saphir — v5.2, sans dégradé criard). */
function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-[#3d6fe0]/15 font-bold text-[#a9c4ff] ring-1 ring-[#5c8af0]/25',
        className ?? 'h-9 w-9 text-xs',
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

/** Segmented control Vocaux / Signalements (avec pastilles). */
function SegmentedTabs({
  tab,
  onChange,
  voiceUnread,
  complaintsOpen,
}: {
  tab: MessagesTab;
  onChange: (t: MessagesTab) => void;
  voiceUnread: number;
  complaintsOpen: number;
}) {
  const base =
    'flex h-8 items-center justify-center gap-1.5 rounded-full px-3 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5c8af0]/50';
  return (
    <div className="grid grid-cols-2 gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1" role="tablist" aria-label="Filtrer les messages">
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'voice'}
        onClick={() => onChange('voice')}
        className={cn(base, tab === 'voice' ? 'bg-white/10 text-white' : 'text-[#8fa0c2] hover:text-white')}
      >
        Vocaux
        {voiceUnread > 0 && (
          <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#5c8af0] px-1 text-[10px] font-bold text-white">
            {voiceUnread > 9 ? '9+' : voiceUnread}
          </span>
        )}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'complaints'}
        onClick={() => onChange('complaints')}
        className={cn(base, tab === 'complaints' ? 'bg-white/10 text-white' : 'text-[#8fa0c2] hover:text-white')}
      >
        Signalements
        {complaintsOpen > 0 && (
          <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#f07d6a] px-1 text-[10px] font-bold text-white">
            {complaintsOpen > 9 ? '9+' : complaintsOpen}
          </span>
        )}
      </button>
    </div>
  );
}

/** Bulle vocale : lecteur custom (play/pause + waveform simulée),
 *  suppression (×, confirm + DELETE + rollback côté parent). */
function VoiceBubble({
  m,
  onFirstPlay,
  onDelete,
  deleting,
}: {
  m: VoiceItem;
  onFirstPlay: (m: VoiceItem) => void;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const bars = useMemo(() => waveformFor(m.id), [m.id]);
  const isHost = m.senderType === 'host';

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      return;
    }
    void el.play().catch(() => toast.error('Lecture de ce vocal impossible.'));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={cn('flex flex-col gap-0.5', isHost ? 'items-end' : 'items-start')}
    >
      <div className={cn('flex max-w-[88%] items-center gap-1.5 sm:max-w-[75%]', isHost && 'flex-row-reverse')}>
        <Avatar name={m.senderName} className="h-7 w-7 text-[9px]" />
        <div
          className={cn(
            'flex items-center gap-2 rounded-2xl px-2.5 py-2',
            isHost
              ? 'rounded-tr-md border border-[#5c8af0]/30 bg-[#5c8af0]/12'
              : 'rounded-tl-md border border-white/10 bg-white/[0.05]',
          )}
        >
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? `Mettre en pause le message de ${m.senderName}` : `Écouter le message de ${m.senderName}`}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3d6fe0] to-[#24479c] text-white shadow transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5c8af0]/50"
          >
            {playing ? (
              <Pause className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Play className="ml-0.5 h-4 w-4" aria-hidden="true" />
            )}
          </button>
          <span className="flex h-7 items-center gap-[2.5px]" aria-hidden="true">
            {bars.map((h, i) => (
              <span
                key={i}
                style={{ height: `${h}px` }}
                className={cn(
                  'w-[3px] rounded-full transition-colors',
                  playing ? 'bg-[#5c8af0]' : 'bg-[#8fa0c2]/40',
                )}
              />
            ))}
          </span>
          {m.durationSec > 0 && (
            <span className="shrink-0 text-[11px] font-bold tabular-nums text-[#8fa0c2]">
              {m.durationSec} s
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => onDelete(m.id)}
          disabled={deleting}
          aria-label="Supprimer ce message vocal"
          title="Supprimer ce message vocal"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#f07d6a] transition-colors hover:bg-[#f07d6a]/10 hover:text-[#ffab92] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f07d6a]/50 disabled:opacity-50"
        >
          {deleting ? (
            <span
              className="lux-dot animate-pulse"
              style={{ backgroundColor: '#f07d6a' }}
              aria-hidden="true"
            />
          ) : (
            <span aria-hidden="true" className="text-base leading-none">
              ×
            </span>
          )}
        </button>
      </div>
      <p className={cn('px-1 text-[10px] text-[#8fa0c2]/70', isHost && 'text-right')}>
        {relativeFrTime(m.createdAt)}
        {m.fileSizeKb > 0 ? ` · ${m.fileSizeKb} Ko` : ''}
      </p>
      {/* Élément audio piloté par le bouton custom — onPlay déclenche le
          marquage « lu » (logique conservée de la liste à plat). */}
      <audio
        ref={audioRef}
        src={voicePlaybackSrc(m.audioData, m.audioUrl)}
        preload="metadata"
        className="hidden"
        onPlay={() => {
          setPlaying(true);
          onFirstPlay(m);
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => toast.error('Lecture de ce vocal impossible.')}
      />
    </motion.div>
  );
}
