import { invoke, isTauri } from "@tauri-apps/api/core";

type Obj = Record<string, unknown>;

function asObj(raw: unknown, msg: string): Obj {
  if (!raw || typeof raw !== "object") throw new Error(msg);
  return raw as Obj;
}

function str(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (v == null) return fallback;
  return String(v);
}

function num(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.trim().replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function bool(v: unknown, fallback = false): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    if (["1", "true", "yes", "y"].includes(t)) return true;
    if (["0", "false", "no", "n"].includes(t)) return false;
  }
  return fallback;
}

export type StudentTrainingPipelineStatus = {
  studentId: string;
  studentEmail: string;
  datasetSnapshotId: string | null;
  modelVersionId: string | null;
  baseModelName: string;
  activeStudentModelAlias: string | null;
  usingTrainedModel: boolean;
  datasetSize: number;
  datasetExampleCount: number;
  promptExperimentCount: number;
  chatTrainingInteractionCount: number;
  chatTrainingStrongExampleCount: number;
  exportAvailable: boolean;
  exportedDatasetPath: string | null;
  exportMetadataPath: string | null;
  exportCreatedAt: string | null;
  exportTotalRows: number;
  exportDatasetExampleRows: number;
  exportPromptExperimentRows: number;
  exportChatTrainingRows: number;
  adapterAvailable: boolean;
  adapterPath: string | null;
  ollamaModelRegistered: boolean;
  modelRegisteredAt: string | null;
  trainingSummaryPath: string | null;
  suggestedNextStep: string;
};

export type ExportStudentDatasetResult = {
  datasetSnapshotId: string;
  datasetJsonlPath: string;
  metadataJsonPath: string;
  totalRows: number;
  datasetExampleRows: number;
  promptExperimentRows: number;
  chatTrainingRows: number;
};

export type RegisterStudentModelResult = {
  modelVersionId: string;
  datasetSnapshotId: string | null;
  baseModel: string;
  adapterPath: string;
  ollamaModelAlias: string;
  modelfilePath: string;
  trainingSummaryPath: string | null;
};

export type TrainingPipelineStage = {
  id: "export" | "train" | "register" | "activate" | "evaluate";
  title: string;
  done: boolean;
  detail: string;
};

export type StudentAiPackageExport = {
  exportDir: string;
  dataDir: string;
  modelDir: string;
  projectDir: string;
  checksDir: string;
  readmePath: string;
  packageMetadataPath: string;
  datasetJsonlPath: string | null;
  datasetMetadataPath: string | null;
  projectIndexHtmlPath: string | null;
  modelCardPath: string;
  warnings: string[];
};

export type PreparedStudentTrainingJob = {
  jobDir: string;
  datasetJsonlPath: string;
  outputDir: string;
  adapterPath: string;
  trainingSummaryPath: string;
  runTrainingScriptPath: string;
  runRegisterScriptPath: string;
  readmePath: string;
  baseHfModel: string;
  ollamaBaseModel: string;
  ollamaAlias: string;
  launched: boolean;
  warnings: string[];
};

export async function fetchStudentTrainingPipelineStatus(
  studentEmail: string,
): Promise<StudentTrainingPipelineStatus | null> {
  if (!isTauri() || !studentEmail.trim()) return null;
  const raw = await invoke<unknown>("get_student_training_pipeline_status_cmd", {
    studentEmail: studentEmail.trim(),
  });
  const o = asObj(raw, "Пустой ответ статуса процесса обучения.");
  const alias = o.activeStudentModelAlias ?? o.active_student_model_alias;
  return {
    studentId: str(o.studentId ?? o.student_id),
    studentEmail: str(o.studentEmail ?? o.student_email),
    datasetSnapshotId: (o.datasetSnapshotId ?? o.dataset_snapshot_id)
      ? str(o.datasetSnapshotId ?? o.dataset_snapshot_id)
      : null,
    modelVersionId: (o.modelVersionId ?? o.model_version_id)
      ? str(o.modelVersionId ?? o.model_version_id)
      : null,
    baseModelName: str(o.baseModelName ?? o.base_model_name, "qwen3:8b"),
    activeStudentModelAlias: alias ? str(alias) : null,
    usingTrainedModel: bool(o.usingTrainedModel ?? o.using_trained_model, false),
    datasetSize: Math.round(num(o.datasetSize ?? o.dataset_size, 0)),
    datasetExampleCount: Math.round(num(o.datasetExampleCount ?? o.dataset_example_count, 0)),
    promptExperimentCount: Math.round(
      num(o.promptExperimentCount ?? o.prompt_experiment_count, 0),
    ),
    chatTrainingInteractionCount: Math.round(
      num(o.chatTrainingInteractionCount ?? o.chat_training_interaction_count, 0),
    ),
    chatTrainingStrongExampleCount: Math.round(
      num(o.chatTrainingStrongExampleCount ?? o.chat_training_strong_example_count, 0),
    ),
    exportAvailable: bool(o.exportAvailable ?? o.export_available, false),
    exportedDatasetPath: (o.exportedDatasetPath ?? o.exported_dataset_path)
      ? str(o.exportedDatasetPath ?? o.exported_dataset_path)
      : null,
    exportMetadataPath: (o.exportMetadataPath ?? o.export_metadata_path)
      ? str(o.exportMetadataPath ?? o.export_metadata_path)
      : null,
    exportCreatedAt: (o.exportCreatedAt ?? o.export_created_at)
      ? str(o.exportCreatedAt ?? o.export_created_at)
      : null,
    exportTotalRows: Math.round(num(o.exportTotalRows ?? o.export_total_rows, 0)),
    exportDatasetExampleRows: Math.round(
      num(o.exportDatasetExampleRows ?? o.export_dataset_example_rows, 0),
    ),
    exportPromptExperimentRows: Math.round(
      num(o.exportPromptExperimentRows ?? o.export_prompt_experiment_rows, 0),
    ),
    exportChatTrainingRows: Math.round(
      num(o.exportChatTrainingRows ?? o.export_chat_training_rows, 0),
    ),
    adapterAvailable: bool(o.adapterAvailable ?? o.adapter_available, false),
    adapterPath: (o.adapterPath ?? o.adapter_path) ? str(o.adapterPath ?? o.adapter_path) : null,
    ollamaModelRegistered: bool(o.ollamaModelRegistered ?? o.ollama_model_registered, false),
    modelRegisteredAt: (o.modelRegisteredAt ?? o.model_registered_at)
      ? str(o.modelRegisteredAt ?? o.model_registered_at)
      : null,
    trainingSummaryPath: (o.trainingSummaryPath ?? o.training_summary_path)
      ? str(o.trainingSummaryPath ?? o.training_summary_path)
      : null,
    suggestedNextStep: str(o.suggestedNextStep ?? o.suggested_next_step),
  };
}

