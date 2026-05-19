import { Link } from "react-router-dom";
import { routes } from "@/shared/routes";
import styles from "./StudentDashboardPage.module.css";

const TRAINING_ACTIONS = [
  {
    title: "Улучшить запрос",
    surface: "Prompt Lab",
    body: "Проверь, меняется ли ответ модели, если точнее задать роль, контекст, формат или ограничение.",
    href: routes.studentPromptLab,
    primary: true,
  },
  {
    title: "Разобрать ошибку",
    surface: "AI Clinic",
    body: "Найди тип слабого ответа и реши, чем чинить: запросом, контекстом, примером или новой проверкой.",
    href: routes.studentAiClinic,
    primary: false,
  },
  {
    title: "Дать пример обучения",
    surface: "Примеры обучения",
    body: "Сохрани задачу, черновик модели, критику и правильный целевой ответ для обучения своего ИИ.",
    href: routes.studentChatTraining,
    primary: false,
  },
  {
    title: "Дать предпочтение",
    surface: "Выбор лучшего ответа",
    body: "Сравни два ответа, выбери лучший и объясни причину. Такой сигнал помогает понять, какое поведение усиливать дальше.",
    href: routes.studentModelCompare,
    primary: false,
  },
  {
    title: "Обучить и включить модель",
    surface: "Обучение модели",
    body: "Собери примеры в данные, подключи обученную версию и сделай её активной для следующих ответов.",
    href: routes.studentTrainingManager,
    primary: false,
  },
] as const;

export function StudentTrainPage() {
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
          <h1 className={styles.pageTitle}>Тренируем</h1>
          <p className={styles.subtitle}>
            Здесь ты выбираешь рычаг улучшения: переписать запрос, разобрать ошибку,
            дать пример обучения или собрать новую версию модели.
          </p>
        </header>

        <article className={`${styles.card} ${styles.cardAccent}`}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Как выбрать следующий шаг</h2>
            <p className={styles.cardDesc}>
              Один и тот же слабый ответ можно чинить по-разному. Начни с самого лёгкого
              изменения, а если оно не помогает, переходи к примерам и обучению модели.
            </p>
          </div>
          <div className={styles.cardBody}>
            <dl className={styles.modelTrainingGrid}>
              <div>
                <dt className={styles.modelTrainingDt}>Если задача плохо понята</dt>
                <dd className={styles.modelTrainingDd}>Prompt Lab</dd>
              </div>
              <div>
                <dt className={styles.modelTrainingDt}>Если неясно, что сломалось</dt>
                <dd className={styles.modelTrainingDd}>AI Clinic</dd>
              </div>
              <div>
                <dt className={styles.modelTrainingDt}>Если нужен образец поведения</dt>
                <dd className={styles.modelTrainingDd}>Примеры обучения</dd>
              </div>
              <div>
                <dt className={styles.modelTrainingDt}>Если нужно выбрать лучший ответ</dt>
                <dd className={styles.modelTrainingDd}>Предпочтение</dd>
              </div>
              <div>
                <dt className={styles.modelTrainingDt}>Если примеры уже готовы</dt>
                <dd className={styles.modelTrainingDd}>Обучение модели</dd>
              </div>
            </dl>
          </div>
        </article>

        <section className={styles.companionHubGrid} aria-label="Инструменты тренировки">
          {TRAINING_ACTIONS.map((action) => (
            <article key={action.href} className={styles.hubActionCard}>
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
