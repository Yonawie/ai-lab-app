import { useMemo } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/shared/auth-context";
import { homeRouteForRole } from "@/shared/auth-routes";
import { routes } from "@/shared/routes";
import styles from "./AppShell.module.css";

export function AppShell() {
  const navigate = useNavigate();
  const { logout, userRole } = useAuth();

  const nav = useMemo(() => {
    if (userRole === "student") {
      return [{ to: routes.studentAiGrowth, label: "Ученик" }] as const;
    }
    if (userRole === "teacher") {
      return [{ to: routes.teacher, label: "Учитель" }] as const;
    }
    if (userRole === "admin") {
      return [{ to: routes.admin, label: "Администратор" }] as const;
    }
    return [] as readonly { to: string; label: string }[];
  }, [userRole]);

  function handleSignOut() {
    logout();
    navigate(routes.login, { replace: true });
  }

  function handleHome() {
    if (userRole) {
      navigate(homeRouteForRole(userRole), { replace: true });
    }
  }

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar} aria-label="Основная навигация">
        <div className={styles.brand}>AI Lab</div>
        <nav className={styles.nav}>
          {nav.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                isActive ? `${styles.link} ${styles.linkActive}` : styles.link
              }
              end={false}
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className={styles.sidebarFooter}>
          <button
            type="button"
            className={styles.secondaryLink}
            onClick={handleHome}
          >
            На главную
          </button>
          <button
            type="button"
            className={styles.secondaryLink}
            onClick={handleSignOut}
          >
            Выйти
          </button>
        </div>
      </aside>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