export async function exportStudentTrainingDataset(
  studentEmail: string,
): Promise<ExportStudentDatasetResult> {
  if (!isTauri()) throw new Error("Подготовка данных доступна только в настольном приложении.");
  const raw = await invoke<unknown>("export_student_training_dataset_cmd", {
    studentEmail: studentEmail.trim(),
    studentId: null,
  });
  const o = asObj(raw, "Пустой ответ подготовки данных.");
  return {
    datasetSnapshotId: str(o.datasetSnapshotId ?? o.dataset_snapshot_id),
    datasetJsonlPath: str(o.datasetJsonlPath ?? o.dataset_jsonl_path),
    metadataJsonPath: str(o.metadataJsonPath ?? o.metadata_json_path),
    totalRows: Math.round(num(o.totalRows ?? o.total_rows, 0)),
    datasetExampleRows: Math.round(num(o.datasetExampleRows ?? o.dataset_example_rows, 0)),
    promptExperimentRows: Math.round(num(o.promptExperimentRows ?? o.prompt_experiment_rows, 0)),
    chatTrainingRows: Math.round(num(o.chatTrainingRows ?? o.chat_training_rows, 0)),
  };
}

export async function registerStudentOllamaModel(input: {
  studentEmail: string;
  baseModel: string;
  adapterPath: string;
  ollamaModelAlias: string;
  trainingSummaryPath?: string;
  systemPrompt?: string;
}): Promise<RegisterStudentModelResult> {
  if (!isTauri()) throw new Error("Регистрация модели доступна только в настольном приложении.");
  const raw = await invoke<unknown>("register_student_ollama_model_cmd", {
    studentEmail: input.studentEmail.trim(),
    studentId: null,
    baseModel: input.baseModel.trim(),
    adapterPath: input.adapterPath.trim(),
    ollamaModelAlias: input.ollamaModelAlias.trim(),
    trainingSummaryPath: input.trainingSummaryPath?.trim() || null,
    systemPrompt: input.systemPrompt?.trim() || null,
  });
  const o = asObj(raw, "Пустой ответ регистрации Ollama-модели.");
  return {
    modelVersionId: str(o.modelVersionId ?? o.model_version_id),
    datasetSnapshotId: (o.datasetSnapshotId ?? o.dataset_snapshot_id)
      ? str(o.datasetSnapshotId ?? o.dataset_snapshot_id)
      : null,
    baseModel: str(o.baseModel ?? o.base_model),
    adapterPath: str(o.adapterPath ?? o.adapter_path),
    ollamaModelAlias: str(o.ollamaModelAlias ?? o.ollama_model_alias),
    modelfilePath: str(o.modelfilePath ?? o.modelfile_path),
    trainingSummaryPath: (o.trainingSummaryPath ?? o.training_summary_path)
      ? str(o.trainingSummaryPath ?? o.training_summary_path)
      : null,
  };
}

export async function setStudentTrainedModelUsage(
  studentEmail: string,
  useTrainedModel: boolean,
): Promise<void> {
  if (!isTauri()) throw new Error("Переключение модели доступно только в настольном приложении.");
  await invoke("set_student_trained_model_usage_cmd", {
    studentEmail: studentEmail.trim(),
    useTrainedModel,
  });
}

