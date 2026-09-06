# Task T4-a — Page « Plaques QR » du Dashboard Client (H4)

Agent : Z.ai Code (sous-agent H4 — plaques)
Statut : ✅ Terminé, lint 0 erreur / 0 warning, tsc 0 erreur sur mes fichiers, E2E validé.

## Fichiers créés
1. `src/hooks/use-plaques.ts` — hook client (GET /api/airbnb/plaques, garde anti-réponse-obsolète par requestId, pattern use-overview). Expose `PlaqueDTO`, `plaques`, `loading`, `error`, `refetch`.
2. `src/app/airbnb/plates/page.tsx` — page serveur minimale : metadata « Plaques QR — Conciergerie Hub », `searchParams ?new=1` (Promise Next 16), rend `<PlatesContent openOrderOnInit={new === '1'} />`. Session garantie par le layout /airbnb.
3. `src/app/airbnb/plates/[id]/print/page.tsx` — **migration print** : même metadata que l'existante, rend `PlaquePrint` avec `backHref="/airbnb/plates"`. Pas de LoginGate (layout garantit la session) ; la garde d'accès aux données reste dans GET /api/airbnb/plaques/[id] (ownsPlaque → 404).
4. `src/components/airbnb/host/plates-content.tsx` — le composant principal ('use client') : en-tête + sous-titre compteur, bouton coral #E23F2B « 📱 Commander une nouvelle plaque », 3 KPICards (Total/Activées/En attente + hint réel « dont N désactivée(s) · N perdue(s) »), filtre client-side par bien (Select « Tous les biens »), DataTable (Code mono bold + bouton copie + badge « Nouvelle », Bien, Statut via StatusBadge, Créée le triable, Activée le hiddenBelow md, Actions DropdownMenu), modale commande (FormDialog + Select du bien du contexte), bannière succès « 🖨️ Imprimer maintenant », empty state 📱, AlertDialog désactiver/réactiver.

## Fichiers modifiés
5. `src/app/api/airbnb/plaques/[id]/route.ts` — **PATCH mis à niveau** (existait déjà mais contrat différent) :
   - contrat Dashboard : `{ status: 'active' | 'inactive' }` ; `'cancelled'`/`'lost'` restent acceptés pour l'ancienne page /airbnb/dashboard/plaques (toujours live jusqu'aux redirects H5) ;
   - **garde « jamais sur lost »** : PATCH sur une plaque status='lost' → **409** « Plaque signalée perdue… » ;
   - écrit un **ActivationLog** (`activated` / `deactivated` / `marked_lost`) à chaque changement ;
   - gardes inchangées : session 401, appartenance claimedByUserId ou canAccessProperty → 404.
6. `src/components/airbnb/plaque-print.tsx` — ajout prop optionnelle `backHref` (défaut `/airbnb/dashboard/plaques`) utilisée pour les 2 liens « Retour » → compat ancienne URL intacte.

## Endpoints utilisés
- `GET /api/airbnb/plaques` (existant) — liste + properties.
- `POST /api/airbnb/plaques` (existant) — création `{ propertyId }` → 201 + plaque.
- `PATCH /api/airbnb/plaques/[id]` (**étendu**, voir ci-dessus) — `{ status: 'inactive' | 'active' }`.

## Preuves E2E (session démo demo@…, agent-browser session isolée `t4a`)
Captures `/tmp/e2e/` :
- `H4-plates.png` — desktop 1280 : titre, sous-titre « 2 plaques · 1 activée · 0 en attente », 3 KPIs (Total 2 « dont 1 désactivée », Activées 1, En attente 0), table avec **PLQ-LOFT-0001** (Activée) et **PLQ-LOFT-0002** (Désactivée, legacy 'cancelled').
- `H4-plates-alert-dialog.png` — AlertDialog « Désactiver cette plaque ? » avec description explicite.
- `H4-plates-modal.png` — modale ouverte automatiquement via `?new=1` (bien présélectionné).
- `H4-plates-new.png` — après POST 201 : bannière « Plaque créée ! Code **PLQ-WKFA-3XDX** » + bouton « 🖨️ Imprimer maintenant » + badge « NOUVELLE » sur la ligne.
- `H4-plates-print.png` — `/airbnb/plates/{id}/print` : fiche A6 avec **QR visible** (`img alt="QR code du Hub Loft Canal Saint-Martin"`, vérifié aussi via eval) pointant `/hub/loft-canal-saint-martin-5hdc`.
- `H4-plates-mobile-390.png` — 390 px : `scrollWidth = 390` (zéro débordement).

Interactions réelles vérifiées :
- Toast « Code copié » au clic sur le bouton copie.
- Filtre par bien : sélection « Loft Canal Saint-Martin » → table filtrée (les 2 plaques du loft restent, filtre client-side OK).
- **Désactiver** PLQ-LOFT-0001 (AlertDialog → PATCH 'inactive') → UI « En attente », KPIs recalculés (Activées 0 / En attente 1) → **DB : status='inactive'**.
- **Réactiver** PLQ-LOFT-0001 (AlertDialog → PATCH 'active') → UI « Activée » → **DB : status='active'** ; ActivationLog réel : `deactivated` puis `activated` (01:38:21 / 01:38:44).
- `?new=1` → modale ouverte au montage (useState initialisateur, zéro effect) → POST 201 → plaque **PLQ-WKFA-3XDX** en base (active, hubSlug `loft-canal-saint-martin-5hdc`, propertyId loft démo).
- Garde lost testée E2E (plaque temporaire créée puis supprimée) : PATCH 'lost' → 200 ; PATCH 'active' sur plaque perdue → **409** avec message (visible dans dev.log).
- `/hub/loft-canal-saint-martin-5hdc` → 200 (hub public OK) ; ancienne URL `/airbnb/dashboard/plaques/[id]/print` rend encore la fiche (rétro-compat, backHref défaut) — pas cassée, redirects 301 pour plus tard (H5).
- État final base (5 plaques globales) : PLQ-WKFA-3XDX active (nouvelle, preuve 201), PLQ-LOFT-0001 active (cycle désactiver/réactiver), PLQ-LOFT-0002 cancelled (legacy intacte), QR-K5AXWT59 / QR-PZEZ373K inactive (lots admin, non visibles par l'hôte démo — filtrées par le GET).

## Limites honnêtes
- **Aucun suivi de scans pour les plaques physiques** : vérifié dans `prisma/schema.prisma`, `ScanLog.qrCodeId` référence **QrCode (dynamiques) uniquement** — PhysicalQrCode n'a aucune relation scan. Je n'ai donc RIEN inventé : pas de KPI « scans » ni d'action « Voir les scans » ; l'action proposée est « 👁️ Voir le Hub public » (conforme mission C.8).
- Le statut legacy `'cancelled'` (ex. PLQ-LOFT-0002 de la démo) est affiché « Désactivée » avec action Réactiver ; les nouvelles désactivations écrivent `'inactive'` (affiché « En attente ») conformément au contrat de mission.
- « En attente » compte strictement `status='inactive'` (les désactivées/perdues apparaissent dans le hint du KPI Total, données réelles).
- Pas de pagination ni tri serveur : la liste est entièrement chargée (volume hôte faible) — tri/pagination clients via DataTable (composant H1).
