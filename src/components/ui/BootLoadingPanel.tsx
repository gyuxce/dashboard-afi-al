import { Check, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Card } from './Card';
import { Skeleton } from './Skeleton';

export type BootStep = { id: string; label: string; state: 'pending' | 'active' | 'done' | 'error' };

type Props = {
  title?: string;
  subtitle?: string;
  /** Real sync steps from the store; without them (hydrating cached data) only the skeleton shows. */
  steps?: BootStep[] | null;
  className?: string;
};

function StepMark({ state }: { state: BootStep['state'] }) {
  if (state === 'done') {
    return <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-success text-white"><Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /></span>;
  }
  if (state === 'error') {
    return <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-danger text-white"><X className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /></span>;
  }
  if (state === 'active') {
    return (
      <span className="relative h-6 w-6 shrink-0" aria-hidden>
        <span className="absolute inset-0 rounded-full border-[3px] border-border" />
        <span className="absolute inset-0 animate-spin rounded-full border-[3px] border-transparent border-t-primary" />
      </span>
    );
  }
  return <span className="h-6 w-6 shrink-0 rounded-full border-2 border-border-strong" aria-hidden />;
}

/**
 * The one loading screen: shown from hydrate through the first sync. Left, the real sync steps (so a slow Sheets call
 * reads as progress, not as a hang); right, a skeleton of the page that is about to appear.
 */
export function BootLoadingPanel({
  title = 'Menyiapkan dashboard',
  subtitle = 'Sebentar ya, membaca data',
  steps,
  className,
}: Props) {
  const list = steps ?? [];
  const done = list.filter((s) => s.state === 'done').length;
  const activeIndex = list.findIndex((s) => s.state === 'active');
  const pct = list.length ? Math.round((done / list.length) * 100) : 0;
  const line = list.length
    ? `${activeIndex >= 0 ? `Langkah ${activeIndex + 1} dari ${list.length}` : `${done} dari ${list.length} selesai`}`
    : subtitle;

  return (
    <div role="status" aria-live="polite" aria-label={title} className={cn('grid items-start gap-5 py-2 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]', className)}>
      <Card>
        <div className="flex items-center gap-3">
          <span className="relative h-7 w-7 shrink-0" aria-hidden>
            <span className="absolute inset-0 rounded-full border-[3.5px] border-border" />
            <span className="absolute inset-0 animate-spin rounded-full border-[3.5px] border-transparent border-t-primary" />
          </span>
          <div className="min-w-0">
            <p className="text-[19px] font-extrabold tracking-tight text-text-primary">{title}</p>
            <p className="text-[13px] text-text-secondary">{line}</p>
          </div>
        </div>
        {list.length > 0 && (
          <>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-black/[0.07]" aria-hidden>
              <div className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary transition-[width] duration-500" style={{ width: `${Math.max(pct, 4)}%` }} />
            </div>
            <ol className="mt-5 space-y-3.5">
              {list.map((step) => (
                <li key={step.id} className="flex items-center gap-3.5">
                  <StepMark state={step.state} />
                  <span
                    className={cn(
                      'text-[15px]',
                      step.state === 'active' ? 'font-bold text-text-primary' : step.state === 'pending' ? 'text-text-muted' : 'font-medium text-text-primary',
                      step.state === 'error' && 'text-danger-text',
                    )}
                  >
                    {step.label}
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}
      </Card>

      <div className="hidden min-w-0 space-y-5 lg:block" aria-hidden>
        <div className="grid grid-cols-2 gap-5 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} size="sm" className="space-y-3.5">
              <Skeleton className="h-3.5 w-3/5" />
              <Skeleton className="h-9 w-4/5" />
              <Skeleton className="h-3 w-2/5" />
            </Card>
          ))}
        </div>
        <Card>
          <Skeleton className="h-4 w-48" />
          <Skeleton className="mt-5 h-44 w-full" />
        </Card>
      </div>
    </div>
  );
}