export async function prepareStudentTrainingJob(input: {
  studentEmail: string;
  baseHfModel?: string;
  ollamaBaseModel?: string;
  launchNow?: boolean;
}): Promise<PreparedStudentTrainingJob> {
  if (!isTauri()) throw new Error("Подготовка обучения доступна только в настольном приложении.");
  const raw = await invoke<unknown>("prepare_student_training_job_cmd", {
    studentEmail: input.studentEmail.trim(),
    baseHfModel: input.baseHfModel?.trim() || null,
    ollamaBaseModel: input.ollamaBaseModel?.trim() || null,
    launchNow: Boolean(input.launchNow),
  });
  const o = asObj(raw, "Пустой ответ подготовки обучения.");
  const warningsRaw = o.warnings;
  return {
    jobDir: str(o.jobDir ?? o.job_dir),
    datasetJsonlPath: str(o.datasetJsonlPath ?? o.dataset_jsonl_path),
    outputDir: str(o.outputDir ?? o.output_dir),
    adapterPath: str(o.adapterPath ?? o.adapter_path),
    trainingSummaryPath: str(o.trainingSummaryPath ?? o.training_summary_path),
    runTrainingScriptPath: str(o.runTrainingScriptPath ?? o.run_training_script_path),
    runRegisterScriptPath: str(o.runRegisterScriptPath ?? o.run_register_script_path),
    readmePath: str(o.readmePath ?? o.readme_path),
    baseHfModel: str(o.baseHfModel ?? o.base_hf_model),
    ollamaBaseModel: str(o.ollamaBaseModel ?? o.ollama_base_model),
    ollamaAlias: str(o.ollamaAlias ?? o.ollama_alias),
    launched: bool(o.launched, false),
    warnings: Array.isArray(warningsRaw) ? warningsRaw.map((item) => str(item)).filter(Boolean) : [],
  };
}

export async function exportStudentAiPackage(
  studentEmail: string,
): Promise<StudentAiPackageExport> {
  if (!isTauri()) throw new Error("Экспорт пакета доступен только в настольном приложении.");
  const raw = await invoke<unknown>("export_student_ai_package_cmd", {
    studentEmail: studentEmail.trim(),
  });
  const o = asObj(raw, "Пустой ответ экспорта пакета.");
  const warningsRaw = o.warnings;
  return {
    exportDir: str(o.exportDir ?? o.export_dir),
    dataDir: str(o.dataDir ?? o.data_dir),
    modelDir: str(o.modelDir ?? o.model_dir),
    projectDir: str(o.projectDir ?? o.project_dir),
    checksDir: str(o.checksDir ?? o.checks_dir),
    readmePath: str(o.readmePath ?? o.readme_path),
    packageMetadataPath: str(o.packageMetadataPath ?? o.package_metadata_path),
    datasetJsonlPath: (o.datasetJsonlPath ?? o.dataset_jsonl_path)
      ? str(o.datasetJsonlPath ?? o.dataset_jsonl_path)
      : null,
    datasetMetadataPath: (o.datasetMetadataPath ?? o.dataset_metadata_path)
      ? str(o.datasetMetadataPath ?? o.dataset_metadata_path)
      : null,
    projectIndexHtmlPath: (o.projectIndexHtmlPath ?? o.project_index_html_path)
      ? str(o.projectIndexHtmlPath ?? o.project_index_html_path)
      : null,
    modelCardPath: str(o.modelCardPath ?? o.model_card_path),
    warnings: Array.isArray(warningsRaw) ? warningsRaw.map((item) => str(item)).filter(Boolean) : [],
  };
}

export function buildTrainingPipelineStages(
  status: StudentTrainingPipelineStatus | null,
): TrainingPipelineStage[] {
  return [
    {
      id: "export",
      title: "Подготовить данные",
      done: Boolean(status?.exportAvailable),
      detail: status?.exportAvailable
        ? "Набор данных готов для обучения."
        : "Собери примеры обучения в единый набор.",
    },
    {
      id: "train",
      title: "Обучить модель",
      done: Boolean(status?.adapterAvailable),
      detail: status?.adapterAvailable
        ? "Адаптер готов."
        : "Запусти обучение после подготовки данных.",
    },
    {
      id: "register",
      title: "Подключить модель",
      done: Boolean(status?.ollamaModelRegistered),
      detail: status?.ollamaModelRegistered
        ? `Модель: ${status?.activeStudentModelAlias ?? "подключена"}`
        : "Модель ещё не подключена к Ollama.",
    },
    {
      id: "activate",
      title: "Включить модель",
      done: Boolean(status?.usingTrainedModel),
      detail: status?.usingTrainedModel
        ? "Обученная модель активна."
        : "Пока используется базовая модель.",
    },
    {
      id: "evaluate",
      title: "Проверить результат",
      done: Boolean(status?.usingTrainedModel && status?.ollamaModelRegistered),
      detail:
        status?.usingTrainedModel && status?.ollamaModelRegistered
          ? "Можно идти в Compare и Arena."
          : "После включения модели проверь её в Compare и Arena.",
    },
  ];
}
