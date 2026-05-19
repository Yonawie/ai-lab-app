import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/shared/auth-context";
import {
  fetchAiStudioProjectVersions,
  exportAiStudioProject,
  generateAiStudioProject,
  saveAiStudioProjectVersion,
  type AiStudioGenerationResult,
  type AiStudioProjectType,
  type AiStudioProjectVersion,
} from "@/shared/ai-studio-tauri";
import { routes } from "@/shared/routes";
import {
  fetchStudentTrainingPipelineStatus,
  type StudentTrainingPipelineStatus,
} from "@/shared/training-pipeline-tauri";
import styles from "./StudentDashboardPage.module.css";

const AI_UNAVAILABLE = "ИИ временно недоступен";

const PROJECT_TYPES: Array<{ value: AiStudioProjectType; label: string; description: string }> = [
  {
    value: "mini_game",
    label: "Интерактивный web-проект",
    description: "Небольшой HTML/CSS/JS-проект с понятной задачей и интерактивностью.",
  },
  {
    value: "interactive_story",
    label: "Интерактивная история",
    description: "Страница с выбором, развилками и понятными переходами между сценами.",
  },
  {
    value: "assistant_tool",
    label: "Полезный инструмент",
    description: "Одностраничный помощник, тренажёр или рабочий инструмент для AI Lab.",
  },
];

function projectTypeLabel(value: AiStudioProjectType): string {
  return PROJECT_TYPES.find((item) => item.value === value)?.label ?? "Проект";
}

const STARTER_MISSIONS: Record<
  AiStudioProjectType,
  Array<{ title: string; goal: string; constraints: string }>
> = {
  mini_game: [
    {
      title: "Тренажёр сильного запроса",
      goal: "Собери мини-проект, где ученик сравнивает слабую и сильную формулировку запроса и видит, почему один вариант работает лучше.",
      constraints: "Одна страница, понятные правила, счёт или прогресс, аккуратная мобильная версия.",
    },
    {
      title: "AI Clinic: разбор ошибки",
      goal: "Собери тренажёр, где ученик видит слабый ответ ИИ, выбирает тип ошибки и пишет короткое исправление.",
      constraints: "3-5 раундов, экран результата, простая логика без внешних библиотек.",
    },
    {
      title: "Проверка качества примера",
      goal: "Сделай мини-инструмент, который помогает понять, хороший ли обучающий пример: есть задача, слабый ответ, критика и улучшенный ответ.",
      constraints: "Чёткие секции, короткие подсказки, результат в конце.",
    },
  ],
  interactive_story: [
    {
      title: "Путь от запроса к обучению",
      goal: "Покажи через историю, как слабый запрос превращается в полезный пример обучения и затем в проверяемое улучшение модели.",
      constraints: "Несколько коротких сцен, понятные выборы, без длинной лекции.",
    },
    {
      title: "Запуск своего ИИ",
      goal: "Создай историю, где ученик проходит путь: примеры обучения, обучение модели, включение, Compare и Arena.",
      constraints: "4-6 шагов, ясный финал, каждый выбор должен объяснять следующий шаг.",
    },
    {
      title: "Безопасный AI-помощник",
      goal: "Сделай историю о запуске школьного AI-помощника с выбором безопасных и рискованных решений.",
      constraints: "3-4 ветки, несколько финалов, акцент на последствиях выбора.",
    },
  ],
  assistant_tool: [
    {
      title: "Помощник сильного запроса",
      goal: "Собери страницу, которая помогает ученику написать сильный запрос по задаче, роли, ограничениям и формату ответа.",
      constraints: "Несколько полей ввода, итоговый запрос, кнопка очистки, аккуратный интерфейс.",
    },
    {
      title: "Сборщик примера обучения",
      goal: "Создай страницу для сборки примера обучения: запрос, черновой ответ, критика и улучшенный итоговый ответ.",
      constraints: "Чёткие секции, выделение итогового примера, без сложного backend.",
    },
    {
      title: "Заметки Compare",
      goal: "Собери страницу, где ученик фиксирует различия между двумя ответами модели и получает короткий вывод, что улучшать дальше.",
      constraints: "Поля для двух ответов, блок выводов, теги улучшений, всё на одной странице.",
    },
  ],
};

