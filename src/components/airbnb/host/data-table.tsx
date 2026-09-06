'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

// =============================================================
// DataTable — tableau réutilisable du Dashboard Client
// Tri par clic sur en-tête + pagination + rendu de cellules
// personnalisé. Construit sur les primitives shadcn/ui Table.
// =============================================================

export interface DataTableColumn<T> {
  key: string;
  header: string;
  /** Valeur de tri (sinon tri désactivé pour cette colonne). */
  sortValue?: (row: T) => string | number;
  /** Rendu personnalisé (sinon : champ brut). */
  cell?: (row: T) => ReactNode;
  className?: string;
  /** Masque la colonne (responsive via classes, ex: "hidden md:table-cell"). */
  hideBelow?: 'sm' | 'md' | 'lg';
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Taille de page (défaut 10). `0` = tout afficher sans pagination. */
  pageSize?: number;
  emptyMessage?: string;
  className?: string;
  /** Row cliquable (ex: ouvrir une fiche). */
  onRowClick?: (row: T) => void;
}

const HIDE_CLASS: Record<NonNullable<DataTableColumn<unknown>['hideBelow']>, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
};

type SortState = { key: string; dir: 'asc' | 'desc' } | null;

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  pageSize = 10,
  emptyMessage = 'Aucune donnée pour le moment.',
  className,
  onRowClick,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = col.sortValue!(a);
      const vb = col.sortValue!(b);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * factor;
      return String(va).localeCompare(String(vb), 'fr', { numeric: true }) * factor;
    });
  }, [rows, sort, columns]);

  const total = sorted.length;
  const effectivePageSize = pageSize > 0 ? pageSize : total || 1;
  const pageCount = Math.max(1, Math.ceil(total / effectivePageSize));
  const safePage = Math.min(page, pageCount);
  const paged = useMemo(() => {
    if (pageSize <= 0) return sorted;
    const start = (safePage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, safePage, pageSize]);

  function toggleSort(col: DataTableColumn<T>) {
    if (!col.sortValue) return;
    setSort((prev) => {
      if (prev?.key !== col.key) return { key: col.key, dir: 'asc' };
      if (prev.dir === 'asc') return { key: col.key, dir: 'desc' };
      return null;
    });
    setPage(1);
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50">
              {columns.map((col) => {
                const isActive = sort?.key === col.key;
                const SortIcon = !col.sortValue
                  ? null
                  : isActive
                    ? sort?.dir === 'asc'
                      ? ArrowUp
                      : ArrowDown
                    : ArrowUpDown;
                return (
                  <TableHead
                    key={col.key}
                    className={cn(
                      'h-10 px-3 text-xs font-bold uppercase tracking-wide text-slate-500',
                      col.hideBelow && HIDE_CLASS[col.hideBelow],
                      col.sortValue && 'cursor-pointer select-none hover:text-slate-900',
                      col.className,
                    )}
                    onClick={() => toggleSort(col)}
                    aria-sort={isActive ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.header}
                      {SortIcon && (
                        <SortIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </span>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-28 text-center text-sm text-slate-500">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              paged.map((row) => (
                <TableRow
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    'transition-colors',
                    onRowClick && 'cursor-pointer hover:bg-slate-50',
                  )}
                >
                  {columns.map((col) => (
                    <TableCell
                      key={col.key}
                      className={cn('px-3 py-2.5 text-sm text-slate-700', col.hideBelow && HIDE_CLASS[col.hideBelow], col.className)}
                    >
                      {col.cell ? col.cell(row) : String((row as Record<string, unknown>)[col.key] ?? '')}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* ----- Pagination ----- */}
      {pageSize > 0 && total > effectivePageSize && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">
            {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, total)} sur{' '}
            <span className="font-semibold text-slate-700">{total}</span>
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Page précédente"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Select
              value={String(safePage)}
              onValueChange={(v) => setPage(Number(v))}
            >
              <SelectTrigger className="h-8 w-[90px] text-xs" aria-label="Page courante">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
                  <SelectItem key={p} value={String(p)}>
                    Page {p}/{pageCount}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              disabled={safePage >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              aria-label="Page suivante"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
