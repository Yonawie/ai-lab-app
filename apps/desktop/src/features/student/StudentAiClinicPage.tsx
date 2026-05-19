import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/shared/auth-context";
import {
  generateChatTrainingAnswer,
  type ChatTrainingAnswer,
} from "@/shared/chat-training-tauri";
import {
  fetchStudentTrainingPipelineStatus,
  type StudentTrainingPipelineStatus,
} from "@/shared/training-pipeline-tauri";
import { routes } from "@/shared/routes";
import {
  buildAIClinicReadModel,
  type AIClinicFailureCategory,
} from "./read-models/ai-clinic-read-model";
import type { AIClinicEvaluationPrefillState } from "./ai-clinic-prefill-state";
import styles from "./StudentDashboardPage.module.css";

type ChatTrainingPrefillState = {
  fromAiClinic: true;
  task: string;
  failureCategory: AIClinicFailureCategory;
  studentCritique: string;
  minimalEdit: string;
  revisedTargetAnswer: string;
  latestAnswer: ChatTrainingAnswer;
  referenceAnswer?: string;
  referenceModelName?: string | null;
  repairGoalTitle?: string;
  repairGoalDescription?: string;
  repairTargetExampleCount?: number;
  repairChecklist?: string[];
};

const FAILURE_TAXONOMY: Array<{ id: AIClinicFailureCategory; label: string; hint: string }> = [
  {
    id: "too_generic",
    label: "Слишком общий ответ",
    hint: "Ответ звучит расплывчато и не помогает решить задачу точнее.",
  },
  {
    id: "format_not_followed",
    label: "Не соблюдён формат",
    hint: "Модель не выдержала структуру, список, таблицу или другой ожидаемый формат.",
  },
  {
    id: "hallucination",
    label: "Похоже на выдуманный факт",
    hint: "В ответе есть сомнительные детали, которых нельзя подтвердить по задаче.",
  },
  {
    id: "missing_step",
    label: "Пропущен важный шаг",
    hint: "Ответ выглядит неполным и теряет важную часть решения.",
  },
  {
    id: "tone_issue",
    label: "Не тот тон ответа",
    hint: "Формально ответ есть, но стиль не подходит для нужной аудитории или роли.",
  },
  {
    id: "constraint_broken",
    label: "Не удержал ограничение",
    hint: "Модель нарушила явное правило: длину, роль, запрет или рамку задачи.",
  },
] as const;

function modelModeLabel(answer: ChatTrainingAnswer | null): string {
  if (!answer) return "Модель ещё не запускалась";
  if (answer.usingTrainedModel) {
    return `Сейчас ответ дал твой обученный ИИ: ${answer.modelName || "моя обученная модель"}`;
  }
  return `Сейчас ответ дала базовая модель: ${answer.modelName || "локальная базовая модель"}`;
}

function normalizeGenerationError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (!message.trim()) return "ИИ временно недоступен";
  return "ИИ временно недоступен";
}

function buildCritiqueStarter(category: AIClinicFailureCategory): string {
  switch (category) {
    case "format_not_followed":
      return "Ответ не соблюдает нужный формат. Нужно перестроить структуру и явно выдержать требуемую форму ответа.";
    case "hallucination":
      return "В ответе есть сомнительные или выдуманные детали. Нужно убрать неподтверждённые факты и оставить только то, что следует из задачи.";
    case "missing_step":
      return "Ответ пропускает важный шаг. Нужно сделать решение полным и не терять ключевую часть объяснения.";
    case "tone_issue":
      return "Ответ формально подходит, но написан не в том тоне. Нужно подстроить стиль под нужную аудиторию.";
    case "constraint_broken":
      return "Ответ нарушает ограничение задачи. Нужно переписать его так, чтобы он удерживал все заданные рамки.";
    case "too_generic":
    default:
      return "Ответ слишком общий. Нужно сделать его конкретнее и полезнее для этой задачи.";
  }
}

