'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, Search, User, Home, Wrench, QrCode, Layers } from 'lucide-react';

// =============================================================
// AdminGlobalSearch — recherche globale du header (Module Header)
// Recherche réelle multi-entités via /api/admin/search :
// utilisateurs, propriétés, prestataires, plaques, lots.
// Debounce 300 ms, navigation clavier (Escape), lien par type.
// =============================================================

interface SearchResult {
  type: 'user' | 'property' | 'provider' | 'plaque' | 'batch';
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

const TYPE_META: Record<SearchResult['type'], { icon: React.ElementType; label: string }> = {
  user: { icon: User, label: 'Client' },
  property: { icon: Home, label: 'Bien' },
  provider: { icon: Wrench, label: 'Prestataire' },
  plaque: { icon: QrCode, label: 'Plaque' },
  batch: { icon: Layers, label: 'Lot' },
};

export function AdminGlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setResults(Array.isArray(data.results) ? data.results : []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full max-w-xs sm:max-w-sm">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      <input
        type="search"
        aria-label="Recherche globale (clients, biens, prestataires, plaques)"
        placeholder="Rechercher client, bien, plaque…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
        className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-8 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200"
      />
      {loading && (
        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" aria-hidden="true" />
      )}

      {open && query.trim().length >= 2 && (
        <div
          role="listbox"
          aria-label="Résultats de recherche"
          className="absolute left-0 right-0 top-12 z-50 max-h-96 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl"
        >
          {results.length === 0 && !loading && (
            <p className="px-4 py-6 text-center text-sm text-slate-500">
              Aucun résultat pour « {query} »
            </p>
          )}
          {results.map((r) => {
            const meta = TYPE_META[r.type];
            const Icon = meta.icon;
            return (
              <Link
                key={`${r.type}-${r.id}`}
                href={r.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 border-b border-slate-100 px-4 py-2.5 transition-colors last:border-0 hover:bg-slate-50"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">{r.title}</span>
                  <span className="block truncate text-xs text-slate-500">{r.subtitle}</span>
                </span>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  {meta.label}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
