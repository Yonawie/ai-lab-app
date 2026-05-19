import type { StudentTrainingPipelineStatus } from "@/shared/training-pipeline-tauri";
import { routes } from "@/shared/routes";

export type AIClinicFailureCategory =
  | "too_generic"
  | "format_not_followed"
  | "hallucination"
  | "missing_step"
  | "tone_issue"
  | "constraint_broken";

export type AIClinicAction = {
  title: string;
  description: string;
  href: string;
};

export type AIClinicRepairMission = {
  title: string;
  description: string;
  targetExampleCount: number;
  checklist: string[];
};

export type AIClinicReadModel = {
  trainingExamplesCount: number;
  strongTrainingExamplesCount: number;
  activeModelLabel: string;
  modelModeLabel: string;
  recommendationTitle: string;
  recommendationReason: string;
  promptVsTrainTitle: string;
  promptVsTrainBody: string;
  repairMission: AIClinicRepairMission;
  primaryAction: AIClinicAction;
  secondaryAction: AIClinicAction;
};

function buildActiveModelLabel(status: StudentTrainingPipelineStatus | null): string {
  if (!status) return "Нет данных";
  if (status.usingTrainedModel && status.activeStudentModelAlias) {
    return status.activeStudentModelAlias;
  }
  return status.baseModelName || "базовая локальная модель";
}

function buildModelModeLabel(status: StudentTrainingPipelineStatus | null): string {
  if (!status) return "Нет данных";
  return status.usingTrainedModel
    ? "Сейчас включена обученная модель"
    : "Сейчас работает базовая модель";
}

function buildFollowUpAction(
  status: StudentTrainingPipelineStatus | null,
  trainingExamplesCount: number,
  strongTrainingExamplesCount: number,
): AIClinicAction {
  if (trainingExamplesCount < 3) {
    return {
      title: "Добавить примеры обучения",
      description: "Сначала собери ещё несколько сильных примеров.",
      href: routes.studentChatTraining,
    };
  }
  if (strongTrainingExamplesCount < 2) {
    return {
      title: "Усилить примеры обучения",
      description: "Перед обучением лучше иметь хотя бы 2 сильных примера с оценкой 4-5.",
      href: routes.studentChatTraining,
    };
  }
  if (!status?.usingTrainedModel) {
    return {
      title: "Открыть обучение модели",
      description: "Когда примеры готовы, собери данные, обучи модель и включи её.",
      href: routes.studentTrainingManager,
    };
  }
  return {
    title: "Проверить в Compare",
    description: "После исправлений сравни, изменилось ли поведение модели на похожей задаче.",
    href: routes.studentModelCompare,
  };
}

function buildRepairMission(failureCategory: AIClinicFailureCategory): AIClinicRepairMission {
  switch (failureCategory) {
    case "format_not_followed":
      return {
        title: "Сделай 2 примера с точным форматом",
        description: "Сохрани пару ответов, где модель строго выдерживает нужную структуру.",
        targetExampleCount: 2,
        checklist: [
          "Покажи правильную структуру ответа целиком.",
          "Убери лишние отступления от формата.",
          "Сохрани целевой ответ в виде, который должен повторяться.",
        ],
      };
    case "hallucination":
      return {
        title: "Сделай 3 примера без выдуманных фактов",
        description: "Нужны ответы, где модель остаётся полезной, но не добавляет неподтверждённые детали.",
        targetExampleCount: 3,
        checklist: [
          "Убери сомнительные детали и домыслы.",
          "Оставь только то, что следует из задачи.",
          "Если данных мало, покажи аккуратную формулировку без выдумки.",
        ],
      };
    case "missing_step":
      return {
        title: "Сделай 2-3 примера с полным решением",
        description: "Покажи модели, как выглядит ответ без пропущенных важных шагов.",
        targetExampleCount: 3,
        checklist: [
          "Добавь пропущенный шаг в правильное место.",
          "Сделай порядок действий понятным.",
          "Проверь, что финальный ответ не обрывается раньше времени.",
        ],
      };
    case "tone_issue":
      return {
        title: "Сделай 2 примера в нужном тоне",
        description: "Сохрани содержание, но настрой стиль под аудиторию и задачу.",
        targetExampleCount: 2,
        checklist: [
          "Подстрой стиль под нужную роль или аудиторию.",
          "Сохрани полезность ответа и ясность.",
          "Убери резкие или неуместные формулировки.",
        ],
      };
    case "constraint_broken":
      return {
        title: "Сделай 3 примера с жёсткими ограничениями",
        description: "Нужны ответы, которые удерживают длину, роль, запрет или другую рамку задачи.",
        targetExampleCount: 3,
        checklist: [
          "Явно удержи ограничение в целевом ответе.",
          "Не добавляй фрагменты, которые выходят за рамку.",
          "Проверь, что ответ выполняет задачу внутри заданных правил.",
        ],
      };
    case "too_generic":
    default:
      return {
        title: "Сделай 3 более точных примера",
        description: "Покажи модели, как выглядит конкретный и полезный ответ на такой запрос.",
        targetExampleCount: 3,
        checklist: [
          "Добавь больше конкретики и полезных деталей.",
          "Убери общие фразы, которые ничего не решают.",
          "Сделай целевой ответ таким, чтобы его можно было почти сразу использовать.",
        ],
      };
  }
}

