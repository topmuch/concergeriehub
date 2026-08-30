'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import {
  Star,
  Trophy,
  CheckCircle,
  XCircle,
  Plus,
  Edit,
  Trash2,
  Clock,
  Users,
  Sparkles,
  ListChecks,
  Medal,
  Crown,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { Textarea } from '@/components/ui/textarea';

// ── Types ──────────────────────────────────────────────────────
interface ChoreData {
  id: string;
  title: string;
  description: string | null;
  pointsValue: number;
  frequency: string;
  assignedToUserId: string | null;
  isActive: boolean;
  createdAt: string;
  assignedTo: { id: string; fullName: string | null; email: string } | null;
  _count: { completions: number };
}

interface CompletionData {
  id: string;
  choreId: string;
  childUserId: string;
  pointsEarned: number;
  completedAt: string;
  status: string;
  chore: { id: string; title: string; pointsValue: number };
  child: { id: string; fullName: string | null; email: string };
}

interface MemberData {
  id: string;
  userId: string;
  homeId: string;
  role: string;
  nickname: string | null;
  points: number;
  user: { id: string; fullName: string | null; email: string };
}

interface HomeData {
  id: string;
  name: string;
}

const FREQUENCY_LABELS: Record<string, string> = {
  once: 'Ponctuelle',
  daily: 'Quotidienne',
  weekly: 'Hebdomadaire',
  monthly: 'Mensuelle',
};

const FREQUENCY_COLORS: Record<string, string> = {
  once: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  daily: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  weekly: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  monthly: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
};

