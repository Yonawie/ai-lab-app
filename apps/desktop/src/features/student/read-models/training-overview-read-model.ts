import type { StudentTrainingPipelineStatus } from "@/shared/training-pipeline-tauri";
import { routes } from "@/shared/routes";
import {
  buildDatasetSnapshotFromPipeline,
  buildModelVersionFromPipeline,
} from "../my-ai/student-ai-lineage";
import { studentArenaScreenPath } from "../student-surface-paths";

export type TrainingOverviewStage = {
  id: "export" | "train" | "register" | "activate" | "evaluate";
  title: string;
  detail: string;
  done: boolean;
};

export type TrainingOverviewPrimaryAction = {
  title: string;
  description: string;
  href: string;
};

export type TrainingOverviewReadModel = {
  trainingExamplesCount: number;
  strongTrainingExamplesCount: number;
  hasEnoughExamples: boolean;
  modelModeLabel: string;
  activeModelLabel: string;
  nextStepLabel: string;
  currentVersion: {
    title: string;
    detail: string;
  };
  datasetSnapshot: {
    ready: boolean;
    totalRows: number;
    datasetExamples: number;
    promptExperiments: number;
    trainingExamples: number;
    datasetPath: string | null;
    metadataPath: string | null;
    createdAt: string | null;
  };
  modelLineage: {
    baseModelLabel: string;
    activeModelLabel: string;
    adapterReady: boolean;
    registered: boolean;
    summaryPath: string | null;
    registeredAt: string | null;
  };
  stages: TrainingOverviewStage[];
  primaryAction: TrainingOverviewPrimaryAction;
  compareAction: TrainingOverviewPrimaryAction;
  arenaAction: TrainingOverviewPrimaryAction;
};

function buildCurrentVersion(status: StudentTrainingPipelineStatus | null): {
  title: string;
  detail: string;
} {
  if (!status) {
    return {
      title: "Версия ещё не собрана",
      detail: "Сначала подготовь первые примеры обучения.",
    };
  }

  if (!status.exportAvailable) {
    return {
      title: "Есть примеры, но данные ещё не подготовлены",
      detail: "Следующий шаг: собрать примеры в единый набор для обучения.",
    };
  }

  if (!status.adapterAvailable) {
    return {
      title: "Данные готовы",
      detail: "Теперь нужно запустить обучение и получить обученную версию модели.",
    };
  }

  if (!status.ollamaModelRegistered) {
    return {
      title: "Обученная версия готова",
      detail: "Осталось подключить модель к Ollama, чтобы её можно было включить.",
    };
  }

  if (!status.usingTrainedModel) {
    return {
      title: "Модель подключена",
      detail: "Осталось включить её как активную модель для следующих запусков.",
    };
  }

  return {
    title: "Новая версия модели активна",
    detail: "Теперь проверь результат в Compare, а затем в Arena.",
  };
}

function buildStages(status: StudentTrainingPipelineStatus | null): TrainingOverviewStage[] {
  return [
    {
      id: "export",
      title: "Подготовить данные",
      detail: "Собрать примеры обучения в один набор.",
      done: Boolean(status?.exportAvailable),
    },
    {
      id: "train",
      title: "Обучить модель",
      detail: "Запустить обучение и получить обученную версию.",
      done: Boolean(status?.adapterAvailable),
    },
    {
      id: "register",
      title: "Подключить модель",
      detail: "Подключить обученную версию к локальной Ollama-модели.",
      done: Boolean(status?.ollamaModelRegistered),
    },
    {
      id: "activate",
      title: "Включить модель",
      detail: "Сделать обученную версию активной для следующих ответов.",
      done: Boolean(status?.usingTrainedModel),
    },
    {
      id: "evaluate",
      title: "Проверить результат",
      detail: "Сначала Compare на одном запросе, затем Arena на наборе задач.",
      done: Boolean(status?.usingTrainedModel && status?.ollamaModelRegistered),
    },
  ];
}

