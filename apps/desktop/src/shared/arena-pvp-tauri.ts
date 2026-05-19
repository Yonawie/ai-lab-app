import { invoke, isTauri } from "@tauri-apps/api/core";

export type ArenaStudentOpponentRow = {
  studentEmail: string;
  ollamaModelAlias: string;
};

export type StudentVsStudentDuelResult = {
  prompt: string;
  selfStudentEmail: string;
  opponentStudentEmail: string;
  selfModelAlias: string | null;
  opponentModelAlias: string | null;
  selfAvailable: boolean;
  opponentAvailable: boolean;
  selfResponse: string | null;
  opponentResponse: string | null;
  indicators: string[];
  explanation: string;
};

function asObj(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object") throw new Error("Пустой ответ матча Arena.");
  return v as Record<string, unknown>;
}

function optStr(o: Record<string, unknown>, camel: string, snake: string): string | null {
  const v = o[camel] ?? o[snake];
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

export async function listArenaStudentOpponents(studentEmail: string): Promise<ArenaStudentOpponentRow[]> {
  if (!isTauri()) return [];
  const raw = await invoke<unknown>("list_arena_student_opponents_cmd", {
    studentEmail: studentEmail.trim(),
  });
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const o = asObj(row);
    return {
      studentEmail: String(o.studentEmail ?? o.student_email ?? ""),
      ollamaModelAlias: String(o.ollamaModelAlias ?? o.ollama_model_alias ?? ""),
    };
  });
}

export async function compareStudentTrainedVsStudent(
  selfStudentEmail: string,
  opponentStudentEmail: string,
  prompt: string,
): Promise<StudentVsStudentDuelResult> {
  if (!isTauri()) throw new Error("Матч моделей доступен только в Tauri.");
  const raw = await invoke<unknown>("compare_student_trained_vs_student_cmd", {
    selfStudentEmail: selfStudentEmail.trim(),
    opponentStudentEmail: opponentStudentEmail.trim(),
    prompt: prompt.trim(),
  });
  const o = asObj(raw);
  const indicatorsRaw = o.indicators;
  const indicators = Array.isArray(indicatorsRaw)
    ? indicatorsRaw.map((x) => String(x))
    : [];
  return {
    prompt: String(o.prompt ?? ""),
    selfStudentEmail: String(o.selfStudentEmail ?? o.self_student_email ?? ""),
    opponentStudentEmail: String(o.opponentStudentEmail ?? o.opponent_student_email ?? ""),
    selfModelAlias: optStr(o, "selfModelAlias", "self_model_alias"),
    opponentModelAlias: optStr(o, "opponentModelAlias", "opponent_model_alias"),
    selfAvailable: Boolean(o.selfAvailable ?? o.self_available),
    opponentAvailable: Boolean(o.opponentAvailable ?? o.opponent_available),
    selfResponse: optStr(o, "selfResponse", "self_response"),
    opponentResponse: optStr(o, "opponentResponse", "opponent_response"),
    indicators,
    explanation: String(o.explanation ?? ""),
  };
}
