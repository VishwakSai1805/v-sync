import { Component } from 'react';

// Last line of defence: an unexpected rendering error shows a recoverable
// message instead of unmounting the whole app to a blank page.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('V-Sync UI error:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-full items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">Something went wrong on this page</h1>
          <p className="mt-2 text-sm text-slate-500">Your data is safe. Reload to continue; if it keeps happening, sign in again.</p>
          <div className="mt-6 flex justify-center gap-3">
            <button onClick={() => window.location.reload()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">Reload</button>
            <button onClick={() => window.location.assign('/')} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Go to dashboard</button>
          </div>
        </div>
      </div>
    );
  }
}
