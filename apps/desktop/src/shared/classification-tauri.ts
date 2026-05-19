import { invoke, isTauri } from "@tauri-apps/api/core";

export type SubmitClassificationResponse = {
  isCorrect: boolean;
  correctAnswer: string;
  lessonProgressPercent: number;
  newXp: number;
  xpEarnedThisAttempt: number;
  firstCompletion: boolean;
};

function readFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const cleaned = value.trim().replace(/[\s\u00a0\u202f]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function readBool(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value == null) return false;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (s === "true" || s === "1") return true;
    return false;
  }
  return Boolean(value);
}

function normalizeSubmitClassificationResponse(
  raw: unknown,
): SubmitClassificationResponse {
  if (raw === null || raw === undefined) {
    throw new Error("Пустой ответ от приложения при проверке ответа.");
  }
  if (typeof raw !== "object") {
    throw new Error("Некорректный ответ от приложения при проверке ответа.");
  }
  const o = raw as Record<string, unknown>;
  const lessonRaw = o.lessonProgressPercent ?? o.lesson_progress_percent;
  const lessonProgressPercent = Math.round(readFiniteNumber(lessonRaw, 0));
  const newXpRaw = o.newXp ?? o.new_xp;
  const newXp = Math.round(readFiniteNumber(newXpRaw, 0));
  const xpEarnedRaw = o.xpEarnedThisAttempt ?? o.xp_earned_this_attempt;
  const xpEarnedThisAttempt = Math.round(readFiniteNumber(xpEarnedRaw, 0));
  return {
    isCorrect: readBool(o.isCorrect ?? o.is_correct),
    correctAnswer: String(o.correctAnswer ?? o.correct_answer ?? ""),
    lessonProgressPercent: Math.min(100, Math.max(0, lessonProgressPercent)),
    newXp,
    xpEarnedThisAttempt: Math.max(0, xpEarnedThisAttempt),
    firstCompletion: readBool(o.firstCompletion ?? o.first_completion),
  };
}

export type TaskStatusResponse = {
  completed: boolean;
};

export function classificationAvailable(): boolean {
  return isTauri();
}

export async function submitClassificationAttempt(payload: {
  studentEmail: string;
  lessonId: string;
  taskId: string;
  selectedAnswer: string;
}): Promise<SubmitClassificationResponse> {
  if (!isTauri()) {
    throw new Error(
      "Сохранение в SQLite доступно в десктоп-приложении (Tauri). В браузере откройте через pnpm tauri dev.",
    );
  }
  const raw = await invoke<unknown>("submit_classification_attempt_cmd", {
    studentEmail: payload.studentEmail,
    lessonId: payload.lessonId,
    taskId: payload.taskId,
    selectedAnswer: payload.selectedAnswer,
  });
  return normalizeSubmitClassificationResponse(raw);
}

export async function submitRankingAttempt(payload: {
  studentEmail: string;
  lessonId: string;
  taskId: string;
  rankedOrder: string[];
}): Promise<SubmitClassificationResponse> {
  if (!isTauri()) {
    throw new Error(
      "Сохранение в SQLite доступно в десктоп-приложении (Tauri). В браузере откройте через pnpm tauri dev.",
    );
  }
  const raw = await invoke<unknown>("submit_ranking_attempt_cmd", {
    studentEmail: payload.studentEmail,
    lessonId: payload.lessonId,
    taskId: payload.taskId,
    rankedOrderJson: JSON.stringify(payload.rankedOrder),
  });
  return normalizeSubmitClassificationResponse(raw);
}

export async function submitPolicyPathAttempt(payload: {
  studentEmail: string;
  lessonId: string;
  taskId: string;
  selectedAnswer: string;
}): Promise<SubmitClassificationResponse> {
  if (!isTauri()) {
    throw new Error(
      "Сохранение в SQLite доступно в десктоп-приложении (Tauri). В браузере откройте через pnpm tauri dev.",
    );
  }
  const raw = await invoke<unknown>("submit_policy_path_attempt_cmd", {
    studentEmail: payload.studentEmail,
    lessonId: payload.lessonId,
    taskId: payload.taskId,
    selectedAnswer: payload.selectedAnswer,
  });
  return normalizeSubmitClassificationResponse(raw);
}

export async function submitDataCleaningAttempt(payload: {
  studentEmail: string;
  lessonId: string;
  taskId: string;
  cleanIds: string[];
  noisyIds: string[];
}): Promise<SubmitClassificationResponse> {
  if (!isTauri()) {
    throw new Error(
      "Сохранение в SQLite доступно в десктоп-приложении (Tauri). В браузере откройте через pnpm tauri dev.",
    );
  }
  const selectionJson = JSON.stringify({
    clean: payload.cleanIds,
    noisy: payload.noisyIds,
  });
  const raw = await invoke<unknown>("submit_data_cleaning_attempt_cmd", {
    studentEmail: payload.studentEmail,
    lessonId: payload.lessonId,
    taskId: payload.taskId,
    selectionJson,
  });
  return normalizeSubmitClassificationResponse(raw);
}

export async function fetchClassificationTaskCompleted(payload: {
  studentEmail: string;
  taskId: string;
}): Promise<TaskStatusResponse> {
  if (!isTauri()) {
    return { completed: false };
  }
  return invoke<TaskStatusResponse>("classification_task_completed_cmd", {
    studentEmail: payload.studentEmail,
    taskId: payload.taskId,
  });
}
