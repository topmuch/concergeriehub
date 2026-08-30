'use client';

import React, { lazy, Suspense } from 'react';
import {
  Wifi, BookOpen, Bell, AlertTriangle, StickyNote, User,
  ShoppingCart, Package, Brush, ListChecks, Timer, ChefHat,
  Pill, PawPrint, Flower2, Home, Users, Truck, Baby,
  FileText, RotateCcw, Settings, Zap, Calendar,
  UtensilsCrossed, CalendarDays, Key, Car,
  Shirt, Recycle, Wrench, Heart, Dog,
  Hotel, DoorOpen, Phone, PackageSearch,
  Network, Tv, Music, Gamepad2, BookImage,
  Camera, ClipboardList, Megaphone, Smile, Target,
  CloudSun, Cpu, Mic, Store, WrenchIcon, Percent,
} from 'lucide-react';
import type { QrModuleType } from '@/types/database';
import type { ModuleProps, ModuleDescriptor, ModuleDescriptorMap } from './types';

// ─── Lazy-loaded module components ────────────────────────────────────────

const WifiModule = lazy(() => import('./v1/wifi'));
const GuestbookModule = lazy(() => import('./v1/guestbook'));
const DoorbellModule = lazy(() => import('./v1/doorbell'));
const EmergencyModule = lazy(() => import('./v1/emergency'));
const NoteModule = lazy(() => import('./v1/note'));
const ContactModule = lazy(() => import('./v1/contact'));

const ShoppingListModule = lazy(() => import('./v2/shopping-list'));
const InventoryModule = lazy(() => import('./v2/inventory'));
const ChoreModule = lazy(() => import('./v2/chore'));
const ChecklistModule = lazy(() => import('./v2/checklist'));
const TimerModule = lazy(() => import('./v2/timer'));
const RecipeModule = lazy(() => import('./v2/recipe'));
const MedicationModule = lazy(() => import('./v2/medication'));
const PetInfoModule = lazy(() => import('./v2/pet-info'));
const PlantCareModule = lazy(() => import('./v2/plant-care'));
const HomeManualModule = lazy(() => import('./v2/home-manual'));
const VisitorInfoModule = lazy(() => import('./v2/visitor-info'));
const DeliveryModule = lazy(() => import('./v2/delivery'));
const BabySitterModule = lazy(() => import('./v2/baby-sitter'));
const HouseRulesModule = lazy(() => import('./v2/house-rules'));
const WifiResetModule = lazy(() => import('./v2/wifi-reset'));
const ApplianceManualModule = lazy(() => import('./v2/appliance-manual'));
const EnergyMonitorModule = lazy(() => import('./v2/energy-monitor'));
const CleaningScheduleModule = lazy(() => import('./v2/cleaning-schedule'));
const MealPlannerModule = lazy(() => import('./v2/meal-planner'));
const SharedCalendarModule = lazy(() => import('./v2/shared-calendar'));
const KeyLocationModule = lazy(() => import('./v2/key-location'));
const GarageInstructionsModule = lazy(() => import('./v2/garage-instructions'));
const LaundryGuideModule = lazy(() => import('./v2/laundry-guide'));
const RecyclingInfoModule = lazy(() => import('./v2/recycling-info'));
const UtilityShutoffModule = lazy(() => import('./v2/utility-shutoff'));
const FirstAidModule = lazy(() => import('./v2/first-aid'));
const PetSitterModule = lazy(() => import('./v2/pet-sitter'));
const RentalGuestModule = lazy(() => import('./v2/rental-guest'));
const AirbnbGuestModule = lazy(() => import('./v2/airbnb-guest'));
const EmergencyContactsModule = lazy(() => import('./v2/emergency-contacts'));
const PackageTrackingModule = lazy(() => import('./v2/package-tracking'));
const HomeNetworkModule = lazy(() => import('./v2/home-network'));
const EntertainmentModule = lazy(() => import('./v2/entertainment'));
const MusicRoomModule = lazy(() => import('./v2/music-room'));
const GameRoomModule = lazy(() => import('./v2/game-room'));
const LibraryModule = lazy(() => import('./v2/library'));
const PhotoGalleryModule = lazy(() => import('./v2/photo-gallery'));
const FamilyBoardModule = lazy(() => import('./v2/family-board'));
const AnnouncementModule = lazy(() => import('./v2/announcement'));
const MoodTrackerModule = lazy(() => import('./v2/mood-tracker'));
const HabitTrackerModule = lazy(() => import('./v2/habit-tracker'));
const WeatherStationModule = lazy(() => import('./v2/weather-station'));
const SmartHomeControlModule = lazy(() => import('./v2/smart-home-control'));
const VoiceAssistantModule = lazy(() => import('./v2/voice-assistant'));

