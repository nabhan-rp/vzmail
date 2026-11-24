import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Terjadi kesalahan pada antarmuka aplikasi.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('VZ Mail UI ErrorBoundary:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] dark:bg-[#0B0D11] p-6">
          <div className="max-w-md w-full bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl p-6 space-y-4">
            <div className="text-xs font-mono text-rose-600 dark:text-rose-400">
              VZ Mail · Recovery Boundary
            </div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white font-display">
              Terjadi kesalahan tak terduga
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-mono break-words">
              {this.state.message}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Data email lokal di IndexedDB perangkat Anda tetap aman.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={this.handleReset}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
              >
                Coba Lagi
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-[#1B202B] rounded-lg cursor-pointer"
              >
                Muat Ulang Halaman
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
