'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { BookOpen, Send, Trash2, MessageCircle } from 'lucide-react';
import type { ModuleProps } from '../types';

interface GuestEntry {
  id: string;
  name: string;
  message: string;
  date: string;
  rating?: number;
}

const DEFAULT_CONTENT = {
  title: "Livre d'or",
  subtitle: 'Partagez votre expérience !',
  entries: [
    { id: '1', name: 'Marie Dupont', message: 'Merci pour ce merveilleux séjour, la maison est magnifique !', date: '2024-12-15', rating: 5 },
    { id: '2', name: 'Jean Martin', message: 'Très bien équipé, tout était parfait. Nous reviendrons !', date: '2024-12-10', rating: 5 },
    { id: '3', name: 'Sophie L.', message: 'Beau cadre,accueil chaleureux. Petit bémol sur le WiFi.', date: '2024-12-05', rating: 4 },
  ] as GuestEntry[],
};

export default function GuestbookModule({ content, onSave }: ModuleProps) {
  const data = { ...DEFAULT_CONTENT, ...content } as typeof DEFAULT_CONTENT & { entries: GuestEntry[] };
  const [entries, setEntries] = useState<GuestEntry[]>(data.entries || []);
  const [newName, setNewName] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [newRating, setNewRating] = useState(5);

  const handleAdd = () => {
    if (!newName.trim() || !newMessage.trim()) return;
    const entry: GuestEntry = {
      id: Date.now().toString(),
      name: newName.trim(),
      message: newMessage.trim(),
      date: new Date().toISOString().split('T')[0],
      rating: newRating,
    };
    const updated = [entry, ...entries];
    setEntries(updated);
    setNewName('');
    setNewMessage('');
    setNewRating(5);
    onSave({ ...content, entries: updated });
  };

  const handleDelete = (id: string) => {
    const updated = entries.filter((e) => e.id !== id);
    setEntries(updated);
    onSave({ ...content, entries: updated });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-950">
              <BookOpen className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <CardTitle className="text-base">{data.title}</CardTitle>
              <p className="text-xs text-muted-foreground">{data.subtitle}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* New entry form */}
          <div className="mb-4 rounded-lg border bg-muted/30 p-4 space-y-3">
            <Input placeholder="Votre nom" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Textarea placeholder="Votre message..." rows={3} value={newMessage} onChange={(e) => setNewMessage(e.target.value)} />
            <div className="flex items-center justify-between">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button key={s} onClick={() => setNewRating(s)} className="text-lg transition-transform hover:scale-125">
                    {s <= newRating ? '⭐' : '☆'}
                  </button>
                ))}
              </div>
              <Button size="sm" onClick={handleAdd} disabled={!newName.trim() || !newMessage.trim()} className="gap-1.5">
                <Send className="h-3.5 w-3.5" /> Envoyer
              </Button>
            </div>
          </div>

          {/* Entries list */}
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {entries.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                <MessageCircle className="h-8 w-8" />
                <p className="text-sm">Aucun message pour le moment</p>
              </div>
            )}
            {entries.map((entry) => (
              <div key={entry.id} className="group relative rounded-lg border p-3 transition-colors hover:bg-muted/30">
                <div className="flex items-start gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-amber-100 text-amber-700 text-xs font-semibold">
                      {entry.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">{entry.name}</p>
                      <p className="text-xs text-muted-foreground">{entry.date}</p>
                    </div>
                    <div className="flex gap-0.5 my-1">{entry.rating && Array.from({ length: entry.rating }).map((_, i) => <span key={i} className="text-xs">⭐</span>)}</div>
                    <p className="text-sm text-muted-foreground">{entry.message}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleDelete(entry.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
