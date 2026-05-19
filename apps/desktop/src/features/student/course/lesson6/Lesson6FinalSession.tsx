import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/shared/auth-context";
import {
  fetchStudentArtifactSummary,
  type StudentArtifactSummary,
} from "@/shared/artifact-ledger-tauri";
import {
  fetchStudentTrainingPipelineStatus,
  type StudentTrainingPipelineStatus,
} from "@/shared/training-pipeline-tauri";
import { routes } from "@/shared/routes";
import { studentArenaScreenPath } from "../../student-surface-paths";
import { loadArenaStats } from "../../arena-stats";
import { loadLastExamResult } from "../../exam-last-storage";
import type { Lesson, LessonSectionType } from "../training-course-model";
import type courseCss from "../../StudentCourse.module.css";
import { isFinalMissionCompareDone } from "./final-mission-markers";
import l6 from "./Lesson6Final.module.css";

type Props = {
  lesson: Lesson;
  courseStyles: typeof courseCss;
  sectionCardClass: (t: LessonSectionType) => string;
  done: boolean;
  onMarkComplete: () => void;
  studentEmail?: string;
};

const CAPSTONE_REQUIREMENTS = [
  {
    key: "dataset_exported",
    label: "Данные подготовлены",
    detail: "Примеры собраны в версию данных для обучения.",
  },
  {
    key: "lora_adapter_registered",
    label: "Модель зарегистрирована",
    detail: "Обученная версия подключена к локальной модели.",
  },
  {
    key: "trained_model_activated",
    label: "Модель включена",
    detail: "Мой ИИ использует обученную версию для следующих запусков.",
  },
  {
    key: "compare_run_completed",
    label: "Compare выполнен",
    detail: "Есть проверка изменения поведения на одном запросе.",
  },
  {
    key: "benchmark_eval_completed",
    label: "Arena выполнена",
    detail: "Есть проверка устойчивости на наборе задач.",
  },
] as const;

type RequirementKey = (typeof CAPSTONE_REQUIREMENTS)[number]["key"];

function countOf(summary: StudentArtifactSummary | null, key: RequirementKey): number {
  return summary?.countsByType?.[key] ?? 0;
}

function formatBool(value: boolean): string {
  return value ? "Да" : "Нет";
}

