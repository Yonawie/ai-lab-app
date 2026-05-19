import { invoke, isTauri } from "@tauri-apps/api/core";

export type StudentArtifactType =
  | "prompt_experiment_saved"
  | "chat_training_saved"
  | "dataset_example_added"
  | "dataset_exported"
  | "lora_adapter_registered"
  | "trained_model_activated"
  | "compare_run_completed"
  | "benchmark_eval_completed"
  | "pairwise_preference_saved"
  | "ai_studio_project_created"
  | "ai_studio_version_saved";

export type StudentArtifactSummary = {
  totalCount: number;
  countsByType: Partial<Record<StudentArtifactType, number>> & Record<string, number>;
};

export type StudentArtifactRecord = {
  artifactId: string;
  artifactType: string;
  label: string;
  detail: string;
  createdAt: string;
};

function asObj(raw: unknown, msg: string): Record<string, unknown> {
  if (!raw || typeof raw !== "object") throw new Error(msg);
  return raw as Record<string, unknown>;
}

function toNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

export async function fetchStudentArtifactSummary(
  studentEmail: string,
): Promise<StudentArtifactSummary | null> {
  if (!isTauri() || !studentEmail.trim()) return null;
  const raw = await invoke<unknown>("get_student_artifact_summary_cmd", {
    studentEmail: studentEmail.trim(),
  });
  const o = asObj(raw, "Пустой ответ artifact summary.");
  const rawCounts = o.countsByType ?? o.counts_by_type;
  const countsByType: Record<string, number> = {};
  if (rawCounts && typeof rawCounts === "object") {
    for (const [key, value] of Object.entries(rawCounts as Record<string, unknown>)) {
      countsByType[key] = toNum(value);
    }
  }
  return {
    totalCount: toNum(o.totalCount ?? o.total_count),
    countsByType,
  };
}

export async function fetchRecentStudentArtifacts(
  studentEmail: string,
  limit = 6,
): Promise<StudentArtifactRecord[]> {
  if (!isTauri() || !studentEmail.trim()) return [];
  const raw = await invoke<unknown[]>("list_recent_student_artifacts_cmd", {
    studentEmail: studentEmail.trim(),
    limit,
  });
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const o = asObj(item, "Пустой ответ artifact item.");
    return {
      artifactId: String(o.artifactId ?? o.artifact_id ?? ""),
      artifactType: String(o.artifactType ?? o.artifact_type ?? ""),
      label: String(o.label ?? ""),
      detail: String(o.detail ?? ""),
      createdAt: String(o.createdAt ?? o.created_at ?? ""),
    };
  });
}

export async function appendStudentArtifact(input: {
  studentEmail: string;
  artifactType: StudentArtifactType;
  label: string;
  detail?: string;
}): Promise<void> {
  if (!isTauri()) return;
  await invoke("append_student_artifact_cmd", {
    studentEmail: input.studentEmail.trim(),
    artifactType: input.artifactType,
    label: input.label,
    detail: input.detail?.trim() || null,
  });
}
