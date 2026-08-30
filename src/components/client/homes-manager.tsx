'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Home, Plus, Edit, Trash2, Users, QrCode, DoorOpen } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';

interface HomeData {
  id: string;
  name: string;
  address: string | null;
  isActive: boolean;
  createdAt: string;
  _count?: { rooms: number; members: number; qrCodes: number };
}

interface MemberData {
  id: string;
  role: string;
  nickname: string | null;
  points: number;
  user?: { fullName: string | null; email: string } | null;
}

export function HomesManager() {
  const [homes, setHomes] = useState<HomeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedHome, setSelectedHome] = useState<HomeData | null>(null);
  const [members, setMembers] = useState<MemberData[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviting, setInviting] = useState(false);
  const [deleteHome, setDeleteHome] = useState<HomeData | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchHomes = () => {
    fetch('/api/client/homes')
      .then((r) => r.json())
      .then((d) => setHomes(d.homes || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchHomes(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await fetch('/api/client/homes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, address: newAddress || undefined }),
      });
      toast.success(`Maison « ${newName} » créée`);
      setNewName(''); setNewAddress(''); setCreateOpen(false);
      fetchHomes();
    } catch { toast.error('Erreur lors de la création'); }
    finally { setCreating(false); }
  };

  const [membersLoading, setMembersLoading] = useState(false);

  const fetchMembers = async (homeId: string) => {
    setMembersLoading(true);
    try {
      const res = await fetch(`/api/client/homes/${homeId}/members`);
      const data = await res.json();
      setMembers(data.members || []);
    } catch {
      setMembers([]);
    } finally { setMembersLoading(false); }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !selectedHome) return;
    setInviting(true);
    try {
      const res = await fetch(`/api/client/homes/${selectedHome.id}/members`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`${inviteEmail} invité avec succès`);
      setInviteEmail(''); fetchMembers(selectedHome.id);
    } catch (e: any) { toast.error(e.message || 'Erreur lors de l\'invitation'); }
    finally { setInviting(false); }
  };

  const handleDelete = async () => {
    if (!deleteHome) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/client/homes?id=${deleteHome.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        toast.success(`Maison « ${deleteHome.name} » supprimée`);
        setHomes((h) => h.filter((x) => x.id !== deleteHome.id));
      }
    } catch {
      toast.error('Erreur lors de la suppression');
    } finally {
      setDeleting(false);
      setDeleteHome(null);
    }
  };

  const roleBadge = (role: string) => {
    switch (role) {
      case 'owner': return <Badge className="bg-amber-500/15 text-amber-700">Propriétaire</Badge>;
      case 'admin': return <Badge className="bg-violet-500/15 text-violet-700">Admin</Badge>;
      case 'child': return <Badge className="bg-emerald-500/15 text-emerald-700">Enfant</Badge>;
      default: return <Badge variant="secondary">Membre</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Mes maisons</h2>
          <p className="text-muted-foreground">Gérez vos foyers et invitez des membres.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Nouvelle maison</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Créer une maison</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2"><Label>Nom de la maison</Label><Input placeholder="ex: Ma Maison Dakar" value={newName} onChange={(e) => setNewName(e.target.value)} /></div>
              <div className="space-y-2"><Label>Adresse (optionnel)</Label><Input placeholder="ex: Dakar, Sénégal" value={newAddress} onChange={(e) => setNewAddress(e.target.value)} /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>Annuler</Button><Button onClick={handleCreate} disabled={creating || !newName.trim()}>{creating ? 'Création...' : 'Créer'}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => (<Card key={i}><CardContent className="p-6"><Skeleton className="h-6 w-40 mb-3" /><Skeleton className="h-4 w-24" /></CardContent></Card>))}</div>) : homes.length === 0 ? (
        <Card><CardContent className="py-16 text-center"><Home className="h-12 w-12 mx-auto mb-4 text-muted-foreground" /><h3 className="text-lg font-semibold mb-1">Aucune maison</h3><p className="text-sm text-muted-foreground mb-4">Commencez par créer votre première maison.</p><Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />Créer ma maison</Button></CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {homes.map((home) => (
            <Card key={home.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10"><Home className="h-5 w-5 text-emerald-600" /></div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setSelectedHome(home); fetchMembers(home.id); }}><Users className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteHome(home)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
                <h3 className="font-semibold mb-1">{home.name}</h3>
                <p className="text-xs text-muted-foreground mb-4">{home.address || 'Aucune adresse'}</p>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><DoorOpen className="h-3 w-3" />{home._count?.rooms || 0} pièces</span>
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" />{home._count?.members || 0} membres</span>
                  <span className="flex items-center gap-1"><QrCode className="h-3 w-3" />{home._count?.qrCodes || 0} QR</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Members Dialog */}
      <Dialog open={!!selectedHome} onOpenChange={(o) => !o && setSelectedHome(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Membres de {selectedHome?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-60 overflow-y-auto py-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted"><span className="text-xs font-bold">{(m.user?.fullName || m.nickname || '?')[0].toUpperCase()}</span></div>
                  <div><p className="text-sm font-medium">{m.user?.fullName || m.nickname || 'Sans nom'}</p><p className="text-xs text-muted-foreground">{m.user?.email || ''}</p></div>
                </div>
                <div className="flex items-center gap-2">{roleBadge(m.role)}{m.points > 0 && <span className="text-xs text-muted-foreground">{m.points} pts</span>}</div>
              </div>
            ))}
          </div>
          <Separator />
          <div>
            <p className="text-sm font-medium mb-3">Inviter un membre</p>
            <div className="flex gap-2">
              <Input placeholder="email@exemple.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="flex-1" />
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm">
                <option value="member">Membre</option><option value="admin">Admin</option><option value="child">Enfant</option>
              </select>
              <Button onClick={handleInvite} disabled={inviting || !inviteEmail.includes('@')}>{inviting ? '...' : 'Inviter'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteHome} onOpenChange={() => setDeleteHome(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Supprimer cette maison ?</AlertDialogTitle><AlertDialogDescription>Cette action est irréversible. Tous les QR codes, pièces et données associés seront définitivement supprimés.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel><AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground">{deleting ? 'Suppression...' : 'Supprimer'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
