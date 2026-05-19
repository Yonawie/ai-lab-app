import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/shared/auth-context";
import {
  companionDataAvailable,
  fetchModelTrainingStatus,
  fetchStudentAiCompanion,
  trainStudentModel,
  type ModelTrainingStatus,
  type StudentAiCompanion,
  type TrainModelResult,
} from "@/shared/companion-tauri";
import { routes } from "@/shared/routes";
import { BotIcon } from "./StudentDashboardIcons";
import styles from "./StudentDashboardPage.module.css";

const OFFLINE_PREVIEW: StudentAiCompanion = {
  name: "Лума",
  stage: 1,
  personalityType: "explorer",
  logic: 5,
  creativity: 5,
  empathy: 5,
  focus: 5,
};

function personalityLabel(t: string): string {
  switch (t.toLowerCase()) {
    case "explorer":
      return "исследователь";
    case "mentor":
      return "наставник";
    case "strategist":
      return "стратег";
    case "inventor":
      return "изобретатель";
    default:
      return t;
  }
}

function personaCardModifier(personalityType: string): string {
  const p = personalityType.toLowerCase();
  if (p === "mentor") return styles.companionPersona_mentor;
  if (p === "strategist") return styles.companionPersona_strategist;
  if (p === "inventor") return styles.companionPersona_inventor;
  return styles.companionPersona_explorer;
}

function StatBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.round(Math.min(100, Math.max(0, (value / max) * 100)));
  return (
    <div className={styles.companionStatRow}>
      <div className={styles.companionStatHead}>
        <span className={styles.companionStatLabel}>{label}</span>
        <span className={styles.companionStatValue}>{value}</span>
      </div>
      <div className={styles.companionStatTrack} role="presentation">
        <div className={styles.companionStatFill} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const STAT_MAX = 40;

function formatPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function formatLastTrained(value: string | null | undefined): string {
  if (!value) return "ещё не запускали";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("ru-RU");
}

export function StudentAICompanionPage() {
  const { userEmail: authEmail } = useAuth();
  const [companion, setCompanion] = useState<StudentAiCompanion | null>(null);
  const [modelStatus, setModelStatus] = useState<ModelTrainingStatus | null>(null);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [trainOutcome, setTrainOutcome] = useState<TrainModelResult | null>(null);
  const [trainBusy, setTrainBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(!companionDataAvailable());

  const load = useCallback(async () => {
    const email = (authEmail ?? "").trim();
    if (!email) {
      setCompanion(null);
      setModelStatus(null);
      setModelError(null);
      setModelLoading(false);
      setError("Войдите с email студента, чтобы загрузить помощника.");
      return;
    }
    if (!companionDataAvailable()) {
      setCompanion(OFFLINE_PREVIEW);
      setModelStatus(null);
      setModelError(null);
      setModelLoading(false);
      setOffline(true);
      setError(null);
      return;
    }
    setOffline(false);
    setModelLoading(true);
    setModelError(null);
    try {
      const row = await fetchStudentAiCompanion(email);
      setCompanion(row ?? OFFLINE_PREVIEW);
      setError(null);
    } catch (e) {
      setCompanion(null);
      setModelStatus(null);
      setModelLoading(false);
      setModelError(null);
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    try {
      const training = await fetchModelTrainingStatus(email);
      if (training === null) {
        setModelStatus(null);
        setModelError("Не удалось загрузить состояние модели.");
      } else {
        setModelStatus(training);
      }
    } catch (e) {
      setModelStatus(null);
      setModelError(e instanceof Error ? e.message : String(e));
    } finally {
      setModelLoading(false);
    }
  }, [authEmail]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleTrain() {
    const email = (authEmail ?? "").trim();
    if (!email || !companionDataAvailable()) return;
    setTrainBusy(true);
    setTrainOutcome(null);
    setModelError(null);
    try {
      const res = await trainStudentModel(email);
      setTrainOutcome(res);
      const st = await fetchModelTrainingStatus(email);
      if (st) setModelStatus(st);
    } catch (e) {
      setTrainOutcome(null);
      setModelError(e instanceof Error ? e.message : String(e));
    } finally {
      setTrainBusy(false);
    }
  }

  const c = companion ?? OFFLINE_PREVIEW;
  const cardExtra = personaCardModifier(String(c.personalityType));

  return (
    <div className={styles.page}>
      <div className={styles.gradients} aria-hidden>
        <div className={styles.blob1} />
        <div className={styles.blob2} />
      </div>

      <div className={styles.inner}>
        <header className={styles.header}>
          <Link to={routes.studentAiGrowth} className={styles.backLink}>
            ← К «Мой ИИ»
          </Link>
          <h1 className={styles.pageTitle}>AI Companion</h1>
          <p className={styles.subtitle}>
            Дополнительный обзор помощника. Главная работа с твоей моделью теперь начинается
            в «Мой ИИ» и ведёт дальше в обучение, проверку и AI Studio.
          </p>
        </header>

        {error ? (
          <article className={`${styles.card} ${styles.cardMuted}`}>
            <div className={styles.cardBody}>
              <p className={styles.taskEmpty}>{error}</p>
            </div>
          </article>
        ) : null}

        <article className={`${styles.card} ${styles.cardAccent} ${cardExtra}`}>
          <div className={styles.cardHeader}>
            <div className={styles.companionHeader}>
              <div className={`${styles.companionIcon} ${styles.iconStat}`}>
                <BotIcon />
              </div>
              <div>
                <h2 className={styles.cardTitleLg}>{c.name}</h2>
                <p className={styles.cardDesc}>
                  Стадия {c.stage} · {personalityLabel(String(c.personalityType))}
                  {offline ? <span className={styles.companionOfflineBadge}> предпросмотр</span> : null}
                </p>
              </div>
            </div>
          </div>
          <div className={`${styles.cardBody} ${styles.cardBodyTight}`}>
            {offline ? (
              <p className={styles.classificationHint}>
                Полные данные помощника доступны в установленной версии приложения. Сейчас
                показан безопасный предпросмотр.
              </p>
            ) : null}
            <div className={styles.companionStatsBlock} aria-label="Параметры помощника">
              <StatBar label="Логика" value={c.logic} max={STAT_MAX} />
              <StatBar label="Креативность" value={c.creativity} max={STAT_MAX} />
              <StatBar label="Эмпатия" value={c.empathy} max={STAT_MAX} />
              <StatBar label="Фокус" value={c.focus} max={STAT_MAX} />
            </div>
            <p className={styles.classificationHint}>
              Этот экран оставлен как дополнительный обзор. Если хочешь реально улучшать
              модель, начни с «Мой ИИ» или с примеров обучения.
            </p>
          </div>
        </article>

        <article className={`${styles.card} ${styles.cardMuted}`} aria-labelledby="companion-actions-heading">
          <div className={styles.cardHeader}>
            <h2 id="companion-actions-heading" className={`${styles.cardTitle} ${styles.cardTitleXl}`}>
              Куда идти дальше
            </h2>
            <p className={styles.cardDesc}>
              Основной маршрут: увидеть состояние модели, добавить примеры, обучить,
              включить и проверить результат.
            </p>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.companionHubGrid}>
              <article className={styles.hubActionCard}>
                <h3 className={styles.hubActionTitle}>Мой ИИ</h3>
                <p className={styles.hubActionDesc}>
                  Главный экран: состояние модели, примеры обучения, проверки и лучший следующий шаг.
                </p>
                <Link to={routes.studentAiGrowth} className={`${styles.btn} ${styles.btnAccent} ${styles.hubActionBtn}`}>
                  Открыть Мой ИИ
                </Link>
              </article>

              <article className={styles.hubActionCard}>
                <h3 className={styles.hubActionTitle}>Учимся</h3>
                <p className={styles.hubActionDesc}>
                  Курс ведёт по реальному циклу: запрос, примеры обучения, проверка и проект.
                </p>
                <Link to={routes.studentCourse} className={`${styles.btn} ${styles.btnOutline} ${styles.hubActionBtn}`}>
                  Открыть курс
                </Link>
              </article>

              <article className={styles.hubActionCard}>
                <h3 className={styles.hubActionTitle}>Проверяем</h3>
                <p className={styles.hubActionDesc}>
                  Compare показывает изменение на одном запросе, Arena проверяет устойчивость на задачах.
                </p>
                <Link to={routes.studentEvaluate} className={`${styles.btn} ${styles.btnOutline} ${styles.hubActionBtn}`}>
                  Открыть проверку
                </Link>
              </article>

              <article className={styles.hubActionCard}>
                <h3 className={styles.hubActionTitle}>Быстрые переходы</h3>
                <p className={styles.hubActionDesc}>
                  Если знаешь, что хочешь сделать дальше, открой нужную рабочую поверхность.
                </p>
                <div className={styles.btnRow} style={{ flexWrap: "wrap", marginTop: "0.35rem" }}>
                  <Link to={routes.studentPromptLab} className={`${styles.btn} ${styles.btnOutline}`}>
                    Prompt Lab
                  </Link>
                  <Link to={routes.studentTrain} className={`${styles.btn} ${styles.btnOutline}`}>
                    Тренируем
                  </Link>
                  <Link to={routes.studentEvaluate} className={`${styles.btn} ${styles.btnOutline}`}>
                    Проверяем
                  </Link>
                  <Link to={routes.studentBuild} className={`${styles.btn} ${styles.btnOutline}`}>
                    Строим
                  </Link>
                </div>
              </article>
            </div>
          </div>
        </article>

        <article
          className={`${styles.card} ${styles.cardMuted} ${styles.modelTrainingCard}`}
          aria-labelledby="model-training-heading"
        >
          <div className={styles.cardHeader}>
            <h2 id="model-training-heading" className={`${styles.cardTitle} ${styles.cardTitleXl}`}>
              Дополнительный статус модели
            </h2>
            <p className={styles.cardDesc}>
              Этот блок показывает старый способ обучения. Основной процесс сейчас находится
              в зоне «Тренируем».
            </p>
          </div>
          <div className={styles.cardBody}>
            {offline ? (
              <p className={styles.classificationHint}>
                Статус модели и кнопка обучения доступны в установленной версии приложения
                после входа с email студента.
              </p>
            ) : modelLoading ? (
              <p className={styles.classificationHint}>Загружаем состояние модели...</p>
            ) : modelError ? (
              <>
                <p className={styles.classificationError}>{modelError}</p>
                <div className={styles.classificationActions}>
                  <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => void load()}>
                    Повторить
                  </button>
                </div>
              </>
            ) : !modelStatus ? (
              <p className={styles.classificationHint}>
                Нет данных о состоянии модели. Обнови страницу или вернись в «Мой ИИ».
              </p>
            ) : (
              <>
                <dl className={styles.modelTrainingGrid}>
                  <div>
                    <dt className={styles.modelTrainingDt}>Тип модели</dt>
                    <dd className={styles.modelTrainingDd}>{modelStatus.modelType}</dd>
                  </div>
                  <div>
                    <dt className={styles.modelTrainingDt}>Размер набора</dt>
                    <dd className={styles.modelTrainingDd}>
                      {modelStatus.datasetSize.toLocaleString("ru-RU")} прим.
                    </dd>
                  </div>
                  <div>
                    <dt className={styles.modelTrainingDt}>Точность по разметке</dt>
                    <dd className={styles.modelTrainingDd}>{formatPct(modelStatus.accuracy)}</dd>
                  </div>
                  <div>
                    <dt className={styles.modelTrainingDt}>Последнее обучение</dt>
                    <dd className={styles.modelTrainingDd}>
                      {formatLastTrained(modelStatus.lastTrainedAt)}
                    </dd>
                  </div>
                </dl>
                <div className={styles.classificationActions}>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnAccent}`}
                    disabled={trainBusy || modelStatus.datasetSize === 0 || !authEmail?.trim()}
                    onClick={() => void handleTrain()}
                  >
                    {trainBusy ? "Обучение..." : "Запустить старое обучение"}
                  </button>
                  <Link to={routes.studentTrain} className={`${styles.btn} ${styles.btnOutline}`}>
                    Открыть обучение
                  </Link>
                </div>
                {modelStatus.datasetSize === 0 ? (
                  <p className={styles.classificationHint}>
                    Сначала добавь примеры обучения. После этого здесь появится набор данных.
                  </p>
                ) : null}
                {trainOutcome ? (
                  <div
                    className={
                      trainOutcome.improvement >= 0
                        ? styles.classificationOutcomeOk
                        : styles.classificationOutcomeBad
                    }
                    role="status"
                  >
                    <p className={styles.classificationOutcomeTitle}>Результат старого обучения</p>
                    <p className={styles.classificationOutcomeText}>
                      Было: <strong>{formatPct(trainOutcome.previousAccuracy)}</strong> → стало:{" "}
                      <strong>{formatPct(trainOutcome.newAccuracy)}</strong>
                    </p>
                    <p className={styles.classificationOutcomeText}>
                      Размер набора:{" "}
                      <strong>{trainOutcome.datasetSize.toLocaleString("ru-RU")} прим.</strong>
                    </p>
                    <p className={styles.classificationOutcomeXp}>
                      Изменение:{" "}
                      <strong>
                        {trainOutcome.improvement >= 0 ? "+" : ""}
                        {formatPct(trainOutcome.improvement)}
                      </strong>
                    </p>
                    <p className={styles.classificationOutcomeXp}>
                      Время: <strong>{trainOutcome.lastTrainedAt}</strong>
                    </p>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </article>
      </div>
    </div>
  );
}