const MerchantModule = lazy(() => import('./v3/merchant'));
const ServiceRequestModule = lazy(() => import('./v3/service-request'));
const PromoModule = lazy(() => import('./v3/promo'));

// ─── Component map ─────────────────────────────────────────────────────────

const MODULE_COMPONENTS: Record<QrModuleType, React.LazyExoticComponent<React.ComponentType<ModuleProps>>> = {
  // V1
  wifi: WifiModule,
  guestbook: GuestbookModule,
  doorbell: DoorbellModule,
  emergency: EmergencyModule,
  note: NoteModule,
  contact: ContactModule,
  // V2
  shopping_list: ShoppingListModule,
  inventory: InventoryModule,
  chore: ChoreModule,
  checklist: ChecklistModule,
  timer: TimerModule,
  recipe: RecipeModule,
  medication: MedicationModule,
  pet_info: PetInfoModule,
  plant_care: PlantCareModule,
  home_manual: HomeManualModule,
  visitor_info: VisitorInfoModule,
  delivery: DeliveryModule,
  baby_sitter: BabySitterModule,
  house_rules: HouseRulesModule,
  wifi_reset: WifiResetModule,
  appliance_manual: ApplianceManualModule,
  energy_monitor: EnergyMonitorModule,
  cleaning_schedule: CleaningScheduleModule,
  meal_planner: MealPlannerModule,
  shared_calendar: SharedCalendarModule,
  key_location: KeyLocationModule,
  garage_instructions: GarageInstructionsModule,
  laundry_guide: LaundryGuideModule,
  recycling_info: RecyclingInfoModule,
  utility_shutoff: UtilityShutoffModule,
  first_aid: FirstAidModule,
  pet_sitter: PetSitterModule,
  rental_guest: RentalGuestModule,
  airbnb_guest: AirbnbGuestModule,
  emergency_contacts: EmergencyContactsModule,
  package_tracking: PackageTrackingModule,
  home_network: HomeNetworkModule,
  entertainment: EntertainmentModule,
  music_room: MusicRoomModule,
  game_room: GameRoomModule,
  library: LibraryModule,
  photo_gallery: PhotoGalleryModule,
  family_board: FamilyBoardModule,
  announcement: AnnouncementModule,
  mood_tracker: MoodTrackerModule,
  habit_tracker: HabitTrackerModule,
  weather_station: WeatherStationModule,
  smart_home_control: SmartHomeControlModule,
  voice_assistant: VoiceAssistantModule,
  // V3
  merchant: MerchantModule,
  service_request: ServiceRequestModule,
  promo: PromoModule,
};

// ─── Descriptors (for explorer grid) ──────────────────────────────────────

