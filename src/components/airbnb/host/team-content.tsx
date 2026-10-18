'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useHostContext } from '@/components/airbnb/host/host-context';
import { StatusBadge } from '@/components/airbnb/host/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  MEMBER_ROLES,
  MEMBER_ROLE_META,
  canManageTeam,
  memberRoleMeta,
  normalizeMemberRole,
  type MemberRole,
} from '@/lib/team';
import { cn } from '@/lib/utils';

// =============================================================
// TeamContent — page « Équipe » du Dashboard Client (H4 — T4c)
// v5.2 « SAPHIR LUXE » — refonte design profonde (demande client) :
// nuit bleutée, SANS ICÔNES ni emojis (monogrammes, points colorés,
// glyphes purs). Données, handlers et textes métier intacts.
//
// • Sélecteur de bien local (synchronisé avec le contexte hôte).
// • Liste réelle des membres : GET /api/airbnb/properties/{id}/members
//   (membres acceptés + invitations en attente, canManage réel).
// • Invitation multi-biens : N POST (un par bien coché, allSettled).
// • Changement de rôle / retrait : PATCH / DELETE ?memberId= (garde
//   serveur : membre OWNER intouchable — action masquée côté UI).
// • Bannière invitations reçues : PATCH { action: 'accept'|'decline' }.
// • Panneau « Permissions par rôle » (mapping réel du shell).
// =============================================================

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Point coloré par rôle (design sans icône — remplace les bulles à emoji). */
const ROLE_DOTS: Record<MemberRole, string> = {
  OWNER: '#cdb6ff',
  MANAGER: '#5c8af0',
  CLEANER: '#34d399',
  MAINTENANCE: '#fbbf24',
};

/** Rôles invitable via l'API (INVITABLE_ROLES serveur : OWNER exclu). */
const INVITABLE_ROLES: MemberRole[] = MEMBER_ROLES.filter((r) => r !== 'OWNER');

interface TeamMember {
  id: string;
  role: MemberRole;
  invitedAt: string;
  acceptedAt: string | null;
  isOwnerUser: boolean;
  isSelf: boolean;
  user: { id: string; email: string; fullName: string | null; isActive: boolean };
}

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' });

