/**
 * Compatibility-only local UI progression for the student course shell.
 * Real course progression is derived from lab results; this file simply keeps
 * older local completion markers working during migration.
 */

import { TRAINING_COURSE } from "./training-course-model";

export const COURSE_PROGRESS_STORAGE_KEY = "ai-lab-student-training-course-completed-v1";
export const COURSE_PROGRESS_SOURCE = "fallback_local_ui_state";

function readIds(): string[] {
  try {
    const raw = localStorage.getItem(COURSE_PROGRESS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

function writeIds(ids: string[]) {
  localStorage.setItem(COURSE_PROGRESS_STORAGE_KEY, JSON.stringify(ids));
}

export function getCompletedLessonIds(): Set<string> {
  return new Set(readIds());
}

export type CampaignLessonStatus = "locked" | "unlocked" | "completed";

export function getLessonCampaignStatus(
  lessonIndex: number,
  lessonId: string,
  completed: Set<string>,
): CampaignLessonStatus {
  if (completed.has(lessonId)) return "completed";
  if (lessonIndex === 0) return "unlocked";
  const prev = TRAINING_COURSE.lessons[lessonIndex - 1];
  if (prev && completed.has(prev.id)) return "unlocked";
  return "locked";
}

export function markLessonCompleted(lessonId: string) {
  const ids = readIds();
  if (!ids.includes(lessonId)) {
    ids.push(lessonId);
    writeIds(ids);
  }
  window.dispatchEvent(new Event("ai-lab-course-progress"));
}

export function isLessonAccessible(
  lessonIndex: number,
  lessonId: string,
  completed: Set<string>,
): boolean {
  return getLessonCampaignStatus(lessonIndex, lessonId, completed) !== "locked";
}

export type CampaignJourneySummary = {
  completedCount: number;
  totalLessons: number;
  activeLessonIndex: number | null;
  activeLessonId: string | null;
  allCompleted: boolean;
};

export function getCampaignJourneySummary(completed: Set<string>): CampaignJourneySummary {
  const lessons = TRAINING_COURSE.lessons;
  const totalLessons = lessons.length;
  let completedCount = 0;
  let activeLessonIndex: number | null = null;
  let activeLessonId: string | null = null;

  for (let i = 0; i < lessons.length; i += 1) {
    const id = lessons[i].id;
    if (completed.has(id)) {
      completedCount += 1;
      continue;
    }
    const st = getLessonCampaignStatus(i, id, completed);
    if (st === "unlocked") {
      activeLessonIndex = i;
      activeLessonId = id;
      break;
    }
  }

  const allCompleted = completedCount >= totalLessons;

  return {
    completedCount,
    totalLessons,
    activeLessonIndex: allCompleted ? null : activeLessonIndex,
    activeLessonId: allCompleted ? null : activeLessonId,
    allCompleted,
  };
}

export function getCourseProgressSourceSummary(): string {
  return "Курс учитывает реальные результаты из AI Lab и помогает продолжить с нужного шага.";
}
