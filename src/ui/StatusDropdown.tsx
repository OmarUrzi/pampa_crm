import { useEffect, useMemo, useRef, useState } from "react";
import type { EventoStatus } from "../types";

type StatusMeta = { label: string; bg: string; fg: string };

export function StatusDropdown({
  value,
  options,
  onChange,
}: {
  value: EventoStatus;
  options: Record<EventoStatus, StatusMeta>;
  onChange: (v: EventoStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const items = useMemo(() => Object.keys(options) as EventoStatus[], [options]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!open) return;
      const el = rootRef.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const cur = options[value];

  return (
    <div ref={rootRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          border: "0.5px solid rgba(15,23,42,0.10)",
          borderRadius: 999,
          padding: "5px 10px",
          background: cur.bg,
          color: cur.fg,
          fontSize: 12,
          fontWeight: 800,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {cur.label}
        <span style={{ opacity: 0.75, fontWeight: 900 }}>▾</span>
      </button>

      {open ? (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 20,
            minWidth: 190,
            padding: 6,
            borderRadius: 12,
            border: "0.5px solid var(--color-border-tertiary)",
            background: "var(--color-background-primary)",
            boxShadow:
              "0 10px 30px rgba(15,23,42,0.10), 0 2px 8px rgba(15,23,42,0.06)",
          }}
        >
          {items.map((k) => {
            const meta = options[k];
            const isActive = k === value;
            return (
              <button
                key={k}
                role="menuitem"
                type="button"
                onClick={() => {
                  onChange(k);
                  setOpen(false);
                }}
                style={{
                  width: "100%",
                  textAlign: "left",
                  border: "none",
                  cursor: "pointer",
                  background: isActive ? "rgba(15,23,42,0.04)" : "transparent",
                  padding: "8px 8px",
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 999,
                      background: meta.fg,
                      boxShadow: "0 0 0 3px rgba(15,23,42,0.04)",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 12, fontWeight: 800, color: "var(--color-text-primary)" }}>
                    {meta.label}
                  </span>
                </span>

                {isActive ? (
                  <span style={{ fontSize: 12, fontWeight: 900, color: "var(--color-text-secondary)" }}>
                    ✓
                  </span>
                ) : (
                  <span
                    aria-hidden="true"
                    style={{
                      width: 22,
                      height: 10,
                      borderRadius: 999,
                      background: meta.bg,
                      border: "0.5px solid rgba(15,23,42,0.06)",
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