const QUICK_IMPROVEMENTS = [
  "Сделай понятнее для ученика.",
  "Сделай визуально аккуратнее.",
  "Добавь одну небольшую полезную функцию.",
  "Проверь и исправь возможную ошибку в логике.",
  "Сделай взаимодействие более живым и понятным.",
] as const;

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ru-RU");
}

function buildPreviewDoc(htmlCode: string, cssCode: string, jsCode: string): string {
  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>${cssCode}</style>
  </head>
  <body>
    ${htmlCode}
    <script>${jsCode}<\/script>
  </body>
</html>`;
}

export function StudentAiStudioPage() {
  const { userEmail } = useAuth();
  const inTauri = isTauri();

  const [projectType, setProjectType] = useState<AiStudioProjectType>("mini_game");
  const [goal, setGoal] = useState("");
  const [constraints, setConstraints] = useState("");
  const [improvementRequest, setImprovementRequest] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<AiStudioGenerationResult | null>(null);
  const [htmlCode, setHtmlCode] = useState("");
  const [cssCode, setCssCode] = useState("");
  const [jsCode, setJsCode] = useState("");
  const [history, setHistory] = useState<AiStudioProjectVersion[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [pipelineStatus, setPipelineStatus] = useState<StudentTrainingPipelineStatus | null>(null);

  useEffect(() => {
    let active = true;
    async function loadHistory() {
      const email = (userEmail ?? "").trim();
      if (!email || !inTauri) {
        setHistory([]);
        setPipelineStatus(null);
        return;
      }
      setLoadingHistory(true);
      try {
        const [items, pipeline] = await Promise.all([
          fetchAiStudioProjectVersions(email, 12),
          fetchStudentTrainingPipelineStatus(email),
        ]);
        if (!active) return;
        setHistory(items);
        setPipelineStatus(pipeline);
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (active) setLoadingHistory(false);
      }
    }
    void loadHistory();
    return () => {
      active = false;
    };
  }, [userEmail, inTauri]);

  const canGenerate = Boolean(goal.trim()) && inTauri && !generating;
  const canSave = Boolean(
    goal.trim() && currentVersion?.generationRequest && htmlCode.trim() && inTauri && !saving,
  );
  const canExport = Boolean(
    goal.trim() && currentVersion?.generationRequest && htmlCode.trim() && inTauri && !exporting,
  );
  const previewDoc = useMemo(() => buildPreviewDoc(htmlCode, cssCode, jsCode), [htmlCode, cssCode, jsCode]);
  const selectedProjectType = useMemo(
    () => PROJECT_TYPES.find((item) => item.value === projectType) ?? PROJECT_TYPES[0],
    [projectType],
  );
  const starterMissions = STARTER_MISSIONS[projectType];
  const activeModelLabel = pipelineStatus?.usingTrainedModel
    ? pipelineStatus.activeStudentModelAlias || "активная обученная модель"
    : pipelineStatus?.baseModelName || "базовая локальная модель";
  const currentVersionMatchesActiveModel =
    currentVersion && pipelineStatus
      ? currentVersion.modelName.trim() === activeModelLabel.trim()
      : null;
  const hasAnyProjectVersion = Boolean(currentVersion || history.length > 0);
  const projectVersionSteps = [
    {
      label: "Draft",
      title: "Черновик",
      done: hasAnyProjectVersion,
      text: "Первая рабочая версия проекта.",
    },
    {
      label: "Improve",
      title: "Улучшение",
      done: history.length >= 2,
      text: "Следующая итерация после просмотра превью.",
    },
    {
      label: "Final",
      title: "Финал",
      done: history.length >= 3,
      text: "Сохранённая версия, которую можно показать.",
    },
  ];
  const previewState = useMemo(() => {
    if (!currentVersion && !htmlCode.trim() && !cssCode.trim() && !jsCode.trim()) {
      return {
        kind: "empty" as const,
        title: "Сначала задай проектный бриф",
        body: "Выбери тип проекта, опиши цель и ограничения, затем запусти первую сборку. AI Studio соберёт HTML/CSS/JS и покажет рабочий результат ниже.",
      };
    }
    if (!htmlCode.trim()) {
      return {
        kind: "invalid" as const,
        title: "Превью пока недоступно",
        body: "Для предпросмотра нужен непустой HTML. Сгенерируй проект заново или проверь поле HTML перед сохранением версии.",
      };
    }
    return { kind: "ready" as const, title: "", body: "" };
  }, [currentVersion, htmlCode, cssCode, jsCode]);

  async function reloadHistory() {
    const email = (userEmail ?? "").trim();
    if (!email || !inTauri) return;
    const items = await fetchAiStudioProjectVersions(email, 12);
    setHistory(items);
  }

  async function handleGenerate() {
    const email = (userEmail ?? "").trim();
    if (!email || !goal.trim() || !inTauri) return;

    setGenerating(true);
    setError(null);
    setSaveMessage(null);
    try {
      const generated = await generateAiStudioProject({
        studentEmail: email,
        projectType,
        goal,
        constraints,
        improvementRequest,
        previousHtml: htmlCode.trim() ? htmlCode : undefined,
        previousCss: cssCode.trim() ? cssCode : undefined,
        previousJs: jsCode.trim() ? jsCode : undefined,
      });
      setCurrentVersion(generated);
      setHtmlCode(generated.htmlCode);
      setCssCode(generated.cssCode);
      setJsCode(generated.jsCode);
      setImprovementRequest("");
    } catch (e) {
      setError(e instanceof Error && e.message.trim() ? e.message : AI_UNAVAILABLE);
    } finally {
      setGenerating(false);
    }
  }

  async function handleSaveVersion() {
    const email = (userEmail ?? "").trim();
    if (!email || !currentVersion || !htmlCode.trim() || !inTauri) return;
    const isFirstSaveForProject = !projectId;

    setSaving(true);
    setError(null);
    setSaveMessage(null);
    try {
      const saved = await saveAiStudioProjectVersion({
        studentEmail: email,
        projectId,
        projectType,
        goal,
        constraints,
        generationRequest: currentVersion.generationRequest,
        htmlCode,
        cssCode,
        jsCode,
        modelName: currentVersion.modelName,
      });
      setProjectId(saved.projectId);
      await reloadHistory();
      setSaveMessage(
        isFirstSaveForProject
          ? "Проект создан, и первая версия сохранена. Этот результат теперь будет виден в «Мой ИИ»."
          : "Новая версия проекта сохранена. «Мой ИИ» покажет её как часть твоей работы в AI Lab.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleExportProject() {
    const email = (userEmail ?? "").trim();
    if (!email || !currentVersion || !htmlCode.trim() || !inTauri) return;

    setExporting(true);
    setError(null);
    setSaveMessage(null);
    try {
      const exported = await exportAiStudioProject({
        studentEmail: email,
        projectId,
        projectType,
        goal,
        constraints,
        generationRequest: currentVersion.generationRequest,
        htmlCode,
        cssCode,
        jsCode,
        modelName: currentVersion.modelName,
      });
      setSaveMessage(
        `Проект готов: открой папку ${exported.exportDir}. Главный файл для запуска — index.html.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }

  function loadVersion(version: AiStudioProjectVersion) {
    const loadedModelName = version.modelName ?? "unknown";
    const loadedUsesActiveTrainedModel = Boolean(
      version.modelName?.trim() &&
        pipelineStatus?.activeStudentModelAlias?.trim() &&
        version.modelName.trim() === pipelineStatus.activeStudentModelAlias.trim(),
    );
    setProjectId(version.projectId);
    setProjectType(version.projectType);
    setGoal(version.goal);
    setConstraints(version.constraints);
    setCurrentVersion({
      projectType: version.projectType,
      goal: version.goal,
      constraints: version.constraints,
      generationRequest: version.generationRequest,
      htmlCode: version.htmlCode,
      cssCode: version.cssCode,
      jsCode: version.jsCode,
      modelName: loadedModelName,
      usingTrainedModel: loadedUsesActiveTrainedModel,
    });
    setHtmlCode(version.htmlCode);
    setCssCode(version.cssCode);
    setJsCode(version.jsCode);
    setImprovementRequest("");
    setSaveMessage(`Загружена версия от ${formatDateTime(version.createdAt)}. Можно продолжить работу с этого этапа.`);
  }

  function applyStarterMission(mission: { goal: string; constraints: string }) {
    setGoal(mission.goal);
    setConstraints(mission.constraints);
    setImprovementRequest("");
    setSaveMessage("Стартовый проектный бриф подставлен в рабочее пространство.");
    setError(null);
  }

  function applyQuickImprovement(text: string) {
    setImprovementRequest((current) => {
      const trimmed = current.trim();
      return trimmed ? `${trimmed}\n${text}` : text;
    });
    setSaveMessage("Улучшение добавлено в запрос на следующую итерацию проекта.");
    setError(null);
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
            ← К «Мой ИИ»
          </Link>
          <div className={styles.labHero}>
            <div className={styles.labHeroCopy}>
              <p className={styles.labKicker}>Рычаг: применить своего ИИ</p>
              <h1 className={styles.pageTitle}>AI Studio</h1>
              <p className={styles.labHeroText}>
                Собери небольшой проект с помощью ИИ, улучши его и сохрани версию в историю своего прогресса.
              </p>
              <div className={styles.labHeroStats}>
                <span className={styles.labStat}>идея проекта</span>
                <span className={styles.labStat}>черновик</span>
                <span className={styles.labStat}>улучшенная версия</span>
              </div>
            </div>
            <div className={styles.labHeroVisual} aria-hidden>
              <div className={`${styles.miniCore} ${styles.miniCoreProven}`} />
            </div>
          </div>
        </header>

        <article className={`${styles.card} ${styles.cardMuted}`}>
          <div className={styles.cardBody}>
            <p className={styles.classificationHint} style={{ marginBottom: "0.45rem" }}>
              <strong>Что ты здесь делаешь:</strong> задаёшь проектный бриф, собираешь первую
              версию через AI, дорабатываешь проект и сохраняешь удачные этапы как версии.
            </p>
            <p className={styles.classificationHint} style={{ marginBottom: "0.45rem" }}>
              <strong>Почему это важно:</strong> одна версия показывает старт, а несколько
              версий показывают, как проект становится лучше от итерации к итерации.
            </p>
            <p className={styles.classificationHint} style={{ marginBottom: 0 }}>
              <strong>Что дальше:</strong> «Мой ИИ» покажет эту работу как часть твоего
              прогресса. Compare нужен не для проверки интерфейса проекта, а чтобы понять,
              стала ли модель лучше отвечать на похожие проектные задачи.
            </p>
          </div>
        </article>

        <article className={`${styles.card} ${styles.cardMuted}`}>
          <div className={styles.cardBody}>
            <p className={styles.classificationHint} style={{ marginBottom: "0.45rem" }}>
              <strong>Какая модель строит проект сейчас:</strong> {activeModelLabel}
            </p>
            <p className={styles.classificationHint} style={{ marginBottom: 0 }}>
              {pipelineStatus?.usingTrainedModel
                ? "Сейчас AI Studio использует твою активную обученную модель. Это хороший момент, чтобы собрать новую версию проекта и потом проверить модель в Compare."
                : "Сейчас AI Studio использует базовую модель. Если ты уже обучил свою версию, сначала включи её в зоне «Тренируем», а затем возвращайся сюда."}
            </p>
            <div className={styles.classificationActions} style={{ marginTop: "0.9rem" }}>
              {pipelineStatus?.usingTrainedModel ? (
                <Link to={routes.studentModelCompare} className={`${styles.btn} ${styles.btnOutline}`}>
                  Проверить модель в Compare
                </Link>
              ) : (
                <Link to={routes.studentTrainingManager} className={`${styles.btn} ${styles.btnOutline}`}>
                  Включить свою модель
                </Link>
              )}
              <Link to={routes.studentAiGrowth} className={`${styles.btn} ${styles.btnOutline}`}>
                Открыть Мой ИИ
              </Link>
            </div>
          </div>
        </article>

        <article className={`${styles.card} ${styles.cardAccent}`}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Путь проекта</h2>
            <p className={styles.cardDesc}>
              AI Studio не просто генерирует страницу. Ты собираешь версии проекта и видишь, как твоя модель помогает улучшать результат.
            </p>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.studioVersionPath}>
              {projectVersionSteps.map((step) => (
                <div
                  key={step.label}
                  className={`${styles.studioVersionStep} ${step.done ? styles.studioVersionStepDone : ""}`}
                >
                  <span>{step.label}</span>
                  <strong>{step.title}</strong>
                  <p>{step.text}</p>
                </div>
              ))}
            </div>
            <p className={styles.classificationHint} style={{ marginTop: "0.85rem", marginBottom: 0 }}>
              <strong>Сейчас:</strong>{" "}
              {hasAnyProjectVersion
                ? "у тебя уже есть рабочая версия. Посмотри превью, улучши слабое место и сохрани следующий этап."
                : "выбери проектный бриф и сгенерируй первую версию. Потом улучшай её по одному понятному запросу."}
            </p>
          </div>
        </article>

        {!inTauri ? (
          <article className={`${styles.card} ${styles.cardMuted}`}>
            <div className={styles.cardBody}>
              <p className={styles.classificationPrompt}>
                Запусти настольное приложение, чтобы использовать локальную модель и
                сохранять версии проекта.
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

        {saveMessage ? (
          <article className={`${styles.card} ${styles.cardMuted}`}>
            <div className={styles.cardBody}>
              <p className={styles.classificationOutcomeText}>{saveMessage}</p>
            </div>
          </article>
        ) : null}

        {currentVersion || history.length > 0 ? (
          <article className={`${styles.card} ${styles.cardAccent}`}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Что получилось и что дальше</h2>
              <p className={styles.cardDesc}>
                После генерации у тебя появляется рабочая версия проекта, которую можно
                улучшать, проверять в превью и сохранять по этапам.
              </p>
            </div>
            <div className={styles.cardBody}>
              <p className={styles.classificationHint}>
                <strong>Что ты сделал:</strong>{" "}
                {currentVersion
                  ? "собрал или улучшил реальную web-версию проекта через подключённый AI."
                  : "сохранил одну или несколько версий проекта и можешь к ним возвращаться."}
              </p>
              <p className={styles.classificationHint}>
                <strong>Что теперь есть:</strong> превью, код проекта и история версий для
                следующих итераций.
              </p>
              <p className={styles.classificationHint} style={{ marginBottom: "0.75rem" }}>
                <strong>Что дальше:</strong> проверь модель в Compare, если хочешь понять,
                стала ли она лучше отвечать на похожие проектные запросы.
              </p>
              <div className={styles.classificationActions}>
                <Link to={routes.studentModelCompare} className={`${styles.btn} ${styles.btnAccent}`}>
                  Проверить модель в Compare
                </Link>
                <Link to={routes.studentAiGrowth} className={`${styles.btn} ${styles.btnOutline}`}>
                  Открыть Мой ИИ
                </Link>
              </div>
            </div>
          </article>
        ) : null}

        <article className={`${styles.card} ${styles.cardAccent}`}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Настройка проекта</h2>
            <p className={styles.cardDesc}>
              Выбери формат проекта, опиши цель и задай ограничения, чтобы AI Studio
              собрал первую рабочую версию.
            </p>
          </div>
          <div className={styles.cardBody}>
            <fieldset className={styles.classificationFieldset}>
              <legend className={styles.classificationLegend}>1. Тип проекта</legend>
              <div className={styles.classificationOptions}>
                {PROJECT_TYPES.map((type) => (
                  <label key={type.value} className={styles.classificationOptionLabel}>
                    <input
                      type="radio"
                      className={styles.classificationRadio}
                      checked={projectType === type.value}
                      onChange={() => setProjectType(type.value)}
                    />
                    <span className={styles.classificationOptionText}>
                      <strong>{type.label}</strong>
                      <br />
                      {type.description}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className={styles.classificationOutcomeOk} style={{ marginBottom: "1rem" }}>
              <p className={styles.classificationOutcomeTitle}>Как начать</p>
              <p className={styles.classificationHint}>
                1. Выбери тип проекта и возьми готовый бриф или опиши свой.
              </p>
              <p className={styles.classificationHint}>
                2. Напиши, что должен делать проект, и добавь ограничения.
              </p>
              <p className={styles.classificationHint} style={{ marginBottom: 0 }}>
                3. Запусти сборку, проверь превью, доработай идею и сохраняй удачные версии.
              </p>
            </div>

            <fieldset className={styles.classificationFieldset}>
              <legend className={styles.classificationLegend}>
                Стартовые брифы для {selectedProjectType.label.toLowerCase()}
              </legend>
              <div className={styles.classificationOptions}>
                {starterMissions.map((mission) => (
                  <button
                    key={mission.title}
                    type="button"
                    className={styles.classificationOptionLabel}
                    onClick={() => applyStarterMission(mission)}
                    style={{ textAlign: "left" }}
                  >
                    <span className={styles.classificationOptionText}>
                      <strong>{mission.title}</strong>
                      <br />
                      {mission.goal}
                      <br />
                      <span style={{ opacity: 0.82 }}>Ограничения: {mission.constraints}</span>
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>

            <div className={styles.promptLabGrid}>
              <section className={styles.promptLabPanel}>
                <label className={styles.promptLabInputWrap}>
                  <span className={styles.classificationLegend}>2. Цель проекта</span>
                  <textarea
                    className={styles.promptLabTextarea}
                    rows={5}
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    placeholder="Например: собери страницу, где ученик тренируется писать сильные запросы и сразу видит более удачную формулировку."
                  />
                </label>
              </section>
              <section className={styles.promptLabPanel}>
                <label className={styles.promptLabInputWrap}>
                  <span className={styles.classificationLegend}>3. Ограничения и функции</span>
                  <textarea
                    className={styles.promptLabTextarea}
                    rows={5}
                    value={constraints}
                    onChange={(e) => setConstraints(e.target.value)}
                    placeholder="Например: одна страница, мобильная версия, понятные подписи, без внешних библиотек, нужен экран результата."
                  />
                </label>
              </section>
            </div>
          </div>
        </article>

        <article className={`${styles.card} ${styles.cardMuted}`}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Генерация</h2>
            <p className={styles.cardDesc}>
              Сначала собери первый вариант, затем используй запрос на улучшение для
              итераций поверх текущего проекта.
            </p>
          </div>
          <div className={styles.cardBody}>
            <label className={styles.promptLabInputWrap}>
              <span className={styles.classificationLegend}>4. Запрос на улучшение</span>
              <textarea
                className={styles.promptLabTextarea}
                rows={4}
                value={improvementRequest}
                onChange={(e) => setImprovementRequest(e.target.value)}
                placeholder="Например: добавь экран результата, более понятные подсказки и аккуратную мобильную версию."
              />
            </label>
            <div className={styles.classificationActions} style={{ marginBottom: "0.75rem" }}>
              {QUICK_IMPROVEMENTS.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`${styles.btn} ${styles.btnOutline}`}
                  onClick={() => applyQuickImprovement(item)}
                >
                  {item}
                </button>
              ))}
            </div>
            <div className={styles.classificationActions}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnAccent}`}
                onClick={() => void handleGenerate()}
                disabled={!canGenerate}
              >
                {generating
                  ? "Генерация..."
                  : currentVersion
                    ? "Улучшить проект"
                    : "Сгенерировать первую версию"}
              </button>
            </div>
            {generating ? (
              <div className={styles.aiThinkingPanel} role="status" aria-live="polite">
                <div className={styles.aiThinkingOrb} aria-hidden />
                <div className={styles.aiThinkingCopy}>
                  <p className={styles.aiThinkingTitle}>
                    ИИ собирает проект
                    <span className={styles.aiThinkingDots} aria-hidden>
                      <span />
                      <span />
                      <span />
                    </span>
                  </p>
                  <p className={styles.aiThinkingText}>
                    Модель пишет HTML, CSS и JS. Через несколько секунд появится рабочее превью.
                  </p>
                </div>
              </div>
            ) : null}
            {currentVersion ? (
              <div className={styles.classificationOutcomeOk}>
                <p className={styles.classificationOutcomeTitle}>Версия проекта готова</p>
                <p className={styles.classificationOutcomeText}>
                  Модель: <strong>{currentVersion.modelName}</strong>
                  {currentVersion.usingTrainedModel
                    ? " · используется твоя активная обученная модель"
                    : " · используется базовая локальная модель"}
                </p>
                <p className={styles.classificationHint} style={{ marginBottom: "0.45rem" }}>
                  Активная модель сейчас: <strong>{activeModelLabel}</strong>
                  {currentVersionMatchesActiveModel == null
                    ? ""
                    : currentVersionMatchesActiveModel
                      ? " · эта версия проекта собрана на текущей модели"
                      : " · эта версия проекта собрана не на текущей активной модели"}
                </p>
                <p className={styles.classificationHint} style={{ marginBottom: 0 }}>
                  Запрос для сборки: {currentVersion.generationRequest}
                </p>
              </div>
            ) : null}
          </div>
        </article>

        <article className={`${styles.card} ${styles.cardMuted}`}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Код проекта</h2>
            <p className={styles.cardDesc}>
              Код можно править вручную перед сохранением версии. Превью ниже строится из
              текущих полей HTML/CSS/JS.
            </p>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.promptLabGrid}>
              <section className={styles.promptLabPanel}>
                <label className={styles.promptLabInputWrap}>
                  <span className={styles.classificationLegend}>HTML</span>
                  <textarea
                    className={styles.promptLabTextarea}
                    rows={14}
                    value={htmlCode}
                    onChange={(e) => setHtmlCode(e.target.value)}
                    placeholder={AI_UNAVAILABLE}
                  />
                </label>
              </section>
              <section className={styles.promptLabPanel}>
                <label className={styles.promptLabInputWrap}>
                  <span className={styles.classificationLegend}>CSS</span>
                  <textarea
                    className={styles.promptLabTextarea}
                    rows={6}
                    value={cssCode}
                    onChange={(e) => setCssCode(e.target.value)}
                  />
                </label>
                <label className={styles.promptLabInputWrap}>
                  <span className={styles.classificationLegend}>JS</span>
                  <textarea
                    className={styles.promptLabTextarea}
                    rows={7}
                    value={jsCode}
                    onChange={(e) => setJsCode(e.target.value)}
                  />
                </label>
              </section>
            </div>

            <div className={styles.classificationActions}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnOutline}`}
                onClick={() => void handleSaveVersion()}
                disabled={!canSave}
              >
                {saving ? "Сохранение..." : "Сохранить версию проекта"}
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnAccent}`}
                onClick={() => void handleExportProject()}
                disabled={!canExport}
              >
                {exporting ? "Готовим папку..." : "Забрать проект"}
              </button>
            </div>
          </div>
        </article>

        <article className={`${styles.card} ${styles.cardAccent}`}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Превью</h2>
            <p className={styles.cardDesc}>
              Здесь видно текущую рабочую версию проекта. Сначала собери результат, потом
              смотри превью, замечай слабые места и запускай следующую итерацию.
            </p>
          </div>
          <div className={styles.cardBody}>
            {previewState.kind === "ready" ? (
              <div className={styles.studioWorkbench}>
                <div className={styles.studioWorkbenchTop}>
                  <div>
                    <span>AI Studio workbench</span>
                    <strong>{currentVersion?.usingTrainedModel ? "Собрано моим ИИ" : "Собрано базовой моделью"}</strong>
                  </div>
                  <div className={styles.studioWorkbenchActions}>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnOutline}`}
                      onClick={() => setImprovementRequest("Улучши визуальный стиль, сделай понятнее первый экран и добавь один полезный интерактивный элемент.")}
                    >
                      Идея улучшения
                    </button>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnAccent}`}
                      onClick={() => void handleSaveVersion()}
                      disabled={!canSave}
                    >
                      {saving ? "Сохраняем..." : "Сохранить версию"}
                    </button>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnOutline}`}
                      onClick={() => void handleExportProject()}
                      disabled={!canExport}
                    >
                      {exporting ? "Готовим..." : "Забрать проект"}
                    </button>
                  </div>
                </div>
                <iframe
                  title="AI Studio preview"
                  sandbox="allow-scripts"
                  srcDoc={previewDoc}
                  className={styles.studioPreviewFrame}
                />
              </div>
            ) : (
              <div
                className={
                  previewState.kind === "empty"
                    ? styles.classificationOutcomeOk
                    : styles.classificationOutcomeBad
                }
              >
                <p className={styles.classificationOutcomeTitle}>{previewState.title}</p>
                <p className={styles.classificationOutcomeText}>{previewState.body}</p>
              </div>
            )}
          </div>
        </article>

        <article className={`${styles.card} ${styles.cardMuted}`}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>История версий</h2>
            <p className={styles.cardDesc}>
              Сохраняй этапы работы как версии проекта и возвращайся к ним для следующих
              итераций.
            </p>
          </div>
          <div className={styles.cardBody}>
            {loadingHistory ? (
              <p className={styles.classificationHint}>Загружаем историю AI Studio...</p>
            ) : history.length === 0 ? (
              <p className={styles.classificationHint}>
                Пока нет сохранённых версий. Сначала выбери проектный бриф, собери первую
                версию и сохрани её как отправную точку.
              </p>
            ) : (
              <ul className={styles.taskList}>
                {history.map((item) => (
                  <li key={item.versionId} className={styles.classificationCard}>
                    <div className={styles.classificationHeader}>
                      <div>
                        <p className={styles.classificationTitle}>{item.goal}</p>
                        <p className={styles.classificationSub}>
                          {formatDateTime(item.createdAt)}
                          {item.modelName ? ` · ${item.modelName}` : ""}
                        </p>
                      </div>
                      <span className={styles.classificationBadge}>{projectTypeLabel(item.projectType)}</span>
                    </div>
                    <p className={styles.classificationHint}>
                      <strong>Ограничения:</strong> {item.constraints || "не указаны"}
                    </p>
                    <p className={styles.classificationHint}>
                      <strong>Запрос для сборки:</strong> {item.generationRequest}
                    </p>
                    <p className={styles.classificationHint}>
                      <strong>Что означает эта версия:</strong>{" "}
                      {item.projectId === projectId
                        ? "эта версия продолжает текущий проект"
                        : "это сохранённая версия отдельного проекта или прошлой ветки работы"}
                    </p>
                    <div className={styles.classificationActions}>
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.btnOutline}`}
                        onClick={() => loadVersion(item)}
                      >
                        Загрузить в рабочее пространство
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </article>
      </div>
    </div>
  );
}
