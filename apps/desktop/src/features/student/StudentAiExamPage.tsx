import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  aiExamAvailable,
  fetchAiExamBlueprint,
  submitAiExam,
  type AiExamBlueprint,
  type AiExamStep,
  type AiExamSubmitResult,
} from "@/shared/ai-exam-tauri";
import { useAuth } from "@/shared/auth-context";
import { routes } from "@/shared/routes";
import { saveLastExamResult } from "./exam-last-storage";
import styles from "./StudentDashboardPage.module.css";

const SKILL_LABELS: Record<string, string> = {
  classification: "Классификация и разметка",
  ranking: "Ранжирование и приоритеты",
  policy_path: "Политика ответа",
  data_cleaning: "Очистка данных",
  prompt_understanding: "Понимание запросов",
};

function moveOrder(list: string[], index: number, delta: number): string[] {
  const nextIndex = index + delta;
  if (nextIndex < 0 || nextIndex >= list.length) return list;
  const next = [...list];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
}

function payloadStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function payloadExamples(value: unknown): { id: string; text: string }[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const source = row as Record<string, unknown>;
      const id = typeof source.id === "string" ? source.id : "";
      const text = typeof source.text === "string" ? source.text : "";
      if (!id) return null;
      return { id, text };
    })
    .filter((item): item is { id: string; text: string } => item !== null);
}

function payloadChoices(value: unknown): { id: string; label: string; text: string }[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const source = row as Record<string, unknown>;
      const id = String(source.id ?? "");
      const label = String(source.label ?? "");
      const text = String(source.text ?? "");
      if (!id) return null;
      return { id, label, text };
    })
    .filter((choice): choice is { id: string; label: string; text: string } => choice !== null);
}

