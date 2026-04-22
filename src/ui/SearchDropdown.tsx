import { useEffect, useMemo, useRef, useState } from "react";

export type SearchDropdownItem = {
  id: string;
  label: string;
  sublabel?: string;
};

export function SearchDropdown({
  valueId,
  placeholder,
  disabled,
  items,
  onChange,
}: {
  valueId: string;
  placeholder: string;
  disabled?: boolean;
  items: SearchDropdownItem[];
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selected = useMemo(
    () => items.find((x) => x.id === valueId) ?? null,
    [items, valueId],
  );

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return items;
    return items.filter((it) => {
      const hay = `${it.label} ${it.sublabel ?? ""}`.toLowerCase();
      return hay.includes(qq);
    });
  }, [items, q]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!open) return;
      const el = rootRef.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      setOpen(false);
      setQ("");
    }
    function onEsc(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === "Escape") {
        setOpen(false);
        setQ("");
      }
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: "relative", display: "inline-block", width: "100%" }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          border: "0.5px solid var(--color-border-secondary)",
          borderRadius: 10,
          padding: "8px 11px",
          background: disabled ? "rgba(15,23,42,0.03)" : "var(--color-background-primary)",
          color: disabled ? "var(--color-text-secondary)" : "var(--color-text-primary)",
          fontSize: 12,
          marginTop: 6,
          cursor: disabled ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected ? selected.label : placeholder}
        </span>
        <span style={{ opacity: 0.7, fontWeight: 900 }}>▾</span>
      </button>

      {open ? (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            zIndex: 30,
            padding: 8,
            borderRadius: 12,
            border: "0.5px solid var(--color-border-tertiary)",
            background: "var(--color-background-primary)",
            boxShadow:
              "0 10px 30px rgba(15,23,42,0.10), 0 2px 8px rgba(15,23,42,0.06)",
          }}
        >
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar…"
            style={{
              width: "100%",
              border: "0.5px solid var(--color-border-secondary)",
              borderRadius: 10,
              padding: "8px 11px",
              background: "var(--color-background-secondary)",
              color: "var(--color-text-primary)",
              fontSize: 12,
            }}
          />

          <div style={{ marginTop: 8, maxHeight: 220, overflow: "auto", display: "grid", gap: 6 }}>
            {filtered.length ? (
              filtered.map((it) => {
                const isActive = it.id === valueId;
                return (
                  <button
                    key={it.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onChange(it.id);
                      setOpen(false);
                      setQ("");
                    }}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      border: "none",
                      cursor: "pointer",
                      background: isActive ? "rgba(15,23,42,0.04)" : "transparent",
                      padding: "9px 10px",
                      borderRadius: 10,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <span style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {it.label}
                      </div>
                      {it.sublabel ? (
                        <div style={{ fontSize: 11, color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {it.sublabel}
                        </div>
                      ) : null}
                    </span>
                    {isActive ? (
                      <span style={{ fontSize: 12, fontWeight: 900, color: "var(--color-text-secondary)" }}>
                        ✓
                      </span>
                    ) : null}
                  </button>
                );
              })
            ) : (
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Sin resultados</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

