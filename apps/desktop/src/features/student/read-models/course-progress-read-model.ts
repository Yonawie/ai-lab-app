import type { StudentArtifactSummary } from "@/shared/artifact-ledger-tauri";
import {
  buildCourseEvidenceSnapshot,
  deriveCourseProgression,
  type CourseProgressionReadModel,
  type LessonProgressionState,
} from "../course/course-lab-read-model";
import {
  getCourseProgressSourceSummary,
  type CampaignLessonStatus,
} from "../course/course-progress-storage";
import { TRAINING_COURSE, type Lesson } from "../course/training-course-model";

export type CourseMissionStatus = CampaignLessonStatus;

export type CourseMissionReadModel = {
  lesson: Lesson;
  lessonState: LessonProgressionState;
  statusLabel: string;
  evidenceLine: string;
};

export type CourseProgressReadModel = {
  title: string;
  description: string;
  doneCount: number;
  totalCount: number;
  evidenceSnapshot: ReturnType<typeof buildCourseEvidenceSnapshot>;
  progression: CourseProgressionReadModel;
  activeMission: CourseMissionReadModel | null;
  missions: CourseMissionReadModel[];
  progressSourceSummary: string;
};

function statusText(status: CampaignLessonStatus): string {
  if (status === "completed") return "Завершено";
  if (status === "unlocked") return "Доступно";
  return "Закрыто";
}

function evidenceLine(lessonState: LessonProgressionState): string {
  if (lessonState.evidence.totalCount === 0) {
    return "У этой миссии нет обязательных внешних проверок.";
  }
  if (lessonState.missingEvidence.length === 0) {
    return "Все нужные результаты для этой миссии уже есть.";
  }
  return lessonState.missingEvidence
    .map((item) => `${item.label}: ${item.currentCount}/${item.minCount}`)
    .join(" · ");
}

function toMissionReadModel(
  lesson: Lesson,
  lessonState: LessonProgressionState,
): CourseMissionReadModel {
  return {
    lesson,
    lessonState,
    statusLabel: statusText(lessonState.status),
    evidenceLine: evidenceLine(lessonState),
  };
}

export function buildCourseProgressReadModel(
  artifactSummary: StudentArtifactSummary | null,
  completedFallback: Set<string>,
): CourseProgressReadModel {
  const progression = deriveCourseProgression(artifactSummary, completedFallback);
  const evidenceSnapshot = buildCourseEvidenceSnapshot(artifactSummary);
  const missions = TRAINING_COURSE.lessons.map((lesson, index) =>
    toMissionReadModel(lesson, progression.lessons[index]),
  );
  const activeMissionIndex = progression.nextRecommendedLessonIndex;
  const activeMission =
    activeMissionIndex != null && missions[activeMissionIndex] ? missions[activeMissionIndex] : null;

  return {
    title: TRAINING_COURSE.title,
    description: TRAINING_COURSE.description,
    doneCount: missions.filter((mission) => mission.lessonState.status === "completed").length,
    totalCount: TRAINING_COURSE.lessons.length,
    evidenceSnapshot,
    progression,
    activeMission,
    missions,
    progressSourceSummary: getCourseProgressSourceSummary(),
  };
}
