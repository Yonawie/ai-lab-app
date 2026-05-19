import { Link } from "react-router-dom";
import { routes } from "@/shared/routes";
import styles from "./StudentDashboardPage.module.css";

const BUILD_ACTIONS = [
  {
    title: "Собрать проект",
    surface: "AI Studio",
    body: "Опиши проектный бриф, получи рабочую HTML/CSS/JS-версию и улучшай её по шагам.",
    href: routes.studentAiStudio,
    primary: true,
  },
  {
    title: "Проверить модель",
    surface: "Compare",
    body: "Если хочешь понять, стала ли модель лучше отвечать на проектные запросы, проверь её поведение в Compare.",
    href: routes.studentModelCompare,
    primary: false,
  },
  {
    title: "Посмотреть общий результат",
    surface: "Мой ИИ",
    body: "После сохранения версии вернись в Мой ИИ: там видно, что построено и какая модель использовалась.",
    href: routes.studentAiGrowth,
    primary: false,
  },
] as const;

export function StudentBuildPage() {
  return (
    <div className={styles.page}>
      <div className={styles.gradients} aria-hidden>
        <div className={styles.blob1} />
        <div className={styles.blob2} />
      </div>

      <div className={styles.inner}>
        <header className={styles.header}>
          <Link to={routes.studentAiGrowth} className={styles.backLink}>
            ← К разделу «Мой ИИ»
          </Link>
          <h1 className={styles.pageTitle}>Строим</h1>
          <p className={styles.subtitle}>
            Здесь ты применяешь своего ИИ в проекте: собираешь первую версию,
            улучшаешь её и сохраняешь результат как часть работы в AI Lab.
          </p>
        </header>

        <article className={`${styles.card} ${styles.cardAccent}`}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Зачем нужна эта зона</h2>
            <p className={styles.cardDesc}>
              Обучение модели важно не само по себе. В зоне “Строим” ты проверяешь,
              помогает ли активная модель создавать более полезные проектные решения.
            </p>
          </div>
          <div className={styles.cardBody}>
            <dl className={styles.modelTrainingGrid}>
              <div>
                <dt className={styles.modelTrainingDt}>Первый результат</dt>
                <dd className={styles.modelTrainingDd}>версия проекта</dd>
              </div>
              <div>
                <dt className={styles.modelTrainingDt}>Итерация</dt>
                <dd className={styles.modelTrainingDd}>улучшенная версия</dd>
              </div>
              <div>
                <dt className={styles.modelTrainingDt}>Проверка модели</dt>
                <dd className={styles.modelTrainingDd}>Compare</dd>
              </div>
              <div>
                <dt className={styles.modelTrainingDt}>Общая картина</dt>
                <dd className={styles.modelTrainingDd}>Мой ИИ</dd>
              </div>
            </dl>
          </div>
        </article>

        <section className={styles.companionHubGrid} aria-label="Инструменты строительства">
          {BUILD_ACTIONS.map((action) => (
            <article key={action.href + action.title} className={styles.hubActionCard}>
              <p className={styles.hubActionKicker}>{action.surface}</p>
              <h2 className={styles.hubActionTitle}>{action.title}</h2>
              <p className={styles.hubActionDesc}>{action.body}</p>
              <Link
                to={action.href}
                className={`${styles.btn} ${
                  action.primary ? styles.btnAccent : styles.btnOutline
                } ${styles.hubActionBtn}`}
              >
                Открыть
              </Link>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
