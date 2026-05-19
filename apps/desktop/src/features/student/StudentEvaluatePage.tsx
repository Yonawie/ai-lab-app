import { Link } from "react-router-dom";
import { routes } from "@/shared/routes";
import { studentArenaScreenPath } from "./student-surface-paths";
import styles from "./StudentDashboardPage.module.css";

const EVALUATION_ACTIONS = [
  {
    title: "Проверить изменение на одном запросе",
    surface: "Compare",
    body: "Используй Compare, когда нужно быстро понять: ответ модели реально изменился или нет.",
    href: routes.studentModelCompare,
    primary: true,
  },
  {
    title: "Проверить устойчивость на задачах",
    surface: "Arena",
    body: "Используй Arena, когда хочешь доказать, что улучшение держится на разных задачах или в матче моделей.",
    href: studentArenaScreenPath,
    primary: false,
  },
  {
    title: "Запустить скрытую проверку",
    surface: "Новая задача",
    body: "Проверь модель на задании, которое ты не видел заранее. Так проще отличить настоящее улучшение от запоминания.",
    href: routes.studentModelCompare,
    state: {
      fromMyAi: true,
      prompt: "",
      compareTag: "hidden-benchmark",
      note: "Открой блок «Скрытая проверка» и запусти новую задачу для модели.",
      highlightHiddenBenchmark: true,
    },
    primary: false,
  },
  {
    title: "Сохранить выбор лучшего ответа",
    surface: "Предпочтение",
    body: "После Compare выбери лучший ответ и коротко объясни почему. Это превращает оценку в полезный сигнал для следующего цикла.",
    href: routes.studentModelCompare,
    primary: false,
  },
  {
    title: "Разобрать слабое место",
    surface: "AI Clinic",
    body: "Если проверка слабая, не повторяй её вслепую: найди тип ошибки и преврати его в следующий шаг тренировки.",
    href: routes.studentAiClinic,
    primary: false,
  },
] as const;

export function StudentEvaluatePage() {
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
          <h1 className={styles.pageTitle}>Проверяем</h1>
          <p className={styles.subtitle}>
            Здесь ты доказываешь, что Мой ИИ стал лучше: сначала на одном запросе,
            затем на наборе задач или в соревновании моделей.
          </p>
        </header>

        <article className={`${styles.card} ${styles.cardAccent}`}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Compare или Arena?</h2>
            <p className={styles.cardDesc}>
              Compare отвечает на вопрос “изменилось ли поведение на одном примере”.
              Arena отвечает на вопрос “держится ли улучшение на разных задачах”.
            </p>
          </div>
          <div className={styles.cardBody}>
            <dl className={styles.modelTrainingGrid}>
              <div>
                <dt className={styles.modelTrainingDt}>Один запрос</dt>
                <dd className={styles.modelTrainingDd}>Compare</dd>
              </div>
              <div>
                <dt className={styles.modelTrainingDt}>Набор задач</dt>
                <dd className={styles.modelTrainingDd}>Arena</dd>
              </div>
              <div>
                <dt className={styles.modelTrainingDt}>Слабый результат</dt>
                <dd className={styles.modelTrainingDd}>AI Clinic</dd>
              </div>
              <div>
                <dt className={styles.modelTrainingDt}>Новая задача</dt>
                <dd className={styles.modelTrainingDd}>Скрытая проверка</dd>
              </div>
              <div>
                <dt className={styles.modelTrainingDt}>Лучший ответ</dt>
                <dd className={styles.modelTrainingDd}>Выбор и причина</dd>
              </div>
              <div>
                <dt className={styles.modelTrainingDt}>Следующий цикл</dt>
                <dd className={styles.modelTrainingDd}>Тренируем</dd>
              </div>
            </dl>
            <p className={styles.classificationHint} style={{ marginTop: "0.9rem" }}>
              Если Compare слабый, возвращайся в Prompt Lab или Примеры обучения.
              Если Arena слабая, разбери провал в AI Clinic и добавь новые примеры для этой слабости.
            </p>
          </div>
        </article>

        <article className={`${styles.card} ${styles.cardMuted}`}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Проверка запускает следующий шаг</h2>
            <p className={styles.cardDesc}>
              Слабый результат не нужно просто повторять. Найди причину, преврати ее в сильный пример
              обучения, обнови модель и проверь снова.
            </p>
          </div>
          <div className={styles.cardBody}>
            <dl className={styles.modelTrainingGrid}>
              <div>
                <dt className={styles.modelTrainingDt}>1. Найди слабое место</dt>
                <dd className={styles.modelTrainingDd}>AI Clinic</dd>
              </div>
              <div>
                <dt className={styles.modelTrainingDt}>2. Сделай сильный пример</dt>
                <dd className={styles.modelTrainingDd}>Примеры обучения</dd>
              </div>
              <div>
                <dt className={styles.modelTrainingDt}>3. Обнови модель</dt>
                <dd className={styles.modelTrainingDd}>Training Manager</dd>
              </div>
              <div>
                <dt className={styles.modelTrainingDt}>4. Докажи изменение</dt>
                <dd className={styles.modelTrainingDd}>Compare / Arena</dd>
              </div>
            </dl>
            <div className={styles.nextActions} style={{ marginTop: "0.9rem" }}>
              <Link to={routes.studentAiClinic} className={styles.nextBtn}>
                Разобрать слабое место
              </Link>
              <Link to={routes.studentChatTraining} className={`${styles.nextBtn} ${styles.nextBtnSecondary}`}>
                Создать сильный пример
              </Link>
            </div>
          </div>
        </article>

        <section className={styles.companionHubGrid} aria-label="Инструменты проверки">
          {EVALUATION_ACTIONS.map((action) => (
            <article key={action.href + action.title} className={styles.hubActionCard}>
              <p className={styles.hubActionKicker}>{action.surface}</p>
              <h2 className={styles.hubActionTitle}>{action.title}</h2>
              <p className={styles.hubActionDesc}>{action.body}</p>
              <Link
                to={action.href}
                state={"state" in action ? action.state : undefined}
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
