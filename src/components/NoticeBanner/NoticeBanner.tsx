import styles from "./NoticeBanner.module.css";
import { useNoticeStore } from "../../state/useNoticeStore";

export function NoticeBanner() {
  const message = useNoticeStore((s) => s.message);
  const variant = useNoticeStore((s) => s.variant);
  const clear = useNoticeStore((s) => s.clear);
  if (!message) return null;
  return (
    <div className={`${styles.wrap} ${variant === "info" ? styles.info : variant === "warning" ? styles.warning : styles.error}`}>
      <div className={styles.msg}>{message}</div>
      <button className={styles.close} type="button" onClick={clear} aria-label="Cerrar aviso">
        ✕
      </button>
    </div>
  );
}