function formatDate(iso: string): string {
  try {
    return dateFormatter.format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

// -------------------------------------------------------------
// Mutations membres (contrat API existant, query param memberId)
// -------------------------------------------------------------
async function patchMemberRole(
  propertyId: string,
  memberId: string,
  role: MemberRole,
): Promise<void> {
  const res = await fetch(
    `/api/airbnb/properties/${encodeURIComponent(propertyId)}/members?memberId=${encodeURIComponent(memberId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    },
  );
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `HTTP ${res.status}`);
  }
}

async function deleteMember(propertyId: string, memberId: string): Promise<void> {
  const res = await fetch(
    `/api/airbnb/properties/${encodeURIComponent(propertyId)}/members?memberId=${encodeURIComponent(memberId)}`,
    { method: 'DELETE' },
  );
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `HTTP ${res.status}`);
  }
}

// -------------------------------------------------------------
// Conteneur de page
// -------------------------------------------------------------
export function TeamContent({ initialPropertyId }: { initialPropertyId: string | null }) {
  const {
    properties,
    propertiesLoading,
    selectedId,
    setSelectedId,
    invitations,
    refreshProperties,
  } = useHostContext();

  // ----- Sélecteur de bien local (défaut : ?property= → contexte → 1er) -----
  const [localId, setLocalId] = useState<string>('');

  const currentId = useMemo(() => {
    if (localId && properties.some((p) => p.id === localId)) return localId;
    if (initialPropertyId && properties.some((p) => p.id === initialPropertyId)) {
      return initialPropertyId;
    }
    if (selectedId !== 'all' && properties.some((p) => p.id === selectedId)) return selectedId;
    return properties[0]?.id ?? null;
  }, [localId, properties, initialPropertyId, selectedId]);

  const currentProperty = properties.find((p) => p.id === currentId) ?? null;

  /** Biens dont l'utilisateur peut gérer l'équipe (OWNER ou MANAGER réels). */
  const manageableProperties = useMemo(
    () => properties.filter((p) => canManageTeam(normalizeMemberRole(p.myRole))),
    [properties],
  );

  const canInviteSomewhere = manageableProperties.length > 0;

  // ----- Membres du bien courant -----
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);

  const loadMembers = useCallback(async (propertyId: string) => {
    setMembersLoading(true);
    setMembersError(null);
    try {
      const res = await fetch(
        `/api/airbnb/properties/${encodeURIComponent(propertyId)}/members`,
        { cache: 'no-store' },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { members: TeamMember[]; canManage: boolean };
      setMembers(data.members ?? []);
      setCanManage(data.canManage ?? false);
    } catch (err) {
      console.error('[TeamContent] members fetch failed:', err);
      setMembers([]);
      setMembersError('Impossible de charger les membres de ce bien.');
    } finally {
      setMembersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!currentId) return;
    void loadMembers(currentId);
  }, [currentId, loadMembers]);

  const refetchMembers = useCallback(() => {
    if (currentId) void loadMembers(currentId);
  }, [currentId, loadMembers]);

  // ----- Modales -----
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null);

  function handleRemoveConfirmed() {
    const target = removeTarget;
    setRemoveTarget(null);
    if (!target || !currentId) return;
    deleteMember(currentId, target.id)
      .then(() => {
        toast.success(
          `${target.user.fullName?.trim() || target.user.email} retiré de l'équipe.`,
        );
        refetchMembers();
        void refreshProperties();
      })
      .catch((err: unknown) => {
        console.error('[TeamContent] member removal failed:', err);
        toast.error(
          err instanceof Error ? `Retrait impossible : ${err.message}` : 'Retrait impossible.',
        );
      });
  }

  // ----- Réponse aux invitations reçues (contexte hôte) -----
  const [respondingId, setRespondingId] = useState<string | null>(null);

  async function respondToInvitation(
    membershipId: string,
    propertyId: string,
    action: 'accept' | 'decline',
  ) {
    setRespondingId(membershipId);
    try {
      const res = await fetch(
        `/api/airbnb/properties/${encodeURIComponent(propertyId)}/members?memberId=${encodeURIComponent(membershipId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      if (action === 'accept') {
        toast.success('Invitation acceptée — bienvenue dans l’équipe ! 🎉');
      } else {
        toast.success('Invitation refusée.');
      }
      await refreshProperties();
    } catch (err) {
      console.error('[TeamContent] invitation response failed:', err);
      toast.error(
        err instanceof Error
          ? `Action impossible : ${err.message}`
          : 'Action impossible — réessayez.',
      );
    } finally {
      setRespondingId(null);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {/* ---------- En-tête ---------- */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="lux-eyebrow">Collaboration</p>
          <h1 className="lux-display mt-1 text-2xl font-semibold text-white sm:text-3xl">Équipe</h1>
          <p className="mt-1.5 truncate text-sm text-[#8fa0c2]">
            {currentProperty
              ? `Membres et intervenants de ${currentProperty.name}`
              : 'Aucun bien dans votre portfolio'}
          </p>
        </div>
        {canInviteSomewhere && (
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            aria-label="Inviter un membre"
            className="lux-btn h-9 sm:h-10 sm:px-5 sm:text-sm"
          >
            Inviter un membre
          </button>
        )}
      </div>

      {/* ---------- Bannière invitations reçues ---------- */}
      {invitations.length > 0 && (
        <div className="flex flex-col gap-3" role="status" aria-label="Invitations en attente">
          {invitations.map((inv) => (
            <motion.div
              key={inv.membershipId}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-3 rounded-2xl border border-[#e9c47c]/25 bg-[#e9c47c]/8 px-4 py-3 sm:flex-row sm:items-center"
            >
              <p className="min-w-0 flex-1 truncate text-sm text-[#e9c47c]">
                <span className="lux-dot mr-2 inline-block align-middle" style={{ backgroundColor: '#e9c47c' }} aria-hidden="true" />
                <span className="font-bold">{inv.property.name}</span> vous invite comme{' '}
                <span className="font-bold">{memberRoleMeta(inv.role).label.toLowerCase()}</span>
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="sm"
                  className="h-8 rounded-full bg-[#e9c47c] text-xs font-semibold text-[#1a1206] transition-[filter] hover:bg-[#e9c47c] hover:brightness-105"
                  disabled={respondingId === inv.membershipId}
                  onClick={() =>
                    void respondToInvitation(inv.membershipId, inv.property.id, 'accept')
                  }
                  aria-label={`Accepter l'invitation pour ${inv.property.name}`}
                >
                  Accepter
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-full border-[#e9c47c]/30 bg-transparent text-xs font-semibold text-[#e9c47c] hover:bg-[#e9c47c]/10 hover:text-[#e9c47c]"
                  disabled={respondingId === inv.membershipId}
                  onClick={() =>
                    void respondToInvitation(inv.membershipId, inv.property.id, 'decline')
                  }
                  aria-label={`Refuser l'invitation pour ${inv.property.name}`}
                >
                  Refuser
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* ---------- Contenu : membres + panneau rôles ---------- */}
      <div className="flex min-w-0 flex-col gap-6 xl:flex-row">
        {/* ----- Colonne principale ----- */}
        <div className="min-w-0 flex-1">
          {/* Sélecteur de bien */}
          <div className="mb-4 flex flex-col gap-1.5 sm:max-w-xs">
            <Label htmlFor="team-property-select" className="text-[#8fa0c2]">Bien</Label>
            <Select
              value={currentId ?? ''}
              onValueChange={(v) => {
                setLocalId(v);
                setSelectedId(v); // synchronise le sélecteur du header
              }}
              disabled={propertiesLoading || properties.length === 0}
            >
              <SelectTrigger id="team-property-select" className="w-full rounded-xl border-white/12 bg-white/[0.04] text-white">
                <SelectValue placeholder="Choisissez un bien" />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-[#0d1530] text-white">
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="focus:bg-white/8 focus:text-white">
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Aucun bien */}
          {!propertiesLoading && properties.length === 0 && (
            <div className="lux-empty flex flex-col items-center gap-2 px-6 py-10 text-center">
              <span className="lux-dot" style={{ backgroundColor: '#5c8af0' }} aria-hidden="true" />
              <p className="lux-display text-lg font-semibold text-white">Aucun bien dans votre portfolio</p>
              <p className="max-w-md text-xs text-[#8fa0c2]">
                Ajoutez une propriété ou acceptez une invitation pour gérer une équipe.
              </p>
            </div>
          )}

          {/* Erreur */}
          {membersError && (
            <div className="lux-empty flex flex-col items-center gap-3 p-6 text-center" role="alert">
              <span className="lux-dot" style={{ backgroundColor: '#f07d6a' }} aria-hidden="true" />
              <p className="text-sm font-semibold text-white">{membersError}</p>
              <button
                type="button"
                onClick={refetchMembers}
                aria-label="Réessayer le chargement des membres"
                className="lux-btn h-9 px-4 text-xs"
              >
                Réessayer
              </button>
            </div>
          )}

          {/* Chargement */}
          {propertiesLoading || (membersLoading && members === null) ? (
            <div className="space-y-3" aria-busy="true" aria-label="Chargement des membres">
              {[0, 1].map((i) => (
                <div key={i} className="lux-card p-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full bg-white/8" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-1/3 bg-white/8" />
                      <Skeleton className="h-3 w-1/2 bg-white/8" />
                    </div>
                    <Skeleton className="h-6 w-24 rounded-full bg-white/8" />
                  </div>
                </div>
              ))}
            </div>
          ) : /* Liste des membres */
          members && members.length > 0 && currentId ? (
            <ul className="lux-card divide-y divide-white/8 overflow-hidden">
              {members.map((m, idx) => (
                <MemberRow
                  key={m.id}
                  member={m}
                  propertyId={currentId}
                  first={idx === 0}
                  canManage={canManage}
                  onRoleChanged={refetchMembers}
                  onAskRemove={() => setRemoveTarget(m)}
                />
              ))}
            </ul>
          ) : members && members.length === 0 ? (
            /* Empty state */
            <div className="lux-empty flex flex-col items-center gap-2 px-6 py-10 text-center">
              <span className="lux-dot" style={{ backgroundColor: '#5c8af0' }} aria-hidden="true" />
              <p className="lux-display text-lg font-semibold text-white">
                Aucun membre dans l&apos;équipe de ce bien
              </p>
              <p className="max-w-md text-xs text-[#8fa0c2]">
                Invitez votre premier intervenant : manager, personnel de ménage ou maintenance.
              </p>
              {canInviteSomewhere && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-1 rounded-full border-white/12 bg-white/[0.04] text-[#d5def0] hover:bg-white/8 hover:text-white"
                  onClick={() => setInviteOpen(true)}
                >
                  Inviter un membre
                </Button>
              )}
            </div>
          ) : null}
        </div>

        {/* ----- Panneau latéral : permissions par rôle ----- */}
        <aside className="min-w-0 xl:w-80 xl:shrink-0">
          <div className="lux-card p-5 xl:sticky xl:top-24">
            <p className="lux-eyebrow !text-[9.5px]">Gouvernance</p>
            <h2 className="lux-display mt-1 text-lg font-semibold text-white">
              Permissions par rôle
            </h2>
            <ul className="mt-4 flex flex-col gap-4">
              {MEMBER_ROLES.map((role) => {
                const meta = MEMBER_ROLE_META[role];
                return (
                  <li key={role} className="flex items-start gap-3">
                    <span
                      className="lux-dot mt-1.5 shrink-0"
                      style={{ backgroundColor: ROLE_DOTS[role] }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">{meta.label}</p>
                      <p className="text-xs leading-relaxed text-[#8fa0c2]">{roleHint(role)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 border-t border-white/8 pt-3 text-xs leading-relaxed text-[#8fa0c2]">
              Ce mapping correspond au filtrage réel de la navigation du Dashboard : un Cleaner ne
              voit que le planning ménage, un membre Maintenance que les réclamations techniques.
            </p>
          </div>
        </aside>
      </div>

      {/* ---------- Modale invitation ---------- */}
      {/* Montage conditionnel : état initial (pré-coche du bien courant,
          rôle CLEANER) figé au moment de l'ouverture. */}
      {inviteOpen && (
        <InviteMemberDialog
          open
          onOpenChange={setInviteOpen}
          manageableProperties={manageableProperties}
          preselectedPropertyId={
            currentId && manageableProperties.some((p) => p.id === currentId)
              ? currentId
              : manageableProperties[0]?.id ?? null
          }
          onInvited={() => {
            refetchMembers();
            void refreshProperties();
          }}
        />
      )}

      {/* ---------- AlertDialog retrait ---------- */}
      <AlertDialog open={removeTarget !== null} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <AlertDialogContent className="rounded-2xl border-white/10 bg-[#0b1226] text-white shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="lux-display text-lg font-semibold text-white">
              Retirer ce membre de l&apos;équipe ?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-[#8fa0c2]">
              {removeTarget?.user.fullName?.trim() || removeTarget?.user.email} n&apos;aura plus
              accès à {currentProperty?.name ?? 'ce bien'}. Cette action est immédiate ;
              réinvitez la personne pour rétablir son accès.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full border-white/12 bg-white/[0.04] text-[#d5def0] hover:bg-white/8 hover:text-white">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full bg-[#f07d6a] font-semibold text-[#2a100a] hover:brightness-105 focus-visible:ring-[#f07d6a]/50"
              onClick={handleRemoveConfirmed}
              aria-label="Confirmer le retrait du membre"
            >
              Retirer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// -------------------------------------------------------------
// Hint du panneau rôles (libellés mission — correspond au
// filtrage de navigation réel du shell, cf. src/lib/team.ts)
// -------------------------------------------------------------
function roleHint(role: MemberRole): string {
  switch (role) {
    case 'OWNER':
      return 'Accès total : facturation, équipe, paramètres.';
    case 'MANAGER':
      return 'Réservations, messages, prestataires.';
    case 'CLEANER':
      return 'Planning ménage uniquement.';
    case 'MAINTENANCE':
      return 'Réclamations techniques uniquement.';
  }
}

// -------------------------------------------------------------
// Ligne membre + actions (rôle / retrait)
// -------------------------------------------------------------
function MemberRow({
  member,
  propertyId,
  first,
  canManage,
  onRoleChanged,
  onAskRemove,
}: {
  member: TeamMember;
  propertyId: string;
  first: boolean;
  canManage: boolean;
  onRoleChanged: () => void;
  onAskRemove: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const displayName = member.user.fullName?.trim() || member.user.email;
  const pending = member.acceptedAt === null;
  // Le propriétaire du bien (membre OWNER) ne peut ni être retiré ni
  // changer de rôle (garde serveur) — actions masquées côté UI.
  const ownerLocked = member.isOwnerUser;
  const selfLeave = member.isSelf && !ownerLocked;

  async function changeRole(next: MemberRole) {
    setBusy(true);
    try {
      await patchMemberRole(propertyId, member.id, next);
      toast.success(
        `${displayName} est maintenant ${MEMBER_ROLE_META[next].label.toLowerCase()}.`,
      );
      onRoleChanged();
    } catch (err) {
      console.error('[TeamContent] role change failed:', err);
      toast.error(
        err instanceof Error ? `Changement impossible : ${err.message}` : 'Changement impossible.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <li
      className={cn(
        'flex min-w-0 flex-col gap-3 p-4 transition-colors hover:bg-white/[0.04]',
        first && 'bg-white/[0.02]',
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden="true"
          className="lux-num flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#3d6fe0]/15 text-sm font-semibold text-[#a9c4ff] ring-1 ring-[#5c8af0]/25"
        >
          {displayName.trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">
            {displayName}
            {member.isSelf && (
              <span className="ml-1.5 text-xs font-normal text-[#8fa0c2]">(vous)</span>
            )}
          </p>
          <p className="truncate text-xs text-[#8fa0c2]">{member.user.email}</p>
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
        <StatusBadge status={member.role} />
        {pending ? (
          <StatusBadge status="INVITED" />
        ) : (
          <span className="whitespace-nowrap text-xs text-[#8fa0c2]">
            depuis {formatDate(member.acceptedAt as string)}
          </span>
        )}

        {(canManage || member.isSelf) && !ownerLocked && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 rounded-full text-[#8fa0c2] hover:bg-white/8 hover:text-white"
                aria-label={`Actions pour ${displayName}`}
                disabled={busy}
              >
                <span aria-hidden="true" className="text-base leading-none">⋯</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 border-white/10 bg-[#0d1530] text-white">
              {canManage && !ownerLocked && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="focus:bg-white/8 focus:text-white">
                    <span className="lux-dot mr-2 shrink-0" style={{ backgroundColor: '#cdb6ff' }} aria-hidden="true" />
                    Changer le rôle
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-56 border-white/10 bg-[#0d1530] text-white">
                    {MEMBER_ROLES.map((role) => {
                      const meta = MEMBER_ROLE_META[role];
                      const isCurrent = member.role === role;
                      // OWNER : réservé au propriétaire du bien (refus API).
                      const disabled = role === 'OWNER' || isCurrent || busy;
                      return (
                        <DropdownMenuItem
                          key={role}
                          disabled={disabled}
                          onSelect={() => {
                            if (role === 'OWNER' || isCurrent) return;
                            void changeRole(role);
                          }}
                          className="focus:bg-white/8 focus:text-white"
                        >
                          <span className="lux-dot shrink-0" style={{ backgroundColor: ROLE_DOTS[role] }} aria-hidden="true" />
                          {meta.label}
                          {isCurrent && (
                            <span className="ml-auto text-sm text-[#e9c47c]" aria-hidden="true">✓</span>
                          )}
                          {role === 'OWNER' && !isCurrent && (
                            <span className="ml-auto text-[11px] text-[#8fa0c2]">réservé</span>
                          )}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              {!ownerLocked && (
                <>
                  {canManage && <DropdownMenuSeparator className="bg-white/8" />}
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={onAskRemove}
                    aria-label={`Retirer ${displayName} de l'équipe`}
                    className="text-[#f07d6a] focus:bg-[#f07d6a]/10 focus:text-[#f07d6a]"
                  >
                    {selfLeave ? "Quitter l'équipe" : 'Retirer'}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </li>
  );
}

// -------------------------------------------------------------
// Modale « Inviter un membre » — N invitations (1 par bien coché)
// -------------------------------------------------------------
function InviteMemberDialog({
  open,
  onOpenChange,
  manageableProperties,
  preselectedPropertyId,
  onInvited,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  manageableProperties: Array<{ id: string; name: string }>;
  preselectedPropertyId: string | null;
  onInvited: () => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>('CLEANER');
  // Montage conditionnel : le bien courant est pré-coché à l'ouverture.
  const [checkedIds, setCheckedIds] = useState<string[]>(
    preselectedPropertyId ? [preselectedPropertyId] : [],
  );
  const [submitting, setSubmitting] = useState(false);

  const emailValid = EMAIL_RE.test(email.trim());

  const toggleProperty = (id: string) => {
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  async function submit() {
    if (!emailValid || checkedIds.length === 0 || submitting) return;
    setSubmitting(true);
    const normalizedEmail = email.trim().toLowerCase();

    // Une invitation par bien coché (API par bien unique) — allSettled
    // pour ne pas interrompre la série sur un 409 ponctuel.
    const results = await Promise.allSettled(
      checkedIds.map((propertyId) =>
        fetch(
          `/api/airbnb/properties/${encodeURIComponent(propertyId)}/members`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: normalizedEmail, role }),
          },
        ).then(async (res) => {
          if (!res.ok) {
            const data = (await res.json().catch(() => null)) as { error?: string } | null;
            throw new Error(data?.error ?? `HTTP ${res.status}`);
          }
          return propertyId;
        }),
      ),
    );

    setSubmitting(false);

    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );

    if (ok.length > 0) {
      toast.success(
        `Invitation${ok.length > 1 ? 's' : ''} envoyée${ok.length > 1 ? 's' : ''} à ${normalizedEmail}`,
      );
      onInvited();
      onOpenChange(false);
      setEmail('');
      if (failed.length > 0) {
        const reason =
          failed[0] instanceof Object && 'reason' in failed[0]
            ? String((failed[0] as PromiseRejectedResult).reason?.message ?? '')
            : '';
        toast.warning(
          `${failed.length} bien${failed.length > 1 ? 's' : ''} non traité${failed.length > 1 ? 's' : ''}${reason ? ` — ${reason}` : ''}`,
        );
      }
    } else {
      const firstReason =
        failed.length > 0 ? String((failed[0] as PromiseRejectedResult).reason?.message ?? '') : '';
      toast.error(
        `Invitation impossible${firstReason ? ` — ${firstReason}` : ' — réessayez dans un instant.'}`,
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl border-white/10 bg-[#0b1226] text-white shadow-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="lux-display text-xl font-semibold text-white">
            Inviter un membre
          </DialogTitle>
          <DialogDescription className="text-sm text-[#8fa0c2]">
            La personne doit disposer d'un compte RoomScan (gratuit) avec cet email. Elle reçoit l'invitation dans son Dashboard.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-email" className="text-[#8fa0c2]">Adresse email</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ex : sophie@menage-pro.fr"
              autoComplete="email"
              aria-required="true"
              aria-invalid={email.length > 0 && !emailValid}
              className="rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fa0c2]/60 focus-visible:ring-[#5c8af0]/50"
            />
            {email.length > 0 && !emailValid && (
              <p className="text-xs text-[#f07d6a]" role="alert">
                Adresse email invalide.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-role" className="text-[#8fa0c2]">Rôle</Label>
            <Select value={role} onValueChange={(v) => setRole(v as MemberRole)}>
              <SelectTrigger id="invite-role" className="w-full rounded-xl border-white/12 bg-white/[0.04] text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-[#0d1530] text-white">
                {INVITABLE_ROLES.map((r) => (
                  <SelectItem key={r} value={r} className="focus:bg-white/8 focus:text-white">
                    {MEMBER_ROLE_META[r].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-[#8fa0c2]">{MEMBER_ROLE_META[role].description}</p>
          </div>

          <fieldset className="flex flex-col gap-2 rounded-xl border border-white/10 p-3">
            <legend className="lux-eyebrow px-1 !text-[9.5px]">
              Biens concernés ({checkedIds.length} sélectionné{checkedIds.length > 1 ? 's' : ''})
            </legend>
            {manageableProperties.map((p) => (
              <label
                key={p.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1 text-sm text-[#d5def0] transition-colors hover:bg-white/[0.05]"
              >
                <Checkbox
                  checked={checkedIds.includes(p.id)}
                  onCheckedChange={() => toggleProperty(p.id)}
                  aria-label={`Inviter sur ${p.name}`}
                  className="border-white/25 bg-white/[0.04]"
                />
                <span className="min-w-0 truncate">{p.name}</span>
              </label>
            ))}
          </fieldset>
        </div>
        <DialogFooter className="mt-1 gap-2">
          <Button
            variant="outline"
            className="rounded-full border-white/12 bg-white/[0.04] text-[#d5def0] hover:bg-white/8 hover:text-white"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Annuler
          </Button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!emailValid || checkedIds.length === 0 || submitting}
            aria-label="Envoyer les invitations"
            className="lux-btn h-10 px-5 text-sm disabled:pointer-events-none disabled:opacity-60"
          >
            {submitting ? 'Envoi…' : 'Envoyer'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