function buildMinimalEditStarter(category: AIClinicFailureCategory): string {
  switch (category) {
    case "format_not_followed":
      return "Перестроить ответ в нужный формат без лишних отступлений.";
    case "hallucination":
      return "Удалить сомнительный факт и заменить его проверяемой формулировкой.";
    case "missing_step":
      return "Добавить пропущенный шаг между текущими частями ответа.";
    case "tone_issue":
      return "Сделать формулировки спокойнее и понятнее для нужной аудитории.";
    case "constraint_broken":
      return "Укоротить или переписать фрагменты, которые нарушают ограничение.";
    case "too_generic":
    default:
      return "Заменить общий фрагмент на более точное и полезное объяснение.";
  }
}

function buildReferenceCritique(
  category: AIClinicFailureCategory,
  referenceModelName: string | null,
): string {
  const base = buildCritiqueStarter(category);
  const referenceLead = referenceModelName?.trim()
    ? `Сравни с более сильным ответом модели «${referenceModelName.trim()}» и сохрани именно его полезные качества.`
    : "Сравни с более сильным ответом и сохрани именно его полезные качества.";
  return `${base} ${referenceLead}`;
}

function buildReferenceMinimalEdit(
  category: AIClinicFailureCategory,
  referenceModelName: string | null,
): string {
  const base = buildMinimalEditStarter(category);
  const referenceLead = referenceModelName?.trim()
    ? `Возьми как ориентир более удачную версию от модели «${referenceModelName.trim()}».`
    : "Возьми как ориентир более удачную версию ответа.";
  return `${base} ${referenceLead}`;
}

