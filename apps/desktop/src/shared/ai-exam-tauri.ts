import { invoke, isTauri } from "@tauri-apps/api/core";

export type AiExamBlueprint = {
  version: string;
  labTitle: string;
  missionTitle: string;
  missionLead: string;
  steps: AiExamStep[];
};

export type AiExamStep = {
  id: string;
  skill: string;
  title: string;
  subtitle: string;
  instructions: string;
  payload: Record<string, unknown>;
};

export type AiExamSubmitResult = {
  examRunId: string;
  totalScore: number;
  skillScores: Record<string, number>;
  strengths: string[];
  weaknesses: string[];
  recommendation: string;
  createdAt: string;
};

function obj(raw: unknown, message: string): Record<string, unknown> {
  if (!raw || typeof raw !== "object") throw new Error(message);
  return raw as Record<string, unknown>;
}

function asBlueprint(raw: unknown): AiExamBlueprint {
  const source = obj(raw, "Пустой ответ схемы экзамена.");
  const stepsRaw = source.steps ?? source.Steps;
  if (!Array.isArray(stepsRaw)) {
    throw new Error("Экзамен: отсутствует массив steps.");
  }

  const steps: AiExamStep[] = stepsRaw.map((item, index) => {
    const step = obj(item, `Шаг ${index + 1} экзамена поврежден.`);
    return {
      id: String(step.id ?? ""),
      skill: String(step.skill ?? ""),
      title: String(step.title ?? ""),
      subtitle: String(step.subtitle ?? ""),
      instructions: String(step.instructions ?? ""),
      payload:
        step.payload && typeof step.payload === "object"
          ? (step.payload as Record<string, unknown>)
          : {},
    };
  });

  return {
    version: String(source.version ?? ""),
    labTitle: String(source.labTitle ?? source.lab_title ?? "Лаборатория оценки ИИ"),
    missionTitle: String(source.missionTitle ?? source.mission_title ?? ""),
    missionLead: String(source.missionLead ?? source.mission_lead ?? ""),
    steps,
  };
}

export function aiExamAvailable(): boolean {
  return isTauri();
}

export async function fetchAiExamBlueprint(): Promise<AiExamBlueprint> {
  if (!isTauri()) {
    throw new Error("Экзамен доступен только в десктоп-сборке Tauri.");
  }
  const raw = await invoke<unknown>("get_ai_exam_blueprint_cmd");
  return asBlueprint(raw);
}

export type ExamAnswersPayload = Record<string, unknown>;

export async function submitAiExam(
  studentEmail: string,
  answers: ExamAnswersPayload,
): Promise<AiExamSubmitResult> {
  if (!isTauri()) {
    throw new Error("Сдача экзамена доступна только в Tauri.");
  }
  const raw = await invoke<unknown>("submit_ai_exam_cmd", {
    studentEmail: studentEmail.trim(),
    answersJson: JSON.stringify(answers),
  });
  const source = obj(raw, "Пустой ответ после сдачи экзамена.");
  const scoresRaw = source.skillScores ?? source.skill_scores;
  const skillScores: Record<string, number> = {};

  if (scoresRaw && typeof scoresRaw === "object" && !Array.isArray(scoresRaw)) {
    for (const [key, value] of Object.entries(scoresRaw as Record<string, unknown>)) {
      const numeric = typeof value === "number" ? value : Number(value);
      if (Number.isFinite(numeric)) {
        skillScores[key] = numeric;
      }
    }
  }

  const toStringList = (value: unknown): string[] =>
    Array.isArray(value) ? value.map((item) => String(item)) : [];

  return {
    examRunId: String(source.examRunId ?? source.exam_run_id ?? ""),
    totalScore: Math.round(Number(source.totalScore ?? source.total_score ?? 0)),
    skillScores,
    strengths: toStringList(source.strengths),
    weaknesses: toStringList(source.weaknesses),
    recommendation: String(source.recommendation ?? ""),
    createdAt: String(source.createdAt ?? source.created_at ?? ""),
  };
}
