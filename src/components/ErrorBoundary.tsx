import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";

// Last line of defense: a render error anywhere below no longer blanks the
// whole app. Work is safe — the form autosaves to localStorage — so the
// recovery action is simply a reload.
interface Props { children: ReactNode; }
interface State { error: Error | null; }

class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled render error:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen grid place-items-center bg-background p-6">
        <div className="max-w-md w-full rounded-lg border bg-card p-6 space-y-4 text-center">
          <p className="text-3xl">⚠️</p>
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            The page hit an unexpected error. Your work is autosaved locally — reloading will
            restore your draft.
          </p>
          <p className="text-xs text-muted-foreground font-mono break-all">
            {this.state.error.message}
          </p>
          <Button onClick={() => window.location.reload()}>Reload the app</Button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
