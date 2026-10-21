'use client';

// =============================================================
// BOUCLIER V2 — helpers UI partagés des 8 onglets (design system
// du master prompt client : fond slate-50, cartes blanches
// rounded-xl shadow-sm, boutons rouge RoomScan #C41E3A, statuts
// À venir jaune / En retard rouge / Terminé vert / Annulé gris).
// =============================================================
import { type ReactNode } from 'react';

// ── Carte de base du design system ──
export function ShieldCard({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

// ── Titre de section de carte ──
export function CardTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
      <h3 className="text-sm font-semibold tracking-tight text-slate-900">{children}</h3>
      {right}
    </div>
  );
}

// ── Boutons primaires (rouge RoomScan) ──
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
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#C41E3A] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#a01830] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C41E3A] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1e3a8a] ${className}`}
    >
      {children}
    </button>
  );
}

// ── Badges de statut (couleurs du master prompt) ──
export type VisitStatus = 'A_VENIR' | 'EN_RETARD' | 'TERMINE' | 'ANNULE' | 'IMPECCABLE' | 'A_NETTOYER' | 'DEGRADATION';

export const STATUS_META: Record<string, { label: string; dot: string; badge: string }> = {
  A_VENIR: { label: 'À venir', dot: 'bg-amber-400', badge: 'bg-amber-100 text-amber-800' },
  EN_RETARD: { label: 'En retard', dot: 'bg-red-500', badge: 'bg-red-100 text-red-700' },
  TERMINE: { label: 'Terminé', dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700' },
  ANNULE: { label: 'Annulé', dot: 'bg-slate-400', badge: 'bg-slate-100 text-slate-500' },
  IMPECCABLE: { label: 'Impeccable', dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700' },
  A_NETTOYER: { label: 'À nettoyer', dot: 'bg-amber-400', badge: 'bg-amber-100 text-amber-800' },
  DEGRADATION: { label: 'Dégradation', dot: 'bg-red-500', badge: 'bg-red-100 text-red-700' },
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
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f7" strokeWidth={strokeWidth} />
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

// ── fetch JSON typé avec erreur explicite ──
export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init });
  const data = (await res.json().catch(() => null)) as (T & { error?: string; message?: string }) | null;
  if (!res.ok || !data) {
    throw new Error(data?.message || data?.error || `Erreur ${res.status}`);
  }
  return data;
}