export function StudentAiClinicPage() {
  const { userEmail } = useAuth();
  const location = useLocation();
  const inTauri = isTauri();
  const studentEmail = (userEmail ?? "").trim();
  const evaluationPrefill = (location.state ?? null) as AIClinicEvaluationPrefillState | null;

  const [trainingStatus, setTrainingStatus] = useState<StudentTrainingPipelineStatus | null>(null);
  const [task, setTask] = useState("");
  const [latestAnswer, setLatestAnswer] = useState<ChatTrainingAnswer | null>(null);
  const [failureCategory, setFailureCategory] = useState<AIClinicFailureCategory>("too_generic");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefillNotice, setPrefillNotice] = useState<string | null>(null);
  const [referenceAnswer, setReferenceAnswer] = useState<string>("");
  const [referenceModelName, setReferenceModelName] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!studentEmail || !inTauri) return;
      try {
        setLoading(true);
        const status = await fetchStudentTrainingPipelineStatus(studentEmail);
        if (!active) return;
        setTrainingStatus(status);
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [inTauri, studentEmail]);

  const clinic = useMemo(
    () => buildAIClinicReadModel({ status: trainingStatus, failureCategory }),
    [failureCategory, trainingStatus],
  );
  const trainingPrefillState = useMemo<ChatTrainingPrefillState | null>(() => {
    if (!latestAnswer || !task.trim()) return null;
    return {
      fromAiClinic: true,
      task: task.trim(),
      failureCategory,
      studentCritique: referenceAnswer.trim()
        ? buildReferenceCritique(failureCategory, referenceModelName)
        : buildCritiqueStarter(failureCategory),
      minimalEdit: referenceAnswer.trim()
        ? buildReferenceMinimalEdit(failureCategory, referenceModelName)
        : buildMinimalEditStarter(failureCategory),
      revisedTargetAnswer: referenceAnswer.trim() || latestAnswer.aiAnswer,
      latestAnswer,
      referenceAnswer: referenceAnswer.trim() || undefined,
      referenceModelName,
      repairGoalTitle: clinic.repairMission.title,
      repairGoalDescription: clinic.repairMission.description,
      repairTargetExampleCount: clinic.repairMission.targetExampleCount,
      repairChecklist: clinic.repairMission.checklist,
    };
  }, [clinic.repairMission, failureCategory, latestAnswer, referenceAnswer, referenceModelName, task]);

  useEffect(() => {
    if (!evaluationPrefill?.fromEvaluation) return;
    const nextTask = evaluationPrefill.task?.trim() ?? "";
    const nextDraft = evaluationPrefill.draftAnswer?.trim() ?? "";
    if (!nextTask || !nextDraft) return;

    setTask(nextTask);
    setFailureCategory(evaluationPrefill.failureCategory);
    setReferenceAnswer(evaluationPrefill.referenceAnswer?.trim() ?? "");
    setReferenceModelName(evaluationPrefill.referenceModelName?.trim() ?? null);
    setLatestAnswer({
      aiAnswer: nextDraft,
      answerQuality: 2,
      qualityNote:
        evaluationPrefill.qualityNote?.trim() ||
        "Этот ответ перенесён из проверки, чтобы ты мог разобрать его в AI Clinic.",
      simulatorExplanation: "",
      answerUsedTrainingContext: false,
      modelName: evaluationPrefill.modelName ?? "",
      usingTrainedModel: evaluationPrefill.usingTrainedModel,
    });
    setPrefillNotice(
      evaluationPrefill.referenceAnswer?.trim()
        ? "Слабый ответ перенесён из сравнения. Ниже есть более сильная версия, чтобы ты мог сразу превратить разницу в обучающий пример."
        : "Слабый ответ перенесён из проверки. Теперь можно сразу разобрать, чем именно его лучше чинить.",
    );
  }, [evaluationPrefill]);

  async function handleRun() {
    const studentMessage = task.trim();
    if (!studentEmail || !studentMessage || !inTauri) return;

    setBusy(true);
    setError(null);
    setReferenceAnswer("");
    setReferenceModelName(null);
    try {
      const answer = await generateChatTrainingAnswer(studentEmail, studentMessage);
      setLatestAnswer(answer);
    } catch (e) {
      setLatestAnswer(null);
      setError(normalizeGenerationError(e));
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
              <p className={styles.labKicker}>Ремонтный цех моего ИИ</p>
              <h1 className={styles.pageTitle}>AI Clinic</h1>
              <p className={styles.labHeroText}>
                Найди слабое место в ответе, выбери способ лечения и преврати ошибку в следующий шаг
                улучшения своего ИИ.
              </p>
              <div className={styles.labHeroStats}>
                <span className={styles.labStat}>сбой</span>
                <span className={styles.labStat}>диагноз</span>
                <span className={styles.labStat}>ремонт</span>
              </div>
            </div>
            <div className={styles.labHeroVisual} aria-hidden>
              <div className={`${styles.miniCore} ${styles.miniCoreLearning}`} />
            </div>
          </div>
        </header>

        <article className={`${styles.card} ${styles.cardAccent}`}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Как работает ремонт</h2>
            <p className={styles.cardDesc}>
              Это не отдельная игра и не экзамен. Ты берёшь реальный ответ модели и решаешь, какой рычаг
              поможет: prompt, контекст, пример обучения или новая проверка.
            </p>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.clinicRepairPath}>
              <div>
                <span>1</span>
                <strong>Поймай сбой</strong>
                <p>Запусти модель или принеси слабый ответ из Compare/Arena.</p>
              </div>
              <div>
                <span>2</span>
                <strong>Поставь диагноз</strong>
                <p>Выбери тип ошибки: формат, тон, пропущенный шаг, факт или ограничение.</p>
              </div>
              <div>
                <span>3</span>
                <strong>Сделай лечение</strong>
                <p>Перейди в Chat Training, Prompt Lab или Training Manager с готовым планом.</p>
              </div>
            </div>
            <div className={styles.classificationOutcomeOk} style={{ marginBottom: "0.9rem" }}>
              <p className={styles.classificationOutcomeTitle}>Карта решений</p>
              <p className={styles.classificationOutcomeText}>
                Prompt Lab — если нужно лучше поставить задачу. Примеры обучения — если нужно
                показать правильный пример. Обучение модели — если примеры уже готовы и пора
                обучить модель. Compare и Arena — если нужно доказать результат.
              </p>
            </div>
            <dl className={styles.modelTrainingGrid}>
              <div>
                <dt className={styles.modelTrainingDt}>Примеры обучения</dt>
                <dd className={styles.modelTrainingDd}>{clinic.trainingExamplesCount}</dd>
              </div>
              <div>
                <dt className={styles.modelTrainingDt}>Сильные примеры</dt>
                <dd className={styles.modelTrainingDd}>{clinic.strongTrainingExamplesCount}</dd>
              </div>
              <div>
                <dt className={styles.modelTrainingDt}>Активная модель</dt>
                <dd className={styles.modelTrainingDd}>{clinic.activeModelLabel}</dd>
              </div>
              <div>
                <dt className={styles.modelTrainingDt}>Режим</dt>
                <dd className={styles.modelTrainingDd}>{clinic.modelModeLabel}</dd>
              </div>
              <div>
                <dt className={styles.modelTrainingDt}>Следующий шаг</dt>
                <dd className={styles.modelTrainingDd}>{clinic.primaryAction.title}</dd>
              </div>
            </dl>
          </div>
        </article>

        {prefillNotice ? (
          <article className={`${styles.card} ${styles.cardMuted}`}>
            <div className={styles.cardBody}>
              <p className={styles.classificationPrompt}>{prefillNotice}</p>
            </div>
          </article>
        ) : null}

        {!inTauri ? (
          <article className={`${styles.card} ${styles.cardMuted}`}>
            <div className={styles.cardBody}>
              <p className={styles.classificationPrompt}>
                Открой настольное приложение, чтобы запускать локальную модель и
                разбирать реальные ответы в AI Clinic.
              </p>
            </div>
          </article>
        ) : null}

        <article className={`${styles.card} ${styles.cardMuted}`}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Проверь слабый ответ</h2>
            <p className={styles.cardDesc}>
              Возьми задачу, на которой хочешь проверить своего ИИ. Лучше всего подходят запросы, где
              важны точность, формат или ограничение.
            </p>
          </div>
          <div className={styles.cardBody}>
            <label className={styles.promptLabInputWrap} htmlFor="clinic-task">
              <span className={styles.classificationLegend}>1. Задача для модели</span>
              <textarea
                id="clinic-task"
                className={styles.promptLabTextarea}
                rows={5}
                value={task}
                onChange={(e) => setTask(e.target.value)}
                placeholder="Например: объясни код для новичка в 5 коротких шагах и без сложных терминов."
                disabled={!inTauri || busy}
              />
            </label>

            <div className={styles.classificationActions}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnAccent}`}
                onClick={() => void handleRun()}
                disabled={!inTauri || busy || !task.trim()}
              >
                {busy ? "Получаем ответ..." : "Получить ответ модели"}
              </button>
            </div>

            {error ? <p className={styles.classificationError}>{error}</p> : null}
            {loading ? <p className={styles.classificationHint}>Загружаем состояние твоего ИИ...</p> : null}
          </div>
        </article>

        {latestAnswer ? (
          <>
            <article className={`${styles.card} ${styles.cardAccent}`}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Что ответила модель</h2>
                <p className={styles.cardDesc}>
                  Это реальный ответ текущей модели. Теперь разберись, какая у него главная слабость.
                </p>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.chatBubbleAi}>
                  <p className={styles.hubActionKicker}>Ответ модели</p>
                  <p className={styles.chatBubbleText}>{latestAnswer.aiAnswer}</p>
                </div>
                <p className={styles.classificationHint}>
                  {modelModeLabel(latestAnswer)}
                  {latestAnswer.answerUsedTrainingContext
                    ? " · Ответ строился с учётом твоего текущего контекста обучения."
                    : ""}
                </p>
                <div className={styles.classificationOutcomeBad}>
                  <p className={styles.classificationOutcomeTitle}>Быстрая оценка ответа</p>
                  <p className={styles.classificationOutcomeText}>
                    {latestAnswer.answerQuality}/5 · {latestAnswer.qualityNote}
                  </p>
                </div>
              </div>
            </article>

            {referenceAnswer.trim() ? (
              <article className={`${styles.card} ${styles.cardMuted}`}>
                <div className={styles.cardHeader}>
                  <h2 className={styles.cardTitle}>Что было лучше в другом ответе</h2>
                  <p className={styles.cardDesc}>
                    Это более удачная версия ответа. Используй её как ориентир, когда будешь готовить
                    исправленный пример обучения.
                  </p>
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.chatBubbleUser}>
                    <p className={styles.hubActionKicker}>
                      Лучший ответ{referenceModelName?.trim() ? ` · ${referenceModelName.trim()}` : ""}
                    </p>
                    <p className={styles.chatBubbleText}>{referenceAnswer}</p>
                  </div>
                </div>
              </article>
            ) : null}

            <article className={`${styles.card} ${styles.cardMuted}`}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Что именно сломалось</h2>
                <p className={styles.cardDesc}>
                  Выбери главный тип ошибки. AI Clinic подскажет, куда идти дальше и чем лучше чинить
                  именно такой сбой.
                </p>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.chatRatingRow} role="group" aria-label="Тип ошибки">
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
                      title={item.hint}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <p className={styles.classificationHint}>
                  {FAILURE_TAXONOMY.find((item) => item.id === failureCategory)?.hint}
                </p>
              </div>
            </article>

            <article className={`${styles.card} ${styles.cardAccent}`}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Чем лучше чинить эту проблему</h2>
                <p className={styles.cardDesc}>
                  AI Clinic не просто показывает ошибку, а переводит её в следующий рабочий шаг.
                </p>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.classificationOutcomeOk}>
                  <p className={styles.classificationOutcomeTitle}>{clinic.recommendationTitle}</p>
                  <p className={styles.classificationOutcomeText}>{clinic.recommendationReason}</p>
                </div>
                <div className={styles.classificationOutcomeBad} style={{ marginTop: "1rem" }}>
                  <p className={styles.classificationOutcomeTitle}>Prompt или обучение?</p>
                  <p className={styles.classificationOutcomeText}>{clinic.promptVsTrainTitle}</p>
                  <p className={styles.classificationHint}>{clinic.promptVsTrainBody}</p>
                </div>
                <div className={styles.classificationOutcomeBad} style={{ marginTop: "1rem" }}>
                  <p className={styles.classificationOutcomeTitle}>Ремонтный план</p>
                  <p className={styles.classificationOutcomeText}>
                    {clinic.repairMission.title} · цель: {clinic.repairMission.targetExampleCount} примера
                  </p>
                  <p className={styles.classificationHint}>{clinic.repairMission.description}</p>
                  <ul className={styles.taskList} style={{ marginTop: "0.75rem" }}>
                    {clinic.repairMission.checklist.map((item) => (
                      <li key={item} className={styles.classificationCard}>
                        <p className={styles.classificationHint}>{item}</p>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={styles.companionHubGrid} style={{ marginTop: "1rem" }}>
                  <div className={styles.hubActionCard}>
                    <p className={styles.hubActionKicker}>Основной шаг</p>
                    <h3 className={styles.hubActionTitle}>{clinic.primaryAction.title}</h3>
                    <p className={styles.hubActionDesc}>{clinic.primaryAction.description}</p>
                    <Link
                      to={clinic.primaryAction.href}
                      state={clinic.primaryAction.href === routes.studentChatTraining ? trainingPrefillState : null}
                      className={`${styles.btn} ${styles.btnAccent} ${styles.hubActionBtn}`}
                    >
                      Перейти
                    </Link>
                  </div>
                  <div className={styles.hubActionCard}>
                    <p className={styles.hubActionKicker}>После этого</p>
                    <h3 className={styles.hubActionTitle}>{clinic.secondaryAction.title}</h3>
                    <p className={styles.hubActionDesc}>{clinic.secondaryAction.description}</p>
                    <Link
                      to={clinic.secondaryAction.href}
                      state={clinic.secondaryAction.href === routes.studentChatTraining ? trainingPrefillState : null}
                      className={`${styles.btn} ${styles.btnOutline} ${styles.hubActionBtn}`}
                    >
                      Открыть
                    </Link>
                  </div>
                </div>
              </div>
            </article>
          </>
        ) : null}
      </div>
    </div>
  );
}
