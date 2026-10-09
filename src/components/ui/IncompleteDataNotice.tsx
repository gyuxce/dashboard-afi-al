import { AlertTriangle } from 'lucide-react';

type Props = {
  /** Bold headline, e.g. "Ranking belum final — data tidak lengkap." */
  title: string;
  /** One bullet per problem. Renders nothing when empty. */
  issues: string[];
};

/**
 * Loud, unmissable banner for payroll-grade tabs (Leaderboard, Insentif) when
 * a required data source is missing or agents were silently dropped. The point
 * is that nobody makes a payroll call off a half-loaded dataset.
 */
export function IncompleteDataNotice({ title, issues }: Props) {
  if (issues.length === 0) return null;

  return (
    <div
      role="alert"
      className="rounded-lg border border-danger/40 bg-danger-soft px-4 py-3 text-[13px] text-danger-text"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <p className="font-bold">{title}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {issues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
