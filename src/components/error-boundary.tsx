'use client';

import { Component, type ReactNode } from 'react';

type FallbackRender = (args: { error: Error | null; resetErrorBoundary: () => void }) => ReactNode;

interface Props {
  children: ReactNode;
  fallback?: ReactNode | FallbackRender;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught:', error.message, error.stack, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const { fallback } = this.props;
      if (typeof fallback === 'function') {
        return fallback({ error: this.state.error, resetErrorBoundary: this.handleReset });
      }
      return fallback || (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
          <div className="rounded-2xl border-2 border-dashed border-muted-foreground/25 p-12 max-w-md">
            <div className="h-12 w-12 mx-auto mb-4 rounded-full bg-destructive/10 flex items-center justify-center">
              <svg className="h-6 w-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <p className="text-lg font-semibold">Une erreur est survenue</p>
            <p className="mt-2 text-sm text-muted-foreground">{this.state.error?.message || 'Veuillez réessayer ou recharger la page.'}</p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Réessayer
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-lg border text-sm font-medium hover:bg-accent transition-colors"
              >
                Recharger
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
