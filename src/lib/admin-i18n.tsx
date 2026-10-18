'use client';

// =============================================================
// v4.77-c2 « ADMIN I18N » — i18n 5 LANGUES des espaces HÔTE
// =============================================================
// Demande client : page de connexion, dashboard hôte (shell) et
// hub hôte (Mode Hôte par PIN) en fr · en · es · de · zh.
//
// Architecture 100 % STATIQUE (le dashboard doit marcher HORS LIGNE,
// zéro appel IA) — même convention que hub-i18n (hub invité) :
//   • la CLÉ du dictionnaire est le texte FRANÇAIS EXACT source ;
//   • `t(s)` renvoie la traduction de la langue active, ou le texte
//     FR tel quel si la clé est absente (fallback universel) ;
//   • `tf(s, vars)` traduit puis interpole {name}, {n}, {flag}…
//     pour les phrases dynamiques (ordre des mots respecté par
//     langue grâce au placeholder).
//
// Langue mémorisée dans localStorage('admin-lang') (partagée par
// tous les espaces hôte : login, shell, hub), sinon détection
// navigator.language, sinon FR. Initialisation à 'fr' AVANT montage
// → zéro mismatch d'hydratation ; la langue réelle est appliquée
// après le premier rendu (comme le thème).
// =============================================================

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

export type AdminLang = 'fr' | 'en' | 'es' | 'de' | 'zh';

export const ADMIN_LANGS: { code: AdminLang; flag: string; label: string }[] = [
  { code: 'fr', flag: '🇫🇷', label: 'Français' },
  { code: 'en', flag: '🇬🇧', label: 'English' },
  { code: 'es', flag: '🇪🇸', label: 'Español' },
  { code: 'de', flag: '🇩🇪', label: 'Deutsch' },
  { code: 'zh', flag: '🇨🇳', label: '中文' },
];

const LANG_CODES = new Set<AdminLang>(['fr', 'en', 'es', 'de', 'zh']);
const STORAGE_KEY = 'admin-lang';

/** Langue admin active : choix mémorisé → langue du navigateur → FR. */
export function getAdminLang(): AdminLang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && LANG_CODES.has(v as AdminLang)) return v as AdminLang;
  } catch {
    /* stockage indisponible (navigation privée) → détection */
  }
  try {
    for (const nav of [navigator.language, ...(navigator.languages ?? [])]) {
      const base = (nav ?? '').slice(0, 2).toLowerCase();
      if (LANG_CODES.has(base as AdminLang)) return base as AdminLang;
    }
  } catch {
    /* SSR / user-agent exotique — FR par défaut */
  }
  return 'fr';
}

/** Mémorise le choix de langue (partagé par tous les espaces hôte). */
export function setAdminLang(lang: AdminLang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* stockage indisponible — le choix reste valable pour la session */
  }
}