function buildModelModeLabel(status: StudentTrainingPipelineStatus | null): string {
  if (!status) return "Нет данных";
  return status.usingTrainedModel
    ? "Включена обученная модель"
    : "Сейчас работает базовая модель";
}

function buildActiveModelLabel(status: StudentTrainingPipelineStatus | null): string {
  if (!status) return "Нет данных";
  if (status.usingTrainedModel && status.activeStudentModelAlias) {
    return status.activeStudentModelAlias;
  }
  return status.baseModelName || "qwen3:8b";
}

function buildPrimaryAction(
  status: StudentTrainingPipelineStatus | null,
  trainingExamplesCount: number,
  strongTrainingExamplesCount: number,
): TrainingOverviewPrimaryAction {
  if (!status || trainingExamplesCount < 3) {
    return {
      title: "Добавь примеры обучения",
      description: "Сначала собери хотя бы 3 сильных примера.",
      href: routes.studentChatTraining,
    };
  }
  if (strongTrainingExamplesCount < 2) {
    return {
      title: "Усиль примеры обучения",
      description: "Добавь критику, тип ошибки и целевой ответ, чтобы данные лучше учили модель.",
      href: routes.studentChatTraining,
    };
  }
  if (!status.exportAvailable) {
    return {
      title: "Подготовь данные",
      description: "Собери все примеры в единый набор для обучения.",
      href: routes.studentTrainingManager,
    };
  }
  if (!status.adapterAvailable) {
    return {
      title: "Обучи модель",
      description: "Запусти обучение и вернись с путём к обученной версии.",
      href: routes.studentTrainingManager,
    };
  }
  if (!status.ollamaModelRegistered) {
    return {
      title: "Подключи модель",
      description: "Подключи обученную версию к базовой модели и создай локальную модель.",
      href: routes.studentTrainingManager,
    };
  }
  if (!status.usingTrainedModel) {
    return {
      title: "Включи модель",
      description: "Сделай обученную модель основной для следующих запусков.",
      href: routes.studentTrainingManager,
    };
  }
  return {
    title: "Проверь результат в Compare",
    description: "Сравни ответ базовой и обученной модели на одном запросе.",
    href: routes.studentModelCompare,
  };
}

export function buildTrainingOverviewReadModel(
  status: StudentTrainingPipelineStatus | null,
): TrainingOverviewReadModel {
  const datasetSnapshot = buildDatasetSnapshotFromPipeline(status);
  const modelVersion = buildModelVersionFromPipeline(status);
  const trainingExamplesCount =
    (status?.datasetExampleCount ?? 0) +
    (status?.promptExperimentCount ?? 0) +
    (status?.chatTrainingInteractionCount ?? 0);
  const strongTrainingExamplesCount = status?.chatTrainingStrongExampleCount ?? 0;
  const hasEnoughExamples = trainingExamplesCount >= 3;

  return {
    trainingExamplesCount,
    strongTrainingExamplesCount,
    hasEnoughExamples,
    modelModeLabel: buildModelModeLabel(status),
    activeModelLabel: buildActiveModelLabel(status),
    nextStepLabel:
      status?.suggestedNextStep?.trim() ||
      "Собери следующий результат и продолжай цикл улучшения.",
    currentVersion: buildCurrentVersion(status),
    datasetSnapshot,
    modelLineage: {
      baseModelLabel: modelVersion.baseModelLabel,
      activeModelLabel: modelVersion.activeModelLabel,
      adapterReady: modelVersion.adapterReady,
      registered: modelVersion.registered,
      summaryPath: modelVersion.summaryPath,
      registeredAt: modelVersion.registeredAt,
    },
    stages: buildStages(status),
    primaryAction: buildPrimaryAction(status, trainingExamplesCount, strongTrainingExamplesCount),
    compareAction: {
      title: "Compare",
      description: "Проверить, изменился ли ответ модели на одном запросе.",
      href: routes.studentModelCompare,
    },
    arenaAction: {
      title: "Arena",
      description: "Проверить, держится ли улучшение на наборе задач.",
      href: studentArenaScreenPath,
    },
  };
}
