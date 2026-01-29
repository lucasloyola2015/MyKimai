"use client";

import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class PageErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error("PageErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 border border-destructive rounded-md">
          <h2 className="text-lg font-semibold text-destructive">Error al cargar la página</h2>
          <p className="text-sm text-muted-foreground mt-2">
            {this.state.error?.message || "Ha ocurrido un error desconocido"}
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
