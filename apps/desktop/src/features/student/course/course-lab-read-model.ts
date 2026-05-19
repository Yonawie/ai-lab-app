import type { StudentArtifactSummary, StudentArtifactType } from "@/shared/artifact-ledger-tauri";
import type { CampaignLessonStatus } from "./course-progress-storage";
import type { Lesson, RequiredEvidenceRule } from "./training-course-model";
import { TRAINING_COURSE } from "./training-course-model";

export type LessonEvidenceStatus = {
  completedCount: number;
  totalCount: number;
  completed: boolean;
  items: Array<
    RequiredEvidenceRule & {
      currentCount: number;
      done: boolean;
      remainingCount: number;
      actionText: string;
    }
  >;
};

export type LessonProgressSource = "artifact" | "hybrid_fallback" | "fallback_only";

export type LessonProgressionState = {
  lessonId: string;
  lessonIndex: number;
  status: CampaignLessonStatus;
  accessible: boolean;
  source: LessonProgressSource;
  evidence: LessonEvidenceStatus;
  completedEvidence: LessonEvidenceStatus["items"];
  missingEvidence: LessonEvidenceStatus["items"];
  nextRequiredEvidence: LessonEvidenceStatus["items"][number] | null;
  unlockReason: string;
  nextRequiredAction: string | null;
};

export type CourseProgressionReadModel = {
  lessons: LessonProgressionState[];
  nextRecommendedLessonId: string | null;
  nextRecommendedLessonIndex: number | null;
  nextRequiredAction: string | null;
  allCompleted: boolean;
};

const ARTIFACT_ACTION_TEXT: Record<StudentArtifactType, string> = {
  prompt_experiment_saved: "сохрани эксперимент в Prompt Lab",
  chat_training_saved: "сохрани пример обучения",
  dataset_example_added: "добавь пример обучения",
  dataset_exported: "подготовь данные для обучения",
  lora_adapter_registered: "подключи обученную модель",
  trained_model_activated: "включи обученную модель",
  compare_run_completed: "сохрани проверку в Compare",
  benchmark_eval_completed: "запусти проверку на задачах в Arena",
  pairwise_preference_saved: "сохрани выбор лучшего ответа в Compare",
  ai_studio_project_created: "создай проект в AI Studio",
  ai_studio_version_saved: "сохрани новую версию проекта в AI Studio",
};

export function getArtifactCount(
  artifactSummary: StudentArtifactSummary | null,
  artifactType: StudentArtifactType,
): number {
  return artifactSummary?.countsByType?.[artifactType] ?? 0;
}

function buildRuleStatus(
  rule: RequiredEvidenceRule,
  artifactSummary: StudentArtifactSummary | null,
): LessonEvidenceStatus["items"][number] {
  const currentCount = getArtifactCount(artifactSummary, rule.artifactType);
  const remainingCount = Math.max(0, rule.minCount - currentCount);
  return {
    ...rule,
    currentCount,
    done: currentCount >= rule.minCount,
    remainingCount,
    actionText: ARTIFACT_ACTION_TEXT[rule.artifactType],
  };
}

export function summarizeLessonEvidence(
  lesson: Lesson,
  artifactSummary: StudentArtifactSummary | null,
): LessonEvidenceStatus {
  const items = lesson.requiredEvidence.map((rule) => buildRuleStatus(rule, artifactSummary));
  const completedCount = items.filter((item) => item.done).length;
  return {
    completedCount,
    totalCount: items.length,
    completed: items.length > 0 && completedCount === items.length,
    items,
  };
}

export function findNextRequiredEvidence(
  lesson: Lesson,
  artifactSummary: StudentArtifactSummary | null,
) {
  return summarizeLessonEvidence(lesson, artifactSummary).items.find((item) => !item.done) ?? null;
}

export function buildCourseEvidenceSnapshot(artifactSummary: StudentArtifactSummary | null) {
  const promptExperiments = getArtifactCount(artifactSummary, "prompt_experiment_saved");
  const chatTraining = getArtifactCount(artifactSummary, "chat_training_saved");
  const datasetRows = getArtifactCount(artifactSummary, "dataset_example_added");
  const compareRuns = getArtifactCount(artifactSummary, "compare_run_completed");
  const benchmarkRuns = getArtifactCount(artifactSummary, "benchmark_eval_completed");
  const pipelineActions =
    getArtifactCount(artifactSummary, "dataset_exported") +
    getArtifactCount(artifactSummary, "lora_adapter_registered") +
    getArtifactCount(artifactSummary, "trained_model_activated");

  return {
    promptExperiments,
    chatTraining,
    datasetRows,
    compareRuns,
    benchmarkRuns,
    pipelineActions,
    totalEvidence:
      promptExperiments +
      chatTraining +
      datasetRows +
      compareRuns +
      benchmarkRuns +
      pipelineActions,
  };
}

