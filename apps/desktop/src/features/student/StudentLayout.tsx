import { NavLink, Outlet } from "react-router-dom";
import { routes } from "@/shared/routes";
import styles from "./StudentLayout.module.css";

const productZones = [
  { to: routes.studentAiGrowth, label: "Мой ИИ" },
  { to: routes.studentCourse, label: "Учимся" },
  { to: routes.studentTrain, label: "Тренируем" },
  { to: routes.studentEvaluate, label: "Проверяем" },
  { to: routes.studentBuild, label: "Строим" },
] as const;

const quickLinks = [
  { to: routes.studentPromptLab, label: "Prompt Lab: запрос" },
  { to: routes.studentAiClinic, label: "AI Clinic: ошибка" },
  { to: routes.studentChatTraining, label: "Примеры обучения" },
  { to: routes.studentTrainingManager, label: "Обучение модели" },
  { to: routes.studentModelCompare, label: "Compare: проверка" },
  { to: routes.studentArena, label: "Arena: задачи" },
  { to: routes.studentAiStudio, label: "AI Studio: проект" },
] as const;

export function StudentLayout() {
  return (
    <div className={styles.layout}>
      <div className={styles.topbar}>
        <nav className={styles.zoneRow} aria-label="Зоны AI Lab">
          {productZones.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                isActive ? `${styles.zoneLink} ${styles.zoneLinkActive}` : styles.zoneLink
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <nav className={styles.toolRow} aria-label="Инструменты AI Lab">
          <span className={styles.toolRowLabel}>Инструменты:</span>
          {quickLinks.map(({ to, label }) => (
            <NavLink key={to} to={to} className={styles.toolLink}>
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className={styles.content}>
        <Outlet />
      </div>
    </div>
  );
}
