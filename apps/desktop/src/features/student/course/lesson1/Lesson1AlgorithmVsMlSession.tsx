import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { runPromptLabExperiment, type PromptLabRunResult } from "@/shared/prompt-lab-tauri";
import { routes } from "@/shared/routes";
import type { Lesson, LessonSectionType } from "../training-course-model";
import { DEMO_CASES, DEMO_RULE_DESCRIPTION } from "./l1-data";
import l1 from "./Lesson1AlgorithmVsMl.module.css";
import courseCss from "../../StudentCourse.module.css";

type Props = {
  lesson: Lesson;
  courseStyles: typeof courseCss;
  sectionCardClass: (t: LessonSectionType) => string;
  done: boolean;
  onMarkComplete: () => void;
  studentEmail?: string;
};

const AI_TEMP_UNAVAILABLE = "ИИ временно недоступен";

const INTRO_PHASES = [
  "В AI Lab мы не просто читаем про модели: мы сразу проверяем, как один и тот же запрос меняется от формулировки.",
  "Сейчас ты дашь модели простую задачу, увидишь первый ответ и сравнишь его с ответом после более точного промпта.",
];

const DEFAULT_TASK =
  "Объясни ученику 6 класса, почему 2/5 + 1/5 = 3/5. Ответ должен быть коротким и дружелюбным.";
const DEFAULT_PROMPT_A = "Ответь на задачу.";
const DEFAULT_PROMPT_B =
  "Ты спокойный наставник. Объясни коротко, в 3-4 предложениях, укажи ошибку, покажи правильный шаг на примере 2/5 + 1/5 и заверши одним следующим действием для ученика.";

