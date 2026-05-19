import { invoke, isTauri } from "@tauri-apps/api/core";

export type ChatTrainingContext = {
  companionName: string;
  stage: number;
  personalityType: string;
  logic: number;
  creativity: number;
  empathy: number;
  focus: number;
  modelAccuracy: number;
  datasetSize: number;
  simulatorHint: string;
};

export type ChatTrainingAnswer = {
  aiAnswer: string;
  answerQuality: number;
  qualityNote: string;
  simulatorExplanation: string;
  answerUsedTrainingContext: boolean;
  modelName: string;
  usingTrainedModel: boolean;
};

export type SaveChatTrainingResult = {
  interactionId: string;
  createdAt: string;
};

export type ChatTrainingHistoryItem = {
  interactionId: string;
  inputPrompt: string;
  draftModelAnswer: string;
  studentCritique: string;
  failureCategory: string;
  minimalEdit: string;
  revisedTargetAnswer: string;
  answerQuality: number;
  modelName: string | null;
  referenceAnswer: string;
  referenceModelName: string | null;
  createdAt: string;
};

export type ChatTrainingRowPreview = {
  sourcePrompt: string;
  draftAnswer: string;
  studentCritique: string;
  failureCategory: string;
  minimalEdit: string;
  revisedTargetAnswer: string;
  rating: number;
  modelName: string | null;
  referenceAnswer: string;
  referenceModelName: string | null;
  savesArtifactType: "chat_training_saved";
};

function obj(raw: unknown, msg: string): Record<string, unknown> {
  if (!raw || typeof raw !== "object") throw new Error(msg);
  return raw as Record<string, unknown>;
}

