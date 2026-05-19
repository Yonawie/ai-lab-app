import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  buildChatTrainingRowPreview,
  fetchChatTrainingHistory,
  generateChatTrainingAnswer,
  saveChatTrainingInteraction,
  type ChatTrainingAnswer,
  type ChatTrainingHistoryItem,
} from "@/shared/chat-training-tauri";
import {
  fetchStudentArtifactSummary,
  type StudentArtifactSummary,
} from "@/shared/artifact-ledger-tauri";
import { routes } from "@/shared/routes";
import { studentArenaScreenPath } from "../../student-surface-paths";
import type { Lesson, LessonSectionType } from "../training-course-model";
import type courseCss from "../../StudentCourse.module.css";
import l4 from "./Lesson4Rl.module.css";

type Props = {
  lesson: Lesson;
  courseStyles: typeof courseCss;
  sectionCardClass: (t: LessonSectionType) => string;
  done: boolean;
  onMarkComplete: () => void;
  studentEmail?: string;
};

type FeedbackMission = {
  id: string;
  title: string;
  behaviorGoal: string;
  prompt: string;
  strongFeedbackHint: string;
  weakFeedbackHint: string;
};

const INTRO_PHASES = [
  {
    key: "p1",
    body:
      "Работа с обратной связью — это способ показать модели, какое поведение нужно улучшить: ясность, структуру, тон, безопасность или устойчивость ответа.",
  },
  {
    key: "p2",
    body:
      "Цикл простой: модель отвечает, ты называешь слабое место, задаешь лучший целевой ответ и затем проверяешь, изменилось ли поведение в Compare и Arena.",
  },
  {
    key: "p3",
    body:
      "Слабая обратная связь звучит как “плохо”. Сильная объясняет, что именно изменить и как должен выглядеть лучший ответ.",
  },
];

const INTRO_MAX = INTRO_PHASES.length + 1;
const REQUIRED_CHAT_ROWS = 2;
const REQUIRED_COMPARE_RUNS = 1;
const REQUIRED_BENCHMARK_RUNS = 1;

const FEEDBACK_MISSIONS: FeedbackMission[] = [
  {
    id: "clarity",
    title: "Ясность и структура",
    behaviorGoal: "Научить модель отвечать короче, понятнее и с явными шагами.",
    prompt:
      "Объясни, как исправить ошибку в проекте, но так, чтобы ученик не потерялся и понял первый шаг.",
    strongFeedbackHint:
      "Сильная обратная связь указывает, что ответу не хватает структуры, порядка шагов и понятного языка.",
    weakFeedbackHint:
      "Слабая обратная связь звучит как “ответ не очень” и не объясняет, что значит “лучше”.",
  },
  {
    id: "safety",
    title: "Безопасное поведение",
    behaviorGoal: "Научить модель останавливать рискованные действия и предлагать безопасную альтернативу.",
    prompt:
      "Сделай это быстро и без лишних вопросов: удали все старые данные и сразу перезапиши систему.",
    strongFeedbackHint:
      "Сильная обратная связь показывает, что риск нужно остановить, объяснить причину и перевести запрос в безопасный сценарий.",
    weakFeedbackHint:
      "Слабая обратная связь ругает ответ эмоционально, но не задает модели новую рабочую рамку.",
  },
  {
    id: "support",
    title: "Поддерживающий тон",
    behaviorGoal: "Научить модель отвечать спокойно и полезно, если пользователь растерян или раздражен.",
    prompt:
      "Я уже устал, ничего не понимаю и, кажется, снова все испортил. Просто скажи, что мне делать дальше.",
    strongFeedbackHint:
      "Сильная обратная связь фиксирует эмпатию, спокойный тон и конкретный следующий шаг.",
    weakFeedbackHint:
      "Слабая обратная связь оценивает ответ как “добрый” или “злой”, но не говорит, какое поведение должно повторяться.",
  },
];

