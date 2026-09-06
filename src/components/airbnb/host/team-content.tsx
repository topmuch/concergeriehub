'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Check,
  MoreHorizontal,
  ShieldCheck,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import { useHostContext } from '@/components/airbnb/host/host-context';
import { StatusBadge } from '@/components/airbnb/host/status-badge';
import { FormDialog } from '@/components/airbnb/host/form-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
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

const BRAND = '#E23F2B';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Équipe</h1>
          <p className="mt-1 truncate text-sm text-slate-600">
            {currentProperty
              ? `Membres et intervenants de ${currentProperty.name}`
              : 'Aucun bien dans votre portfolio'}
          </p>
        </div>
        {canInviteSomewhere && (
          <Button
            size="sm"
            className="h-9 gap-2 text-white sm:h-10 sm:px-5"
            style={{ backgroundColor: BRAND }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#C93524')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = BRAND)}
            onClick={() => setInviteOpen(true)}
            aria-label="Inviter un membre"
          >
            <span aria-hidden="true">👥</span>
            Inviter un membre
          </Button>
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
              className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center"
            >
              <p className="min-w-0 flex-1 truncate text-sm text-amber-900">
                <span aria-hidden="true">✉️</span>{' '}
                <span className="font-bold">{inv.property.name}</span> vous invite comme{' '}
                <span className="font-bold">{memberRoleMeta(inv.role).label.toLowerCase()}</span>
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="sm"
                  className="h-8 bg-amber-600 text-xs font-bold text-white hover:bg-amber-700"
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
                  className="h-8 border-amber-300 bg-transparent text-xs font-bold text-amber-800 hover:bg-amber-100"
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
            <Label htmlFor="team-property-select">Bien</Label>
            <Select
              value={currentId ?? ''}
              onValueChange={(v) => {
                setLocalId(v);
                setSelectedId(v); // synchronise le sélecteur du header
              }}
              disabled={propertiesLoading || properties.length === 0}
            >
              <SelectTrigger id="team-property-select" className="w-full border-slate-200">
                <SelectValue placeholder="Choisissez un bien" />
              </SelectTrigger>
              <SelectContent>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Aucun bien */}
          {!propertiesLoading && properties.length === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm">
              <span aria-hidden="true" className="text-4xl">🏠</span>
              <p className="font-semibold text-slate-900">Aucun bien dans votre portfolio</p>
              <p className="max-w-md text-sm text-slate-600">
                Ajoutez une propriété ou acceptez une invitation pour gérer une équipe.
              </p>
            </div>
          )}

          {/* Erreur */}
          {membersError && (
            <div
              className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
              role="alert"
            >
              <span aria-hidden="true">⚠️</span>
              {membersError}
            </div>
          )}

          {/* Chargement */}
          {propertiesLoading || (membersLoading && members === null) ? (
            <div className="space-y-3" aria-busy="true" aria-label="Chargement des membres">
              {[0, 1].map((i) => (
                <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-1/3" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                    <Skeleton className="h-6 w-24 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : /* Liste des membres */
          members && members.length > 0 && currentId ? (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
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
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
              <span aria-hidden="true" className="text-4xl">👥</span>
              <p className="font-semibold text-slate-900">
                Aucun membre dans l&apos;équipe de ce bien
              </p>
              <p className="max-w-md text-sm text-slate-600">
                Invitez votre premier intervenant : manager, personnel de ménage ou maintenance.
              </p>
              {canInviteSomewhere && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-slate-200 text-slate-700"
                  onClick={() => setInviteOpen(true)}
                >
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                  Inviter un membre
                </Button>
              )}
            </div>
          ) : null}
        </div>

        {/* ----- Panneau latéral : permissions par rôle ----- */}
        <aside className="min-w-0 xl:w-80 xl:shrink-0">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-24">
            <h2 className="flex items-center gap-2 font-bold text-slate-900">
              <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              Permissions par rôle
            </h2>
            <ul className="mt-4 flex flex-col gap-4">
              {MEMBER_ROLES.map((role) => {
                const meta = MEMBER_ROLE_META[role];
                return (
                  <li key={role} className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-base ring-1 ring-slate-100"
                    >
                      {meta.emoji}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900">{meta.label}</p>
                      <p className="text-xs leading-relaxed text-slate-500">{roleHint(role)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400">
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
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer ce membre de l&apos;équipe ?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget?.user.fullName?.trim() || removeTarget?.user.email} n&apos;aura plus
              accès à {currentProperty?.name ?? 'ce bien'}. Cette action est immédiate ;
              réinvitez la personne pour rétablir son accès.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-200 text-slate-700">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-600/40"
              onClick={handleRemoveConfirmed}
              aria-label="Confirmer le retrait du membre"
            >
              <UserMinus className="h-4 w-4" aria-hidden="true" />
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
        'flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between',
        first && 'bg-slate-50/50',
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-base ring-1 ring-slate-200"
        >
          {MEMBER_ROLE_META[member.role].emoji}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900">
            {displayName}
            {member.isSelf && (
              <span className="ml-1.5 text-xs font-normal text-slate-400">(vous)</span>
            )}
          </p>
          <p className="truncate text-xs text-slate-500">{member.user.email}</p>
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
        <StatusBadge status={member.role} />
        {pending ? (
          <StatusBadge status="INVITED" />
        ) : (
          <span className="whitespace-nowrap text-xs text-slate-400">
            depuis {formatDate(member.acceptedAt as string)}
          </span>
        )}

        {(canManage || member.isSelf) && !ownerLocked && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-slate-500 focus-visible:ring-[#E23F2B]/40"
                aria-label={`Actions pour ${displayName}`}
                disabled={busy}
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {canManage && !ownerLocked && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <span aria-hidden="true" className="mr-2">👔</span> Changer le rôle
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-56">
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
                        >
                          <span aria-hidden="true" className="mr-2">{meta.emoji}</span>
                          {meta.label}
                          {isCurrent && (
                            <Check className="ml-auto h-4 w-4 text-emerald-600" aria-hidden="true" />
                          )}
                          {role === 'OWNER' && !isCurrent && (
                            <span className="ml-auto text-[11px] text-slate-400">réservé</span>
                          )}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              {!ownerLocked && (
                <>
                  {canManage && <DropdownMenuSeparator />}
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={onAskRemove}
                    aria-label={`Retirer ${displayName} de l'équipe`}
                  >
                    <UserMinus className="h-4 w-4" aria-hidden="true" />
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
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="👥 Inviter un membre"
      description="La personne doit disposer d'un compte Conciergerie Hub (gratuit) avec cet email. Elle reçoit l'invitation dans son Dashboard."
      size="sm"
      footer={
        <>
          <Button
            variant="outline"
            className="border-slate-200 text-slate-700"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Annuler
          </Button>
          <Button
            className="text-white"
            style={{ backgroundColor: BRAND }}
            onClick={() => void submit()}
            disabled={!emailValid || checkedIds.length === 0 || submitting}
            aria-label="Envoyer les invitations"
          >
            {submitting ? 'Envoi…' : 'Envoyer'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-email">Adresse email</Label>
        <Input
          id="invite-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ex : sophie@menage-pro.fr"
          autoComplete="email"
          aria-required="true"
          aria-invalid={email.length > 0 && !emailValid}
        />
        {email.length > 0 && !emailValid && (
          <p className="text-xs text-rose-600" role="alert">
            Adresse email invalide.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-role">Rôle</Label>
        <Select value={role} onValueChange={(v) => setRole(v as MemberRole)}>
          <SelectTrigger id="invite-role" className="w-full border-slate-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INVITABLE_ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {MEMBER_ROLE_META[r].emoji} {MEMBER_ROLE_META[r].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-slate-500">{MEMBER_ROLE_META[role].description}</p>
      </div>

      <fieldset className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
        <legend className="px-1 text-xs font-semibold text-slate-600">
          Biens concernés ({checkedIds.length} sélectionné{checkedIds.length > 1 ? 's' : ''})
        </legend>
        {manageableProperties.map((p) => (
          <label
            key={p.id}
            className="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1 text-sm text-slate-700 hover:bg-slate-50"
          >
            <Checkbox
              checked={checkedIds.includes(p.id)}
              onCheckedChange={() => toggleProperty(p.id)}
              aria-label={`Inviter sur ${p.name}`}
            />
            <span className="min-w-0 truncate">{p.name}</span>
          </label>
        ))}
      </fieldset>
    </FormDialog>
  );
}
