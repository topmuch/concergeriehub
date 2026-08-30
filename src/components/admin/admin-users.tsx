'use client';

import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Users, Search, UserPlus, Loader2 } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

interface User {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
  createdAt: string;
  _count: {
    homeMemberships: number;
    ownedHomes: number;
    createdBatches: number;
  };
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

function RoleBadge({ role }: { role: string }) {
  if (role === 'SUPERADMIN') {
    return (
      <Badge className="bg-purple-600 hover:bg-purple-700">Superadmin</Badge>
    );
  }
  return <Badge variant="default">{role === 'USER' ? 'Utilisateur' : role}</Badge>;
}

function TableSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

export function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);

  // Create user dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: '',
    fullName: '',
    password: '',
    role: 'user' as 'user' | 'superadmin',
  });
  const [createError, setCreateError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);

  const handleCreateUser = async () => {
    if (!createForm.email.trim() || !createForm.fullName.trim() || !createForm.password.trim()) {
      setCreateError('Tous les champs sont requis');
      return;
    }
    if (createForm.password.length < 6) {
      setCreateError('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }

    try {
      setCreateLoading(true);
      setCreateError(null);
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error || 'Erreur lors de la création');
        return;
      }
      setDialogOpen(false);
      setCreateForm({ email: '', fullName: '', password: '', role: 'user' });
      setPage(1);
      fetchUsers();
    } catch {
      setCreateError('Erreur réseau, veuillez réessayer');
    } finally {
      setCreateLoading(false);
    }
  };

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/admin/users?${params.toString()}`);
      if (!res.ok) throw new Error('Erreur lors du chargement des utilisateurs');
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : data.data ?? data.users ?? []);
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
  }, [search, page]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Utilisateurs</CardTitle>
            <CardDescription>
              Liste de tous les utilisateurs inscrits sur la plateforme
            </CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) {
              setCreateError(null);
              setCreateForm({ email: '', fullName: '', password: '', role: 'user' });
            }
          }}>
            <DialogTrigger asChild>
              <Button size="sm">
                <UserPlus className="mr-2 h-4 w-4" />
                Ajouter un utilisateur
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nouvel utilisateur</DialogTitle>
                <DialogDescription>
                  Créer un compte utilisateur sur la plateforme
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                {createError && (
                  <p className="text-sm text-destructive">{createError}</p>
                )}
                <div className="grid gap-2">
                  <Label htmlFor="create-email">Email</Label>
                  <Input
                    id="create-email"
                    type="email"
                    placeholder="user@example.com"
                    value={createForm.email}
                    onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="create-name">Nom complet</Label>
                  <Input
                    id="create-name"
                    placeholder="Jean Dupont"
                    value={createForm.fullName}
                    onChange={(e) => setCreateForm((f) => ({ ...f, fullName: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="create-password">Mot de passe</Label>
                  <Input
                    id="create-password"
                    type="password"
                    placeholder="6 caractères minimum"
                    value={createForm.password}
                    onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="create-role">Rôle</Label>
                  <Select
                    value={createForm.role}
                    onValueChange={(v) => setCreateForm((f) => ({ ...f, role: v as 'user' | 'superadmin' }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Sélectionner un rôle" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">Utilisateur</SelectItem>
                      <SelectItem value="superadmin">Superadmin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={handleCreateUser}
                  disabled={createLoading}
                >
                  {createLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Créer
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher par email ou nom..."
            value={search}
            onChange={handleSearchChange}
            className="pl-9"
          />
        </div>

        {/* Loading */}
        {loading && <TableSkeleton />}

        {/* Error */}
        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={fetchUsers}>
              Réessayer
            </Button>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && users.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-medium">Aucun utilisateur</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Aucun utilisateur ne correspond à votre recherche.
            </p>
          </div>
        )}

        {/* Table */}
        {!loading && !error && users.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Nom</TableHead>
                    <TableHead>Rôle</TableHead>
                    <TableHead className="text-center">Foyers</TableHead>
                    <TableHead className="text-center">QR créés</TableHead>
                    <TableHead>Inscrit le</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">
                        {user.email}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.fullName || '—'}
                      </TableCell>
                      <TableCell>
                        <RoleBadge role={user.role} />
                      </TableCell>
                      <TableCell className="text-center">
                        {user._count.homeMemberships}
                      </TableCell>
                      <TableCell className="text-center">
                        {user._count.createdBatches}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(user.createdAt), 'dd MMM yyyy', {
                          locale: fr,
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
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
      </CardContent>
    </Card>
  );
}