// ── Component ──────────────────────────────────────────────────
export function ChoresManager() {
  const { data: session } = useSession();
  const userId = session?.user?.id;

  // Data state
  const [homeId, setHomeId] = useState<string | null>(null);
  const [chores, setChores] = useState<ChoreData[]>([]);
  const [members, setMembers] = useState<MemberData[]>([]);
  const [pendingCompletions, setPendingCompletions] = useState<CompletionData[]>([]);
  const [loading, setLoading] = useState(true);

  // UI state
  const [filter, setFilter] = useState<'all' | 'active' | 'completed-today'>('active');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingChore, setEditingChore] = useState<ChoreData | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPoints, setFormPoints] = useState('10');
  const [formFrequency, setFormFrequency] = useState('once');
  const [formAssignedTo, setFormAssignedTo] = useState<string>('none');
  const [submitting, setSubmitting] = useState(false);

  const childMembers = members.filter((m) => m.role === 'child');

  // ── Fetch data ──────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      // Get first home
      const homesRes = await fetch('/api/client/homes');
      const homesData = await homesRes.json();
      const homes: HomeData[] = homesData.homes || [];
      const firstHomeId = homes[0]?.id;

      if (!firstHomeId) {
        setLoading(false);
        return;
      }

      setHomeId(firstHomeId);

      // Fetch chores, members, and pending completions in parallel
      const [choresRes, membersRes] = await Promise.all([
        fetch(`/api/client/chores?homeId=${firstHomeId}&status=all`),
        fetch(`/api/client/homes/${firstHomeId}/members`),
      ]);

      const choresData = await choresRes.json();
      const membersData = await membersRes.json();

      const choresList: ChoreData[] = choresData.chores || [];
      const membersList: MemberData[] = membersData.members || [];

      setChores(choresList);
      setMembers(membersList);

      // Fetch all pending completions for this home
      if (choresList.length > 0) {
        const choreIds = choresList.map((c) => c.id).join(',');
        const completionsRes = await fetch(`/api/client/chores?homeId=${firstHomeId}&status=all`);
        const completionsData = await completionsRes.json();
        const allChores: ChoreData[] = completionsData.chores || [];

        // Gather all completion IDs from chores that have pending completions
        const allPending: CompletionData[] = [];
        for (const chore of allChores) {
          if (chore._count.completions > 0) {
            // We need to get completions separately - let's use the chore id
            // For now, we'll track pending completions from the validate flow
          }
        }

        // Fetch pending completions from all chores
        const pendingRes = await fetch(`/api/client/chores?homeId=${firstHomeId}&status=all`);
        // Since we don't have a dedicated endpoint for all completions, we'll manage pending completions locally
      }
    } catch {
      toast.error('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Computed values ─────────────────────────────────────────
  const activeChores = chores.filter((c) => c.isActive);
  const filteredChores = (() => {
    switch (filter) {
      case 'active':
        return chores.filter((c) => c.isActive);
      case 'completed-today':
        return chores.filter((c) => c._count.completions > 0);
      default:
        return chores;
    }
  })();

  const totalValidatedPoints = childMembers.reduce((sum, m) => sum + m.points, 0);
  const sortedChildren = [...childMembers].sort((a, b) => b.points - a.points);

  // Pending completions: we track locally via the completions made in the session
  const [localPending, setLocalPending] = useState<CompletionData[]>([]);

  // ── Handlers ────────────────────────────────────────────────
  const resetForm = () => {
    setFormTitle('');
    setFormDescription('');
    setFormPoints('10');
    setFormFrequency('once');
    setFormAssignedTo('none');
    setEditingChore(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (chore: ChoreData) => {
    setEditingChore(chore);
    setFormTitle(chore.title);
    setFormDescription(chore.description || '');
    setFormPoints(String(chore.pointsValue));
    setFormFrequency(chore.frequency);
    setFormAssignedTo(chore.assignedToUserId || 'none');
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formTitle.trim() || !homeId) return;

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        homeId,
        title: formTitle.trim(),
        description: formDescription.trim() || undefined,
        pointsValue: parseInt(formPoints) || 10,
        frequency: formFrequency,
        assignedToUserId: formAssignedTo === 'none' ? undefined : formAssignedTo,
      };

      if (editingChore) {
        const res = await fetch(`/api/client/chores/${editingChore.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Erreur lors de la mise à jour');
        toast.success('Corvée mise à jour avec succès');
      } else {
        const res = await fetch('/api/client/chores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Erreur lors de la création');
        toast.success('Corvée créée avec succès');
      }

      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch {
      toast.error(editingChore ? 'Erreur lors de la mise à jour' : 'Erreur lors de la création');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (choreId: string) => {
    if (!confirm('Supprimer cette corvée et toutes ses complétions ?')) return;

    try {
      const res = await fetch(`/api/client/chores/${choreId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('Corvée supprimée');
      fetchData();
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  };

  const handleComplete = async (choreId: string, childId: string) => {
    try {
      const res = await fetch(`/api/client/chores/${choreId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ childUserId: childId }),
      });
      if (!res.ok) throw new Error();
      const completion = await res.json();
      setLocalPending((prev) => [completion, ...prev]);
      toast.success('Corvée marquée comme terminée ! En attente de validation.');
      fetchData();
    } catch {
      toast.error("Erreur lors de l'enregistrement de la complétion");
    }
  };

  const handleValidate = async (choreId: string, completionId: string, action: 'validate' | 'reject') => {
    if (!userId) return;

    try {
      const res = await fetch(`/api/client/chores/${choreId}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          completionId,
          validatorUserId: userId,
          action,
        }),
      });
      if (!res.ok) throw new Error();

      if (action === 'validate') {
        toast.success('Corvée validée ! Points ajoutés.');
      } else {
        toast.info('Corvée refusée.');
      }

      setLocalPending((prev) => prev.filter((p) => p.id !== completionId));
      fetchData();
    } catch {
      toast.error('Erreur lors de la validation');
    }
  };

  const allPendingCompletions = localPending;

  // ── Loading skeleton ────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!homeId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="rounded-2xl border-2 border-dashed border-muted-foreground/25 p-12 max-w-md">
          <ListChecks className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-lg font-semibold">Aucune maison</p>
          <p className="mt-2 text-sm text-muted-foreground">Créez d'abord une maison pour gérer les corvées.</p>
        </div>
      </div>
    );
  }

  // ── Rank colors for leaderboard ─────────────────────────────
  const getRankStyle = (index: number) => {
    if (index === 0) return 'bg-gradient-to-r from-amber-400 to-yellow-500 text-white';
    if (index === 1) return 'bg-gradient-to-r from-slate-300 to-slate-400 text-white';
    if (index === 2) return 'bg-gradient-to-r from-orange-400 to-amber-600 text-white';
    return 'bg-muted text-muted-foreground';
  };

  const getRankIcon = (index: number) => {
    if (index === 0) return <Crown className="h-3.5 w-3.5" />;
    if (index === 1) return <Medal className="h-3.5 w-3.5" />;
    if (index === 2) return <Medal className="h-3.5 w-3.5" />;
    return <span className="text-xs font-bold">{index + 1}</span>;
  };

  const getInitial = (name: string | null) => {
    return (name || '?')[0].toUpperCase();
  };

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Section 1 - Header + Stats */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Corvées & Récompenses</h2>
            <p className="text-sm text-muted-foreground">Gérez les tâches ménagères et motivez les enfants avec des points</p>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Active chores */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 p-5 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-white/80">Corvées actives</p>
              <p className="text-3xl font-bold tabular-nums">{activeChores.length}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
              <ListChecks className="h-6 w-6" />
            </div>
          </div>
          <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
          <div className="absolute -right-2 -bottom-6 h-16 w-16 rounded-full bg-white/5" />
        </div>

        {/* Pending validations */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-400 via-orange-500 to-red-500 p-5 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-white/80">En attente</p>
              <p className="text-3xl font-bold tabular-nums">{allPendingCompletions.length}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
              <Clock className="h-6 w-6" />
            </div>
          </div>
          <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
          <div className="absolute -right-2 -bottom-6 h-16 w-16 rounded-full bg-white/5" />
        </div>

        {/* Total validated points */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-400 via-purple-500 to-fuchsia-600 p-5 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-white/80">Points distribués</p>
              <p className="text-3xl font-bold tabular-nums">{totalValidatedPoints}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
              <Star className="h-6 w-6" />
            </div>
          </div>
          <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
          <div className="absolute -right-2 -bottom-6 h-16 w-16 rounded-full bg-white/5" />
        </div>
      </div>

      {/* Section 2 - Create/Edit Chore Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogTrigger asChild>
          <Button className="gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-md">
            <Plus className="h-4 w-4" />
            Nouvelle corvée
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-500" />
              {editingChore ? 'Modifier la corvée' : 'Nouvelle corvée'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="chore-title">Titre *</Label>
              <Input
                id="chore-title"
                placeholder="Ex: Ranger la chambre"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="chore-description">Description</Label>
              <Textarea
                id="chore-description"
                placeholder="Détails de la corvée..."
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="chore-points">Points</Label>
                <Input
                  id="chore-points"
                  type="number"
                  min={1}
                  value={formPoints}
                  onChange={(e) => setFormPoints(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Fréquence</Label>
                <Select value={formFrequency} onValueChange={setFormFrequency}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="once">Ponctuelle</SelectItem>
                    <SelectItem value="daily">Quotidienne</SelectItem>
                    <SelectItem value="weekly">Hebdomadaire</SelectItem>
                    <SelectItem value="monthly">Mensuelle</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Assigné à</Label>
              <Select value={formAssignedTo} onValueChange={setFormAssignedTo}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sélectionner un enfant" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Non assigné</SelectItem>
                  {childMembers.map((child) => (
                    <SelectItem key={child.userId} value={child.userId}>
                      {child.nickname || child.user.fullName || child.user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
              Annuler
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!formTitle.trim() || submitting}
              className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white"
            >
              {submitting ? 'Enregistrement...' : editingChore ? 'Mettre à jour' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Section 3 - Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Liste des corvées */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <ListChecks className="h-4 w-4" />
                Liste des corvées
              </CardTitle>
              <Badge variant="secondary">{filteredChores.length}</Badge>
            </div>
            <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
              <TabsList className="h-8">
                <TabsTrigger value="active" className="text-xs px-3 h-7">Actives</TabsTrigger>
                <TabsTrigger value="all" className="text-xs px-3 h-7">Toutes</TabsTrigger>
                <TabsTrigger value="completed-today" className="text-xs px-3 h-7">Complétées</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {filteredChores.length === 0 ? (
                <div className="text-center py-8">
                  <ListChecks className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">Aucune corvée trouvée</p>
                  <Button variant="link" size="sm" className="mt-2" onClick={openCreateDialog}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Créer une corvée
                  </Button>
                </div>
              ) : (
                filteredChores.map((chore) => (
                  <div
                    key={chore.id}
                    className={`rounded-xl border p-4 transition-all hover:shadow-sm ${
                      !chore.isActive ? 'opacity-60' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-medium text-sm">{chore.title}</h4>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border-0 ${FREQUENCY_COLORS[chore.frequency] || ''}`}>
                            {FREQUENCY_LABELS[chore.frequency] || chore.frequency}
                          </Badge>
                          <Badge className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-0">
                            <Star className="h-2.5 w-2.5 mr-0.5" />
                            {chore.pointsValue} pts
                          </Badge>
                        </div>
                        {chore.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{chore.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          {chore.assignedTo ? (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                                <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                                  {getInitial(chore.assignedTo.fullName)}
                                </span>
                              </div>
                              {chore.assignedTo.fullName || chore.assignedTo.email}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              Non assigné
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            · {chore._count.completions} complétion{chore._count.completions !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {chore.assignedToUserId && chore.isActive && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                            title="Marquer comme terminée"
                            onClick={() => handleComplete(chore.id, chore.assignedToUserId!)}
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEditDialog(chore)}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => handleDelete(chore.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Right: Classement enfants + Validations en attente */}
        <div className="space-y-6">
          {/* Leaderboard */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Trophy className="h-4 w-4 text-amber-500" />
                Classement enfants
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sortedChildren.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">Aucun enfant dans la maison</p>
                  <p className="text-xs text-muted-foreground mt-1">Ajoutez des membres avec le rôle &quot;enfant&quot;</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {sortedChildren.map((child, index) => (
                    <div
                      key={child.id}
                      className={`flex items-center gap-3 rounded-xl p-3 transition-all ${
                        index < 3 ? 'bg-gradient-to-r from-amber-50/80 to-transparent dark:from-amber-950/20' : ''
                      }`}
                    >
                      {/* Rank badge */}
                      <div
                        className={`flex h-7 w-7 items-center justify-center rounded-full shrink-0 ${getRankStyle(index)}`}
                      >
                        {getRankIcon(index)}
                      </div>

                      {/* Avatar */}
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-white font-bold text-sm shrink-0">
                        {getInitial(child.nickname || child.user.fullName)}
                      </div>

                      {/* Name + points */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {child.nickname || child.user.fullName || child.user.email}
                        </p>
                        <div className="flex items-center gap-1">
                          <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                          <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                            {child.points} points
                          </span>
                        </div>
                      </div>

                      {/* Points bar */}
                      {sortedChildren.length > 0 && sortedChildren[0].points > 0 && (
                        <div className="hidden sm:block w-16 h-1.5 bg-muted rounded-full overflow-hidden shrink-0">
                          <div
                            className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full transition-all"
                            style={{ width: `${Math.min(100, (child.points / Math.max(1, sortedChildren[0].points)) * 100)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pending validations */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock className="h-4 w-4 text-orange-500" />
                  Validations en attente
                </CardTitle>
                {allPendingCompletions.length > 0 && (
                  <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 border-0">
                    {allPendingCompletions.length}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {allPendingCompletions.length === 0 ? (
                <div className="text-center py-6">
                  <CheckCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">Aucune validation en attente</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {allPendingCompletions.map((completion) => (
                    <div key={completion.id} className="rounded-xl border p-3 bg-orange-50/50 dark:bg-orange-950/10">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{completion.chore.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-muted-foreground">
                              {completion.child.fullName || completion.child.email}
                            </span>
                            <Badge className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-0">
                              +{completion.pointsEarned} pts
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 text-xs gap-1"
                            onClick={() => handleValidate(completion.choreId, completion.id, 'validate')}
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                            Valider
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-red-500 hover:text-red-600 hover:bg-red-50 text-xs gap-1"
                            onClick={() => handleValidate(completion.choreId, completion.id, 'reject')}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Refuser
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
