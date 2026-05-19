import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/shared/auth-context";
import {
  buildChatTrainingRowPreview,
  fetchChatTrainingContext,
  fetchChatTrainingHistory,
  generateChatTrainingAnswer,
  saveChatTrainingInteraction,
  type ChatTrainingAnswer,
  type ChatTrainingContext,
  type ChatTrainingHistoryItem,
} from "@/shared/chat-training-tauri";
import {
  fetchStudentTrainingPipelineStatus,
  type StudentTrainingPipelineStatus,
} from "@/shared/training-pipeline-tauri";
import { routes } from "@/shared/routes";
import { buildTrainingOverviewReadModel } from "./read-models/training-overview-read-model";
import styles from "./StudentDashboardPage.module.css";

type ChatTrainingClinicPrefillState = {
  fromAiClinic?: boolean;
  task?: string;
  failureCategory?: string;
  studentCritique?: string;
  minimalEdit?: string;
  revisedTargetAnswer?: string;
  latestAnswer?: ChatTrainingAnswer;
  referenceAnswer?: string;
  referenceModelName?: string | null;
  repairGoalTitle?: string;
  repairGoalDescription?: string;
  repairTargetExampleCount?: number;
  repairChecklist?: string[];
};

const RATING_SCALE = [1, 2, 3, 4, 5] as const;

const FAILURE_TAXONOMY = [
  { id: "too_generic", label: "Слишком общий ответ" },
  { id: "format_not_followed", label: "Не соблюден формат" },
  { id: "hallucination", label: "Похоже на выдуманный факт" },
  { id: "missing_step", label: "Пропущен важный шаг" },
  { id: "tone_issue", label: "Не тот тон ответа" },
  { id: "constraint_broken", label: "Нарушено ограничение" },
] as const;

type TrainingExampleQuality = {
  level: "strong" | "usable" | "weak";
  label: string;
  summary: string;
  checks: Array<{ label: string; done: boolean }>;
};

