'use client';

import { cn } from '@/lib/utils';
import { ChevronUp, ChevronDown } from 'lucide-react';

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  className?: string;
  render?: (item: T) => React.ReactNode;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string | number;
  loading?: boolean;
  emptyMessage?: string;
  sortKey?: string;
  sortDirection?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  rowClassName?: (item: T) => string;
}

export default function Table<T>({
  columns,
  data,
  keyExtractor,
  loading = false,
  emptyMessage = 'No data found.',
  sortKey,
  sortDirection,
  onSort,
  rowClassName,
}: TableProps<T>) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-slate-500">
        <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-2" />
        Loading...
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-slate-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border border-slate-200 rounded-lg">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'px-4 py-3 text-left font-medium text-slate-600',
                  col.sortable && 'cursor-pointer select-none hover:bg-slate-100',
                  col.className,
                )}
                onClick={col.sortable && onSort ? () => onSort(col.key) : undefined}
              >
                <div className="flex items-center gap-1">
                  {col.label}
                  {col.sortable && sortKey === col.key && (
                    sortDirection === 'asc'
                      ? <ChevronUp size={14} />
                      : <ChevronDown size={14} />
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr
              key={keyExtractor(item)}
              className={cn(
                'border-b border-slate-100 hover:bg-slate-50 transition-colors',
                rowClassName?.(item),
              )}
            >
              {columns.map((col) => (
                <td key={col.key} className={cn('px-4 py-3', col.className)}>
                  {col.render
                    ? col.render(item)
                    : String((item as Record<string, unknown>)[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
