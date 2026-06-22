import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "@/App";
import "@/styles.css";

interface BootErrorBoundaryState {
  error: Error | null;
}

class BootErrorBoundary extends React.Component<React.PropsWithChildren, BootErrorBoundaryState> {
  state: BootErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Adaptive Surface failed to render", error);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
        <section className="w-full max-w-2xl rounded-lg border border-border bg-card p-5 shadow-lg">
          <h1 className="text-lg font-semibold">Adaptive Surface could not finish starting.</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The app caught a startup error before the workspace could render.
          </p>
          <pre className="mt-4 max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">
            {this.state.error.message}
          </pre>
        </section>
      </div>
    );
  }
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Adaptive Surface root element was not found.");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <BootErrorBoundary>
      <App />
    </BootErrorBoundary>
  </React.StrictMode>,
);
