'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Baby, Dog, Hotel, DoorOpen, Megaphone, ClipboardList,
  Phone, Clock, AlertTriangle, Wifi, Coffee, UtensilsCrossed,
  Key, ShowerHead, Tv, Bed, Trash2, Plus, Send, Heart,
  StickyNote, User, MessageCircle, Moon, Car,
} from 'lucide-react';
import type { ModuleProps } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
//  BABY SITTER
// ═══════════════════════════════════════════════════════════════════════════

const BABY_SITTER_DEFAULT = {
  children: [
    { name: 'Emma', age: '6 ans', allergies: 'Aucune', bedtime: '20h30', notes: 'Aime les histoires avant de dormir. Doudou bleu obligatoire.' },
    { name: 'Lucas', age: '3 ans', allergies: 'Arachides', bedtime: '20h00', notes: 'Porte des couches la nuit. Réveil souvent vers 2h.' },
  ] as { name: string; age: string; allergies: string; bedtime: string; notes: string }[],
  emergencyContacts: [
    { name: 'Maman (Marie)', phone: '+33 6 12 34 56 78' },
    { name: 'Papa (Pierre)', phone: '+33 6 98 76 54 32' },
    { name: 'Pediatre', phone: '+33 1 42 56 78 90' },
  ] as { name: string; phone: string }[],
  routines: {
    dinner: 'Repas vers 19h. Ne pas forcer. Dessert autorisé si repas terminé.',
    bath: 'Bain vers 19h45. Lucas d\'abord, puis Emma. Shampooing dans le placard gauche.',
    bedtime: 'Emma : 20h30 (2 histoires). Lucas : 20h00 (1 chanson).',
    night: 'Si réveil, donner de l\'eau. Ne pas sortir de la chambre.',
  },
  houseRules: 'Porte d\'entrée : verrouiller après 21h. Pas d\'écran après 19h. Ne pas donner de bonbons.',
  snacks: 'Compotes dans le tiroir, biscuits dans le placard haut (attention Lucas).',
  wifiPassword: 'MonWiFi_Maison / MonMotDePasse123!',
};