function buildUnlockReason(input: {
  lesson: Lesson;
  lessonIndex: number;
  evidence: LessonEvidenceStatus;
  artifactAvailable: boolean;
  fallbackCompleted: boolean;
  previousCompletedByEvidence: boolean;
  previousCompletedByFallback: boolean;
}): { status: CampaignLessonStatus; source: LessonProgressSource; unlockReason: string } {
  const {
    lesson,
    lessonIndex,
    evidence,
    artifactAvailable,
    fallbackCompleted,
    previousCompletedByEvidence,
    previousCompletedByFallback,
  } = input;

  if (artifactAvailable && evidence.completed) {
    return {
      status: "completed",
      source: "artifact",
      unlockReason: "Миссия закрыта: нужные результаты уже есть.",
    };
  }

  if (fallbackCompleted) {
    return {
      status: "completed",
      source: artifactAvailable ? "hybrid_fallback" : "fallback_only",
      unlockReason:
        "Миссия была закрыта раньше. Можно продолжать курс и при необходимости улучшить результат.",
    };
  }

  if (lessonIndex === 0) {
    return {
      status: "unlocked",
      source: artifactAvailable ? "artifact" : "fallback_only",
      unlockReason: "Первая миссия открыта сразу. Её задача — сделать первый реальный запуск ИИ.",
    };
  }

  if (artifactAvailable && previousCompletedByEvidence) {
    return {
      status: "unlocked",
      source: "artifact",
      unlockReason: "Миссия открыта, потому что предыдущий результат уже есть.",
    };
  }

  if (previousCompletedByFallback) {
    return {
      status: "unlocked",
      source: artifactAvailable ? "hybrid_fallback" : "fallback_only",
      unlockReason: "Миссия открыта, потому что предыдущий шаг уже завершён.",
    };
  }

  const nextRequired = evidence.items.find((item) => !item.done);
  return {
    status: "locked",
    source: artifactAvailable ? "artifact" : "fallback_only",
    unlockReason: nextRequired
      ? `Сначала нужно ${nextRequired.actionText} в предыдущей миссии.`
      : `Миссия «${lesson.title}» пока закрыта: заверши предыдущий шаг курса.`,
  };
}

export function deriveCourseProgression(
  artifactSummary: StudentArtifactSummary | null,
  fallbackCompletedLessonIds: Set<string>,
): CourseProgressionReadModel {
  const artifactAvailable = artifactSummary !== null;
  const lessons: LessonProgressionState[] = [];

  for (let lessonIndex = 0; lessonIndex < TRAINING_COURSE.lessons.length; lessonIndex += 1) {
    const lesson = TRAINING_COURSE.lessons[lessonIndex];
    const evidence = summarizeLessonEvidence(lesson, artifactSummary);
    const previous = lessons[lessonIndex - 1] ?? null;
    const fallbackCompleted = fallbackCompletedLessonIds.has(lesson.id);
    const previousCompletedByEvidence = previous?.source === "artifact" && previous.status === "completed";
    const previousCompletedByFallback =
      (previous?.status === "completed" && previous?.source !== "artifact") ?? false;

    const { status, source, unlockReason } = buildUnlockReason({
      lesson,
      lessonIndex,
      evidence,
      artifactAvailable,
      fallbackCompleted,
      previousCompletedByEvidence: Boolean(previousCompletedByEvidence),
      previousCompletedByFallback: Boolean(previousCompletedByFallback),
    });

    const missingEvidence = evidence.items.filter((item) => !item.done);
    const completedEvidence = evidence.items.filter((item) => item.done);
    const nextRequiredEvidence = missingEvidence[0] ?? null;

    lessons.push({
      lessonId: lesson.id,
      lessonIndex,
      status,
      accessible: status !== "locked",
      source,
      evidence,
      completedEvidence,
      missingEvidence,
      nextRequiredEvidence,
      unlockReason,
      nextRequiredAction: nextRequiredEvidence
        ? `${nextRequiredEvidence.actionText} (${nextRequiredEvidence.currentCount}/${nextRequiredEvidence.minCount})`
        : null,
    });
  }

  const nextRecommended =
    lessons.find((lesson) => lesson.status === "unlocked") ??
    lessons.find((lesson) => lesson.status === "locked") ??
    null;

  return {
    lessons,
    nextRecommendedLessonId: nextRecommended?.lessonId ?? null,
    nextRecommendedLessonIndex: nextRecommended?.lessonIndex ?? null,
    nextRequiredAction: nextRecommended?.nextRequiredAction ?? null,
    allCompleted: lessons.length > 0 && lessons.every((lesson) => lesson.status === "completed"),
  };
}

export function getLessonProgressionState(
  lessonId: string,
  artifactSummary: StudentArtifactSummary | null,
  fallbackCompletedLessonIds: Set<string>,
): LessonProgressionState | null {
  return (
    deriveCourseProgression(artifactSummary, fallbackCompletedLessonIds).lessons.find(
      (lesson) => lesson.lessonId === lessonId,
    ) ?? null
  );
}