export function buildAIClinicReadModel(input: {
  status: StudentTrainingPipelineStatus | null;
  failureCategory: AIClinicFailureCategory;
}): AIClinicReadModel {
  const { status, failureCategory } = input;
  const trainingExamplesCount =
    (status?.datasetExampleCount ?? 0) +
    (status?.promptExperimentCount ?? 0) +
    (status?.chatTrainingInteractionCount ?? 0);
  const strongTrainingExamplesCount = status?.chatTrainingStrongExampleCount ?? 0;

  const followUp = buildFollowUpAction(status, trainingExamplesCount, strongTrainingExamplesCount);
  const repairMission = buildRepairMission(failureCategory);

  if (failureCategory === "format_not_followed" || failureCategory === "constraint_broken") {
    return {
      trainingExamplesCount,
      strongTrainingExamplesCount,
      activeModelLabel: buildActiveModelLabel(status),
      modelModeLabel: buildModelModeLabel(status),
      recommendationTitle: "Сначала поправь формулировку задачи",
      recommendationReason:
        "Такой сбой часто связан с тем, как задан запрос или какие ограничения модель получила в начале.",
      promptVsTrainTitle: "Сначала Prompt Lab",
      promptVsTrainBody:
        "Если ломается формат или ограничение, сначала проверь формулировку. Новый пример обучения нужен позже, если ошибка повторяется даже после хорошего запроса.",
      repairMission,
      primaryAction: {
        title: "Открыть Prompt Lab",
        description: "Проверь, как меняется ответ после более точной инструкции.",
        href: routes.studentPromptLab,
      },
      secondaryAction: followUp,
    };
  }

  if (failureCategory === "too_generic") {
    return {
      trainingExamplesCount,
      strongTrainingExamplesCount,
      activeModelLabel: buildActiveModelLabel(status),
      modelModeLabel: buildModelModeLabel(status),
      recommendationTitle: "Усиль задачу примерами или контекстом",
      recommendationReason:
        "Слишком общий ответ обычно означает, что модели не хватило точной рамки или сильных примеров.",
      promptVsTrainTitle:
        strongTrainingExamplesCount < 2 ? "Сначала примеры обучения" : "Сначала Prompt Lab",
      promptVsTrainBody:
        strongTrainingExamplesCount < 2
          ? "Когда сильных примеров мало, лучше показать модели несколько хороших ответов и только потом спорить с формулировкой запроса."
          : "Если примеры уже есть, проверь, помогает ли более точная формулировка. Если нет, возвращайся к новым примерам обучения.",
      repairMission,
      primaryAction:
        strongTrainingExamplesCount < 2
          ? {
              title: "Открыть примеры обучения",
              description: "Добавь сильные примеры того, каким должен быть более точный ответ.",
              href: routes.studentChatTraining,
            }
          : {
              title: "Открыть Prompt Lab",
              description: "Сравни две точные формулировки и посмотри, какая лучше сужает ответ.",
              href: routes.studentPromptLab,
            },
      secondaryAction: followUp,
    };
  }

  return {
    trainingExamplesCount,
    strongTrainingExamplesCount,
    activeModelLabel: buildActiveModelLabel(status),
    modelModeLabel: buildModelModeLabel(status),
    recommendationTitle: "Подготовь обучающий пример",
    recommendationReason:
      "Такой сбой лучше чинить явным примером: задача, слабый черновик, критика и правильный целевой ответ.",
    promptVsTrainTitle: "Сначала примеры обучения",
    promptVsTrainBody:
      "Если ответ теряет шаг, стиль, факты или качество рассуждения, одного нового запроса часто мало. Сохрани сильный пример и затем проверь результат заново.",
    repairMission,
    primaryAction: {
      title: "Открыть примеры обучения",
      description: "Сохрани задачу, черновик модели и исправленный целевой ответ как новый пример.",
      href: routes.studentChatTraining,
    },
    secondaryAction: followUp,
  };
}
