# Task 4-a — RoomScan Bouclier Dashboard V2 (v4.167) — « Mes biens » + « Documents »

Agent : Z.ai Code (sous-agent UI onglets 5 & 6)
Statut : ✅ Terminé — lint 0 erreur / 0 warning ; tsc --noEmit 0 erreur sur mes 2 fichiers.

## Fichiers modifiés (UNIQUEMENT ces 2)
1. `src/components/inspection/shield/shield-properties.tsx` — « Mes biens »
   - Problème 1 : badge de statut du bien en haut à droite de chaque carte. `onboardingStatus === 'COMPLETED'` → vert « Protégé » (`bg-emerald-100 text-emerald-700`, dot `bg-emerald-500 h-1.5 w-1.5`) ; `'PENDING_PHOTOS'` → ambre « Onboarding partiel » (`bg-amber-100 text-amber-800`, dot `bg-amber-400`) + `title="En attente des photos de référence de l'équipe"`. Le chip `onboardingRef` est conservé mais réduit (`text-[10px]`, `px-2 py-0.5`) et déplacé inline sur la ligne « Onboardé le … ».
   - Problème 2 : icônes Lucide `h-3.5 w-3.5 text-slate-400` dans les 3 `<dt>` (Zones → `DoorOpen`, Appareils → `Plug`, Sessions → `ClipboardList`).
   - Ligne « Prochain séjour » : si `p.nextVisit` → `rounded-lg border-blue-100 bg-blue-50/60 px-3 py-2` avec `CalendarClock` `text-[#1e3a8a]`, texte `Prochain {check-in|check-out} : {guestName ?? 'Invité'} — {formatDateTime(scheduledDate)}` ; rien si null. Placée sous le dl des stats, avant « Onboardé le ».
   - Interface `ShieldPropertyRow` étendue (`onboardingStatus`, `nextVisit` typés), imports `formatDateTime`, `CalendarClock`, `ClipboardList`, `DoorOpen`, `Plug`. Boutons / empty state / loading inchangés.
2. `src/components/inspection/shield/shield-documents.tsx` — « Documents »
   - Problème 6 : barre de recherche (classes identiques à shield-history.tsx, placeholder « Invité, bien, référence… », `htmlFor`/`id` + label sr-only). Filtre les deux sections : certificats par `propertyName`/`onboardingRef`, rapports par `guestName`/`propertyName`/`sessionRef`.
   - Problème 7 : rangée responsive de filtres — chips type [Tous][Check-in][Check-out][ONB] (actif `bg-[#1e3a8a] text-white`, inactif bordure slate + hover slate-50, `min-h-[36px] px-3 text-xs font-semibold rounded-full`, `aria-pressed`, conteneur `role="group"`) ; `<select>` bien (« Tous les biens », value=id, style inputClass de shield-visits.tsx) ; `<select>` mois (« Tous les mois » + 12 derniers mois présents dans les données : `completedAt` rapports + `onboardedAt` certificats, tri desc, libellé « octobre 2026 » via helper local `monthLabel`). Sémantique type : `ONB` → seule la section certificats ; `CHECK_IN`/`CHECK_OUT` → seule la section rapports, filtrée par type.
   - Problème 8 : lignes rapports → `Généré le {formatDateTimeFull(s.completedAt)}` (remplace `formatDate`) ; `AnomalyBadge` si `s.anomalies > 0` + `DepositChip` si `s.depositAmount != null` dans un conteneur `flex flex-wrap gap-1.5`. Certificats inchangés.
   - 0 résultat visible + filtres actifs → `ShieldCard` « Aucun document ne correspond à vos filtres. » + `GhostButton` « Réinitialiser » (reset query/type/property/month). Sinon sections rendues avec compteurs filtrés ; empty states par section deviennent « ne correspond à vos filtres » si filtres actifs. Scroll `max-h-[32rem] overflow-y-auto shield-scrollbar`, loading, bannière erreur et structure 2 sections conservés. État : `query`, `typeFilter`, `propertyFilter`, `monthFilter` ; listes filtrées en `useMemo` ; helpers locaux `monthKey`/`monthLabel` (rien ajouté à shield-ui.tsx).

## Endpoints consommés (contrats vérifiés dans les routes, non modifiées)
- `GET /api/shield/properties` → `properties[].onboardingStatus`, `properties[].nextVisit`.
- `GET /api/shield/sessions?status=TERMINE&take=100` → `sessions[].anomalies`, `sessions[].depositAmount`.

## Points d'attention pour l'orchestrateur
- ⚠️ ERREUR tsc PRÉEXISTANTE hors de mon périmètre (route API que je n'ai pas le droit de toucher) : `src/app/api/shield/properties/route.ts(67,48)` — `Property 'createdAt' does not exist on type '{ propertyId: string; type: string; guestName: string | null; scheduledDate: Date | null }'`. Fix attendu côté agent API : ajouter `createdAt: true` au `select` de la requête `upcoming` (ou retirer le fallback `?? s.createdAt`). Le `bun run lint` (ESLint) passe lui à 0 erreur, seule la vérification de types la remonte.
- Compteur de sessions API : `/api/shield/sessions` plafonne `take` à 100 (`Math.min(..., 100)`) — le contrat `take=100` est respecté.
- Aucune autre modification : shield-ui.tsx, routes API et tous les autres onglets (gérés par l'autre agent) intacts.
