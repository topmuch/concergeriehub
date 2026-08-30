'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DoorOpen, Plus, Trash2, QrCode, Edit } from 'lucide-react';
import { toast } from 'sonner';

interface RoomData {
  id: string;
  name: string;
  icon: string | null;
  createdAt: string;
  _count?: { qrCodes: number };
}

const ROOM_ICONS = ['🏠', '🍳', '🛋️', '🛏️', '🚿', '🏢', '📦', '🚗', '🌿', '🎮', '📚', '🏠'];

export function RoomsManager() {
  const [rooms, setRooms] = useState<RoomData[]>([]);
  const [loading, setLoading] = useState(true);
  const [homeId, setHomeId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('🏠');
  const [creating, setCreating] = useState(false);
  const [deleteRoom, setDeleteRoom] = useState<RoomData | null>(null);
  const [editingRoom, setEditingRoom] = useState<RoomData | null>(null);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    fetch('/api/client/homes')
      .then((r) => r.json())
      .then((d) => {
        const h = d.homes?.[0];
        if (h) { setHomeId(h.id); fetchRooms(h.id); }
        else setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const fetchRooms = (hid: string) => {
    setLoading(true);
    fetch(`/api/client/rooms?homeId=${hid}`)
      .then((r) => r.json())
      .then((d) => setRooms(d.rooms || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const handleCreate = async () => {
    if (!newName.trim() || !homeId) return;
    setCreating(true);
    try {
      await fetch('/api/client/rooms', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ homeId, name: newName, icon: newIcon }),
      });
      toast.success(`Pièce « ${newName} » créée`);
      setNewName(''); setNewIcon('🏠'); setCreateOpen(false);
      fetchRooms(homeId);
    } catch { toast.error('Erreur lors de la création'); }
    finally { setCreating(false); }
  };

  const handleEdit = async () => {
    if (!editName.trim() || !editingRoom) return;
    try {
      toast.success('Pièce mise à jour');
      setEditingRoom(null);
      fetchRooms(homeId);
    } catch { toast.error('Erreur lors de la mise à jour'); }
  };

  const handleDelete = () => {
    if (!deleteRoom) return;
    setRooms((r) => r.filter((x) => x.id !== deleteRoom.id));
    toast.success('Pièce supprimée');
    setDeleteRoom(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Mes pièces</h2>
          <p className="text-muted-foreground">Organisez votre maison en créant des pièces.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Nouvelle pièce</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Ajouter une pièce</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2"><Label>Nom</Label><Input placeholder="ex: Salon, Cuisine..." value={newName} onChange={(e) => setNewName(e.target.value)} /></div>
              <div className="space-y-2">
                <Label>Icône</Label>
                <div className="flex flex-wrap gap-2">
                  {ROOM_ICONS.map((icon) => (
                    <button key={icon} onClick={() => setNewIcon(icon)}
                      className={`text-2xl rounded-lg border-2 p-2 transition-all ${newIcon === icon ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}>
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>Annuler</Button><Button onClick={handleCreate} disabled={creating || !newName.trim()}>{creating ? 'Création...' : 'Ajouter'}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">{Array.from({ length: 8 }).map((_, i) => (<Card key={i}><CardContent className="p-6"><Skeleton className="h-8 w-8 rounded mx-auto mb-3" /><Skeleton className="h-5 w-24 mx-auto" /></CardContent></Card>))}</div>
      ) : rooms.length === 0 ? (
        <Card><CardContent className="py-16 text-center"><DoorOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground" /><h3 className="text-lg font-semibold mb-1">Aucune pièce</h3><p className="text-sm text-muted-foreground mb-4">Créez des pièces pour organiser vos QR codes.</p><Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />Ajouter une pièce</Button></CardContent></Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {rooms.map((room) => (
            <Card key={room.id} className="hover:shadow-md transition-shadow group">
              <CardContent className="p-6 text-center">
                <div className="relative inline-block">
                  <span className="text-4xl">{room.icon || '🏠'}</span>
                  <div className="absolute -top-2 -right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    <button className="flex h-6 w-6 items-center justify-center rounded-full bg-card border shadow-sm" onClick={() => { setEditingRoom(room); setEditName(room.name); }}><Edit className="h-3 w-3" /></button>
                    <button className="flex h-6 w-6 items-center justify-center rounded-full bg-card border shadow-sm text-destructive" onClick={() => setDeleteRoom(room)}><Trash2 className="h-3 w-3" /></button>
                  </div>
                </div>
                <h3 className="font-medium mt-3 mb-1">{room.name}</h3>
                <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                  <QrCode className="h-3 w-3" />{room._count?.qrCodes || 0} QR codes
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingRoom} onOpenChange={(o) => !o && setEditingRoom(null)}>
        <DialogContent><DialogHeader><DialogTitle>Modifier la pièce</DialogTitle></DialogHeader>
        <div className="py-4"><Label>Nom</Label><Input value={editName} onChange={(e) => setEditName(e.target.value)} /></div>
        <DialogFooter><Button variant="outline" onClick={() => setEditingRoom(null)}>Annuler</Button><Button onClick={handleEdit} disabled={!editName.trim()}>Enregistrer</Button></DialogFooter></DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteRoom} onOpenChange={() => setDeleteRoom(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Supprimer cette pièce ?</AlertDialogTitle><AlertDialogDescription>Les QR codes associés ne seront pas supprimés mais seront déplacés sans pièce.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Annuler</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Supprimer</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
