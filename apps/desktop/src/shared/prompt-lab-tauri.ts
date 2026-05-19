import { invoke, isTauri } from "@tauri-apps/api/core";

export type PromptLabExercise = {
  taskTitle: string;
  taskDescription: string;
  weakPrompt: string;
  weakOutput: string;
  improvedPromptOptions: string[];
  improvedOutput: string;
  explanation: string;
};

export type PromptLabRunResult = {
  modelName: string;
  usingTrainedModel: boolean;
  taskInput: string;
  promptA: string;
  promptB: string;
  outputA: string;
  outputB: string;
};

export type PromptLabExperimentHistoryItem = {
  experimentId: string;
  taskTitle: string;
  taskInput: string;
  promptA: string;
  promptB: string;
  outputA: string;
  outputB: string;
  winner: "A" | "B";
  rationale: string;
  modelName: string | null;
  createdAt: string;
};

export type PromptExperimentResult = {
  experimentId: string;
  improvedPrompt: string;
  improvedOutput: string;
  explanation: string;
  createdAt: string;
};

export type PromptExperimentLogEntry = {
  title: string;
  savedArtifactType: "prompt_experiment_saved";
  nextRecommendedActions: string[];
};

type Obj = Record<string, unknown>;

function asObject(raw: unknown, msg: string): Obj {
  if (!raw || typeof raw !== "object") throw new Error(msg);
  return raw as Obj;
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (value == null) return fallback;
  return String(value);
}

export async function fetchPromptLabExercise(studentEmail: string): Promise<PromptLabExercise | null> {
  if (!isTauri() || !studentEmail.trim()) return null;
  const raw = await invoke<unknown>("get_prompt_lab_exercise_cmd", {
    studentEmail: studentEmail.trim(),
  });
  const o = asObject(raw, "Пустой ответ Prompt Lab.");
  return {
    taskTitle: asString(o.taskTitle ?? o.task_title),
    taskDescription: asString(o.taskDescription ?? o.task_description),
    weakPrompt: asString(o.weakPrompt ?? o.weak_prompt),
    weakOutput: asString(o.weakOutput ?? o.weak_output),
    improvedPromptOptions: (() => {
      const rawOpts = o.improvedPromptOptions ?? o.improved_prompt_options;
      if (!Array.isArray(rawOpts)) return [];
      return rawOpts.map((x) => asString(x));
    })(),
    improvedOutput: asString(o.improvedOutput ?? o.improved_output),
    explanation: asString(o.explanation),
  };
}

export async function runPromptLabExperiment(input: {
  studentEmail: string;
  taskInput: string;
  promptA: string;
  promptB: string;
}): Promise<PromptLabRunResult> {
  if (!isTauri()) {
    throw new Error("Prompt Lab доступен только в десктоп-сборке Tauri.");
  }
  const raw = await invoke<unknown>("run_prompt_lab_experiment_cmd", {
    studentEmail: input.studentEmail.trim(),
    taskInput: input.taskInput.trim(),
    promptA: input.promptA.trim(),
    promptB: input.promptB.trim(),
  });
  const o = asObject(raw, "Пустой ответ A/B-прогона Prompt Lab.");
  return {
    modelName: asString(o.modelName ?? o.model_name, "qwen3:8b"),
    usingTrainedModel: Boolean(o.usingTrainedModel ?? o.using_trained_model),
    taskInput: asString(o.taskInput ?? o.task_input),
    promptA: asString(o.promptA ?? o.prompt_a),
    promptB: asString(o.promptB ?? o.prompt_b),
    outputA: asString(o.outputA ?? o.output_a, "ИИ временно недоступен"),
    outputB: asString(o.outputB ?? o.output_b, "ИИ временно недоступен"),
  };
}

export async function savePromptLabExperiment(input: {
  studentEmail: string;
  taskTitle: string;
  taskInput: string;
  promptA: string;
  promptB: string;
  outputA: string;
  outputB: string;
  winner: "A" | "B";
  rationale: string;
  modelName?: string | null;
}): Promise<PromptLabExperimentHistoryItem> {
  if (!isTauri()) {
    throw new Error("Сохранение Prompt Lab доступно только в десктоп-сборке Tauri.");
  }
  const raw = await invoke<unknown>("save_prompt_lab_experiment_cmd", {
    studentEmail: input.studentEmail.trim(),
    taskTitle: input.taskTitle.trim(),
    taskInput: input.taskInput.trim(),
    promptA: input.promptA.trim(),
    promptB: input.promptB.trim(),
    outputA: input.outputA.trim(),
    outputB: input.outputB.trim(),
    winner: input.winner,
    rationale: input.rationale.trim(),
    modelName: input.modelName?.trim() || null,
  });
  return parsePromptLabHistoryItem(raw);
}

export async function fetchPromptLabExperimentHistory(
  studentEmail: string,
  limit = 12,
): Promise<PromptLabExperimentHistoryItem[]> {
  if (!isTauri() || !studentEmail.trim()) return [];
  const raw = await invoke<unknown>("list_prompt_lab_experiments_cmd", {
    studentEmail: studentEmail.trim(),
    limit,
  });
  if (!Array.isArray(raw)) return [];
  return raw.map(parsePromptLabHistoryItem);
}

function parsePromptLabHistoryItem(raw: unknown): PromptLabExperimentHistoryItem {
  const o = asObject(raw, "Пустой элемент истории Prompt Lab.");
  const winner = asString(o.winner, "B").toUpperCase() === "A" ? "A" : "B";
  const modelName = asString(o.modelName ?? o.model_name).trim();
  return {
    experimentId: asString(o.experimentId ?? o.experiment_id),
    taskTitle: asString(o.taskTitle ?? o.task_title),
    taskInput: asString(o.taskInput ?? o.task_input),
    promptA: asString(o.promptA ?? o.prompt_a),
    promptB: asString(o.promptB ?? o.prompt_b),
    outputA: asString(o.outputA ?? o.output_a),
    outputB: asString(o.outputB ?? o.output_b),
    winner,
    rationale: asString(o.rationale),
    modelName: modelName || null,
    createdAt: asString(o.createdAt ?? o.created_at),
  };
}

export async function submitPromptExperiment(
  studentEmail: string,
  improvedPrompt: string,
): Promise<PromptExperimentResult> {
  if (!isTauri()) {
    throw new Error("Prompt Lab сохранение доступно только в десктоп-сборке Tauri.");
  }
  const raw = await invoke<unknown>("submit_prompt_experiment_cmd", {
    studentEmail: studentEmail.trim(),
    improvedPrompt: improvedPrompt.trim(),
  });
  const o = asObject(raw, "Пустой ответ после сохранения Prompt Lab.");
  return {
    experimentId: asString(o.experimentId ?? o.experiment_id),
    improvedPrompt: asString(o.improvedPrompt ?? o.improved_prompt),
    improvedOutput: asString(o.improvedOutput ?? o.improved_output),
    explanation: asString(o.explanation),
    createdAt: asString(o.createdAt ?? o.created_at),
  };
}

export function buildPromptExperimentLogEntry(
  result: PromptLabExperimentHistoryItem | PromptExperimentResult,
): PromptExperimentLogEntry {
  const experimentId = result.experimentId;
  return {
    title: `Experiment ${experimentId || "saved"}`,
    savedArtifactType: "prompt_experiment_saved",
    nextRecommendedActions: [
      "Сравни, как меняются outputs при разных инструкциях к одной и той же задаче.",
      "Сохраняй rationale: почему выиграл именно этот prompt и какой эффект он дал.",
      "Позже сильные prompt-output пары можно будет продвигать в dataset workflow.",
    ],
  };
}
