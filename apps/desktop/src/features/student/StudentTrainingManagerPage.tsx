import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/shared/auth-context";
import { routes } from "@/shared/routes";
import {
  exportStudentTrainingDataset,
  fetchStudentTrainingPipelineStatus,
  prepareStudentTrainingJob,
  registerStudentOllamaModel,
  setStudentTrainedModelUsage,
  type StudentTrainingPipelineStatus,
} from "@/shared/training-pipeline-tauri";
import { buildTrainingOverviewReadModel } from "./read-models/training-overview-read-model";
import styles from "./StudentDashboardPage.module.css";

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ru-RU");
}

function formatPath(value: string | null | undefined): string {
  return value?.trim() || "пока нет";
}

export function StudentTrainingManagerPage() {
  const { userEmail } = useAuth();
  const [status, setStatus] = useState<StudentTrainingPipelineStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [baseModel, setBaseModel] = useState("qwen3:8b");
  const [adapterPath, setAdapterPath] = useState("");
  const [modelAlias, setModelAlias] = useState("");
  const [summaryPath, setSummaryPath] = useState("");

  const inTauri = isTauri();
  const email = (userEmail ?? "").trim();

  async function loadStatus() {
    if (!email || !inTauri) return;
    setLoading(true);
    setError(null);
    try {
      const nextStatus = await fetchStudentTrainingPipelineStatus(email);
      setStatus(nextStatus);
      if (nextStatus) {
        setBaseModel(nextStatus.baseModelName || "qwen3:8b");
        if (!modelAlias.trim()) {
          const seed = nextStatus.studentEmail.split("@")[0] || "student";
          setModelAlias(`student-${seed}-qwen3-lora`);
        }
        if (!summaryPath.trim() && nextStatus.trainingSummaryPath) {
          setSummaryPath(nextStatus.trainingSummaryPath);
        }
        if (!adapterPath.trim() && nextStatus.adapterPath) {
          setAdapterPath(nextStatus.adapterPath);
        }
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, inTauri]);

  const overview = useMemo(() => buildTrainingOverviewReadModel(status), [status]);
  const activeLaunchIndex = Math.max(
    0,
    overview.stages.findIndex((stage) => !stage.done),
  );
  const launchProgress = Math.round(
    (overview.stages.filter((stage) => stage.done).length / Math.max(overview.stages.length, 1)) * 100,
  );
  const launchStateLabel = status?.usingTrainedModel
    ? "Моя модель включена"
    : status?.ollamaModelRegistered
      ? "Версия подключена"
      : status?.adapterAvailable
        ? "Версия обучена"
        : status?.exportAvailable
          ? "Данные готовы"
          : "Ждём примеры";

  async function handleExport() {
    if (!email) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const output = await exportStudentTrainingDataset(email);
      setNotice(`Данные подготовлены: ${output.totalRows} примеров. Файл: ${output.datasetJsonlPath}`);
      if (!summaryPath.trim()) {
        setSummaryPath(output.datasetJsonlPath.replace("training_dataset.jsonl", "training_summary.json"));
      }
      await loadStatus();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function handleRegister() {
    if (!email) return;
    if (!adapterPath.trim() || !modelAlias.trim()) {
      setError("Укажите путь к обученной версии и имя модели.");
      return;
    }
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const output = await registerStudentOllamaModel({
        studentEmail: email,
        baseModel: baseModel.trim() || "qwen3:8b",
        adapterPath: adapterPath.trim(),
        ollamaModelAlias: modelAlias.trim(),
        trainingSummaryPath: summaryPath.trim() || undefined,
      });
      setNotice(`Модель подключена: ${output.ollamaModelAlias}. Теперь её можно включить и проверить.`);
      await loadStatus();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function handlePrepareTrainingJob(launchNow: boolean) {
    if (!email) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const job = await prepareStudentTrainingJob({
        studentEmail: email,
        baseHfModel: "Qwen/Qwen2.5-1.5B-Instruct",
        ollamaBaseModel: baseModel.trim() || "qwen3:8b",
        launchNow,
      });
      setAdapterPath(job.adapterPath);
      setSummaryPath(job.trainingSummaryPath);
      setModelAlias(job.ollamaAlias);
      setNotice(
        job.launched
          ? `Обучение запущено. Папка: ${job.jobDir}. Когда появится output/adapter, подключи модель здесь.`
          : `Папка обучения готова: ${job.jobDir}. Запусти run_training.ps1, затем подключи adapter.`
      );
      await loadStatus();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function switchModel(useTrained: boolean) {
    if (!email) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      await setStudentTrainedModelUsage(email, useTrained);
      setNotice(
        useTrained
          ? "Обученная модель включена для новых ответов."
          : "Сейчас снова используется базовая модель.",
      );
      await loadStatus();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

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
          <div className={styles.labHero}>
            <div className={styles.labHeroCopy}>
              <p className={styles.labKicker}>Рычаг: обучение модели</p>
              <h1 className={styles.pageTitle}>Обучить мой ИИ</h1>
              <p className={styles.labHeroText}>
                Преврати сохранённые примеры в новую версию модели, включи её и проверь результат.
              </p>
              <div className={styles.labHeroStats}>
                <span className={styles.labStat}>подготовить данные</span>
                <span className={styles.labStat}>создать версию</span>
                <span className={styles.labStat}>включить модель</span>
              </div>
            </div>
            <div className={styles.labHeroVisual} aria-hidden>
              <div className={`${styles.miniCore} ${styles.miniCoreTrained}`} />
            </div>
          </div>
          <div className={styles.btnRow}>
            <Link to={routes.studentChatTraining} className={`${styles.btn} ${styles.btnOutline}`}>
              Примеры обучения
            </Link>
            <Link to={routes.studentModelCompare} className={`${styles.btn} ${styles.btnOutline}`}>
              Compare
            </Link>
            <Link to={overview.arenaAction.href} className={`${styles.btn} ${styles.btnOutline}`}>
              Arena
            </Link>
            <Link to={routes.studentAiGrowth} className={`${styles.btn} ${styles.btnOutline}`}>
              Мой ИИ
            </Link>
          </div>
        </header>

        <article className={`${styles.card} ${styles.cardMuted}`} style={{ marginTop: "0.35rem" }}>
          <div className={styles.cardBody}>
            <p className={styles.classificationHint} style={{ marginBottom: "0.45rem" }}>
              <strong>Что делает эта страница:</strong> собирает твои примеры в набор данных,
              подключает обученную модель к Ollama и помогает включить её для новых ответов.
            </p>
            <p className={styles.classificationHint} style={{ marginBottom: 0 }}>
              <strong>С чего начать:</strong> если примеров мало, вернись в Chat Training. Если данные
              уже готовы, нажми «Подготовить данные», затем подключи обученную версию.
            </p>
          </div>
        </article>

        <article className={`${styles.card} ${styles.cardAccent}`}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Если тестируешь в классе</h2>
            <p className={styles.cardDesc}>
              Короткий безопасный сценарий для плохого интернета и локального запуска.
            </p>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.classroomChecklist}>
              <div>
                <span>1</span>
                <strong>Сначала примеры</strong>
                <p>Каждый ученик сохраняет 2-3 сильных примера в Chat Training.</p>
              </div>
              <div>
                <span>2</span>
                <strong>Потом данные</strong>
                <p>На этой странице нажать “Подготовить данные”. Интернет для этого не нужен.</p>
              </div>
              <div>
                <span>3</span>
                <strong>Если обучение не готово</strong>
                <p>Не застревать: перейти в Compare, Arena или AI Studio и продолжить практику.</p>
              </div>
            </div>
            <p className={styles.classificationHint} style={{ marginTop: "0.85rem", marginBottom: 0 }}>
              Для полной тренировки нужны локальная модель, Ollama и подготовленный скрипт обучения на компьютере.
              Вход, курс, примеры, Compare/Arena и сохранение результатов работают через локальное приложение и базу.
            </p>
          </div>
        </article>

        {!inTauri ? (
          <article className={`${styles.card} ${styles.cardMuted}`}>
            <div className={styles.cardBody}>
              <p className={styles.classificationHint}>
                Этот раздел работает только в настольном приложении. В браузере команды обучения не запускаются.
              </p>
            </div>
          </article>
        ) : null}

        {error ? (
          <article className={`${styles.card} ${styles.cardMuted}`}>
            <div className={styles.cardBody}>
              <p className={styles.classificationError}>{error}</p>
            </div>
          </article>
        ) : null}

        {notice ? (
          <article className={`${styles.card} ${styles.cardMuted}`}>
            <div className={styles.cardBody}>
              <p className={styles.classificationHint}>{notice}</p>
            </div>
          </article>
        ) : null}

        <article className={`${styles.card} ${styles.cardAccent}`}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Лабораторный запуск версии</h2>
            <p className={styles.cardDesc}>
              Здесь видно, как сохранённые примеры превращаются в рабочую версию твоего ИИ.
            </p>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.modelLaunchPanel}>
              <div className={styles.modelLaunchVisual} aria-hidden>
                <div className={styles.modelLaunchOrb}>
                  <span className={styles.modelLaunchPulse} />
                </div>
                <p>{launchStateLabel}</p>
              </div>
              <div className={styles.modelLaunchMain}>
                <div className={styles.modelLaunchHead}>
                  <div>
                    <span className={styles.modelLaunchKicker}>My AI version</span>
                    <strong>{overview.currentVersion.title}</strong>
                  </div>
                  <span className={styles.modelLaunchPercent}>{launchProgress}%</span>
                </div>
                <div className={styles.modelLaunchBar} aria-hidden>
                  <span style={{ width: `${launchProgress}%` }} />
                </div>
                <div className={styles.modelLaunchTrack}>
                  {overview.stages.map((stage, index) => (
                    <article
                      key={stage.id}
                      className={`${styles.modelLaunchStep} ${
                        stage.done
                          ? styles.modelLaunchStepDone
                          : index === activeLaunchIndex
                            ? styles.modelLaunchStepActive
                            : ""
                      }`}
                    >
                      <span>{index + 1}</span>
                      <div>
                        <strong>{stage.title}</strong>
                        <p>{stage.detail}</p>
                      </div>
                    </article>
                  ))}
                </div>
                <p className={styles.modelLaunchNext}>
                  Следующий шаг: <strong>{overview.nextStepLabel}</strong>
                </p>
              </div>
            </div>
          </div>
        </article>

        <article className={`${styles.card} ${styles.cardAccent}`}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Мой ИИ сейчас</h2>
            <p className={styles.cardDesc}>Короткая сводка перед следующим шагом обучения.</p>
          </div>
          <div className={styles.cardBody}>
            {loading && !status ? (
              <p className={styles.classificationHint}>Загрузка статуса...</p>
            ) : (
              <dl className={styles.modelTrainingGrid}>
                <div>
                  <dt className={styles.modelTrainingDt}>Примеры обучения</dt>
                  <dd className={styles.modelTrainingDd}>{overview.trainingExamplesCount}</dd>
                </div>
                <div>
                  <dt className={styles.modelTrainingDt}>Активная модель</dt>
                  <dd className={styles.modelTrainingDd}>{overview.activeModelLabel}</dd>
                </div>
                <div>
                  <dt className={styles.modelTrainingDt}>Режим</dt>
                  <dd className={styles.modelTrainingDd}>{overview.modelModeLabel}</dd>
                </div>
                <div>
                  <dt className={styles.modelTrainingDt}>Что дальше</dt>
                  <dd className={styles.modelTrainingDd}>{overview.nextStepLabel}</dd>
                </div>
              </dl>
            )}
          </div>
        </article>

        <article className={`${styles.card} ${styles.cardMuted}`}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Текущие данные и модель</h2>
            <p className={styles.cardDesc}>Что уже готово для обучения и какая модель будет основой следующей версии.</p>
          </div>
          <div className={styles.cardBody}>
            <dl className={styles.modelTrainingGrid}>
              <div>
                <dt className={styles.modelTrainingDt}>Текущая версия</dt>
                <dd className={styles.modelTrainingDd}>{overview.currentVersion.title}</dd>
              </div>
              <div>
                <dt className={styles.modelTrainingDt}>Набор данных</dt>
                <dd className={styles.modelTrainingDd}>
                  {overview.datasetSnapshot.ready ? "готов" : "ещё не подготовлен"}
                </dd>
              </div>
              <div>
                <dt className={styles.modelTrainingDt}>Всего примеров</dt>
                <dd className={styles.modelTrainingDd}>{overview.datasetSnapshot.totalRows}</dd>
              </div>
              <div>
                <dt className={styles.modelTrainingDt}>Базовая модель</dt>
                <dd className={styles.modelTrainingDd}>{overview.modelLineage.baseModelLabel}</dd>
              </div>
              <div>
                <dt className={styles.modelTrainingDt}>Подключение модели</dt>
                <dd className={styles.modelTrainingDd}>
                  {overview.modelLineage.registered ? "готово" : "ещё не готово"}
                </dd>
              </div>
            </dl>
            <p className={styles.classificationHint} style={{ marginTop: "0.75rem" }}>
              {overview.currentVersion.detail}
            </p>
            <p className={styles.classificationHint} style={{ marginTop: "0.45rem" }}>
              Состав данных: готовые примеры {overview.datasetSnapshot.datasetExamples} · Prompt Lab{" "}
              {overview.datasetSnapshot.promptExperiments} · Chat Training{" "}
              {overview.datasetSnapshot.trainingExamples}
            </p>
            <details className={styles.trainingDetails}>
              <summary>Показать технические подробности</summary>
              <p className={styles.classificationHint}>
                Файл данных: {formatPath(overview.datasetSnapshot.datasetPath)}
              </p>
              <p className={styles.classificationHint}>
                Путь к обученной версии: {formatPath(status?.adapterPath)}
              </p>
            </details>
            {overview.datasetSnapshot.createdAt ? (
              <p className={styles.classificationHint} style={{ marginTop: "0.45rem" }}>
                Данные собраны: {formatDateTime(overview.datasetSnapshot.createdAt)}
              </p>
            ) : null}
            {overview.modelLineage.registeredAt ? (
              <p className={styles.classificationHint} style={{ marginTop: "0.45rem" }}>
                Модель подключена: {formatDateTime(overview.modelLineage.registeredAt)}
              </p>
            ) : null}
          </div>
        </article>

        <article className={`${styles.card} ${styles.cardAccent}`}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Лучший следующий шаг</h2>
            <p className={styles.cardDesc}>{overview.primaryAction.description}</p>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.classificationActions}>
              <Link to={overview.primaryAction.href} className={`${styles.btn} ${styles.btnAccent}`}>
                {overview.primaryAction.title}
              </Link>
              {overview.primaryAction.href !== routes.studentChatTraining ? (
                <Link to={routes.studentChatTraining} className={`${styles.btn} ${styles.btnOutline}`}>
                  Примеры обучения
                </Link>
              ) : null}
            </div>
          </div>
        </article>

        {!overview.hasEnoughExamples ? (
          <article className={`${styles.card} ${styles.cardMuted}`}>
            <div className={styles.cardBody}>
              <p className={styles.classificationError} style={{ marginBottom: "0.45rem" }}>
                Пока мало примеров обучения для уверенного старта.
              </p>
              <p className={styles.classificationHint} style={{ marginBottom: "0.75rem" }}>
                Сейчас собрано: {overview.trainingExamplesCount}. Лучше подготовить хотя бы 3 сильных примера
                с задачей, критикой, типом ошибки и целевым ответом.
              </p>
              <Link to={routes.studentChatTraining} className={`${styles.btn} ${styles.btnAccent}`}>
                Перейти к примерам обучения
              </Link>
            </div>
          </article>
        ) : null}

        <article className={`${styles.card} ${styles.cardAccent}`}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Этапы процесса обучения</h2>
            <p className={styles.cardDesc}>
              Та же логика в коротком списке: подготовить данные → обучить модель → подключить модель → включить модель → проверить результат.
            </p>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.companionHubGrid}>
              {overview.stages.map((stage) => (
                <article key={stage.id} className={styles.hubActionCard}>
                  <p className={styles.hubActionKicker}>{stage.done ? "Готово" : "Дальше"}</p>
                  <h3 className={styles.hubActionTitle}>{stage.title}</h3>
                  <p className={styles.hubActionDesc}>{stage.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </article>

        <article className={`${styles.card} ${styles.cardMuted}`}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Работа на этой странице</h2>
            <p className={styles.cardDesc}>
              Если примеров уже хватает, двигайся по шагам ниже. Если регистрация упадёт, сообщение покажет,
              что именно проверить: Ollama, базовую модель, путь к адаптеру или имя модели.
            </p>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.companionHubGrid}>
              <article className={styles.hubActionCard}>
                <p className={styles.hubActionKicker}>1. Подготовить данные</p>
                <h3 className={styles.hubActionTitle}>Собрать примеры обучения в один файл</h3>
                <p className={styles.hubActionDesc}>
                  Этот шаг собирает Chat Training, Prompt Lab и другие сохранённые результаты в набор для обучения.
                </p>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnAccent} ${styles.hubActionBtn}`}
                  onClick={() => void handleExport()}
                  disabled={busy || !email || !inTauri}
                >
                  Подготовить данные
                </button>
              </article>

              <article className={styles.hubActionCard}>
                <p className={styles.hubActionKicker}>2. Обучить модель</p>
                <h3 className={styles.hubActionTitle}>Создать папку запуска для настоящего обучения</h3>
                <p className={styles.hubActionDesc}>
                  Приложение соберёт данные, скрипты и понятные команды в одну папку. Если зависимости на ПК готовы,
                  можно сразу запустить обучение; если нет — папку можно открыть и запустить вручную.
                </p>
                <div className={styles.classificationActions}>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnAccent}`}
                    onClick={() => void handlePrepareTrainingJob(true)}
                    disabled={busy || !email || !inTauri || !overview.datasetSnapshot.ready}
                  >
                    Подготовить и запустить
                  </button>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnOutline}`}
                    onClick={() => void handlePrepareTrainingJob(false)}
                    disabled={busy || !email || !inTauri}
                  >
                    Только подготовить папку
                  </button>
                </div>
              </article>
            </div>

            <details className={styles.trainingDetails} open={!status?.ollamaModelRegistered}>
              <summary>Подключить новую версию модели</summary>
              <p className={styles.classificationHint}>
                Эти поля нужны только после запуска обучения. В обычном сценарии ученик сначала готовит данные,
                затем получает обученную версию и подключает её здесь.
              </p>
              <div className={styles.promptLabInputWrap}>
                <label className={styles.classificationLegend}>Базовая модель</label>
                <input
                  className={styles.promptLabTextarea}
                  value={baseModel}
                  onChange={(event) => setBaseModel(event.target.value)}
                  placeholder="qwen3:8b"
                />
              </div>
              <div className={styles.promptLabInputWrap}>
                <label className={styles.classificationLegend}>Путь к обученной версии</label>
                <input
                  className={styles.promptLabTextarea}
                  value={adapterPath}
                  onChange={(event) => setAdapterPath(event.target.value)}
                  placeholder="C:\\...\\student-trained-model"
                />
              </div>
              <div className={styles.promptLabInputWrap}>
                <label className={styles.classificationLegend}>Имя моей модели</label>
                <input
                  className={styles.promptLabTextarea}
                  value={modelAlias}
                  onChange={(event) => setModelAlias(event.target.value)}
                  placeholder="student-name-qwen3-lora"
                />
              </div>
              <div className={styles.promptLabInputWrap}>
                <label className={styles.classificationLegend}>
                  Путь к сводке обучения (необязательно)
                </label>
                <input
                  className={styles.promptLabTextarea}
                  value={summaryPath}
                  onChange={(event) => setSummaryPath(event.target.value)}
                />
              </div>
            </details>
            <div className={styles.classificationActions}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnAccent}`}
                onClick={() => void handleRegister()}
                disabled={busy || !email || !inTauri}
              >
                Подключить модель
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnOutline}`}
                onClick={() => void switchModel(true)}
                disabled={busy || !email || !inTauri || !status?.ollamaModelRegistered}
              >
                Включить обученную модель
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnOutline}`}
                onClick={() => void switchModel(false)}
                disabled={busy || !email || !inTauri}
              >
                Вернуться к базовой модели
              </button>
            </div>
          </div>
        </article>

        <article className={`${styles.card} ${styles.cardMuted}`}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>После включения модели</h2>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.modelTrainingGrid}>
              <div>
                <dt className={styles.modelTrainingDt}>До</dt>
                <dd className={styles.modelTrainingDd}>
                  {status?.baseModelName ?? "qwen3:8b"} — базовая модель без твоего дообучения.
                </dd>
              </div>
              <div>
                <dt className={styles.modelTrainingDt}>После</dt>
                <dd className={styles.modelTrainingDd}>
                  {status?.activeStudentModelAlias ?? "ещё не создано"} — обученная модель после подключения.
                </dd>
              </div>
            </div>
            <p className={styles.classificationHint}>
              Сначала иди в Compare и проверь один запрос. Если изменение видно, переходи в Arena и проверяй
              устойчивость на разных задачах.
            </p>
            <div className={styles.classificationActions}>
              <Link to={overview.compareAction.href} className={`${styles.btn} ${styles.btnAccent}`}>
                Сначала Compare
              </Link>
              <Link to={overview.arenaAction.href} className={`${styles.btn} ${styles.btnOutline}`}>
                Потом Arena
              </Link>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}
