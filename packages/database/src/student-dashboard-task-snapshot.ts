import type { Task, TaskType } from "@prisma/client";

/** Task slice in `student-dashboard.json` (`correctAnswer` is never exported). */
export type StudentDashboardSnapshotTask = {
  id: string;
  title: string;
  description: string | null;
  taskType: TaskType;
  classification?: {
    prompt: string;
    options: string[];
  };
  ranking?: {
    prompt: string;
    options: string[];
  };
  policyPath?: {
    scenario: string;
    options: string[];
  };
  dataCleaning?: {
    prompt: string;
    examples: { id: string; text: string }[];
  };
};

export function taskToSnapshotTask(
  t: Pick<
    Task,
    "id" | "title" | "description" | "taskType" | "promptText" | "optionsJson"
  >,
): StudentDashboardSnapshotTask {
  const base: StudentDashboardSnapshotTask = {
    id: t.id,
    title: t.title,
    description: t.description,
    taskType: t.taskType,
  };
  if (
    t.taskType === "classification" &&
    t.promptText &&
    t.optionsJson != null &&
    Array.isArray(t.optionsJson)
  ) {
    const options = t.optionsJson.filter(
      (x): x is string => typeof x === "string",
    );
    if (options.length > 0) {
      return {
        ...base,
        classification: { prompt: t.promptText, options },
      };
    }
  }
  if (
    t.taskType === "ranking" &&
    t.promptText &&
    t.optionsJson != null &&
    Array.isArray(t.optionsJson)
  ) {
    const options = t.optionsJson.filter(
      (x): x is string => typeof x === "string",
    );
    if (options.length > 0) {
      return {
        ...base,
        ranking: { prompt: t.promptText, options },
      };
    }
  }
  if (
    t.taskType === "policy_path" &&
    t.promptText &&
    t.optionsJson != null &&
    Array.isArray(t.optionsJson)
  ) {
    const options = t.optionsJson.filter(
      (x): x is string => typeof x === "string",
    );
    if (options.length > 0) {
      return {
        ...base,
        policyPath: { scenario: t.promptText, options },
      };
    }
  }
  if (
    t.taskType === "data_cleaning" &&
    t.promptText &&
    t.optionsJson != null &&
    Array.isArray(t.optionsJson)
  ) {
    const examples: { id: string; text: string }[] = [];
    for (const row of t.optionsJson) {
      if (
        row !== null &&
        typeof row === "object" &&
        !Array.isArray(row) &&
        typeof (row as { id?: unknown }).id === "string" &&
        typeof (row as { text?: unknown }).text === "string"
      ) {
        const id = String((row as { id: string }).id).trim();
        const text = String((row as { text: string }).text).trim();
        if (id && text) examples.push({ id, text });
      }
    }
    if (examples.length > 0) {
      return {
        ...base,
        dataCleaning: { prompt: t.promptText, examples },
      };
    }
  }
  return base;
}
