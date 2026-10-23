'use client';

// =============================================================
// ROOMSCAN INVENTAIRE — helpers UI partagés des onglets du
// dashboard (v5.0 — refonte « Luxe Bleuté » demandée par le client) :
//   · fond de page dégradé bleuté (clair) / bleu nuit profond (sombre)
//     via .shield-page (globals.css) ;
//   · cartes verre « nacré » .luxe-card (clair) / ardoise bleu nuit
//     (sombre) — le mode sombre est AUTOMATIQUE sur tous les onglets ;
//   · boutons : primaire rouge dégradé, ghost, WhatsApp vert, email,
//     danger (suppression) ;
//   · statuts À venir jaune / En retard rouge / Terminé vert /
//     Annulé gris + badge Anomalie + chip Caution sécurisée.
// =============================================================
import { type ReactNode } from 'react';

// ── Carte de base du design system ──
export function ShieldCard({
  children,
  className = '',
  role,
}: {
  children: ReactNode;
  className?: string;
  role?: string;
}) {
  return (
    <div role={role} className={`luxe-card ${className}`}>
      {children}
    </div>
  );
}

// ── Titre de section de carte ──
export function CardTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-[#22305a] sm:px-5">
      <h3 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">{children}</h3>
      {right}
    </div>
  );
}

// ── En-tête de page standardisé (titre + sous-titre + actions) ──
export function PageHeader({
  icon,
  title,
  subtitle,
  actions,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
      <div className="flex items-center gap-3">
        {icon && (
          <span
            aria-hidden="true"
            className="luxe-tile bg-gradient-to-br from-[#055492] to-[#164d7a] text-white"
          >
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="luxe-header-title">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm luxe-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ── Boutons primaires (rouge RoomScan dégradé) ──
export function RedButton({
  children,
  onClick,
  type = 'button',
  disabled,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`luxe-btn-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C41E3A] ${className}`}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  disabled,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`luxe-btn-ghost focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#055492] dark:focus-visible:outline-[#1173c7] ${className}`}
    >
      {children}
    </button>
  );
}

// ── v5.0 — boutons de partage & suppression (check-ins / check-outs) ──
export function WhatsAppButton({
  children,
  onClick,
  disabled,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`luxe-btn-whatsapp focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25d366] ${className}`}
    >
      {children}
    </button>
  );
}

export function MailButton({
  children,
  onClick,
  disabled,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`luxe-btn-mail focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#055492] dark:focus-visible:outline-[#1173c7] ${className}`}
    >
      {children}
    </button>
  );
}

export function DangerButton({
  children,
  onClick,
  disabled,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`luxe-btn-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 ${className}`}
    >
      {children}
    </button>
  );
}

// ── Icône WhatsApp (brand) — Lucide n'en propose pas ──
export function WhatsAppIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.497.1-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

// ── Badges de statut (couleurs du master prompt) ──
export type VisitStatus = 'A_VENIR' | 'EN_RETARD' | 'TERMINE' | 'ANNULE' | 'IMPECCABLE' | 'A_NETTOYER' | 'DEGRADATION';

export const STATUS_META: Record<string, { label: string; dot: string; badge: string }> = {
  A_VENIR: { label: 'À venir', dot: 'bg-amber-400', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300' },
  EN_RETARD: { label: 'En retard', dot: 'bg-red-500', badge: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300' },
  TERMINE: { label: 'Terminé', dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  ANNULE: { label: 'Annulé', dot: 'bg-slate-400', badge: 'bg-slate-100 text-slate-500 dark:bg-slate-500/15 dark:text-slate-400' },
  IMPECCABLE: { label: 'Impeccable', dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  A_NETTOYER: { label: 'À nettoyer', dot: 'bg-amber-400', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300' },
  DEGRADATION: { label: 'Dégradation', dot: 'bg-red-500', badge: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300' },
};

export function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.A_VENIR;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.badge}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

// ── v4.167 — badge rouge « Anomalie » (Problème 10) : visible en 1
// seconde par l'hôte quand le PDF contient des zones À nettoyer /
// Mauvais état. `count` = nombre de zones signalées. ──
export function AnomalyBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      title={`${count} zone${count > 1 ? 's' : ''} signalée${count > 1 ? 's' : ''} dans le rapport`}
      className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700 dark:bg-red-500/15 dark:text-red-300"
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
      🔴 Anomalie · {count}
    </span>
  );
}

// ── v4.167 — badge « Caution sécurisée » (Problème 11). ──
export function DepositChip({ amount }: { amount: number | null }) {
  if (!amount || amount <= 0) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200/60 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/25">
      💰 {formatMoney(amount)} de caution sécurisée
    </span>
  );
}

// ── v4.167 — nom d'agent honnête : les sessions planifiées n'ont pas
// encore d'agent (et l'ancien placeholder « À venir » n'est plus écrit
// en base). Affichage « Agent non renseigné » au lieu d'un faux nom. ──
export function agentLabel(agentName: string | null | undefined): string {
  const a = (agentName ?? '').trim();
  if (!a || a === 'À venir') return 'Agent non renseigné';
  return `Agent ${a}`;
}

// ── Mini donut SVG (KPI cards du style « dashboard premium ») ──
export function MiniDonut({
  percent,
  color,
  size = 56,
  strokeWidth = 7,
}: {
  percent: number;
  color: string;
  size?: number;
  strokeWidth?: number;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const arc = (clamped / 100) * c;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${clamped} %`}
      className="shrink-0 -rotate-90"
    >
      {/* piste : gris clair en mode clair, ardoise bleu nuit en sombre */}
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-slate-200/70 dark:text-[#22305a]" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${arc} ${c - arc}`}
      />
    </svg>
  );
}

// ── Vague décorative des cartes gradient (style image jointe) ──
export function WaveSvg({ className = '' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 200 40"
      preserveAspectRatio="none"
      className={`pointer-events-none absolute inset-x-0 bottom-0 h-10 w-full ${className}`}
    >
      <path
        d="M0 26 C 30 12, 55 34, 90 24 S 150 8, 200 22 L 200 40 L 0 40 Z"
        fill="rgba(255,255,255,0.16)"
      />
      <path
        d="M0 32 C 40 22, 70 40, 110 30 S 165 18, 200 30 L 200 40 L 0 40 Z"
        fill="rgba(255,255,255,0.14)"
      />
    </svg>
  );
}

// ── Dates FR ──
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── v4.167 — « Généré le 22 oct. 2026 à 10:15 » (Problème 8) ──
export function formatDateTimeFull(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── v4.167 — montants FR (Problème 11 + widget Revenus protégés) ──
export function formatMoney(n: number): string {
  return `${n.toLocaleString('fr-FR')} €`;
}

// ── fetch JSON typé avec erreur explicite ──
export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init });
  const data = (await res.json().catch(() => null)) as (T & { error?: string; message?: string }) | null;
  if (!res.ok || !data) {
    throw new Error(data?.message || data?.error || `Erreur ${res.status}`);
  }
  return data;
}