// ── DICTIONNAIRE — clé = texte FR EXACT source (U+2019 compris) ──
// Les clés sont groupées par zone (login / shell / hub hôte) dans
// CHAQUE langue, dans le même ordre, pour rester maintenables.
const ADMIN_DICT: Record<Exclude<AdminLang, 'fr'>, Record<string, string>> = {
  // ════════════════════════════════════════════════════════════
  // ENGLISH
  // ════════════════════════════════════════════════════════════
  en: {
    // ── Communs ──
    'Choisir la langue': 'Choose language',
    'Propulsé par': 'Powered by',
    'Erreur réseau.': 'Network error.',
    'Erreur réseau. Réessayez.': 'Network error. Please try again.',
    'Connexion impossible. Réessayez.': 'Connection failed. Please try again.',
    'Code incorrect. Veuillez réessayer.': 'Incorrect code. Please try again.',

    // ── Page de connexion ──
    'Retour au site': 'Back to site',
    'La conciergerie digitale': 'Digital concierge',
    'commence par un QR': 'starts with a QR',
    'La conciergerie digitale de vos locations. Wi-Fi, guidebook, check-out et prestataires : une seule plaque QR pour vos invités, un tableau de bord pour vous.':
      'The digital concierge for your rentals. Wi-Fi, house manual, check-out and service providers: one QR plaque for your guests, a dashboard for you.',
    'QR Codes intelligents': 'Smart QR codes',
    'Scan instantané': 'Instant scan',
    'Gestion multi-logements': 'Multi-property management',
    'Prestataires intégrés': 'Integrated service providers',
    'Hôtes connectés': 'Connected hosts',
    'QR Codes scannés/mois': 'QR codes scanned/month',
    'Disponibilité': 'Uptime',
    'Connexion': 'Sign in',
    'Créer un compte': 'Create an account',
    'Accédez à votre espace RoomScan': 'Access your RoomScan space',
    'Rejoignez les 2 500+ hôtes qui automatisent leurs locations': 'Join the 2,500+ hosts automating their rentals',
    'Nom complet': 'Full name',
    'Email': 'Email',
    'vous@exemple.com': 'you@example.com',
    'Mot de passe': 'Password',
    '8 caractères min. — lettres + chiffres': 'Min. 8 characters — letters + numbers',
    'Se connecter': 'Sign in',
    "S'inscrire": 'Sign up',
    'Mot de passe oublié ?': 'Forgot your password?',
    'Pas encore de compte ?': 'No account yet?',
    'Déjà un compte ?': 'Already have an account?',
    'Conciergerie digitale pour hôtes': 'Digital concierge for hosts',
    "Erreur lors de l'inscription": 'Sign-up failed',
    'Email ou mot de passe incorrect': 'Incorrect email or password',
    'Erreur de connexion au serveur': 'Server connection error',

    // ── Shell dashboard hôte ──
    'Pilotage': 'Operations',
    'Mes biens': 'My properties',
    'Services': 'Services',
    'Business': 'Business',
    "Vue d'ensemble": 'Dashboard',
    'Calendrier': 'Calendar',
    'Mes tâches': 'My tasks',
    'Messages': 'Messages',
    'Invités': 'Guests',
    'Propriétés': 'Properties',
    'Plaques QR': 'QR plaques',
    'Expérience Invité': 'Guest experience',
    'Notifications': 'Notifications',
    'Souvenirs': 'Souvenirs',
    'Conciergerie': 'Concierge',
    'Ménage & Stock': 'Cleaning & Stock',
    'Prestataires': 'Service providers',
    'Équipe': 'Team',
    'Commandes & Revenus': 'Orders & Revenue',
    'Facturation': 'Billing',
    'Paramètres': 'Settings',
    'Espace Hôte': 'Host space',
    'Invité': 'Guest',
    'Se déconnecter': 'Sign out',
    'Quitter': 'Log out',
    'Menu': 'Menu',
    'Ouvrir le menu': 'Open menu',
    "Navigation de l'espace hôte": 'Host space navigation',
    'Retour au site RoomScan': 'Back to the RoomScan site',
    'Toutes les propriétés': 'All properties',
    'Aucune propriété': 'No property',
    'Propriété sélectionnée': 'Selected property',
    "Aucune propriété pour l'instant — ajoutez-en une pour démarrer.":
      'No property yet — add one to get started.',
    'Ajouter une propriété': 'Add a property',
    'La conciergerie digitale de vos locations, sans application':
      'The digital concierge for your rentals — no app needed',

    // ── Hub hôte — modale d'accès PIN ──
    'Accès protégé — saisie du code': 'Protected access — code entry',
    'Choisissez votre espace, puis saisissez votre code à 4 chiffres.':
      'Choose your space, then enter your 4-digit code.',
    'Accès protégé': 'Protected access',
    'Mode hôte & ménage': 'Host & cleaning mode',
    '🔑 Saisissez le code PIN de votre logement': '🔑 Enter your property PIN code',
    '🧹 Saisissez le code staff de votre équipe': '🧹 Enter your team staff code',
    'Code staff incorrect.': 'Incorrect staff code.',
    'Votre logement': 'Your place',
    "Choix de l'espace d'accès": 'Access space selection',
    'Espace Hôte 🔐': 'Host space 🔐',
    'Wi-Fi, guidebook, photos, messages vocaux, réclamations & commandes':
      'Wi-Fi, house manual, photos, voice messages, complaints & orders',
    'Code PIN du bien': 'Property PIN code',
    'Espace Ménage': 'Cleaning space',
    "Checklist, consigne de l'hôte, photos propres & validation du ménage":
      'Checklist, host note, clean photos & cleaning sign-off',
    'Code staff': 'Staff code',
    'Impossible de charger les données hôte.': 'Could not load host data.',

    // ── LuxuryPinPad (verrouillage hub + modale hôte) ──
    'Accès sécurisé': 'Secure access',
    'Hub sécurisé': 'Secured hub',
    // ── v4.109 Animation pré-arrivée (écran d'accueil hub verrouillé) ──
    'Votre séjour approche': 'Your stay is approaching',
    'Arrivée prévue': 'Expected arrival',
    'Ouverture du hub dans': 'Hub opens in',
    'Le pavé d’accès apparaîtra automatiquement à l’ouverture.': 'The keypad will appear automatically when the hub opens.',
    'jours': 'days',
    'heures': 'hours',
    'min': 'min',
    'Bonjour': 'Hello',
    'Vérification du code…': 'Verifying code…',
    'Retour': 'Back',
    "Besoin d'aide ?": 'Need help?',
    'Contactez votre hôte': 'Contact your host',
    'Effacer le dernier chiffre': 'Clear last digit',
    'Chiffre': 'Digit',
    '🔐 Chaque séjour a son code unique — communiqué par votre hôte. Le hub se verrouillera automatiquement à la fin de votre séjour.':
      '🔐 Every stay has its own unique code — provided by your host. The hub locks automatically at the end of your stay.',

    // ── Hub hôte — Espace Hôte (HostView) ──
    "Retour à l'accueil": 'Back to home',
    '✓ Déverrouillé': '✓ Unlocked',
    'Gestion rapide du logement': 'Quick property management',
    'Réclamations': 'Complaints',
    'Vocaux': 'Voice notes',
    'Commandes': 'Orders',
    '🏠 Mon logement': '🏠 My place',
    '👥 Mes invités': '👥 My guests',
    '🧹 Équipe & prestataires': '🧹 Team & providers',
    '⚙️ Réglages': '⚙️ Settings',
    'Modifier le Wi-Fi': 'Edit the Wi-Fi',
    'Réseau': 'Network',
    'Aucun réseau configuré': 'No network configured',
    'Guidebook': 'House manual',
    'section(s) — éditer le guide de bienvenue': 'section(s) — edit the welcome guide',
    'Aucune section — écrire le guide de bienvenue': 'No section yet — write the welcome guide',
    'Photos de mon hub': 'My hub photos',
    'photo(s) personnalisée(s) — votre hub 100 % à vous': 'custom photo(s) — a hub 100% your own',
    'Remplacez les visuels par vos vraies photos': 'Replace the visuals with your real photos',
    'Messages vocaux': 'Voice messages',
    "Bienvenue, veille et jour du départ — votre voix ou l'IA, en 4 langues":
      'Welcome, eve of departure and departure day — your voice or AI, in 4 languages',
    'Réclamations en attente': 'Pending complaints',
    'écrite(s)': 'written',
    'vocale(s)': 'voice',
    'demande(s) de service': 'service request(s)',
    'Aucune réclamation en attente ✓': 'No pending complaints ✓',
    'Upselling — Commandes': 'Upselling — Orders',
    'commande(s) à confirmer': 'order(s) to confirm',
    'commande(s) — rien à confirmer ✓': 'order(s) — nothing to confirm ✓',
    'Aucune commande pour le moment': 'No orders yet',
    "Livre d'or — souvenirs": 'Guestbook — memories',
    'Validez, épinglez et répondez aux souvenirs de vos voyageurs':
      'Approve, pin and reply to your guests’ memories',
    'Middle-Stay Care': 'Middle-Stay Care',
    'Réassorts & ménages demandés par vos invités en séjour long':
      'Restocks & cleanings requested by long-stay guests',
    'Gérer les prestataires': 'Manage providers',
    'intervenant(s) autour du bien': 'provider(s) around the property',
    "Gérer le code PIN d'accès au mode hôte": 'Manage the host mode PIN code',
    'Supprimer définitivement le message vocal de {name} ? Cette action est irréversible.':
      'Permanently delete the voice message from {name}? This action cannot be undone.',
    'Suppression impossible. Réessayez.': 'Could not delete. Please try again.',
    'Message vocal supprimé.': 'Voice message deleted.',
    'Impossible de marquer comme résolue.': 'Could not mark as resolved.',
    'Réclamation marquée résolue ✓': 'Complaint marked as resolved ✓',
    'Action impossible.': 'Action failed.',
    'Commande confirmée ✓': 'Order confirmed ✓',
    'Commande annulée.': 'Order cancelled.',
    '{name} activé ✓ — visible côté invité.': '{name} enabled ✓ — visible to guests.',
    '{name} désactivé — masqué côté invité.': '{name} disabled — hidden from guests.',
    'en attente': 'pending',
    'aucun': 'none',

    // ── Dialog Réclamations ──
    'Réclamations écrites (formulaire Hub) et messages vocaux de vos voyageurs.':
      'Written complaints (Hub form) and voice messages from your guests.',
    'Écrites': 'Written',
    'Aucune réclamation écrite en attente ✓': 'No written complaints pending ✓',
    '⚠️ Urgent': '⚠️ Urgent',
    'Nouvelle': 'New',
    'De :': 'From:',
    'Photo {n} de la réclamation': 'Complaint photo {n}',
    'Marquer résolue': 'Mark as resolved',
    'Vocales': 'Voice',
    'Aucun message vocal en attente ✓': 'No pending voice messages ✓',
    'lu ✓': 'read ✓',
    'Supprimer le message vocal de {name}': 'Delete the voice message from {name}',
    'Supprimer ce vocal': 'Delete this voice note',
    'Message de {name}': 'Message from {name}',
    '🎙️ Message vocal de {n} s (audio indisponible en démo)':
      '🎙️ Voice message, {n} s (audio unavailable in demo)',

    // ── Dialog Prestataires ──
    'Prestataires autour du bien': 'Providers around the property',
    "Dans leur rayon d'intervention. Activez ou désactivez chaque prestataire — un prestataire désactivé est masqué pour vos invités.":
      'Within their service radius. Enable or disable each provider — a disabled provider is hidden from your guests.',
    '🔧 Services Propriétaire': '🔧 Owner services',
    '🥂 Expériences Invité': '🥂 Guest experiences',
    'Aucun prestataire dans le rayon.': 'No provider in the area.',
    'Désactivé': 'Disabled',
    'Désactiver {name} pour ce bien': 'Disable {name} for this property',
    'Activer {name} pour ce bien': 'Enable {name} for this property',

    // ── Dialog Wi-Fi ──
    'Renseignez le nom du réseau et le mot de passe.': 'Please fill in the network name and password.',
    'Échec de la mise à jour.': 'Update failed.',
    'Wi-Fi mis à jour ✅': 'Wi-Fi updated ✅',
    'Vos voyageurs voient le nouveau réseau immédiatement.': 'Your guests see the new network immediately.',
    'Les nouveaux identifiants sont visibles immédiatement par vos voyageurs.':
      'The new credentials are visible to your guests immediately.',
    'Nom du réseau (SSID)': 'Network name (SSID)',
    'Enregistrement…': 'Saving…',
    'Enregistrer': 'Save',

    // ── Dialog Guidebook ──
    'Charger le guidebook universel remplacera le contenu en cours d’édition. Continuer ?':
      'Loading the universal guide will replace the content being edited. Continue?',
    'Guidebook universel indisponible.': 'Universal guide unavailable.',
    '📚 Guidebook universel chargé.': '📚 Universal guide loaded.',
    'Personnalisez-le avec les spécificités de votre bien, puis enregistrez.':
      'Personalise it with your property details, then save.',
    'Aucun Guidebook actif pour ce bien. Créez-le depuis le dashboard hôte.':
      'No active house manual for this property. Create it from the host dashboard.',
    'Renseignez un titre et au moins une section.': 'Please provide a title and at least one section.',
    'Guidebook mis à jour ✅': 'House manual updated ✅',
    'Vos voyageurs voient le nouveau guide immédiatement.': 'Your guests see the new guide immediately.',
    'Éditer le Guidebook': 'Edit the house manual',
    'Le guide de bienvenue consulté par vos invités depuis le Hub.':
      'The welcome guide your guests read from the Hub.',
    'Titre du guide': 'Guide title',
    'Guide de bienvenue': 'Welcome guide',
    'Sections': 'Sections',
    'Section {n} — ex : 🔑 Accès, code de la boîte à clés…':
      'Section {n} — e.g. 🔑 Access, key box code…',
    'Section {n} du guide': 'Guide section {n}',
    'Supprimer la section {n}': 'Delete section {n}',
    'Ajouter une section': 'Add a section',
    'Charger le guidebook universel': 'Load the universal guide',
    'Enregistrer le guide': 'Save the guide',

    // ── Dialog Commandes (Upselling) ──
    'Commandes des invités': 'Guest orders',
    "Prestations commandées via l'app invitée. Confirmez ou annulez les demandes en attente.":
      'Services ordered from the guest app. Confirm or cancel pending requests.',
    "Aucune commande pour l'instant": 'No orders yet',
    "Les commandes passées par vos invités depuis l'app apparaîtront ici.":
      'Orders placed by your guests from the app will appear here.',
    'Confirmer': 'Confirm',
    'Annuler': 'Cancel',
    'Invité :': 'Guest:',

    // ── Dialog Paramètres PIN ──
    'Les deux codes ne correspondent pas. Recommencez.': 'The two codes do not match. Please start over.',
    'Échec du changement de PIN.': 'PIN change failed.',
    'PIN modifié ✅': 'PIN changed ✅',
    'Votre nouveau code est actif immédiatement.': 'Your new code is active immediately.',
    'Modifier le code PIN': 'Change the PIN code',
    'Saisissez votre nouveau code à 4 chiffres.': 'Enter your new 4-digit code.',
    'Confirmez le nouveau code en le saisissant à nouveau.': 'Confirm the new code by entering it again.',
    'Enregistrement du nouveau code…': 'Saving the new code…',
    'Code saisi :': 'Code entered:',

    // ── Dialog Photos de mon hub ──
    'Choisissez une image (JPG, PNG…).': 'Choose an image (JPG, PNG…).',
    'Format d’image non pris en charge — utilisez JPG ou PNG.':
      'Unsupported image format — please use JPG or PNG.',
    'Photo trop lourde — réessayez avec une image plus petite.': 'Photo too large — try a smaller image.',
    'Enregistrement impossible.': 'Could not save.',
    'Photo enregistrée ✓ — visible immédiatement par vos invités.':
      'Photo saved ✓ — visible to your guests immediately.',
    'Suppression impossible.': 'Could not delete.',
    'Visuel d’illustration restauré.': 'Illustration visual restored.',
    '📸 Photos de mon hub': '📸 My hub photos',
    'Remplacez les visuels d’illustration par vos vraies photos — vos invités les voient immédiatement sur la page invitée.':
      'Replace the illustration visuals with your real photos — your guests see them immediately on the guest page.',
    'Photo actuelle — {name}': 'Current photo — {name}',
    'Perso': 'Custom',
    'Changer': 'Change',
    'Ajouter': 'Add',
    'Retirer la photo — {name}': 'Remove photo — {name}',
    'Astuce : photos redimensionnées automatiquement (1024 px, JPEG) — formats JPG, PNG ou WebP conseillés. Format paysage.':
      'Tip: photos are resized automatically (1024 px, JPEG) — JPG, PNG or WebP recommended. Landscape format.',

    // ── Slots photos du hub (lib/hub-photos) ──
    'Photo de couverture': 'Cover photo',
    'La grande photo en haut de l’Espace Invité': 'The big photo at the top of the Guest space',
    'Room Services & Expériences': 'Room Services & Experiences',
    'La carte flagship des commandes': 'The flagship ordering menu',
    'Accès & Codes': 'Access & Codes',
    'Serrure, portail, boîte à clés…': 'Lock, gate, key box…',
    'Arrivée pas à pas': 'Step-by-step arrival',
    'La façade ou l’entrée du bâtiment': 'The facade or building entrance',
    'Un bel intérieur du logement': 'A nice interior of the place',
    'Guide des appareils': 'Appliance guide',
    'Machine à café, cuisine, sono…': 'Coffee machine, kitchen, sound system…',
    'Kit de survie': 'Survival kit',
    'L’entrée, un placard bien rangé': 'The entrance, a tidy cupboard',
    'Vidéo de bienvenue': 'Welcome video',
    'Le salon ou une chambre': 'The living room or a bedroom',
    'Départ tardif': 'Late check-out',
    'La chambre, un lit frais': 'The bedroom, a freshly made bed',
    'Visiter la ville': 'Explore the city',
    'Un café, un musée du quartier': 'A café, a local museum',
    'Bouclier d’avis': 'Review shield',
    'Un coin chaleureux du séjour': 'A cosy corner of the stay',
    'SOS & Urgences': 'SOS & Emergency',
    'Extincteur, trousse de secours…': 'Fire extinguisher, first-aid kit…',
    'Contacter l’hôte': 'Contact your host',
    'Une cloche, un téléphone, un mot d’accueil': 'A bell, a phone, a welcome note',
    'Shop the Stay': 'Shop the Stay',
    'Les produits de la maison à vendre': 'The home products for sale',

    // ── Dialog Messages vocaux ──
    'PIN incorrect — rouvrez le mode hôte.': 'Incorrect PIN — reopen host mode.',
    'Impossible de charger vos messages vocaux.': 'Could not load your voice messages.',
    "Écrivez d'abord le message en {lang}.": 'Write the message in {lang} first.',
    'Génération impossible. Réessayez dans un instant.': 'Could not generate. Try again in a moment.',
    'Voix {flag} prête ✓ ({n} s)': 'Voice {flag} ready ✓ ({n} s)',
    'Génération terminée ✓ — vos invités entendent la voix dans leur langue.':
      'Generation complete ✓ — your guests hear the voice in their language.',
    'Écrivez d’abord votre message en français.': 'Write your message in French first.',
    'Traductions prêtes ✓ — relisez et ajustez si besoin.':
      'Translations ready ✓ — review and adjust if needed.',
    'Traduction indisponible pour le moment.': 'Translation unavailable right now.',
    'Trop long — maximum 30 secondes (comme les vocaux).':
      'Too long — 30 seconds max (like voice notes).',
    'Envoi impossible. Réessayez.': 'Could not upload. Please try again.',
    'Votre voix est enregistrée ✓ — audible par vos invités.':
      'Your voice is saved ✓ — audible to your guests.',
    'Voix supprimée — vos invités ne l’entendront plus.':
      'Voice deleted — your guests will no longer hear it.',
    '🎙️ Messages vocaux': '🎙️ Voice messages',
    'Vos invités entendent la voix dans leur langue (repli : français) aux bons moments du séjour. Texte FR → traduction IA → voix générée, ou votre propre enregistrement (30 s max, comme les vocaux).':
      'Your guests hear the voice in their language (fallback: French) at the right moments of the stay. FR text → AI translation → generated voice, or your own recording (30 s max, like voice notes).',
    ' Mode démo : pré-écoute sans enregistrement.': ' Demo mode: preview without saving.',
    'Bienvenue': 'Welcome',
    'Joué au 1er clic « Mode Invité » — 1× par téléphone':
      'Plays on the first tap of “Guest mode” — once per phone',
    'Souhaitez la bienvenue, présentez-vous, donnez le ton de votre maison.':
      'Welcome your guests, introduce yourself, set the tone of your home.',
    'Veille du départ': 'Eve of departure',
    '1er scan après l’heure choisie dans la Conciergerie (onglet ⏰, défaut 20 h) la veille du départ — 1× seulement':
      'First scan after the time set in the Concierge (⏰ tab, default 8 pm) on the eve of departure — once only',
    'Rappelez : départ tardif possible, préparer les affaires, laisser un avis.':
      'Remind them: late check-out possible, pack up, leave a review.',
    'Jour du départ': 'Departure day',
    'Dès l’heure choisie dans la Conciergerie (onglet ⏰, défaut 9 h) le jour J — chaque ouverture de l’espace invité':
      'From the time set in the Concierge (⏰ tab, default 9 am) on the day itself — every time the guest space opens',
    'Consignes : départ, clés, ranger la maison, poubelles, linge…':
      'Instructions: check-out, keys, tidy up, bins, linens…',
    'Voix du guidebook': 'House manual voice',
    'Écoute libre : bouton « 🎙️ Écouter l’explication de l’hôte » dans le guidebook et l’onglet Messages de l’hôte':
      'On demand: the “🎙️ Listen to your host” button in the house manual and in the Host messages tab',
    'Expliquez votre guidebook à voix haute — en français uniquement.':
      'Explain your house manual out loud — in French only.',
    '🤖 IA': '🤖 AI',
    '🎙️ Votre voix': '🎙️ Your voice',
    'Votre message en français…': 'Your message in French…',
    'Traduction (éditable) — ou « 🤖 Traduire » ci-dessous.':
      'Translation (editable) — or “🤖 Translate” below.',
    'Message {lang}': 'Message {lang}',
    'Génération… (5-15 s)': 'Generating… (5-15 s)',
    '🎙️ Générer la voix': '🎙️ Generate the voice',
    'Ma propre voix (fichier audio ≤ 30 s)': 'My own voice (audio file ≤ 30 s)',
    'Supprimer cette voix': 'Delete this voice',
    'Supprimer la voix {lang}': 'Delete the {lang} voice',
    'Pré-écoute {lang}': '{lang} preview',
    '📖 La voix du guidebook est en français uniquement — écrivez votre texte ci-dessus puis générez la voix.':
      '📖 The house manual voice is in French only — write your text above and generate the voice.',
    'Traduction…': 'Translating…',
    'Traduire en 🇬🇧 · 🇪🇸 · 🇸🇦': 'Translate to 🇬🇧 · 🇪🇸 · 🇸🇦',
    'Génération {flag}… (≈ 1 min)': 'Generating {flag}… (≈ 1 min)',
    'Générer les 4 voix': 'Generate the 4 voices',
    'Générer les 4 voix (déjà {n}/4)': 'Generate the 4 voices ({n}/4 done)',
    'Les voix se jouent automatiquement côté invité : bienvenue au 1er clic « Mode Invité », veille après 20 h, jour J dès 9 h. Régénérer une voix la rejoue une nouvelle fois sur les téléphones déjà venus.':
      'Voices play automatically on the guest side: welcome on the first tap of “Guest mode”, eve after 8 pm, departure day from 9 am. Regenerating a voice plays it once more on phones that have already visited.',
  },

  // ════════════════════════════════════════════════════════════
  // ESPAÑOL
  // ════════════════════════════════════════════════════════════
  es: {
    // ── Communs ──
    'Choisir la langue': 'Elegir idioma',
    'Propulsé par': 'Impulsado por',
    'Erreur réseau.': 'Error de red.',
    'Erreur réseau. Réessayez.': 'Error de red. Inténtalo de nuevo.',
    'Connexion impossible. Réessayez.': 'No se pudo conectar. Inténtalo de nuevo.',
    'Code incorrect. Veuillez réessayer.': 'Código incorrecto. Inténtalo de nuevo.',

    // ── Page de connexion ──
    'Retour au site': 'Volver al sitio',
    'La conciergerie digitale': 'La conserjería digital',
    'commence par un QR': 'empieza con un QR',
    'La conciergerie digitale de vos locations. Wi-Fi, guidebook, check-out et prestataires : une seule plaque QR pour vos invités, un tableau de bord pour vous.':
      'La conserjería digital de tus alquileres. Wi-Fi, guía de la casa, check-out y proveedores: una sola placa QR para tus invitados y un panel de control para ti.',
    'QR Codes intelligents': 'Códigos QR inteligentes',
    'Scan instantané': 'Escaneo instantáneo',
    'Gestion multi-logements': 'Gestión multialojamiento',
    'Prestataires intégrés': 'Proveedores integrados',
    'Hôtes connectés': 'Anfitriones conectados',
    'QR Codes scannés/mois': 'Códigos QR escaneados/mes',
    'Disponibilité': 'Disponibilidad',
    'Connexion': 'Iniciar sesión',
    'Créer un compte': 'Crear una cuenta',
    'Accédez à votre espace RoomScan': 'Accede a tu espacio RoomScan',
    'Rejoignez les 2 500+ hôtes qui automatisent leurs locations':
      'Únete a los más de 2 500 anfitriones que automatizan sus alquileres',
    'Nom complet': 'Nombre completo',
    'Email': 'Correo electrónico',
    'vous@exemple.com': 'tu@ejemplo.com',
    'Mot de passe': 'Contraseña',
    '8 caractères min. — lettres + chiffres': 'Mín. 8 caracteres — letras + números',
    'Se connecter': 'Iniciar sesión',
    "S'inscrire": 'Registrarse',
    'Mot de passe oublié ?': '¿Olvidaste tu contraseña?',
    'Pas encore de compte ?': '¿Aún no tienes cuenta?',
    'Déjà un compte ?': '¿Ya tienes una cuenta?',
    'Conciergerie digitale pour hôtes': 'Conserjería digital para anfitriones',
    "Erreur lors de l'inscription": 'Error durante el registro',
    'Email ou mot de passe incorrect': 'Correo o contraseña incorrectos',
    'Erreur de connexion au serveur': 'Error de conexión al servidor',

    // ── Shell dashboard hôte ──
    'Pilotage': 'Operaciones',
    'Mes biens': 'Mis alojamientos',
    'Services': 'Servicios',
    'Business': 'Negocio',
    "Vue d'ensemble": 'Panel general',
    'Calendrier': 'Calendario',
    'Mes tâches': 'Mis tareas',
    'Messages': 'Mensajes',
    'Invités': 'Invitados',
    'Propriétés': 'Propiedades',
    'Plaques QR': 'Placas QR',
    'Expérience Invité': 'Experiencia del invitado',
    'Notifications': 'Notificaciones',
    'Souvenirs': 'Recuerdos',
    'Conciergerie': 'Conserjería',
    'Ménage & Stock': 'Limpieza e inventario',
    'Prestataires': 'Proveedores',
    'Équipe': 'Equipo',
    'Commandes & Revenus': 'Pedidos e ingresos',
    'Facturation': 'Facturación',
    'Paramètres': 'Ajustes',
    'Espace Hôte': 'Espacio del anfitrión',
    'Invité': 'Invitado',
    'Se déconnecter': 'Cerrar sesión',
    'Quitter': 'Salir',
    'Menu': 'Menú',
    'Ouvrir le menu': 'Abrir el menú',
    "Navigation de l'espace hôte": 'Navegación del espacio del anfitrión',
    'Retour au site RoomScan': 'Volver al sitio RoomScan',
    'Toutes les propriétés': 'Todas las propiedades',
    'Aucune propriété': 'Ninguna propiedad',
    'Propriété sélectionnée': 'Propiedad seleccionada',
    "Aucune propriété pour l'instant — ajoutez-en une pour démarrer.":
      'Aún no hay propiedades — añade una para empezar.',
    'Ajouter une propriété': 'Añadir una propiedad',
    'La conciergerie digitale de vos locations, sans application':
      'La conserjería digital de tus alquileres, sin aplicación',

    // ── Hub hôte — modale d'accès PIN ──
    'Accès protégé — saisie du code': 'Acceso protegido — introducción del código',
    'Choisissez votre espace, puis saisissez votre code à 4 chiffres.':
      'Elige tu espacio e introduce tu código de 4 dígitos.',
    'Accès protégé': 'Acceso protegido',
    'Mode hôte & ménage': 'Modo anfitrión y limpieza',
    '🔑 Saisissez le code PIN de votre logement': '🔑 Introduce el código PIN de tu alojamiento',
    '🧹 Saisissez le code staff de votre équipe': '🧹 Introduce el código de personal de tu equipo',
    'Code staff incorrect.': 'Código de personal incorrecto.',
    'Votre logement': 'Tu alojamiento',
    "Choix de l'espace d'accès": 'Selección del espacio de acceso',
    'Espace Hôte 🔐': 'Espacio del anfitrión 🔐',
    'Wi-Fi, guidebook, photos, messages vocaux, réclamations & commandes':
      'Wi-Fi, guía, fotos, mensajes de voz, reclamaciones y pedidos',
    'Code PIN du bien': 'Código PIN del alojamiento',
    'Espace Ménage': 'Espacio de limpieza',
    "Checklist, consigne de l'hôte, photos propres & validation du ménage":
      'Lista de tareas, nota del anfitrión, fotos limpias y validación de la limpieza',
    'Code staff': 'Código de personal',
    'Impossible de charger les données hôte.': 'No se pudieron cargar los datos del anfitrión.',

    // ── LuxuryPinPad (verrouillage hub + modale hôte) ──
    'Accès sécurisé': 'Acceso seguro',
    'Hub sécurisé': 'Hub protegido',
    // ── v4.109 Animation pré-arrivée (écran d'accueil hub verrouillé) ──
    'Votre séjour approche': 'Su estancia se acerca',
    'Arrivée prévue': 'Llegada prevista',
    'Ouverture du hub dans': 'El hub se abre en',
    'Le pavé d’accès apparaîtra automatiquement à l’ouverture.': 'El teclado aparecerá automáticamente al abrirse el hub.',
    'jours': 'días',
    'heures': 'horas',
    'min': 'min',
    'Bonjour': 'Hola',
    'Vérification du code…': 'Verificando el código…',
    'Retour': 'Volver',
    "Besoin d'aide ?": '¿Necesitas ayuda?',
    'Contactez votre hôte': 'Contacta a tu anfitrión',
    'Effacer le dernier chiffre': 'Borrar el último dígito',
    'Chiffre': 'Dígito',
    '🔐 Chaque séjour a son code unique — communiqué par votre hôte. Le hub se verrouillera automatiquement à la fin de votre séjour.':
      '🔐 Cada estancia tiene su código único — facilitado por tu anfitrión. El hub se bloqueará automáticamente al final de tu estancia.',

    // ── Hub hôte — Espace Hôte (HostView) ──
    "Retour à l'accueil": 'Volver al inicio',
    '✓ Déverrouillé': '✓ Desbloqueado',
    'Gestion rapide du logement': 'Gestión rápida del alojamiento',
    'Réclamations': 'Reclamaciones',
    'Vocaux': 'Mensajes de voz',
    'Commandes': 'Pedidos',
    '🏠 Mon logement': '🏠 Mi alojamiento',
    '👥 Mes invités': '👥 Mis invitados',
    '🧹 Équipe & prestataires': '🧹 Equipo y proveedores',
    '⚙️ Réglages': '⚙️ Ajustes',
    'Modifier le Wi-Fi': 'Editar el Wi-Fi',
    'Réseau': 'Red',
    'Aucun réseau configuré': 'Sin red configurada',
    'Guidebook': 'Guía de la casa',
    'section(s) — éditer le guide de bienvenue': 'sección(es) — editar la guía de bienvenida',
    'Aucune section — écrire le guide de bienvenue': 'Sin secciones — escribe la guía de bienvenida',
    'Photos de mon hub': 'Fotos de mi hub',
    'photo(s) personnalisée(s) — votre hub 100 % à vous': 'foto(s) personalizada(s) — un hub 100 % tuyo',
    'Remplacez les visuels par vos vraies photos': 'Sustituye los visuales por tus fotos reales',
    'Messages vocaux': 'Mensajes de voz',
    "Bienvenue, veille et jour du départ — votre voix ou l'IA, en 4 langues":
      'Bienvenida, víspera y día de salida — tu voz o la IA, en 4 idiomas',
    'Réclamations en attente': 'Reclamaciones pendientes',
    'écrite(s)': 'escrita(s)',
    'vocale(s)': 'de voz',
    'demande(s) de service': 'solicitud(es) de servicio',
    'Aucune réclamation en attente ✓': 'Ninguna reclamación pendiente ✓',
    'Upselling — Commandes': 'Upselling — Pedidos',
    'commande(s) à confirmer': 'pedido(s) por confirmar',
    'commande(s) — rien à confirmer ✓': 'pedido(s) — nada que confirmar ✓',
    'Aucune commande pour le moment': 'Ningún pedido por ahora',
    "Livre d'or — souvenirs": 'Libro de oro — recuerdos',
    'Validez, épinglez et répondez aux souvenirs de vos voyageurs':
      'Valida, fija y responde a los recuerdos de tus viajeros',
    'Middle-Stay Care': 'Middle-Stay Care',
    'Réassorts & ménages demandés par vos invités en séjour long':
      'Reposiciones y limpiezas solicitadas por tus invitados en estancias largas',
    'Gérer les prestataires': 'Gestionar proveedores',
    'intervenant(s) autour du bien': 'proveedor(es) cerca del alojamiento',
    "Gérer le code PIN d'accès au mode hôte": 'Gestionar el código PIN del modo anfitrión',
    'Supprimer définitivement le message vocal de {name} ? Cette action est irréversible.':
      '¿Eliminar definitivamente el mensaje de voz de {name}? Esta acción es irreversible.',
    'Suppression impossible. Réessayez.': 'No se pudo eliminar. Inténtalo de nuevo.',
    'Message vocal supprimé.': 'Mensaje de voz eliminado.',
    'Impossible de marquer comme résolue.': 'No se pudo marcar como resuelta.',
    'Réclamation marquée résolue ✓': 'Reclamación marcada como resuelta ✓',
    'Action impossible.': 'No se pudo realizar la acción.',
    'Commande confirmée ✓': 'Pedido confirmado ✓',
    'Commande annulée.': 'Pedido cancelado.',
    '{name} activé ✓ — visible côté invité.': '{name} activado ✓ — visible para los invitados.',
    '{name} désactivé — masqué côté invité.': '{name} desactivado — oculto para los invitados.',
    'en attente': 'pendiente(s)',
    'aucun': 'ninguno',

    // ── Dialog Réclamations ──
    'Réclamations écrites (formulaire Hub) et messages vocaux de vos voyageurs.':
      'Reclamaciones escritas (formulario del Hub) y mensajes de voz de tus viajeros.',
    'Écrites': 'Escritas',
    'Aucune réclamation écrite en attente ✓': 'Ninguna reclamación escrita pendiente ✓',
    '⚠️ Urgent': '⚠️ Urgente',
    'Nouvelle': 'Nueva',
    'De :': 'De:',
    'Photo {n} de la réclamation': 'Foto {n} de la reclamación',
    'Marquer résolue': 'Marcar como resuelta',
    'Vocales': 'De voz',
    'Aucun message vocal en attente ✓': 'Ningún mensaje de voz pendiente ✓',
    'lu ✓': 'leído ✓',
    'Supprimer le message vocal de {name}': 'Eliminar el mensaje de voz de {name}',
    'Supprimer ce vocal': 'Eliminar este mensaje de voz',
    'Message de {name}': 'Mensaje de {name}',
    '🎙️ Message vocal de {n} s (audio indisponible en démo)':
      '🎙️ Mensaje de voz de {n} s (audio no disponible en la demo)',

    // ── Dialog Prestataires ──
    'Prestataires autour du bien': 'Proveedores cerca del alojamiento',
    "Dans leur rayon d'intervention. Activez ou désactivez chaque prestataire — un prestataire désactivé est masqué pour vos invités.":
      'Dentro de su radio de servicio. Activa o desactiva cada proveedor — un proveedor desactivado queda oculto para tus invitados.',
    '🔧 Services Propriétaire': '🔧 Servicios del propietario',
    '🥂 Expériences Invité': '🥂 Experiencias para invitados',
    'Aucun prestataire dans le rayon.': 'Ningún proveedor en la zona.',
    'Désactivé': 'Desactivado',
    'Désactiver {name} pour ce bien': 'Desactivar {name} para este alojamiento',
    'Activer {name} pour ce bien': 'Activar {name} para este alojamiento',

    // ── Dialog Wi-Fi ──
    'Renseignez le nom du réseau et le mot de passe.': 'Introduce el nombre de la red y la contraseña.',
    'Échec de la mise à jour.': 'No se pudo actualizar.',
    'Wi-Fi mis à jour ✅': 'Wi-Fi actualizado ✅',
    'Vos voyageurs voient le nouveau réseau immédiatement.': 'Tus viajeros ven la nueva red de inmediato.',
    'Les nouveaux identifiants sont visibles immédiatement par vos voyageurs.':
      'Las nuevas credenciales son visibles de inmediato para tus viajeros.',
    'Nom du réseau (SSID)': 'Nombre de la red (SSID)',
    'Enregistrement…': 'Guardando…',
    'Enregistrer': 'Guardar',

    // ── Dialog Guidebook ──
    'Charger le guidebook universel remplacera le contenu en cours d’édition. Continuer ?':
      'Cargar la guía universal reemplazará el contenido en edición. ¿Continuar?',
    'Guidebook universel indisponible.': 'Guía universal no disponible.',
    '📚 Guidebook universel chargé.': '📚 Guía universal cargada.',
    'Personnalisez-le avec les spécificités de votre bien, puis enregistrez.':
      'Personalízala con los detalles de tu alojamiento y guarda.',
    'Aucun Guidebook actif pour ce bien. Créez-le depuis le dashboard hôte.':
      'No hay guía activa para este alojamiento. Créala desde el panel del anfitrión.',
    'Renseignez un titre et au moins une section.': 'Introduce un título y al menos una sección.',
    'Guidebook mis à jour ✅': 'Guía actualizada ✅',
    'Vos voyageurs voient le nouveau guide immédiatement.': 'Tus viajeros ven la nueva guía de inmediato.',
    'Éditer le Guidebook': 'Editar la guía de la casa',
    'Le guide de bienvenue consulté par vos invités depuis le Hub.':
      'La guía de bienvenida que tus invitados consultan desde el Hub.',
    'Titre du guide': 'Título de la guía',
    'Guide de bienvenue': 'Guía de bienvenida',
    'Sections': 'Secciones',
    'Section {n} — ex : 🔑 Accès, code de la boîte à clés…':
      'Sección {n} — p. ej.: 🔑 Acceso, código de la caja de llaves…',
    'Section {n} du guide': 'Sección {n} de la guía',
    'Supprimer la section {n}': 'Eliminar la sección {n}',
    'Ajouter une section': 'Añadir una sección',
    'Charger le guidebook universel': 'Cargar la guía universal',
    'Enregistrer le guide': 'Guardar la guía',

    // ── Dialog Commandes (Upselling) ──
    'Commandes des invités': 'Pedidos de los invitados',
    "Prestations commandées via l'app invitée. Confirmez ou annulez les demandes en attente.":
      'Servicios pedidos desde la app del invitado. Confirma o cancela las solicitudes pendientes.',
    "Aucune commande pour l'instant": 'Ningún pedido por ahora',
    "Les commandes passées par vos invités depuis l'app apparaîtront ici.":
      'Los pedidos hechos por tus invitados desde la app aparecerán aquí.',
    'Confirmer': 'Confirmar',
    'Annuler': 'Cancelar',
    'Invité :': 'Invitado:',

    // ── Dialog Paramètres PIN ──
    'Les deux codes ne correspondent pas. Recommencez.': 'Los dos códigos no coinciden. Vuelve a empezar.',
    'Échec du changement de PIN.': 'No se pudo cambiar el PIN.',
    'PIN modifié ✅': 'PIN modificado ✅',
    'Votre nouveau code est actif immédiatement.': 'Tu nuevo código está activo de inmediato.',
    'Modifier le code PIN': 'Cambiar el código PIN',
    'Saisissez votre nouveau code à 4 chiffres.': 'Introduce tu nuevo código de 4 dígitos.',
    'Confirmez le nouveau code en le saisissant à nouveau.':
      'Confirma el nuevo código introduciéndolo de nuevo.',
    'Enregistrement du nouveau code…': 'Guardando el nuevo código…',
    'Code saisi :': 'Código introducido:',

    // ── Dialog Photos de mon hub ──
    'Choisissez une image (JPG, PNG…).': 'Elige una imagen (JPG, PNG…).',
    'Format d’image non pris en charge — utilisez JPG ou PNG.':
      'Formato de imagen no compatible — usa JPG o PNG.',
    'Photo trop lourde — réessayez avec une image plus petite.':
      'Foto demasiado pesada — prueba con una imagen más pequeña.',
    'Enregistrement impossible.': 'No se pudo guardar.',
    'Photo enregistrée ✓ — visible immédiatement par vos invités.':
      'Foto guardada ✓ — visible de inmediato para tus invitados.',
    'Suppression impossible.': 'No se pudo eliminar.',
    'Visuel d’illustration restauré.': 'Visual de ilustración restaurado.',
    '📸 Photos de mon hub': '📸 Fotos de mi hub',
    'Remplacez les visuels d’illustration par vos vraies photos — vos invités les voient immédiatement sur la page invitée.':
      'Sustituye los visuales de ilustración por tus fotos reales — tus invitados las ven de inmediato en la página del invitado.',
    'Photo actuelle — {name}': 'Foto actual — {name}',
    'Perso': 'Personalizada',
    'Changer': 'Cambiar',
    'Ajouter': 'Añadir',
    'Retirer la photo — {name}': 'Quitar la foto — {name}',
    'Astuce : photos redimensionnées automatiquement (1024 px, JPEG) — formats JPG, PNG ou WebP conseillés. Format paysage.':
      'Consejo: las fotos se redimensionan automáticamente (1024 px, JPEG) — se recomiendan JPG, PNG o WebP. Formato horizontal.',

    // ── Slots photos du hub (lib/hub-photos) ──
    'Photo de couverture': 'Foto de portada',
    'La grande photo en haut de l’Espace Invité': 'La foto grande en la parte superior del espacio del invitado',
    'Room Services & Expériences': 'Servicios de habitación y experiencias',
    'La carte flagship des commandes': 'La carta estrella de pedidos',
    'Accès & Codes': 'Acceso y Códigos',
    'Serrure, portail, boîte à clés…': 'Cerradura, portón, caja de llaves…',
    'Arrivée pas à pas': 'Llegada paso a paso',
    'La façade ou l’entrée du bâtiment': 'La fachada o la entrada del edificio',
    'Un bel intérieur du logement': 'Un bonito interior del alojamiento',
    'Guide des appareils': 'Guía de aparatos',
    'Machine à café, cuisine, sono…': 'Cafetera, cocina, equipo de sonido…',
    'Kit de survie': 'Kit de emergencia',
    'L’entrée, un placard bien rangé': 'La entrada, un armario bien ordenado',
    'Vidéo de bienvenue': 'Vídeo de bienvenida',
    'Le salon ou une chambre': 'El salón o un dormitorio',
    'Départ tardif': 'Salida tardía',
    'La chambre, un lit frais': 'El dormitorio, una cama recién hecha',
    'Visiter la ville': 'Visitar la ciudad',
    'Un café, un musée du quartier': 'Un café, un museo del barrio',
    'Bouclier d’avis': 'Escudo de reseñas',
    'Un coin chaleureux du séjour': 'Un rincón acogedor de la estancia',
    'SOS & Urgences': 'SOS y Urgencias',
    'Extincteur, trousse de secours…': 'Extintor, botiquín…',
    'Contacter l’hôte': 'Contacta a tu anfitrión',
    'Une cloche, un téléphone, un mot d’accueil': 'Una campana, un teléfono, una nota de bienvenida',
    'Shop the Stay': 'Shop the Stay',
    'Les produits de la maison à vendre': 'Los productos de la casa en venta',

    // ── Dialog Messages vocaux ──
    'PIN incorrect — rouvrez le mode hôte.': 'PIN incorrecto — vuelve a abrir el modo anfitrión.',
    'Impossible de charger vos messages vocaux.': 'No se pudieron cargar tus mensajes de voz.',
    "Écrivez d'abord le message en {lang}.": 'Escribe primero el mensaje en {lang}.',
    'Génération impossible. Réessayez dans un instant.': 'No se pudo generar. Inténtalo en un momento.',
    'Voix {flag} prête ✓ ({n} s)': 'Voz {flag} lista ✓ ({n} s)',
    'Génération terminée ✓ — vos invités entendent la voix dans leur langue.':
      'Generación completada ✓ — tus invitados oyen la voz en su idioma.',
    'Écrivez d’abord votre message en français.': 'Escribe primero tu mensaje en francés.',
    'Traductions prêtes ✓ — relisez et ajustez si besoin.':
      'Traducciones listas ✓ — revísalas y ajústalas si hace falta.',
    'Traduction indisponible pour le moment.': 'Traducción no disponible por ahora.',
    'Trop long — maximum 30 secondes (comme les vocaux).':
      'Demasiado largo — máximo 30 segundos (como los mensajes de voz).',
    'Envoi impossible. Réessayez.': 'No se pudo enviar. Inténtalo de nuevo.',
    'Votre voix est enregistrée ✓ — audible par vos invités.':
      'Tu voz está guardada ✓ — audible para tus invitados.',
    'Voix supprimée — vos invités ne l’entendront plus.':
      'Voz eliminada — tus invitados ya no la oirán.',
    '🎙️ Messages vocaux': '🎙️ Mensajes de voz',
    'Vos invités entendent la voix dans leur langue (repli : français) aux bons moments du séjour. Texte FR → traduction IA → voix générée, ou votre propre enregistrement (30 s max, comme les vocaux).':
      'Tus invitados oyen la voz en su idioma (alternativa: francés) en los momentos clave de la estancia. Texto FR → traducción IA → voz generada, o tu propia grabación (30 s máx, como los mensajes de voz).',
    ' Mode démo : pré-écoute sans enregistrement.': ' Modo demo: escucha previa sin guardar.',
    'Bienvenue': 'Bienvenida',
    'Joué au 1er clic « Mode Invité » — 1× par téléphone':
      'Se reproduce al primer toque de «Modo Invitado» — 1× por teléfono',
    'Souhaitez la bienvenue, présentez-vous, donnez le ton de votre maison.':
      'Da la bienvenida, preséntate y marca el tono de tu casa.',
    'Veille du départ': 'Víspera de la salida',
    '1er scan après l’heure choisie dans la Conciergerie (onglet ⏰, défaut 20 h) la veille du départ — 1× seulement':
      'Primer escaneo tras la hora elegida en la Conserjería (pestaña ⏰, por defecto 20 h) la víspera de la salida — solo 1×',
    'Rappelez : départ tardif possible, préparer les affaires, laisser un avis.':
      'Recuérdales: salida tardía posible, preparar las cosas, dejar una reseña.',
    'Jour du départ': 'Día de salida',
    'Dès l’heure choisie dans la Conciergerie (onglet ⏰, défaut 9 h) le jour J — chaque ouverture de l’espace invité':
      'Desde la hora elegida en la Conserjería (pestaña ⏰, por defecto 9 h) el día de la salida — cada apertura del espacio del invitado',
    'Consignes : départ, clés, ranger la maison, poubelles, linge…':
      'Instrucciones: salida, llaves, ordenar la casa, basura, ropa…',
    'Voix du guidebook': 'Voz de la guía',
    'Écoute libre : bouton « 🎙️ Écouter l’explication de l’hôte » dans le guidebook et l’onglet Messages de l’hôte':
      'Escucha libre: botón «🎙️ Escuchar la explicación del anfitrión» en la guía y en la pestaña Mensajes del anfitrión',
    'Expliquez votre guidebook à voix haute — en français uniquement.':
      'Explica tu guía en voz alta — solo en francés.',
    '🤖 IA': '🤖 IA',
    '🎙️ Votre voix': '🎙️ Tu voz',
    'Votre message en français…': 'Tu mensaje en francés…',
    'Traduction (éditable) — ou « 🤖 Traduire » ci-dessous.':
      'Traducción (editable) — o «🤖 Traducir» abajo.',
    'Message {lang}': 'Mensaje {lang}',
    'Génération… (5-15 s)': 'Generando… (5-15 s)',
    '🎙️ Générer la voix': '🎙️ Generar la voz',
    'Ma propre voix (fichier audio ≤ 30 s)': 'Mi propia voz (archivo de audio ≤ 30 s)',
    'Supprimer cette voix': 'Eliminar esta voz',
    'Supprimer la voix {lang}': 'Eliminar la voz {lang}',
    'Pré-écoute {lang}': 'Escucha previa {lang}',
    '📖 La voix du guidebook est en français uniquement — écrivez votre texte ci-dessus puis générez la voix.':
      '📖 La voz de la guía es solo en francés — escribe tu texto arriba y genera la voz.',
    'Traduction…': 'Traduciendo…',
    'Traduire en 🇬🇧 · 🇪🇸 · 🇸🇦': 'Traducir a 🇬🇧 · 🇪🇸 · 🇸🇦',
    'Génération {flag}… (≈ 1 min)': 'Generando {flag}… (≈ 1 min)',
    'Générer les 4 voix': 'Generar las 4 voces',
    'Générer les 4 voix (déjà {n}/4)': 'Generar las 4 voces ({n}/4 listas)',
    'Les voix se jouent automatiquement côté invité : bienvenue au 1er clic « Mode Invité », veille après 20 h, jour J dès 9 h. Régénérer une voix la rejoue une nouvelle fois sur les téléphones déjà venus.':
      'Las voces se reproducen automáticamente en el lado del invitado: bienvenida al primer toque de «Modo Invitado», víspera después de las 20 h, día de salida desde las 9 h. Regenerar una voz la reproduce otra vez en los teléfonos que ya visitaron.',
  },

  // ════════════════════════════════════════════════════════════
  // DEUTSCH
  // ════════════════════════════════════════════════════════════
  de: {
    // ── Communs ──
    'Choisir la langue': 'Sprache wählen',
    'Propulsé par': 'Bereitgestellt von',
    'Erreur réseau.': 'Netzwerkfehler.',
    'Erreur réseau. Réessayez.': 'Netzwerkfehler. Bitte erneut versuchen.',
    'Connexion impossible. Réessayez.': 'Verbindung nicht möglich. Bitte erneut versuchen.',
    'Code incorrect. Veuillez réessayer.': 'Falscher Code. Bitte versuchen Sie es erneut.',

    // ── Page de connexion ──
    'Retour au site': 'Zurück zur Website',
    'La conciergerie digitale': 'Der digitale Concierge-Service',
    'commence par un QR': 'beginnt mit einem QR-Code',
    'La conciergerie digitale de vos locations. Wi-Fi, guidebook, check-out et prestataires : une seule plaque QR pour vos invités, un tableau de bord pour vous.':
      'Der digitale Concierge-Service für Ihre Ferienwohnungen. WLAN, Hausbuch, Check-out und Dienstleister: eine einzige QR-Plakette für Ihre Gäste, ein Dashboard für Sie.',
    'QR Codes intelligents': 'Intelligente QR-Codes',
    'Scan instantané': 'Sofortiges Scannen',
    'Gestion multi-logements': 'Verwaltung mehrerer Objekte',
    'Prestataires intégrés': 'Integrierte Dienstleister',
    'Hôtes connectés': 'Vernetzte Gastgeber',
    'QR Codes scannés/mois': 'Gescannte QR-Codes/Monat',
    'Disponibilité': 'Verfügbarkeit',
    'Connexion': 'Anmelden',
    'Créer un compte': 'Konto erstellen',
    'Accédez à votre espace RoomScan': 'Zugang zu Ihrem RoomScan-Bereich',
    'Rejoignez les 2 500+ hôtes qui automatisent leurs locations':
      'Schließen Sie sich den über 2.500 Gastgebern an, die ihre Vermietungen automatisieren',
    'Nom complet': 'Vollständiger Name',
    'Email': 'E-Mail',
    'vous@exemple.com': 'sie@beispiel.de',
    'Mot de passe': 'Passwort',
    '8 caractères min. — lettres + chiffres': 'Mind. 8 Zeichen — Buchstaben + Zahlen',
    'Se connecter': 'Anmelden',
    "S'inscrire": 'Registrieren',
    'Mot de passe oublié ?': 'Passwort vergessen?',
    'Pas encore de compte ?': 'Noch kein Konto?',
    'Déjà un compte ?': 'Schon ein Konto?',
    'Conciergerie digitale pour hôtes': 'Digitaler Concierge-Service für Gastgeber',
    "Erreur lors de l'inscription": 'Fehler bei der Registrierung',
    'Email ou mot de passe incorrect': 'E-Mail oder Passwort falsch',
    'Erreur de connexion au serveur': 'Verbindungsfehler zum Server',

    // ── Shell dashboard hôte ──
    'Pilotage': 'Steuerung',
    'Mes biens': 'Meine Objekte',
    'Services': 'Services',
    'Business': 'Business',
    "Vue d'ensemble": 'Überblick',
    'Calendrier': 'Kalender',
    'Mes tâches': 'Meine Aufgaben',
    'Messages': 'Nachrichten',
    'Invités': 'Gäste',
    'Propriétés': 'Objekte',
    'Plaques QR': 'QR-Plaketten',
    'Expérience Invité': 'Gäste-Erlebnis',
    'Notifications': 'Benachrichtigungen',
    'Souvenirs': 'Souvenirs',
    'Conciergerie': 'Concierge',
    'Ménage & Stock': 'Reinigung & Bestand',
    'Prestataires': 'Dienstleister',
    'Équipe': 'Team',
    'Commandes & Revenus': 'Bestellungen & Umsätze',
    'Facturation': 'Abrechnung',
    'Paramètres': 'Einstellungen',
    'Espace Hôte': 'Gastgeber-Bereich',
    'Invité': 'Gast',
    'Se déconnecter': 'Abmelden',
    'Quitter': 'Abmelden',
    'Menu': 'Menü',
    'Ouvrir le menu': 'Menü öffnen',
    "Navigation de l'espace hôte": 'Navigation des Gastgeber-Bereichs',
    'Retour au site RoomScan': 'Zurück zur RoomScan-Website',
    'Toutes les propriétés': 'Alle Objekte',
    'Aucune propriété': 'Kein Objekt',
    'Propriété sélectionnée': 'Ausgewähltes Objekt',
    "Aucune propriété pour l'instant — ajoutez-en une pour démarrer.":
      'Noch kein Objekt — fügen Sie eines hinzu, um loszulegen.',
    'Ajouter une propriété': 'Objekt hinzufügen',
    'La conciergerie digitale de vos locations, sans application':
      'Der digitale Concierge-Service für Ihre Vermietungen — ohne App',

    // ── Hub hôte — modale d'accès PIN ──
    'Accès protégé — saisie du code': 'Geschützter Zugang — Codeeingabe',
    'Choisissez votre espace, puis saisissez votre code à 4 chiffres.':
      'Wählen Sie Ihren Bereich und geben Sie Ihren 4-stelligen Code ein.',
    'Accès protégé': 'Geschützter Zugang',
    'Mode hôte & ménage': 'Gastgeber- & Reinigungsmodus',
    '🔑 Saisissez le code PIN de votre logement': '🔑 Geben Sie den PIN-Code Ihrer Unterkunft ein',
    '🧹 Saisissez le code staff de votre équipe': '🧹 Geben Sie den Team-Code Ihrer Crew ein',
    'Code staff incorrect.': 'Falscher Team-Code.',
    'Votre logement': 'Ihre Unterkunft',
    "Choix de l'espace d'accès": 'Auswahl des Zugangsbereichs',
    'Espace Hôte 🔐': 'Gastgeber-Bereich 🔐',
    'Wi-Fi, guidebook, photos, messages vocaux, réclamations & commandes':
      'WLAN, Hausbuch, Fotos, Sprachnachrichten, Beschwerden & Bestellungen',
    'Code PIN du bien': 'PIN-Code des Objekts',
    'Espace Ménage': 'Reinigungs-Bereich',
    "Checklist, consigne de l'hôte, photos propres & validation du ménage":
      'Checkliste, Hinweis des Gastgebers, saubere Fotos & Freigabe der Reinigung',
    'Code staff': 'Team-Code',
    'Impossible de charger les données hôte.': 'Gastgeberdaten konnten nicht geladen werden.',

    // ── LuxuryPinPad (verrouillage hub + modale hôte) ──
    'Accès sécurisé': 'Sicherer Zugang',
    'Hub sécurisé': 'Gesicherter Hub',
    // ── v4.109 Animation pré-arrivée (écran d'accueil hub verrouillé) ──
    'Votre séjour approche': 'Ihr Aufenthalt rückt näher',
    'Arrivée prévue': 'Erwartete Ankunft',
    'Ouverture du hub dans': 'Hub öffnet sich in',
    'Le pavé d’accès apparaîtra automatiquement à l’ouverture.': 'Das Tastenfeld erscheint automatisch bei der Öffnung.',
    'jours': 'Tage',
    'heures': 'Stunden',
    'min': 'Min',
    'Bonjour': 'Hallo',
    'Vérification du code…': 'Code wird geprüft…',
    'Retour': 'Zurück',
    "Besoin d'aide ?": 'Hilfe benötigt?',
    'Contactez votre hôte': 'Kontaktieren Sie Ihren Gastgeber',
    'Effacer le dernier chiffre': 'Letzte Ziffer löschen',
    'Chiffre': 'Ziffer',
    '🔐 Chaque séjour a son code unique — communiqué par votre hôte. Le hub se verrouillera automatiquement à la fin de votre séjour.':
      '🔐 Jeder Aufenthalt hat seinen eigenen Code — mitgeteilt von Ihrem Gastgeber. Der Hub wird am Ende Ihres Aufenthalts automatisch gesperrt.',

    // ── Hub hôte — Espace Hôte (HostView) ──
    "Retour à l'accueil": 'Zurück zur Startseite',
    '✓ Déverrouillé': '✓ Entsperrt',
    'Gestion rapide du logement': 'Schnelle Objektverwaltung',
    'Réclamations': 'Beschwerden',
    'Vocaux': 'Sprachnachrichten',
    'Commandes': 'Bestellungen',
    '🏠 Mon logement': '🏠 Meine Unterkunft',
    '👥 Mes invités': '👥 Meine Gäste',
    '🧹 Équipe & prestataires': '🧹 Team & Dienstleister',
    '⚙️ Réglages': '⚙️ Einstellungen',
    'Modifier le Wi-Fi': 'WLAN bearbeiten',
    'Réseau': 'Netzwerk',
    'Aucun réseau configuré': 'Kein Netzwerk konfiguriert',
    'Guidebook': 'Hausbuch',
    'section(s) — éditer le guide de bienvenue': 'Abschnitt/Abschnitte — Willkommensführer bearbeiten',
    'Aucune section — écrire le guide de bienvenue':
      'Noch kein Abschnitt — Willkommensführer schreiben',
    'Photos de mon hub': 'Meine Hub-Fotos',
    'photo(s) personnalisée(s) — votre hub 100 % à vous':
      'eigene Foto(s) — ein Hub, der 100 % Ihnen gehört',
    'Remplacez les visuels par vos vraies photos': 'Ersetzen Sie die Bilder durch Ihre echten Fotos',
    'Messages vocaux': 'Sprachnachrichten',
    "Bienvenue, veille et jour du départ — votre voix ou l'IA, en 4 langues":
      'Willkommen, Vorabend der Abreise und Abreisetag — Ihre Stimme oder KI, in 4 Sprachen',
    'Réclamations en attente': 'Offene Beschwerden',
    'écrite(s)': 'schriftliche',
    'vocale(s)': 'Sprachnachricht(en)',
    'demande(s) de service': 'Serviceanfrage(n)',
    'Aucune réclamation en attente ✓': 'Keine offenen Beschwerden ✓',
    'Upselling — Commandes': 'Upselling — Bestellungen',
    'commande(s) à confirmer': 'Bestellung(en) zu bestätigen',
    'commande(s) — rien à confirmer ✓': 'Bestellung(en) — nichts zu bestätigen ✓',
    'Aucune commande pour le moment': 'Noch keine Bestellungen',
    "Livre d'or — souvenirs": 'Goldenes Gästebuch — Erinnerungen',
    'Validez, épinglez et répondez aux souvenirs de vos voyageurs':
      'Erinnerungen Ihrer Gäste freigeben, anpinnen und beantworten',
    'Middle-Stay Care': 'Middle-Stay Care',
    'Réassorts & ménages demandés par vos invités en séjour long':
      'Nachfüllungen & Reinigungen, gewünscht von Gästen bei langen Aufenthalten',
    'Gérer les prestataires': 'Dienstleister verwalten',
    'intervenant(s) autour du bien': 'Dienstleister rund um das Objekt',
    "Gérer le code PIN d'accès au mode hôte": 'Den PIN-Code des Gastgebermodus verwalten',
    'Supprimer définitivement le message vocal de {name} ? Cette action est irréversible.':
      'Die Sprachnachricht von {name} endgültig löschen? Diese Aktion ist irreversibel.',
    'Suppression impossible. Réessayez.': 'Löschen nicht möglich. Bitte erneut versuchen.',
    'Message vocal supprimé.': 'Sprachnachricht gelöscht.',
    'Impossible de marquer comme résolue.': 'Konnte nicht als gelöst markiert werden.',
    'Réclamation marquée résolue ✓': 'Beschwerde als gelöst markiert ✓',
    'Action impossible.': 'Aktion nicht möglich.',
    'Commande confirmée ✓': 'Bestellung bestätigt ✓',
    'Commande annulée.': 'Bestellung storniert.',
    '{name} activé ✓ — visible côté invité.': '{name} aktiviert ✓ — für Gäste sichtbar.',
    '{name} désactivé — masqué côté invité.': '{name} deaktiviert — für Gäste ausgeblendet.',
    'en attente': 'ausstehend',
    'aucun': 'keine',

    // ── Dialog Réclamations ──
    'Réclamations écrites (formulaire Hub) et messages vocaux de vos voyageurs.':
      'Schriftliche Beschwerden (Hub-Formular) und Sprachnachrichten Ihrer Gäste.',
    'Écrites': 'Schriftliche',
    'Aucune réclamation écrite en attente ✓': 'Keine schriftlichen Beschwerden offen ✓',
    '⚠️ Urgent': '⚠️ Dringend',
    'Nouvelle': 'Neu',
    'De :': 'Von:',
    'Photo {n} de la réclamation': 'Beschwerdefoto {n}',
    'Marquer résolue': 'Als gelöst markieren',
    'Vocales': 'Sprachnachrichten',
    'Aucun message vocal en attente ✓': 'Keine offenen Sprachnachrichten ✓',
    'lu ✓': 'gelesen ✓',
    'Supprimer le message vocal de {name}': 'Sprachnachricht von {name} löschen',
    'Supprimer ce vocal': 'Diese Sprachnachricht löschen',
    'Message de {name}': 'Nachricht von {name}',
    '🎙️ Message vocal de {n} s (audio indisponible en démo)':
      '🎙️ Sprachnachricht, {n} s (Audio in der Demo nicht verfügbar)',

    // ── Dialog Prestataires ──
    'Prestataires autour du bien': 'Dienstleister rund um das Objekt',
    "Dans leur rayon d'intervention. Activez ou désactivez chaque prestataire — un prestataire désactivé est masqué pour vos invités.":
      'Innerhalb ihres Einsatzradius. Aktivieren oder deaktivieren Sie jeden Dienstleister — ein deaktivierter Dienstleister ist für Ihre Gäste ausgeblendet.',
    '🔧 Services Propriétaire': '🔧 Eigentümer-Services',
    '🥂 Expériences Invité': '🥂 Gäste-Erlebnisse',
    'Aucun prestataire dans le rayon.': 'Kein Dienstleister im Umkreis.',
    'Désactivé': 'Deaktiviert',
    'Désactiver {name} pour ce bien': '{name} für dieses Objekt deaktivieren',
    'Activer {name} pour ce bien': '{name} für dieses Objekt aktivieren',

    // ── Dialog Wi-Fi ──
    'Renseignez le nom du réseau et le mot de passe.': 'Bitte Netzwerknamen und Passwort eingeben.',
    'Échec de la mise à jour.': 'Aktualisierung fehlgeschlagen.',
    'Wi-Fi mis à jour ✅': 'WLAN aktualisiert ✅',
    'Vos voyageurs voient le nouveau réseau immédiatement.':
      'Ihre Gäste sehen das neue Netzwerk sofort.',
    'Les nouveaux identifiants sont visibles immédiatement par vos voyageurs.':
      'Die neuen Zugangsdaten sind sofort für Ihre Gäste sichtbar.',
    'Nom du réseau (SSID)': 'Netzwerkname (SSID)',
    'Enregistrement…': 'Wird gespeichert…',
    'Enregistrer': 'Speichern',

    // ── Dialog Guidebook ──
    'Charger le guidebook universel remplacera le contenu en cours d’édition. Continuer ?':
      'Das Laden des universellen Handbuchs ersetzt den aktuell bearbeiteten Inhalt. Fortfahren?',
    'Guidebook universel indisponible.': 'Universelles Handbuch nicht verfügbar.',
    '📚 Guidebook universel chargé.': '📚 Universelles Handbuch geladen.',
    'Personnalisez-le avec les spécificités de votre bien, puis enregistrez.':
      'Passen Sie es mit den Besonderheiten Ihres Objekts an und speichern Sie.',
    'Aucun Guidebook actif pour ce bien. Créez-le depuis le dashboard hôte.':
      'Kein aktives Hausbuch für dieses Objekt. Erstellen Sie es im Gastgeber-Dashboard.',
    'Renseignez un titre et au moins une section.': 'Bitte Titel und mindestens einen Abschnitt angeben.',
    'Guidebook mis à jour ✅': 'Hausbuch aktualisiert ✅',
    'Vos voyageurs voient le nouveau guide immédiatement.':
      'Ihre Gäste sehen den neuen Leitfaden sofort.',
    'Éditer le Guidebook': 'Hausbuch bearbeiten',
    'Le guide de bienvenue consulté par vos invités depuis le Hub.':
      'Der Willkommensführer, den Ihre Gäste im Hub lesen.',
    'Titre du guide': 'Titel des Führers',
    'Guide de bienvenue': 'Willkommensführer',
    'Sections': 'Abschnitte',
    'Section {n} — ex : 🔑 Accès, code de la boîte à clés…':
      'Abschnitt {n} — z. B.: 🔑 Zugang, Code der Schlüsselbox…',
    'Section {n} du guide': 'Abschnitt {n} des Führers',
    'Supprimer la section {n}': 'Abschnitt {n} löschen',
    'Ajouter une section': 'Abschnitt hinzufügen',
    'Charger le guidebook universel': 'Universelles Handbuch laden',
    'Enregistrer le guide': 'Leitfaden speichern',

    // ── Dialog Commandes (Upselling) ──
    'Commandes des invités': 'Gäste-Bestellungen',
    "Prestations commandées via l'app invitée. Confirmez ou annulez les demandes en attente.":
      'Über die Gäste-App bestellte Leistungen. Bestätigen oder stornieren Sie offene Anfragen.',
    "Aucune commande pour l'instant": 'Noch keine Bestellungen',
    "Les commandes passées par vos invités depuis l'app apparaîtront ici.":
      'Bestellungen Ihrer Gäste aus der App erscheinen hier.',
    'Confirmer': 'Bestätigen',
    'Annuler': 'Abbrechen',
    'Invité :': 'Gast:',

    // ── Dialog Paramètres PIN ──
    'Les deux codes ne correspondent pas. Recommencez.':
      'Die beiden Codes stimmen nicht überein. Bitte erneut versuchen.',
    'Échec du changement de PIN.': 'PIN-Änderung fehlgeschlagen.',
    'PIN modifié ✅': 'PIN geändert ✅',
    'Votre nouveau code est actif immédiatement.': 'Ihr neuer Code ist sofort aktiv.',
    'Modifier le code PIN': 'PIN-Code ändern',
    'Saisissez votre nouveau code à 4 chiffres.': 'Geben Sie Ihren neuen 4-stelligen Code ein.',
    'Confirmez le nouveau code en le saisissant à nouveau.':
      'Bestätigen Sie den neuen Code durch erneute Eingabe.',
    'Enregistrement du nouveau code…': 'Neuer Code wird gespeichert…',
    'Code saisi :': 'Eingegebener Code:',

    // ── Dialog Photos de mon hub ──
    'Choisissez une image (JPG, PNG…).': 'Wählen Sie ein Bild (JPG, PNG…).',
    'Format d’image non pris en charge — utilisez JPG ou PNG.':
      'Bildformat nicht unterstützt — bitte JPG oder PNG verwenden.',
    'Photo trop lourde — réessayez avec une image plus petite.':
      'Foto zu groß — versuchen Sie ein kleineres Bild.',
    'Enregistrement impossible.': 'Speichern nicht möglich.',
    'Photo enregistrée ✓ — visible immédiatement par vos invités.':
      'Foto gespeichert ✓ — sofort für Ihre Gäste sichtbar.',
    'Suppression impossible.': 'Löschen nicht möglich.',
    'Visuel d’illustration restauré.': 'Illustrationsbild wiederhergestellt.',
    '📸 Photos de mon hub': '📸 Meine Hub-Fotos',
    'Remplacez les visuels d’illustration par vos vraies photos — vos invités les voient immédiatement sur la page invitée.':
      'Ersetzen Sie die Illustrationsbilder durch Ihre echten Fotos — Ihre Gäste sehen sie sofort auf der Gästeseite.',
    'Photo actuelle — {name}': 'Aktuelles Foto — {name}',
    'Perso': 'Eigenes',
    'Changer': 'Ändern',
    'Ajouter': 'Hinzufügen',
    'Retirer la photo — {name}': 'Foto entfernen — {name}',
    'Astuce : photos redimensionnées automatiquement (1024 px, JPEG) — formats JPG, PNG ou WebP conseillés. Format paysage.':
      'Tipp: Fotos werden automatisch skaliert (1024 px, JPEG) — JPG, PNG oder WebP empfohlen. Querformat.',

    // ── Slots photos du hub (lib/hub-photos) ──
    'Photo de couverture': 'Titelfoto',
    'La grande photo en haut de l’Espace Invité': 'Das große Foto oben im Gäste-Bereich',
    'Room Services & Expériences': 'Room-Service & Erlebnisse',
    'La carte flagship des commandes': 'Die Hauptkarte für Bestellungen',
    'Accès & Codes': 'Zugang & Codes',
    'Serrure, portail, boîte à clés…': 'Schloss, Tor, Schlüsselbox…',
    'Arrivée pas à pas': 'Ankunft Schritt für Schritt',
    'La façade ou l’entrée du bâtiment': 'Die Fassade oder der Gebäudeeingang',
    'Un bel intérieur du logement': 'Ein schöner Innenraum der Wohnung',
    'Guide des appareils': 'Geräteanleitung',
    'Machine à café, cuisine, sono…': 'Kaffeemaschine, Küche, Anlage…',
    'Kit de survie': 'Überlebens-Set',
    'L’entrée, un placard bien rangé': 'Der Eingang, ein aufgeräumter Schrank',
    'Vidéo de bienvenue': 'Willkommensvideo',
    'Le salon ou une chambre': 'Das Wohnzimmer oder ein Schlafzimmer',
    'Départ tardif': 'Später Check-out',
    'La chambre, un lit frais': 'Das Schlafzimmer, ein frisch bezogenes Bett',
    'Visiter la ville': 'Die Stadt erkunden',
    'Un café, un musée du quartier': 'Ein Café, ein Museum im Viertel',
    'Bouclier d’avis': 'Bewertungsschutz',
    'Un coin chaleureux du séjour': 'Eine gemütliche Ecke der Wohnung',
    'SOS & Urgences': 'SOS & Notfall',
    'Extincteur, trousse de secours…': 'Feuerlöscher, Erste-Hilfe-Set…',
    'Contacter l’hôte': 'Gastgeber kontaktieren',
    'Une cloche, un téléphone, un mot d’accueil': 'Eine Glocke, ein Telefon, eine Willkommensnotiz',
    'Shop the Stay': 'Shop the Stay',
    'Les produits de la maison à vendre': 'Die Produkte der Wohnung im Verkauf',

    // ── Dialog Messages vocaux ──
    'PIN incorrect — rouvrez le mode hôte.': 'Falscher PIN — Gastgebermodus erneut öffnen.',
    'Impossible de charger vos messages vocaux.': 'Ihre Sprachnachrichten konnten nicht geladen werden.',
    "Écrivez d'abord le message en {lang}.": 'Schreiben Sie zuerst die Nachricht auf {lang}.',
    'Génération impossible. Réessayez dans un instant.':
      'Generierung nicht möglich. Versuchen Sie es gleich erneut.',
    'Voix {flag} prête ✓ ({n} s)': 'Stimme {flag} bereit ✓ ({n} s)',
    'Génération terminée ✓ — vos invités entendent la voix dans leur langue.':
      'Generierung abgeschlossen ✓ — Ihre Gäste hören die Stimme in ihrer Sprache.',
    'Écrivez d’abord votre message en français.':
      'Schreiben Sie zuerst Ihre Nachricht auf Französisch.',
    'Traductions prêtes ✓ — relisez et ajustez si besoin.':
      'Übersetzungen bereit ✓ — bitte prüfen und bei Bedarf anpassen.',
    'Traduction indisponible pour le moment.': 'Übersetzung derzeit nicht verfügbar.',
    'Trop long — maximum 30 secondes (comme les vocaux).':
      'Zu lang — maximal 30 Sekunden (wie Sprachnachrichten).',
    'Envoi impossible. Réessayez.': 'Senden nicht möglich. Bitte erneut versuchen.',
    'Votre voix est enregistrée ✓ — audible par vos invités.':
      'Ihre Stimme ist gespeichert ✓ — für Ihre Gäste hörbar.',
    'Voix supprimée — vos invités ne l’entendront plus.':
      'Stimme gelöscht — Ihre Gäste werden sie nicht mehr hören.',
    '🎙️ Messages vocaux': '🎙️ Sprachnachrichten',
    'Vos invités entendent la voix dans leur langue (repli : français) aux bons moments du séjour. Texte FR → traduction IA → voix générée, ou votre propre enregistrement (30 s max, comme les vocaux).':
      'Ihre Gäste hören die Stimme in ihrer Sprache (Ersatz: Französisch) zu den passenden Momenten des Aufenthalts. FR-Text → KI-Übersetzung → generierte Stimme, oder Ihre eigene Aufnahme (max. 30 s, wie Sprachnachrichten).',
    ' Mode démo : pré-écoute sans enregistrement.': ' Demo-Modus: Vorschau ohne Speichern.',
    'Bienvenue': 'Willkommen',
    'Joué au 1er clic « Mode Invité » — 1× par téléphone':
      'Wird beim ersten Antippen von „Gäste-Modus“ abgespielt — 1× pro Telefon',
    'Souhaitez la bienvenue, présentez-vous, donnez le ton de votre maison.':
      'Begrüßen Sie Ihre Gäste, stellen Sie sich vor, prägen Sie den Ton Ihres Zuhauses.',
    'Veille du départ': 'Vorabend der Abreise',
    '1er scan après l’heure choisie dans la Conciergerie (onglet ⏰, défaut 20 h) la veille du départ — 1× seulement':
      'Erster Scan nach der in der Concierge gewählten Uhrzeit (Tab ⏰, Standard 20 Uhr) am Vorabend der Abreise — nur 1×',
    'Rappelez : départ tardif possible, préparer les affaires, laisser un avis.':
      'Erinnern Sie: später Check-out möglich, Sachen packen, Bewertung hinterlassen.',
    'Jour du départ': 'Abreisetag',
    'Dès l’heure choisie dans la Conciergerie (onglet ⏰, défaut 9 h) le jour J — chaque ouverture de l’espace invité':
      'Ab der in der Concierge gewählten Uhrzeit (Tab ⏰, Standard 9 Uhr) am Tag selbst — bei jedem Öffnen des Gäste-Bereichs',
    'Consignes : départ, clés, ranger la maison, poubelles, linge…':
      'Hinweise: Abreise, Schlüssel, aufräumen, Müll, Wäsche…',
    'Voix du guidebook': 'Hausbuch-Stimme',
    'Écoute libre : bouton « 🎙️ Écouter l’explication de l’hôte » dans le guidebook et l’onglet Messages de l’hôte':
      'Frei anhörbar: Taste „🎙️ Erklärung des Gastgebers anhören“ im Hausbuch und im Tab Nachrichten des Gastgebers',
    'Expliquez votre guidebook à voix haute — en français uniquement.':
      'Erklären Sie Ihr Hausbuch laut — nur auf Französisch.',
    '🤖 IA': '🤖 KI',
    '🎙️ Votre voix': '🎙️ Ihre Stimme',
    'Votre message en français…': 'Ihre Nachricht auf Französisch…',
    'Traduction (éditable) — ou « 🤖 Traduire » ci-dessous.':
      'Übersetzung (editierbar) — oder „🤖 Übersetzen“ unten.',
    'Message {lang}': 'Nachricht {lang}',
    'Génération… (5-15 s)': 'Generierung… (5-15 s)',
    '🎙️ Générer la voix': '🎙️ Stimme generieren',
    'Ma propre voix (fichier audio ≤ 30 s)': 'Eigene Stimme (Audiodatei ≤ 30 s)',
    'Supprimer cette voix': 'Diese Stimme löschen',
    'Supprimer la voix {lang}': 'Stimme {lang} löschen',
    'Pré-écoute {lang}': 'Vorschau {lang}',
    '📖 La voix du guidebook est en français uniquement — écrivez votre texte ci-dessus puis générez la voix.':
      '📖 Die Hausbuch-Stimme ist nur auf Französisch — schreiben Sie Ihren Text oben und generieren Sie die Stimme.',
    'Traduction…': 'Übersetzung…',
    'Traduire en 🇬🇧 · 🇪🇸 · 🇸🇦': 'Übersetzen in 🇬🇧 · 🇪🇸 · 🇸🇦',
    'Génération {flag}… (≈ 1 min)': 'Generierung {flag}… (≈ 1 min)',
    'Générer les 4 voix': 'Alle 4 Stimmen generieren',
    'Générer les 4 voix (déjà {n}/4)': 'Alle 4 Stimmen generieren ({n}/4 fertig)',
    'Les voix se jouent automatiquement côté invité : bienvenue au 1er clic « Mode Invité », veille après 20 h, jour J dès 9 h. Régénérer une voix la rejoue une nouvelle fois sur les téléphones déjà venus.':
      'Die Stimmen werden auf der Gästeseite automatisch abgespielt: Willkommen beim ersten Antippen von „Gäste-Modus“, Vorabend nach 20 Uhr, Abreisetag ab 9 Uhr. Eine Stimme neu zu generieren spielt sie auf bereits besuchten Telefonen noch einmal ab.',
  },

  // ════════════════════════════════════════════════════════════
  // 中文（简体）
  // ════════════════════════════════════════════════════════════
  zh: {
    // ── Communs ──
    'Choisir la langue': '选择语言',
    'Propulsé par': '技术支持',
    'Erreur réseau.': '网络错误。',
    'Erreur réseau. Réessayez.': '网络错误，请重试。',
    'Connexion impossible. Réessayez.': '无法连接，请重试。',
    'Code incorrect. Veuillez réessayer.': '代码错误，请重试。',

    // ── Page de connexion ──
    'Retour au site': '返回网站',
    'La conciergerie digitale': '数字礼宾服务',
    'commence par un QR': '从一个二维码开始',
    'La conciergerie digitale de vos locations. Wi-Fi, guidebook, check-out et prestataires : une seule plaque QR pour vos invités, un tableau de bord pour vous.':
      '为您的出租房源打造的数字礼宾服务。Wi-Fi、房屋指南、退房与服务商：一块二维码铭牌服务房客，一个控制台留给您。',
    'QR Codes intelligents': '智能二维码',
    'Scan instantané': '即时扫码',
    'Gestion multi-logements': '多房源管理',
    'Prestataires intégrés': '服务商集成',
    'Hôtes connectés': '已接入的房东',
    'QR Codes scannés/mois': '每月扫码次数',
    'Disponibilité': '可用性',
    'Connexion': '登录',
    'Créer un compte': '创建账户',
    'Accédez à votre espace RoomScan': '进入您的 RoomScan 空间',
    'Rejoignez les 2 500+ hôtes qui automatisent leurs locations': '加入 2 500 多位实现出租自动化的房东',
    'Nom complet': '姓名',
    'Email': '邮箱',
    'vous@exemple.com': 'you@example.com',
    'Mot de passe': '密码',
    '8 caractères min. — lettres + chiffres': '至少 8 个字符——字母 + 数字',
    'Se connecter': '登录',
    "S'inscrire": '注册',
    'Mot de passe oublié ?': '忘记密码？',
    'Pas encore de compte ?': '还没有账户？',
    'Déjà un compte ?': '已有账户？',
    'Conciergerie digitale pour hôtes': '面向房东的数字礼宾服务',
    "Erreur lors de l'inscription": '注册失败',
    'Email ou mot de passe incorrect': '邮箱或密码错误',
    'Erreur de connexion au serveur': '服务器连接错误',

    // ── Shell dashboard hôte ──
    'Pilotage': '运营',
    'Mes biens': '我的房源',
    'Services': '服务',
    'Business': '经营',
    "Vue d'ensemble": '总览',
    'Calendrier': '日历',
    'Mes tâches': '我的任务',
    'Messages': '消息',
    'Invités': '房客',
    'Propriétés': '房源',
    'Plaques QR': '二维码铭牌',
    'Expérience Invité': '房客体验',
    'Notifications': '通知',
    'Souvenirs': '纪念品',
    'Conciergerie': '礼宾服务',
    'Ménage & Stock': '保洁与库存',
    'Prestataires': '服务商',
    'Équipe': '团队',
    'Commandes & Revenus': '订单与收入',
    'Facturation': '账单',
    'Paramètres': '设置',
    'Espace Hôte': '房东空间',
    'Invité': '访客',
    'Se déconnecter': '退出登录',
    'Quitter': '退出',
    'Menu': '菜单',
    'Ouvrir le menu': '打开菜单',
    "Navigation de l'espace hôte": '房东空间导航',
    'Retour au site RoomScan': '返回 RoomScan 网站',
    'Toutes les propriétés': '所有房源',
    'Aucune propriété': '暂无房源',
    'Propriété sélectionnée': '当前房源',
    "Aucune propriété pour l'instant — ajoutez-en une pour démarrer.": '暂无房源——添加一个即可开始。',
    'Ajouter une propriété': '添加房源',
    'La conciergerie digitale de vos locations, sans application': '您出租房源的数字礼宾服务，无需安装应用',

    // ── Hub hôte — modale d'accès PIN ──
    'Accès protégé — saisie du code': '受保护访问——输入代码',
    'Choisissez votre espace, puis saisissez votre code à 4 chiffres.': '请选择您的空间，然后输入 4 位数字代码。',
    'Accès protégé': '受保护访问',
    'Mode hôte & ménage': '房东与保洁模式',
    '🔑 Saisissez le code PIN de votre logement': '🔑 请输入您房源的 PIN 码',
    '🧹 Saisissez le code staff de votre équipe': '🧹 请输入您团队的工作人员代码',
    'Code staff incorrect.': '工作人员代码错误。',
    'Votre logement': '您的住所',
    "Choix de l'espace d'accès": '选择访问空间',
    'Espace Hôte 🔐': '房东空间 🔐',
    'Wi-Fi, guidebook, photos, messages vocaux, réclamations & commandes': 'Wi-Fi、房屋指南、照片、语音留言、投诉与订单',
    'Code PIN du bien': '房源 PIN 码',
    'Espace Ménage': '保洁空间',
    "Checklist, consigne de l'hôte, photos propres & validation du ménage": '清单、房东留言、清洁照片与完成确认',
    'Code staff': '工作人员代码',
    'Impossible de charger les données hôte.': '无法加载房东数据。',

    // ── LuxuryPinPad (verrouillage hub + modale hôte) ──
    'Accès sécurisé': '安全访问',
    'Hub sécurisé': '已加密的 Hub',
    // ── v4.109 Animation pré-arrivée (écran d'accueil hub verrouillé) ──
    'Votre séjour approche': '您的住宿即将到来',
    'Arrivée prévue': '预计入住',
    'Ouverture du hub dans': 'Hub 将在以下时间后开启',
    'Le pavé d’accès apparaîtra automatiquement à l’ouverture.': '开门时将自动显示数字键盘。',
    'jours': '天',
    'heures': '小时',
    'min': '分',
    'Bonjour': '您好',
    'Vérification du code…': '正在验证代码…',
    'Retour': '返回',
    "Besoin d'aide ?": '需要帮助？',
    'Contactez votre hôte': '联系房东',
    'Effacer le dernier chiffre': '删除最后一位数字',
    'Chiffre': '数字',
    '🔐 Chaque séjour a son code unique — communiqué par votre hôte. Le hub se verrouillera automatiquement à la fin de votre séjour.':
      '🔐 每次住宿都有唯一的代码——由房东提供。住宿结束后 Hub 将自动上锁。',

    // ── Hub hôte — Espace Hôte (HostView) ──
    "Retour à l'accueil": '返回首页',
    '✓ Déverrouillé': '✓ 已解锁',
    'Gestion rapide du logement': '快速管理您的房源',
    'Réclamations': '投诉',
    'Vocaux': '语音留言',
    'Commandes': '订单',
    '🏠 Mon logement': '🏠 我的房源',
    '👥 Mes invités': '👥 我的房客',
    '🧹 Équipe & prestataires': '🧹 团队与服务商',
    '⚙️ Réglages': '⚙️ 设置',
    'Modifier le Wi-Fi': '修改 Wi-Fi',
    'Réseau': '网络',
    'Aucun réseau configuré': '未配置网络',
    'Guidebook': '房屋指南',
    'section(s) — éditer le guide de bienvenue': '个章节——编辑欢迎指南',
    'Aucune section — écrire le guide de bienvenue': '暂无章节——编写欢迎指南',
    'Photos de mon hub': '我的 Hub 照片',
    'photo(s) personnalisée(s) — votre hub 100 % à vous': '张自定义照片——100% 属于您的 Hub',
    'Remplacez les visuels par vos vraies photos': '用您的真实照片替换示意图',
    'Messages vocaux': '语音留言',
    "Bienvenue, veille et jour du départ — votre voix ou l'IA, en 4 langues": '欢迎语、退房前夜与退房日——您的声音或 AI，4 种语言',
    'Réclamations en attente': '待处理投诉',
    'écrite(s)': '条书面',
    'vocale(s)': '条语音',
    'demande(s) de service': '项服务请求',
    'Aucune réclamation en attente ✓': '暂无待处理投诉 ✓',
    'Upselling — Commandes': '增值服务——订单',
    'commande(s) à confirmer': '个订单待确认',
    'commande(s) — rien à confirmer ✓': '个订单——暂无需确认 ✓',
    'Aucune commande pour le moment': '暂无订单',
    "Livre d'or — souvenirs": '金色留言簿——美好回忆',
    'Validez, épinglez et répondez aux souvenirs de vos voyageurs': '审核、置顶并回复房客的旅行回忆',
    'Middle-Stay Care': '住中关怀服务',
    'Réassorts & ménages demandés par vos invités en séjour long': '长住房客申请的补货与保洁',
    'Gérer les prestataires': '管理服务商',
    'intervenant(s) autour du bien': '位服务商覆盖该房源',
    "Gérer le code PIN d'accès au mode hôte": '管理房东模式的 PIN 码',
    'Supprimer définitivement le message vocal de {name} ? Cette action est irréversible.':
      '确定永久删除来自 {name} 的语音留言吗？此操作不可撤销。',
    'Suppression impossible. Réessayez.': '无法删除，请重试。',
    'Message vocal supprimé.': '语音留言已删除。',
    'Impossible de marquer comme résolue.': '无法标记为已解决。',
    'Réclamation marquée résolue ✓': '投诉已标记为解决 ✓',
    'Action impossible.': '操作失败。',
    'Commande confirmée ✓': '订单已确认 ✓',
    'Commande annulée.': '订单已取消。',
    '{name} activé ✓ — visible côté invité.': '{name} 已启用 ✓——房客端可见。',
    '{name} désactivé — masqué côté invité.': '{name} 已停用——房客端隐藏。',
    'en attente': '条待处理',
    'aucun': '无',

    // ── Dialog Réclamations ──
    'Réclamations écrites (formulaire Hub) et messages vocaux de vos voyageurs.': '房客的书面投诉（Hub 表单）与语音留言。',
    'Écrites': '书面',
    'Aucune réclamation écrite en attente ✓': '暂无待处理书面投诉 ✓',
    '⚠️ Urgent': '⚠️ 紧急',
    'Nouvelle': '新',
    'De :': '来自：',
    'Photo {n} de la réclamation': '投诉照片 {n}',
    'Marquer résolue': '标记为已解决',
    'Vocales': '语音',
    'Aucun message vocal en attente ✓': '暂无待处理语音留言 ✓',
    'lu ✓': '已读 ✓',
    'Supprimer le message vocal de {name}': '删除来自 {name} 的语音留言',
    'Supprimer ce vocal': '删除这条语音',
    'Message de {name}': '来自 {name} 的留言',
    '🎙️ Message vocal de {n} s (audio indisponible en démo)': '🎙️ 语音留言 {n} 秒（演示模式无音频）',

    // ── Dialog Prestataires ──
    'Prestataires autour du bien': '房源周边服务商',
    "Dans leur rayon d'intervention. Activez ou désactivez chaque prestataire — un prestataire désactivé est masqué pour vos invités.":
      '按服务半径展示。启用或停用各服务商——停用后将对房客隐藏。',
    '🔧 Services Propriétaire': '🔧 业主服务',
    '🥂 Expériences Invité': '🥂 房客体验',
    'Aucun prestataire dans le rayon.': '该范围内暂无服务商。',
    'Désactivé': '已停用',
    'Désactiver {name} pour ce bien': '为此房源停用 {name}',
    'Activer {name} pour ce bien': '为此房源启用 {name}',

    // ── Dialog Wi-Fi ──
    'Renseignez le nom du réseau et le mot de passe.': '请填写网络名称和密码。',
    'Échec de la mise à jour.': '更新失败。',
    'Wi-Fi mis à jour ✅': 'Wi-Fi 已更新 ✅',
    'Vos voyageurs voient le nouveau réseau immédiatement.': '房客会立即看到新网络。',
    'Les nouveaux identifiants sont visibles immédiatement par vos voyageurs.': '房客会立即看到新的连接信息。',
    'Nom du réseau (SSID)': '网络名称（SSID）',
    'Enregistrement…': '保存中…',
    'Enregistrer': '保存',

    // ── Dialog Guidebook ──
    'Charger le guidebook universel remplacera le contenu en cours d’édition. Continuer ?': '加载通用指南将替换当前编辑中的内容。是否继续？',
    'Guidebook universel indisponible.': '通用指南不可用。',
    '📚 Guidebook universel chargé.': '📚 通用指南已加载。',
    'Personnalisez-le avec les spécificités de votre bien, puis enregistrez.': '请根据您房源的特点进行个性化修改，然后保存。',
    'Aucun Guidebook actif pour ce bien. Créez-le depuis le dashboard hôte.': '该房源暂无房屋指南。请在房东控制台中创建。',
    'Renseignez un titre et au moins une section.': '请填写标题和至少一个章节。',
    'Guidebook mis à jour ✅': '房屋指南已更新 ✅',
    'Vos voyageurs voient le nouveau guide immédiatement.': '房客会立即看到新指南。',
    'Éditer le Guidebook': '编辑房屋指南',
    'Le guide de bienvenue consulté par vos invités depuis le Hub.': '房客在 Hub 中查阅的欢迎指南。',
    'Titre du guide': '指南标题',
    'Guide de bienvenue': '欢迎指南',
    'Sections': '章节',
    'Section {n} — ex : 🔑 Accès, code de la boîte à clés…': '第 {n} 节——例如：🔑 门禁、钥匙盒密码…',
    'Section {n} du guide': '指南第 {n} 节',
    'Supprimer la section {n}': '删除第 {n} 节',
    'Ajouter une section': '添加章节',
    'Charger le guidebook universel': '加载通用指南',
    'Enregistrer le guide': '保存指南',

    // ── Dialog Commandes (Upselling) ──
    'Commandes des invités': '房客订单',
    "Prestations commandées via l'app invitée. Confirmez ou annulez les demandes en attente.": '房客通过房客端下单的服务。请确认或取消待处理请求。',
    "Aucune commande pour l'instant": '暂无订单',
    "Les commandes passées par vos invités depuis l'app apparaîtront ici.": '房客通过应用下的订单将显示在这里。',
    'Confirmer': '确认',
    'Annuler': '取消',
    'Invité :': '房客：',

    // ── Dialog Paramètres PIN ──
    'Les deux codes ne correspondent pas. Recommencez.': '两次输入的代码不一致，请重新输入。',
    'Échec du changement de PIN.': 'PIN 修改失败。',
    'PIN modifié ✅': 'PIN 已修改 ✅',
    'Votre nouveau code est actif immédiatement.': '新代码立即生效。',
    'Modifier le code PIN': '修改 PIN 码',
    'Saisissez votre nouveau code à 4 chiffres.': '请输入新的 4 位数字代码。',
    'Confirmez le nouveau code en le saisissant à nouveau.': '请再次输入新代码以确认。',
    'Enregistrement du nouveau code…': '正在保存新代码…',
    'Code saisi :': '已输入代码：',

    // ── Dialog Photos de mon hub ──
    'Choisissez une image (JPG, PNG…).': '请选择图片（JPG、PNG…）。',
    'Format d’image non pris en charge — utilisez JPG ou PNG.': '图片格式不支持——请使用 JPG 或 PNG。',
    'Photo trop lourde — réessayez avec une image plus petite.': '照片过大——请换一张更小的图片。',
    'Enregistrement impossible.': '无法保存。',
    'Photo enregistrée ✓ — visible immédiatement par vos invités.': '照片已保存 ✓——房客立即可见。',
    'Suppression impossible.': '无法删除。',
    'Visuel d’illustration restauré.': '已恢复默认示意图。',
    '📸 Photos de mon hub': '📸 我的 Hub 照片',
    'Remplacez les visuels d’illustration par vos vraies photos — vos invités les voient immédiatement sur la page invitée.':
      '用您的真实照片替换示意图——房客在房客页立即看到。',
    'Photo actuelle — {name}': '当前照片——{name}',
    'Perso': '自定义',
    'Changer': '更换',
    'Ajouter': '添加',
    'Retirer la photo — {name}': '移除照片——{name}',
    'Astuce : photos redimensionnées automatiquement (1024 px, JPEG) — formats JPG, PNG ou WebP conseillés. Format paysage.':
      '提示：照片会自动缩放（1024 像素，JPEG）——建议使用 JPG、PNG 或 WebP，横版格式。',

    // ── Slots photos du hub (lib/hub-photos) ──
    'Photo de couverture': '封面照片',
    'La grande photo en haut de l’Espace Invité': '房客空间顶部的大幅照片',
    'Room Services & Expériences': '客房服务与体验',
    'La carte flagship des commandes': '订单主打菜单',
    'Accès & Codes': '门禁与密码',
    'Serrure, portail, boîte à clés…': '门锁、大门、钥匙盒…',
    'Arrivée pas à pas': '一步步入住指引',
    'La façade ou l’entrée du bâtiment': '建筑外观或入口',
    'Un bel intérieur du logement': '房源内的精美一角',
    'Guide des appareils': '家电使用指南',
    'Machine à café, cuisine, sono…': '咖啡机、厨房、音响…',
    'Kit de survie': '应急小帮手',
    'L’entrée, un placard bien rangé': '入口处、整齐的储物柜',
    'Vidéo de bienvenue': '欢迎视频',
    'Le salon ou une chambre': '客厅或卧室',
    'Départ tardif': '延迟退房',
    'La chambre, un lit frais': '卧室、整洁的床铺',
    'Visiter la ville': '探索城市',
    'Un café, un musée du quartier': '街区里的咖啡店、博物馆',
    'Bouclier d’avis': '评价保护盾',
    'Un coin chaleureux du séjour': '住宿中温馨的一角',
    'SOS & Urgences': 'SOS 与紧急求助',
    'Extincteur, trousse de secours…': '灭火器、急救箱…',
    'Contacter l’hôte': '联系房东',
    'Une cloche, un téléphone, un mot d’accueil': '门铃、电话、欢迎留言',
    'Shop the Stay': '民宿好物商店',
    'Les produits de la maison à vendre': '屋内待售好物',

    // ── Dialog Messages vocaux ──
    'PIN incorrect — rouvrez le mode hôte.': 'PIN 错误——请重新打开房东模式。',
    'Impossible de charger vos messages vocaux.': '无法加载您的语音留言。',
    "Écrivez d'abord le message en {lang}.": '请先用{lang}撰写留言。',
    'Génération impossible. Réessayez dans un instant.': '无法生成，请稍后重试。',
    'Voix {flag} prête ✓ ({n} s)': '{flag} 语音已就绪 ✓（{n} 秒）',
    'Génération terminée ✓ — vos invités entendent la voix dans leur langue.': '生成完成 ✓——房客将听到自己语言的语音。',
    'Écrivez d’abord votre message en français.': '请先用法语写好您的留言。',
    'Traductions prêtes ✓ — relisez et ajustez si besoin.': '翻译完成 ✓——请检查并按需调整。',
    'Traduction indisponible pour le moment.': '暂时无法翻译。',
    'Trop long — maximum 30 secondes (comme les vocaux).': '过长——最长 30 秒（与语音留言相同）。',
    'Envoi impossible. Réessayez.': '无法上传，请重试。',
    'Votre voix est enregistrée ✓ — audible par vos invités.': '您的声音已保存 ✓——房客可以听到。',
    'Voix supprimée — vos invités ne l’entendront plus.': '语音已删除——房客将不再听到。',
    '🎙️ Messages vocaux': '🎙️ 语音留言',
    'Vos invités entendent la voix dans leur langue (repli : français) aux bons moments du séjour. Texte FR → traduction IA → voix générée, ou votre propre enregistrement (30 s max, comme les vocaux).':
      '房客会在住宿的关键时刻听到自己语言的语音（备选：法语）。法语原文 → AI 翻译 → 生成语音，或使用您自己的录音（最长 30 秒，与语音留言相同）。',
    ' Mode démo : pré-écoute sans enregistrement.': ' 演示模式：可试听但不保存。',
    'Bienvenue': '欢迎语',
    'Joué au 1er clic « Mode Invité » — 1× par téléphone': '首次点击「房客模式」时播放——每部手机一次',
    'Souhaitez la bienvenue, présentez-vous, donnez le ton de votre maison.': '欢迎房客，介绍自己，定下您房源的基调。',
    'Veille du départ': '退房前夜',
    '1er scan après l’heure choisie dans la Conciergerie (onglet ⏰, défaut 20 h) la veille du départ — 1× seulement': '退房前夜在礼宾设置的时间（⏰ 标签，默认 20 点）后首次扫码——仅一次',
    'Rappelez : départ tardif possible, préparer les affaires, laisser un avis.': '提醒：可延迟退房、整理行李、留下评价。',
    'Jour du départ': '退房日',
    'Dès l’heure choisie dans la Conciergerie (onglet ⏰, défaut 9 h) le jour J — chaque ouverture de l’espace invité': '退房日从礼宾设置的时间（⏰ 标签，默认 9 点）起——每次打开房客空间都会播放',
    'Consignes : départ, clés, ranger la maison, poubelles, linge…': '事项：退房、钥匙、整理房间、垃圾、床品…',
    'Voix du guidebook': '房屋指南语音',
    'Écoute libre : bouton « 🎙️ Écouter l’explication de l’hôte » dans le guidebook et l’onglet Messages de l’hôte':
      '随时收听：房屋指南和「房东消息」标签页中的「🎙️ 收听房东讲解」按钮',
    'Expliquez votre guidebook à voix haute — en français uniquement.': '用语音讲解您的房屋指南——仅限法语。',
    '🤖 IA': '🤖 AI',
    '🎙️ Votre voix': '🎙️ 您的声音',
    'Votre message en français…': '用法语输入您的留言…',
    'Traduction (éditable) — ou « 🤖 Traduire » ci-dessous.': '翻译（可编辑）——或使用下方「🤖 翻译」。',
    'Message {lang}': '{lang} 留言',
    'Génération… (5-15 s)': '生成中…（5-15 秒）',
    '🎙️ Générer la voix': '🎙️ 生成语音',
    'Ma propre voix (fichier audio ≤ 30 s)': '我自己的声音（音频文件 ≤ 30 秒）',
    'Supprimer cette voix': '删除这条语音',
    'Supprimer la voix {lang}': '删除{lang}语音',
    'Pré-écoute {lang}': '试听{lang}语音',
    '📖 La voix du guidebook est en français uniquement — écrivez votre texte ci-dessus puis générez la voix.':
      '📖 房屋指南语音仅支持法语——请在上方输入文字后生成语音。',
    'Traduction…': '翻译中…',
    'Traduire en 🇬🇧 · 🇪🇸 · 🇸🇦': '翻译为 🇬🇧 · 🇪🇸 · 🇸🇦',
    'Génération {flag}… (≈ 1 min)': '正在生成 {flag}…（约 1 分钟）',
    'Générer les 4 voix': '生成全部 4 种语音',
    'Générer les 4 voix (déjà {n}/4)': '生成全部 4 种语音（已完成 {n}/4）',
    'Les voix se jouent automatiquement côté invité : bienvenue au 1er clic « Mode Invité », veille après 20 h, jour J dès 9 h. Régénérer une voix la rejoue une nouvelle fois sur les téléphones déjà venus.':
      '语音会在房客端自动播放：首次点击「房客模式」时播放欢迎语，前夜 20 点后、退房日 9 点起播放对应语音。重新生成语音会让已访问过的手机再播放一次。',
  },
};

