import type { ReactNode } from "react";

export function Modal({
  title,
  children,
  onClose,
  footer,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
        zIndex: 50,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "min(820px, 100%)",
          background: "var(--color-background-primary)",
          borderRadius: 16,
          border: "0.5px solid var(--color-border-tertiary)",
          boxShadow: "0 24px 70px rgba(15,23,42,0.22)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "0.5px solid var(--color-border-tertiary)",
            background: "var(--color-background-secondary)",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 900 }}>{title}</div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
              color: "var(--color-text-secondary)",
            }}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        <div style={{ padding: 16 }}>{children}</div>

        {footer ? (
          <div
            style={{
              padding: "12px 16px",
              borderTop: "0.5px solid var(--color-border-tertiary)",
              background: "var(--color-background-secondary)",
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