export const MODULE_DESCRIPTORS: ModuleDescriptorMap = {
  // V1 — Core
  wifi:              { type: 'wifi', label: 'Wi-Fi', description: 'Partagez vos identifiants Wi-Fi avec vos invités en un scan.', icon: Wifi, version: 1, category: 'Connectivité', color: 'text-blue-500 bg-blue-50' },
  guestbook:         { type: 'guestbook', label: "Livre d'or", description: 'Laissez vos invités écrire un message ou un commentaire.', icon: BookOpen, version: 1, category: 'Social', color: 'text-amber-600 bg-amber-50' },
  doorbell:          { type: 'doorbell', label: 'Sonnette', description: 'Sonnez à la porte et notifiez les occupants en temps réel.', icon: Bell, version: 1, category: 'Communication', color: 'text-orange-500 bg-orange-50' },
  emergency:         { type: 'emergency', label: 'Urgence', description: 'Bouton d\'urgence pour alerter et afficher les consignes.', icon: AlertTriangle, version: 1, category: 'Sécurité', color: 'text-red-600 bg-red-50' },
  note:              { type: 'note', label: 'Note', description: 'Laissez un message rapide ou une information contextuelle.', icon: StickyNote, version: 1, category: 'Utilitaires', color: 'text-yellow-500 bg-yellow-50' },
  contact:           { type: 'contact', label: 'Contact', description: 'Carte de visite du propriétaire ou des occupants.', icon: User, version: 1, category: 'Social', color: 'text-teal-600 bg-teal-50' },

  // V2 — Daily Life
  shopping_list:     { type: 'shopping_list', label: 'Liste de courses', description: 'Gérez et partagez votre liste de courses en famille.', icon: ShoppingCart, version: 2, category: 'Organisation', color: 'text-green-600 bg-green-50' },
  inventory:         { type: 'inventory', label: 'Inventaire', description: 'Suivez les stocks de produits et leurs dates de péremption.', icon: Package, version: 2, category: 'Organisation', color: 'text-stone-600 bg-stone-50' },
  chore:             { type: 'chore', label: 'Corvées', description: 'Attribuez et suivez les tâches ménagères familiales.', icon: Brush, version: 2, category: 'Organisation', color: 'text-purple-600 bg-purple-50' },
  checklist:         { type: 'checklist', label: 'Liste de contrôle', description: 'Listes personnalisables pour valider des étapes.', icon: ListChecks, version: 2, category: 'Organisation', color: 'text-indigo-500 bg-indigo-50' },
  timer:             { type: 'timer', label: 'Minuterie', description: 'Minuterie partagée pour la cuisine, le sport, etc.', icon: Timer, version: 2, category: 'Utilitaires', color: 'text-sky-600 bg-sky-50' },
  recipe:            { type: 'recipe', label: 'Recette', description: 'Partagez une recette directement sur le QR code.', icon: ChefHat, version: 2, category: 'Cuisine', color: 'text-rose-500 bg-rose-50' },
  medication:        { type: 'medication', label: 'Médicaments', description: 'Rappels et informations sur les médicaments du foyer.', icon: Pill, version: 2, category: 'Santé', color: 'text-pink-600 bg-pink-50' },
  pet_info:          { type: 'pet_info', label: 'Info animal', description: 'Informations sur les animaux de compagnie du foyer.', icon: PawPrint, version: 2, category: 'Animaux', color: 'text-amber-700 bg-amber-50' },
  plant_care:        { type: 'plant_care', label: 'Soins des plantes', description: 'Calendrier d\'arrosage et soins pour vos plantes.', icon: Flower2, version: 2, category: 'Maison', color: 'text-emerald-600 bg-emerald-50' },
  home_manual:       { type: 'home_manual', label: 'Manuel de la maison', description: 'Guide complet de votre maison pour les occupants.', icon: Home, version: 2, category: 'Maison', color: 'text-slate-600 bg-slate-50' },
  visitor_info:      { type: 'visitor_info', label: 'Info visiteur', description: 'Informations pratiques pour les visiteurs.', icon: Users, version: 2, category: 'Accueil', color: 'text-cyan-600 bg-cyan-50' },
  delivery:          { type: 'delivery', label: 'Livraison', description: 'Instructions pour les livreurs et les livraisons.', icon: Truck, version: 2, category: 'Accueil', color: 'text-orange-600 bg-orange-50' },
  baby_sitter:       { type: 'baby_sitter', label: 'Baby-sitter', description: 'Instructions complètes pour le baby-sitter.', icon: Baby, version: 2, category: 'Famille', color: 'text-pink-500 bg-pink-50' },
  house_rules:       { type: 'house_rules', label: 'Règles de la maison', description: 'Règles et consignes à respecter dans le foyer.', icon: FileText, version: 2, category: 'Maison', color: 'text-gray-600 bg-gray-50' },
  wifi_reset:        { type: 'wifi_reset', label: 'Réinitialisation Wi-Fi', description: 'Instructions pour redémarrer le routeur Wi-Fi.', icon: RotateCcw, version: 2, category: 'Connectivité', color: 'text-blue-600 bg-blue-50' },
  appliance_manual:  { type: 'appliance_manual', label: "Manuel d'appareil", description: 'Guide d\'utilisation et dépannage des appareils.', icon: Settings, version: 2, category: 'Maison', color: 'text-zinc-600 bg-zinc-50' },
  energy_monitor:    { type: 'energy_monitor', label: 'Moniteur énergétique', description: 'Suivez la consommation d\'énergie de votre foyer.', icon: Zap, version: 2, category: 'Domotique', color: 'text-yellow-500 bg-yellow-50' },
  cleaning_schedule: { type: 'cleaning_schedule', label: 'Planning de nettoyage', description: 'Planifiez le nettoyage des pièces et des tâches.', icon: Calendar, version: 2, category: 'Organisation', color: 'text-lime-600 bg-lime-50' },
  meal_planner:      { type: 'meal_planner', label: 'Planificateur de repas', description: 'Planifiez les repas de la semaine en famille.', icon: UtensilsCrossed, version: 2, category: 'Cuisine', color: 'text-orange-500 bg-orange-50' },
  shared_calendar:   { type: 'shared_calendar', label: 'Calendrier partagé', description: 'Calendrier familial avec événements et rappels.', icon: CalendarDays, version: 2, category: 'Organisation', color: 'text-violet-600 bg-violet-50' },
  key_location:      { type: 'key_location', label: 'Emplacement des clés', description: 'Indiquez où trouver les clés de la maison.', icon: Key, version: 2, category: 'Maison', color: 'text-yellow-600 bg-yellow-50' },
  garage_instructions: { type: 'garage_instructions', label: 'Instructions garage', description: 'Instructions pour ouvrir et utiliser le garage.', icon: Car, version: 2, category: 'Maison', color: 'text-slate-700 bg-slate-50' },
  laundry_guide:     { type: 'laundry_guide', label: 'Guide de lavage', description: 'Instructions de lavage et d\'entretien du linge.', icon: Shirt, version: 2, category: 'Maison', color: 'text-sky-500 bg-sky-50' },
  recycling_info:    { type: 'recycling_info', label: 'Info recyclage', description: 'Guide de tri sélectif et consignes de recyclage.', icon: Recycle, version: 2, category: 'Maison', color: 'text-green-500 bg-green-50' },
  utility_shutoff:   { type: 'utility_shutoff', label: 'Coupe utilités', description: 'Localisez les robinets et coupures d\'utilités.', icon: Wrench, version: 2, category: 'Sécurité', color: 'text-red-500 bg-red-50' },
  first_aid:         { type: 'first_aid', label: 'Premiers secours', description: 'Informations et localisation de la trousse de premiers secours.', icon: Heart, version: 2, category: 'Santé', color: 'text-red-600 bg-red-50' },
  pet_sitter:        { type: 'pet_sitter', label: 'Pet-sitter', description: 'Instructions complètes pour le pet-sitter.', icon: Dog, version: 2, category: 'Animaux', color: 'text-amber-600 bg-amber-50' },
  rental_guest:      { type: 'rental_guest', label: 'Locataire invité', description: 'Guide d\'accueil pour locataires et invités de passage.', icon: Hotel, version: 2, category: 'Accueil', color: 'text-teal-500 bg-teal-50' },
  airbnb_guest:      { type: 'airbnb_guest', label: 'Invité Airbnb', description: 'Guide d\'accueil dédié pour les invités Airbnb.', icon: DoorOpen, version: 2, category: 'Accueil', color: 'text-rose-600 bg-rose-50' },
  emergency_contacts: { type: 'emergency_contacts', label: "Contacts d'urgence", description: 'Liste des contacts d\'urgence du foyer.', icon: Phone, version: 2, category: 'Sécurité', color: 'text-red-700 bg-red-50' },
  package_tracking:  { type: 'package_tracking', label: 'Suivi de colis', description: 'Suivez l\'état de vos colis et livraisons.', icon: PackageSearch, version: 2, category: 'Utilitaires', color: 'text-orange-500 bg-orange-50' },
  home_network:      { type: 'home_network', label: 'Réseau domestique', description: 'Informations sur le réseau et les appareils connectés.', icon: Network, version: 2, category: 'Connectivité', color: 'text-blue-500 bg-blue-50' },
  entertainment:     { type: 'entertainment', label: 'Divertissement', description: 'Contrôles et infos pour l\'équipement multimédia.', icon: Tv, version: 2, category: 'Loisirs', color: 'text-purple-500 bg-purple-50' },
  music_room:        { type: 'music_room', label: 'Salle de musique', description: 'Contrôles et infos pour la salle de musique.', icon: Music, version: 2, category: 'Loisirs', color: 'text-fuchsia-600 bg-fuchsia-50' },
  game_room:         { type: 'game_room', label: 'Salle de jeux', description: 'Instructions et règles pour la salle de jeux.', icon: Gamepad2, version: 2, category: 'Loisirs', color: 'text-emerald-500 bg-emerald-50' },
  library:           { type: 'library', label: 'Bibliothèque', description: 'Catalogue et prêts de livres de la maison.', icon: BookImage, version: 2, category: 'Loisirs', color: 'text-amber-800 bg-amber-50' },
  photo_gallery:     { type: 'photo_gallery', label: 'Galerie photos', description: 'Partagez des photos et souvenirs avec les visiteurs.', icon: Camera, version: 2, category: 'Loisirs', color: 'text-pink-500 bg-pink-50' },
  family_board:      { type: 'family_board', label: 'Tableau familial', description: 'Tableau d\'affichage pour les messages familiaux.', icon: ClipboardList, version: 2, category: 'Famille', color: 'text-indigo-600 bg-indigo-50' },
  announcement:      { type: 'announcement', label: 'Annonce', description: 'Affichez une annonce importante pour tous.', icon: Megaphone, version: 2, category: 'Communication', color: 'text-orange-600 bg-orange-50' },
  mood_tracker:      { type: 'mood_tracker', label: "Suivi d'humeur", description: 'Suivez et partagez votre humeur quotidienne.', icon: Smile, version: 2, category: 'Santé', color: 'text-yellow-500 bg-yellow-50' },
  habit_tracker:     { type: 'habit_tracker', label: "Suivi d'habitudes", description: 'Suivez vos habitudes et objectifs quotidiens.', icon: Target, version: 2, category: 'Santé', color: 'text-green-600 bg-green-50' },
  weather_station:   { type: 'weather_station', label: 'Station météo', description: 'Affichez les conditions météo et prévisions.', icon: CloudSun, version: 2, category: 'Domotique', color: 'text-sky-500 bg-sky-50' },
  smart_home_control: { type: 'smart_home_control', label: 'Domotique', description: 'Contrôlez vos appareils domotiques en un scan.', icon: Cpu, version: 2, category: 'Domotique', color: 'text-violet-500 bg-violet-50' },
  voice_assistant:   { type: 'voice_assistant', label: 'Assistant vocal', description: 'Commandes vocales et configuration de l\'assistant.', icon: Mic, version: 2, category: 'Domotique', color: 'text-cyan-600 bg-cyan-50' },

  // V3 — Marketplace
  merchant:          { type: 'merchant', label: 'Commerçant', description: 'Vitrine du commerçant avec infos et services.', icon: Store, version: 3, category: 'Marketplace', color: 'text-emerald-600 bg-emerald-50' },
  service_request:   { type: 'service_request', label: 'Demande de service', description: 'Demandez un service professionnel depuis le QR.', icon: WrenchIcon, version: 3, category: 'Marketplace', color: 'text-blue-600 bg-blue-50' },
  promo:             { type: 'promo', label: 'Promotion', description: 'Offres promotionnelles et bons de réduction.', icon: Percent, version: 3, category: 'Marketplace', color: 'text-rose-600 bg-rose-50' },
};

