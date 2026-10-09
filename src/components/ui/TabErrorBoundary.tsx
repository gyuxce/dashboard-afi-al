import React from 'react';
import { CircleAlert, RefreshCw } from 'lucide-react';

type Props = {
  children: React.ReactNode;
  /** Label for recovery UI (e.g. tab name) */
  label?: string;
};

type State = {
  error: Error | null;
};

// React 19 ships without @types/react in this repo; cast keeps the runtime class API.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ReactComponent = React.Component as any;

/** Isolates a tab crash so the shell/sidebar stay usable. */
class TabErrorBoundaryInner extends ReactComponent {
  declare props: Props;
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error('[TabErrorBoundary]', this.props.label || 'tab', error, info?.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      const label = this.props.label || 'tampilan ini';
      return (
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card px-6 py-16 text-center"
          role="alert"
        >
          <CircleAlert className="h-8 w-8 text-danger" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-text-primary">
              Gagal memuat {label}
            </p>
            <p className="mt-1 max-w-md text-xs text-text-muted">
              Tab lain tetap bisa dipakai. Coba muat ulang tab ini, atau refresh data di File Center.
            </p>
          </div>
          <button
            type="button"
            onClick={this.handleReset}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Coba lagi
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export function TabErrorBoundary({ children, label }: Props) {
  return <TabErrorBoundaryInner label={label}>{children}</TabErrorBoundaryInner>;
}
