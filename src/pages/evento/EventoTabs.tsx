import type { EventoTab } from "../../types";
import styles from "./EventoTabs.module.css";

const TAB_LABELS: Record<EventoTab, string> = {
  resumen: "Resumen",
  cotizaciones: "Cotizaciones",
  comunicaciones: "Comunicaciones",
  proveedores: "Proveedores",
  pagos: "Pagos",
  chat: "Chat IA",
};

export function EventoTabs({
  tab,
  onChange,
}: {
  tab: EventoTab;
  onChange: (t: EventoTab) => void;
}) {
  const keys = Object.keys(TAB_LABELS) as EventoTab[];
  return (
    <div className={styles.tabs}>
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          className={`${styles.tab} ${tab === k ? styles.on : ""}`}
          onClick={() => onChange(k)}
        >
          {TAB_LABELS[k]}
        </button>
      ))}
    </div>
  );
}

