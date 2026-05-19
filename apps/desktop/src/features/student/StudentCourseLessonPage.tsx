import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useAuth } from "@/shared/auth-context";
import { ClockIcon } from "./StudentDashboardIcons";
import styles from "./StudentCourse.module.css";
import { CampaignSessionJourney } from "./course/CampaignSessionJourney";
import {
  COURSE_PROGRESS_STORAGE_KEY,
  getCompletedLessonIds,
  markLessonCompleted,
} from "./course/course-progress-storage";
import { Lesson1AlgorithmVsMlSession } from "./course/lesson1/Lesson1AlgorithmVsMlSession";
import { Lesson2SupervisedSession } from "./course/lesson2/Lesson2SupervisedSession";
import { Lesson3UnsupervisedSession } from "./course/lesson3/Lesson3UnsupervisedSession";
import { Lesson4RlSession } from "./course/lesson4/Lesson4RlSession";
import { Lesson5SslSession } from "./course/lesson5/Lesson5SslSession";
import { Lesson6FinalSession } from "./course/lesson6/Lesson6FinalSession";
import {
  COURSE_LESSON_1_ID,
  COURSE_LESSON_2_ID,
  COURSE_LESSON_3_ID,
  COURSE_LESSON_4_ID,
  COURSE_LESSON_5_ID,
  COURSE_LESSON_6_ID,
  getLessonActionGuide,
  getTrainingLessonById,
  paradigmLabel,
  summarizeRequiredEvidence,
  TRAINING_COURSE,
  type LessonSectionType,
} from "./course/training-course-model";
import { routes } from "@/shared/routes";
import {
  fetchStudentArtifactSummary,
  type StudentArtifactSummary,
} from "@/shared/artifact-ledger-tauri";
import { buildCourseProgressReadModel } from "./read-models/course-progress-read-model";

function sectionCardClass(type: LessonSectionType): string {
  const map: Record<LessonSectionType, string> = {
    intro: styles.sectionCardIntro,
    demo: styles.sectionCardDemo,
    gameplay: styles.sectionCardGameplay,
    lab: styles.sectionCardLab,
    summary: styles.sectionCardSummary,
    challenge: styles.sectionCardChallenge,
  };
  return `${styles.sectionCard} ${map[type]}`;
}

