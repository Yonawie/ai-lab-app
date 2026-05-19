import type { ComparePrefillState } from "../compare-prefill-state";
import type { AIClinicEvaluationPrefillState } from "../ai-clinic-prefill-state";

export type StudentAIIdentity = {
  studentEmail: string;
  displayName: string;
  activeModelLabel: string;
  baseModelLabel: string;
};

export type TrainingExample = {
  id: string;
  source: "chat_training" | "lesson" | "ai_clinic" | "prompt_lab" | "manual";
  prompt: string;
  targetAnswer: string;
  critique?: string;
  qualityLabel?: string;
  createdAt: string;
};

export type DatasetSnapshot = {
  id: string;
  ready: boolean;
  totalRows: number;
  trainingExampleCount: number;
  promptExperimentCount: number;
  createdAt: string | null;
};

export type TrainingRun = {
  id: string;
  datasetSnapshotId: string | null;
  status: "not_started" | "running" | "completed" | "failed";
  startedAt: string | null;
  completedAt: string | null;
};

export type ModelVersion = {
  id: string;
  label: string;
  baseModelLabel: string;
  datasetSnapshotId: string | null;
  trainingRunId: string | null;
  active: boolean;
  registeredAt: string | null;
};

export type EvaluationRun = {
  id: string;
  kind: "compare" | "arena" | "hidden_task" | "pairwise";
  modelVersionId: string | null;
  title: string;
  outcome: string;
  createdAt: string;
};

export type ProjectVersion = {
  id: string;
  projectId: string;
  modelVersionId: string | null;
  title: string;
  createdAt: string;
};

export type ArtifactLedger = {
  resultCount: number;
  latestResultLabel: string;
  latestResultAt: string | null;
};

export type StudentAiLifecycleStepId = "examples" | "train" | "activate" | "check";

export type StudentAiLifecycleStep = {
  id: StudentAiLifecycleStepId;
  title: string;
  detail: string;
  done: boolean;
};

export type StudentAiPrimaryAction = {
  title: string;
  body: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel?: string;
  secondaryHref?: string;
};

export type StudentAiStatus = {
  activeModelLabel: string;
  trainingExampleCount: number;
  strongTrainingExampleCount: number;
  trainingPrepared: boolean;
  trainedModelActive: boolean;
  latestCompareLabel: string;
  latestArenaLabel: string;
  modelLineage: {
    modelVersionId: string;
    datasetSnapshotId: string;
    baseModelLabel: string;
    activeModelLabel: string;
    exportedDatasetReady: boolean;
    adapterReady: boolean;
    latestProjectModelLabel: string;
    latestProjectMatchesActive: boolean | null;
    latestProjectCreatedAt: string | null;
    nextVersionBlocker: string;
    versionTimeline: Array<{
      id: "dataset" | "adapter" | "registered" | "active" | "studio";
      title: string;
      done: boolean;
      detail: string;
    }>;
  };
  trainingFocus: Array<{
    id: string;
    title: string;
    count: number;
    pairwiseCount: number;
    status: "validated" | "needs_check" | "in_progress";
    summary: string;
  }>;
  trainingFocusNextCheck?: {
    title: string;
    summary: string;
    comparePrefill: ComparePrefillState;
  };
  trainingFocusStrongerCheck?: {
    title: string;
    summary: string;
    comparePrefill: ComparePrefillState;
  };
};

export type StudentAiEvaluationSummary = {
  latestHeadline: string;
  currentModelLabel: string;
  currentModelCheckCount: number;
  strengths: string[];
  weakSpots: string[];
  compareCount: number;
  benchmarkCount: number;
  hiddenBenchmarkCount: number;
  pairwiseCount: number;
  capabilityMap: Array<{
    id: string;
    title: string;
    status: "strong" | "building" | "needs_work";
    summary: string;
  }>;
  repairQueue: Array<{
    id: string;
    title: string;
    reason: string;
    relatedFocusTitle?: string;
    relatedFocusStatus?: "validated" | "needs_check" | "in_progress";
    actionTitle: string;
    actionHref: string;
    clinicState?: AIClinicEvaluationPrefillState;
  }>;
  nextStepTitle: string;
  nextStepDescription: string;
};

export type StudentAiProofLoop = {
  headline: string;
  steps: Array<{
    id: "dataset" | "model" | "activation" | "evaluation" | "project";
    title: string;
    status: "done" | "next" | "waiting";
    detail: string;
  }>;
  missingProof: string[];
  nextProofAction: StudentAiPrimaryAction;
};

export type StudentAI = {
  identity: StudentAIIdentity;
  status: StudentAiStatus;
  lifecycle: StudentAiLifecycleStep[];
  evaluation: StudentAiEvaluationSummary;
  proofLoop: StudentAiProofLoop;
};
