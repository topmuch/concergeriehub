'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ChefHat, Tv, Music, Gamepad2, BookImage, Camera,
  Clock, Users, Star, Plus, Heart, Play, ListMusic,
  Dices, BookOpen, Image as ImageIcon,
} from 'lucide-react';
import type { ModuleProps } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
//  RECIPE
// ═══════════════════════════════════════════════════════════════════════════

const RECIPE_DEFAULT = {
  title: 'Gratin dauphinois',
  description: 'Un classique de la cuisine française, onctueux et réconfortant.',
  servings: 6,
  prepTime: '30 min',
  cookTime: '1h',
  difficulty: 'Facile',
  ingredients: [
    '1.5 kg de pommes de terre',
    '500 ml de crème fraîche',
    '300 ml de lait',
    '2 gousses d\'ail',
    '100 g de gruyère râpé',
    '30 g de beurre',
    'Muscade, sel, poivre',
  ],
  steps: [
    'Préchauffer le four à 180°C.',
    'Éplucher et couper les pommes de terre en fines rondelles (3 mm).',
    'Frotter un plat à gratin avec l\'ail et le beurre.',
    'Disposer les rondelles de pommes de terre en couches superposées.',
    'Mélanger la crème, le lait, la muscade, le sel et le poivre.',
    'Verser le mélange sur les pommes de terre.',
    'Parsemer de gruyère râpé.',
    'Enfourner 1h jusqu\'à ce que le dessus soit bien doré.',
  ],
  tips: 'Laissez reposer 10 min avant de servir. Accompagnez d\'une salade verte.',
  rating: 4,
};

