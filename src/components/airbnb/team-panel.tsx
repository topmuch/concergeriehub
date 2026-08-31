'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { UserPlus, Users, X } from 'lucide-react';
import { B2BCard } from '@/components/ui/b2b-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { MEMBER_ROLES, memberRoleMeta, type MemberRole } from '@/lib/team';

// =============================================================
// TeamPanel — ÉTAPE 12 V2 : gestion de l'équipe d'un bien.
//  - Liste des membres (rôles canoniques V2) + invitations en
//    attente
//  - Invitation par email (compte existant requis)
//  - Changement de rôle / retrait — OWNER & MANAGER
// =============================================================

interface TeamMember {
  id: string;
  role: MemberRole;
  invitedAt: string;
  acceptedAt: string | null;
  isOwnerUser: boolean;
  isSelf: boolean;
  user: { id: string; email: string; fullName: string | null; isActive: boolean };
}

interface TeamPanelProps {
  propertyId: string;
  /** Rappel du rôle du bien dans l'invite d'invitation (optionnel) */
  propertyName?: string;
}

export function TeamPanel({ propertyId, propertyName }: TeamPanelProps) {
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<MemberRole>('MANAGER');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/airbnb/properties/${propertyId}/members`);
      if (!res.ok) throw new Error('http');
      const json = (await res.json()) as { members: TeamMember[]; canManage: boolean };
      setMembers(json.members);
      setCanManage(json.canManage);
    } catch {
      setMembers([]);
    }
  }, [propertyId]);

  useEffect(() => {
    load();
  }, [load]);

  async function submitInvite() {
    if (!inviteEmail.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/airbnb/properties/${propertyId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const json = (await res.json()) as { error?: string; invited?: { fullName: string | null } };
      if (!res.ok) {
        toast.error(json.error ?? "Impossible d'envoyer l'invitation.");
        return;
      }
      toast.success(
        `Invitation envoyée à ${json.invited?.fullName ?? inviteEmail}`,
        { description: `Rôle : ${memberRoleMeta(inviteRole).label} — en attente d'acceptation.` },
      );
      setInviteOpen(false);
      setInviteEmail('');
      setInviteRole('MANAGER');
      await load();
    } catch {
      toast.error('Erreur réseau. Réessayez.');
    } finally {
      setSubmitting(false);
    }
  }

  async function changeRole(memberId: string, role: MemberRole) {
    const res = await fetch(`/api/airbnb/properties/${propertyId}/members/${memberId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      toast.error(json.error ?? 'Modification impossible.');
      return;
    }
    toast.success(`Rôle mis à jour : ${memberRoleMeta(role).label}`);
    await load();
  }

  async function removeMember(member: TeamMember) {
    const res = await fetch(`/api/airbnb/properties/${propertyId}/members/${member.id}`, {
      method: 'DELETE',
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      toast.error(json.error ?? 'Retrait impossible.');
      return;
    }
    toast.success(member.isSelf ? 'Vous avez quitté ce bien.' : 'Membre retiré de l’équipe.');
    await load();
  }

  const pending = members?.filter((m) => !m.acceptedAt) ?? [];
  const active = members?.filter((m) => m.acceptedAt) ?? [];

  return (
    <B2BCard className="p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden="true">👥</span>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Équipe du bien
              {propertyName ? <span className="text-slate-400 font-semibold"> · {propertyName}</span> : null}
            </h3>
            <p className="text-xs text-slate-500">
              Co-hôtes, personnel de ménage et maintenance — accès limité par rôle.
            </p>
          </div>
        </div>
        {canManage && (
          <Button
            onClick={() => setInviteOpen(true)}
            className="bg-slate-900 hover:bg-slate-800 text-white"
            size="sm"
          >
            <UserPlus className="h-4 w-4" /> Inviter
          </Button>
        )}
      </div>

      {members === null ? (
        <div className="mt-4 space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {/* --- Membres actifs --- */}
          {active.map((m) => {
            const meta = memberRoleMeta(m.role);
            return (
              <div
                key={m.id}
                className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 justify-between bg-slate-50 border border-slate-100 rounded-lg px-3 py-2.5"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    aria-hidden="true"
                    className="h-8 w-8 rounded-full bg-slate-200 text-slate-700 text-xs font-bold inline-flex items-center justify-center shrink-0"
                  >
                    {(m.user.fullName ?? m.user.email).trim().slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {m.user.fullName ?? 'Compte sans nom'}
                      {m.isSelf && <span className="text-slate-400 font-normal"> (vous)</span>}
                    </p>
                    <p className="text-xs text-slate-500 truncate">{m.user.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {m.isOwnerUser || m.role === 'OWNER' ? (
                    <Badge className="bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-50 font-semibold">
                      👑 Propriétaire
                    </Badge>
                  ) : canManage ? (
                    <Select
                      value={m.role}
                      onValueChange={(v) => changeRole(m.id, v as MemberRole)}
                    >
                      <SelectTrigger
                        aria-label={`Rôle de ${m.user.fullName ?? 'membre'}`}
                        className="h-8 w-[190px] text-xs bg-white"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MEMBER_ROLES.filter((r) => r !== 'OWNER').map((r) => (
                          <SelectItem key={r} value={r}>
                            {memberRoleMeta(r).emoji} {memberRoleMeta(r).label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge className="bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-100 font-semibold">
                      {meta.emoji} {meta.label}
                    </Badge>
                  )}
                  {canManage && !m.isOwnerUser && (
                    <button
                      type="button"
                      onClick={() => removeMember(m)}
                      aria-label={`Retirer ${m.user.fullName ?? 'ce membre'}`}
                      className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-transparent text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* --- Invitations en attente --- */}
          {pending.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-3 justify-between bg-amber-50/60 border border-amber-100 rounded-lg px-3 py-2.5"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  aria-hidden="true"
                  className="h-8 w-8 rounded-full bg-amber-100 text-amber-700 inline-flex items-center justify-center shrink-0 text-xs"
                >
                  ⏳
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-700 truncate">{m.user.email}</p>
                  <p className="text-xs text-amber-700">
                    Invitation en attente · {memberRoleMeta(m.role).label}
                  </p>
                </div>
              </div>
              {canManage && (
                <button
                  type="button"
                  onClick={() => removeMember(m)}
                  aria-label="Annuler l'invitation"
                  className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}

          {members.length === 0 && (
            <p className="text-sm text-slate-500 py-4 text-center flex items-center justify-center gap-2">
              <Users className="h-4 w-4" aria-hidden="true" /> Aucun membre pour le moment.
            </p>
          )}
        </div>
      )}

      {/* ---------- Dialog d'invitation ---------- */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" aria-hidden="true" /> Inviter un membre
              {propertyName ? <span className="text-slate-400 font-normal">· {propertyName}</span> : null}
            </DialogTitle>
            <DialogDescription>
              Le compte doit déjà exister sur Conciergerie Hub (inscription gratuite).
              L&apos;invité recevra la demande sur son dashboard.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email du membre</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="collegue@exemple.fr"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-role">Rôle</Label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as MemberRole)}>
                <SelectTrigger id="invite-role" aria-label="Choisir un rôle" className="bg-white">
                  <SelectValue placeholder="Choisir un rôle" />
                </SelectTrigger>
                <SelectContent>
                  {MEMBER_ROLES.filter((r) => r !== 'OWNER').map((r) => (
                    <SelectItem key={r} value={r}>
                      {memberRoleMeta(r).emoji} {memberRoleMeta(r).label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">{memberRoleMeta(inviteRole).description}</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)} disabled={submitting}>
              Annuler
            </Button>
            <Button
              onClick={submitInvite}
              disabled={submitting || !inviteEmail.trim()}
              className="bg-slate-900 hover:bg-slate-800 text-white"
            >
              {submitting ? 'Envoi…' : 'Envoyer l’invitation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </B2BCard>
  );
}
