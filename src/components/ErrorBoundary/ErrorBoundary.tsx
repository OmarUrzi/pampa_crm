import type { ReactNode } from "react";
import React from "react";
import { NoticeBanner } from "../NoticeBanner/NoticeBanner";
import { useNoticeStore } from "../../state/useNoticeStore";

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error);
    try {
      useNoticeStore.getState().show("Ocurrió un error inesperado. Recargá la página.", { variant: "error" });
    } catch {
      // ignore
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ padding: 16 }}>
        <NoticeBanner />
        <div style={{ fontWeight: 900, marginTop: 12 }}>Algo salió mal.</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 6 }}>
          Probá recargar la página. Si persiste, revisá la consola para más detalles.
        </div>
      </div>
    );
  }
}

