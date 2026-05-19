import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { isTauri } from "@tauri-apps/api/core";
import { useAuth } from "@/shared/auth-context";
import {
  buildPromptExperimentLogEntry,
  fetchPromptLabExercise,
  fetchPromptLabExperimentHistory,
  runPromptLabExperiment,
  savePromptLabExperiment,
  type PromptLabExercise,
  type PromptLabExperimentHistoryItem,
  type PromptLabRunResult,
} from "@/shared/prompt-lab-tauri";
import { routes } from "@/shared/routes";
import styles from "./StudentDashboardPage.module.css";

const AI_TEMP_UNAVAILABLE = "ИИ временно недоступен";
const BROWSER_DEMO_MODEL = "браузерный демо-режим";

const OFFLINE_EXERCISE: PromptLabExercise = {
  taskTitle: "Поддерживающий учебный ответ",
  taskDescription:
    "Ученик ошибся при сложении дробей с одинаковыми знаменателями. Нужен короткий, полезный и дружелюбный ответ: укажи ошибку, покажи правильный шаг на примере и предложи, что сделать дальше.",
  weakPrompt: "Объясни математику.",
  weakOutput:
    "Математика — это наука о числах, формулах и закономерностях. Нужно просто больше практики.",
  improvedPromptOptions: [
    "Ты терпеливый наставник. Ученик ошибся при сложении дробей с одинаковыми знаменателями. Коротко укажи ошибку, покажи правильный шаг на примере 2/5 + 1/5 и дай одно действие, что сделать дальше.",
    "Объясни ошибку ученика и исправь решение по шагам, но без длинной лекции.",
    "Дай дружелюбный разбор ошибки с дробями, один пример и одно следующее действие для ученика.",
  ],
  improvedOutput:
    "Разберём твой шаг с дробями: ты сложил знаменатели, но при одинаковых знаменателях нужно складывать только числители. Например, 2/5 + 1/5 = 3/5. Проверь последний шаг и перепиши его по этому правилу.",
  explanation:
    "Сильный запрос задаёт роль, контекст ошибки, формат ответа и ограничение по тону. Поэтому ответ становится конкретным и полезным.",
};

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ru-RU");
}

function savedResultLabel(savedType: string): string {
  switch (savedType) {
    case "prompt_experiment_saved":
      return "эксперимент в Prompt Lab";
    case "dataset_example_added":
      return "пример обучения";
    default:
      return "сохранённый результат";
  }
}

function analyzePrompt(prompt: string) {
  const normalized = prompt.trim().toLowerCase();
  const checks = [
    {
      id: "role",
      label: "роль",
      done: /ты|роль|наставник|эксперт|помощник|учитель/.test(normalized),
      hint: "Кем должен быть ИИ?",
    },
    {
      id: "context",
      label: "контекст",
      done: normalized.length > 90 || /ученик|задача|ошибка|ситуация|пример/.test(normalized),
      hint: "Что случилось и для кого ответ?",
    },
    {
      id: "format",
      label: "формат",
      done: /коротко|шаг|структур|список|формат|пример|пункт/.test(normalized),
      hint: "Как должен выглядеть ответ?",
    },
    {
      id: "limit",
      label: "ограничение",
      done: /без|не |только|один|коротк|до |не больше/.test(normalized),
      hint: "Чего ИИ не должен делать?",
    },
  ];
  const doneCount = checks.filter((check) => check.done).length;
  return {
    checks,
    score: Math.round((doneCount / checks.length) * 100),
    summary:
      doneCount >= 3
        ? "Запрос уже достаточно управляет ответом."
        : "Запросу не хватает конкретики: добавь роль, контекст, формат или ограничение.",
  };
}