export function RecipeModule({ content }: ModuleProps) {
  const data = { ...RECIPE_DEFAULT, ...content } as typeof RECIPE_DEFAULT & { ingredients: string[]; steps: string[] };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 dark:bg-rose-950">
            <ChefHat className="h-5 w-5 text-rose-500" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-base">{data.title}</CardTitle>
            <p className="text-xs text-muted-foreground">{data.description}</p>
          </div>
          <div className="flex items-center gap-1">{Array.from({ length: 5 }).map((_, i) => <Star key={i} className={`h-4 w-4 ${i < data.rating ? 'text-yellow-400 fill-yellow-400' : 'text-muted'}`} />)}</div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3 text-sm">
          <Badge variant="outline">⏱️ Prépa : {data.prepTime}</Badge>
          <Badge variant="outline">🔥 Cuisson : {data.cookTime}</Badge>
          <Badge variant="outline">👥 {data.servings} pers.</Badge>
          <Badge variant="outline">📊 {data.difficulty}</Badge>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h4 className="text-sm font-semibold mb-2">🥘 Ingrédients</h4>
            <ul className="space-y-1">
              {data.ingredients.map((ing, i) => (
                <li key={i} className="flex items-center gap-2 text-sm"><span className="h-1.5 w-1.5 rounded-full bg-rose-400" />{ing}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold mb-2">👩‍🍳 Préparation</h4>
            <ol className="space-y-2">
              {data.steps.map((step, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold shrink-0">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
        {data.tips && <div className="rounded-lg bg-rose-50 dark:bg-rose-950/30 p-3"><p className="text-sm">💡 {data.tips}</p></div>}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  ENTERTAINMENT
// ═══════════════════════════════════════════════════════════════════════════

const ENTERTAINMENT_DEFAULT = {
  tvModel: 'Samsung QLED 65"',
  remoteLocation: 'Tiroir du meuble TV',
  howToWatch: 'Télécommande Samsung → Bouton "Source" → Sélectionner HDMI 1, 2 ou 3.',
  netflixLogin: 'Voir l\'application Netflix sur la Smart TV',
  streaming: [
    { name: 'Netflix', icon: '🎬', available: true },
    { name: 'YouTube', icon: '▶️', available: true },
    { name: 'Spotify', icon: '🎵', available: true },
    { name: 'Disney+', icon: '🏰', available: true },
    { name: 'Canal+', icon: '📺', available: false },
  ] as { name: string; icon: string; available: boolean }[],
  speakers: 'Enceinte Bluetooth JBL dans le placard TV. Appairer avec le bouton Bluetooth de la télécommande.',
  soundbar: 'Samsung Soundbar Q800T. Télécommande dédiée dans le 2ème tiroir.',
  volumeNote: 'Merci de garder le volume modéré après 22h.',
};

export function EntertainmentModule({ content }: ModuleProps) {
  const data = { ...ENTERTAINMENT_DEFAULT, ...content } as typeof ENTERTAINMENT_DEFAULT & { streaming: { name: string; icon: string; available: boolean }[] };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 dark:bg-purple-950">
            <Tv className="h-5 w-5 text-purple-500" />
          </div>
          <div>
            <CardTitle className="text-base">Divertissement</CardTitle>
            <p className="text-xs text-muted-foreground">{data.tvModel}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg bg-muted/50 p-3"><p className="text-sm">📺 {data.howToWatch}</p></div>
        <div>
          <p className="text-sm font-semibold mb-2">Services de streaming</p>
          <div className="flex flex-wrap gap-2">
            {data.streaming.map((s, i) => (
              <Badge key={i} variant={s.available ? 'default' : 'outline'} className="gap-1 text-xs">{s.icon} {s.name}</Badge>
            ))}
          </div>
        </div>
        <div className="rounded-lg border p-3"><p className="text-sm">🔊 {data.speakers}</p></div>
        {data.soundbar && <div className="rounded-lg border p-3"><p className="text-sm">🎶 {data.soundbar}</p></div>}
        {data.volumeNote && <p className="text-xs text-muted-foreground italic">⚠️ {data.volumeNote}</p>}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  MUSIC ROOM
// ═══════════════════════════════════════════════════════════════════════════

const MUSIC_DEFAULT = {
  equipment: [
    { name: 'Piano numérique Yamaha P-125', type: 'Clavier', status: 'Fonctionnel' },
    { name: 'Guitare acoustique Taylor', type: 'Cordes', status: 'Fonctionnel' },
    { name: 'Enceinte Sonos One', type: 'Audio', status: 'Fonctionnel' },
  ] as { name: string; type: string; status: string }[],
  instruments: 'Guitare : accordeur dans le 1er tiroir. Piano : allumé, veuillez éteindre après utilisation.',
  speakers: 'Sonos : contrôlable via l\'application Sonos. Playlist "Jazz Evening" en favori.',
  rules: 'Instrument après 22h interdit. Merci d\'utiliser le casque fourni si besoin.',
  playlist: [
    { name: 'Jazz Evening', mood: 'Relaxant' },
    { name: 'Classique Matin', mood: 'Concentration' },
    { name: 'Soirée Vinyles', mood: 'Festif' },
  ] as { name: string; mood: string }[],
};

export function MusicRoomModule({ content }: ModuleProps) {
  const data = { ...MUSIC_DEFAULT, ...content } as typeof MUSIC_DEFAULT & { equipment: { name: string; type: string; status: string }[]; playlist: { name: string; mood: string }[] };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-fuchsia-100 dark:bg-fuchsia-950">
            <Music className="h-5 w-5 text-fuchsia-600" />
          </div>
          <CardTitle className="text-base">Salle de musique</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          {data.equipment.map((e, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg border p-2.5">
              <div><p className="text-sm font-medium">🎵 {e.name}</p><p className="text-xs text-muted-foreground">{e.type}</p></div>
              <Badge variant="outline" className="text-[10px]">{e.status}</Badge>
            </div>
          ))}
        </div>
        <div className="rounded-lg bg-muted/50 p-3"><p className="text-sm">🎸 {data.instruments}</p></div>
        <div className="rounded-lg bg-muted/50 p-3"><p className="text-sm">🔊 {data.speakers}</p></div>
        {data.playlist.length > 0 && (
          <div>
            <p className="text-sm font-semibold mb-1.5">Playlists suggérées</p>
            <div className="flex flex-wrap gap-1.5">{data.playlist.map((p, i) => <Badge key={i} variant="outline" className="text-xs">{p.name} · {p.mood}</Badge>)}</div>
          </div>
        )}
        <div className="rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 p-3"><p className="text-sm">⚠️ {data.rules}</p></div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  GAME ROOM
// ═══════════════════════════════════════════════════════════════════════════

const GAME_DEFAULT = {
  consoles: [
    { name: 'PlayStation 5', icon: '🎮', controllers: '2 manettes chargées', notes: 'Allumer avec la télécommande TV (HDMI 1)' },
    { name: 'Nintendo Switch', icon: '🕹️', controllers: '2 Joy-Con', notes: 'Dock sur le meuble, connecté au HDMI 2' },
  ] as { name: string; icon: string; controllers: string; notes: string }[],
  boardGames: [
    { name: 'Les Aventuriers du Rail', players: '2-5', time: '30-60 min' },
    { name: 'Azul', players: '2-4', time: '30-45 min' },
    { name: 'Dixit', players: '3-6', time: '30 min' },
    { name: 'Catan', players: '3-4', time: '60-90 min' },
    { name: 'Uno', players: '2-10', time: '15 min' },
  ] as { name: string; players: string; time: string }[],
  rules: 'Ranger les jeux après utilisation. Pas de nourriture près des consoles. Extinction à 23h.',
};

export function GameRoomModule({ content }: ModuleProps) {
  const data = { ...GAME_DEFAULT, ...content } as typeof GAME_DEFAULT & { consoles: { name: string; icon: string; controllers: string; notes: string }[]; boardGames: { name: string; players: string; time: string }[] };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950">
            <Gamepad2 className="h-5 w-5 text-emerald-500" />
          </div>
          <CardTitle className="text-base">Salle de jeux</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm font-semibold mb-2">Consoles</p>
          <div className="space-y-1.5">{data.consoles.map((c, i) => (
            <div key={i} className="rounded-lg border p-3"><div className="flex items-center gap-2 mb-1"><span className="text-lg">{c.icon}</span><span className="text-sm font-medium">{c.name}</span><Badge variant="outline" className="text-[10px] ml-auto">{c.controllers}</Badge></div><p className="text-xs text-muted-foreground">{c.notes}</p></div>
          ))}</div>
        </div>
        <div>
          <p className="text-sm font-semibold mb-2">🎲 Jeux de société</p>
          <div className="grid gap-1.5 sm:grid-cols-2">{data.boardGames.map((g, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg border p-2.5"><div><p className="text-sm font-medium">{g.name}</p><p className="text-xs text-muted-foreground">👥 {g.players}</p></div><span className="text-[10px] text-muted-foreground">⏱️ {g.time}</span></div>
          ))}</div>
        </div>
        <div className="rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 p-3"><p className="text-sm">⚠️ {data.rules}</p></div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  LIBRARY
// ═══════════════════════════════════════════════════════════════════════════

const LIBRARY_DEFAULT = {
  books: [
    { id: '1', title: 'Le Petit Prince', author: 'Antoine de Saint-Exupéry', genre: 'Classique', available: true },
    { id: '2', title: 'L\'Étranger', author: 'Albert Camus', genre: 'Roman', available: true },
    { id: '3', title: 'Sapiens', author: 'Yuval Noah Harari', genre: 'Essai', available: false, borrower: 'Emma' },
    { id: '4', title: 'Le Seigneur des Anneaux', author: 'J.R.R. Tolkien', genre: 'Fantasy', available: true },
    { id: '5', title: 'Clean Code', author: 'Robert C. Martin', genre: 'Informatique', available: false, borrower: 'Pierre' },
  ] as { id: string; title: string; author: string; genre: string; available: boolean; borrower?: string }[],
  rules: 'Signalez les emprunts. Ne pas écrire dans les livres. Merci de les remettre en place.',
};

export function LibraryModule({ content }: ModuleProps) {
  const data = { ...LIBRARY_DEFAULT, ...content } as typeof LIBRARY_DEFAULT & { books: { id: string; title: string; author: string; genre: string; available: boolean; borrower?: string }[] };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-950">
            <BookImage className="h-5 w-5 text-amber-800" />
          </div>
          <div>
            <CardTitle className="text-base">Bibliothèque</CardTitle>
            <p className="text-xs text-muted-foreground">{data.books.filter(b => b.available).length} disponible(s) sur {data.books.length}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="space-y-1.5 max-h-96 overflow-y-auto">{data.books.map(book => (
          <div key={book.id} className={`flex items-center gap-3 rounded-lg border p-3 ${!book.available ? 'opacity-60' : ''}`}>
            <BookOpen className={`h-5 w-5 shrink-0 ${book.available ? 'text-amber-700' : 'text-muted-foreground'}`} />
            <div className="flex-1 min-w-0"><p className="text-sm font-medium">{book.title}</p><p className="text-xs text-muted-foreground">{book.author} · {book.genre}</p></div>
            {book.available ? <Badge variant="outline" className="text-green-600 text-[10px]">Disponible</Badge> : <Badge variant="outline" className="text-[10px]">Prêté à {book.borrower}</Badge>}
          </div>
        ))}</div>
        <p className="text-xs text-muted-foreground italic">📚 {data.rules}</p>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  PHOTO GALLERY
// ═══════════════════════════════════════════════════════════════════════════

const PHOTO_DEFAULT = {
  title: 'Souvenirs de la maison',
  description: 'Nos plus beaux moments partagés dans cette maison.',
  photos: [
    { id: '1', caption: 'Premier Noël dans la maison', date: '2022-12-25', color: 'from-red-200 to-red-100' },
    { id: '2', caption: 'Jardin au printemps', date: '2023-04-15', color: 'from-green-200 to-emerald-100' },
    { id: '3', caption: 'Soirée d\'été sur la terrasse', date: '2023-07-20', color: 'from-orange-200 to-amber-100' },
    { id: '4', caption: 'Anniversaire d\'Emma', date: '2024-06-10', color: 'from-pink-200 to-rose-100' },
    { id: '5', caption: 'Rénovation du salon', date: '2024-09-01', color: 'from-slate-200 to-gray-100' },
    { id: '6', caption: 'Vue depuis la chambre', date: '2024-11-15', color: 'from-sky-200 to-blue-100' },
  ] as { id: string; caption: string; date: string; color: string }[],
};

export function PhotoGalleryModule({ content }: ModuleProps) {
  const data = { ...PHOTO_DEFAULT, ...content } as typeof PHOTO_DEFAULT & { photos: { id: string; caption: string; date: string; color: string }[] };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-100 dark:bg-pink-950">
            <Camera className="h-5 w-5 text-pink-500" />
          </div>
          <div>
            <CardTitle className="text-base">{data.title}</CardTitle>
            <p className="text-xs text-muted-foreground">{data.description}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{data.photos.map(photo => (
          <div key={photo.id} className={`aspect-square rounded-lg bg-gradient-to-br ${photo.color} flex items-center justify-center p-3`}
          >
            <div className="text-center"><Camera className="h-6 w-6 mx-auto mb-1 opacity-40" /><p className="text-xs font-medium line-clamp-2">{photo.caption}</p><p className="text-[10px] opacity-60 mt-0.5">{photo.date}</p></div>
          </div>
        ))}</div>
      </CardContent>
    </Card>
  );
}
