import type { ReactNode } from "react";
import styles from "./AppShell.module.css";
import { Sidebar } from "./Sidebar";
import { Outlet } from "react-router-dom";
import { NoticeBanner } from "../NoticeBanner/NoticeBanner";
import { useBootstrapStore } from "../../state/useBootstrapStore";
import { FullPageLoader } from "../FullPageLoader/FullPageLoader";

export function AppShell({ children }: { children?: ReactNode }) {
  const isBootstrapping = useBootstrapStore((s) => s.isBootstrapping);
  return (
    <div className={styles.frame}>
      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          <Sidebar />
        </aside>
        <main className={styles.main}>
          <NoticeBanner />
          <div className={styles.content}>
            {isBootstrapping ? (
              <FullPageLoader message="Cargando datos…" />
            ) : (
              children ?? <Outlet />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