// ─── Skeleton loader ───────────────────────────────────────────────────────

function ModuleSkeleton() {
  return (
    <div className="animate-pulse space-y-4 p-6">
      <div className="h-6 w-1/3 rounded bg-muted" />
      <div className="h-4 w-2/3 rounded bg-muted" />
      <div className="space-y-2">
        <div className="h-4 w-full rounded bg-muted" />
        <div className="h-4 w-5/6 rounded bg-muted" />
        <div className="h-4 w-4/6 rounded bg-muted" />
      </div>
    </div>
  );
}

// ─── ModuleRenderer ───────────────────────────────────────────────────────

export function ModuleRenderer({ type, ...props }: ModuleProps & { type: QrModuleType }) {
  const Component = MODULE_COMPONENTS[type];
  if (!Component) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-8 text-muted-foreground">
        <span className="text-sm">Module non trouvé : {type}</span>
      </div>
    );
  }
  return (
    <Suspense fallback={<ModuleSkeleton />}>
      <Component {...props} />
    </Suspense>
  );
}

// ─── Exported helpers ──────────────────────────────────────────────────────

export function getModuleDescriptor(type: QrModuleType): ModuleDescriptor {
  return MODULE_DESCRIPTORS[type];
}

export function getModulesByVersion(version: 1 | 2 | 3): ModuleDescriptor[] {
  return Object.values(MODULE_DESCRIPTORS).filter((d) => d.version === version);
}

export function getModulesByCategory(category: string): ModuleDescriptor[] {
  return Object.values(MODULE_DESCRIPTORS).filter((d) => d.category === category);
}

export function getAllCategories(): string[] {
  return [...new Set(Object.values(MODULE_DESCRIPTORS).map((d) => d.category))].sort();
}