export function StudentAiExamPage() {
  const { userEmail } = useAuth();
  const inTauri = isTauri();
  const [blueprint, setBlueprint] = useState<AiExamBlueprint | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"intro" | "run" | "done">("intro");
  const [stepIndex, setStepIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<AiExamSubmitResult | null>(null);

  const [clsSel, setClsSel] = useState<string | null>(null);
  const [rankOrder, setRankOrder] = useState<string[]>([]);
  const [policySel, setPolicySel] = useState<string | null>(null);
  const [dcLabels, setDcLabels] = useState<Record<string, "clean" | "noisy" | null>>({});
  const [promptChoice, setPromptChoice] = useState<string | null>(null);
  const [savedAnswers, setSavedAnswers] = useState<Record<string, unknown>>({});

  const loadBlueprint = useCallback(async () => {
    if (!aiExamAvailable()) {
      setBlueprint(null);
      setLoadError(null);
      return;
    }
    try {
      const nextBlueprint = await fetchAiExamBlueprint();
      setBlueprint(nextBlueprint);
      setLoadError(null);
    } catch (error) {
      setBlueprint(null);
      setLoadError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => {
    void loadBlueprint();
  }, [loadBlueprint]);

  const step: AiExamStep | undefined = blueprint?.steps[stepIndex];
  const totalSteps = blueprint?.steps.length ?? 0;

  useEffect(() => {
    if (!step) return;
    if (step.skill === "ranking") {
      const options = payloadStrings(step.payload.options);
      setRankOrder(options.length ? [...options] : []);
    }
    if (step.skill === "data_cleaning") {
      const examples = payloadExamples(step.payload.examples);
      const nextState: Record<string, "clean" | "noisy" | null> = {};
      for (const example of examples) nextState[example.id] = null;
      setDcLabels(nextState);
    }
  }, [step?.id, step?.skill, step?.payload]);

  const canAdvance = useMemo(() => {
    if (!step) return false;
    switch (step.skill) {
      case "classification":
        return clsSel !== null;
      case "ranking":
        return rankOrder.length > 0;
      case "policy_path":
        return policySel !== null;
      case "data_cleaning": {
        const ids = Object.keys(dcLabels);
        return ids.length > 0 && ids.every((id) => dcLabels[id] != null);
      }
      case "prompt_understanding":
        return promptChoice !== null;
      default:
        return false;
    }
  }, [step, clsSel, rankOrder.length, policySel, dcLabels, promptChoice]);

  function resetStepInputs(nextStep: AiExamStep) {
    setClsSel(null);
    setPolicySel(null);
    setPromptChoice(null);

    if (nextStep.skill === "ranking") {
      const options = payloadStrings(nextStep.payload.options);
      setRankOrder(options.length ? [...options] : []);
    } else {
      setRankOrder([]);
    }

    if (nextStep.skill === "data_cleaning") {
      const examples = payloadExamples(nextStep.payload.examples);
      const nextState: Record<string, "clean" | "noisy" | null> = {};
      for (const example of examples) nextState[example.id] = null;
      setDcLabels(nextState);
    } else {
      setDcLabels({});
    }
  }

  function handleStart() {
    setPhase("run");
    setStepIndex(0);
    setResult(null);
    setSubmitError(null);
    setSavedAnswers({});
    const firstStep = blueprint?.steps[0];
    if (firstStep) resetStepInputs(firstStep);
  }

  function captureCurrentStepAnswer(): Record<string, unknown> | null {
    if (!step) return null;
    switch (step.skill) {
      case "classification":
        return clsSel ? { [step.id]: { type: "classification", selected: clsSel } } : null;
      case "ranking":
        return rankOrder.length ? { [step.id]: { type: "ranking", order: rankOrder } } : null;
      case "policy_path":
        return policySel ? { [step.id]: { type: "policy_path", selected: policySel } } : null;
      case "data_cleaning": {
        const clean: string[] = [];
        const noisy: string[] = [];
        for (const [id, label] of Object.entries(dcLabels)) {
          if (label === "clean") clean.push(id);
          if (label === "noisy") noisy.push(id);
        }
        return { [step.id]: { type: "data_cleaning", clean, noisy } };
      }
      case "prompt_understanding":
        return promptChoice
          ? { [step.id]: { type: "prompt_understanding", choiceId: promptChoice } }
          : null;
      default:
        return null;
    }
  }

  function handleNext() {
    if (!blueprint || !step) return;
    const piece = captureCurrentStepAnswer();
    if (!piece) return;

    setSavedAnswers((prev) => ({ ...prev, ...piece }));
    if (stepIndex + 1 < blueprint.steps.length) {
      const nextStep = blueprint.steps[stepIndex + 1];
      setStepIndex((prev) => prev + 1);
      resetStepInputs(nextStep);
    }
  }

  async function handleFinish() {
    const email = (userEmail ?? "").trim();
    if (!email || !blueprint) return;

    setBusy(true);
    setSubmitError(null);
    try {
      const piece = captureCurrentStepAnswer();
      if (!piece) {
        setSubmitError("Заполните текущий шаг.");
        setBusy(false);
        return;
      }
      const answers = { ...savedAnswers, ...piece };
      const submitResult = await submitAiExam(email, answers);
      setResult(submitResult);
      saveLastExamResult(email, submitResult);
      setPhase("done");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  function renderStepContent(currentStep: AiExamStep) {
    const prompt = String(currentStep.payload.prompt ?? "");
    switch (currentStep.skill) {
      case "classification": {
        const options = payloadStrings(currentStep.payload.options);
        return (
          <>
            <p className={styles.classificationPrompt}>{prompt}</p>
            <div className={styles.examOptionList} role="list">
              {options.map((option) => (
                <label key={option} className={styles.examOptionRow}>
                  <input
                    type="radio"
                    name={`exam-${currentStep.id}`}
                    checked={clsSel === option}
                    onChange={() => setClsSel(option)}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </>
        );
      }
      case "ranking":
        return (
          <>
            <p className={styles.classificationPrompt}>{prompt}</p>
            <ol className={styles.examRankList}>
              {rankOrder.map((label, index) => (
                <li key={`${label}-${index}`} className={styles.examRankItem}>
                  <span className={styles.examRankText}>{label}</span>
                  <div className={styles.examRankBtns}>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnGhost}`}
                      disabled={index === 0}
                      onClick={() => setRankOrder((prev) => moveOrder(prev, index, -1))}
                      aria-label="Выше"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnGhost}`}
                      disabled={index === rankOrder.length - 1}
                      onClick={() => setRankOrder((prev) => moveOrder(prev, index, 1))}
                      aria-label="Ниже"
                    >
                      ↓
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          </>
        );
      case "policy_path": {
        const options = payloadStrings(currentStep.payload.options);
        return (
          <>
            <p className={styles.classificationPrompt}>{prompt}</p>
            <div className={styles.examOptionList}>
              {options.map((option) => (
                <label key={option} className={styles.examOptionRow}>
                  <input
                    type="radio"
                    name={`exam-${currentStep.id}`}
                    checked={policySel === option}
                    onChange={() => setPolicySel(option)}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </>
        );
      }
      case "data_cleaning": {
        const examples = payloadExamples(currentStep.payload.examples);
        return (
          <>
            <p className={styles.classificationPrompt}>{prompt}</p>
            <ul className={styles.examDcList}>
              {examples.map((example) => (
                <li key={example.id} className={styles.examDcRow}>
                  <span className={styles.examDcText}>{example.text}</span>
                  <div className={styles.examDcBtns}>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnSm} ${styles.btnOutline} ${
                        dcLabels[example.id] === "clean" ? styles.btnSmAccent : ""
                      }`}
                      onClick={() => setDcLabels((prev) => ({ ...prev, [example.id]: "clean" }))}
                    >
                      В набор
                    </button>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnSm} ${styles.btnOutline} ${
                        dcLabels[example.id] === "noisy" ? styles.examDcNoisyActive : ""
                      }`}
                      onClick={() => setDcLabels((prev) => ({ ...prev, [example.id]: "noisy" }))}
                    >
                      Шум
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        );
      }
      case "prompt_understanding": {
        const scenario = String(currentStep.payload.scenario ?? "");
        const choices = payloadChoices(currentStep.payload.choices);
        return (
          <>
            <p className={styles.classificationHint}>{scenario}</p>
            <div className={styles.examPromptChoices}>
              {choices.map((choice) => (
                <label key={choice.id} className={styles.examPromptCard}>
                  <div className={styles.examPromptCardHead}>
                    <input
                      type="radio"
                      name={`exam-${currentStep.id}`}
                      checked={promptChoice === choice.id}
                      onChange={() => setPromptChoice(choice.id)}
                    />
                    <span className={styles.examPromptLabel}>Вариант {choice.label}</span>
                  </div>
                  <p className={styles.examPromptText}>{choice.text}</p>
                </label>
              ))}
            </div>
          </>
        );
      }
      default:
        return <p className={styles.classificationError}>Неизвестный тип шага.</p>;
    }
  }

  const emailOk = Boolean((userEmail ?? "").trim());

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
          <p className={styles.examLabBadge}>Контрольная проверка</p>
          <h1 className={styles.pageTitle}>{blueprint?.labTitle ?? "Проверка навыков AI Lab"}</h1>
          <p className={styles.subtitle}>
            Отдельная проверка на новых примерах. Она не заменяет Compare и Arena, но помогает
            увидеть, какие навыки стоит укрепить дальше.
          </p>
        </header>

        {!inTauri ? (
          <article className={`${styles.card} ${styles.cardMuted}`}>
            <div className={styles.cardBody}>
              <p className={styles.classificationPrompt}>
                Запусти настольное приложение, чтобы пройти проверку и
                сохранить результат локально.
              </p>
            </div>
          </article>
        ) : null}

        {inTauri && loadError ? (
          <article className={`${styles.card} ${styles.cardMuted}`}>
            <div className={styles.cardBody}>
              <p className={styles.classificationError}>{loadError}</p>
            </div>
          </article>
        ) : null}

        {inTauri && blueprint && phase === "intro" ? (
          <article className={`${styles.card} ${styles.cardAccent} ${styles.examMissionCard}`}>
            <div className={styles.cardBody}>
              <h2 className={styles.examMissionTitle}>{blueprint.missionTitle}</h2>
              <p className={styles.classificationPrompt}>{blueprint.missionLead}</p>
              <ul className={styles.examMissionList}>
                <li>Пять блоков: разметка, ранжирование, политика ответа, очистка данных и запросы.</li>
                <li>Каждый блок проверяет отдельный навык, а общий результат показывает картину целиком.</li>
                <li>После завершения ты увидишь сильные стороны, пробелы и рекомендацию для следующей тренировки.</li>
              </ul>
              {!emailOk ? (
                <p className={styles.classificationError}>
                  Войдите с email студента, чтобы сохранить результат проверки.
                </p>
              ) : null}
              <div className={styles.classificationActions}>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnAccent}`}
                  disabled={!emailOk}
                  onClick={handleStart}
                >
                  Начать проверку
                </button>
              </div>
            </div>
          </article>
        ) : null}

        {inTauri && blueprint && phase === "run" && step ? (
          <article className={`${styles.card} ${styles.cardMuted}`}>
            <div className={styles.cardHeader}>
              <p className={styles.examStepMeta}>
                Шаг {stepIndex + 1} / {totalSteps} · {SKILL_LABELS[step.skill] ?? step.skill}
              </p>
              <h2 className={styles.cardTitle}>{step.title}</h2>
              <p className={styles.cardDesc}>{step.subtitle}</p>
            </div>
            <div className={styles.cardBody}>
              <p className={styles.classificationLegend}>{step.instructions}</p>
              {renderStepContent(step)}
              {submitError ? <p className={styles.classificationError}>{submitError}</p> : null}
              <div className={styles.classificationActions}>
                {stepIndex + 1 < totalSteps ? (
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnAccent}`}
                    disabled={!canAdvance}
                    onClick={handleNext}
                  >
                    Дальше
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnAccent}`}
                    disabled={!canAdvance || busy}
                    onClick={() => void handleFinish()}
                  >
                    {busy ? "Сохраняем результат..." : "Завершить и получить отчёт"}
                  </button>
                )}
              </div>
            </div>
          </article>
        ) : null}

        {inTauri && blueprint && phase === "done" && result ? (
          <>
            <article className={`${styles.card} ${styles.cardAccent} ${styles.examResultHero}`}>
              <div className={styles.cardBody}>
                <h2 className={styles.examResultTitle}>Отчёт проверки</h2>
                <p className={styles.examScoreBig}>
                  Общий результат: <strong>{result.totalScore}%</strong>
                </p>
                <p className={styles.classificationHint}>
                  Сохранено: <strong>{new Date(result.createdAt).toLocaleString("ru-RU")}</strong>
                </p>
              </div>
            </article>

            <article className={`${styles.card} ${styles.cardMuted}`}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>Оценка по навыкам</h3>
              </div>
              <div className={styles.cardBody}>
                <dl className={styles.examSkillGrid}>
                  {Object.entries(result.skillScores).map(([key, value]) => (
                    <div key={key} className={styles.examSkillCell}>
                      <dt className={styles.examSkillDt}>{SKILL_LABELS[key] ?? key}</dt>
                      <dd className={styles.examSkillDd}>{value}%</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </article>

            <div className={styles.examTwoCol}>
              <article className={`${styles.card} ${styles.cardMuted}`}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>Сильные стороны</h3>
                </div>
                <div className={styles.cardBody}>
                  <ul className={styles.examBulletList}>
                    {result.strengths.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
              </article>
              <article className={`${styles.card} ${styles.cardMuted}`}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>Что укрепить</h3>
                </div>
                <div className={styles.cardBody}>
                  <ul className={styles.examBulletList}>
                    {result.weaknesses.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
              </article>
            </div>

            <article className={`${styles.card} ${styles.cardMuted}`}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>Рекомендация</h3>
              </div>
              <div className={styles.cardBody}>
                <p className={styles.classificationPrompt}>{result.recommendation}</p>
                <div className={styles.classificationActions}>
                  <Link to={routes.studentAiGrowth} className={`${styles.btn} ${styles.btnOutline}`}>
                    К Мой ИИ
                  </Link>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnGhost}`}
                    onClick={() => {
                      setPhase("intro");
                      setStepIndex(0);
                      setResult(null);
                      setClsSel(null);
                      setPolicySel(null);
                      setPromptChoice(null);
                    }}
                  >
                    Пройти ещё раз
                  </button>
                </div>
              </div>
            </article>
          </>
        ) : null}
      </div>
    </div>
  );
}