function normalized(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

export function Lesson1AlgorithmVsMlSession({
  lesson,
  courseStyles: cs,
  sectionCardClass,
  done,
  onMarkComplete,
  studentEmail = "",
}: Props) {
  const [introStep, setIntroStep] = useState(0);
  const [taskInput, setTaskInput] = useState(DEFAULT_TASK);
  const [promptA, setPromptA] = useState(DEFAULT_PROMPT_A);
  const [promptB, setPromptB] = useState(DEFAULT_PROMPT_B);
  const [runResult, setRunResult] = useState<PromptLabRunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [attemptedRun, setAttemptedRun] = useState(false);
  const [observation, setObservation] = useState<string>("");

  const total = lesson.sections.length;
  const aiUnavailable =
    runResult?.outputA === AI_TEMP_UNAVAILABLE || runResult?.outputB === AI_TEMP_UNAVAILABLE;
  const outputsDiffer = useMemo(() => {
    if (!runResult) return false;
    return normalized(runResult.outputA) !== normalized(runResult.outputB);
  }, [runResult]);
  const canFinishLesson = attemptedRun;

  async function handleRun() {
    const email = studentEmail.trim();
    if (!email) {
      setAttemptedRun(true);
      setRunResult({
        modelName: "qwen3:8b",
        usingTrainedModel: false,
        taskInput,
        promptA,
        promptB,
        outputA: AI_TEMP_UNAVAILABLE,
        outputB: AI_TEMP_UNAVAILABLE,
      });
      setRunError("Войди как студент, чтобы запустить реальный ответ модели.");
      return;
    }

    if (!taskInput.trim() || !promptA.trim() || !promptB.trim()) {
      setRunError("Заполни задачу, Prompt A и Prompt B.");
      return;
    }

    setRunning(true);
    setAttemptedRun(true);
    setRunError(null);

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
    } catch (error) {
      setRunResult({
        modelName: "qwen3:8b",
        usingTrainedModel: false,
        taskInput,
        promptA,
        promptB,
        outputA: AI_TEMP_UNAVAILABLE,
        outputB: AI_TEMP_UNAVAILABLE,
      });
      setRunError(error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(false);
    }
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
              <span className={cs.sectionStep}>
                Шаг {index + 1}/{total}
              </span>
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
                <div className={l1.l1Block}>
                  <div className={l1.l1Cinematic}>
                    <p className={l1.l1CinematicOverline}>Первая реальная проверка</p>
                    <h3 className={l1.l1CinematicTitle}>Что AI делает прямо сейчас</h3>
                    <p className={l1.l1Narrative}>
                      Модель читает твой запрос и пытается понять, какой ответ нужен. Если
                      формулировка слишком общая, ответ часто получается расплывчатым.
                    </p>
                  </div>

                  {INTRO_PHASES.slice(0, introStep).map((item) => (
                    <div key={item} className={l1.missionCard}>
                      <p className={l1.l1Narrative}>{item}</p>
                    </div>
                  ))}

                  <div className={l1.l1BtnRow}>
                    {introStep < INTRO_PHASES.length ? (
                      <button
                        type="button"
                        className={l1.btnPrimary}
                        onClick={() => setIntroStep((value) => Math.min(INTRO_PHASES.length, value + 1))}
                      >
                        Показать следующий шаг
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={l1.btnPrimary}
                        onClick={() => {
                          const target = document.getElementById("section-l1-gameplay");
                          target?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                      >
                        Перейти к живому запуску
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          }

          if (section.type === "demo") {
            return (
              <article
                key={section.id}
                id={`section-${section.id}`}
                className={sectionCardClass("demo")}
                aria-labelledby={`heading-${section.id}`}
              >
                {head}
                <p className={cs.sectionBody}>{section.content}</p>
                <div className={l1.ruleCallout}>{DEMO_RULE_DESCRIPTION}</div>
                <div className={l1.demoGrid}>
                  {DEMO_CASES.slice(0, 3).map((item) => (
                    <article key={item.id} className={l1.demoCard}>
                      <p className={l1.demoCardLabel}>{item.label}</p>
                      <p className={l1.demoCardMsg}>{item.message}</p>
                      <div
                        className={`${l1.demoReveal} ${item.botWasRight ? l1.demoRevealOk : ""}`}
                      >
                        <p className={l1.l1Narrative}>
                          Ответ жёсткого правила:{" "}
                          <span className={l1.botBadge}>
                            {item.botLabel === "спам" ? "СПАМ" : "НЕ СПАМ"}
                          </span>
                        </p>
                        <p className={l1.l1Narrative}>{item.explanation}</p>
                      </div>
                    </article>
                  ))}
                </div>
                <p className={l1.l1Narrative}>
                  Этого уже хватает, чтобы увидеть ограничение правил. Дальше ты проверишь не
                  игрушечный классификатор, а живую модель на одном и том же запросе.
                </p>
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
                <div className={l1.liveGrid}>
                  <article className={l1.livePanel}>
                    <p className={l1.demoCardLabel}>Задача</p>
                    <textarea
                      className={l1.liveTextarea}
                      value={taskInput}
                      onChange={(event) => setTaskInput(event.target.value)}
                      rows={5}
                    />
                    <p className={l1.demoCardLabel}>Prompt A</p>
                    <textarea
                      className={l1.liveTextarea}
                      value={promptA}
                      onChange={(event) => setPromptA(event.target.value)}
                      rows={4}
                    />
                    <p className={l1.demoCardLabel}>Prompt B</p>
                    <textarea
                      className={l1.liveTextarea}
                      value={promptB}
                      onChange={(event) => setPromptB(event.target.value)}
                      rows={6}
                    />
                    <div className={l1.l1BtnRow}>
                      <button
                        type="button"
                        className={l1.btnPrimary}
                        onClick={() => void handleRun()}
                        disabled={running}
                      >
                        {running ? "Запуск..." : "Запустить два варианта"}
                      </button>
                    </div>
                    <p className={l1.gameMeta}>
                      Сначала дай модели простой запрос, потом уточни роль, формат и полезный
                      результат для ученика.
                    </p>
                  </article>

                  <article className={l1.livePanel}>
                    <p className={l1.demoCardLabel}>Что ответила модель</p>
                    <div className={l1.outputCard}>
                      <p className={l1.outputTitle}>Ответ A</p>
                      <p className={l1.liveOutput}>
                        {runResult?.outputA || "После запуска здесь появится первый ответ модели."}
                      </p>
                    </div>
                    <div className={l1.outputCard}>
                      <p className={l1.outputTitle}>Ответ B</p>
                      <p className={l1.liveOutput}>
                    {runResult?.outputB || "После запуска здесь появится ответ после улучшенного запроса."}
                      </p>
                    </div>
                    {runResult ? (
                      <p className={l1.gameMeta}>
                        Модель: {runResult.modelName}
                        {runResult.usingTrainedModel ? " · используется обученная версия" : " · используется базовая версия"}
                      </p>
                    ) : null}
                  </article>
                </div>

                {runError ? <p className={l1.statusNote}>{runError}</p> : null}

                {attemptedRun ? (
                  <div className={`${l1.feedback} ${aiUnavailable ? l1.feedbackBad : l1.feedbackOk}`}>
                    <p className={l1.l1Narrative}>
                      {aiUnavailable
                        ? "Сейчас модель не ответила. Это нормально: урок остаётся доступным, а следующий запуск можно повторить позже."
                        : outputsDiffer
                          ? "Формулировка действительно изменила результат: ответы отличаются, значит модель чувствительна к тому, как ты ставишь задачу."
                          : "Ответы оказались почти одинаковыми. Это тоже полезный результат: попробуй сильнее изменить роль, ограничения или формат ответа."}
                    </p>
                  </div>
                ) : null}
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
                <div className={l1.missionGrid}>
                  {[
                    "Ответ стал понятнее",
                    "Появился более точный формат",
                    "Модель стала полезнее для ученика",
                    "Почти ничего не изменилось",
                  ].map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={`${l1.btnChoice} ${observation === item ? l1.btnChoiceActive : ""}`}
                      onClick={() => setObservation(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                <div className={l1.missionCard}>
                  <p className={l1.l1Narrative}>
                    <strong>Что ты сделал:</strong> задал один запрос в двух версиях и посмотрел,
                    как меняется ответ.
                  </p>
                  <p className={l1.l1Narrative}>
                    <strong>Что получилось:</strong>{" "}
                    {attemptedRun
                      ? aiUnavailable
                        ? "сейчас модель недоступна, но ты уже увидел формат живого запуска и сможешь повторить его позже."
                        : outputsDiffer
                          ? "ты получил два разных ответа и увидел, что точность промпта влияет на поведение модели."
                          : "ты получил почти одинаковые ответы и увидел, что слабое изменение промпта не всегда даёт заметный эффект."
                      : "после первого запуска здесь появится короткий вывод по твоему эксперименту."}
                  </p>
                  <p className={l1.l1Narrative}>
                    <strong>Что попробовать дальше:</strong> менять роль, критерии ответа,
                    длину, примеры и ограничения.
                  </p>
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
                <div className={l1.summaryHero}>
                  <h3 className={l1.summaryHeroTitle}>Главный вывод урока</h3>
                  <ul className={l1.summaryList}>
                    <li>AI отвечает не сам по себе, а по тому запросу, который ты ему даёшь.</li>
                    <li>Даже простое уточнение задачи может сделать ответ заметно полезнее.</li>
                    <li>Если разницы почти нет, это не провал, а сигнал попробовать другой тип промпта.</li>
                  </ul>
                </div>
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
                <div className={l1.nextStepCard}>
                  <p className={l1.demoCardLabel}>Что дальше</p>
                  <p className={l1.l1Narrative}>
                    Prompt Lab — это следующий шаг после этого урока. Там ты будешь запускать уже
                    полноценные A/B-эксперименты, сравнивать два промпта на одной задаче и
                    сохранять лучшие результаты.
                  </p>
                  <div className={l1.l1BtnRow}>
                    <Link to={routes.studentPromptLab} className={l1.linkButton}>
                      Открыть Prompt Lab
                    </Link>
                    <button
                      type="button"
                      className={l1.btnGhost}
                      onClick={() => void handleRun()}
                      disabled={running}
                    >
                      Повторить запуск в уроке
                    </button>
                  </div>
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
          <p className={l1.completeHintWarn}>
            {canFinishLesson
              ? "Первый живой запуск выполнен. Можно завершать миссию и продолжать эксперименты в Prompt Lab."
              : "Сначала запусти хотя бы один реальный ответ модели, чтобы миссия стала практическим действием в AI Lab."}
          </p>
        </div>
        <p className={cs.completeHint}>
          Эта миссия не требует сложной проверки. Здесь важно увидеть первую связь: промпт →
          ответ модели → улучшенный промпт → изменившийся результат.
        </p>
      </div>
    </>
  );
}
