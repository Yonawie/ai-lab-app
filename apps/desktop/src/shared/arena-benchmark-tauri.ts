import { invoke, isTauri } from "@tauri-apps/api/core";

export type BenchmarkRunHistoryItem = {
  benchmarkRunId: string;
  mode: "base" | "pvp";
  benchmarkMissionId: string;
  benchmarkTitle: string;
  benchmarkCategory: string;
  prompt: string;
  primaryModelName: string;
  secondaryModelName: string | null;
  primaryOutput: string;
  secondaryOutput: string | null;
  resultWinner: string;
  indicators: string[];
  explanation: string;
  opponentStudentEmail: string | null;
  createdAt: string;
};

function asObj(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object") throw new Error("Пустой ответ сохранённой проверки Arena.");
  return v as Record<string, unknown>;
}

function toNullableString(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function mapHistoryItem(raw: unknown): BenchmarkRunHistoryItem {
  const o = asObj(raw);
  return {
    benchmarkRunId: String(o.benchmarkRunId ?? o.benchmark_run_id ?? ""),
    mode: String(o.mode ?? "base") as "base" | "pvp",
    benchmarkMissionId: String(o.benchmarkMissionId ?? o.benchmark_mission_id ?? ""),
    benchmarkTitle: String(o.benchmarkTitle ?? o.benchmark_title ?? ""),
    benchmarkCategory: String(o.benchmarkCategory ?? o.benchmark_category ?? ""),
    prompt: String(o.prompt ?? ""),
    primaryModelName: String(o.primaryModelName ?? o.primary_model_name ?? ""),
    secondaryModelName: toNullableString(o.secondaryModelName ?? o.secondary_model_name),
    primaryOutput: String(o.primaryOutput ?? o.primary_output ?? ""),
    secondaryOutput: toNullableString(o.secondaryOutput ?? o.secondary_output),
    resultWinner: String(o.resultWinner ?? o.result_winner ?? ""),
    indicators: Array.isArray(o.indicators) ? o.indicators.map((x) => String(x)) : [],
    explanation: String(o.explanation ?? ""),
    opponentStudentEmail: toNullableString(o.opponentStudentEmail ?? o.opponent_student_email),
    createdAt: String(o.createdAt ?? o.created_at ?? ""),
  };
}

export async function saveBenchmarkRun(input: {
  studentEmail: string;
  mode: "base" | "pvp";
  benchmarkMissionId: string;
  benchmarkTitle: string;
  benchmarkCategory: string;
  prompt: string;
  primaryModelName: string;
  secondaryModelName?: string | null;
  primaryOutput: string;
  secondaryOutput?: string | null;
  resultWinner: string;
  indicators: string[];
  explanation: string;
  opponentStudentEmail?: string | null;
}): Promise<BenchmarkRunHistoryItem> {
  if (!isTauri()) throw new Error("Проверка Arena доступна только в Tauri.");
  const raw = await invoke<unknown>("save_benchmark_run_cmd", {
    studentEmail: input.studentEmail.trim(),
    mode: input.mode,
    benchmarkMissionId: input.benchmarkMissionId,
    benchmarkTitle: input.benchmarkTitle,
    benchmarkCategory: input.benchmarkCategory,
    prompt: input.prompt,
    primaryModelName: input.primaryModelName,
    secondaryModelName: input.secondaryModelName?.trim() || null,
    primaryOutput: input.primaryOutput,
    secondaryOutput: input.secondaryOutput?.trim() || null,
    resultWinner: input.resultWinner,
    indicators: input.indicators,
    explanation: input.explanation,
    opponentStudentEmail: input.opponentStudentEmail?.trim() || null,
  });
  return mapHistoryItem(raw);
}

export async function fetchBenchmarkRunHistory(
  studentEmail: string,
  limit = 8,
): Promise<BenchmarkRunHistoryItem[]> {
  if (!isTauri() || !studentEmail.trim()) return [];
  const raw = await invoke<unknown[]>("list_benchmark_run_history_cmd", {
    studentEmail: studentEmail.trim(),
    limit,
  });
  if (!Array.isArray(raw)) return [];
  return raw.map(mapHistoryItem);
}
