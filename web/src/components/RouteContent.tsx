import { Component, Suspense, type ErrorInfo, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

class RouteErrorBoundary extends Component<{ children: ReactNode; pathname: string }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Halaman gagal dimuat.", error, info);
  }

  componentDidUpdate(previous: Readonly<{ children: ReactNode; pathname: string }>) {
    if (previous.pathname !== this.props.pathname && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (this.state.failed) {
      return (
        <div role="alert" className="p-6 space-y-3">
          <h1 className="text-lg font-semibold">Halaman gagal dimuat</h1>
          <p>Periksa koneksi internet. Simpan pekerjaan di tab lain sebelum memuat ulang aplikasi.</p>
          <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
            Muat ulang aplikasi
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function RouteContent({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <RouteErrorBoundary pathname={pathname}>
      <Suspense fallback={<p role="status" className="p-6 text-sm text-ink-500">Memuat halaman...</p>}>
        {children}
      </Suspense>
    </RouteErrorBoundary>
  );
}
