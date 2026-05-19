import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ClockIcon, TargetIcon } from "./StudentDashboardIcons";
import styles from "./StudentCourse.module.css";
import {
  fetchStudentArtifactSummary,
  type StudentArtifactSummary,
} from "@/shared/artifact-ledger-tauri";
import { useAuth } from "@/shared/auth-context";
import {
  COURSE_PROGRESS_STORAGE_KEY,
  getCompletedLessonIds,
  type CampaignLessonStatus,
} from "./course/course-progress-storage";
import {
  getLessonActionGuide,
  paradigmLabel,
  summarizeRequiredEvidence,
  TRAINING_COURSE,
} from "./course/training-course-model";
import { routes, studentCourseLessonPath } from "@/shared/routes";
import { buildCourseProgressReadModel } from "./read-models/course-progress-read-model";

function statusClass(s: CampaignLessonStatus): string {
  if (s === "completed") return styles.statusDone;
  if (s === "unlocked") return styles.statusOpen;
  return styles.statusLocked;
}

export function StudentCoursePage() {
  const { userEmail } = useAuth();
  const [completedFallback, setCompletedFallback] = useState(() => getCompletedLessonIds());
  const [artifactSummary, setArtifactSummary] = useState<StudentArtifactSummary | null>(null);
  const studentEmail = (userEmail ?? "").trim();

  useEffect(() => {
    const sync = () => setCompletedFallback(getCompletedLessonIds());
    const onStorage = (e: StorageEvent) => {
      if (e.key === COURSE_PROGRESS_STORAGE_KEY || e.key === null) {
        sync();
      }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("ai-lab-course-progress", sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("ai-lab-course-progress", sync);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!studentEmail) {
      setArtifactSummary(null);
      return;
    }
    void fetchStudentArtifactSummary(studentEmail)
      .then((summary) => {
        if (!cancelled) setArtifactSummary(summary);
      })
      .catch(() => {
        if (!cancelled) setArtifactSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, [studentEmail]);

  const courseReadModel = useMemo(
    () => buildCourseProgressReadModel(artifactSummary, completedFallback),
    [artifactSummary, completedFallback],
  );
  const { progression, evidenceSnapshot, doneCount, totalCount, activeMission, progressSourceSummary } =
    courseReadModel;
  const activeLesson = activeMission?.lesson ?? null;
  const activeLessonState = activeMission?.lessonState ?? null;

  return (
    <div className={styles.page}>
      <div className={styles.gradients} aria-hidden>
        <div className={styles.blob1} />
        <div className={styles.blob2} />
      </div>

      <div className={`${styles.inner} ${styles.innerWide}`}>
        <header className={styles.header}>
          <Link to={routes.studentAiGrowth} className={styles.backLink}>
            ← К Мой ИИ
          </Link>
          <div className={styles.courseHero}>
            <div className={styles.courseHeroCopy}>
              <p className={styles.campaignContextBadge}>Student AI Engineer Lab</p>
              <h1 className={styles.pageTitle}>{courseReadModel.title}</h1>
              <p className={styles.courseHeroText}>
                Миссии ведут тебя через реальные действия: запусти ИИ, дай примеры,
                обучи модель, проверь результат и примени её в проекте.
              </p>
              <p className={styles.campaignContextTrail}>
                <span className={styles.campaignContextHome}>Мой ИИ — общая картина</span>
                <span aria-hidden> · </span>
                <strong className={styles.campaignContextHere}>здесь — маршрут практики</strong>
              </p>
            </div>
            <div className={styles.courseHeroVisual} aria-hidden>
              <div className={styles.courseCore} />
            </div>
          </div>
          <p className={styles.subtitle}>{courseReadModel.description}</p>
        </header>

        <div className={styles.heroCard}>
          <div className={styles.heroTop}>
            <div>
              <h2 className={styles.heroTitle}>6 миссий по прокачке ИИ</h2>
              <p className={styles.heroDesc}>
                Каждая миссия опирается на реальные результаты: эксперименты в Prompt Lab, примеры обучения,
                проверки в Compare, проверки в Arena и шаги процесса обучения.
              </p>
              <p className={styles.heroDesc}>
                Формат рассчитан минимум на 6 занятий по 90 минут: на каждом шаге ты выбираешь рычаг улучшения
                ИИ — запрос, контекст, пример, обратную связь, обучение или проверку.
              </p>
            </div>
            <div className={styles.badgeRow}>
              <span className={styles.pill}>
                <TargetIcon width={14} height={14} />
                Прогресс: {doneCount}/{totalCount}
              </span>
              <span className={styles.pill}>Результаты: {evidenceSnapshot.totalEvidence}</span>
            </div>
          </div>
        </div>

        {artifactSummary ? (
          <section className={styles.evidenceCard} aria-label="Результаты студента">
            <div className={styles.evidenceHead}>
              <div>
                <p className={styles.evidenceEyebrow}>Твой прогресс</p>
                <h2 className={styles.evidenceTitle}>Что уже сделал твой ИИ</h2>
              </div>
              <span className={styles.evidenceTotal}>{artifactSummary.totalCount}</span>
            </div>
            <div className={styles.evidenceGrid}>
              <div className={styles.evidenceItem}>
                <span className={styles.evidenceLabel}>Prompt Lab</span>
                <strong className={styles.evidenceValue}>{evidenceSnapshot.promptExperiments}</strong>
              </div>
              <div className={styles.evidenceItem}>
                <span className={styles.evidenceLabel}>Примеры из чата</span>
                <strong className={styles.evidenceValue}>{evidenceSnapshot.chatTraining}</strong>
              </div>
              <div className={styles.evidenceItem}>
                <span className={styles.evidenceLabel}>Примеры обучения</span>
                <strong className={styles.evidenceValue}>{evidenceSnapshot.datasetRows}</strong>
              </div>
              <div className={styles.evidenceItem}>
                <span className={styles.evidenceLabel}>Compare</span>
                <strong className={styles.evidenceValue}>{evidenceSnapshot.compareRuns}</strong>
              </div>
              <div className={styles.evidenceItem}>
                <span className={styles.evidenceLabel}>Arena</span>
                <strong className={styles.evidenceValue}>{evidenceSnapshot.benchmarkRuns}</strong>
              </div>
              <div className={styles.evidenceItem}>
                <span className={styles.evidenceLabel}>Процесс обучения</span>
                <strong className={styles.evidenceValue}>{evidenceSnapshot.pipelineActions}</strong>
              </div>
            </div>
            <p className={styles.evidenceHint}>{progressSourceSummary}</p>
          </section>
        ) : null}

        <div className={styles.campaignPathCard} aria-live="polite">
          <div>
            <p className={styles.campaignPathTitle}>Текущая миссия</p>
            {progression.allCompleted ? (
              <p className={styles.campaignPathMeta}>
                Все миссии курса закрыты. Теперь можно делать новые циклы: найти слабое место, улучшить ИИ и
                проверить результат.
              </p>
            ) : activeLesson && activeLessonState ? (
              <>
                <p className={styles.campaignPathMeta}>
                  Сейчас в работе: миссия {activeLessonState.lessonIndex + 1} — «{activeLesson.title}».{" "}
                  {activeLesson.learningGoal}
                </p>
                <p className={styles.campaignPathMeta} style={{ marginTop: "0.45rem" }}>
                  Что должно получиться: <strong>{activeLesson.artifactGoal}</strong>
                </p>
                <p className={styles.campaignPathMeta} style={{ marginTop: "0.45rem" }}>
                  Подтверждено: {activeLessonState.evidence.completedCount}/{activeLessonState.evidence.totalCount}
                </p>
                <p className={styles.campaignPathMeta} style={{ marginTop: "0.45rem" }}>
                  {activeLessonState.nextRequiredAction
                    ? `Чтобы закрыть миссию: ${activeLessonState.nextRequiredAction}.`
                    : "Ключевые результаты этой миссии уже есть."}
                </p>
              </>
            ) : (
              <p className={styles.campaignPathMeta}>Начни с первой миссии — она всегда доступна.</p>
            )}
          </div>
          <div className={styles.campaignPathActions}>
            {progression.allCompleted ? (
              <span className={styles.campaignPathDone}>Курс завершён</span>
            ) : activeLesson ? (
              <Link to={studentCourseLessonPath(activeLesson.id)} className={styles.campaignPathBtn}>
                Открыть миссию
              </Link>
            ) : (
              <Link to={studentCourseLessonPath(TRAINING_COURSE.lessons[0].id)} className={styles.campaignPathBtn}>
                Старт: миссия 1
              </Link>
            )}
            <Link to={routes.studentAiGrowth} className={styles.campaignLink}>
              Мой ИИ
            </Link>
          </div>
        </div>

        <section className={styles.roadmap} aria-label="Карта миссий курса">
          <h2 className={styles.roadTitle}>Карта миссий</h2>
          <div className={styles.lessonGrid}>
            {courseReadModel.missions.map(({ lesson, lessonState, statusLabel, evidenceLine }, index) => {
              const status = lessonState.status;
              const locked = status === "locked";
              const actionGuide = getLessonActionGuide(lesson.id);
              const inner = (
                <>
                  <span
                    className={`${styles.lessonCardIndex} ${
                      status === "completed"
                        ? styles.lessonCardIndexDone
                        : locked
                          ? styles.lessonCardIndexLocked
                          : ""
                    }`}
                    aria-hidden
                  >
                    {index + 1}
                  </span>
                  <h3 className={styles.lessonCardTitle}>{lesson.title}</h3>
                  <p className={styles.lessonCardDesc}>{lesson.description}</p>
                  <div className={styles.lessonActionBox}>
                    <p>
                      <strong>Первое действие:</strong> {actionGuide.action}
                    </p>
                    <p>
                      <strong>Где работаешь:</strong> {actionGuide.surface}
                    </p>
                    <p>
                      <strong>Что получится:</strong> {actionGuide.result}
                    </p>
                  </div>
                  <div className={styles.lessonCardMeta}>
                    <span className={styles.tagParadigm}>{paradigmLabel(lesson.paradigmType)}</span>
                    <span className={styles.tagDuration}>
                      <ClockIcon width={14} height={14} aria-hidden />
                      &nbsp;{lesson.durationMinutes} мин
                    </span>
                  </div>
                  <p className={styles.campaignPathMeta} style={{ marginTop: "0.6rem", maxWidth: "none" }}>
                    Что нужно сохранить: {summarizeRequiredEvidence(lesson.requiredEvidence)}
                  </p>
                  <p className={styles.campaignPathMeta} style={{ marginTop: "0.35rem", maxWidth: "none" }}>
                    Уже сделано: {lessonState.evidence.completedCount}/{lessonState.evidence.totalCount}
                  </p>
                  <p className={styles.campaignPathMeta} style={{ marginTop: "0.35rem", maxWidth: "none" }}>
                    {locked
                      ? `Пока закрыто: ${lessonState.unlockReason}`
                      : `Можно открыть: ${lessonState.unlockReason}`}
                  </p>
                  <p className={styles.campaignPathMeta} style={{ marginTop: "0.35rem", maxWidth: "none" }}>
                    {locked
                      ? `Чтобы открыть: ${evidenceLine}`
                      : lessonState.nextRequiredAction
                        ? `Чтобы закрыть миссию: ${lessonState.nextRequiredAction}`
                        : "Ключевые результаты этой миссии уже есть."}
                  </p>
                  <div className={`${styles.statusStrip} ${statusClass(status)}`}>{statusLabel}</div>
                </>
              );

              if (locked) {
                return (
                  <div
                    key={lesson.id}
                    className={`${styles.lessonCard} ${styles.lessonCardLocked}`}
                    aria-label={`Миссия закрыта: ${lesson.title}`}
                  >
                    {inner}
                  </div>
                );
              }

              return (
                <Link
                  key={lesson.id}
                  to={studentCourseLessonPath(lesson.id)}
                  className={styles.lessonCard}
                  aria-label={`Открыть миссию: ${lesson.title}`}
                >
                  {inner}
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
