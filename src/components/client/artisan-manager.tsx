'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  Briefcase,
  Plus,
  Star,
  Search,
  MapPin,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  MessageCircle,
  Send,
  ShieldCheck,
  Zap,
  Loader2,
  FileText,
  ChevronRight,
  Eye,
  HeartHandshake,
  UserCheck,
  MessageSquare,
  Ban,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { CATEGORIES } from '@/types/database';
import type {
  ServiceRequestStatus,
  UrgencyLevel,
  ChatSenderType,
} from '@/types/database';

// ── Types ──────────────────────────────────────────────────────
interface ProfessionalData {
  id: string;
  userId: string;
  businessName: string;
  category: string;
  subcategory: string | null;
  description: string | null;
  location: string | null;
  serviceRadiusKm: number;
  hourlyRate: number | null;
  isUrgentAvailable: boolean;
  isVerified: boolean;
  ratingAvg: number;
  totalReviews: number;
  responseTimeMinutes: number | null;
  totalJobsCompleted: number;
  isActive: boolean;
  services: ServiceData[];
}

interface ServiceData {
  id: string;
  professionalId: string;
  name: string;
  description: string | null;
  basePrice: number;
  priceUnit: string;
  durationMinutes: number | null;
  isUrgent: boolean;
  isActive: boolean;
}

interface ServiceRequestData {
  id: string;
  homeId: string;
  professionalId: string;
  serviceId: string | null;
  status: ServiceRequestStatus;
  description: string | null;
  preferredDate: string | null;
  urgencyLevel: UrgencyLevel;
  address: string | null;
  finalPrice: number | null;
  createdAt: string;
  professional: { id: string; businessName: string };
  service: { id: string; name: string } | null;
  review?: ReviewData;
  chatMessages?: ChatMessageData[];
}

interface ReviewData {
  id: string;
  serviceRequestId: string;
  professionalId: string;
  userId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  serviceRequest?: { id: string; status: string };
  professional?: { id: string; businessName: string };
}

interface ChatMessageData {
  id: string;
  serviceRequestId: string;
  senderId: string;
  senderType: ChatSenderType;
  content: string;
  messageType: string;
  isRead: boolean;
  createdAt: string;
}

// ── Constants ──────────────────────────────────────────────────
const CATEGORY_OPTIONS = CATEGORIES.slice(0, 20);