export function StudentPromptLabPage() {
  const { userEmail } = useAuth();
  const inTauri = isTauri();
  const [exercise, setExercise] = useState<PromptLabExercise | null>(null);
  const [history, setHistory] = useState<PromptLabExperimentHistoryItem[]>([]);
  const [runResult, setRunResult] = useState<PromptLabRunResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [taskInput, setTaskInput] = useState("");
  const [promptA, setPromptA] = useState("");
  const [promptB, setPromptB] = useState("");
  const [winner, setWinner] = useState<"A" | "B">("B");
  const [rationale, setRationale] = useState("");
  const [demoSavedCount, setDemoSavedCount] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      setSaveMessage(null);
      const email = (userEmail ?? "").trim();
      if (!email) {
        if (!active) return;
        setExercise(OFFLINE_EXERCISE);
        setHistory([]);
        setTaskInput(OFFLINE_EXERCISE.taskDescription);
        setPromptA(OFFLINE_EXERCISE.weakPrompt);
        setPromptB(OFFLINE_EXERCISE.improvedPromptOptions[0] ?? "");
        setLoading(false);
        setError("Войдите как студент, чтобы открыть Prompt Lab.");
        return;
      }
      if (!inTauri) {
        if (!active) return;
        setExercise(OFFLINE_EXERCISE);
        setHistory([]);
        setTaskInput(OFFLINE_EXERCISE.taskDescription);
        setPromptA(OFFLINE_EXERCISE.weakPrompt);
        setPromptB(OFFLINE_EXERCISE.improvedPromptOptions[0] ?? "");
        setLoading(false);
        return;
      }
      try {
        const [loadedExercise, loadedHistory] = await Promise.all([
          fetchPromptLabExercise(email),
          fetchPromptLabExperimentHistory(email, 10),
        ]);
        if (!active) return;
        const nextExercise = loadedExercise ?? OFFLINE_EXERCISE;
        setExercise(nextExercise);
        setHistory(loadedHistory);
        setTaskInput(nextExercise.taskDescription);
        setPromptA(nextExercise.weakPrompt);
        setPromptB(nextExercise.improvedPromptOptions[0] ?? "");
      } catch (e) {
        if (!active) return;
        setExercise(OFFLINE_EXERCISE);
        setHistory([]);
        setTaskInput(OFFLINE_EXERCISE.taskDescription);
        setPromptA(OFFLINE_EXERCISE.weakPrompt);
        setPromptB(OFFLINE_EXERCISE.improvedPromptOptions[0] ?? "");
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [userEmail, inTauri]);

  const activeExercise = exercise ?? OFFLINE_EXERCISE;
  const outputsReady = Boolean(runResult?.outputA?.trim() && runResult?.outputB?.trim());
  const outputsAreAvailable = Boolean(
    runResult &&
      runResult.outputA !== AI_TEMP_UNAVAILABLE &&
      runResult.outputB !== AI_TEMP_UNAVAILABLE,
  );
  const canRun = Boolean(taskInput.trim() && promptA.trim() && promptB.trim()) && !running;
  const canSave = outputsReady && outputsAreAvailable && rationale.trim().length > 0 && !saving;
  const logEntry = useMemo(
    () => (history[0] ? buildPromptExperimentLogEntry(history[0]) : null),
    [history],
  );
  const promptADiagnosis = useMemo(() => analyzePrompt(promptA), [promptA]);
  const promptBDiagnosis = useMemo(() => analyzePrompt(promptB), [promptB]);
  const winningPrompt = winner === "A" ? promptA : promptB;
  const winningOutput = winner === "A" ? runResult?.outputA : runResult?.outputB;
  const chatTrainingPrefill = {
    fromAiClinic: true,
    task: taskInput,
    latestAnswer: winningOutput
      ? {
          aiAnswer: winningOutput,
          modelName: runResult?.modelName ?? null,
          usedTrainedModel: Boolean(runResult?.usingTrainedModel),
          answerQuality: winner === "B" ? 4 : 3,
          createdAt: new Date().toISOString(),
        }
      : undefined,
    studentCritique: rationale,
    revisedTargetAnswer: winningOutput ?? "",
    repairGoalTitle: "Превратить удачный prompt в пример обучения",
    repairGoalDescription: `Сохрани сильный ответ как пример: задача → лучший ответ → почему он лучше. Prompt: ${winningPrompt}`,
    repairChecklist: [
      "Проверь, что ответ решает исходную задачу.",
      "Добавь короткую критику слабого варианта.",
      "Сохрани целевой ответ, которому должен следовать твой ИИ.",
    ],
  };

  async function reloadHistory() {
    const email = (userEmail ?? "").trim();
    if (!email) return;
    const nextHistory = await fetchPromptLabExperimentHistory(email, 10);
    setHistory(nextHistory);
  }

  function buildBrowserDemoRun(): PromptLabRunResult {
    return {
      modelName: BROWSER_DEMO_MODEL,
      usingTrainedModel: false,
      taskInput,
      promptA,
      promptB,
      outputA:
        "Ответ A получился общим: я понял тему, но почти не вижу роли, формата и конкретного действия для ученика.",
      outputB:
        "Ответ B полезнее: я вижу роль наставника, конкретную ошибку, короткий пример и понятный следующий шаг для ученика.",
    };
  }

  async function handleRun() {
    const email = (userEmail ?? "").trim();
    if (!email) return;
    if (!taskInput.trim() || !promptA.trim() || !promptB.trim()) {
      setError("Заполните задачу, Prompt A и Prompt B.");
      return;
    }

    setRunning(true);
    setError(null);
    setSaveMessage(null);
    if (!inTauri) {
      setRunResult(buildBrowserDemoRun());
      setRunning(false);
      return;
    }
    try {
      const result = await runPromptLabExperiment({
        studentEmail: email,
        taskInput,
        promptA,
        promptB,
      });
      setRunResult({
        ...result,
        outputA: result.outputA.trim() || AI_TEMP_UNAVAILABLE,
        outputB: result.outputB.trim() || AI_TEMP_UNAVAILABLE,
      });
    } catch (e) {
      setRunResult({
        modelName: "qwen3:8b",
        usingTrainedModel: false,
        taskInput,
        promptA,
        promptB,
        outputA: AI_TEMP_UNAVAILABLE,
        outputB: AI_TEMP_UNAVAILABLE,
      });
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  async function handleSave() {
    const email = (userEmail ?? "").trim();
    if (!email || !runResult) return;
    if (!outputsAreAvailable) {
      setError("Сохранять можно только успешный реальный A/B-запуск.");
      return;
    }
    if (!rationale.trim()) {
      setError("Добавьте короткое объяснение, почему победил выбранный вариант.");
      return;
    }

    setSaving(true);
    setError(null);
    setSaveMessage(null);
    if (runResult.modelName === BROWSER_DEMO_MODEL) {
      setDemoSavedCount((count) => count + 1);
      setSaveMessage("Демо-эксперимент сохранён на время браузерной проверки.");
      setSaving(false);
      return;
    }
    try {
      await savePromptLabExperiment({
        studentEmail: email,
        taskTitle: activeExercise.taskTitle,
        taskInput,
        promptA,
        promptB,
        outputA: runResult.outputA,
        outputB: runResult.outputB,
        winner,
        rationale,
        modelName: runResult.modelName,
      });
      await reloadHistory();
      setSaveMessage("Эксперимент сохранён как результат Prompt Lab.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
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
              <p className={styles.labKicker}>Рычаг: prompt</p>
              <h1 className={styles.pageTitle}>Prompt Lab</h1>
              <p className={styles.labHeroText}>
                Проверь, как меняется ответ ИИ, когда ты точнее задаёшь роль, цель и формат.
              </p>
              <div className={styles.labHeroStats}>
                <span className={styles.labStat}>одна задача</span>
                <span className={styles.labStat}>два запроса</span>
                <span className={styles.labStat}>реальный ответ ИИ</span>
              </div>
            </div>
            <div className={styles.labHeroVisual} aria-hidden>
              <div className={`${styles.miniCore} ${styles.miniCoreBase}`} />
            </div>
          </div>
          {!inTauri ? (
            <p className={styles.classificationHint}>
              Браузерный демо-режим: ответы имитируют типичный A/B-результат, чтобы можно было пройти маршрут
              без Tauri. В приложении AI Lab здесь отвечает локальная модель.
            </p>
          ) : null}
        </header>

        <article className={`${styles.card} ${styles.cardMuted}`}>
          <div className={styles.cardBody}>
            <p className={styles.classificationHint} style={{ marginBottom: "0.45rem" }}>
              Это первый рычаг улучшения: переписать запрос и проверить, как изменилась
              реакция модели. Каждый сохранённый запуск даёт рабочую гипотезу: какая
              инструкция лучше меняет ответ.
            </p>
            <p className={styles.classificationHint} style={{ marginBottom: 0 }}>
              Если новый запрос не чинит проблему, переходи в AI Clinic или создавай новый
              пример обучения.
            </p>
            <div className={styles.classificationActions} style={{ marginTop: "0.9rem" }}>
              <Link to={routes.studentAiClinic} className={`${styles.btn} ${styles.btnOutline}`}>
                Разобрать ошибку
              </Link>
              <Link to={routes.studentChatTraining} className={`${styles.btn} ${styles.btnOutline}`}>
                Дать пример обучения
              </Link>
              <Link to={routes.studentModelCompare} className={`${styles.btn} ${styles.btnOutline}`}>
                Проверить в Compare
              </Link>
            </div>
          </div>
        </article>

        {loading ? (
          <article className={`${styles.card} ${styles.cardMuted}`}>
            <div className={styles.cardBody}>
              <p className={styles.classificationHint}>Загружаем Prompt Lab...</p>
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

        {runResult || history.length > 0 ? (
          <article className={`${styles.card} ${styles.cardAccent}`}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Что получилось и что дальше</h2>
              <p className={styles.cardDesc}>
                Prompt Lab помогает найти более сильную формулировку на одной задаче.
                Следующий шаг после удачного запуска — проверить изменение поведения в Compare.
              </p>
            </div>
            <div className={styles.cardBody}>
              <p className={styles.classificationHint}>
                <strong>Что ты сделал:</strong>{" "}
                {runResult
                  ? "запустил реальный A/B-эксперимент и получил два ответа модели."
                  : "сохранил результат эксперимента и можешь вернуться к нему как к рабочей гипотезе."}
              </p>
              <p className={styles.classificationHint}>
                <strong>Что теперь есть:</strong> выбранный победитель, объяснение, почему
                он лучше, и история повторяемых запусков.
              </p>
              <p className={styles.classificationHint} style={{ marginBottom: "0.75rem" }}>
                <strong>Что дальше:</strong> Compare покажет, изменилось ли поведение модели
                на похожей задаче после твоих улучшений.
              </p>
              <div className={styles.classificationActions}>
                <Link to={routes.studentModelCompare} className={`${styles.btn} ${styles.btnAccent}`}>
                  Перейти в Compare
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
            <h2 className={styles.cardTitle}>{activeExercise.taskTitle}</h2>
            <p className={styles.cardDesc}>
              Задача задаёт один и тот же вход. Prompt A и Prompt B меняют только инструкцию
              к модели, поэтому разницу в ответах можно сравнить честно.
            </p>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.promptLabGrid}>
              <article className={styles.promptLabPanel}>
                <p className={styles.hubActionKicker}>Задача</p>
                <label className={styles.promptLabInputWrap}>
                  <span className={styles.classificationLegend}>Что должна решить модель</span>
                  <textarea
                    className={styles.promptLabTextarea}
                    value={taskInput}
                    onChange={(e) => setTaskInput(e.target.value)}
                    rows={6}
                  />
                </label>
                <p className={styles.hubActionKicker}>Слабый ответ</p>
                <p className={styles.classificationPrompt}>{activeExercise.weakOutput}</p>
              </article>

              <article className={styles.promptLabPanel}>
                <p className={styles.hubActionKicker}>Prompt A</p>
                <label className={styles.promptLabInputWrap}>
                  <span className={styles.classificationLegend}>Первый вариант инструкции</span>
                  <textarea
                    className={styles.promptLabTextarea}
                    value={promptA}
                    onChange={(e) => setPromptA(e.target.value)}
                    rows={7}
                  />
                </label>
                <p className={styles.hubActionKicker}>Prompt B</p>
                <label className={styles.promptLabInputWrap}>
                  <span className={styles.classificationLegend}>Второй вариант инструкции</span>
                  <textarea
                    className={styles.promptLabTextarea}
                    value={promptB}
                    onChange={(e) => setPromptB(e.target.value)}
                    rows={7}
                  />
                </label>
                {activeExercise.improvedPromptOptions.length > 0 ? (
                  <fieldset className={styles.classificationFieldset}>
                    <legend className={styles.classificationLegend}>
                      Быстрые варианты для Prompt B
                    </legend>
                    <div className={styles.classificationOptions}>
                      {activeExercise.improvedPromptOptions.map((option) => (
                        <label key={option} className={styles.classificationOptionLabel}>
                          <input
                            type="radio"
                            className={styles.classificationRadio}
                            checked={promptB === option}
                            onChange={() => setPromptB(option)}
                          />
                          <span className={styles.classificationOptionText}>{option}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ) : null}
                <div className={styles.promptDiagnosisGrid} aria-label="Диагностика запросов">
                  {[
                    { label: "Prompt A", diagnosis: promptADiagnosis },
                    { label: "Prompt B", diagnosis: promptBDiagnosis },
                  ].map((item) => (
                    <article key={item.label} className={styles.promptDiagnosisCard}>
                      <div className={styles.promptDiagnosisHead}>
                        <span>{item.label}</span>
                        <strong>{item.diagnosis.score}%</strong>
                      </div>
                      <div className={styles.promptDiagnosisBar} aria-hidden>
                        <span style={{ width: `${item.diagnosis.score}%` }} />
                      </div>
                      <p className={styles.promptDiagnosisSummary}>{item.diagnosis.summary}</p>
                      <div className={styles.promptDiagnosisChecks}>
                        {item.diagnosis.checks.map((check) => (
                          <span
                            key={check.id}
                            className={check.done ? styles.promptCheckDone : styles.promptCheckTodo}
                            title={check.hint}
                          >
                            {check.done ? "✓" : "+"} {check.label}
                          </span>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
                <div className={styles.classificationActions}>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnAccent}`}
                    onClick={() => void handleRun()}
                    disabled={!canRun}
                  >
                    {running ? "Запуск..." : "Запустить A/B"}
                  </button>
                </div>
                {running ? (
                  <div className={styles.aiThinkingPanel} role="status" aria-live="polite">
                    <div className={styles.aiThinkingOrb} aria-hidden />
                    <div className={styles.aiThinkingCopy}>
                      <p className={styles.aiThinkingTitle}>
                        ИИ думает
                        <span className={styles.aiThinkingDots} aria-hidden>
                          <span />
                          <span />
                          <span />
                        </span>
                      </p>
                      <p className={styles.aiThinkingText}>
                        Модель получает один и тот же запрос в двух вариантах и готовит ответы для сравнения.
                      </p>
                    </div>
                  </div>
                ) : null}
              </article>
            </div>
          </div>
        </article>

        <article className={`${styles.card} ${styles.cardMuted}`}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Ответы модели</h2>
            <p className={styles.cardDesc}>
              {runResult
                ? `Модель: ${runResult.modelName} · ${
                    runResult.usingTrainedModel
                      ? "используется твоя обученная модель"
                      : "используется базовая модель"
                  }`
                : "Сначала выполни A/B-запуск, чтобы увидеть реальные ответы модели."}
            </p>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.promptLabGrid}>
              <article
                className={`${styles.promptLabPanel} ${styles.promptLabResultCard} ${
                  winner === "A" && runResult ? styles.promptLabResultWinner : ""
                }`}
              >
                <div className={styles.promptLabResultHead}>
                  <p className={styles.hubActionKicker}>Ответ A</p>
                  {winner === "A" && runResult ? <span>выбран</span> : null}
                </div>
                <p className={styles.classificationPrompt}>
                  {runResult?.outputA || "После запуска здесь появится реальный ответ для Prompt A."}
                </p>
              </article>
              <article
                className={`${styles.promptLabPanel} ${styles.promptLabResultCard} ${
                  winner === "B" && runResult ? styles.promptLabResultWinner : ""
                }`}
              >
                <div className={styles.promptLabResultHead}>
                  <p className={styles.hubActionKicker}>Ответ B</p>
                  {winner === "B" && runResult ? <span>выбран</span> : null}
                </div>
                <p className={styles.classificationPrompt}>
                  {runResult?.outputB || "После запуска здесь появится реальный ответ для Prompt B."}
                </p>
              </article>
            </div>
          </div>
        </article>

        <article className={`${styles.card} ${styles.cardMuted}`}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Оценка результата</h2>
            <p className={styles.cardDesc}>
              Выбери, какой вариант сработал лучше, и зафиксируй причину. Это часть реального
              результата эксперимента, а не декоративный комментарий.
            </p>
          </div>
          <div className={styles.cardBody}>
            <fieldset className={styles.classificationFieldset}>
              <legend className={styles.classificationLegend}>Победивший вариант</legend>
              <div className={styles.classificationOptions}>
                <label className={styles.classificationOptionLabel}>
                  <input
                    type="radio"
                    className={styles.classificationRadio}
                    checked={winner === "A"}
                    onChange={() => setWinner("A")}
                  />
                  <span className={styles.classificationOptionText}>Prompt A лучше</span>
                </label>
                <label className={styles.classificationOptionLabel}>
                  <input
                    type="radio"
                    className={styles.classificationRadio}
                    checked={winner === "B"}
                    onChange={() => setWinner("B")}
                  />
                  <span className={styles.classificationOptionText}>Prompt B лучше</span>
                </label>
              </div>
            </fieldset>
            <label className={styles.promptLabInputWrap}>
              <span className={styles.classificationLegend}>Почему этот вариант победил</span>
              <textarea
                className={styles.promptLabTextarea}
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                placeholder="Например: второй вариант дал более конкретный разбор ошибки, сохранил дружелюбный тон и завершил ответ следующим действием для ученика."
                rows={5}
              />
            </label>
            <div className={styles.classificationActions}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnAccent}`}
                onClick={() => void handleSave()}
                disabled={!canSave}
              >
                {saving ? "Сохранение..." : "Сохранить эксперимент"}
              </button>
              <Link
                to={routes.studentChatTraining}
                state={chatTrainingPrefill}
                className={`${styles.btn} ${styles.btnOutline}`}
              >
                Сделать пример обучения
              </Link>
            </div>
          </div>
        </article>

        <article className={`${styles.card} ${styles.cardMuted}`}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>История экспериментов</h2>
            <p className={styles.cardDesc}>
              История студента: варианты запросов, ответы, выбранный победитель и объяснение.
            </p>
          </div>
          <div className={styles.cardBody}>
            {history.length === 0 && demoSavedCount === 0 ? (
              <p className={styles.classificationHint}>
                Пока нет сохранённых экспериментов. Первый сохранённый запуск станет первым
                результатом Prompt Lab.
              </p>
            ) : demoSavedCount > 0 ? (
              <p className={styles.classificationHint}>
                В браузерном демо-режиме сохранено экспериментов: {demoSavedCount}. В приложении AI Lab история
                сохраняется в базе ученика.
              </p>
            ) : (
              <div className={styles.classificationOptions}>
                {history.map((item) => (
                  <article key={item.experimentId} className={styles.classificationOptionLabel}>
                    <div className={styles.classificationOptionText} style={{ width: "100%" }}>
                      <p className={styles.classificationOutcomeTitle} style={{ marginBottom: "0.25rem" }}>
                        {item.taskTitle}
                      </p>
                      <p className={styles.classificationHint} style={{ marginBottom: "0.45rem" }}>
                        {formatDateTime(item.createdAt)}
                        {item.modelName ? ` · ${item.modelName}` : ""}
                        {` · победитель ${item.winner}`}
                      </p>
                      <p className={styles.classificationHint} style={{ marginBottom: "0.35rem" }}>
                        <strong>Prompt A:</strong> {item.promptA}
                      </p>
                      <p className={styles.classificationHint} style={{ marginBottom: "0.35rem" }}>
                        <strong>Ответ A:</strong> {item.outputA}
                      </p>
                      <p className={styles.classificationHint} style={{ marginBottom: "0.35rem" }}>
                        <strong>Prompt B:</strong> {item.promptB}
                      </p>
                      <p className={styles.classificationHint} style={{ marginBottom: "0.35rem" }}>
                        <strong>Ответ B:</strong> {item.outputB}
                      </p>
                      <p className={styles.classificationOutcomeText}>
                        <strong>Почему:</strong> {item.rationale || "Без пояснения"}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </article>

        {logEntry ? (
          <article className={`${styles.card} ${styles.cardMuted}`}>
            <div className={styles.cardBody}>
              <div className={styles.classificationOutcomeOk}>
                <p className={styles.classificationOutcomeTitle}>{logEntry.title}</p>
                <p className={styles.classificationOutcomeText}>
                  Сохранённый результат: <strong>{savedResultLabel(logEntry.savedArtifactType)}</strong>
                </p>
                {logEntry.nextRecommendedActions.map((item) => (
                  <p key={item} className={styles.classificationHint} style={{ marginBottom: "0.35rem" }}>
                    • {item}
                  </p>
                ))}
              </div>
            </div>
          </article>
        ) : null}
      </div>
    </div>
  );
}
