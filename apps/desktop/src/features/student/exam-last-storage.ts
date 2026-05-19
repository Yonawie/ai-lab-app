import type { AiExamSubmitResult } from "@/shared/ai-exam-tauri";

export type StoredExamSummary = {
  totalScore: number;
  createdAt: string;
  strengths: string[];
  weaknesses: string[];
};

const key = (email: string) => `student-ai-exam-last:${email.trim() || "anon"}`;

export function saveLastExamResult(studentEmail: string, res: AiExamSubmitResult): void {
  const payload: StoredExamSummary = {
    totalScore: res.totalScore,
    createdAt: res.createdAt,
    strengths: res.strengths ?? [],
    weaknesses: res.weaknesses ?? [],
  };
  localStorage.setItem(key(studentEmail), JSON.stringify(payload));
}

export function loadLastExamResult(studentEmail: string): StoredExamSummary | null {
  try {
    const raw = localStorage.getItem(key(studentEmail));
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<StoredExamSummary>;
    if (typeof o.totalScore !== "number") return null;
    return {
      totalScore: o.totalScore,
      createdAt: String(o.createdAt ?? ""),
      strengths: Array.isArray(o.strengths) ? o.strengths.map(String) : [],
      weaknesses: Array.isArray(o.weaknesses) ? o.weaknesses.map(String) : [],
    };
  } catch {
    return null;
  }
}
