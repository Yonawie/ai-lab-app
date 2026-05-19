import { invoke, isTauri } from "@tauri-apps/api/core";

/** Shown when Ollama/Tauri/backend is unavailable; lesson flow must continue. */
export const LESSON_AI_UNAVAILABLE_RU = "ИИ временно недоступен";

export type LessonCompanionReflectionInput = {
  studentEmail: string;
  lessonKey: string;
  lessonTitle: string;
  scene: string;
  stateSummary: string;
  studentChoice?: string;
  /** Short text continuation only (e.g. self-supervised tail); different system tail in backend. */
  plainCompletion?: boolean;
};

export type LessonCompanionEvidenceContext = {
  learningGoal: string;
  artifactGoal: string;
  requiredEvidence: string[];
};

function obj(raw: unknown, msg: string): Record<string, unknown> {
  if (!raw || typeof raw !== "object") throw new Error(msg);
  return raw as Record<string, unknown>;
}

/**
 * Short learner-voice line from the connected Ollama model (same path as chat training).
 * Safe to call after discrete lesson events; swallow errors — never throw to lesson logic.
 */
export async function fetchLessonCompanionReflection(
  input: LessonCompanionReflectionInput,
): Promise<string> {
  const email = input.studentEmail.trim();
  if (!isTauri() || !email) return LESSON_AI_UNAVAILABLE_RU;
  try {
    const raw = await invoke<unknown>("generate_lesson_companion_reflection_cmd", {
      studentEmail: email,
      lessonKey: input.lessonKey.trim(),
      lessonTitle: input.lessonTitle.trim(),
      scene: input.scene.trim(),
      stateSummary: input.stateSummary.trim(),
      studentChoice: input.studentChoice?.trim() ? input.studentChoice.trim() : null,
      plainCompletion: Boolean(input.plainCompletion),
    });
    const o = obj(raw, "Пустой ответ reflection.");
    const reflection = String(o.reflection ?? "").trim();
    return reflection || LESSON_AI_UNAVAILABLE_RU;
  } catch {
    return LESSON_AI_UNAVAILABLE_RU;
  }
}

export function buildLessonCompanionStateSummary(
  baseSummary: string,
  evidenceContext?: LessonCompanionEvidenceContext,
): string {
  const core = baseSummary.trim();
  if (!evidenceContext) return core;
  const parts = [
    core,
    `learning goal: ${evidenceContext.learningGoal}`,
    `artifact goal: ${evidenceContext.artifactGoal}`,
    `required evidence: ${evidenceContext.requiredEvidence.join(", ")}`,
  ];
  return parts.filter(Boolean).join(" | ");
}