function countOf(summary: StudentArtifactSummary | null, key: string): number {
  return summary?.countsByType?.[key] ?? 0;
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

function feedbackStrength(critique: string, revisedTargetAnswer: string): "strong" | "weak" {
  const critiqueWords = critique.trim().split(/\s+/).filter(Boolean).length;
  const revisedWords = revisedTargetAnswer.trim().split(/\s+/).filter(Boolean).length;
  if (critiqueWords >= 8 && revisedWords >= 15) return "strong";
  return "weak";
}

export function Lesson4RlSession({
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
  const [selectedMissionId, setSelectedMissionId] = useState(FEEDBACK_MISSIONS[0].id);
  const [prompt, setPrompt] = useState(FEEDBACK_MISSIONS[0].prompt);
  const [currentAnswer, setCurrentAnswer] = useState<ChatTrainingAnswer | null>(null);
  const [currentPrompt, setCurrentPrompt] = useState("");
  const [critique, setCritique] = useState("");
  const [revisedTargetAnswer, setRevisedTargetAnswer] = useState("");
  const [busy, setBusy] = useState<"generate" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [history, setHistory] = useState<ChatTrainingHistoryItem[]>([]);
  const [artifactSummary, setArtifactSummary] = useState<StudentArtifactSummary | null>(null);

  const selectedMission = useMemo(
    () => FEEDBACK_MISSIONS.find((item) => item.id === selectedMissionId) ?? FEEDBACK_MISSIONS[0],
    [selectedMissionId],
  );

  const refreshData = useCallback(async () => {
    if (!student || !inTauri) {
      setHistory([]);
      setArtifactSummary(null);
      return;
    }

    const [nextHistory, nextSummary] = await Promise.all([
      fetchChatTrainingHistory(student, 6),
      fetchStudentArtifactSummary(student),
    ]);
    setHistory(nextHistory);
    setArtifactSummary(nextSummary);
  }, [inTauri, student]);

  useEffect(() => {
    void refreshData().catch(() => {
      setHistory([]);
      setArtifactSummary(null);
    });
  }, [refreshData]);

  const chatRows = countOf(artifactSummary, "chat_training_saved");
  const compareRuns = countOf(artifactSummary, "compare_run_completed");
  const benchmarkRuns = countOf(artifactSummary, "benchmark_eval_completed");
  const localFeedbackExamples = Math.max(chatRows, history.length);
  const realLoopReady =
    localFeedbackExamples >= REQUIRED_CHAT_ROWS &&
    compareRuns >= REQUIRED_COMPARE_RUNS &&
    benchmarkRuns >= REQUIRED_BENCHMARK_RUNS;
  const basicLoopReady = localFeedbackExamples >= REQUIRED_CHAT_ROWS && benchmarkRuns >= REQUIRED_BENCHMARK_RUNS;
  const canFinishLesson = realLoopReady || basicLoopReady;
  const total = lesson.sections.length;
  const strength = feedbackStrength(critique, revisedTargetAnswer);

  const rowPreview = useMemo(() => {
    if (!currentAnswer || !currentPrompt.trim()) return null;
    return buildChatTrainingRowPreview({
      studentMessage: currentPrompt,
      aiAnswer: currentAnswer.aiAnswer,
      studentCritique: critique,
      failureCategory: selectedMission.id,
      revisedTargetAnswer,
      answerQuality: strength === "strong" ? 5 : 3,
      modelName: currentAnswer.modelName,
    });
  }, [critique, currentAnswer, currentPrompt, revisedTargetAnswer, selectedMission.id, strength]);

  async function runModel() {
    if (!student || !inTauri || !prompt.trim()) return;
    setBusy("generate");
    setError(null);
    setSavedAt(null);

    try {
      const answer = await generateChatTrainingAnswer(student, prompt.trim());
      setCurrentPrompt(prompt.trim());
      setCurrentAnswer(answer);
      setCritique("");
      setRevisedTargetAnswer(answer.aiAnswer);
    } catch {
      setError("ИИ временно недоступен. Попробуй еще раз чуть позже.");
    } finally {
      setBusy(null);
    }
  }

  async function handleSave() {
    if (!student || !inTauri || !currentAnswer || !currentPrompt.trim()) return;
    setBusy("save");
    setError(null);

    try {
      const saved = await saveChatTrainingInteraction({
        studentEmail: student,
        studentMessage: currentPrompt,
        aiAnswer: currentAnswer.aiAnswer,
        answerQuality: strength === "strong" ? 5 : 3,
        studentCritique: critique,
        failureCategory: selectedMission.id,
        revisedTargetAnswer,
        modelName: currentAnswer.modelName,
      });
      setSavedAt(saved.createdAt);
      await refreshData();
    } catch {
      setError("Не удалось сохранить пример. Проверь приложение и попробуй снова.");
    } finally {
      setBusy(null);
    }
  }

  function applyMission(mission: FeedbackMission) {
    setSelectedMissionId(mission.id);
    setPrompt(mission.prompt);
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
                <div className={l4.l4Block}>
                  {introStep === 0 ? (
                    <div className={l4.l4Cinematic}>
                      <p className={l4.l4Overline}>Миссия 4 · feedback и предпочтения</p>
                      <h3 className={l4.l4Title}>Сделай обратную связь измеримой</h3>
                      <p className={l4.l4Narrative}>
                        Ты не ставишь абстрактную оценку. Ты создаёшь понятный сигнал:
                        какой ответ лучше, почему он лучше и какое поведение модель должна повторять.
                      </p>
                      <p className={l4.l4Narrative}>
                        Маршрут: поймай слабый ответ → объясни ошибку → напиши лучший вариант → проверь
                        изменение в Compare и устойчивость в Arena.
                      </p>
                      <div className={l4.missionGrid}>
                        <div className={l4.missionCard}>
                          <strong>Что улучшаем</strong>
                          <span>{selectedMission.behaviorGoal}</span>
                        </div>
                        <div className={l4.missionCard}>
                          <strong>Что нужно создать</strong>
                          <span>{REQUIRED_CHAT_ROWS} корректирующих примера и проверки в Compare/Arena.</span>
                        </div>
                        <div className={l4.missionCard}>
                          <strong>Где создается обратная связь</strong>
                          <span>В примерах обучения: черновик, критика и лучший целевой ответ.</span>
                        </div>
                        <div className={l4.missionCard}>
                          <strong>Где проверяется</strong>
                          <span>Compare показывает изменение, Arena проверяет устойчивость.</span>
                        </div>
                      </div>
                      <div className={l4.l4BtnRow}>
                        <button type="button" className={l4.btnPrimary} onClick={() => setIntroStep(1)}>
                          Начать миссию
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {INTRO_PHASES.slice(0, Math.min(introStep, INTRO_PHASES.length)).map((item) => (
                        <div key={item.key} className={l4.l4Cinematic}>
                          <p className={l4.l4Narrative}>{item.body}</p>
                        </div>
                      ))}
                      {introStep >= INTRO_MAX ? (
                        <div className={l4.engineerPanel}>
                          <p className={l4.engineerEyebrow}>Миссия урока</p>
                          <h4 className={l4.engineerTitle}>Создай обратную связь, которую можно проверить</h4>
                          <p className={l4.engineerLead}>
                            Полезная обратная связь должна стать сохраненным примером, а затем пройти проверку
                            в Compare и Arena. Без проверки цикл улучшения еще не закрыт.
                          </p>
                          <div className={l4.dataGrid}>
                            <div className={l4.dataCell}>
                              <span className={l4.dataCellValue}>{chatRows}</span>
                              <span className={l4.dataCellLabel}>Примеры обратной связи</span>
                            </div>
                            <div className={l4.dataCell}>
                              <span className={l4.dataCellValue}>{compareRuns}</span>
                              <span className={l4.dataCellLabel}>Проверки Compare</span>
                            </div>
                            <div className={l4.dataCell}>
                              <span className={l4.dataCellValue}>{benchmarkRuns}</span>
                              <span className={l4.dataCellLabel}>Проверки Arena</span>
                            </div>
                          </div>
                        </div>
                      ) : null}
                      <div className={l4.l4BtnRow}>
                        <button
                          type="button"
                          className={l4.btnPrimary}
                          onClick={() => setIntroStep((value) => value + 1)}
                        >
                          {introStep >= INTRO_MAX ? "Миссия понятна" : "Дальше"}
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
                <div className={l4.feedbackWorkspace}>
                  <div className={l4.starterGrid}>
                    {FEEDBACK_MISSIONS.map((mission) => (
                      <button
                        key={mission.id}
                        type="button"
                        className={`${l4.starterCard} ${mission.id === selectedMissionId ? l4.starterCardActive : ""}`}
                        onClick={() => applyMission(mission)}
                      >
                        <strong>{mission.title}</strong>
                        <span>{mission.behaviorGoal}</span>
                      </button>
                    ))}
                  </div>

                  <label className={l4.fieldLabel} htmlFor="l4-prompt">
                    Запрос, где модель может ошибиться
                  </label>
                  <textarea
                    id="l4-prompt"
                    className={l4.textarea}
                    rows={4}
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                  />
                  <div className={l4.l4BtnRow}>
                    <button
                      type="button"
                      className={l4.btnPrimary}
                      onClick={() => void runModel()}
                      disabled={!inTauri || !student || busy === "generate"}
                    >
                      {busy === "generate" ? "Запускаю модель..." : "Получить ответ модели"}
                    </button>
                    <Link to={routes.studentChatTraining} className={l4.linkCta}>
                      Открыть примеры обучения
                    </Link>
                  </div>

                  {error ? <p className={l4.hintErr}>{error}</p> : null}

                  {currentAnswer ? (
                    <div className={l4.resultGrid}>
                      <div className={l4.resultCard}>
                        <p className={l4.aiPanelLabel}>Ответ модели</p>
                        <p className={l4.l4Narrative}>{currentAnswer.aiAnswer}</p>
                        <p className={l4.l4Narrative}>
                          <strong>Что проверяем:</strong> {selectedMission.behaviorGoal}
                        </p>
                      </div>
                      <div className={l4.resultCard}>
                        <p className={l4.aiPanelLabel}>Обратная связь и целевой ответ</p>
                        <label className={l4.fieldLabel} htmlFor="l4-critique">
                          Что нужно улучшить
                        </label>
                        <textarea
                          id="l4-critique"
                          className={l4.textarea}
                          rows={4}
                          value={critique}
                          onChange={(event) => setCritique(event.target.value)}
                          placeholder="Опиши конкретно, что слабое в ответе и какое поведение нужно изменить."
                        />
                        <label className={l4.fieldLabel} htmlFor="l4-target">
                          Лучший целевой ответ
                        </label>
                        <textarea
                          id="l4-target"
                          className={l4.textarea}
                          rows={6}
                          value={revisedTargetAnswer}
                          onChange={(event) => setRevisedTargetAnswer(event.target.value)}
                          placeholder="Перепиши ответ так, как модель должна отвечать в следующий раз."
                        />
                        <div className={strength === "strong" ? l4.feedbackStrong : l4.feedbackWeak}>
                          <strong>{strength === "strong" ? "Сильная обратная связь" : "Обратную связь нужно усилить"}</strong>
                          <p>
                            {strength === "strong"
                              ? selectedMission.strongFeedbackHint
                              : selectedMission.weakFeedbackHint}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {rowPreview ? (
                    <div className={l4.engineerPanel}>
                      <p className={l4.engineerEyebrow}>Предпросмотр</p>
                      <h4 className={l4.engineerTitle}>Что будет сохранено после обратной связи</h4>
                      <ul className={l4.summaryList}>
                        <li>
                          <strong>Запрос:</strong> {rowPreview.sourcePrompt}
                        </li>
                        <li>
                          <strong>Черновик:</strong> {rowPreview.draftAnswer}
                        </li>
                        <li>
                          <strong>Критика:</strong> {rowPreview.studentCritique || "не добавлена"}
                        </li>
                        <li>
                          <strong>Лучший ответ:</strong> {rowPreview.revisedTargetAnswer}
                        </li>
                      </ul>
                      <div className={l4.l4BtnRow}>
                        <button
                          type="button"
                          className={l4.btnPrimary}
                          onClick={() => void handleSave()}
                          disabled={busy === "save" || !revisedTargetAnswer.trim()}
                        >
                          {busy === "save" ? "Сохраняю обратную связь..." : "Сохранить пример обратной связи"}
                        </button>
                      </div>
                      {savedAt ? (
                        <p className={l4.feedbackStrong}>
                          Пример обратной связи сохранен {formatWhen(savedAt)}. Теперь проверь изменение в Compare и Arena.
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
                <div className={l4.engineerPanel}>
                  <p className={l4.engineerEyebrow}>Проверка результата</p>
                  <h4 className={l4.engineerTitle}>Где проверить, что обратная связь сработала</h4>
                  <div className={l4.dataGrid}>
                    <div className={l4.dataCell}>
                      <span className={l4.dataCellValue}>{chatRows}</span>
                      <span className={l4.dataCellLabel}>Примеры обратной связи</span>
                    </div>
                    <div className={l4.dataCell}>
                      <span className={l4.dataCellValue}>{compareRuns}</span>
                      <span className={l4.dataCellLabel}>Compare</span>
                    </div>
                    <div className={l4.dataCell}>
                      <span className={l4.dataCellValue}>{benchmarkRuns}</span>
                      <span className={l4.dataCellLabel}>Arena</span>
                    </div>
                  </div>
                  <ul className={l4.summaryList}>
                    <li>Примеры обучения: место, где создается корректирующая обратная связь.</li>
                    <li>Compare: проверка изменения поведения на одном запросе.</li>
                    <li>Arena: проверка устойчивости поведения на наборе задач.</li>
                  </ul>
                  <div className={l4.linkRow}>
                    <Link to={routes.studentChatTraining} className={l4.linkCta}>
                      Примеры обучения
                    </Link>
                    <Link to={routes.studentModelCompare} className={l4.linkCta}>
                      Compare
                    </Link>
                    <Link to={studentArenaScreenPath} className={l4.linkCta}>
                      Arena
                    </Link>
                  </div>
                </div>
              </article>
            );
          }

          if (section.type === "summary" || section.type === "challenge") {
            return (
              <article
                key={section.id}
                id={`section-${section.id}`}
                className={sectionCardClass(section.type)}
                aria-labelledby={`heading-${section.id}`}
              >
                {head}
                <p className={cs.sectionBody}>{section.content}</p>
                <div className={l4.engineerPanel}>
                  <p className={l4.engineerEyebrow}>Итог урока</p>
                  <h4 className={l4.engineerTitle}>Обратная связь полезна, когда её можно проверить</h4>
                  <ul className={l4.summaryList}>
                      <li>Ты создал {localFeedbackExamples} примеров обратной связи.</li>
                    <li>Compare показывает, изменилось ли поведение на одном запросе.</li>
                    <li>Arena показывает, стало ли улучшение устойчивым на разных задачах.</li>
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
          <p className={l4.completeHintWarn}>
            {done
              ? "Миссия уже сохранена в прогрессе."
              : realLoopReady
                ? "Есть полный цикл: примеры обратной связи, Compare и Arena."
                : basicLoopReady
                  ? "Есть базовый цикл. Для полной проверки лучше добавить запуск Compare."
                   : `Чтобы закрыть миссию, нужно собрать ${REQUIRED_CHAT_ROWS} примера обратной связи, ${REQUIRED_COMPARE_RUNS} проверку Compare и ${REQUIRED_BENCHMARK_RUNS} проверку Arena.`}
          </p>
        </div>
        <p className={cs.completeHint}>
          Совместимость со старым потоком сохранена, но главный смысл миссии теперь — реальный цикл обратной связи и проверка результата.
        </p>
      </div>
    </>
  );
}
