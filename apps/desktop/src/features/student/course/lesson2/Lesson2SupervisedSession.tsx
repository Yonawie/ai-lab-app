import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
  fetchStudentArtifactSummary,
  type StudentArtifactSummary,
} from "@/shared/artifact-ledger-tauri";
import {
  buildTrainingPipelineStages,
  fetchStudentTrainingPipelineStatus,
  type StudentTrainingPipelineStatus,
} from "@/shared/training-pipeline-tauri";
import { routes } from "@/shared/routes";
import type { Lesson, LessonSectionType } from "../training-course-model";
import type courseCss from "../../StudentCourse.module.css";
import l2 from "./Lesson2Supervised.module.css";

type Props = {
  lesson: Lesson;
  courseStyles: typeof courseCss;
  sectionCardClass: (t: LessonSectionType) => string;
  done: boolean;
  onMarkComplete: () => void;
  studentEmail?: string;
};

type StarterExample = {
  id: string;
  title: string;
  teachingGoal: string;
  prompt: string;
  whyBetter: string;
};

const REQUIRED_EXAMPLES = 3;

const INTRO_PHASES = [
  {
    key: "p1",
    body:
      "Обучение с учителем в AI Lab начинается с качественного примера: запрос пользователя и хороший целевой ответ, который модель должна научиться повторять.",
  },
  {
    key: "p2",
    body:
      "Сначала ты запускаешь реальную модель и смотришь ее черновик. Затем объясняешь, что в нем слабое, и переписываешь ответ в полезную целевую версию.",
  },
  {
    key: "p3",
    body:
      "Сохраненный пример становится частью набора данных. Потом эти данные можно подготовить в зоне «Тренируем», обучить модель и проверить результат в Compare и Arena.",
  },
];

const STARTER_EXAMPLES: StarterExample[] = [
  {
    id: "homework-plan",
    title: "План подготовки",
    teachingGoal: "Научить модель давать спокойный и структурированный учебный план.",
    prompt:
      "Помоги мне подготовиться к контрольной по истории за 2 дня. Я паникую и не знаю, с чего начать.",
    whyBetter:
      "Сильный ответ должен дать шаги, приоритеты, короткий план и уважительный тон без воды.",
  },
  {
    id: "math-explanation",
    title: "Объяснение решения",
    teachingGoal: "Научить модель объяснять решение понятно, по шагам и без скачков.",
    prompt:
      "Объясни, как решить уравнение 3x + 5 = 20 так, чтобы понял ученик 6 класса.",
    whyBetter:
      "Целевой ответ должен показать ход решения последовательно и простым языком.",
  },
  {
    id: "feedback-message",
    title: "Полезная обратная связь",
    teachingGoal: "Научить модель давать поддерживающую и применимую обратную связь.",
    prompt:
      "Я написал сочинение, но учитель сказал, что аргументы слабые. Помоги понять, как улучшить текст.",
    whyBetter:
      "Сильный ответ объясняет, что именно улучшить, и дает практические шаги вместо сухой оценки.",
  },
];

function countOf(summary: StudentArtifactSummary | null, key: string): number {
  return summary?.countsByType?.[key] ?? 0;
}

function qualityLabel(value: number): string {
  if (value >= 5) return "Сильный пример";
  if (value >= 4) return "Хороший пример";
  if (value >= 3) return "Рабочий пример";
  if (value >= 2) return "Слабый пример";
  return "Лучше доработать перед сохранением";
}

