'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

import { QR_MODULE_LABELS, ALL_QR_MODULE_TYPES } from '@/types/database';
import { ModuleContentFields, moduleHasContentFields, validateModuleContent, MODULE_ACTIVATION_CONFIG } from '@/components/client/module-content-fields';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';

import { QrCodeDisplay } from '@/components/client/qr-code-display';

import {
  QrCode,
  ScanLine,
  Upload,
  FileText,
  Check,
  X,
  Loader2,
  Search,
  Filter,
  Plus,
  Trash2,
  Edit,
  Eye,
  Copy,
  RefreshCw,
  Home,
  Wifi,
  Bell,
  List,
  ShieldAlert,
  Package,
  Zap,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  Link,
  UtensilsCrossed,
  Pill,
  KeyRound,
  Sparkles,
  Palette,
} from 'lucide-react';

// ---------------------------------------------------------------------------
//  TypeScript interfaces for API response shapes
// ---------------------------------------------------------------------------

interface HomeResponse {
  id: string;
  name: string;
  address: string | null;
  isActive: boolean;
  _count: { rooms: number; members: number; qrCodes: number };
}

interface RoomResponse {
  id: string;
  name: string;
  icon: string | null;
  _count: { qrCodes: number };
}

interface CheckCodeResponse {
  valid: boolean;
  status: 'inactive' | 'active' | 'lost' | 'cancelled' | 'not_found';
  physicalQr?: { id: string; activationCode: string; status: string; designConfig: unknown };
}

interface QrCodeItem {
  id: string;
  name: string;
  type: string;
  publicSlug: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  room: { id: string; name: string; icon: string | null } | null;
  content: { id: string; contentJson: string; updatedAt: string } | null;
  physicalQrCodes: { id: string; activationCode: string; status: string }[];
}

// ---------------------------------------------------------------------------
//  Constants
// ---------------------------------------------------------------------------

const POPULAR_MODULES = [
  'wifi',
  'external_link',
  'home_manual',
  'note',
  'meal_planner',
  'guestbook',
  'doorbell',
  'emergency',
  'contact',
  'shopping_list',
  'checklist',
  'medication',
  'energy_monitor',
  'key_location',
  'cleaning_schedule',
  'inventory',
  'chore',
  'timer',
  'recipe',
] as const;

const MODULE_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  wifi: Wifi,
  guestbook: FileText,
  doorbell: Bell,
  emergency: ShieldAlert,
  note: FileText,
  contact: User,
  shopping_list: List,
  inventory: Package,
  chore: CheckCircle2,
  checklist: List,
  timer: Clock,
  recipe: FileText,
  external_link: Link,
  home_manual: FileText,
  meal_planner: UtensilsCrossed,
  medication: Pill,
  energy_monitor: Zap,
  key_location: KeyRound,
  cleaning_schedule: Sparkles,
};

const ITEMS_PER_PAGE = 10;

// ---------------------------------------------------------------------------
//  Component
// ---------------------------------------------------------------------------

