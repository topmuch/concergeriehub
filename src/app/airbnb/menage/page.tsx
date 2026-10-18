import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { MenageContent } from '@/components/airbnb/host/menage-content';

export const metadata: Metadata = {
  title: 'Ménage — RoomScan',
  description:
    'Onglet dédié au ménage : planning des interventions, journal des passages horodaté (photos + vocaux), alertes stock, demandes des invités et réglages (checklist + consigne vocale).',
};

// Onglet MÉNAGE du Dashboard Client (v6.0 — refonte 5 onglets) :
//   1. PLANNING — interventions de ménage planifiées (nouveau backend),
//      groupées par jour et heure, avec actions hôte ;
//   2. JOURNAL — historique horodaté des passages : heures réelles,
//      galerie photos complète + lightbox, vocal de l'équipe, PDF,
//      états des lieux de sortie en bas ;
//   3. STOCK — alertes de l'équipe (résolution 1 clic) + historique ;
//   4. DEMANDES — demandes particulières des invités (Hub) ;
//   5. RÉGLAGES — checklist de nettoyage + consigne vocale (micro/IA).
// Session et shell garantis par /airbnb/layout.tsx.
export default async function MenagePage() {
  await getServerSession(authOptions); // garantit le rendu dynamique (session)
  return <MenageContent />;
}