function formatWhen(value: string): string {
  if (!value) return "только что";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function savedResultLabel(type: string): string {
  if (type === "chat_training_saved") return "пример обучения";
  return "сохраненный результат";
}

export function Lesson2SupervisedSession({
  lesson,
  courseStyles: cs,
  sectionCardClass,
  done,
  onMarkComplete,
  studentEmail = "",
}: Props) {
  const student = studentEmail.trim();
  const inTauri = isTauri();

  const [introStep, setIntroStep] = useState(0);
  const [selectedStarterId, setSelectedStarterId] = useState<string>(STARTER_EXAMPLES[0].id);
  const [promptDraft, setPromptDraft] = useState(STARTER_EXAMPLES[0].prompt);
  const [currentAnswer, setCurrentAnswer] = useState<ChatTrainingAnswer | null>(null);
  const [currentPrompt, setCurrentPrompt] = useState("");
  const [studentCritique, setStudentCritique] = useState("");
  const [revisedTargetAnswer, setRevisedTargetAnswer] = useState("");
  const [answerQuality, setAnswerQuality] = useState(4);
  const [busy, setBusy] = useState<"generate" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const [context, setContext] = useState<ChatTrainingContext | null>(null);
  const [history, setHistory] = useState<ChatTrainingHistoryItem[]>([]);
  const [artifactSummary, setArtifactSummary] = useState<StudentArtifactSummary | null>(null);
  const [trainingStatus, setTrainingStatus] = useState<StudentTrainingPipelineStatus | null>(null);

  const selectedStarter = useMemo(
    () => STARTER_EXAMPLES.find((item) => item.id === selectedStarterId) ?? STARTER_EXAMPLES[0],
    [selectedStarterId],
  );

  const refreshLabData = useCallback(async () => {
    if (!student || !inTauri) {
      setContext(null);
      setHistory([]);
      setArtifactSummary(null);
      setTrainingStatus(null);
      return;
    }

    const [nextContext, nextHistory, nextSummary, nextStatus] = await Promise.all([
      fetchChatTrainingContext(student),
      fetchChatTrainingHistory(student, 6),
      fetchStudentArtifactSummary(student),
      fetchStudentTrainingPipelineStatus(student),
    ]);

    setContext(nextContext);
    setHistory(nextHistory);
    setArtifactSummary(nextSummary);
    setTrainingStatus(nextStatus);
  }, [inTauri, student]);

  useEffect(() => {
    void refreshLabData().catch(() => {
      setContext(null);
      setHistory([]);
      setArtifactSummary(null);
      setTrainingStatus(null);
    });
  }, [refreshLabData]);

  const rowPreview = useMemo(() => {
    if (!currentAnswer || !currentPrompt.trim()) return null;
    return buildChatTrainingRowPreview({
      studentMessage: currentPrompt,
      aiAnswer: currentAnswer.aiAnswer,
      studentCritique,
      failureCategory: "too_generic",
      revisedTargetAnswer,
      answerQuality,
      modelName: currentAnswer.modelName,
    });
  }, [answerQuality, currentAnswer, currentPrompt, revisedTargetAnswer, studentCritique]);

  const chatTrainingSavedCount = countOf(artifactSummary, "chat_training_saved");
  const datasetExampleCount = countOf(artifactSummary, "dataset_example_added");
  const missionExamplesCreated = Math.max(
    chatTrainingSavedCount,
    datasetExampleCount,
    history.length,
    trainingStatus?.chatTrainingInteractionCount ?? 0,
  );
  const proofReady =
    chatTrainingSavedCount >= REQUIRED_EXAMPLES && datasetExampleCount >= REQUIRED_EXAMPLES;
  const fallbackReady = missionExamplesCreated >= REQUIRED_EXAMPLES;
  const canFinishLesson = proofReady || fallbackReady;
  const total = lesson.sections.length;
  const stages = buildTrainingPipelineStages(trainingStatus);

  async function runModel() {
    if (!student || !inTauri) return;
    const trimmed = promptDraft.trim();
    if (!trimmed) return;

    setBusy("generate");
    setError(null);
    setSavedAt(null);

    try {
      const answer = await generateChatTrainingAnswer(student, trimmed);
      setCurrentPrompt(trimmed);
      setCurrentAnswer(answer);
      setStudentCritique("");
      setRevisedTargetAnswer(answer.aiAnswer);
      setAnswerQuality(Math.max(1, Math.min(5, answer.answerQuality || 4)));
    } catch {
      setError("ИИ временно недоступен. Попробуй еще раз чуть позже.");
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveExample() {
    if (!student || !inTauri || !currentAnswer || !currentPrompt.trim()) return;

    setBusy("save");
    setError(null);

    try {
      const saved = await saveChatTrainingInteraction({
        studentEmail: student,
        studentMessage: currentPrompt,
        aiAnswer: currentAnswer.aiAnswer,
        answerQuality,
        studentCritique,
        revisedTargetAnswer,
        modelName: currentAnswer.modelName,
      });
      setSavedAt(saved.createdAt);
      await refreshLabData();
    } catch {
      setError("Не удалось сохранить пример. Проверь приложение и попробуй снова.");
    } finally {
      setBusy(null);
    }
  }

  function applyStarter(example: StarterExample) {
    setSelectedStarterId(example.id);
    setPromptDraft(example.prompt);
    setError(null);
  }

  return (
    <>
      <div className={cs.sectionsStack}>
        {lesson.sections.map((section, index) => {
          const head = (
            <div className={cs.sectionHead}>
              <h2 id={`heading-${section.id}`} className={cs.sectionTitle}>
                {section.title}
              </h2>
              <span className={cs.sectionStep}>Шаг {index + 1}/{total}</span>
            </div>
          );

          if (section.type === "intro") {
            return (
              <article
                key={section.id}
                id={`section-${section.id}`}
                className={sectionCardClass("intro")}
                aria-labelledby={`heading-${section.id}`}
              >
                {head}
                <p className={cs.sectionBody}>{section.content}</p>
                <div className={l2.l2Block}>
                  {introStep === 0 ? (
                    <div className={l2.l2Cinematic}>
                      <p className={l2.l2Overline}>Миссия 2 · Примеры обучения</p>
                      <h3 className={l2.l2Title}>Создай данные, на которых будет учиться твой ИИ</h3>
                      <p className={l2.l2Narrative}>
                        Сценарий простой: получить слабый черновик, найти проблему, написать лучший ответ и
                        сохранить его как пример для обучения твоего ИИ.
                      </p>
                      <div className={l2.missionGrid}>
                        <div className={l2.missionCard}>
                          <strong>Что ты учишь модель делать</strong>
                          <span>{selectedStarter.teachingGoal}</span>
                        </div>
                        <div className={l2.missionCard}>
                          <strong>Главная миссия</strong>
                          <span>Создай {REQUIRED_EXAMPLES} качественных примера обучения.</span>
                        </div>
                        <div className={l2.missionCard}>
                          <strong>Что появится</strong>
                          <span>Сохраненные примеры, которые можно использовать для обучения модели.</span>
                        </div>
                        <div className={l2.missionCard}>
                          <strong>Что дальше</strong>
                          <span>Подготовка данных, обучение модели, включение и проверка результата.</span>
                        </div>
                      </div>
                      <div className={l2.l2BtnRow}>
                        <button type="button" className={l2.btnPrimary} onClick={() => setIntroStep(1)}>
                          Начать миссию
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {INTRO_PHASES.slice(0, Math.min(introStep, INTRO_PHASES.length)).map((item) => (
                        <div key={item.key} className={l2.l2Cinematic}>
                          <p className={l2.l2Narrative}>{item.body}</p>
                        </div>
                      ))}
                      {introStep > INTRO_PHASES.length ? (
                        <div className={l2.engineerPanel}>
                          <p className={l2.engineerEyebrow}>Миссия</p>
                          <h4 className={l2.engineerTitle}>Собери реальные примеры обучения</h4>
                          <p className={l2.engineerLead}>
                            Миссия засчитывается не за просмотр страницы, а за сохранённые примеры:
                            запрос, слабое место и лучший ответ.
                          </p>
                          <div className={l2.dataGrid}>
                            <div className={l2.dataCell}>
                              <span className={l2.dataCellValue}>{chatTrainingSavedCount}</span>
                              <span className={l2.dataCellLabel}>Сохранено в чате</span>
                            </div>
                            <div className={l2.dataCell}>
                              <span className={l2.dataCellValue}>{datasetExampleCount}</span>
                              <span className={l2.dataCellLabel}>Готово для данных</span>
                            </div>
                            <div className={l2.dataCell}>
                              <span className={l2.dataCellValue}>{trainingStatus?.datasetSize ?? 0}</span>
                              <span className={l2.dataCellLabel}>Всего примеров</span>
                            </div>
                            <div className={l2.dataCell}>
                              <span className={l2.dataCellValue}>
                                {trainingStatus?.usingTrainedModel ? "Да" : "Нет"}
                              </span>
                              <span className={l2.dataCellLabel}>Модель включена</span>
                            </div>
                          </div>
                        </div>
                      ) : null}
                      <div className={l2.l2BtnRow}>
                        <button
                          type="button"
                          className={l2.btnPrimary}
                          onClick={() => setIntroStep((value) => value + 1)}
                        >
                          {introStep > INTRO_PHASES.length ? "Миссия понятна" : "Дальше"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </article>
            );
          }

          if (section.type === "gameplay") {
            return (
              <article
                key={section.id}
                id={`section-${section.id}`}
                className={sectionCardClass("gameplay")}
                aria-labelledby={`heading-${section.id}`}
              >
                {head}
                <p className={cs.sectionBody}>{section.content}</p>
                <div className={l2.trainingWorkspace}>
                  <div className={l2.trainingHud}>
                    <span className={l2.hudPill}>
                      Миссия: <strong className={l2.hudAccent}>{missionExamplesCreated}/{REQUIRED_EXAMPLES}</strong>
                    </span>
                    <span className={l2.hudPill}>
                      Сохранено: <strong className={l2.hudAccent}>{chatTrainingSavedCount}</strong>
                    </span>
                    <span className={l2.hudPill}>
                      Готово для обучения: <strong className={l2.hudAccent}>{datasetExampleCount}</strong>
                    </span>
                  </div>

                  <div className={l2.sectionMission}>
                    <strong>Главный реальный workflow</strong>
                    <span>
                      1. Задай запрос. 2. Получи черновик модели. 3. Напиши критику. 4. Создай целевой ответ.
                      5. Сохрани пример обучения.
                    </span>
                  </div>

                  <div className={l2.starterGrid}>
                    {STARTER_EXAMPLES.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`${l2.starterCard} ${item.id === selectedStarterId ? l2.starterCardActive : ""}`}
                        onClick={() => applyStarter(item)}
                      >
                        <strong>{item.title}</strong>
                        <span>{item.teachingGoal}</span>
                      </button>
                    ))}
                  </div>

                  <label className={l2.fieldLabel} htmlFor="l2-prompt-input">
                    Что модель должна научиться делать
                  </label>
                  <textarea
                    id="l2-prompt-input"
                    className={l2.textarea}
                    rows={5}
                    value={promptDraft}
                    onChange={(event) => setPromptDraft(event.target.value)}
                    placeholder="Опиши реальную задачу для модели"
                  />
                  <p className={l2.completeHintWarn}>{selectedStarter.whyBetter}</p>

                  <div className={l2.l2BtnRow}>
                    <button
                      type="button"
                      className={l2.btnPrimary}
                      onClick={() => void runModel()}
                      disabled={!inTauri || !student || busy === "generate"}
                    >
                      {busy === "generate" ? "Запускаю модель..." : "Получить черновик ИИ"}
                    </button>
                    <Link to={routes.studentChatTraining} className={l2.linkCta}>
                      Открыть полную страницу примеров
                    </Link>
                  </div>

                  {error ? <p className={l2.hintErr}>{error}</p> : null}

                  {currentAnswer ? (
                    <div className={l2.resultGrid}>
                      <div className={l2.resultCard}>
                        <p className={l2.aiPanelLabel}>Черновой ответ модели</p>
                        <p className={l2.l2Narrative}>{currentAnswer.aiAnswer}</p>
                        <p className={l2.l2Narrative} style={{ fontSize: "0.82rem" }}>
                          <strong>Запрос:</strong> {currentPrompt}
                        </p>
                        <p className={l2.l2Narrative} style={{ fontSize: "0.82rem" }}>
                          <strong>Модель:</strong> {currentAnswer.modelName || "локальная базовая модель"} ·{" "}
                          {currentAnswer.usingTrainedModel ? "обученная модель ученика" : "базовая локальная модель"}
                        </p>
                      </div>

                      <div className={l2.resultCard}>
                        <p className={l2.aiPanelLabel}>Критика и исправление</p>
                        <label className={l2.fieldLabel} htmlFor="l2-critique">
                          Почему этот ответ слабый или неполный
                        </label>
                        <textarea
                          id="l2-critique"
                          className={l2.textarea}
                          rows={4}
                          value={studentCritique}
                          onChange={(event) => setStudentCritique(event.target.value)}
                          placeholder="Например: ответ слишком общий, нет структуры, пропущены шаги..."
                        />
                        <label className={l2.fieldLabel} htmlFor="l2-target">
                          Целевой ответ
                        </label>
                        <textarea
                          id="l2-target"
                          className={l2.textarea}
                          rows={6}
                          value={revisedTargetAnswer}
                          onChange={(event) => setRevisedTargetAnswer(event.target.value)}
                          placeholder="Перепиши ответ так, как модель должна отвечать после обучения"
                        />
                        <label className={l2.fieldLabel}>Качество примера</label>
                        <div className={l2.ratingRow}>
                          {[1, 2, 3, 4, 5].map((value) => (
                            <button
                              key={value}
                              type="button"
                              className={`${l2.ratingBtn} ${answerQuality === value ? l2.ratingBtnActive : ""}`}
                              onClick={() => setAnswerQuality(value)}
                            >
                              {value}
                            </button>
                          ))}
                        </div>
                        <p className={l2.completeHintWarn}>{qualityLabel(answerQuality)}</p>
                      </div>
                    </div>
                  ) : null}

                  {rowPreview ? (
                    <div className={l2.engineerPanel}>
                      <p className={l2.engineerEyebrow}>Предпросмотр примера</p>
                      <h4 className={l2.engineerTitle}>Что будет сохранено для обучения</h4>
                      <ul className={l2.summaryList}>
                        <li>
                          <strong>Запрос:</strong> {rowPreview.sourcePrompt}
                        </li>
                        <li>
                          <strong>Черновик модели:</strong> {rowPreview.draftAnswer}
                        </li>
                        <li>
                          <strong>Критика:</strong> {rowPreview.studentCritique || "не добавлена"}
                        </li>
                        <li>
                          <strong>Целевой ответ:</strong> {rowPreview.revisedTargetAnswer}
                        </li>
                        <li>
                          <strong>Результат:</strong> {savedResultLabel(rowPreview.savesArtifactType)}
                        </li>
                      </ul>
                      <div className={l2.l2BtnRow}>
                        <button
                          type="button"
                          className={l2.btnPrimary}
                          onClick={() => void handleSaveExample()}
                          disabled={busy === "save" || !revisedTargetAnswer.trim()}
                        >
                          {busy === "save" ? "Сохраняю пример..." : "Сохранить пример обучения"}
                        </button>
                      </div>
                      {savedAt ? (
                        <p className={`${l2.feedback} ${l2.feedbackOk}`}>
                          Пример сохранен {formatWhen(savedAt)}. Он стал результатом урока и доступен для обучения модели.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          }

          if (section.type === "lab") {
            return (
              <article
                key={section.id}
                id={`section-${section.id}`}
                className={sectionCardClass("lab")}
                aria-labelledby={`heading-${section.id}`}
              >
                {head}
                <p className={cs.sectionBody}>{section.content}</p>
                <div className={l2.engineerPanel}>
                  <p className={l2.engineerEyebrow}>Качество данных</p>
                  <h4 className={l2.engineerTitle}>Почему целевой ответ важнее угадывания</h4>
                  <ul className={l2.summaryList}>
                    <li>Хороший пример показывает модели, какой ответ нужен на конкретный запрос.</li>
                    <li>Критика объясняет, почему черновик был слабым и что нужно исправить.</li>
                    <li>Целевой ответ помогает собрать полезные пары “запрос - хороший ответ”.</li>
                    <li>Чем чище примеры, тем осмысленнее проверка в Compare и Arena после обучения.</li>
                  </ul>
                </div>

                <div className={l2.resultGrid}>
                  <div className={l2.resultCard}>
                    <p className={l2.aiPanelLabel}>История последних примеров</p>
                    {history.length === 0 ? (
                      <p className={l2.l2Narrative}>
                        Пока нет сохраненных примеров. Создай первый пример обучения в блоке выше.
                      </p>
                    ) : (
                      <div className={l2.historyList}>
                        {history.map((item) => (
                          <div key={item.interactionId} className={l2.historyCard}>
                            <p className={l2.demoKind}>{formatWhen(item.createdAt)}</p>
                            <p className={l2.l2Narrative}>
                              <strong>Запрос:</strong> {item.inputPrompt}
                            </p>
                            <p className={l2.l2Narrative}>
                              <strong>Черновик:</strong> {item.draftModelAnswer}
                            </p>
                            <p className={l2.l2Narrative}>
                              <strong>Критика:</strong> {item.studentCritique || "не добавлена"}
                            </p>
                            <p className={l2.l2Narrative}>
                              <strong>Целевой ответ:</strong> {item.revisedTargetAnswer || item.draftModelAnswer}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className={l2.resultCard}>
                    <p className={l2.aiPanelLabel}>Что уже сохранено</p>
                    <div className={l2.dataGrid}>
                      <div className={l2.dataCell}>
                        <span className={l2.dataCellValue}>{chatTrainingSavedCount}</span>
                        <span className={l2.dataCellLabel}>Примеры в чате</span>
                      </div>
                      <div className={l2.dataCell}>
                        <span className={l2.dataCellValue}>{datasetExampleCount}</span>
                        <span className={l2.dataCellLabel}>Готово для обучения</span>
                      </div>
                      <div className={l2.dataCell}>
                        <span className={l2.dataCellValue}>{trainingStatus?.exportAvailable ? "Да" : "Нет"}</span>
                        <span className={l2.dataCellLabel}>Данные подготовлены</span>
                      </div>
                      <div className={l2.dataCell}>
                        <span className={l2.dataCellValue}>{trainingStatus?.chatTrainingInteractionCount ?? 0}</span>
                        <span className={l2.dataCellLabel}>Всего примеров</span>
                      </div>
                    </div>
                    <p className={l2.feedback}>
                      После сохранения примеры не остаются только внутри урока: они доступны на странице примеров
                      обучения и могут быть использованы в зоне «Тренируем».
                    </p>
                  </div>
                </div>
              </article>
            );
          }

          if (section.type === "summary") {
            return (
              <article
                key={section.id}
                id={`section-${section.id}`}
                className={sectionCardClass("summary")}
                aria-labelledby={`heading-${section.id}`}
              >
                {head}
                <p className={cs.sectionBody}>{section.content}</p>
                <div className={l2.summaryHero}>
                  <p className={l2.summaryTitle}>Что происходит с твоими примерами дальше</p>
                  <p className={l2.l2Narrative}>
                    Этот урок связан с процессом обучения. Сначала ты создаешь качественные примеры,
                     потом собираешь их в зоне «Тренируем», обучаешь модель, включаешь новую версию и
                    проверяешь, улучшилось ли поведение в Compare и Arena.
                  </p>
                </div>
                <div className={l2.stageList}>
                  {stages.map((stage) => (
                    <div key={stage.id} className={`${l2.stageItem} ${stage.done ? l2.stageItemDone : ""}`}>
                      <strong>{stage.title}</strong>
                      <span>{stage.detail}</span>
                    </div>
                  ))}
                </div>
                <div className={l2.linkRow}>
                  <Link to={routes.studentChatTraining} className={l2.linkCta}>
                    Продолжить примеры обучения
                  </Link>
                  <Link to={routes.studentTrain} className={l2.linkCta}>
                    Открыть «Тренируем»
                  </Link>
                </div>
                {context ? (
                  <p className={l2.feedback}>
                    Сейчас у помощника <strong>{context.companionName}</strong> сохранено{" "}
                    <strong>{context.datasetSize}</strong> примеров. Точность по текущей сводке:{" "}
                    <strong>{Math.round(context.modelAccuracy)}</strong>.
                  </p>
                ) : null}
              </article>
            );
          }

          if (section.type === "challenge") {
            return (
              <article
                key={section.id}
                id={`section-${section.id}`}
                className={sectionCardClass("challenge")}
                aria-labelledby={`heading-${section.id}`}
              >
                {head}
                <p className={cs.sectionBody}>{section.content}</p>
                <div className={l2.engineerPanel}>
                  <p className={l2.engineerEyebrow}>Миссия урока</p>
                  <h4 className={l2.engineerTitle}>Создай {REQUIRED_EXAMPLES} качественных примера обучения</h4>
                  <p className={l2.engineerLead}>
                    Урок завершен по-настоящему, когда у тебя есть сохраненные результаты. Нужно не просто
                    посмотреть на ответ модели, а сохранить исправленные примеры для дальнейшего обучения.
                  </p>
                  <div className={l2.progressTrack}>
                    <div
                      className={l2.progressFill}
                      style={{ width: `${Math.min(100, (missionExamplesCreated / REQUIRED_EXAMPLES) * 100)}%` }}
                    />
                  </div>
                  <ul className={l2.summaryList}>
                    <li>
                      <strong>Что ты сделал:</strong> создал {missionExamplesCreated} из {REQUIRED_EXAMPLES} нужных
                      примеров.
                    </li>
                    <li>
                      <strong>Какой пример ты создал:</strong> запрос, черновик модели, критика и целевой ответ.
                    </li>
                    <li>
                      <strong>Почему целевой ответ лучше:</strong> он задает модели точный полезный ориентир вместо
                      размытого черновика.
                    </li>
                    <li>
                      <strong>Что дальше:</strong> подготовить данные, обучить модель, включить ее и проверить результат.
                    </li>
                  </ul>
                </div>
              </article>
            );
          }

          return null;
        })}
      </div>

      <div className={cs.sectionCard}>
        <div className={cs.completeRow}>
          <button
            type="button"
            className={cs.btnComplete}
            onClick={onMarkComplete}
            disabled={done || !canFinishLesson}
          >
            {done ? "Миссия отмечена пройденной" : "Завершить миссию"}
          </button>
          <p className={l2.completeHintWarn}>
            {canFinishLesson
              ? "Есть реальные результаты: миссию можно закрыть."
              : `Сначала создай ${REQUIRED_EXAMPLES} качественных примера обучения. Сейчас готово ${missionExamplesCreated}/${REQUIRED_EXAMPLES}.`}
          </p>
        </div>
        <p className={cs.completeHint}>
          Прогресс миссии сохраняется для совместимости, но главным результатом здесь считаются реальные
          сохраненные примеры ученика.
        </p>
      </div>
    </>
  );
}
