import type { CSSProperties, ReactNode } from "react";
import styles from "./ui.module.css";

export function SectionTitle({ children }: { children: ReactNode }) {
  return <div className={styles.sectionTitle}>{children}</div>;
}

export function Pill({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <span className={styles.pill} style={style}>
      {children}
    </span>
  );
}

export function Button({
  children,
  variant = "default",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary";
}) {
  return (
    <button
      {...props}
      className={`${styles.btn} ${variant === "primary" ? styles.primary : ""}`}
    >
      {children}
    </button>
  );
}

export function Chip({
  children,
  active,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
}) {
  return (
    <button
      {...props}
      className={`${styles.chip} ${active ? styles.on : ""}`}
    >
      {children}
    </button>
  );
}