export function PhysicalQrCodes() {
  // ---- Global state ----
  const [homes, setHomes] = useState<HomeResponse[]>([]);
  const [selectedHomeId, setSelectedHomeId] = useState<string>('');
  const [loadingHomes, setLoadingHomes] = useState(true);

  // ---- Tab 1 state (single activation) ----
  const [wizardStep, setWizardStep] = useState(1);
  const [codeInput, setCodeInput] = useState('');
  const [codeStatus, setCodeStatus] = useState<CheckCodeResponse | null>(null);
  const [codeChecking, setCodeChecking] = useState(false);
  const [selectedModuleType, setSelectedModuleType] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [qrName, setQrName] = useState('');
  const [activating, setActivating] = useState(false);
  const [moduleSearch, setModuleSearch] = useState('');
  const [moduleContent, setModuleContent] = useState<Record<string, string>>({});
  const [contentErrors, setContentErrors] = useState<string[]>([]);

  // ---- Tab 2 state (batch activation) ----
  const [batchCodes, setBatchCodes] = useState('');
  const [batchValidated, setBatchValidated] = useState(false);
  const [batchValidCodes, setBatchValidCodes] = useState<string[]>([]);
  const [batchInvalidCodes, setBatchInvalidCodes] = useState<string[]>([]);
  const [batchValidating, setBatchValidating] = useState(false);
  const [batchModuleType, setBatchModuleType] = useState('');
  const [batchRoomId, setBatchRoomId] = useState('');
  const [batchNamePrefix, setBatchNamePrefix] = useState('');
  const [batchActivating, setBatchActivating] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchResult, setBatchResult] = useState<{ activated: number; failed: number; errors: string[] } | null>(null);

  // ---- Tab 3 state (my codes) ----
  const [qrCodes, setQrCodes] = useState<QrCodeItem[]>([]);
  const [loadingCodes, setLoadingCodes] = useState(false);
  const [filterSearch, setFilterSearch] = useState('');
  const [filterModule, setFilterModule] = useState<string>('all');
  const [filterRoom, setFilterRoom] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);

  // ---- Dialogs ----
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingQr, setEditingQr] = useState<QrCodeItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editContent, setEditContent] = useState<Record<string, string>>({});
  const [editContentErrors, setEditContentErrors] = useState<string[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [deactivatingQr, setDeactivatingQr] = useState<QrCodeItem | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  // ---- Rooms cache ----
  const [rooms, setRooms] = useState<RoomResponse[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [showNewRoom, setShowNewRoom] = useState(false);
  const [creatingRoom, setCreatingRoom] = useState(false);

  // ---- QR Preview Dialog state ----
  const [qrPreviewOpen, setQrPreviewOpen] = useState(false);
  const [previewQr, setPreviewQr] = useState<QrCodeItem | null>(null);
  const [qrStyle, setQrStyle] = useState('classic');
  const [qrFgColor, setQrFgColor] = useState('#1e1b4b');
  const [qrBgColor, setQrBgColor] = useState('#ffffff');

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // ---- Fetch homes on mount ----
  useEffect(() => {
    async function fetchHomes() {
      try {
        const res = await fetch('/api/client/homes');
        const data = await res.json();
        if (data.homes && data.homes.length > 0) {
          setHomes(data.homes);
          setSelectedHomeId(data.homes[0].id);
        }
      } catch {
        toast.error('Erreur lors du chargement des maisons');
      } finally {
        setLoadingHomes(false);
      }
    }
    fetchHomes();
  }, []);

  // ---- Fetch rooms when home changes ----
  useEffect(() => {
    if (!selectedHomeId) return;
    async function fetchRooms() {
      setLoadingRooms(true);
      try {
        const res = await fetch(`/api/client/rooms?homeId=${selectedHomeId}`);
        const data = await res.json();
        setRooms(data.rooms ?? []);
      } catch {
        toast.error('Erreur lors du chargement des pièces');
      } finally {
        setLoadingRooms(false);
      }
    }
    fetchRooms();
  }, [selectedHomeId]);

  const handleCreateRoom = async () => {
    if (!newRoomName.trim() || !selectedHomeId) return;
    setCreatingRoom(true);
    try {
      const res = await fetch('/api/client/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ homeId: selectedHomeId, name: newRoomName.trim() }),
      });
      const data = await res.json();
      if (data.id) {
        setRooms((prev) => [...prev, { id: data.id, name: data.name, icon: data.icon, _count: { qrCodes: 0 } }]);
        setSelectedRoomId(data.id);
        setNewRoomName('');
        setShowNewRoom(false);
        toast.success(`Pièce « ${data.name} » créée`);
      }
    } catch { toast.error('Erreur lors de la création'); }
    finally { setCreatingRoom(false); }
  };

  // ---- Fetch QR codes for Tab 3 ----
  useEffect(() => {
    if (!selectedHomeId) return;
    async function fetchQrCodes() {
      setLoadingCodes(true);
      try {
        const res = await fetch(`/api/client/qr-codes?homeId=${selectedHomeId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const data = JSON.parse(text);
        setQrCodes(data.qrCodes ?? []);
      } catch (err) {
        console.error('[fetchQrCodes]', err);
        toast.error('Erreur lors du chargement des QR codes');
      } finally {
        setLoadingCodes(false);
      }
    }
    fetchQrCodes();
  }, [selectedHomeId]);

  // ---- Debounced code check ----
  const checkCode = useCallback(
    async (code: string) => {
      if (code.length < 10) {
        setCodeStatus(null);
        return;
      }
      setCodeChecking(true);
      try {
        const res = await fetch(`/api/client/check-code?code=${encodeURIComponent(code)}`);
        const data: CheckCodeResponse = await res.json();
        setCodeStatus(data);
      } catch {
        setCodeStatus({ valid: false, status: 'not_found' });
      } finally {
        setCodeChecking(false);
      }
    },
    []
  );

  // Debounce the code input
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!codeInput) {
      setCodeStatus(null);
      return;
    }
    debounceRef.current = setTimeout(() => {
      checkCode(codeInput);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [codeInput, checkCode]);

  // ---- Handlers ----

  function formatCodeInput(value: string) {
    const cleaned = value.replace(/[^a-zA-Z0-9-]/g, '').toUpperCase();
    return cleaned;
  }

  function handleCodeChange(value: string) {
    const formatted = formatCodeInput(value);
    setCodeInput(formatted);
    setCodeStatus(null);
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'inactive':
        return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
      case 'active':
        return <AlertCircle className="h-5 w-5 text-amber-500" />;
      case 'lost':
      case 'cancelled':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <XCircle className="h-5 w-5 text-red-500" />;
    }
  }

  function getStatusLabel(status: string) {
    switch (status) {
      case 'inactive':
        return 'Prêt à activer';
      case 'active':
        return 'Déjà activé';
      case 'lost':
        return 'Perdu';
      case 'cancelled':
        return 'Annulé';
      default:
        return 'Introuvable';
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'inactive':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'active':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'lost':
      case 'cancelled':
      case 'not_found':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-red-50 text-red-700 border-red-200';
    }
  }

  async function handleSingleActivate() {
    if (!selectedHomeId || !codeInput || !selectedModuleType || !qrName) return;

    // Validate content fields
    const errors = validateModuleContent(selectedModuleType, moduleContent);
    if (errors.length > 0) {
      setContentErrors(errors);
      toast.error(`Champs requis : ${errors.join(', ')}`);
      return;
    }

    setActivating(true);
    try {
      const hasContent = moduleHasContentFields(selectedModuleType) && Object.keys(moduleContent).length > 0;
      const res = await fetch('/api/client/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: codeInput,
          moduleType: selectedModuleType,
          name: qrName,
          homeId: selectedHomeId,
          content: hasContent ? moduleContent : undefined,
        }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        toast.success('QR code activé avec succès !');
        resetWizard();
        // Refresh QR codes list and switch to "Mes QR codes activés" tab
        const qrRes = await fetch(`/api/client/qr-codes?homeId=${selectedHomeId}`);
        const qrData = await qrRes.json();
        setQrCodes(qrData.qrCodes ?? []);
        // Switch to the activated QR codes tab so the user can see their QR
        const tabsList = document.querySelector('[role="tablist"]');
        const myCodesTab = tabsList?.querySelector('[value="my-codes"]') as HTMLElement;
        myCodesTab?.click();
      }
    } catch {
      toast.error('Erreur lors de l\'activation');
    } finally {
      setActivating(false);
    }
  }

  function resetWizard() {
    setWizardStep(1);
    setCodeInput('');
    setCodeStatus(null);
    setSelectedModuleType('');
    setSelectedRoomId('');
    setQrName('');
    setModuleContent({});
    setContentErrors([]);
  }

  // ---- Batch validation ----
  async function handleBatchValidate() {
    const raw = batchCodes.trim();
    if (!raw) return;
    const codes = raw
      .split(/[\n,]/)
      .map((c) => c.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''))
      .filter((c) => c.length > 0);

    setBatchValidating(true);
    setBatchValidCodes([]);
    setBatchInvalidCodes([]);

    const valid: string[] = [];
    const invalid: string[] = [];

    // Check each code sequentially
    for (const code of codes) {
      try {
        const res = await fetch(`/api/client/check-code?code=${encodeURIComponent(code)}`);
        const data: CheckCodeResponse = await res.json();
        if (data.valid) {
          valid.push(code);
        } else {
          invalid.push(code);
        }
      } catch {
        invalid.push(code);
      }
    }

    setBatchValidCodes(valid);
    setBatchInvalidCodes(invalid);
    setBatchValidated(true);
    setBatchValidating(false);
  }

  async function handleBatchActivate() {
    if (!selectedHomeId || batchValidCodes.length === 0 || !batchModuleType || !batchRoomId || !batchNamePrefix) return;
    setBatchActivating(true);
    setBatchProgress(0);
    setBatchResult(null);

    try {
      const res = await fetch('/api/client/activate-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codes: batchValidCodes,
          moduleType: batchModuleType,
          roomId: batchRoomId,
          name: batchNamePrefix,
          homeId: selectedHomeId,
        }),
      });

      // Simulate progress while waiting
      const progressInterval = setInterval(() => {
        setBatchProgress((prev) => Math.min(prev + 10, 90));
      }, 200);

      const data = await res.json();
      clearInterval(progressInterval);
      setBatchProgress(100);

      if (data.error) {
        toast.error(data.error);
      } else {
        setBatchResult({ activated: data.activated, failed: data.failed, errors: data.errors });
        toast.success(`${data.activated} QR code(s) activé(s) avec succès !`);
        // Refresh QR codes
        const qrRes = await fetch(`/api/client/qr-codes?homeId=${selectedHomeId}`);
        const qrData = await qrRes.json();
        setQrCodes(qrData.qrCodes ?? []);
      }
    } catch {
      toast.error('Erreur lors de l\'activation du lot');
    } finally {
      setBatchActivating(false);
    }
  }

  // ---- Edit QR code ----
  function openEditDialog(qr: QrCodeItem) {
    setEditingQr(qr);
    setEditName(qr.name);
    setEditContentErrors([]);
    // Parse existing content
    if (qr.content?.contentJson) {
      try {
        const parsed = JSON.parse(qr.content.contentJson);
        setEditContent(typeof parsed === 'object' && parsed !== null ? parsed as Record<string, string> : {});
      } catch {
        setEditContent({});
      }
    } else {
      setEditContent({});
    }
    setEditDialogOpen(true);
  }

  async function handleSaveEdit() {
    if (!editingQr || !editName.trim()) return;
    // Validate content if module has fields
    if (editingQr.type && moduleHasContentFields(editingQr.type)) {
      const errors = validateModuleContent(editingQr.type, editContent);
      if (errors.length > 0) {
        setEditContentErrors(errors);
        return;
      }
    }
    setEditSaving(true);
    try {
      const payload: Record<string, unknown> = { id: editingQr.id, name: editName.trim() };
      if (editingQr.type && moduleHasContentFields(editingQr.type)) {
        payload.content = editContent;
      }
      const res = await fetch('/api/client/qr-codes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        toast.success('QR code modifié avec succès');
        setEditDialogOpen(false);
        // Refresh
        const qrRes = await fetch(`/api/client/qr-codes?homeId=${selectedHomeId}`);
        const qrData = await qrRes.json();
        setQrCodes(qrData.qrCodes ?? []);
      }
    } catch {
      toast.error('Erreur lors de la modification');
    } finally {
      setEditSaving(false);
    }
  }

  // ---- Deactivate QR code ----
  function openDeactivateDialog(qr: QrCodeItem) {
    setDeactivatingQr(qr);
    setDeactivateDialogOpen(true);
  }

  async function handleDeactivate() {
    if (!deactivatingQr) return;
    setDeactivating(true);
    try {
      const physicalQr = deactivatingQr.physicalQrCodes[0];
      if (!physicalQr) {
        toast.error('Code physique introuvable');
        return;
      }
      const res = await fetch('/api/client/qr-codes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deactivatingQr.id, physicalQrCodeId: physicalQr.id }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        toast.success('QR code désactivé');
        setDeactivateDialogOpen(false);
        // Refresh
        const qrRes = await fetch(`/api/client/qr-codes?homeId=${selectedHomeId}`);
        const qrData = await qrRes.json();
        setQrCodes(qrData.qrCodes ?? []);
      }
    } catch {
      toast.error('Erreur lors de la désactivation');
    } finally {
      setDeactivating(false);
    }
  }

  // ---- Filtered QR codes for Tab 3 ----
  const filteredQrCodes = qrCodes.filter((qr) => {
    if (filterSearch && !qr.name.toLowerCase().includes(filterSearch.toLowerCase()) && !qr.physicalQrCodes.some((p) => p.activationCode.toLowerCase().includes(filterSearch.toLowerCase()))) {
      return false;
    }
    if (filterModule !== 'all' && qr.type !== filterModule) return false;
    if (filterRoom !== 'all' && qr.room?.id !== filterRoom) return false;
    if (filterStatus !== 'all') {
      if (filterStatus === 'active' && !qr.isActive) return false;
      if (filterStatus === 'inactive' && qr.isActive) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredQrCodes.length / ITEMS_PER_PAGE));
  const paginatedQrCodes = filteredQrCodes.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // ---- Filtered module types for grid ----
  const filteredModules = POPULAR_MODULES.filter((m) => {
    if (!moduleSearch) return true;
    const label = (QR_MODULE_LABELS as Record<string, string>)[m] ?? m;
    return label.toLowerCase().includes(moduleSearch.toLowerCase()) || m.toLowerCase().includes(moduleSearch.toLowerCase());
  });

  // ---- No home state ----
  if (loadingHomes) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[500px] w-full" />
      </div>
    );
  }

  if (homes.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-primary/10 p-4 mb-4">
            <Home className="h-10 w-10 text-primary" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Aucune maison configurée</h3>
          <p className="text-muted-foreground text-sm max-w-sm">
            Vous devez d'abord créer une maison avant de pouvoir activer des QR codes physiques.
          </p>
          <Button className="mt-6" onClick={async () => {
            const res = await fetch('/api/client/homes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: 'Ma Maison', address: '' }),
            });
            const data = await res.json();
            if (data.id) {
              setHomes([data]);
              setSelectedHomeId(data.id);
              toast.success('Maison créée avec succès !');
            }
          }}>
            <Plus className="h-4 w-4 mr-2" />
            Créer ma première maison
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Home selector header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <QrCode className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">QR Codes Physiques</h2>
            <p className="text-muted-foreground text-sm">Activez et gérez vos QR codes imprimés</p>
          </div>
        </div>
        {homes.length > 1 && (
          <Select value={selectedHomeId} onValueChange={setSelectedHomeId}>
            <SelectTrigger className="w-56">
              <Home className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Sélectionner une maison" />
            </SelectTrigger>
            <SelectContent>
              {homes.map((h) => (
                <SelectItem key={h.id} value={h.id}>
                  {h.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <Tabs defaultValue="activate-single" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="activate-single" className="gap-2">
            <ScanLine className="h-4 w-4 hidden sm:inline-block" />
            Activer un QR code
          </TabsTrigger>
          <TabsTrigger value="activate-batch" className="gap-2">
            <Zap className="h-4 w-4 hidden sm:inline-block" />
            Activer un lot
          </TabsTrigger>
          <TabsTrigger value="my-codes" className="gap-2">
            <List className="h-4 w-4 hidden sm:inline-block" />
            Mes QR codes activés
          </TabsTrigger>
        </TabsList>

        {/* ================================================================== */}
        {/*  TAB 1 — Activate single                                           */}
        {/* ================================================================== */}
        <TabsContent value="activate-single">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">
                <ScanLine className="h-5 w-5" />
                Activer un QR code
              </CardTitle>
              <CardDescription>Suivez les 3 étapes pour activer un QR code physique</CardDescription>
            </CardHeader>
            <CardContent>
              {/* Step indicator */}
              <div className="flex items-center justify-center mb-8">
                <div className="flex items-center gap-2">
                  {[1, 2, 3].map((step) => (
                    <div key={step} className="flex items-center">
                      <div
                        className={`flex items-center justify-center w-9 h-9 rounded-full text-sm font-semibold transition-all duration-300 ${
                          wizardStep >= step
                            ? 'bg-primary text-primary-foreground shadow-md'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {wizardStep > step ? <Check className="h-4 w-4" /> : step}
                      </div>
                      {step < 3 && (
                        <div
                          className={`w-16 sm:w-24 h-0.5 mx-1 transition-colors duration-300 ${
                            wizardStep > step ? 'bg-primary' : 'bg-muted'
                          }`}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Step 1: Code input */}
              {wizardStep === 1 && (
                <div className="max-w-md mx-auto space-y-6">
                  <div className="text-center">
                    <h3 className="text-lg font-semibold mb-1">Étape 1 — Saisissez le code</h3>
                    <p className="text-sm text-muted-foreground">
                      Entrez le code d'activation imprimé sur votre QR code (format QR-XXXXXXXX)
                    </p>
                  </div>

                  <div className="relative">
                    <Input
                      placeholder="QR-XXXXXXXX"
                      value={codeInput}
                      onChange={(e) => handleCodeChange(e.target.value)}
                      className={`h-12 text-center text-lg font-mono tracking-widest ${
                        codeStatus
                          ? codeStatus.status === 'inactive'
                            ? 'border-emerald-500 focus-visible:ring-emerald-500'
                            : codeStatus.status === 'active'
                              ? 'border-amber-500 focus-visible:ring-amber-500'
                              : 'border-red-500 focus-visible:ring-red-500'
                          : ''
                      }`}
                      maxLength={20}
                    />
                    {codeChecking && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 animate-spin text-muted-foreground" />
                    )}
                  </div>

                  {/* Status feedback */}
                  {codeStatus && !codeChecking && (
                    <div
                      className={`flex items-center gap-3 p-3 rounded-lg border ${getStatusColor(codeStatus.status)}`}
                    >
                      {getStatusIcon(codeStatus.status)}
                      <span className="text-sm font-medium">{getStatusLabel(codeStatus.status)}</span>
                    </div>
                  )}

                  <Button
                    className="w-full h-11"
                    disabled={!codeStatus || !codeStatus.valid}
                    onClick={() => setWizardStep(2)}
                  >
                    Suivant
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              )}

              {/* Step 2: Module type + room + name */}
              {wizardStep === 2 && (
                <div className="space-y-8">
                  <div className="text-center">
                    <h3 className="text-lg font-semibold mb-1">Étape 2 — Configuration</h3>
                    <p className="text-sm text-muted-foreground">
                      Choisissez le type de module, la pièce et un nom pour votre QR code
                    </p>
                  </div>

                  {/* Module type search */}
                  <div className="relative max-w-sm mx-auto">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Rechercher un module..."
                      value={moduleSearch}
                      onChange={(e) => setModuleSearch(e.target.value)}
                      className="pl-10"
                    />
                  </div>

                  {/* Module type grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-2xl mx-auto">
                    {filteredModules.map((moduleKey) => {
                      const IconComponent = MODULE_ICON_MAP[moduleKey] ?? QrCode;
                      const label = (QR_MODULE_LABELS as Record<string, string>)[moduleKey] ?? moduleKey;
                      const isSelected = selectedModuleType === moduleKey;
                      return (
                        <button
                          key={moduleKey}
                          type="button"
                          onClick={() => {
                            setSelectedModuleType(moduleKey);
                            setModuleContent({});
                            setContentErrors([]);
                          }}
                          className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 hover:shadow-md ${
                            isSelected
                              ? 'border-primary bg-primary/5 shadow-md'
                              : 'border-border hover:border-primary/40'
                          }`}
                        >
                          <IconComponent className={`h-7 w-7 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                          <span className={`text-sm font-medium ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                            {label}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <Separator />

                  {/* Room selector */}
                  <div className="max-w-sm mx-auto space-y-3">
                    <Label className="text-sm font-medium">Pièce</Label>
                    {loadingRooms ? (
                      <Skeleton className="h-10 w-full" />
                    ) : rooms.length === 0 && !showNewRoom ? (
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground mb-2">
                          Aucune pièce — le QR sera associé à votre maison
                        </p>
                        <Button variant="outline" size="sm" onClick={() => setShowNewRoom(true)}>
                          <Plus className="h-3.5 w-3.5 mr-1" /> Créer une pièce
                        </Button>
                      </div>
                    ) : showNewRoom ? (
                      <div className="flex gap-2">
                        <Input
                          placeholder="Nom de la pièce"
                          value={newRoomName}
                          onChange={(e) => setNewRoomName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleCreateRoom()}
                        />
                        <Button size="sm" onClick={handleCreateRoom} disabled={!newRoomName.trim() || creatingRoom}>
                          {creatingRoom ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setShowNewRoom(false)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <Select value={selectedRoomId || '_'} onValueChange={(v) => { if (v === '__new__') { setShowNewRoom(true); } else { setSelectedRoomId(v); } }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionner une pièce" />
                        </SelectTrigger>
                        <SelectContent>
                          {rooms.map((room) => (
                            <SelectItem key={room.id} value={room.id}>
                              {room.icon ? `${room.icon} ` : ''}{room.name}
                            </SelectItem>
                          ))}
                          <SelectItem value="__new__" className="text-primary">
                            <Plus className="h-3.5 w-3.5 mr-1 inline" /> Créer une nouvelle pièce...
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {/* Name input */}
                  <div className="max-w-sm mx-auto space-y-3">
                    <Label className="text-sm font-medium">Nom du QR code</Label>
                    <Input
                      placeholder="ex: Wi-Fi Invités"
                      value={qrName}
                      onChange={(e) => setQrName(e.target.value)}
                    />
                  </div>

                  {/* Module content fields (conditional) */}
                  {selectedModuleType && moduleHasContentFields(selectedModuleType) && (
                    <>
                      <Separator />
                      <div className="max-w-sm mx-auto">
                        <p className="text-sm font-semibold mb-3">Configuration du module</p>
                        {contentErrors.length > 0 && (
                          <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/5 p-2.5 mb-3 text-sm text-destructive">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            <span>Remplissez : {contentErrors.join(', ')}</span>
                          </div>
                        )}
                        <ModuleContentFields
                          moduleType={selectedModuleType}
                          content={moduleContent}
                          onChange={(c) => { setModuleContent(c); setContentErrors([]); }}
                        />
                      </div>
                    </>
                  )}

                  {/* Navigation */}
                  <div className="flex gap-3 justify-center">
                    <Button variant="outline" onClick={() => setWizardStep(1)}>
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Retour
                    </Button>
                    <Button
                      disabled={!selectedModuleType || !qrName.trim()}
                      onClick={() => setWizardStep(3)}
                    >
                      Suivant
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 3: Confirmation */}
              {wizardStep === 3 && (
                <div className="max-w-md mx-auto space-y-6">
                  <div className="text-center">
                    <h3 className="text-lg font-semibold mb-1">Étape 3 — Confirmation</h3>
                    <p className="text-sm text-muted-foreground">
                      Vérifiez les informations avant d'activer
                    </p>
                  </div>

                  <div className="space-y-3 rounded-xl border p-5 bg-muted/20">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Code</span>
                      <span className="font-mono font-semibold text-sm">{codeInput}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Module</span>
                      <Badge variant="secondary">
                        {(QR_MODULE_LABELS as Record<string, string>)[selectedModuleType] ?? selectedModuleType}
                      </Badge>
                    </div>
                    {selectedRoomId && (<>
                    <Separator />
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Pièce</span>
                      <span className="text-sm font-medium">
                        {rooms.find((r) => r.id === selectedRoomId)?.name ?? '—'}
                      </span>
                    </div>
                    </>)}
                    <Separator />
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Nom</span>
                      <span className="text-sm font-medium">{qrName}</span>
                    </div>
                    {selectedModuleType && moduleHasContentFields(selectedModuleType) && Object.keys(moduleContent).length > 0 && (
                      <>
                        <Separator />
                        <div className="space-y-1.5">
                          <span className="text-sm text-muted-foreground">Contenu du module</span>
                          {Object.entries(moduleContent).map(([key, val]) => {
                            const fieldDef = MODULE_ACTIVATION_CONFIG[selectedModuleType]?.fields.find(f => f.key === key);
                            return val ? (
                              <div key={key} className="flex justify-between text-sm">
                                <span className="text-muted-foreground">{fieldDef?.label ?? key}</span>
                                <span className="font-medium text-right max-w-[60%] truncate">
                                  {key === 'password' ? '••••••••' : val}
                                </span>
                              </div>
                            ) : null;
                          })}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1" onClick={() => setWizardStep(2)}>
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Retour
                    </Button>
                    <Button
                      className="flex-1"
                      disabled={activating}
                      onClick={handleSingleActivate}
                    >
                      {activating ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Activation...
                        </>
                      ) : (
                        <>
                          <Check className="mr-2 h-4 w-4" />
                          Activer maintenant
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================== */}
        {/*  TAB 2 — Activate batch                                             */}
        {/* ================================================================== */}
        <TabsContent value="activate-batch">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Method 1: Manual entry */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Méthode 1 — Saisie manuelle
                </CardTitle>
                <CardDescription>Collez vos codes d'activation (un par ligne ou séparés par des virgules)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder={"QR-AAAAAAAA\nQR-BBBBBBBB\nQR-CCCCCCCC"}
                  value={batchCodes}
                  onChange={(e) => {
                    setBatchCodes(e.target.value);
                    setBatchValidated(false);
                  }}
                  rows={6}
                  className="font-mono text-sm"
                />
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={!batchCodes.trim() || batchValidating}
                  onClick={handleBatchValidate}
                >
                  {batchValidating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Vérification en cours...
                    </>
                  ) : (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Valider les codes
                    </>
                  )}
                </Button>

                {/* Validation results */}
                {batchValidated && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      <span className="text-sm font-medium text-emerald-600">
                        {batchValidCodes.length} code(s) valide(s)
                      </span>
                    </div>
                    {batchInvalidCodes.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <XCircle className="h-4 w-4 text-red-500" />
                          <span className="text-sm font-medium text-red-600">
                            {batchInvalidCodes.length} code(s) invalide(s)
                          </span>
                        </div>
                        <div className="max-h-24 overflow-y-auto rounded-lg border border-red-200 bg-red-50 p-2">
                          {batchInvalidCodes.map((code) => (
                            <div key={code} className="font-mono text-xs text-red-600 py-0.5">
                              {code}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Method 2: File import */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Méthode 2 — Import fichier
                </CardTitle>
                <CardDescription>Importez un fichier CSV ou TXT contenant vos codes</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/25 bg-muted/10 py-12 px-6 text-center transition-colors hover:border-primary/40 hover:bg-primary/5">
                  <Upload className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-sm font-medium">Glissez un fichier CSV ou TXT ici</p>
                  <p className="text-xs text-muted-foreground mt-1">ou cliquez pour parcourir</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Batch configuration (shared) */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Configuration du lot</CardTitle>
              <CardDescription>Paramètres appliqués à tous les QR codes du lot</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 sm:grid-cols-3">
                {/* Module type */}
                <div className="space-y-2">
                  <Label>Type de module</Label>
                  <Select value={batchModuleType} onValueChange={setBatchModuleType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      {POPULAR_MODULES.map((m) => (
                        <SelectItem key={m} value={m}>
                          {(QR_MODULE_LABELS as Record<string, string>)[m] ?? m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Room */}
                <div className="space-y-2">
                  <Label>Pièce</Label>
                  {loadingRooms ? (
                    <Skeleton className="h-10 w-full" />
                  ) : (
                    <Select value={batchRoomId} onValueChange={setBatchRoomId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner" />
                      </SelectTrigger>
                      <SelectContent>
                        {rooms.map((room) => (
                          <SelectItem key={room.id} value={room.id}>
                            {room.icon ? `${room.icon} ` : ''}{room.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Name prefix */}
                <div className="space-y-2">
                  <Label>Préfixe du nom</Label>
                  <Input
                    placeholder="ex: QR Cuisine-"
                    value={batchNamePrefix}
                    onChange={(e) => setBatchNamePrefix(e.target.value)}
                  />
                </div>
              </div>

              {/* Progress bar */}
              {batchActivating && (
                <div className="mt-6 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Activation en cours...</span>
                    <span className="font-medium">{batchProgress}%</span>
                  </div>
                  <Progress value={batchProgress} className="h-2" />
                </div>
              )}

              {/* Batch results */}
              {batchResult && (
                <div className="mt-6 rounded-lg border p-4 space-y-3">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                      <span className="text-sm font-semibold text-emerald-600">
                        {batchResult.activated} activé(s)
                      </span>
                    </div>
                    {batchResult.failed > 0 && (
                      <div className="flex items-center gap-2">
                        <XCircle className="h-5 w-5 text-red-500" />
                        <span className="text-sm font-semibold text-red-600">
                          {batchResult.failed} échoué(s)
                        </span>
                      </div>
                    )}
                  </div>
                  {batchResult.errors.length > 0 && (
                    <div className="max-h-24 overflow-y-auto rounded border border-red-200 bg-red-50 p-2">
                      {batchResult.errors.map((err, i) => (
                        <p key={i} className="text-xs text-red-600 font-mono py-0.5">{err}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Activate button */}
              <div className="mt-6 flex justify-end">
                <Button
                  disabled={
                    batchValidCodes.length === 0 ||
                    !batchModuleType ||
                    !batchRoomId ||
                    !batchNamePrefix.trim() ||
                    batchActivating
                  }
                  onClick={handleBatchActivate}
                >
                  {batchActivating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Activation en cours...
                    </>
                  ) : (
                    <>
                      <Zap className="mr-2 h-4 w-4" />
                      Activer le lot ({batchValidCodes.length} code{batchValidCodes.length > 1 ? 's' : ''})
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================== */}
        {/*  TAB 3 — My activated QR codes                                     */}
        {/* ================================================================== */}
        <TabsContent value="my-codes">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <List className="h-5 w-5" />
                Mes QR codes activés
              </CardTitle>
              <CardDescription>Consultez et gérez tous vos QR codes activés</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filter bar */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher par nom ou code..."
                    value={filterSearch}
                    onChange={(e) => {
                      setFilterSearch(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="pl-10"
                  />
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Select value={filterModule} onValueChange={(v) => { setFilterModule(v); setCurrentPage(1); }}>
                    <SelectTrigger className="w-[160px]">
                      <Filter className="h-4 w-4 mr-2" />
                      <SelectValue placeholder="Module" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous les modules</SelectItem>
                      {POPULAR_MODULES.map((m) => (
                        <SelectItem key={m} value={m}>
                          {(QR_MODULE_LABELS as Record<string, string>)[m] ?? m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={filterRoom} onValueChange={(v) => { setFilterRoom(v); setCurrentPage(1); }}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Pièce" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Toutes les pièces</SelectItem>
                      {rooms.map((room) => (
                        <SelectItem key={room.id} value={room.id}>
                          {room.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setCurrentPage(1); }}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue placeholder="Statut" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous</SelectItem>
                      <SelectItem value="active">Actif</SelectItem>
                      <SelectItem value="inactive">Inactif</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Table */}
              {loadingCodes ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex gap-4">
                      <Skeleton className="h-10 flex-1" />
                    </div>
                  ))}
                </div>
              ) : filteredQrCodes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="rounded-full bg-muted p-4 mb-4">
                    <QrCode className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-1">Aucun QR code activé</h3>
                  <p className="text-sm text-muted-foreground">
                    Commencez par activer un QR code physique dans l'onglet &quot;Activer un QR code&quot;.
                  </p>
                </div>
              ) : (
                <>
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="w-[140px]">Code</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Pièce</TableHead>
                          <TableHead>Nom</TableHead>
                          <TableHead className="w-[100px]">Statut</TableHead>
                          <TableHead className="w-[120px] hidden md:table-cell">Date</TableHead>
                          <TableHead className="w-[120px] text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedQrCodes.map((qr) => {
                          const physicalQr = qr.physicalQrCodes[0];
                          const publicUrl = qr.publicSlug ? `${window.location.origin}/view/${qr.publicSlug}` : null;
                          return (
                            <TableRow key={qr.id} className="group">
                              <TableCell className="font-mono text-xs">
                                {physicalQr?.activationCode ?? '—'}
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary" className="text-xs">
                                  {(QR_MODULE_LABELS as Record<string, string>)[qr.type] ?? qr.type}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm">
                                {qr.room?.name ?? '—'}
                              </TableCell>
                              <TableCell className="text-sm font-medium">
                                {qr.name}
                              </TableCell>
                              <TableCell>
                                {qr.isActive ? (
                                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100">
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    Actif
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-muted-foreground">
                                    <XCircle className="h-3 w-3 mr-1" />
                                    Inactif
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground hidden md:table-cell">
                                {format(new Date(qr.createdAt), "dd MMM yyyy", { locale: fr })}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {qr.publicSlug && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      title="Voir le QR code"
                                      onClick={() => {
                                        setPreviewQr(qr);
                                        setQrStyle('classic');
                                        setQrFgColor('#1e1b4b');
                                        setQrBgColor('#ffffff');
                                        setQrPreviewOpen(true);
                                      }}
                                    >
                                      <Eye className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  {publicUrl && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      title="Copier le lien de scan"
                                      onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success('Lien copié !'); }}
                                    >
                                      <Link className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => openEditDialog(qr)}
                                    title="Modifier"
                                  >
                                    <Edit className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                                    onClick={() => openDeactivateDialog(qr)}
                                    title="Désactiver"
                                    disabled={!qr.isActive}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">
                        {filteredQrCodes.length} résultat{filteredQrCodes.length > 1 ? 's' : ''} — Page {currentPage} sur {totalPages}
                      </p>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          disabled={currentPage <= 1}
                          onClick={() => setCurrentPage((p) => p - 1)}
                        >
                          <ArrowLeft className="h-4 w-4" />
                        </Button>
                        {Array.from({ length: totalPages }).map((_, i) => {
                          const page = i + 1;
                          return (
                            <Button
                              key={page}
                              variant={currentPage === page ? 'default' : 'outline'}
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setCurrentPage(page)}
                            >
                              {page}
                            </Button>
                          );
                        })}
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          disabled={currentPage >= totalPages}
                          onClick={() => setCurrentPage((p) => p + 1)}
                        >
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ================================================================== */}
      {/*  Edit Dialog                                                        */}
      {/* ================================================================== */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifier le QR code</DialogTitle>
            <DialogDescription>
              Modifiez le nom et le contenu de &quot;{editingQr?.name}&quot;
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-6">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nom du QR code</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Nom du QR code"
              />
            </div>

            {/* Module content editing */}
            {editingQr?.type && moduleHasContentFields(editingQr.type) && (
              <>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {(QR_MODULE_LABELS as Record<string, string>)[editingQr.type] ?? editingQr.type}
                    </Badge>
                    <span className="text-sm text-muted-foreground">Contenu du module</span>
                  </div>
                  {editContentErrors.length > 0 && (
                    <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/5 p-2.5 text-sm text-destructive">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>Remplissez : {editContentErrors.join(', ')}</span>
                    </div>
                  )}
                  <ModuleContentFields
                    moduleType={editingQr.type}
                    content={editContent}
                    onChange={(c) => { setEditContent(c); setEditContentErrors([]); }}
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Annuler
            </Button>
            <Button disabled={editSaving || !editName.trim()} onClick={handleSaveEdit}>
              {editSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================================================================== */}
      {/*  Deactivate AlertDialog                                              */}
      {/* ================================================================== */}
      <AlertDialog open={deactivateDialogOpen} onOpenChange={setDeactivateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Désactiver ce QR code ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le QR code &quot;{deactivatingQr?.name}&quot; sera désactivé. Le code physique pourra être
              réutilisé pour une nouvelle activation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deactivating}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeactivate}
              disabled={deactivating}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deactivating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Désactiver
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ================================================================== */}
      {/*  QR Preview Dialog                                                  */}
      {/* ================================================================== */}
      <Dialog open={qrPreviewOpen} onOpenChange={setQrPreviewOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              QR Code personnalisé
            </DialogTitle>
            <DialogDescription>
              {previewQr?.name ?? 'QR code'}
            </DialogDescription>
          </DialogHeader>

          {previewQr?.publicSlug && (
            <div className="space-y-6">
              {/* QR Code display */}
              <div className="flex justify-center">
                <QrCodeDisplay
                  value={`https://qrdomotik.roomscan.pro/view/${previewQr.publicSlug}`}
                  size={220}
                  style={qrStyle}
                  fgColor={qrFgColor}
                  bgColor={qrBgColor}
                />
              </div>

              {/* Public URL with copy */}
              <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                <Link className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-mono truncate flex-1">
                  https://qrdomotik.roomscan.pro/view/{previewQr.publicSlug}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0"
                  onClick={() => {
                    navigator.clipboard.writeText(`https://qrdomotik.roomscan.pro/view/${previewQr.publicSlug}`);
                    toast.success('Lien copié !');
                  }}
                >
                  <Copy className="h-3.5 w-3.5 mr-1" />
                  Copier
                </Button>
              </div>

              <Separator />

              {/* Style selector */}
              <div className="space-y-3">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Palette className="h-4 w-4" />
                  Style du QR code
                </Label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { value: 'classic', label: 'Classique' },
                    { value: 'rounded', label: 'Arrondi' },
                    { value: 'dots', label: 'Points' },
                    { value: 'classy', label: 'Élégant' },
                  ].map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setQrStyle(s.value)}
                      className={`rounded-lg border-2 px-3 py-2 text-xs font-medium transition-all ${
                        qrStyle === s.value
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border hover:border-primary/40'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Color pickers */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm">Couleur de premier plan</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={qrFgColor}
                      onChange={(e) => setQrFgColor(e.target.value)}
                      className="h-9 w-12 rounded-lg border cursor-pointer"
                    />
                    <span className="text-xs font-mono text-muted-foreground">{qrFgColor}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Couleur de fond</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={qrBgColor}
                      onChange={(e) => setQrBgColor(e.target.value)}
                      className="h-9 w-12 rounded-lg border cursor-pointer"
                    />
                    <span className="text-xs font-mono text-muted-foreground">{qrBgColor}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