function num(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.trim().replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function text(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

export async function fetchChatTrainingContext(studentEmail: string): Promise<ChatTrainingContext | null> {
  if (!isTauri() || !studentEmail.trim()) return null;
  const raw = await invoke<unknown>("get_chat_training_context_cmd", {
    studentEmail: studentEmail.trim(),
  });
  const o = obj(raw, "Пустой ответ контекста Chat Training.");
  return {
    companionName: text(o.companionName ?? o.companion_name, "Лума"),
    stage: Math.round(num(o.stage, 1)),
    personalityType: text(o.personalityType ?? o.personality_type, "explorer"),
    logic: Math.round(num(o.logic, 5)),
    creativity: Math.round(num(o.creativity, 5)),
    empathy: Math.round(num(o.empathy, 5)),
    focus: Math.round(num(o.focus, 5)),
    modelAccuracy: num(o.modelAccuracy ?? o.model_accuracy, 0),
    datasetSize: Math.round(num(o.datasetSize ?? o.dataset_size, 0)),
    simulatorHint: text(o.simulatorHint ?? o.simulator_hint),
  };
}

export async function generateChatTrainingAnswer(
  studentEmail: string,
  studentMessage: string,
): Promise<ChatTrainingAnswer> {
  if (!isTauri()) throw new Error("Chat Training доступен только в Tauri.");
  const raw = await invoke<unknown>("generate_chat_training_answer_cmd", {
    studentEmail: studentEmail.trim(),
    studentMessage,
  });
  const o = obj(raw, "Пустой ответ генератора Chat Training.");
  return {
    aiAnswer: text(o.aiAnswer ?? o.ai_answer),
    answerQuality: Math.round(num(o.answerQuality ?? o.answer_quality, 1)),
    qualityNote: text(o.qualityNote ?? o.quality_note),
    simulatorExplanation: text(o.simulatorExplanation ?? o.simulator_explanation),
    answerUsedTrainingContext: Boolean(
      o.answerUsedTrainingContext ?? o.answer_used_training_context,
    ),
    modelName: text(o.modelName ?? o.model_name),
    usingTrainedModel: Boolean(o.usingTrainedModel ?? o.using_trained_model),
  };
}

export async function saveChatTrainingInteraction(input: {
  studentEmail: string;
  studentMessage: string;
  aiAnswer: string;
  answerQuality: number;
  studentCritique?: string;
  failureCategory?: string;
  minimalEdit?: string;
  revisedTargetAnswer?: string;
  modelName?: string | null;
  referenceAnswer?: string;
  referenceModelName?: string | null;
}): Promise<SaveChatTrainingResult> {
  if (!isTauri()) throw new Error("Сохранение доступно только в Tauri.");
  const raw = await invoke<unknown>("save_chat_training_interaction_cmd", {
    studentEmail: input.studentEmail.trim(),
    studentMessage: input.studentMessage,
    aiAnswer: input.aiAnswer,
    answerQuality: input.answerQuality,
    studentCritique: input.studentCritique?.trim() ? input.studentCritique.trim() : null,
    failureCategory: input.failureCategory?.trim() ? input.failureCategory.trim() : null,
    minimalEdit: input.minimalEdit?.trim() ? input.minimalEdit.trim() : null,
    revisedTargetAnswer: input.revisedTargetAnswer?.trim()
      ? input.revisedTargetAnswer.trim()
      : null,
    modelName: input.modelName?.trim() ? input.modelName.trim() : null,
    referenceAnswer: input.referenceAnswer?.trim() ? input.referenceAnswer.trim() : null,
    referenceModelName: input.referenceModelName?.trim() ? input.referenceModelName.trim() : null,
  });
  const o = obj(raw, "Пустой ответ сохранения Chat Training.");
  return {
    interactionId: text(o.interactionId ?? o.interaction_id),
    createdAt: text(o.createdAt ?? o.created_at),
  };
}

export async function fetchChatTrainingHistory(
  studentEmail: string,
  limit = 10,
): Promise<ChatTrainingHistoryItem[]> {
  if (!isTauri() || !studentEmail.trim()) return [];
  const raw = await invoke<unknown[]>("list_chat_training_interactions_cmd", {
    studentEmail: studentEmail.trim(),
    limit,
  });
  return raw.map((item) => {
    const o = obj(item, "Некорректная запись истории Chat Training.");
    return {
      interactionId: text(o.interactionId ?? o.interaction_id),
      inputPrompt: text(o.inputPrompt ?? o.input_prompt),
      draftModelAnswer: text(o.draftModelAnswer ?? o.draft_model_answer),
      studentCritique: text(o.studentCritique ?? o.student_critique),
      failureCategory: text(o.failureCategory ?? o.failure_category),
      minimalEdit: text(o.minimalEdit ?? o.minimal_edit),
      revisedTargetAnswer: text(o.revisedTargetAnswer ?? o.revised_target_answer),
      answerQuality: Math.round(num(o.answerQuality ?? o.answer_quality, 0)),
      modelName:
        typeof (o.modelName ?? o.model_name) === "string"
          ? text(o.modelName ?? o.model_name)
          : null,
      referenceAnswer: text(o.referenceAnswer ?? o.reference_answer),
      referenceModelName:
        typeof (o.referenceModelName ?? o.reference_model_name) === "string"
          ? text(o.referenceModelName ?? o.reference_model_name)
          : null,
      createdAt: text(o.createdAt ?? o.created_at),
    };
  });
}

export function buildChatTrainingRowPreview(input: {
  studentMessage: string;
  aiAnswer: string;
  studentCritique: string;
  failureCategory: string;
  minimalEdit?: string;
  revisedTargetAnswer?: string;
  answerQuality: number;
  modelName?: string | null;
  referenceAnswer?: string;
  referenceModelName?: string | null;
}): ChatTrainingRowPreview {
  const revised = input.revisedTargetAnswer?.trim() || input.aiAnswer.trim();
  return {
    sourcePrompt: input.studentMessage.trim(),
    draftAnswer: input.aiAnswer.trim(),
    studentCritique: input.studentCritique.trim(),
    failureCategory: input.failureCategory.trim(),
    minimalEdit: input.minimalEdit?.trim() ?? "",
    revisedTargetAnswer: revised,
    rating: input.answerQuality,
    modelName: input.modelName?.trim() ? input.modelName.trim() : null,
    referenceAnswer: input.referenceAnswer?.trim() ?? "",
    referenceModelName: input.referenceModelName?.trim() ? input.referenceModelName.trim() : null,
    savesArtifactType: "chat_training_saved",
  };
}
