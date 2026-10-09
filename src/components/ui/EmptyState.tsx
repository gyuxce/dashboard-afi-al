import { isAdminMode } from "../../lib/adminMode";
import React from "react";
import { CircleAlert, FolderOpen, RefreshCw, Search } from "lucide-react";
import { useStore } from "../../store";
import { cn } from "../../lib/utils";

export type EmptyStateVariant = "data" | "filter";

export type EmptyStateAction = {
  label: string;
  onClick: () => void;
  tone?: "primary" | "secondary";
  disabled?: boolean;
  icon?: "files" | "refresh";
};

interface EmptyStateProps {
  title: string;
  description?: string;
  variant?: EmptyStateVariant;
  className?: string;
  actions?: EmptyStateAction[];
  /** Tombol default: Buka File Center + Refresh data (jika Sheets API tersedia) */
  showDataActions?: boolean;
}

/** Aksi standar untuk empty data / belum sync. */
export function useDataEmptyActions(): EmptyStateAction[] {
  const openTab = useStore((s) => s.openTab);
  const fetchFromSheets = useStore((s) => s.fetchFromSheets);
  const isFetchingSheets = useStore((s) => s.isFetchingSheets);
  const hasSheetsKey = Boolean(import.meta.env.VITE_SHEETS_API_KEY);

  const actions: EmptyStateAction[] = isAdminMode()
    ? [
        {
          label: "Buka File Center",
          onClick: () => openTab("files"),
          tone: "primary",
          icon: "files",
        },
      ]
    : [];

  if (hasSheetsKey) {
    actions.push({
      label: isFetchingSheets ? "Menyinkronkan..." : "Refresh data",
      onClick: () => {
        void fetchFromSheets();
      },
      tone: "secondary",
      disabled: isFetchingSheets,
      icon: "refresh",
    });
  }

  return actions;
}

function ActionIcon({ icon, spinning }: { icon?: EmptyStateAction["icon"]; spinning?: boolean }) {
  if (icon === "files") return <FolderOpen size={13} />;
  if (icon === "refresh") return <RefreshCw size={13} className={spinning ? "animate-spin" : undefined} />;
  return null;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  variant = "data",
  className = "",
  actions,
  showDataActions = false,
}) => {
  const defaultActions = useDataEmptyActions();
  const resolvedActions = actions ?? (showDataActions ? defaultActions : undefined);
  const Icon = variant === "filter" ? Search : CircleAlert;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface/40 px-6 py-8 text-center",
        className,
      )}
    >
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-text-muted">
        <Icon size={18} />
      </div>
      <p className="text-sm font-semibold text-text-primary">{title}</p>
      {description ? (
        <p className="mt-1 max-w-md text-xs leading-relaxed text-text-muted">{description}</p>
      ) : null}
      {resolvedActions && resolvedActions.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {resolvedActions.map((action) => (
            <button
              key={action.label}
              type="button"
              disabled={action.disabled}
              onClick={action.onClick}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12px] font-medium transition-colors",
                action.tone === "primary"
                  ? "bg-primary text-white hover:bg-primary-hover disabled:opacity-60"
                  : "border border-border bg-card text-text-secondary hover:bg-surface-muted hover:text-text-primary disabled:opacity-60",
                action.disabled && "cursor-not-allowed",
              )}
            >
              <ActionIcon icon={action.icon} spinning={action.disabled && action.icon === "refresh"} />
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};