export function BabySitterModule({ content }: ModuleProps) {
  const data = { ...BABY_SITTER_DEFAULT, ...content } as typeof BABY_SITTER_DEFAULT & { children: typeof BABY_SITTER_DEFAULT.children; emergencyContacts: typeof BABY_SITTER_DEFAULT.emergencyContacts; routines: typeof BABY_SITTER_DEFAULT.routines };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-100 dark:bg-pink-950">
              <Baby className="h-5 w-5 text-pink-500" />
            </div>
            <CardTitle className="text-base">Instructions Baby-sitter</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.children.map((child, i) => (
            <div key={i} className="rounded-lg border p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-pink-100 text-pink-700 text-xs font-bold">{child.name[0]}</div>
                <div>
                  <p className="text-sm font-semibold">{child.name} <span className="text-muted-foreground font-normal">({child.age})</span></p>
                  <p className="text-xs">😴 Coucher : {child.bedtime}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-1">⚠️ Allergies : <span className={child.allergies !== 'Aucune' ? 'text-red-600 font-medium' : ''}>{child.allergies}</span></p>
              <p className="text-xs">📝 {child.notes}</p>
            </div>
          ))}

          <div>
            <h4 className="text-sm font-semibold mb-2">🗓️ Routine du soir</h4>
            <div className="space-y-1.5">
              <div className="flex items-start gap-2 rounded-md bg-muted/50 p-2.5"><UtensilsCrossed className="h-4 w-4 mt-0.5" /><p className="text-sm">{data.routines.dinner}</p></div>
              <div className="flex items-start gap-2 rounded-md bg-muted/50 p-2.5"><ShowerHead className="h-4 w-4 mt-0.5" /><p className="text-sm">{data.routines.bath}</p></div>
              <div className="flex items-start gap-2 rounded-md bg-muted/50 p-2.5"><Bed className="h-4 w-4 mt-0.5" /><p className="text-sm">{data.routines.bedtime}</p></div>
              <div className="flex items-start gap-2 rounded-md bg-muted/50 p-2.5"><Moon className="h-4 w-4 mt-0.5" /><p className="text-sm">{data.routines.night}</p></div>
            </div>
          </div>

          <div className="rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 p-3">
            <p className="text-sm">🚫 <strong>Règles :</strong> {data.houseRules}</p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground mb-1">🍪 Snacks</p><p className="text-sm">{data.snacks}</p></div>
            <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground mb-1">📶 Wi-Fi</p><p className="text-sm font-mono">{data.wifiPassword}</p></div>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-2">📞 Contacts d\'urgence</h4>
            <div className="space-y-1.5">
              {data.emergencyContacts.map((c, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border p-2.5">
                  <span className="text-sm font-medium">{c.name}</span>
                  <Button variant="outline" size="sm" onClick={() => window.open(`tel:${c.phone.replace(/\s/g, '')}`)}>{c.phone}</Button>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  PET SITTER
// ═══════════════════════════════════════════════════════════════════════════

const PET_SITTER_DEFAULT = {
  pets: [
    { name: 'Luna', species: 'Chat', food: '50g croquettes matin + soir dans bol bleu. Eau fraîche quotidienne.', habits: 'Sortie sur balcon 15 min matin et soir. Aime les jeux de plume.', vet: 'Dr. Laurent +33 1 42 56 78 90', medical: 'Stérilisée, vaccinée. Pas de traitement en cours.' },
    { name: 'Max', species: 'Chien', food: '200g croquettes Hill\'s 2x/jour. Pas de restes de table !', habits: '2 promenades/jour (30 min min). Toujours en laisse. Sac de ramassage fourni.', vet: 'Dr. Laurent +33 1 42 56 78 90', medical: 'Allergie poulets. Complément articulation 1 cachet/matin caché dans fromage.' },
  ] as { name: string; species: string; food: string; habits: string; vet: string; medical: string }[],
  emergencyNote: 'En urgence : clinique 24h, 15 avenue des Champs-Élysées.',
  accessNotes: 'Clé sous le pot de fleur à gauche de la porte. Code porte : 4829#.',
};

export function PetSitterModule({ content }: ModuleProps) {
  const data = { ...PET_SITTER_DEFAULT, ...content } as typeof PET_SITTER_DEFAULT & { pets: typeof PET_SITTER_DEFAULT.pets };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-950">
            <Dog className="h-5 w-5 text-amber-600" />
          </div>
          <CardTitle className="text-base">Instructions Pet-sitter</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 p-3">
          <p className="text-sm">🔑 <strong>Accès :</strong> {data.accessNotes}</p>
        </div>
        {data.pets.map((pet, i) => (
          <div key={i} className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center gap-2"><span className="text-xl">{pet.species === 'Chat' ? '🐱' : '🐶'}</span><span className="text-base font-semibold">{pet.name}</span><Badge variant="outline" className="text-[10px]">{pet.species}</Badge></div>
            <div className="flex items-start gap-2 rounded-md bg-muted/50 p-2.5"><span>🍖</span><p className="text-sm">{pet.food}</p></div>
            <div className="flex items-start gap-2 rounded-md bg-muted/50 p-2.5"><span>🎯</span><p className="text-sm">{pet.habits}</p></div>
            <div className="flex items-start gap-2 rounded-md bg-muted/50 p-2.5"><span>🩺</span><p className="text-sm">{pet.medical}</p></div>
            <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Vétérinaire : {pet.vet}</span><Button variant="outline" size="sm" onClick={() => { const phone = pet.vet.match(/\+33[\s\d]+/)?.[0]; if (phone) window.open(`tel:${phone.replace(/\s/g, '')}`); }}>Appeler</Button></div>
          </div>
        ))}
        {data.emergencyNote && <div className="rounded-lg border-2 border-red-200 bg-red-50 dark:bg-red-950/30 p-3"><p className="text-sm">🚨 {data.emergencyNote}</p></div>}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  RENTAL GUEST
// ═══════════════════════════════════════════════════════════════════════════

const RENTAL_GUEST_DEFAULT = {
  propertyName: 'Appartement Dupont',
  checkIn: '15h00',
  checkOut: '11h00',
  accessCode: '4829#',
  wifi: 'MonWiFi_Maison / MonMotDePasse123!',
  parking: 'Place n°12 dans le parking souterrain (accès par rue latérale, code 1234)',
  trash: 'Poubelles dans le local poubelle, rez-de-chaussée. Tri : jaune (emballages), vert (verre), gris (ordures).',
  heating: 'Thermostat dans le salon. Réglage conseillé : 21°C. Ne pas dépasser 24°C.',
  appliances: 'Lave-linge : buanderie. Sèche-linge à côté. Lave-vaisselle : cuisine.',
  departure: 'Vider le réfrigérateur, sortir les poubelles, ranger, laisser les clés sur la table.',
  contact: 'Pierre Dupont : +33 6 12 34 56 78',
};

export function RentalGuestModule({ content }: ModuleProps) {
  const data = { ...RENTAL_GUEST_DEFAULT, ...content } as typeof RENTAL_GUEST_DEFAULT;

  const sections = [
    { icon: <Clock className="h-4 w-4" />, title: 'Arrivée/Départ', content: `Arrivée à partir de ${data.checkIn} · Départ avant ${data.checkOut}` },
    { icon: <Key className="h-4 w-4" />, title: 'Accès', content: `Code porte : ${data.accessCode}` },
    { icon: <Wifi className="h-4 w-4" />, title: 'Wi-Fi', content: data.wifi },
    { icon: <Car className="h-4 w-4" />, title: 'Parking', content: data.parking },
    { icon: <Trash2 className="h-4 w-4" />, title: 'Poubelles', content: data.trash },
    { icon: <Coffee className="h-4 w-4" />, title: 'Chauffage', content: data.heating },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-100 dark:bg-teal-950">
            <Hotel className="h-5 w-5 text-teal-500" />
          </div>
          <div>
            <CardTitle className="text-base">{data.propertyName}</CardTitle>
            <p className="text-xs text-muted-foreground">Guide du locataire</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {sections.map((s, i) => (
          <div key={i} className="flex items-start gap-3 rounded-lg border p-3">
            <div className="mt-0.5 text-muted-foreground">{s.icon}</div>
            <div><p className="text-sm font-medium">{s.title}</p><p className="text-sm text-muted-foreground">{s.content}</p></div>
          </div>
        ))}
        <div className="rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 p-3">
          <p className="text-sm font-medium">📋 Au départ</p>
          <p className="text-sm text-muted-foreground">{data.departure}</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.open(`tel:${data.contact.match(/\+33[\s\d]+/)?.[0]?.replace(/\s/g, '')}`)}>
          <Phone className="h-3.5 w-3.5" /> {data.contact}
        </Button>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  AIRBNB GUEST
// ═══════════════════════════════════════════════════════════════════════════

const AIRBNB_GUEST_DEFAULT = {
  welcome: 'Bienvenue dans notre chez-nous ! 🏠',
  host: { name: 'Pierre & Marie', responseTime: 'En général sous 30 min', phone: '+33 6 12 34 56 78' },
  checkIn: { time: '15h00', instructions: 'Code porte : 4829#. Clés dans la boîte à clés à gauche de l\'entrée.' },
  wifi: { ssid: 'MonWiFi_Maison', password: 'MonMotDePasse123!' },
  houseManual: 'Cuisine équipée, lave-linge, sèche-linge, lave-vaisselle. Produits de base fournis.',
  neighborhood: 'Boulangerie (100m), métro Vaneau (5 min), supermarché (200m), restaurants rue de Sèvres.',
  checkout: 'Départ avant 11h. Laissez les clés sur la table, fermez les fenêtres.',
  houseRules: ['Pas de fumeur', 'Pas de fêtes', 'Animaux acceptés sur demande', 'Silence après 22h'],
};

export function AirbnbGuestModule({ content }: ModuleProps) {
  const data = { ...AIRBNB_GUEST_DEFAULT, ...content } as typeof AIRBNB_GUEST_DEFAULT;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 dark:bg-rose-950">
              <DoorOpen className="h-5 w-5 text-rose-600" />
            </div>
            <div>
              <CardTitle className="text-base">Guide invité Airbnb</CardTitle>
              <p className="text-xs text-muted-foreground">{data.welcome}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-2"><User className="h-4 w-4" /><div><p className="text-sm font-medium">{data.host.name}</p><p className="text-xs text-muted-foreground">{data.host.responseTime}</p></div></div>
            <Button variant="outline" size="sm" onClick={() => window.open(`tel:${data.host.phone.replace(/\s/g, '')}`)}><Phone className="h-3.5 w-3.5 mr-1" />Contacter</Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground mb-1">🕐 Arrivée</p><p className="text-sm">{data.checkIn.time} — {data.checkIn.instructions}</p></div>
            <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground mb-1">📶 Wi-Fi</p><p className="text-sm font-mono">{data.wifi.ssid} / {data.wifi.password}</p></div>
          </div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground mb-1">📖 Maison</p><p className="text-sm">{data.houseManual}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground mb-1">📍 Quartier</p><p className="text-sm">{data.neighborhood}</p></div>
          <div className="rounded-lg bg-muted/50 p-3"><p className="text-sm">📋 <strong>Départ :</strong> {data.checkout}</p></div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1.5">Règles de la maison</p>
            <div className="flex flex-wrap gap-1.5">{data.houseRules.map((r, i) => <Badge key={i} variant="outline" className="text-xs">{r}</Badge>)}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  ANNOUNCEMENT
// ═══════════════════════════════════════════════════════════════════════════

const ANNOUNCEMENT_DEFAULT = {
  title: 'Maintenance de l\'ascenseur',
  message: 'L\'ascenseur sera en maintenance le 24 décembre de 9h à 17h. Merci de prévoir vos déplacements en conséquence. Nous nous excusons pour la gêne occasionnée.',
  priority: 'high' as 'low' | 'medium' | 'high',
  date: '2024-12-20',
  author: 'Syndic',
};

const PRIORITY_STYLES = { low: 'border-slate-200', medium: 'border-yellow-200', high: 'border-orange-300 bg-orange-50/50' };
const PRIORITY_BADGE = { low: 'bg-slate-100 text-slate-600', medium: 'bg-yellow-100 text-yellow-700', high: 'bg-red-100 text-red-700' };
const PRIORITY_LABEL = { low: 'Basse', medium: 'Moyenne', high: 'Haute' };

export function AnnouncementModule({ content }: ModuleProps) {
  const data = { ...ANNOUNCEMENT_DEFAULT, ...content } as typeof ANNOUNCEMENT_DEFAULT;

  return (
    <Card className={PRIORITY_STYLES[data.priority]}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 dark:bg-orange-950">
              <Megaphone className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <CardTitle className="text-base">{data.title}</CardTitle>
              <p className="text-xs text-muted-foreground">{data.author} · {data.date}</p>
            </div>
          </div>
          <Badge className={PRIORITY_BADGE[data.priority]}>{PRIORITY_LABEL[data.priority]}</Badge>
        </div>
      </CardHeader>
      <CardContent><p className="text-sm leading-relaxed">{data.message}</p></CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  FAMILY BOARD
// ═══════════════════════════════════════════════════════════════════════════

const FAMILY_BOARD_DEFAULT = {
  messages: [
    { id: '1', author: 'Maman', text: 'Pensez à acheter le gâteau pour l\'anniversaire d\'Emma !', date: '2024-12-20', color: 'bg-pink-50 border-pink-200' },
    { id: '2', author: 'Papa', text: 'J\'ai réservé le restaurant pour vendredi 20h. Table pour 6.', date: '2024-12-19', color: 'bg-blue-50 border-blue-200' },
    { id: '3', author: 'Emma', text: 'Merci pour les cadeaux ! 🎉🎉🎉', date: '2024-12-18', color: 'bg-purple-50 border-purple-200' },
    { id: '4', author: 'Lucas', text: 'J\'ai perdu mon doudou bleu 😢', date: '2024-12-18', color: 'bg-green-50 border-green-200' },
  ] as { id: string; author: string; text: string; date: string; color: string }[],
};

export function FamilyBoardModule({ content, onSave }: ModuleProps) {
  const data = { ...FAMILY_BOARD_DEFAULT, ...content } as typeof FAMILY_BOARD_DEFAULT & { messages: { id: string; author: string; text: string; date: string; color: string }[] };
  const [messages, setMessages] = useState(data.messages);
  const [newMsg, setNewMsg] = useState('');
  const [newAuthor, setNewAuthor] = useState('');

  const COLORS = ['bg-pink-50 border-pink-200', 'bg-blue-50 border-blue-200', 'bg-green-50 border-green-200', 'bg-yellow-50 border-yellow-200', 'bg-purple-50 border-purple-200'];

  const addMsg = () => {
    if (!newMsg.trim() || !newAuthor.trim()) return;
    const updated = [{ id: Date.now().toString(), author: newAuthor.trim(), text: newMsg.trim(), date: new Date().toISOString().split('T')[0], color: COLORS[messages.length % COLORS.length] }, ...messages];
    setMessages(updated);
    setNewMsg(''); setNewAuthor('');
    onSave({ ...content, messages: updated });
  };

  const deleteMsg = (id: string) => {
    const updated = messages.filter(m => m.id !== id);
    setMessages(updated);
    onSave({ ...content, messages: updated });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-950">
            <ClipboardList className="h-5 w-5 text-indigo-600" />
          </div>
          <CardTitle className="text-base">Tableau familial</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg border p-3 space-y-2">
          <div className="flex gap-2">
            <Input placeholder="Votre prénom" value={newAuthor} onChange={e => setNewAuthor(e.target.value)} className="w-32" />
            <Input placeholder="Votre message..." value={newMsg} onChange={e => setNewMsg(e.target.value)} onKeyDown={e => e.key === 'Enter' && addMsg()} className="flex-1" />
            <Button size="icon" onClick={addMsg}><Send className="h-4 w-4" /></Button>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 max-h-96 overflow-y-auto">
          {messages.map(msg => (
            <div key={msg.id} className={`group relative rounded-lg border p-3 ${msg.color}`}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold">{msg.author}</p>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">{msg.date}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => deleteMsg(msg.id)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </div>
              <p className="text-sm">{msg.text}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
