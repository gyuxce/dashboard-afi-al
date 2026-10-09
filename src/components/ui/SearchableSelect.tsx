import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, Check } from 'lucide-react';
import { cn } from '../../lib/utils';

interface SearchableSelectProps {
  options: string[];
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  allOptionLabel?: string;
}

type MenuPos = { top: number; left: number; width: number };

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = "Select...",
  allOptionLabel = "All"
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = React.useId();

  const updateMenuPos = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.max(rect.width, 224);
    let left = rect.left;
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - width - 8);
    }
    setMenuPos({
      top: rect.bottom + 4,
      left,
      width,
    });
  };

  useLayoutEffect(() => {
    if (!isOpen) return;
    updateMenuPos();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onScrollOrResize() {
      updateMenuPos();
    }
    window.addEventListener('resize', onScrollOrResize);
    // capture scroll from any parent
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (wrapperRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen]);

  const filteredOptions = options.filter(opt => opt.toLowerCase().includes(search.toLowerCase()));

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
    setSearch('');
  };

  const isAllSelected = value === allOptionLabel || value === 'All TL' || value === 'All BPO' || value === 'All Agents';

  const menu = isOpen && menuPos
    ? createPortal(
        <div
          ref={menuRef}
          id={listId}
          role="listbox"
          aria-label={placeholder}
          style={{
            position: 'fixed',
            top: menuPos.top,
            left: menuPos.left,
            width: menuPos.width,
            zIndex: 10000,
          }}
          className="bg-card border border-border rounded-xl shadow-lg overflow-hidden"
        >
          <div className="p-2 border-b border-border flex items-center">
            <Search className="w-3.5 h-3.5 text-text-muted mr-2 shrink-0" aria-hidden />
            <input
              type="text"
              className="w-full text-sm border-none focus:outline-none focus-visible:ring-0 p-0 text-text-primary bg-transparent"
              placeholder={placeholder}
              value={search}
              autoFocus
              aria-label={placeholder}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            <button
              type="button"
              role="option"
              aria-selected={isAllSelected}
              className={`w-full text-left px-3 py-2 text-sm rounded-md flex items-center justify-between transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${isAllSelected ? 'bg-primary-soft text-primary font-semibold' : 'text-text-primary hover:bg-surface-muted'}`}
              onClick={() => handleSelect(allOptionLabel)}
            >
              <span>{allOptionLabel}</span>
              {isAllSelected && <Check className="w-3.5 h-3.5 text-primary" aria-hidden />}
            </button>
            {filteredOptions.length > 0 ? (
              filteredOptions.map(opt => {
                const isSelected = opt === value;
                return (
                  <button
                    key={opt}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`w-full text-left px-3 py-2 text-sm rounded-md flex items-center justify-between transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${isSelected ? 'bg-primary-soft text-primary font-semibold' : 'text-text-primary hover:bg-surface-muted'}`}
                    onClick={() => handleSelect(opt)}
                  >
                    <span className="truncate">{opt}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-primary shrink-0" aria-hidden />}
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-3 text-sm text-text-muted text-center">Tidak ada hasil</div>
            )}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listId}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !isOpen) {
            event.preventDefault();
            setIsOpen(true);
          }
        }}
        className={cn(
          "flex items-center justify-between w-full bg-surface border border-border rounded-xl px-3 py-1.5 text-sm font-medium text-text-primary transition-colors cursor-pointer",
          "focus:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30",
        )}
      >
        <span className="truncate">{isAllSelected ? allOptionLabel : value}</span>
        <ChevronDown className="w-4 h-4 text-text-muted ml-1 shrink-0" aria-hidden />
      </button>
      {menu}
    </div>
  );
};