/** Traduction statique (0 ms, 0 requête, marche hors ligne). Retourne le FR si absente. */
export function translateAdminText(fr: string, lang: AdminLang): string {
  if (lang === 'fr') return fr;
  return ADMIN_DICT[lang]?.[fr] ?? fr;
}

/** Traduit puis interpole les variables {name}, {n}, {flag}… (ordre des
 *  mots propre à chaque langue grâce au placeholder nommé). */
export function translateAdminFmt(
  fr: string,
  lang: AdminLang,
  vars: Record<string, string | number>,
): string {
  const translated = translateAdminText(fr, lang);
  return translated.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

// ── React Context + Provider + hook ──────────────────────────
interface AdminLangContextValue {
  lang: AdminLang;
  setLang: (lang: AdminLang) => void;
  /** Traduction statique : t('Texte FR') → langue active, repli FR. */
  t: (fr: string) => string;
  /** Traduction + interpolation : tf('Message de {name}', { name }) */
  tf: (fr: string, vars: Record<string, string | number>) => string;
}

const AdminLangContext = createContext<AdminLangContextValue | null>(null);

// « Mounted » sans setState dans un effet (règle react-hooks/
// set-state-in-effect) : pendant le rendu serveur ET l'hydratation le
// snapshot serveur (false) est utilisé — la langue démarre donc toujours
// à FR, puis le snapshot client (true) s'applique après le montage.
// Même pattern que le `mounted` du HostShell (IDs Radix stables).
const noopSubscribe = () => () => {};
const getMounted = () => true;
const getNotMounted = () => false;

/**
 * Provider i18n des espaces hôte. La langue démarre à FR (rendu serveur
 * et premier rendu client identiques — zéro mismatch d'hydratation) puis
 * la langue mémorisée (localStorage) ou détectée (navigateur) s'applique
 * après le montage. Le choix utilisateur prend le dessus sur la détection.
 */
export function AdminLangProvider({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(noopSubscribe, getMounted, getNotMounted);
  // Choix explicite de l'hôte (null = suivre la détection).
  const [choice, setChoice] = useState<AdminLang | null>(null);
  const detected = useMemo(() => (mounted ? getAdminLang() : 'fr'), [mounted]);
  const lang = mounted ? (choice ?? detected) : 'fr';

  const setLang = useCallback((next: AdminLang) => {
    setChoice(next);
    setAdminLang(next);
  }, []);

  const value = useMemo<AdminLangContextValue>(
    () => ({
      lang,
      setLang,
      t: (fr: string) => translateAdminText(fr, lang),
      tf: (fr: string, vars: Record<string, string | number>) => translateAdminFmt(fr, lang, vars),
    }),
    [lang, setLang],
  );

  return <AdminLangContext.Provider value={value}>{children}</AdminLangContext.Provider>;
}

/**
 * Hook i18n des espaces hôte. Hors provider, repli sur une instance
 * locale (langue détectée après montage — le choix n'est alors pas
 * partagé entre composants, mais la traduction fonctionne).
 */
export function useAdminLang(): AdminLangContextValue {
  const ctx = useContext(AdminLangContext);

  const mounted = useSyncExternalStore(noopSubscribe, getMounted, getNotMounted);
  const fallbackLang = useMemo(() => (mounted ? getAdminLang() : 'fr'), [mounted]);

  const fallback = useMemo<AdminLangContextValue>(
    () => ({
      lang: fallbackLang,
      setLang: () => {},
      t: (fr: string) => translateAdminText(fr, fallbackLang),
      tf: (fr: string, vars: Record<string, string | number>) =>
        translateAdminFmt(fr, fallbackLang, vars),
    }),
    [fallbackLang],
  );

  return ctx ?? fallback;
}