function failureCategoryLabel(category: string): string {
  return FAILURE_TAXONOMY.find((item) => item.id === category)?.label ?? "Тип ошибки не указан";
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function buildTrainingExampleQuality(input: {
  sourcePrompt: string;
  draftAnswer: string;
  studentCritique: string;
  failureCategory: string;
  minimalEdit: string;
  revisedTargetAnswer: string;
  answerQuality: number;
}): TrainingExampleQuality {
  const checks = [
    {
      label: "есть реальная задача пользователя",
      done: wordCount(input.sourcePrompt) >= 5,
    },
    {
      label: "есть черновик модели, который можно улучшать",
      done: wordCount(input.draftAnswer) >= 8,
    },
    {
      label: "критика объясняет, что именно исправить",
      done: wordCount(input.studentCritique) >= 6,
    },
    {
      label: "указан тип ошибки",
      done: input.failureCategory.trim().length > 0,
    },
    {
      label: "есть точечная правка",
      done: wordCount(input.minimalEdit) >= 4,
    },
    {
      label: "целевой ответ достаточно полный",
      done: wordCount(input.revisedTargetAnswer) >= 12,
    },
    {
      label: "целевая версия оценена как сильная",
      done: input.answerQuality >= 4 && input.answerQuality <= 5,
    },
  ];
  const doneCount = checks.filter((check) => check.done).length;

  if (doneCount >= 6 && input.answerQuality >= 4) {
    return {
      level: "strong",
      label: "сильный пример",
      summary: "Этот пример уже хорошо подходит для обучения: понятна задача, ошибка и желаемое поведение.",
      checks,
    };
  }
  if (doneCount >= 4) {
    return {
      level: "usable",
      label: "можно использовать, но лучше усилить",
      summary: "Пример полезен, но перед обучением стоит уточнить слабые места: критику, правку или целевой ответ.",
      checks,
    };
  }
  return {
    level: "weak",
    label: "пример пока слабый",
    summary: "Такой пример может добавить шум в обучение. Дополни критику, правку и целевой ответ перед сохранением.",
    checks,
  };
}

function personalityLabelRu(code: string): string {
  switch (code) {
    case "mentor":
      return "наставник";
    case "strategist":
      return "стратег";
    case "inventor":
      return "изобретатель";
    default:
      return "исследователь";
  }
}

function modelModeLabel(answer: ChatTrainingAnswer | null): string {
  if (!answer) return "Модель ещё не запускалась";
  if (answer.usingTrainedModel) {
    return `Активная обученная модель: ${answer.modelName || "моя модель"}`;
  }
  return `Базовая локальная модель: ${answer.modelName || "локальная базовая модель"}`;
}

function cleanErrorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function StudentChatTrainingPage() {
  const { userEmail } = useAuth();
  const location = useLocation();
  const inTauri = isTauri();
  const studentEmail = (userEmail ?? "").trim();
  const clinicPrefill = (location.state ?? null) as ChatTrainingClinicPrefillState | null;

  const [context, setContext] = useState<ChatTrainingContext | null>(null);
  const [history, setHistory] = useState<ChatTrainingHistoryItem[]>([]);
  const [trainingStatus, setTrainingStatus] = useState<StudentTrainingPipelineStatus | null>(null);
  const [input, setInput] = useState("");
  const [latestAnswer, setLatestAnswer] = useState<ChatTrainingAnswer | null>(null);
  const [latestStudentMessage, setLatestStudentMessage] = useState("");
  const [studentRating, setStudentRating] = useState<number>(3);
  const [failureCategory, setFailureCategory] = useState<string>("too_generic");
  const [studentCritique, setStudentCritique] = useState("");
  const [minimalEdit, setMinimalEdit] = useState("");
  const [revisedTargetAnswer, setRevisedTargetAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [prefillNotice, setPrefillNotice] = useState<string | null>(null);
  const [referenceAnswer, setReferenceAnswer] = useState("");
  const [referenceModelName, setReferenceModelName] = useState<string | null>(null);
  const [repairGoalTitle, setRepairGoalTitle] = useState("");
  const [repairGoalDescription, setRepairGoalDescription] = useState("");
  const [repairTargetExampleCount, setRepairTargetExampleCount] = useState<number | null>(null);
  const [repairChecklist, setRepairChecklist] = useState<string[]>([]);
  const [demoSavedCount, setDemoSavedCount] = useState(0);

  const hasDraft = latestAnswer !== null && latestStudentMessage.trim() !== "";
  const trainingSaved = savedAt !== null;
  const trainingOverview = useMemo(() => buildTrainingOverviewReadModel(trainingStatus), [trainingStatus]);
  const isPreferenceMode = referenceAnswer.trim().length > 0;

  useEffect(() => {
    let active = true;

    async function load() {
      if (!studentEmail) {
        setError("Войдите с email ученика, чтобы создавать примеры обучения.");
        return;
      }
      if (!inTauri) {
        setContext(null);
        setHistory([]);
        setTrainingStatus(null);
        setError(null);
        return;
      }

      try {
        setHistoryLoading(true);
        const [ctx, items, pipeline] = await Promise.all([
          fetchChatTrainingContext(studentEmail),
          fetchChatTrainingHistory(studentEmail, 8),
          fetchStudentTrainingPipelineStatus(studentEmail),
        ]);
        if (!active) return;
        setContext(ctx);
        setHistory(items);
        setTrainingStatus(pipeline);
        setError(null);
      } catch (e) {
        if (!active) return;
        setError(cleanErrorText(e));
      } finally {
        if (active) setHistoryLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [studentEmail, inTauri]);

  useEffect(() => {
    if (!latestAnswer) return;
    const q = latestAnswer.answerQuality;
    setStudentRating(q >= 1 && q <= 5 ? q : 3);
  }, [latestAnswer]);

  useEffect(() => {
    if (!clinicPrefill?.fromAiClinic) return;

    const nextTask = clinicPrefill.task?.trim() ?? "";
    if (nextTask) {
      setInput("");
      setLatestStudentMessage(nextTask);
    }
    if (clinicPrefill.latestAnswer) {
      setLatestAnswer(clinicPrefill.latestAnswer);
    }
    if (clinicPrefill.failureCategory?.trim()) {
      setFailureCategory(clinicPrefill.failureCategory.trim());
    }
    setStudentCritique(clinicPrefill.studentCritique?.trim() ?? "");
    setMinimalEdit(clinicPrefill.minimalEdit?.trim() ?? "");
    setReferenceAnswer(clinicPrefill.referenceAnswer?.trim() ?? "");
    setReferenceModelName(clinicPrefill.referenceModelName?.trim() ?? null);
    setRepairGoalTitle(clinicPrefill.repairGoalTitle?.trim() ?? "");
    setRepairGoalDescription(clinicPrefill.repairGoalDescription?.trim() ?? "");
    setRepairTargetExampleCount(
      typeof clinicPrefill.repairTargetExampleCount === "number"
        ? clinicPrefill.repairTargetExampleCount
        : null,
    );
    setRepairChecklist(
      Array.isArray(clinicPrefill.repairChecklist)
        ? clinicPrefill.repairChecklist.map((item) => String(item).trim()).filter(Boolean)
        : [],
    );
    setRevisedTargetAnswer(
      clinicPrefill.revisedTargetAnswer?.trim() ??
        clinicPrefill.referenceAnswer?.trim() ??
        clinicPrefill.latestAnswer?.aiAnswer ??
        "",
    );
    setSavedAt(null);
    setPrefillNotice(
      clinicPrefill.referenceAnswer?.trim()
        ? "Черновик перенесен из AI Clinic вместе с более сильным ответом. Теперь преврати разницу качества в пример обучения."
        : "Черновик перенесен из AI Clinic. Тип ошибки и рамка исправления уже подготовлены.",
    );
  }, [clinicPrefill]);

  const rowPreview = useMemo(() => {
    if (!latestAnswer || !latestStudentMessage) return null;
    return buildChatTrainingRowPreview({
      studentMessage: latestStudentMessage,
      aiAnswer: latestAnswer.aiAnswer,
      studentCritique,
      failureCategory,
      minimalEdit,
      revisedTargetAnswer,
      answerQuality: studentRating,
      modelName: latestAnswer.modelName,
      referenceAnswer,
      referenceModelName,
    });
  }, [
    latestAnswer,
    latestStudentMessage,
    revisedTargetAnswer,
    minimalEdit,
    studentCritique,
    failureCategory,
    studentRating,
    referenceAnswer,
    referenceModelName,
  ]);
  const exampleQuality = useMemo(() => {
    if (!rowPreview) return null;
    return buildTrainingExampleQuality({
      sourcePrompt: rowPreview.sourcePrompt,
      draftAnswer: rowPreview.draftAnswer,
      studentCritique: rowPreview.studentCritique,
      failureCategory: rowPreview.failureCategory,
      minimalEdit: rowPreview.minimalEdit,
      revisedTargetAnswer: rowPreview.revisedTargetAnswer,
      answerQuality: rowPreview.rating,
    });
  }, [rowPreview]);
  const exampleQualityScore = exampleQuality
    ? Math.round((exampleQuality.checks.filter((check) => check.done).length / exampleQuality.checks.length) * 100)
    : 0;
  const nextMissingQualityCheck = exampleQuality?.checks.find((check) => !check.done)?.label ?? null;

  function stepClass(done: boolean, active: boolean): string {
    const bits = [styles.chatTrainingStep];
    if (done) bits.push(styles.chatTrainingStepDone);
    if (active) bits.push(styles.chatTrainingStepActive);
    return bits.join(" ");
  }

  async function reloadHistory() {
    if (!inTauri || !studentEmail) return;
    const [items, pipeline] = await Promise.all([
      fetchChatTrainingHistory(studentEmail, 8),
      fetchStudentTrainingPipelineStatus(studentEmail),
    ]);
    setHistory(items);
    setTrainingStatus(pipeline);
  }

  async function handleGenerateDraft() {
    const studentMessage = input.trim();
    if (!studentEmail || !studentMessage) return;

    setBusy(true);
    setError(null);
    setSavedAt(null);

    if (!inTauri) {
      const answer: ChatTrainingAnswer = {
        aiAnswer:
          "Можно просто поискать в интернете и выбрать первый сайт. Обычно там всё уже написано, главное быстро найти ответ.",
        answerQuality: 2,
        qualityNote: "Ответ слишком общий и не учит проверять источник.",
        simulatorExplanation: "Демо-черновик специально слабый: его удобно исправить в пример обучения.",
        answerUsedTrainingContext: false,
        modelName: "браузерный демо-режим",
        usingTrainedModel: false,
      };
      setLatestStudentMessage(studentMessage);
      setLatestAnswer(answer);
      setFailureCategory("too_generic");
      setStudentCritique("Ответ слишком общий: не объясняет, как проверить автора, дату и надежность источника.");
      setMinimalEdit("Добавить 3 шага проверки источника и один пример.");
      setReferenceAnswer("");
      setReferenceModelName(null);
      setRepairGoalTitle("");
      setRepairGoalDescription("");
      setRepairTargetExampleCount(null);
      setRepairChecklist([]);
      setRevisedTargetAnswer(
        "Проверь источник в три шага: кто автор, когда опубликовано и есть ли подтверждение в другом надежном месте. Например, если сайт не показывает автора и дату, не используй его как единственный источник.",
      );
      setInput("");
      setBusy(false);
      return;
    }

    try {
      const answer = await generateChatTrainingAnswer(studentEmail, studentMessage);
      setLatestStudentMessage(studentMessage);
      setLatestAnswer(answer);
      setFailureCategory("too_generic");
      setStudentCritique("");
      setMinimalEdit("");
      setReferenceAnswer("");
      setReferenceModelName(null);
      setRepairGoalTitle("");
      setRepairGoalDescription("");
      setRepairTargetExampleCount(null);
      setRepairChecklist([]);
      setRevisedTargetAnswer(answer.aiAnswer);
      setInput("");
    } catch (e) {
      setError(cleanErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveTraining() {
    if (!studentEmail || !latestAnswer || !latestStudentMessage) return;

    setBusy(true);
    setError(null);

    if (!inTauri) {
      setDemoSavedCount((count) => count + 1);
      setSavedAt(new Date().toISOString());
      setBusy(false);
      return;
    }

    try {
      const saved = await saveChatTrainingInteraction({
        studentEmail,
        studentMessage: latestStudentMessage,
        aiAnswer: latestAnswer.aiAnswer,
        answerQuality: studentRating,
        studentCritique,
        failureCategory,
        minimalEdit,
        revisedTargetAnswer,
        modelName: latestAnswer.modelName,
        referenceAnswer,
        referenceModelName,
      });
      setSavedAt(saved.createdAt);
      await reloadHistory();
    } catch (e) {
      setError(cleanErrorText(e));
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
              <p className={styles.labKicker}>Рычаг: пример обучения</p>
              <h1 className={styles.pageTitle}>Примеры обучения</h1>
              <p className={styles.labHeroText}>
                Покажи своему ИИ слабый ответ, объясни ошибку и сохрани лучший вариант как пример для обучения.
              </p>
              <div className={styles.labHeroStats}>
                <span className={styles.labStat}>задача</span>
                <span className={styles.labStat}>критика</span>
                <span className={styles.labStat}>целевой ответ</span>
              </div>
            </div>
            <div className={styles.labHeroVisual} aria-hidden>
              <div className={`${styles.miniCore} ${styles.miniCoreLearning}`} />
            </div>
          </div>
          {!inTauri ? (
            <p className={styles.classificationHint}>
              Браузерный демо-режим: можно пройти сценарий создания примера. В приложении AI Lab пример
              сохранится в базе и попадёт в обучение.
            </p>
          ) : null}
        </header>

        <article className={`${styles.card} ${styles.cardMuted}`}>
          <div className={styles.cardBody}>
            <p className={styles.classificationHint} style={{ marginBottom: "0.45rem" }}>
              Цель страницы простая: создать сильные примеры, которые потом можно собрать в данные
              для обучения модели. Хороший пример показывает не только правильный ответ, но и что
              именно было слабым в черновике.
            </p>
            <p className={styles.classificationHint} style={{ marginBottom: 0 }}>
              Это второй рычаг улучшения: не просто менять запрос, а показать модели образец
              нужного поведения. После нескольких сильных примеров переходи к обучению модели.
            </p>
            <div className={styles.classificationActions} style={{ marginTop: "0.9rem" }}>
              <Link to={routes.studentPromptLab} className={`${styles.btn} ${styles.btnOutline}`}>
                Проверить запрос
              </Link>
              <Link to={routes.studentAiClinic} className={`${styles.btn} ${styles.btnOutline}`}>
                Разобрать ошибку
              </Link>
              <Link to={routes.studentTrainingManager} className={`${styles.btn} ${styles.btnOutline}`}>
                Обучить модель
              </Link>
            </div>
          </div>
        </article>

        <article className={`${styles.card} ${styles.cardAccent}`}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Какой режим сейчас</h2>
            <p className={styles.cardDesc}>
              Можно исправить один ответ модели или создать пример на основе сравнения двух ответов.
            </p>
          </div>
          <div className={styles.cardBody}>
            <div className={isPreferenceMode ? styles.classificationOutcomeOk : styles.classificationOutcomeBad}>
              <p className={styles.classificationOutcomeTitle}>
                {isPreferenceMode ? "Пример на основе предпочтения" : "Обычный пример исправления"}
              </p>
              <p className={styles.classificationOutcomeText}>
                {isPreferenceMode
                  ? "Ты используешь сильный ответ как ориентир и сохраняешь, чем он лучше слабого черновика."
                  : "Ты берешь черновик модели, объясняешь слабое место и сохраняешь улучшенную версию ответа."}
              </p>
            </div>
          </div>
        </article>

        {prefillNotice ? (
          <article className={`${styles.card} ${styles.cardAccent}`}>
            <div className={styles.cardBody}>
              <p className={styles.classificationPrompt}>{prefillNotice}</p>
              {repairGoalTitle ? (
                <div className={styles.classificationOutcomeBad} style={{ marginTop: "0.9rem" }}>
                  <p className={styles.classificationOutcomeTitle}>
                    {repairGoalTitle}
                    {repairTargetExampleCount ? ` · цель: ${repairTargetExampleCount} примера` : ""}
                  </p>
                  {repairGoalDescription ? (
                    <p className={styles.classificationOutcomeText}>{repairGoalDescription}</p>
                  ) : null}
                  {repairChecklist.length > 0 ? (
                    <ul className={styles.taskList} style={{ marginTop: "0.75rem" }}>
                      {repairChecklist.map((item) => (
                        <li key={item} className={styles.classificationCard}>
                          <p className={styles.classificationHint}>{item}</p>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
          </article>
        ) : null}

        <article className={`${styles.card} ${styles.cardAccent}`}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Путь одного примера</h2>
            <p className={styles.cardDesc}>
              Сначала получи черновик, затем добавь критику, точечную правку и целевой ответ.
            </p>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.chatTrainingSteps} aria-label="Шаги создания примера обучения">
              <span className={stepClass(Boolean(latestStudentMessage), !latestStudentMessage)}>
                1. Задача
              </span>
              <span className={stepClass(Boolean(latestAnswer), Boolean(latestStudentMessage && !latestAnswer))}>
                2. Черновик ИИ
              </span>
              <span className={stepClass(Boolean(studentCritique.trim()), hasDraft && !studentCritique.trim())}>
                3. Критика
              </span>
              <span className={stepClass(Boolean(revisedTargetAnswer.trim()), hasDraft && Boolean(studentCritique.trim()))}>
                4. Целевой ответ
              </span>
              <span className={stepClass(trainingSaved, hasDraft && !trainingSaved)}>
                5. Сохранение
              </span>
            </div>
          </div>
        </article>

        <article className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>1. Дай задачу модели</h2>
            <p className={styles.cardDesc}>
              Напиши запрос так, как его мог бы написать реальный пользователь твоего ИИ.
            </p>
          </div>
          <div className={styles.cardBody}>
            {context ? (
              <p className={styles.classificationHint}>
                Сейчас у тебя {trainingOverview.trainingExamplesCount} примеров обучения. Помощник:{" "}
                <strong>{context.companionName}</strong>, стиль: {personalityLabelRu(context.personalityType)}.
              </p>
            ) : null}
            <label className={styles.promptLabInputWrap}>
              <span className={styles.classificationLegend}>Запрос пользователя</span>
              <textarea
                className={styles.promptLabTextarea}
                rows={5}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Например: объясни семикласснику, как проверить источник информации в интернете."
                disabled={busy}
              />
            </label>
            <div className={styles.classificationActions}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnAccent}`}
                onClick={() => void handleGenerateDraft()}
                disabled={busy || !studentEmail || !input.trim()}
              >
                {busy ? "Работаем..." : "Получить черновик ИИ"}
              </button>
              <Link to={routes.studentAiClinic} className={`${styles.btn} ${styles.btnOutline}`}>
                Открыть AI Clinic
              </Link>
            </div>
            {busy ? (
              <div className={styles.aiThinkingPanel} role="status" aria-live="polite">
                <div className={styles.aiThinkingOrb} aria-hidden />
                <div className={styles.aiThinkingCopy}>
                  <p className={styles.aiThinkingTitle}>
                    ИИ обрабатывает пример
                    <span className={styles.aiThinkingDots} aria-hidden>
                      <span />
                      <span />
                      <span />
                    </span>
                  </p>
                  <p className={styles.aiThinkingText}>
                    Сейчас модель готовит черновик или сохраняет твой исправленный пример для будущего обучения.
                  </p>
                </div>
              </div>
            ) : null}
            {!inTauri ? (
              <p className={styles.classificationHint}>
                В браузере появится демо-черновик. В настольном приложении здесь отвечает локальная модель.
              </p>
            ) : null}
          </div>
        </article>

        <article className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>2. Разбери ответ и сохрани лучший вариант</h2>
            <p className={styles.cardDesc}>
              Сильный пример обучения показывает модели, какое поведение нужно повторять.
            </p>
          </div>
          <div className={styles.cardBody}>
            {hasDraft && latestAnswer ? (
              <div className={styles.promptLabGrid}>
                <section className={styles.promptLabPanel}>
                  <p className={styles.classificationLegend}>Задача</p>
                  <p className={styles.chatTrainingWhyText}>{latestStudentMessage}</p>

                  <p className={styles.classificationLegend}>Черновик модели</p>
                  <div className={styles.chatTrainingAnswerBox}>
                    <p className={styles.chatTrainingWhyText}>{latestAnswer.aiAnswer}</p>
                  </div>
                  <p className={styles.classificationHint}>
                    {modelModeLabel(latestAnswer)} · автооценка {latestAnswer.answerQuality}/5
                  </p>
                  {latestAnswer.qualityNote ? (
                    <p className={styles.classificationHint}>{latestAnswer.qualityNote}</p>
                  ) : null}
                  {referenceAnswer.trim() ? (
                    <div className={styles.classificationOutcomeOk}>
                      <p className={styles.classificationOutcomeTitle}>Ориентир сильного ответа</p>
                      <p className={styles.chatTrainingWhyText}>{referenceAnswer}</p>
                      {referenceModelName ? (
                        <p className={styles.classificationHint}>{referenceModelName}</p>
                      ) : null}
                    </div>
                  ) : null}
                </section>

                <section className={styles.promptLabPanel}>
                  <p className={styles.classificationLegend}>Тип ошибки</p>
                  <div className={styles.chatRatingRow} role="group" aria-label="Тип ошибки в ответе">
                    {FAILURE_TAXONOMY.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`${styles.chatRatingBtn} ${
                          failureCategory === item.id ? styles.chatRatingBtnActive : ""
                        }`}
                        onClick={() => setFailureCategory(item.id)}
                        disabled={busy}
                        aria-pressed={failureCategory === item.id}
                        title={item.label}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>

                  <label className={styles.promptLabInputWrap}>
                    <span className={styles.classificationLegend}>Критика</span>
                    <textarea
                      className={styles.promptLabTextarea}
                      rows={4}
                      value={studentCritique}
                      onChange={(e) => setStudentCritique(e.target.value)}
                      placeholder="Что нужно улучшить: факты, структура, тон, точность, примеры, краткость..."
                      disabled={busy}
                    />
                  </label>

                  <p className={styles.classificationLegend} id="chat-rating-label">
                    Оценка качества
                  </p>
                  <div className={styles.chatRatingRow} role="group" aria-labelledby="chat-rating-label">
                    {RATING_SCALE.map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={`${styles.chatRatingBtn} ${studentRating === n ? styles.chatRatingBtnActive : ""}`}
                        onClick={() => setStudentRating(n)}
                        disabled={busy}
                        aria-pressed={studentRating === n}
                      >
                        {n}
                      </button>
                    ))}
                  </div>

                  <label className={styles.promptLabInputWrap}>
                    <span className={styles.classificationLegend}>Точечная правка</span>
                    <p className={styles.classificationHint}>
                      Не переписывай всё с нуля, если проблема маленькая. Покажи, какой фрагмент надо заменить и почему.
                    </p>
                    <textarea
                      className={styles.promptLabTextarea}
                      rows={3}
                      value={minimalEdit}
                      onChange={(e) => setMinimalEdit(e.target.value)}
                      placeholder="Коротко покажи, какой фрагмент нужно исправить и как."
                      disabled={busy}
                    />
                  </label>

                  <label className={styles.promptLabInputWrap}>
                    <span className={styles.classificationLegend}>Целевой ответ</span>
                    <p className={styles.classificationHint}>
                      Это версия, которой ты хочешь научить своего ИИ. Она попадёт в примеры обучения после сохранения.
                    </p>
                    <textarea
                      className={styles.promptLabTextarea}
                      rows={7}
                      value={revisedTargetAnswer}
                      onChange={(e) => setRevisedTargetAnswer(e.target.value)}
                      placeholder="Отредактируй ответ так, как модель должна отвечать в следующий раз."
                      disabled={busy}
                    />
                  </label>
                </section>
              </div>
            ) : (
              <p className={styles.classificationHint}>
                Сначала отправь запрос. После этого здесь появится черновик ответа, поля критики и целевой ответ.
              </p>
            )}

            {rowPreview ? (
              <div className={styles.classificationOutcomeOk}>
                <p className={styles.classificationOutcomeTitle}>Предпросмотр примера</p>
                {exampleQuality ? (
                  <div
                    className={`${styles.trainingQualityCard} ${
                      exampleQuality.level === "strong"
                        ? styles.trainingQualityStrong
                        : exampleQuality.level === "usable"
                          ? styles.trainingQualityUsable
                          : styles.trainingQualityWeak
                    }`}
                  >
                    <div className={styles.trainingQualityHead}>
                      <div>
                        <span className={styles.trainingQualityKicker}>Готовность примера</span>
                        <strong>{exampleQuality.label}</strong>
                      </div>
                      <span className={styles.trainingQualityScore}>{exampleQualityScore}%</span>
                    </div>
                    <div className={styles.trainingQualityBar} aria-hidden>
                      <span style={{ width: `${exampleQualityScore}%` }} />
                    </div>
                    <p className={styles.trainingQualitySummary}>{exampleQuality.summary}</p>
                    {nextMissingQualityCheck ? (
                      <p className={styles.trainingQualityNext}>
                        Что улучшить перед сохранением: <strong>{nextMissingQualityCheck}</strong>
                      </p>
                    ) : (
                      <p className={styles.trainingQualityNext}>
                        Пример выглядит готовым: его можно сохранить и потом использовать для обучения модели.
                      </p>
                    )}
                    <div className={styles.trainingQualityChecks}>
                      {exampleQuality.checks.map((check) => (
                        <span
                          key={check.label}
                          className={check.done ? styles.trainingQualityCheckDone : styles.trainingQualityCheckTodo}
                        >
                          {check.done ? "готово" : "добавь"} · {check.label}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                <p className={styles.classificationOutcomeText}>
                  Пример обучения · оценка <strong>{rowPreview.rating}/5</strong>
                  {rowPreview.modelName ? (
                    <>
                      {" "}
                      · модель <strong>{rowPreview.modelName}</strong>
                    </>
                  ) : null}
                  {rowPreview.referenceAnswer ? " · режим предпочтения" : ""}
                </p>
                <p className={styles.classificationHint}>
                  <strong>Запрос:</strong> {rowPreview.sourcePrompt}
                </p>
                <p className={styles.classificationHint}>
                  <strong>Черновик модели:</strong> {rowPreview.draftAnswer}
                </p>
                <p className={styles.classificationHint}>
                  <strong>Критика:</strong> {rowPreview.studentCritique || "Критика не добавлена"}
                </p>
                <p className={styles.classificationHint}>
                  <strong>Тип ошибки:</strong> {failureCategoryLabel(rowPreview.failureCategory)}
                </p>
                <p className={styles.classificationHint}>
                  <strong>Точечная правка:</strong> {rowPreview.minimalEdit || "Точечная правка не добавлена"}
                </p>
                {rowPreview.referenceAnswer ? (
                  <p className={styles.classificationHint}>
                    <strong>Ориентир сильного ответа:</strong> {rowPreview.referenceAnswer}
                    {rowPreview.referenceModelName ? ` · ${rowPreview.referenceModelName}` : ""}
                  </p>
                ) : null}
                <p className={styles.classificationHint} style={{ marginBottom: 0 }}>
                  <strong>Целевой ответ:</strong> {rowPreview.revisedTargetAnswer}
                </p>
              </div>
            ) : null}

            <div className={styles.classificationActions}>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnOutline}`}
                  onClick={() => void handleSaveTraining()}
                  disabled={busy || !latestAnswer || !latestStudentMessage}
                >
                  Сохранить пример обучения
                </button>
                <Link to={routes.studentTrainingManager} className={`${styles.btn} ${styles.btnOutline}`}>
                  Как он попадёт в обучение
                </Link>
            </div>

            {savedAt ? (
              <p className={styles.classificationOutcomeXp}>
                Пример сохранён: <strong>{new Date(savedAt).toLocaleString("ru-RU")}</strong>
              </p>
            ) : null}

            {error ? <p className={styles.classificationError}>{error}</p> : null}
          </div>
        </article>

        {savedAt || history.length > 0 || demoSavedCount > 0 ? (
          <article className={`${styles.card} ${styles.cardAccent}`}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Что получилось и что дальше</h2>
              <p className={styles.cardDesc}>
                Теперь у тебя есть пример обучения. Следующий шаг — собрать примеры для обучения модели,
                обучить модель и проверить результат в Compare.
              </p>
            </div>
            <div className={styles.cardBody}>
              <p className={styles.classificationHint}>
                <strong>Что ты сделал:</strong>{" "}
                {savedAt
                  ? isPreferenceMode
                    ? "сохранил пример на основе предпочтения: слабый ответ, сильный ориентир и целевой вариант."
                    : "сохранил пример с запросом, черновиком, критикой и улучшенным целевым ответом."
                  : "открыл историю примеров, которые можно использовать для дальнейшего обучения."}
              </p>
              <p className={styles.classificationHint}>
                <strong>Результат:</strong>{" "}
                {inTauri
                  ? `${trainingOverview.trainingExamplesCount} примеров обучения готово.`
                  : `в демо-режиме сохранено ${demoSavedCount} примеров.`}
              </p>
              <p className={styles.classificationHint}>
                <strong>Следующий шаг:</strong> {trainingOverview.primaryAction.description}
              </p>
              <div className={styles.classificationActions}>
                <Link to={routes.studentTrainingManager} className={`${styles.btn} ${styles.btnAccent}`}>
                  Открыть обучение модели
                </Link>
                <Link to={routes.studentAiGrowth} className={`${styles.btn} ${styles.btnOutline}`}>
                  Открыть Мой ИИ
                </Link>
              </div>
            </div>
          </article>
        ) : null}

        <article className={`${styles.card} ${styles.cardMuted}`}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>История примеров</h2>
            <p className={styles.cardDesc}>
              Последние сохранённые примеры: запрос, черновик, критика, правка и целевой ответ.
            </p>
          </div>
          <div className={styles.cardBody}>
            {historyLoading ? (
              <p className={styles.classificationHint}>Загружаем историю примеров...</p>
            ) : history.length === 0 && demoSavedCount === 0 ? (
              <p className={styles.classificationHint}>
                История пока пустая. Сохрани первый пример обучения, и он появится здесь.
              </p>
            ) : demoSavedCount > 0 ? (
              <p className={styles.classificationHint}>
                В браузерном демо-режиме сохранено примеров: {demoSavedCount}. В настольном приложении история
                сохраняется в базе ученика.
              </p>
            ) : (
              <ul className={styles.taskList}>
                {history.map((item) => {
                  const quality = buildTrainingExampleQuality({
                    sourcePrompt: item.inputPrompt,
                    draftAnswer: item.draftModelAnswer,
                    studentCritique: item.studentCritique,
                    failureCategory: item.failureCategory,
                    minimalEdit: item.minimalEdit,
                    revisedTargetAnswer: item.revisedTargetAnswer,
                    answerQuality: item.answerQuality,
                  });

                  return (
                    <li key={item.interactionId} className={styles.classificationCard}>
                        <div className={styles.classificationHeader}>
                          <div>
                            <p className={styles.classificationTitle}>Пример обучения</p>
                            <p className={styles.classificationSub}>
                              {new Date(item.createdAt).toLocaleString("ru-RU")}
                              {item.modelName ? ` · ${item.modelName}` : ""}
                              {item.answerQuality > 0 ? ` · оценка ${item.answerQuality}/5` : ""}
                              {item.failureCategory ? ` · ${failureCategoryLabel(item.failureCategory)}` : ""}
                              {item.referenceAnswer ? " · предпочтение" : ""}
                            </p>
                          </div>
                          <span className={styles.classificationBadge}>
                            {item.referenceAnswer ? "предпочтение" : "пример"}
                          </span>
                        </div>
                        <p className={styles.classificationHint}>
                          <strong>Качество:</strong> {quality.label}
                        </p>
                        <p className={styles.classificationHint}>
                          <strong>Запрос:</strong> {item.inputPrompt}
                        </p>
                        <p className={styles.classificationHint}>
                          <strong>Черновик модели:</strong> {item.draftModelAnswer}
                        </p>
                        <p className={styles.classificationHint}>
                          <strong>Критика:</strong> {item.studentCritique || "Критика не была добавлена"}
                        </p>
                        <p className={styles.classificationHint}>
                          <strong>Тип ошибки:</strong>{" "}
                          {item.failureCategory ? failureCategoryLabel(item.failureCategory) : "Не указан"}
                        </p>
                        <p className={styles.classificationHint}>
                          <strong>Точечная правка:</strong> {item.minimalEdit || "Не добавлена"}
                        </p>
                      {item.referenceAnswer ? (
                        <p className={styles.classificationHint}>
                          <strong>Ориентир сильного ответа:</strong> {item.referenceAnswer}
                          {item.referenceModelName ? ` · ${item.referenceModelName}` : ""}
                        </p>
                        ) : null}
                        <p className={styles.classificationHint} style={{ marginBottom: 0 }}>
                          <strong>Целевой ответ:</strong> {item.revisedTargetAnswer}
                        </p>
                      </li>
                    );
                })}
              </ul>
            )}
          </div>
        </article>
      </div>
    </div>
  );
}
