import { invoke, isTauri } from "@tauri-apps/api/core";

export type StudentModelCompareResult = {
  compareRunId: string;
  baseModel: string;
  trainedModelAlias: string | null;
  trainedAvailable: boolean;
  prompt: string;
  baseResponse: string;
  trainedResponse: string | null;
  indicators: string[];
  explanation: string;
  categoryTag: string | null;
  createdAt: string;
};

export type CompareRunHistoryItem = {
  compareRunId: string;
  prompt: string;
  baseModel: string;
  trainedModelName: string | null;
  trainedAvailable: boolean;
  baseOutput: string;
  trainedOutput: string | null;
  indicators: string[];
  explanation: string;
  categoryTag: string | null;
  createdAt: string;
};

export type CompareEvidenceSummary = {
  title: string;
  evidenceType: "compare_run_completed";
  headline: string;
};

export type PairwisePreferenceWinner = "left" | "right" | "draw";

export type PairwisePreferenceHistoryItem = {
  preferenceId: string;
  prompt: string;
  leftModelName: string;
  rightModelName: string;
  leftOutput: string;
  rightOutput: string;
  chosenWinner: PairwisePreferenceWinner;
  rationale: string;
  sourceSurface: string;
  compareRunId: string | null;
  createdAt: string;
};

function asObj(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object") throw new Error("Пустой ответ сравнения моделей.");
  return v as Record<string, unknown>;
}

function asIndicators(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.map((x) => String(x)) : [];
}

export async function compareStudentModels(
  studentEmail: string,
  prompt: string,
  categoryTag?: string | null,
): Promise<StudentModelCompareResult> {
  if (!isTauri()) throw new Error("Сравнение доступно только в Tauri.");
  const raw = await invoke<unknown>("compare_student_models_cmd", {
    studentEmail: studentEmail.trim(),
    prompt: prompt.trim(),
    categoryTag: categoryTag?.trim() ? categoryTag.trim() : null,
  });
  const o = asObj(raw);
  return {
    compareRunId: String(o.compareRunId ?? o.compare_run_id ?? ""),
    baseModel: String(o.baseModel ?? o.base_model ?? "qwen3:8b"),
    trainedModelAlias:
      o.trainedModelAlias ?? o.trained_model_alias
        ? String(o.trainedModelAlias ?? o.trained_model_alias)
        : null,
    trainedAvailable: Boolean(o.trainedAvailable ?? o.trained_available),
    prompt: String(o.prompt ?? ""),
    baseResponse: String(o.baseResponse ?? o.base_response ?? ""),
    trainedResponse:
      o.trainedResponse ?? o.trained_response
        ? String(o.trainedResponse ?? o.trained_response)
        : null,
    indicators: asIndicators(o.indicators),
    explanation: String(o.explanation ?? ""),
    categoryTag:
      o.categoryTag ?? o.category_tag ? String(o.categoryTag ?? o.category_tag) : null,
    createdAt: String(o.createdAt ?? o.created_at ?? ""),
  };
}

export async function fetchCompareRunHistory(
  studentEmail: string,
  limit = 8,
): Promise<CompareRunHistoryItem[]> {
  if (!isTauri() || !studentEmail.trim()) return [];
  const raw = await invoke<unknown[]>("list_compare_run_history_cmd", {
    studentEmail: studentEmail.trim(),
    limit,
  });
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const o = asObj(item);
    return {
      compareRunId: String(o.compareRunId ?? o.compare_run_id ?? ""),
      prompt: String(o.prompt ?? ""),
      baseModel: String(o.baseModel ?? o.base_model ?? ""),
      trainedModelName:
        o.trainedModelName ?? o.trained_model_name
          ? String(o.trainedModelName ?? o.trained_model_name)
          : null,
      trainedAvailable: Boolean(o.trainedAvailable ?? o.trained_available),
      baseOutput: String(o.baseOutput ?? o.base_output ?? ""),
      trainedOutput:
        o.trainedOutput ?? o.trained_output
          ? String(o.trainedOutput ?? o.trained_output)
          : null,
      indicators: asIndicators(o.indicators),
      explanation: String(o.explanation ?? ""),
      categoryTag:
        o.categoryTag ?? o.category_tag ? String(o.categoryTag ?? o.category_tag) : null,
      createdAt: String(o.createdAt ?? o.created_at ?? ""),
    };
  });
}

