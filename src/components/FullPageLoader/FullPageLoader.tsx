import styles from "./FullPageLoader.module.css";

export function FullPageLoader({ label }: { label?: string }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.title}>{label ?? "Cargando…"}</div>
        <p className={styles.hint}>Validando sesión y preparando el workspace.</p>
      </div>
    </div>
  );
}

