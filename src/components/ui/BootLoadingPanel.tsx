import { BrandLoading } from './BrandLoading';
import { cn } from '../../lib/utils';

type Props = {
  title?: string;
  subtitle?: string;
  className?: string;
};

/** One simple in-content loader — same panel for hydrate / sync / processing. */
export function BootLoadingPanel({
  title = 'Memuat data…',
  subtitle = 'Sebentar ya, menyiapkan dashboard',
  className,
}: Props) {
  return (
    <div
      className={cn(
        'flex min-h-[min(60vh,460px)] w-full flex-col items-center justify-center px-4 py-10',
        className,
      )}
    >
      <div className="w-full max-w-sm rounded-xl border border-border bg-card px-8 py-9 shadow-[0_4px_16px_rgba(0,0,0,0.06)]">
        <BrandLoading title={title} subtitle={subtitle} />
      </div>
    </div>
  );
}
