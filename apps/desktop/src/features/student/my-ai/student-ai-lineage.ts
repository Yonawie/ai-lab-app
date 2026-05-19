import type { StudentTrainingPipelineStatus } from "@/shared/training-pipeline-tauri";

export type DatasetSnapshot = {
  id: string;
  ready: boolean;
  totalRows: number;
  datasetExamples: number;
  promptExperiments: number;
  trainingExamples: number;
  datasetPath: string | null;
  metadataPath: string | null;
  createdAt: string | null;
};

export type ModelVersion = {
  id: string;
  baseModelLabel: string;
  activeModelLabel: string;
  adapterReady: boolean;
  registered: boolean;
  adapterPath: string | null;
  summaryPath: string | null;
  registeredAt: string | null;
};

export function buildDatasetSnapshotFromPipeline(
  status: StudentTrainingPipelineStatus | null,
): DatasetSnapshot {
  const createdAt = status?.exportCreatedAt ?? null;
  return {
    id: status?.datasetSnapshotId?.trim()
      ? status.datasetSnapshotId.trim()
      : status?.exportedDatasetPath
      ? `dataset:${status.exportedDatasetPath}`
      : createdAt
        ? `dataset:${createdAt}`
        : "dataset:not-ready",
    ready: Boolean(status?.exportAvailable),
    totalRows: status?.exportTotalRows ?? status?.datasetSize ?? 0,
    datasetExamples: status?.exportDatasetExampleRows ?? status?.datasetExampleCount ?? 0,
    promptExperiments: status?.exportPromptExperimentRows ?? status?.promptExperimentCount ?? 0,
    trainingExamples: status?.exportChatTrainingRows ?? status?.chatTrainingInteractionCount ?? 0,
    datasetPath: status?.exportedDatasetPath ?? null,
    metadataPath: status?.exportMetadataPath ?? null,
    createdAt,
  };
}

export function buildModelVersionFromPipeline(
  status: StudentTrainingPipelineStatus | null,
): ModelVersion {
  const baseModelLabel = status?.baseModelName?.trim() || "qwen3:8b";
  const activeModelLabel =
    status?.usingTrainedModel && status?.activeStudentModelAlias?.trim()
      ? status.activeStudentModelAlias.trim()
      : baseModelLabel;
  const modelId = status?.modelVersionId?.trim()
    ? status.modelVersionId.trim()
    : status?.activeStudentModelAlias?.trim()
    ? `model:${status.activeStudentModelAlias.trim()}`
    : `model:${baseModelLabel}`;

  return {
    id: modelId,
    baseModelLabel,
    activeModelLabel,
    adapterReady: Boolean(status?.adapterAvailable),
    registered: Boolean(status?.ollamaModelRegistered),
    adapterPath: status?.adapterPath ?? null,
    summaryPath: status?.trainingSummaryPath ?? null,
    registeredAt: status?.modelRegisteredAt ?? null,
  };
}
