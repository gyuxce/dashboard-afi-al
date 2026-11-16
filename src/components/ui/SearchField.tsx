import { Search } from 'lucide-react';
import { cn } from '../../lib/utils';

type SearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

/** Pill-shaped search box used in every tab header. */
export function SearchField({ value, onChange, placeholder = 'Cari CS ID atau nama…', className }: SearchFieldProps) {
  return (
    <label className={cn('relative block w-full md:w-60', className)}>
      <span className="sr-only">{placeholder}</span>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-[14px] border-0 bg-black/[0.07] pl-10 pr-4 text-[14.5px] text-text-primary placeholder:text-text-muted focus:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/30"
      />
    </label>
  );
}
