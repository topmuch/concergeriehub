export interface PackQRDefinition {
  moduleType: string;
  name: string;
  roomName: string;
  defaultContent: Record<string, unknown>;
  description: string;
}

export interface PackDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  targetAudience: string;
  badge: string;
  qrCodes: PackQRDefinition[];
  features: string[];
}

export const PACKS: PackDefinition[] = [
  // #45 Pack Airbnb "Hôte Sérénité"
  {
    id: 'airbnb-serenite',
    name: 'Hôte Sérénité',
    description: 'Tout ce dont un hôte Airbnb a besoin pour offrir un séjour parfait et protéger sa réputation.',
    icon: 'Home',
    color: 'from-rose-500 to-pink-600',
    targetAudience: 'Hôtes Airbnb & locations courte durée',
    badge: 'Airbnb',
    qrCodes: [
      {
        moduleType: 'wifi',
        name: 'Wi-Fi Invités',
        roomName: 'Entrée',
        defaultContent: { ssid: '', password: '', security: 'WPA2' },
        description: 'Votre invité se connecte en 1 scan',
      },
      {
        moduleType: 'home_manual',
        name: "Guide de l'appartement",
        roomName: 'Entrée',
        defaultContent: { title: 'Guide de votre séjour', body: '' },
        description: "Règles, horaires, consignes d'utilisation",
      },
      {
        moduleType: 'doorbell',
        name: 'Portier Virtuel',
        roomName: 'Entrée',
        defaultContent: {
          mode: 'absent',
          instructions: [],
          allowMessages: true,
          allowDoorbell: true,
        },
        description: 'Gérez les livraisons et visiteurs à distance',
      },
      {
        moduleType: 'guestbook',
        name: "Livre d'Or",
        roomName: 'Salon',
        defaultContent: {
          title: "Livre d'or",
          body: 'Laissez un message !',
        },
        description: 'Vos invités laissent un souvenir',
      },
      {
        moduleType: 'checklist',
        name: "Check-list de départ",
        roomName: "Chambre d'amis",
        defaultContent: {
          title: 'Check-list de départ',
          body: '- Vider le réfrigérateur\n- Jeter les poubelles\n- Ranger les affaires\n- Fermer les fenêtres\n- Vérifier les clés',
          items: [
            { text: 'Vider le réfrigérateur', checked: false },
            { text: 'Jeter les poubelles', checked: false },
            { text: 'Ranger les affaires', checked: false },
            { text: 'Fermer les fenêtres', checked: false },
            { text: 'Vérifier les clés', checked: false },
          ],
        },
        description: "Rien n'est oublié au départ",
      },
    ],
    features: [
      'Installation en 5 minutes',
      'Impression QR codes incluse',
      'Personnalisable à 100%',
      'Fidélisez vos invités',
      'Protégez votre réputation',
    ],
  },

  // #46 Pack Famille
  {
    id: 'famille',
    name: 'Pack Famille',
    description: 'Organisez toute la vie de famille avec 15 QR codes répartis dans chaque pièce.',
    icon: 'Users',
    color: 'from-emerald-500 to-teal-600',
    targetAudience: 'Familles avec enfants',
    badge: 'Famille',
    qrCodes: [
      {
        moduleType: 'wifi',
        name: 'Wi-Fi Maison',
        roomName: 'Entrée',
        defaultContent: { ssid: '', password: '', security: 'WPA2' },
        description: 'Partagez le Wi-Fi en famille',
      },
      {
        moduleType: 'home_manual',
        name: 'Guide de la Maison',
        roomName: 'Entrée',
        defaultContent: { title: 'Guide de la Maison', body: '' },
        description: 'Consignes et informations utiles',
      },
      {
        moduleType: 'note',
        name: 'Post-it Cuisine',
        roomName: 'Cuisine',
        defaultContent: {
          title: 'Post-it',
          body: 'Poulet au four à 180°C - prêt à 19h',
        },
        description: 'Notes rapides en cuisine',
      },
      {
        moduleType: 'shopping_list',
        name: 'Liste de Courses',
        roomName: 'Cuisine',
        defaultContent: { title: 'Courses', body: '', items: [] },
        description: 'Gestion collaborative des courses',
      },
      {
        moduleType: 'meal_planner',
        name: 'Menu de la Semaine',
        roomName: 'Cuisine',
        defaultContent: { title: 'Menu de la semaine', body: '' },
        description: 'Planifiez les repas de la semaine',
      },
      {
        moduleType: 'checklist',
        name: 'To-Do List',
        roomName: 'Entrée',
        defaultContent: { title: 'À faire', body: '', items: [] },
        description: 'Tâches familiales partagées',
      },
      {
        moduleType: 'medication',
        name: 'Médicaments',
        roomName: 'Salle de bain',
        defaultContent: { title: 'Médicaments', body: '' },
        description: 'Posologies et rappels',
      },
      {
        moduleType: 'key_location',
        name: 'Clés & Objets',
        roomName: 'Vide-poches',
        defaultContent: { title: 'Clés & Objets', body: '' },
        description: 'Retrouvez vite vos affaires',
      },
      {
        moduleType: 'cleaning_schedule',
        name: 'Planning Ménage',
        roomName: 'Buanderie',
        defaultContent: { title: 'Planning Ménage', body: '' },
        description: 'Répartition des tâches ménagères',
      },
      {
        moduleType: 'guestbook',
        name: "Livre d'Or",
        roomName: 'Salon',
        defaultContent: { title: "Livre d'or", body: '' },
        description: 'Souvenirs des passages',
      },
      {
        moduleType: 'contact',
        name: 'Contact Urgence',
        roomName: 'Entrée',
        defaultContent: { name: '', phone: '', email: '' },
        description: 'Numéros d\'urgence accessibles',
      },
      {
        moduleType: 'doorbell',
        name: 'Portier Virtuel',
        roomName: 'Entrée',
        defaultContent: {
          mode: 'absent',
          instructions: [],
          allowMessages: true,
          allowDoorbell: true,
        },
        description: 'Gérez les visiteurs à distance',
      },
      {
        moduleType: 'energy_monitor',
        name: 'Compteur Énergie',
        roomName: 'Tableau électrique',
        defaultContent: { title: 'Compteur Énergie', body: '' },
        description: 'Suivez votre consommation',
      },
      {
        moduleType: 'checklist',
        name: 'Routine Enfants',
        roomName: 'Chambres enfants',
        defaultContent: {
          title: 'Routine du soir',
          body: '- Brossage des dents\n- Pyjama\n- Histoire\n- Lumière éteinte',
          items: [],
        },
        description: 'Routines enfants visuelles',
      },
      {
        moduleType: 'note',
        name: 'Mémo Général',
        roomName: 'Entrée',
        defaultContent: { title: 'Mémo', body: '' },
        description: 'Notes générales de la famille',
      },
    ],
    features: [
      '15 QR codes couvrant toute la maison',
      'Organisation familiale simplifiée',
      'Routines enfants',
      'Gestion des courses collaborative',
      'Sécurité & urgences',
    ],
  },

  // #47 Pack Bureau
  {
    id: 'bureau',
    name: 'Pack Bureau',
    description: 'Équipez votre bureau avec 10 QR codes pour un espace de travail organisé et professionnel.',
    icon: 'Briefcase',
    color: 'from-slate-600 to-slate-800',
    targetAudience: 'TPE/PME et bureaux partagés',
    badge: 'Bureau',
    qrCodes: [
      {
        moduleType: 'wifi',
        name: 'Wi-Fi Bureau',
        roomName: 'Salle de réunion',
        defaultContent: { ssid: '', password: '', security: 'WPA2' },
        description: 'Invités connectés en 1 scan',
      },
      {
        moduleType: 'home_manual',
        name: 'Consignes Bureau',
        roomName: 'Entrée',
        defaultContent: { title: 'Consignes Bureau', body: '' },
        description: 'Règles et informations du bureau',
      },
      {
        moduleType: 'note',
        name: 'Post-it Partagé',
        roomName: 'Espace partagé',
        defaultContent: { title: 'Post-it', body: '' },
        description: 'Notes collaboratives rapides',
      },
      {
        moduleType: 'checklist',
        name: 'Tâches Administratives',
        roomName: 'Accueil',
        defaultContent: { title: 'Tâches Administratives', body: '', items: [] },
        description: 'Suivi des tâches administratives',
      },
      {
        moduleType: 'contact',
        name: 'Contact Réception',
        roomName: 'Accueil',
        defaultContent: { name: '', phone: '', email: '' },
        description: 'Coordonnées de la réception',
      },
      {
        moduleType: 'doorbell',
        name: 'Portier Virtuel',
        roomName: 'Entrée',
        defaultContent: {
          mode: 'absent',
          instructions: [],
          allowMessages: true,
          allowDoorbell: true,
        },
        description: 'Gestion des visiteurs',
      },
      {
        moduleType: 'external_link',
        name: 'Intranet / Outils',
        roomName: 'Salle de réunion',
        defaultContent: { url: '', title: 'Intranet' },
        description: 'Accès rapide aux outils internes',
      },
      {
        moduleType: 'note',
        name: 'Mémos Équipe',
        roomName: 'Espace partagé',
        defaultContent: {
          title: 'Mémos',
          body: '- Réunion lundi 10h\n- Commande fournitures',
        },
        description: 'Informations partagées équipe',
      },
      {
        moduleType: 'guestbook',
        name: "Livre d'Or Visiteurs",
        roomName: 'Accueil',
        defaultContent: { title: "Livre d'or visiteurs", body: '' },
        description: 'Retours des visiteurs',
      },
      {
        moduleType: 'checklist',
        name: 'Checklist Fermeture',
        roomName: 'Entrée',
        defaultContent: {
          title: 'Fermeture du bureau',
          body: "- Éteindre les lumières\n- Fermer les fenêtres\n- Vérifier le chauffage\n- Activer l'alarme",
          items: [],
        },
        description: 'Rien n\'est oublié en partant',
      },
    ],
    features: [
      '10 QR codes pour un bureau organisé',
      'Accès visiteurs simplifié',
      'Checklist de fermeture',
      'Communication équipe',
      'Professionnel et moderne',
    ],
  },

  // #48 Bouclier Anti-Mauvais Avis
  {
    id: 'bouclier-avis',
    name: 'Bouclier Anti-Mauvais Avis',
    description: 'Récupérez le feedback de vos invités AVANT qu\'ils ne publient un avis public.',
    icon: 'ShieldCheck',
    color: 'from-amber-500 to-yellow-600',
    targetAudience: 'Hôtes Airbnb & hôtels',
    badge: 'Anti-Avis',
    qrCodes: [
      {
        moduleType: 'checkout_feedback',
        name: 'Formulaire Check-out',
        roomName: "Chambre d'amis",
        defaultContent: {
          title: 'Votre avis nous compte !',
          subtitle:
            'Avant de partir, aidez-nous à améliorer votre séjour',
          showRating: true,
          showComment: true,
          customMessage:
            "Merci pour votre séjour ! Si quelque chose n'a pas été parfait, dites-le-nous en privé. Nous préférons résoudre le problème avant tout avis public.",
        },
        description:
          'Le client donne son feedback AVANT de laisser un avis public',
      },
    ],
    features: [
      'Feedback privé avant avis public',
      'Étoiles + commentaire',
      'Alerte immédiate à l\'hôte',
      'Résolvez les problèmes avant la publication',
      'Protégez votre note moyenne',
    ],
  },

  // #49 Upselling Automatisé
  {
    id: 'upselling',
    name: 'Upselling Automatisé',
    description: 'Générez des revenus additionnels à chaque séjour avec des services à la carte.',
    icon: 'TrendingUp',
    color: 'from-violet-500 to-purple-600',
    targetAudience: 'Hôtes Airbnb & locations',
    badge: 'Revenue',
    qrCodes: [
      {
        moduleType: 'service_menu',
        name: 'Services Supplémentaires',
        roomName: 'Entrée',
        defaultContent: {
          title: 'Services disponibles',
          subtitle: 'Ajoutez des options à votre séjour',
          items: [
            {
              name: 'Check-out tardif',
              description:
                'Profitez de votre chambre jusqu\'à 14h',
              price: '15€',
              icon: 'Clock',
            },
            {
              name: 'Petit-déjeuner maison',
              description:
                'Croissants, pain, confiture, jus frais',
              price: '12€',
              icon: 'Coffee',
            },
            {
              name: 'Taxe aéroport',
              description:
                'Réservation de taxi pour l\'aéroport',
              price: '25€',
              icon: 'Car',
            },
            {
              name: 'Ménage supplémentaire',
              description:
                'Service de nettoyage en cours de séjour',
              price: '30€',
              icon: 'Sparkles',
            },
            {
              name: 'Panier bienvenue',
              description: 'Vin local, fromages, fruits',
              price: '20€',
              icon: 'Gift',
            },
          ],
          contactMessage:
            'Envoyez-nous un message pour réserver',
        },
        description: 'Revenus additionnels à chaque séjour',
      },
    ],
    features: [
      'Services à la carte pour vos invités',
      'Paiement simple via message',
      'Check-out tardif, petit-déj, taxi...',
      'Revenus additionnels automatiques',
      'Augmentez votre CA sans effort',
    ],
  },
];