export function buildCompareEvidenceSummary(
  result: StudentModelCompareResult,
): CompareEvidenceSummary {
  return {
    title: "Compare",
    evidenceType: "compare_run_completed",
    headline: result.trainedAvailable
      ? "Сравнение base и trained сохранено как реальный результат проверки изменений модели."
      : "Сравнение сохранено, но для полной проверки нужно активировать обученную модель.",
  };
}

export async function savePairwisePreference(input: {
  studentEmail: string;
  prompt: string;
  leftModelName: string;
  rightModelName: string;
  leftOutput: string;
  rightOutput: string;
  chosenWinner: PairwisePreferenceWinner;
  rationale: string;
  sourceSurface: string;
  compareRunId?: string | null;
}): Promise<PairwisePreferenceHistoryItem> {
  if (!isTauri()) throw new Error("Сохранение preference доступно только в Tauri.");
  const raw = await invoke<unknown>("save_pairwise_preference_cmd", {
    studentEmail: input.studentEmail.trim(),
    prompt: input.prompt.trim(),
    leftModelName: input.leftModelName.trim(),
    rightModelName: input.rightModelName.trim(),
    leftOutput: input.leftOutput,
    rightOutput: input.rightOutput,
    chosenWinner: input.chosenWinner,
    rationale: input.rationale.trim(),
    sourceSurface: input.sourceSurface.trim(),
    compareRunId: input.compareRunId?.trim() ? input.compareRunId.trim() : null,
  });
  const o = asObj(raw);
  return {
    preferenceId: String(o.preferenceId ?? o.preference_id ?? ""),
    prompt: String(o.prompt ?? ""),
    leftModelName: String(o.leftModelName ?? o.left_model_name ?? ""),
    rightModelName: String(o.rightModelName ?? o.right_model_name ?? ""),
    leftOutput: String(o.leftOutput ?? o.left_output ?? ""),
    rightOutput: String(o.rightOutput ?? o.right_output ?? ""),
    chosenWinner: String(o.chosenWinner ?? o.chosen_winner ?? "draw") as PairwisePreferenceWinner,
    rationale: String(o.rationale ?? ""),
    sourceSurface: String(o.sourceSurface ?? o.source_surface ?? ""),
    compareRunId:
      o.compareRunId ?? o.compare_run_id ? String(o.compareRunId ?? o.compare_run_id) : null,
    createdAt: String(o.createdAt ?? o.created_at ?? ""),
  };
}

export async function fetchPairwisePreferenceHistory(
  studentEmail: string,
  limit = 8,
): Promise<PairwisePreferenceHistoryItem[]> {
  if (!isTauri() || !studentEmail.trim()) return [];
  const raw = await invoke<unknown[]>("list_pairwise_preferences_cmd", {
    studentEmail: studentEmail.trim(),
    limit,
  });
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const o = asObj(item);
    return {
      preferenceId: String(o.preferenceId ?? o.preference_id ?? ""),
      prompt: String(o.prompt ?? ""),
      leftModelName: String(o.leftModelName ?? o.left_model_name ?? ""),
      rightModelName: String(o.rightModelName ?? o.right_model_name ?? ""),
      leftOutput: String(o.leftOutput ?? o.left_output ?? ""),
      rightOutput: String(o.rightOutput ?? o.right_output ?? ""),
      chosenWinner: String(o.chosenWinner ?? o.chosen_winner ?? "draw") as PairwisePreferenceWinner,
      rationale: String(o.rationale ?? ""),
      sourceSurface: String(o.sourceSurface ?? o.source_surface ?? ""),
      compareRunId:
        o.compareRunId ?? o.compare_run_id ? String(o.compareRunId ?? o.compare_run_id) : null,
      createdAt: String(o.createdAt ?? o.created_at ?? ""),
    };
  });
}
