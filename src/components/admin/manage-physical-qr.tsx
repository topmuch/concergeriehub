'use client';

import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { QrCode, Search, RotateCcw, Ban, AlertTriangle } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
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

type QrStatus = 'inactive' | 'active' | 'lost' | 'cancelled';

type FilterStatus = 'ALL' | QrStatus;

interface PhysicalQr {
  id: string;
  activationCode: string;
  status: string;
  activatedByUserId: string | null;
  activatedAt: string | null;
  batchId: string;
  batch: {
    id: string;
    quantity: number;
    createdAt: string;
  };
  activatedBy?: { id: string; email: string; fullName: string | null } | null;
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const STATUS_MAP: Record<string, { label: string; variant: 'secondary' | 'default' | 'destructive' | 'outline'; className?: string }> = {
  inactive: { label: 'Inactif', variant: 'secondary' },
  active: { label: 'Actif', variant: 'default', className: 'bg-emerald-600 hover:bg-emerald-700' },
  lost: { label: 'Perdu', variant: 'destructive' },
  cancelled: { label: 'Annulé', variant: 'outline' },
};

const FILTER_OPTIONS: { value: FilterStatus; label: string }[] = [
  { value: 'ALL', label: 'Tous' },
  { value: 'inactive', label: 'Inactif' },
  { value: 'active', label: 'Actif' },
  { value: 'lost', label: 'Perdu' },
  { value: 'cancelled', label: 'Annulé' },
];

type PendingAction = {
  id: string;
  newStatus: QrStatus;
  label: string;
  description: string;
} | null;

function TableSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
    </div>
  );
}

export function ManagePhysicalQr() {
  const [qrs, setQrs] = useState<PhysicalQr[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [updating, setUpdating] = useState(false);

  const fetchQrs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/admin/physical-qr?${params.toString()}`);
      if (!res.ok) throw new Error('Erreur lors du chargement des QR codes');
      const data = await res.json();
      setQrs(Array.isArray(data) ? data : data.data ?? data.qrCodes ?? []);
      if (data.pagination) {
        setPagination(data.pagination);
      } else {
        setPagination({
          page: data.page ?? page,
          limit: data.limit ?? 20,
          total: data.total ?? (Array.isArray(data) ? data.length : 0),
          totalPages: data.totalPages ?? 1,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, page]);

  useEffect(() => {
    fetchQrs();
  }, [fetchQrs]);

  const handleStatusChange = (value: string) => {
    setStatusFilter(value as FilterStatus);
    setPage(1);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleStatusAction = (qr: PhysicalQr, newStatus: QrStatus) => {
    const labels: Record<QrStatus, string> = {
      lost: 'Marquer comme perdu',
      inactive: 'Réinitialiser',
      cancelled: 'Annuler',
      active: 'Activer',
    };
    const descriptions: Record<QrStatus, string> = {
      lost: `Voulez-vous vraiment marquer le code ${qr.activationCode} comme perdu ?`,
      inactive: `Voulez-vous vraiment réinitialiser le code ${qr.activationCode} ? Il redeviendra inactif.`,
      cancelled: `Voulez-vous vraiment annuler le code ${qr.activationCode} ? Cette action est irréversible.`,
      active: `Voulez-vous vraiment activer le code ${qr.activationCode} ?`,
    };
    setPendingAction({
      id: qr.id,
      newStatus,
      label: labels[newStatus],
      description: descriptions[newStatus],
    });
  };

  const confirmAction = async () => {
    if (!pendingAction) return;
    try {
      setUpdating(true);
      const res = await fetch('/api/admin/physical-qr', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: pendingAction.id,
          status: pendingAction.newStatus,
        }),
      });
      if (!res.ok) throw new Error('Erreur lors de la mise à jour');
      setPendingAction(null);
      fetchQrs();
    } catch (err) {
      console.error(err);
    } finally {
      setUpdating(false);
    }
  };

  const getStatusInfo = (status: string) => {
    return STATUS_MAP[status] || { label: status, variant: 'outline' as const };
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>QR codes physiques</CardTitle>
        <CardDescription>
          Gérez et suivez l&apos;état de tous les QR codes physiques
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher un code d'activation..."
              value={search}
              onChange={handleSearchChange}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              {FILTER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Loading */}
        {loading && <TableSkeleton />}

        {/* Error */}
        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <AlertTriangle className="mb-4 h-12 w-12 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={fetchQrs}>
              Réessayer
            </Button>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && qrs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <QrCode className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-medium">Aucun QR code</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Aucun QR code ne correspond à vos critères de recherche.
            </p>
          </div>
        )}

        {/* Table */}
        {!loading && !error && qrs.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code d&apos;activation</TableHead>
                    <TableHead>Lot</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Activé par</TableHead>
                    <TableHead>Date d&apos;activation</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {qrs.map((qr) => {
                    const statusInfo = getStatusInfo(qr.status);
                    return (
                      <TableRow key={qr.id}>
                        <TableCell className="font-mono text-sm font-medium">
                          {qr.activationCode}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {qr.batchId.slice(0, 8)}…
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={statusInfo.variant}
                            className={statusInfo.className}
                          >
                            {statusInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {qr.activatedBy?.email ? (
                            <span className="text-xs">{qr.activatedBy.email}</span>
                          ) : qr.activatedByUserId ? (
                            <span className="font-mono text-xs">
                              {qr.activatedByUserId.slice(0, 8)}…
                            </span>
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {qr.activatedAt
                            ? format(new Date(qr.activatedAt), 'dd MMM yyyy', {
                                locale: fr,
                              })
                            : (
                                <span className="text-muted-foreground/50">—</span>
                              )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {qr.status === 'active' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleStatusAction(qr, 'lost')}
                                title="Marquer perdu"
                              >
                                <AlertTriangle className="h-4 w-4 text-destructive" />
                                <span className="sr-only">Marquer perdu</span>
                              </Button>
                            )}
                            {(qr.status === 'lost' || qr.status === 'cancelled') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleStatusAction(qr, 'inactive')}
                                title="Réinitialiser"
                              >
                                <RotateCcw className="h-4 w-4" />
                                <span className="sr-only">Réinitialiser</span>
                              </Button>
                            )}
                            {(qr.status === 'active' || qr.status === 'inactive') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleStatusAction(qr, 'cancelled')}
                                title="Annuler"
                              >
                                <Ban className="h-4 w-4" />
                                <span className="sr-only">Annuler</span>
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-between pt-4">
                <p className="text-sm text-muted-foreground">
                  Page {pagination.page} sur {pagination.totalPages} —{' '}
                  {pagination.total} résultat{pagination.total > 1 ? 's' : ''}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagination.page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Précédent
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Suivant
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Confirmation Dialog */}
        <AlertDialog
          open={pendingAction !== null}
          onOpenChange={(open) => {
            if (!open) setPendingAction(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{pendingAction?.label}</AlertDialogTitle>
              <AlertDialogDescription>
                {pendingAction?.description}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={updating}>
                Annuler
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmAction}
                disabled={updating}
              >
                {updating ? (
                  <span className="flex items-center gap-2">
                    <RotateCcw className="h-4 w-4 animate-spin" />
                    Mise à jour…
                  </span>
                ) : (
                  'Confirmer'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