export function StudentCourseLessonPage() {
  const { userEmail } = useAuth();
  const studentEmail = (userEmail ?? "").trim();
  const { lessonId: rawId } = useParams<{ lessonId: string }>();
  const lessonId = rawId ? decodeURIComponent(rawId) : "";

  const lessonIndex = useMemo(
    () => TRAINING_COURSE.lessons.findIndex((l) => l.id === lessonId),
    [lessonId],
  );
  const lesson = useMemo(() => getTrainingLessonById(lessonId), [lessonId]);

  const [completedFallback, setCompletedFallback] = useState(() => getCompletedLessonIds());
  const [artifactSummary, setArtifactSummary] = useState<StudentArtifactSummary | null>(null);

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

  if (!lesson || lessonIndex < 0) {
    return (
      <div className={styles.page}>
        <div className={styles.gradients} aria-hidden>
          <div className={styles.blob1} />
          <div className={styles.blob2} />
        </div>
        <div className={styles.inner}>
          <div className={styles.notFound}>
            <p className={styles.notFoundTitle}>Сессия не найдена</p>
            <Link to={routes.studentCourse} className={styles.backLink}>
              ← К дорожной карте курса
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const courseReadModel = useMemo(
    () => buildCourseProgressReadModel(artifactSummary, completedFallback),
    [artifactSummary, completedFallback],
  );
  const lessonMission = courseReadModel.missions[lessonIndex] ?? null;
  const lessonState = lessonMission?.lessonState ?? null;
  const activeLessonId = courseReadModel.progression.nextRecommendedLessonId;

  if (!lessonState?.accessible) {
    return <Navigate to={routes.studentCourse} replace />;
  }

  const total = lesson.sections.length;
  const done = lessonState.status === "completed";
  const campaignPct = Math.round(((lessonIndex + 1) / courseReadModel.totalCount) * 100);
  const progressSourceSummary = courseReadModel.progressSourceSummary;
  const actionGuide = getLessonActionGuide(lesson.id);

  const onMarkComplete = () => {
    markLessonCompleted(lesson.id);
    setCompletedFallback(getCompletedLessonIds());
  };

  const completedEvidence = lessonState.completedEvidence.map((item) => item.label).join(" · ");
  const missingEvidence = lessonState.missingEvidence
    .map((item) => `${item.label}: ${item.currentCount}/${item.minCount}`)
    .join(" · ");

  return (
    <div className={styles.page}>
      <div className={styles.gradients} aria-hidden>
        <div className={styles.blob1} />
        <div className={styles.blob2} />
      </div>

      <div className={`${styles.inner} ${styles.innerWide}`}>
        <header className={styles.header}>
          <Link to={routes.studentCourse} className={styles.backLink}>
            ← К карте миссий
          </Link>
          <div className={styles.sessionHeader}>
            <div className={styles.sessionTitleBlock}>
              <h1 className={styles.sessionTitle}>{lesson.title}</h1>
              <div className={styles.sessionMeta}>
                <span className={styles.tagParadigm}>{paradigmLabel(lesson.paradigmType)}</span>
                <span className={styles.tagDuration}>
                  <ClockIcon width={14} height={14} aria-hidden />
                  &nbsp;{lesson.durationMinutes} мин · миссия
                </span>
              </div>
              <p className={styles.subtitle}>{lesson.description}</p>
            </div>

            <div className={styles.stepRail}>
              <span className={styles.stepRailLabel}>
                Место в курсе: миссия {lessonIndex + 1} из {courseReadModel.totalCount}
              </span>
              <div className={styles.stepDots} role="list" aria-label="Шаги сессии">
                {lesson.sections.map((s, i) => (
                  <span
                    key={s.id}
                    role="listitem"
                    className={i === 0 ? `${styles.stepDot} ${styles.stepDotActive}` : styles.stepDot}
                    title={s.title}
                  />
                ))}
              </div>
              <div className={styles.progressBar} aria-hidden>
                <div className={styles.progressBarFill} style={{ width: `${campaignPct}%` }} />
              </div>
            </div>
          </div>
        </header>

        <section className={styles.evidenceCard} aria-label="Практический старт миссии">
          <div className={styles.evidenceHead}>
            <div>
              <p className={styles.evidenceEyebrow}>Старт миссии</p>
              <h2 className={styles.evidenceTitle}>Сначала действие, потом разбор</h2>
            </div>
            <span className={styles.evidenceTotal}>
              {lessonState.evidence.completedCount}/{lessonState.evidence.totalCount}
            </span>
          </div>
          <div className={styles.missionActionGrid}>
            <div className={styles.missionActionItem}>
              <span>1</span>
              <strong>Что сделать</strong>
              <p>{actionGuide.action}</p>
            </div>
            <div className={styles.missionActionItem}>
              <span>2</span>
              <strong>Где работать</strong>
              <p>{actionGuide.surface}</p>
            </div>
            <div className={styles.missionActionItem}>
              <span>3</span>
              <strong>Что получится</strong>
              <p>{actionGuide.result}</p>
            </div>
          </div>
          <div className={styles.evidenceGrid}>
            <div className={styles.evidenceItem}>
              <span className={styles.evidenceLabel}>Зачем это нужно</span>
              <strong className={styles.evidenceValue}>{lesson.learningGoal}</strong>
            </div>
            <div className={styles.evidenceItem}>
              <span className={styles.evidenceLabel}>Результат миссии</span>
              <strong className={styles.evidenceValue}>{lesson.artifactGoal}</strong>
            </div>
            <div className={styles.evidenceItem}>
              <span className={styles.evidenceLabel}>Что нужно сохранить</span>
              <strong className={styles.evidenceValue}>
                {summarizeRequiredEvidence(lesson.requiredEvidence)}
              </strong>
            </div>
            <div className={styles.evidenceItem}>
              <span className={styles.evidenceLabel}>Какой навык качаем</span>
              <strong className={styles.evidenceValue}>{lesson.engineeringSkillFocus.join(", ")}</strong>
            </div>
            <div className={styles.evidenceItem}>
              <span className={styles.evidenceLabel}>Уже есть</span>
              <strong className={styles.evidenceValue}>
                {completedEvidence || "Пока нет сохранённых результатов"}
              </strong>
            </div>
            <div className={styles.evidenceItem}>
              <span className={styles.evidenceLabel}>Что осталось сделать</span>
              <strong className={styles.evidenceValue}>
                {missingEvidence || "Для этой миссии всё готово"}
              </strong>
            </div>
          </div>
          <p className={styles.evidenceHint}>
            Практика в миссии: {lesson.realAiActions.join(" · ")}
          </p>
          <p className={styles.evidenceHint}>{lessonState.unlockReason}</p>
          <p className={styles.evidenceHint}>
            {lessonState.nextRequiredAction
              ? `Чтобы завершить миссию: ${lessonState.nextRequiredAction}.`
              : "Нужные результаты уже есть. Можно завершить миссию или перейти к следующей."}
          </p>
          <p className={styles.evidenceHint}>
            {activeLessonId === lesson.id
              ? "Сейчас эта миссия лучше всего продолжает курс."
              : "Эта миссия доступна. Курс учитывает результаты, которые ты уже сохранил в AI Lab."}
          </p>
          <p className={styles.evidenceHint}>{progressSourceSummary}</p>
        </section>

        <CampaignSessionJourney lessonId={lesson.id} />

        {lesson.id === COURSE_LESSON_1_ID ? (
          <Lesson1AlgorithmVsMlSession
            lesson={lesson}
            courseStyles={styles}
            sectionCardClass={sectionCardClass}
            done={done}
            onMarkComplete={onMarkComplete}
            studentEmail={studentEmail}
          />
        ) : lesson.id === COURSE_LESSON_2_ID ? (
          <Lesson2SupervisedSession
            lesson={lesson}
            courseStyles={styles}
            sectionCardClass={sectionCardClass}
            done={done}
            onMarkComplete={onMarkComplete}
            studentEmail={studentEmail}
          />
        ) : lesson.id === COURSE_LESSON_3_ID ? (
          <Lesson3UnsupervisedSession
            lesson={lesson}
            courseStyles={styles}
            sectionCardClass={sectionCardClass}
            done={done}
            onMarkComplete={onMarkComplete}
            studentEmail={studentEmail}
          />
        ) : lesson.id === COURSE_LESSON_4_ID ? (
          <Lesson4RlSession
            lesson={lesson}
            courseStyles={styles}
            sectionCardClass={sectionCardClass}
            done={done}
            onMarkComplete={onMarkComplete}
            studentEmail={studentEmail}
          />
        ) : lesson.id === COURSE_LESSON_5_ID ? (
          <Lesson5SslSession
            lesson={lesson}
            courseStyles={styles}
            sectionCardClass={sectionCardClass}
            done={done}
            onMarkComplete={onMarkComplete}
            studentEmail={studentEmail}
          />
        ) : lesson.id === COURSE_LESSON_6_ID ? (
          <Lesson6FinalSession
            lesson={lesson}
            courseStyles={styles}
            sectionCardClass={sectionCardClass}
            done={done}
            onMarkComplete={onMarkComplete}
            studentEmail={studentEmail}
          />
        ) : (
          <>
            <div className={styles.sectionsStack}>
              {lesson.sections.map((section, i) => (
                <article
                  key={section.id}
                  id={`section-${section.id}`}
                  className={sectionCardClass(section.type)}
                  aria-labelledby={`heading-${section.id}`}
                >
                  <div className={styles.sectionHead}>
                    <h2 id={`heading-${section.id}`} className={styles.sectionTitle}>
                      {section.title}
                    </h2>
                    <span className={styles.sectionStep}>Шаг {i + 1}/{total}</span>
                  </div>
                  <p className={styles.sectionBody}>{section.content}</p>
                  {(section.type === "gameplay" || section.type === "lab") && (
                    <div className={styles.gameplayPlaceholder}>
                      Выполни действие в связанном инструменте AI Lab: создай результат, сохрани пример
                      обучения или проверь модель. После этого вернись сюда и отметь сессию завершенной.
                    </div>
                  )}
                </article>
              ))}
            </div>

            <div className={styles.sectionCard}>
              <div className={styles.completeRow}>
                <button type="button" className={styles.btnComplete} onClick={onMarkComplete} disabled={done}>
                  {done ? "Сессия уже отмечена как завершённая" : "Отметить сессию завершённой"}
                </button>
                <p className={styles.completeHint}>{progressSourceSummary}</p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
