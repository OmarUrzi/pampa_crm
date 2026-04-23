import type { EventoStatus } from "../types";

export const STATUS_META: Record<
  EventoStatus,
  { label: string; cssClass: "info" | "warning" | "success" | "danger" | "neutral" }
> = {
  consulta:    { label: "Consulta",       cssClass: "info" },
  cotizando:   { label: "Cotizando",      cssClass: "warning" },
  enviada:     { label: "Cot. Enviada",   cssClass: "warning" },
  negociacion: { label: "En Negociación", cssClass: "neutral" },
  confirmado:  { label: "Confirmado",     cssClass: "success" },
  perdido:     { label: "Perdido",        cssClass: "danger" },
};

export function statusStyle(status: EventoStatus): React.CSSProperties {
  const m = STATUS_META[status];
  return {
    background: `var(--color-${m.cssClass}-bg)`,
    color: `var(--color-${m.cssClass}-fg)`,
  };
}

// Keep backward compat for pages that pass explicit bg/fg inline
export const ST_LEGACY: Record<EventoStatus, { label: string; bg: string; fg: string }> = {
  consulta:    { label: "Consulta",       bg: "var(--color-info-bg)",    fg: "var(--color-info-fg)" },
  cotizando:   { label: "Cotizando",      bg: "var(--color-warning-bg)", fg: "var(--color-warning-fg)" },
  enviada:     { label: "Cot. Enviada",   bg: "var(--color-warning-bg)", fg: "var(--color-warning-fg)" },
  negociacion: { label: "En Negociación", bg: "var(--color-neutral-bg)", fg: "var(--color-neutral-fg)" },
  confirmado:  { label: "Confirmado",     bg: "var(--color-success-bg)", fg: "var(--color-success-fg)" },
  perdido:     { label: "Perdido",        bg: "var(--color-danger-bg)",  fg: "var(--color-danger-fg)" },
};