export function Lesson6FinalSession({
  lesson,
  courseStyles: cs,
  sectionCardClass,
  done,
  onMarkComplete,
  studentEmail: studentEmailProp = "",
}: Props) {
  const { userEmail } = useAuth();
  const email = (studentEmailProp.trim() || (userEmail ?? "").trim()).trim();
  const inTauri = isTauri();

  const [artifactSummary, setArtifactSummary] = useState<StudentArtifactSummary | null>(null);
  const [pipeline, setPipeline] = useState<StudentTrainingPipelineStatus | null>(null);
  const [localCompareDone, setLocalCompareDone] = useState(false);
  const [localArena, setLocalArena] = useState<{ battles: number; wins: number } | null>(null);
  const [localExamReady, setLocalExamReady] = useState(false);

  const refreshData = useCallback(async () => {
    setLocalCompareDone(isFinalMissionCompareDone(email));
    setLocalArena(loadArenaStats(email));
    setLocalExamReady(loadLastExamResult(email) !== null);

    if (!email || !inTauri) {
      setArtifactSummary(null);
      setPipeline(null);
      return;
    }

    try {
      const [summary, nextPipeline] = await Promise.all([
        fetchStudentArtifactSummary(email),
        fetchStudentTrainingPipelineStatus(email),
      ]);
      setArtifactSummary(summary);
      setPipeline(nextPipeline);
    } catch {
      setArtifactSummary(null);
      setPipeline(null);
    }
  }, [email, inTauri]);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  const capstoneChecklist = useMemo(
    () =>
      CAPSTONE_REQUIREMENTS.map((item) => {
        const count = countOf(artifactSummary, item.key);
        return {
          ...item,
          count,
          done: count > 0,
        };
      }),
    [artifactSummary],
  );

  const datasetExported = countOf(artifactSummary, "dataset_exported");
  const registeredAdapters = countOf(artifactSummary, "lora_adapter_registered");
  const activatedModels = countOf(artifactSummary, "trained_model_activated");
  const compareRuns = countOf(artifactSummary, "compare_run_completed");
  const arenaRuns = countOf(artifactSummary, "benchmark_eval_completed");
  const capstoneReady = capstoneChecklist.every((item) => item.done);
  const localReady = localCompareDone && (localArena?.battles ?? 0) >= 1 && localExamReady;
  const canFinishLesson = capstoneReady || localReady;
  const missingItems = capstoneChecklist.filter((item) => !item.done);
  const total = lesson.sections.length;

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
                <div className={l6.finaleShell}>
                  <p className={l6.finaleEyebrow}>Финальный цикл проверки</p>
                  <h3 className={l6.finaleH2}>Финальная лаборатория: докажи, что твой ИИ стал лучше</h3>
                  <p className={l6.finaleLead}>
                    В финале важно не просто открыть страницы, а пройти полный цикл:
                    подготовить данные, обучить и включить модель, проверить изменение в Compare и
                    устойчивость в Arena.
                  </p>
                  <div className={l6.finaleGrid}>
                    <div className={l6.finaleCard}>
                      <p className={l6.finaleCardLabel}>Что уже построено</p>
                      <p className={l6.finaleCardValue}>
                        Данные {datasetExported} · регистрация {registeredAdapters} · включение {activatedModels}
                      </p>
                    </div>
                    <div className={l6.finaleCard}>
                      <p className={l6.finaleCardLabel}>Что проверено</p>
                      <p className={l6.finaleCardValue}>
                        Compare {compareRuns} · Arena {arenaRuns}
                      </p>
                    </div>
                    <div className={l6.finaleCard}>
                      <p className={l6.finaleCardLabel}>Активная модель</p>
                      <p className={l6.finaleCardValue}>
                        {pipeline?.usingTrainedModel
                          ? pipeline.activeStudentModelAlias || "обученная модель"
                          : "пока базовая модель"}
                      </p>
                    </div>
                  </div>
                </div>
              </article>
            );
          }

          if (section.type === "gameplay") {
            return (
              <article
                key={section.id}
                id={`section-${section.id}`}
                className={sectionCardClass(section.type)}
                aria-labelledby={`heading-${section.id}`}
              >
                {head}
                <p className={cs.sectionBody}>{section.content}</p>
                <div className={l6.l6Block}>
                  <div className={l6.ruleCallout}>
                    Зона «Тренируем» отвечает за путь “подготовить данные → обучить модель → зарегистрировать
                    модель → включить модель”. Финал не завершен, если обученная версия еще не стала активной.
                  </div>
                  <div className={l6.statusGrid}>
                    <div className={l6.statusCard}>
                      <span className={l6.statusValue}>{datasetExported}</span>
                      <span className={l6.statusLabel}>Версии данных</span>
                    </div>
                    <div className={l6.statusCard}>
                      <span className={l6.statusValue}>{registeredAdapters}</span>
                      <span className={l6.statusLabel}>Регистрации модели</span>
                    </div>
                    <div className={l6.statusCard}>
                      <span className={l6.statusValue}>{activatedModels}</span>
                      <span className={l6.statusLabel}>Включения модели</span>
                    </div>
                    <div className={l6.statusCard}>
                      <span className={l6.statusValue}>{pipeline?.activeStudentModelAlias ?? "—"}</span>
                      <span className={l6.statusLabel}>Текущая версия</span>
                    </div>
                  </div>
                  <div className={l6.pipelinePanel}>
                    <div className={l6.pipelineStep}>
                      <strong>Подготовить данные</strong>
                      <span>{pipeline?.exportAvailable ? "Данные готовы для обучения." : "Нужно подготовить данные."}</span>
                    </div>
                    <div className={l6.pipelineStep}>
                      <strong>Подключить</strong>
                      <span>
                        {pipeline?.ollamaModelRegistered
                          ? "Обученная версия подключена."
                          : "Нужно подключить обученную версию."}
                      </span>
                    </div>
                    <div className={l6.pipelineStep}>
                      <strong>Включить</strong>
                      <span>
                        {pipeline?.usingTrainedModel
                          ? "Обученная модель уже активна."
                          : "Включи обученную модель перед проверкой."}
                      </span>
                    </div>
                  </div>
                  <div className={l6.linkRow}>
                    <Link to={routes.studentTrain} className={l6.linkCta}>
                      Открыть «Тренируем»
                    </Link>
                    <Link to={routes.studentAiGrowth} className={l6.linkCta}>
                      Открыть Мой ИИ
                    </Link>
                  </div>
                </div>
              </article>
            );
          }

          if (section.type === "lab" || section.type === "summary") {
            return (
              <article
                key={section.id}
                id={`section-${section.id}`}
                className={sectionCardClass(section.type)}
                aria-labelledby={`heading-${section.id}`}
              >
                {head}
                <p className={cs.sectionBody}>{section.content}</p>
                <div className={l6.l6Block}>
                  <div className={l6.ruleCallout}>
                    Compare проверяет изменение на одном запросе. Arena проверяет, держится ли улучшение
                    на разных задачах.
                  </div>
                  <div className={l6.statusGrid}>
                    <div className={l6.statusCard}>
                      <span className={l6.statusValue}>{compareRuns}</span>
                      <span className={l6.statusLabel}>Compare</span>
                    </div>
                    <div className={l6.statusCard}>
                      <span className={l6.statusValue}>{arenaRuns}</span>
                      <span className={l6.statusLabel}>Arena</span>
                    </div>
                    <div className={l6.statusCard}>
                      <span className={l6.statusValue}>{formatBool(localCompareDone)}</span>
                      <span className={l6.statusLabel}>Локальный Compare</span>
                    </div>
                    <div className={l6.statusCard}>
                      <span className={l6.statusValue}>{localArena?.battles ?? 0}</span>
                      <span className={l6.statusLabel}>Локальные матчи</span>
                    </div>
                  </div>
                  <div className={l6.linkRow}>
                    <Link to={routes.studentModelCompare} className={l6.linkCta}>
                      Открыть Compare
                    </Link>
                    <Link to={studentArenaScreenPath} className={l6.linkCta}>
                      Открыть Arena
                    </Link>
                  </div>
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
                <div className={l6.finaleShell}>
                  <p className={l6.finaleEyebrow}>Финальный цикл проверки</p>
                  <h3 className={l6.finaleH2}>Финал подтверждается результатами, а не сценой</h3>
                  <p className={l6.finaleLead}>
                    Финальная миссия считается завершённой, когда видно полный контур работы: данные подготовлены,
                    модель зарегистрирована и включена, Compare показал изменение поведения, а Arena
                    подтвердила устойчивость на задачах.
                  </p>
                  <div className={l6.finaleGrid}>
                    <div className={l6.finaleCard}>
                      <p className={l6.finaleCardLabel}>Построено</p>
                      <p className={l6.finaleCardValue}>
                        данные {datasetExported} · модель {registeredAdapters} · включено {activatedModels}
                      </p>
                    </div>
                    <div className={l6.finaleCard}>
                      <p className={l6.finaleCardLabel}>Проверено</p>
                      <p className={l6.finaleCardValue}>
                        Compare {compareRuns} · Arena {arenaRuns}
                      </p>
                    </div>
                    <div className={l6.finaleCard}>
                      <p className={l6.finaleCardLabel}>Статус</p>
                      <p className={l6.finaleCardValue}>
                        {pipeline?.usingTrainedModel ? "обученная модель активна" : "нужно включить обученную модель"}
                      </p>
                    </div>
                  </div>
                  <div className={l6.requirementList}>
                    {capstoneChecklist.map((item) => (
                      <div key={item.key} className={`${l6.requirementItem} ${item.done ? l6.requirementDone : ""}`}>
                        <strong>{item.label}</strong>
                        <span>{item.done ? "Готово" : item.detail}</span>
                      </div>
                    ))}
                  </div>
                  {capstoneReady ? (
                    <p className={l6.successNote}>Полный цикл подтвержден. Финал можно завершать.</p>
                  ) : (
                    <p className={l6.warningNote}>
                      Еще нужно: {missingItems.map((item) => item.label).join(", ")}.
                    </p>
                  )}
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
          <p className={l6.completeHintWarn}>
            {done
              ? "Миссия уже сохранена в прогрессе."
              : capstoneReady
                ? "Есть полный цикл: данные, модель, Compare и Arena подтверждены результатами."
                : localReady
                  ? "Есть локальный полный цикл. Для финального результата лучше сохранить проверки в основных поверхностях."
                  : `Чтобы завершить миссию, ещё нужно: ${missingItems.map((item) => item.label).join(", ")}.`}
          </p>
        </div>
        <p className={cs.completeHint}>
          Совместимость со старым прогрессом сохранена, но главным результатом считаются реальные проверки полного финального цикла.
        </p>
      </div>
    </>
  );
}