const STATUS_CONFIG: Record<ServiceRequestStatus, { label: string; className: string }> = {
  pending: { label: 'En attente', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 border-0' },
  accepted: { label: 'Accepté', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-0' },
  in_progress: { label: 'En cours', className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border-0' },
  completed: { label: 'Terminé', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-0' },
  cancelled: { label: 'Annulé', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-0' },
  disputed: { label: 'Litige', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-0' },
};

const URGENCY_CONFIG: Record<UrgencyLevel, { label: string; className: string }> = {
  normal: { label: 'Normal', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-0' },
  urgent: { label: 'Urgent', className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 border-0' },
  emergency: { label: 'Urgence', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-0' },
};

type TabType = 'annuaire' | 'demandes' | 'avis' | 'chat';

const userId = 'dev-user-1';

// ── Component ──────────────────────────────────────────────────
export function ArtisanManager() {
  // Data state
  const [homeId, setHomeId] = useState<string | null>(null);
  const [professionals, setProfessionals] = useState<ProfessionalData[]>([]);
  const [serviceRequests, setServiceRequests] = useState<ServiceRequestData[]>([]);
  const [reviewsWritten, setReviewsWritten] = useState<ReviewData[]>([]);
  const [reviewsReceived, setReviewsReceived] = useState<ReviewData[]>([]);
  const [chatConversations, setChatConversations] = useState<ServiceRequestData[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);

  // UI state
  const [activeTab, setActiveTab] = useState<TabType>('annuaire');

  // Annuaire UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [selectedPro, setSelectedPro] = useState<ProfessionalData | null>(null);
  const [proDetailOpen, setProDetailOpen] = useState(false);

  // Demandes UI state
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequestData | null>(null);
  const [requestDetailOpen, setRequestDetailOpen] = useState(false);
  const [newRequestOpen, setNewRequestOpen] = useState(false);
  const [allProfessionals, setAllProfessionals] = useState<ProfessionalData[]>([]);

  // New request form
  const [reqFormProId, setReqFormProId] = useState('');
  const [reqFormServiceId, setReqFormServiceId] = useState('');
  const [reqFormDesc, setReqFormDesc] = useState('');
  const [reqFormDate, setReqFormDate] = useState('');
  const [reqFormUrgency, setReqFormUrgency] = useState<UrgencyLevel>('normal');
  const [reqFormAddress, setReqFormAddress] = useState('');
  const [reqSubmitting, setReqSubmitting] = useState(false);

  // Reviews UI state
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewFormRequestId, setReviewFormRequestId] = useState('');
  const [reviewFormProId, setReviewFormProId] = useState('');
  const [reviewFormRating, setReviewFormRating] = useState(0);
  const [reviewFormComment, setReviewFormComment] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  // Chat UI state
  const [chatDialogOpen, setChatDialogOpen] = useState(false);
  const [chatRequestId, setChatRequestId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessageData[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch data ──────────────────────────────────────────────
  const fetchHomeId = useCallback(async () => {
    try {
      const res = await fetch('/api/client/homes');
      const data = await res.json();
      const homes = data.homes || [];
      return homes[0]?.id || null;
    } catch {
      return null;
    }
  }, []);

  const fetchProfessionals = useCallback(async (home: string, category?: string) => {
    try {
      let url = `/api/client/professionals?homeId=${home}`;
      if (category && category !== 'all') url += `&category=${encodeURIComponent(category)}`;
      const res = await fetch(url);
      const data = await res.json();
      return (data.professionals || []) as ProfessionalData[];
    } catch {
      return [];
    }
  }, []);

  const fetchServiceRequests = useCallback(async (home: string) => {
    try {
      const res = await fetch(`/api/client/service-requests?homeId=${home}`);
      const data = await res.json();
      return (data.serviceRequests || []) as ServiceRequestData[];
    } catch {
      return [];
    }
  }, []);

  const fetchReviews = useCallback(async () => {
    try {
      const res = await fetch(`/api/client/reviews?userId=${userId}`);
      const data = await res.json();
      return {
        written: (data.written || []) as ReviewData[],
        received: (data.received || []) as ReviewData[],
      };
    } catch {
      return { written: [], received: [] };
    }
  }, []);

  const fetchChatMessages = useCallback(async (requestId: string) => {
    try {
      const res = await fetch(`/api/client/chat/${requestId}?markRead=true&readerId=${userId}`);
      const data = await res.json();
      return (data.messages || []) as ChatMessageData[];
    } catch {
      return [];
    }
  }, []);

  const fetchAllData = useCallback(async () => {
    try {
      const hid = await fetchHomeId();
      if (!hid) { setLoading(false); return; }
      setHomeId(hid);

      const [pros, requests, reviewData] = await Promise.all([
        fetchProfessionals(hid),
        fetchServiceRequests(hid),
        fetchReviews(),
      ]);

      setProfessionals(pros);
      setAllProfessionals(pros);
      setServiceRequests(requests);
      setReviewsWritten(reviewData.written);
      setReviewsReceived(reviewData.received);
    } catch {
      toast.error('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  }, [fetchHomeId, fetchProfessionals, fetchServiceRequests, fetchReviews]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const fetchTabData = useCallback(async (tab: TabType) => {
    if (!homeId) return;
    setTabLoading(true);
    try {
      if (tab === 'annuaire') {
        const data = await fetchProfessionals(homeId, categoryFilter);
        setProfessionals(data);
      } else if (tab === 'demandes') {
        const data = await fetchServiceRequests(homeId);
        setServiceRequests(data);
      } else if (tab === 'avis') {
        const data = await fetchReviews();
        setReviewsWritten(data.written);
        setReviewsReceived(data.received);
      } else if (tab === 'chat') {
        const data = await fetchServiceRequests(homeId);
        setChatConversations(data.filter((r) => (r.chatMessages?.length ?? 0) > 0));
      }
    } catch {
      toast.error('Erreur lors du chargement');
    } finally {
      setTabLoading(false);
    }
  }, [homeId, categoryFilter, fetchProfessionals, fetchServiceRequests, fetchReviews]);

  useEffect(() => {
    if (homeId) fetchTabData(activeTab);
  }, [activeTab, homeId, fetchTabData]);

  // ── Chat polling ────────────────────────────────────────────
  useEffect(() => {
    if (chatDialogOpen && chatRequestId) {
      fetchChatMessages(chatRequestId).then(setChatMessages);
      pollingRef.current = setInterval(() => {
        fetchChatMessages(chatRequestId).then(setChatMessages);
      }, 3000);
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [chatDialogOpen, chatRequestId, fetchChatMessages]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // ── Helpers ─────────────────────────────────────────────────
  const renderStars = (rating: number, size: 'sm' | 'md' = 'sm') => {
    const sz = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
    return (
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={`${sz} ${i < rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300 dark:text-gray-600'}`}
          />
        ))}
      </div>
    );
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const getSelectedProServices = (): ServiceData[] => {
    if (!reqFormProId) return [];
    const pro = allProfessionals.find((p) => p.id === reqFormProId);
    return pro?.services.filter((s) => s.isActive) || [];
  };

  // ── Demandes handlers ───────────────────────────────────────
  const handleCreateRequest = async () => {
    if (!homeId || !reqFormProId || !reqFormServiceId) return;
    setReqSubmitting(true);
    try {
      const res = await fetch('/api/client/service-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          homeId,
          professionalId: reqFormProId,
          serviceId: reqFormServiceId,
          description: reqFormDesc || undefined,
          preferredDate: reqFormDate || undefined,
          urgencyLevel: reqFormUrgency,
          address: reqFormAddress || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success('Demande de service envoyée');
      setNewRequestOpen(false);
      setReqFormProId(''); setReqFormServiceId(''); setReqFormDesc('');
      setReqFormDate(''); setReqFormUrgency('normal'); setReqFormAddress('');
      fetchTabData('demandes');
    } catch {
      toast.error("Erreur lors de l'envoi de la demande");
    } finally {
      setReqSubmitting(false);
    }
  };

  const handleCancelRequest = async (requestId: string) => {
    try {
      const res = await fetch(`/api/client/service-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      });
      if (!res.ok) throw new Error();
      toast.success('Demande annulée');
      setRequestDetailOpen(false);
      fetchTabData('demandes');
    } catch {
      toast.error("Erreur lors de l'annulation");
    }
  };

  // ── Review handlers ─────────────────────────────────────────
  const handleOpenReview = (requestId: string, proId: string) => {
    setReviewFormRequestId(requestId);
    setReviewFormProId(proId);
    setReviewFormRating(0);
    setReviewFormComment('');
    setReviewDialogOpen(true);
  };

  const handleSubmitReview = async () => {
    if (!reviewFormRating || !homeId) return;
    setReviewSubmitting(true);
    try {
      const res = await fetch('/api/client/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          serviceRequestId: reviewFormRequestId,
          professionalId: reviewFormProId,
          rating: reviewFormRating,
          comment: reviewFormComment || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success('Avis publié avec succès');
      setReviewDialogOpen(false);
      fetchTabData('avis');
      fetchTabData('demandes');
    } catch {
      toast.error('Erreur lors de la publication de l\'avis');
    } finally {
      setReviewSubmitting(false);
    }
  };

  // ── Chat handlers ───────────────────────────────────────────
  const handleOpenChat = async (requestId: string) => {
    setChatRequestId(requestId);
    setChatDialogOpen(true);
    setChatInput('');
  };

  const handleSendMessage = async () => {
    if (!chatRequestId || !chatInput.trim()) return;
    setChatSending(true);
    try {
      const res = await fetch(`/api/client/chat/${chatRequestId}?markRead=true&readerId=${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: userId,
          senderType: 'homeowner' as ChatSenderType,
          content: chatInput.trim(),
          messageType: 'text',
        }),
      });
      if (!res.ok) throw new Error();
      setChatInput('');
      const msgs = await fetchChatMessages(chatRequestId);
      setChatMessages(msgs);
    } catch {
      toast.error("Erreur lors de l'envoi du message");
    } finally {
      setChatSending(false);
    }
  };

  // ── Loading skeleton ────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-10 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!homeId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="rounded-2xl border-2 border-dashed border-muted-foreground/25 p-12 max-w-md">
          <Briefcase className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-lg font-semibold">Aucune maison</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Créez d'abord une maison pour accéder aux services artisans.
          </p>
        </div>
      </div>
    );
  }

  // ── Computed ────────────────────────────────────────────────
  const totalPros = allProfessionals.length;
  const activeRequests = serviceRequests.filter(
    (r) => r.status === 'pending' || r.status === 'accepted' || r.status === 'in_progress',
  ).length;
  const totalReviewsCount = reviewsWritten.length + reviewsReceived.length;

  const filteredProfessionals = professionals.filter(
    (p) =>
      !searchQuery ||
      p.businessName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.category.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Section 1 - Header + Stats */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600">
            <Briefcase className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Services Pros</h2>
            <p className="text-sm text-muted-foreground">
              Trouvez des artisans, gérez vos demandes et échangez
            </p>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 p-5 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-white/80">Artisans</p>
              <p className="text-3xl font-bold tabular-nums">{totalPros}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
              <Briefcase className="h-6 w-6" />
            </div>
          </div>
          <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
          <div className="absolute -right-2 -bottom-6 h-16 w-16 rounded-full bg-white/5" />
        </div>

        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-400 via-blue-500 to-indigo-600 p-5 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-white/80">Demandes actives</p>
              <p className="text-3xl font-bold tabular-nums">{activeRequests}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
              <Clock className="h-6 w-6" />
            </div>
          </div>
          <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
          <div className="absolute -right-2 -bottom-6 h-16 w-16 rounded-full bg-white/5" />
        </div>

        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-400 via-amber-500 to-orange-600 p-5 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-white/80">Avis</p>
              <p className="text-3xl font-bold tabular-nums">{totalReviewsCount}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
              <Star className="h-6 w-6" />
            </div>
          </div>
          <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
          <div className="absolute -right-2 -bottom-6 h-16 w-16 rounded-full bg-white/5" />
        </div>
      </div>

      {/* Section 2 - Tab buttons + Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {([
            { key: 'annuaire' as TabType, label: 'Annuaire', icon: Briefcase },
            { key: 'demandes' as TabType, label: 'Mes Demandes', icon: FileText },
            { key: 'avis' as TabType, label: 'Avis', icon: Star },
            { key: 'chat' as TabType, label: 'Chat', icon: MessageSquare },
          ]).map(({ key, label, icon: Icon }) => (
            <Button
              key={key}
              variant={activeTab === key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab(key)}
              className={
                activeTab === key
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-sm'
                  : ''
              }
            >
              <Icon className="h-3.5 w-3.5 mr-1.5" />
              {label}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* Tab-specific action buttons */}
          {activeTab === 'demandes' && (
            <Dialog open={newRequestOpen} onOpenChange={(open) => { setNewRequestOpen(open); }}>
              <DialogTrigger asChild>
                <Button className="gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-md">
                  <Plus className="h-4 w-4" />
                  Nouvelle demande
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-emerald-500" />
                    Nouvelle demande de service
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label>Professionnel *</Label>
                    <Select value={reqFormProId} onValueChange={(v) => { setReqFormProId(v); setReqFormServiceId(''); }}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Sélectionner un professionnel" /></SelectTrigger>
                      <SelectContent className="max-h-60">
                        {allProfessionals.filter((p) => p.isActive).map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.businessName} — {p.category}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Service *</Label>
                    <Select value={reqFormServiceId} onValueChange={setReqFormServiceId} disabled={!reqFormProId}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Sélectionner un service" /></SelectTrigger>
                      <SelectContent className="max-h-60">
                        {getSelectedProServices().map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name} — {s.basePrice.toFixed(2)} € {s.priceUnit === 'hour' ? '/h' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="req-desc">Description</Label>
                    <Textarea id="req-desc" placeholder="Décrivez votre besoin..." value={reqFormDesc} onChange={(e) => setReqFormDesc(e.target.value)} rows={3} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="req-date">Date souhaitée</Label>
                      <Input id="req-date" type="datetime-local" value={reqFormDate} onChange={(e) => setReqFormDate(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Urgence</Label>
                      <Select value={reqFormUrgency} onValueChange={(v) => setReqFormUrgency(v as UrgencyLevel)}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="urgent">Urgent</SelectItem>
                          <SelectItem value="emergency">Urgence</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="req-address">Adresse d'intervention</Label>
                    <Input id="req-address" placeholder="Ex: 12 rue de la Paix, 75002 Paris" value={reqFormAddress} onChange={(e) => setReqFormAddress(e.target.value)} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setNewRequestOpen(false)}>Annuler</Button>
                  <Button
                    onClick={handleCreateRequest}
                    disabled={!reqFormProId || !reqFormServiceId || reqSubmitting}
                    className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white"
                  >
                    {reqSubmitting ? 'Envoi...' : 'Envoyer la demande'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Section 3 - Tab Content */}
      {tabLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          {/* ═══════════════════ Tab: Annuaire ═══════════════════ */}
          {activeTab === 'annuaire' && (
            <div className="space-y-4">
              {/* Search + Filter */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher par nom ou catégorie..."
                    className="pl-9"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); if (homeId) fetchProfessionals(homeId, v).then(setProfessionals); }}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder="Toutes catégories" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    <SelectItem value="all">Toutes catégories</SelectItem>
                    {CATEGORY_OPTIONS.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Professional grid */}
              {filteredProfessionals.length === 0 ? (
                <div className="text-center py-12">
                  <Briefcase className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">Aucun artisan trouvé</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredProfessionals.map((pro) => (
                    <Card
                      key={pro.id}
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => { setSelectedPro(pro); setProDetailOpen(true); }}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className="bg-emerald-100 text-emerald-700 text-sm font-semibold">
                              {pro.businessName.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-medium text-sm truncate">{pro.businessName}</h4>
                              {pro.isVerified && (
                                <ShieldCheck className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                              )}
                            </div>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 mt-1 border-0 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                              {pro.category}
                            </Badge>
                          </div>
                        </div>

                        <div className="mt-3 space-y-1.5">
                          <div className="flex items-center gap-2">
                            {renderStars(Math.round(pro.ratingAvg))}
                            <span className="text-xs text-muted-foreground">({pro.totalReviews})</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            {pro.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />{pro.location}
                              </span>
                            )}
                            {pro.hourlyRate != null && (
                              <span className="font-medium text-foreground">{pro.hourlyRate.toFixed(0)} €/h</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {pro.isUrgentAvailable && (
                              <Badge className="text-[10px] px-1.5 py-0 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 border-0">
                                <Zap className="h-2.5 w-2.5 mr-0.5" />Urgences
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Professional detail dialog */}
              <Dialog open={proDetailOpen} onOpenChange={setProDetailOpen}>
                <DialogContent className="sm:max-w-[560px] max-h-[80vh] overflow-y-auto">
                  {selectedPro && (
                    <>
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                          {selectedPro.businessName}
                          {selectedPro.isVerified && <ShieldCheck className="h-5 w-5 text-blue-500" />}
                        </DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="flex items-center gap-4">
                          <Badge variant="outline" className="border-0 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {selectedPro.category}
                          </Badge>
                          <div className="flex items-center gap-2">
                            {renderStars(Math.round(selectedPro.ratingAvg), 'md')}
                            <span className="text-sm text-muted-foreground">{selectedPro.ratingAvg.toFixed(1)} ({selectedPro.totalReviews} avis)</span>
                          </div>
                        </div>

                        {selectedPro.description && (
                          <p className="text-sm text-muted-foreground leading-relaxed">{selectedPro.description}</p>
                        )}

                        <div className="grid grid-cols-2 gap-3 text-sm">
                          {selectedPro.location && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <MapPin className="h-4 w-4 shrink-0" />{selectedPro.location}
                            </div>
                          )}
                          {selectedPro.hourlyRate != null && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Clock className="h-4 w-4 shrink-0" />{selectedPro.hourlyRate.toFixed(0)} €/h
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Briefcase className="h-4 w-4 shrink-0" />{selectedPro.totalJobsCompleted} travaux réalisés
                          </div>
                          {selectedPro.isUrgentAvailable && (
                            <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 border-0">
                              <Zap className="h-3.5 w-3.5 mr-1" />Disponible en urgence
                            </Badge>
                          )}
                        </div>

                        {/* Services list */}
                        {selectedPro.services.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold mb-2">Services proposés</h4>
                            <div className="space-y-2">
                              {selectedPro.services.filter((s) => s.isActive).map((svc) => (
                                <div key={svc.id} className="flex items-center justify-between rounded-lg border p-3">
                                  <div>
                                    <p className="text-sm font-medium">{svc.name}</p>
                                    {svc.description && (
                                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{svc.description}</p>
                                    )}
                                  </div>
                                  <div className="text-right shrink-0 ml-3">
                                    <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                                      {svc.basePrice.toFixed(2)} €
                                      <span className="text-xs font-normal text-muted-foreground">
                                        {svc.priceUnit === 'hour' ? '/h' : svc.priceUnit === 'estimate' ? ' (estim.)' : ''}
                                      </span>
                                    </p>
                                    {svc.durationMinutes && (
                                      <p className="text-[10px] text-muted-foreground">~{svc.durationMinutes} min</p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </DialogContent>
              </Dialog>
            </div>
          )}

          {/* ═══════════════════ Tab: Mes Demandes ═══════════════════ */}
          {activeTab === 'demandes' && (
            <div className="space-y-3">
              {serviceRequests.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">Aucune demande de service</p>
                  <Button variant="link" size="sm" className="mt-2" onClick={() => setNewRequestOpen(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Créer une demande
                  </Button>
                </div>
              ) : (
                <div className="max-h-[500px] overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent space-y-3">
                  {serviceRequests.map((req) => (
                    <Card
                      key={req.id}
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => { setSelectedRequest(req); setRequestDetailOpen(true); }}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-medium text-sm">
                                {req.service?.name || 'Service'}
                              </h4>
                              <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_CONFIG[req.status].className}`}>
                                {STATUS_CONFIG[req.status].label}
                              </Badge>
                              <Badge className={`text-[10px] px-1.5 py-0 ${URGENCY_CONFIG[req.urgencyLevel].className}`}>
                                {URGENCY_CONFIG[req.urgencyLevel].label}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                              <span>{req.professional?.businessName}</span>
                              {req.preferredDate && (
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />{formatDate(req.preferredDate)}
                                </span>
                              )}
                            </div>
                          </div>
                          {req.finalPrice != null && (
                            <div className="text-right shrink-0">
                              <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                                {req.finalPrice.toFixed(2)} €
                              </p>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Request detail dialog */}
              <Dialog open={requestDetailOpen} onOpenChange={setRequestDetailOpen}>
                <DialogContent className="sm:max-w-[560px] max-h-[80vh] overflow-y-auto">
                  {selectedRequest && (
                    <>
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                          <FileText className="h-5 w-5 text-emerald-500" />
                          Détail de la demande
                        </DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_CONFIG[selectedRequest.status].className}`}>
                            {STATUS_CONFIG[selectedRequest.status].label}
                          </Badge>
                          <Badge className={`text-[10px] px-1.5 py-0 ${URGENCY_CONFIG[selectedRequest.urgencyLevel].className}`}>
                            {URGENCY_CONFIG[selectedRequest.urgencyLevel].label}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">Professionnel</p>
                            <p className="font-medium">{selectedRequest.professional?.businessName}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Service</p>
                            <p className="font-medium">{selectedRequest.service?.name || '—'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Date souhaitée</p>
                            <p className="font-medium">{selectedRequest.preferredDate ? formatDate(selectedRequest.preferredDate) : '—'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Prix final</p>
                            <p className="font-medium">{selectedRequest.finalPrice != null ? `${selectedRequest.finalPrice.toFixed(2)} €` : '—'}</p>
                          </div>
                        </div>

                        {/* Status timeline */}
                        <div>
                          <h4 className="text-sm font-semibold mb-2">Statut</h4>
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-emerald-500" />
                            <span className="text-sm">Demande créée le {formatDate(selectedRequest.createdAt)}</span>
                          </div>
                          {selectedRequest.status !== 'pending' && selectedRequest.status !== 'cancelled' && (
                            <div className="flex items-center gap-2 mt-1">
                              <CheckCircle className="h-4 w-4 text-emerald-500" />
                              <span className="text-sm">Statut actuel : {STATUS_CONFIG[selectedRequest.status].label}</span>
                            </div>
                          )}
                          {selectedRequest.status === 'cancelled' && (
                            <div className="flex items-center gap-2 mt-1">
                              <XCircle className="h-4 w-4 text-red-500" />
                              <span className="text-sm">Annulée</span>
                            </div>
                          )}
                        </div>

                        {selectedRequest.description && (
                          <div>
                            <h4 className="text-sm font-semibold mb-1">Description</h4>
                            <p className="text-sm text-muted-foreground">{selectedRequest.description}</p>
                          </div>
                        )}

                        {/* Chat preview */}
                        {selectedRequest.chatMessages && selectedRequest.chatMessages.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold mb-2">Derniers messages</h4>
                            <div className="space-y-2 max-h-40 overflow-y-auto">
                              {selectedRequest.chatMessages.slice(-3).map((msg) => (
                                <div
                                  key={msg.id}
                                  className={`text-xs p-2 rounded-lg ${
                                    msg.senderType === 'homeowner'
                                      ? 'bg-primary text-primary-foreground ml-4'
                                      : msg.messageType === 'system'
                                        ? 'text-center text-muted-foreground'
                                        : 'bg-muted mr-4'
                                  }`}
                                >
                                  <span>{msg.content}</span>
                                  <span className="ml-2 opacity-70">{formatTime(msg.createdAt)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-2">
                          {selectedRequest.status === 'completed' && !selectedRequest.review && (
                            <Button
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); setRequestDetailOpen(false); handleOpenReview(selectedRequest.id, selectedRequest.professionalId); }}
                              className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
                            >
                              <Star className="h-3.5 w-3.5 mr-1.5" />Laisser un avis
                            </Button>
                          )}
                          {selectedRequest.status === 'pending' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 hover:bg-red-50"
                              onClick={(e) => { e.stopPropagation(); handleCancelRequest(selectedRequest.id); }}
                            >
                              <Ban className="h-3.5 w-3.5 mr-1.5" />Annuler
                            </Button>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </DialogContent>
              </Dialog>
            </div>
          )}

          {/* ═══════════════════ Tab: Avis ═══════════════════ */}
          {activeTab === 'avis' && (
            <div className="space-y-6">
              {/* Reviews I wrote */}
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <HeartHandshake className="h-4 w-4 text-emerald-500" />
                  Avis laissés ({reviewsWritten.length})
                </h3>
                {reviewsWritten.length === 0 ? (
                  <div className="text-center py-8 rounded-xl border border-dashed border-muted-foreground/25">
                    <Star className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">Vous n'avez pas encore laissé d'avis</p>
                  </div>
                ) : (
                  <div className="max-h-[500px] overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent space-y-3">
                    {reviewsWritten.map((rev) => (
                      <Card key={rev.id}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                {renderStars(rev.rating, 'md')}
                              </div>
                              {rev.comment && (
                                <p className="text-sm text-muted-foreground">{rev.comment}</p>
                              )}
                              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                                <span>{rev.professional?.businessName || 'Professionnel'}</span>
                                <span>{formatDate(rev.createdAt)}</span>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {/* Pending reviews (completed requests without review) */}
              {serviceRequests.filter((r) => r.status === 'completed' && !r.review).length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Avis en attente
                  </h3>
                  <div className="space-y-2">
                    {serviceRequests
                      .filter((r) => r.status === 'completed' && !r.review)
                      .map((req) => (
                        <Card key={req.id}>
                          <CardContent className="p-4 flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium">{req.professional?.businessName}</p>
                              <p className="text-xs text-muted-foreground">{req.service?.name} — {formatDate(req.createdAt)}</p>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => handleOpenReview(req.id, req.professionalId)}
                              className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
                            >
                              <Star className="h-3.5 w-3.5 mr-1.5" />Laisser un avis
                            </Button>
                          </CardContent>
                        </Card>
                      ))}
                  </div>
                </div>
              )}

              {/* Reviews received (if user is a professional) */}
              {reviewsReceived.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-blue-500" />
                    Avis reçus ({reviewsReceived.length})
                  </h3>
                  <div className="max-h-[500px] overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent space-y-3">
                    {reviewsReceived.map((rev) => (
                      <Card key={rev.id}>
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2 mb-1">
                            {renderStars(rev.rating, 'md')}
                          </div>
                          {rev.comment && (
                            <p className="text-sm text-muted-foreground">{rev.comment}</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-2">{formatDate(rev.createdAt)}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Review dialog */}
              <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
                <DialogContent className="sm:max-w-[440px]">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Star className="h-5 w-5 text-amber-500" />
                      Laisser un avis
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="space-y-2">
                      <Label>Note *</Label>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setReviewFormRating(i + 1)}
                            className="p-1 hover:scale-110 transition-transform"
                          >
                            <Star
                              className={`h-7 w-7 ${i < reviewFormRating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300 dark:text-gray-600'}`}
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="review-comment">Commentaire</Label>
                      <Textarea
                        id="review-comment"
                        placeholder="Partagez votre expérience..."
                        value={reviewFormComment}
                        onChange={(e) => setReviewFormComment(e.target.value)}
                        rows={4}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>Annuler</Button>
                    <Button
                      onClick={handleSubmitReview}
                      disabled={!reviewFormRating || reviewSubmitting}
                      className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
                    >
                      {reviewSubmitting ? 'Publication...' : 'Publier l\'avis'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {/* ═══════════════════ Tab: Chat ═══════════════════ */}
          {activeTab === 'chat' && (
            <div className="space-y-3">
              {chatConversations.length === 0 ? (
                <div className="text-center py-12">
                  <MessageSquare className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">Aucune conversation</p>
                  <p className="text-xs text-muted-foreground mt-1">Les conversations apparaissent quand vous échangez avec un artisan</p>
                </div>
              ) : (
                <div className="max-h-[500px] overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent space-y-2">
                  {chatConversations.map((conv) => {
                    const lastMsg = conv.chatMessages?.[conv.chatMessages.length - 1];
                    const unreadCount = conv.chatMessages?.filter(
                      (m) => m.senderType === 'professional' && !m.isRead,
                    ).length || 0;

                    return (
                      <Card
                        key={conv.id}
                        className="cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => handleOpenChat(conv.id)}
                      >
                        <CardContent className="p-4 flex items-center gap-3">
                          <Avatar className="h-10 w-10 shrink-0">
                            <AvatarFallback className="bg-emerald-100 text-emerald-700 text-sm font-semibold">
                              {conv.professional?.businessName.charAt(0).toUpperCase() || '?'}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <h4 className="font-medium text-sm truncate">
                                {conv.professional?.businessName}
                              </h4>
                              {lastMsg && (
                                <span className="text-[10px] text-muted-foreground shrink-0">
                                  {formatTime(lastMsg.createdAt)}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center justify-between gap-2 mt-0.5">
                              <p className="text-xs text-muted-foreground truncate">
                                {conv.service?.name}{lastMsg ? ` — ${lastMsg.content}` : ''}
                              </p>
                              {unreadCount > 0 && (
                                <Badge className="shrink-0 text-[10px] px-1.5 py-0 bg-red-500 text-white border-0">
                                  {unreadCount}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}

              {/* Chat dialog */}
              <Dialog open={chatDialogOpen} onOpenChange={(open) => { setChatDialogOpen(open); if (!open) setChatRequestId(null); }}>
                <DialogContent className="sm:max-w-[520px] p-0 gap-0">
                  <DialogHeader className="px-6 pt-6 pb-2">
                    <DialogTitle className="flex items-center gap-2">
                      <MessageCircle className="h-5 w-5 text-emerald-500" />
                      {chatConversations.find((c) => c.id === chatRequestId)?.professional?.businessName || 'Conversation'}
                    </DialogTitle>
                  </DialogHeader>

                  {/* Message list */}
                  <div className="max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent px-6 py-2 space-y-2">
                    {chatMessages.length === 0 && (
                      <p className="text-center text-sm text-muted-foreground py-8">
                        Aucun message pour le moment
                      </p>
                    )}
                    {chatMessages.map((msg) => {
                      const isHomeowner = msg.senderType === 'homeowner';
                      const isSystem = msg.messageType === 'system';

                      return (
                        <div
                          key={msg.id}
                          className={`flex ${isSystem ? 'justify-center' : isHomeowner ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                              isSystem
                                ? 'text-xs text-muted-foreground bg-transparent'
                                : isHomeowner
                                  ? 'bg-primary text-primary-foreground rounded-br-sm'
                                  : 'bg-muted rounded-bl-sm'
                            }`}
                          >
                            <p className="text-sm break-words">{msg.content}</p>
                            <div className={`flex items-center gap-1 mt-0.5 ${isSystem ? 'justify-center' : 'justify-end'}`}>
                              <span className={`text-[10px] ${isHomeowner ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                                {formatTime(msg.createdAt)}
                              </span>
                              {isHomeowner && msg.isRead && (
                                <CheckCircle className="h-2.5 w-2.5 text-primary-foreground/60" />
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Input bar */}
                  <div className="border-t px-4 py-3 flex items-center gap-2">
                    <Input
                      placeholder="Écrire un message..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                      className="flex-1"
                    />
                    <Button
                      size="icon"
                      onClick={handleSendMessage}
                      disabled={!chatInput.trim() || chatSending}
                      className="shrink-0 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white"
                    >
                      {chatSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </>
      )}
    </div>
  );
}
