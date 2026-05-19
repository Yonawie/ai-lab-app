import { invoke, isTauri } from "@tauri-apps/api/core";

export type CompanionPersonalityType =
  | "explorer"
  | "mentor"
  | "strategist"
  | "inventor";

export type StudentAiCompanion = {
  name: string;
  stage: number;
  personalityType: CompanionPersonalityType | string;
  logic: number;
  creativity: number;
  empathy: number;
  focus: number;
};

function readInt(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value.trim().replace(/[\s\u00a0\u202f]/g, ""));
    return Number.isFinite(n) ? Math.round(n) : fallback;
  }
  return fallback;
}

function normalizeCompanion(raw: unknown): StudentAiCompanion {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    throw new Error("Пустой ответ при загрузке компаньона.");
  }
  const o = raw as Record<string, unknown>;
  const pt =
    o.personalityType ?? o.personality_type ?? "explorer";
  return {
    name: String(o.name ?? ""),
    stage: readInt(o.stage, 1),
    personalityType: String(pt),
    logic: readInt(o.logic, 5),
    creativity: readInt(o.creativity, 5),
    empathy: readInt(o.empathy, 5),
    focus: readInt(o.focus, 5),
  };
}

export function companionDataAvailable(): boolean {
  return isTauri();
}

export async function fetchStudentAiCompanion(
  studentEmail: string,
): Promise<StudentAiCompanion | null> {
  if (!isTauri() || !studentEmail.trim()) return null;
  const raw = await invoke<unknown>("get_student_ai_companion_cmd", {
    studentEmail: studentEmail.trim(),
  });
  return normalizeCompanion(raw);
}

export type ModelTrainingStatus = {
  modelType: string;
  datasetSize: number;
  accuracy: number;
  lastTrainedAt: string | null;
};

export type TrainModelResult = {
  previousAccuracy: number;
  newAccuracy: number;
  datasetSize: number;
  improvement: number;
  lastTrainedAt: string;
};

function readFloat(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value.trim().replace(/[\s\u00a0\u202f]/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function normalizeTrainingStatus(raw: unknown): ModelTrainingStatus {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    throw new Error("Пустой ответ при загрузке статуса модели.");
  }
  const o = raw as Record<string, unknown>;
  const last =
    o.lastTrainedAt ?? o.last_trained_at ?? null;
  return {
    modelType: String(o.modelType ?? o.model_type ?? "baseline_classifier"),
    datasetSize: readInt(o.datasetSize ?? o.dataset_size, 0),
    accuracy: readFloat(o.accuracy, 0),
    lastTrainedAt:
      last == null || last === ""
        ? null
        : String(last),
  };
}

function normalizeTrainResult(raw: unknown): TrainModelResult {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    throw new Error("Пустой ответ после обучения модели.");
  }
  const o = raw as Record<string, unknown>;
  return {
    previousAccuracy: readFloat(o.previousAccuracy ?? o.previous_accuracy, 0),
    newAccuracy: readFloat(o.newAccuracy ?? o.new_accuracy, 0),
    datasetSize: readInt(o.datasetSize ?? o.dataset_size, 0),
    improvement: readFloat(o.improvement, 0),
    lastTrainedAt: String(o.lastTrainedAt ?? o.last_trained_at ?? ""),
  };
}

export async function fetchModelTrainingStatus(
  studentEmail: string,
): Promise<ModelTrainingStatus | null> {
  if (!isTauri() || !studentEmail.trim()) return null;
  const raw = await invoke<unknown>("get_model_training_status_cmd", {
    studentEmail: studentEmail.trim(),
  });
  return normalizeTrainingStatus(raw);
}

export async function trainStudentModel(
  studentEmail: string,
): Promise<TrainModelResult> {
  if (!isTauri()) {
    throw new Error(
      "Обучение доступно в десктоп-приложении (Tauri). В браузере откройте через pnpm tauri dev.",
    );
  }
  const raw = await invoke<unknown>("train_student_model_cmd", {
    studentEmail: studentEmail.trim(),
  });
  return normalizeTrainResult(raw);
}
