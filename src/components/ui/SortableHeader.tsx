import React from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

export const SortableHeader: React.FC<{
  label: string;
  sortKey: string;
  config: { key: string; direction: 'asc' | 'desc' } | null;
  onSort: (key: string) => void;
  className?: string;
}> = ({ label, sortKey, config, onSort, className }) => {
  const isActive = config?.key === sortKey;
  const ariaSort = isActive
    ? config.direction === 'asc' ? 'ascending' : 'descending'
    : 'none';

  return (
    <th
      aria-sort={ariaSort}
      className={cn("px-2.5 py-2.5 font-medium transition-colors select-none", className)}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "flex items-center gap-1 w-full cursor-pointer hover:bg-surface-muted rounded transition-colors",
          className?.includes('text-center') ? 'justify-center' : '',
        )}
      >
        {label}
        <span className="flex flex-col opacity-50">
          <ChevronUp className={cn("w-2.5 h-2.5 -mb-1", isActive && config.direction === 'asc' && 'opacity-100 text-primary')} />
          <ChevronDown className={cn("w-2.5 h-2.5", isActive && config.direction === 'desc' && 'opacity-100 text-primary')} />
        </span>
      </button>
    </th>
  );
};
