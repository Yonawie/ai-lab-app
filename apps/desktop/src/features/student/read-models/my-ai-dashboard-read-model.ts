import type { BenchmarkRunHistoryItem } from "@/shared/arena-benchmark-tauri";
import type { AiStudioProjectVersion } from "@/shared/ai-studio-tauri";
import type { StudentArtifactSummary } from "@/shared/artifact-ledger-tauri";
import type {
  ChatTrainingContext,
  ChatTrainingHistoryItem,
} from "@/shared/chat-training-tauri";
import type { ModelTrainingStatus } from "@/shared/companion-tauri";
import type {
  CompareRunHistoryItem,
  PairwisePreferenceHistoryItem,
} from "@/shared/model-compare-tauri";
import { routes } from "@/shared/routes";
import type { StudentTrainingPipelineStatus } from "@/shared/training-pipeline-tauri";
import type { StudentAiPrimaryAction, StudentAI } from "../my-ai/student-ai-domain";
import {
  buildDatasetSnapshotFromPipeline,
  buildModelVersionFromPipeline,
} from "../my-ai/student-ai-lineage";
import type { ComparePrefillState } from "../compare-prefill-state";
import { buildEvaluationSummaryReadModel } from "./evaluation-summary-read-model";
import { buildStudentAiProofLoopReadModel } from "./student-ai-proof-loop-read-model";

export type MyAiDashboardReadModel = {
  studentAI: StudentAI;
  primaryAction: StudentAiPrimaryAction;
};

type BuildMyAiDashboardReadModelInput = {
  inTauri: boolean;
  pipeline: StudentTrainingPipelineStatus | null;
  training: ModelTrainingStatus | null;
  chatContext: ChatTrainingContext | null;
  chatTrainingHistory: ChatTrainingHistoryItem[];
  artifactSummary: StudentArtifactSummary | null;
  compareHistory: CompareRunHistoryItem[];
  benchmarkHistory: BenchmarkRunHistoryItem[];
  pairwiseHistory: PairwisePreferenceHistoryItem[];
  aiStudioHistory: AiStudioProjectVersion[];
  nextAction: StudentAiPrimaryAction;
};

function mapFailureCategoryToCapability(category: string): string | null {
  switch (category.trim()) {
    case "too_generic":
      return "clarity";
    case "format_not_followed":
      return "structure";
    case "constraint_broken":
      return "instruction-following";
    case "tone_issue":
      return "tone";
    case "missing_step":
      return "usefulness";
    default:
      return null;
  }
}

function focusIdFromFailureCategory(category: string): string {
  return category.trim() || "general";
}

function trainingFocusTitle(category: string): string {
  switch (category.trim()) {
    case "too_generic":
      return "Яснее и конкретнее";
    case "format_not_followed":
      return "Формат и структура";
    case "constraint_broken":
      return "Следование ограничениям";
    case "tone_issue":
      return "Тон ответа";
    case "missing_step":
      return "Полезные шаги";
    case "hallucination":
      return "Осторожность с фактами";
    default:
      return "Общее качество ответа";
  }
}

function buildComparePrefillForFocus(category: string): ComparePrefillState {
  switch (category.trim()) {
    case "too_generic":
      return {
        fromMyAi: true,
        compareTag: "focus:clarity",
        prompt:
          "Объясни коротко и конкретно, как работает обучение модели на примерах, без общих фраз.",
        note: "Проверь, стал ли ответ яснее и конкретнее.",
        highlightHiddenBenchmark: false,
      };
    case "format_not_followed":
      return {
        fromMyAi: true,
        compareTag: "focus:structure",
        prompt:
          "Объясни по шагам, как студент обучает своего ИИ. Дай ровно 3 шага и короткий итог.",
        note: "Проверь, лучше ли модель держит формат и структуру ответа.",
        highlightHiddenBenchmark: false,
      };
    case "constraint_broken":
      return {
        fromMyAi: true,
        compareTag: "focus:instruction",
        prompt:
          "Ответь ровно двумя предложениями и не используй списки: зачем нужна проверка модели после обучения?",
        note: "Проверь, лучше ли модель удерживает ограничения задачи.",
        highlightHiddenBenchmark: false,
      };
    case "tone_issue":
      return {
        fromMyAi: true,
        compareTag: "focus:tone",
        prompt:
          "Объясни ученику спокойно и поддерживающе, что сравнение моделей помогает увидеть реальное улучшение.",
        note: "Проверь, лучше ли модель держит нужный тон ответа.",
        highlightHiddenBenchmark: false,
      };
    case "missing_step":
      return {
        fromMyAi: true,
        compareTag: "focus:usefulness",
        prompt:
          "Дай практический план: что сделать после того, как студент сохранил новый пример обучения?",
        note: "Проверь, добавляет ли модель полезные шаги и понятное следующее действие.",
        highlightHiddenBenchmark: false,
      };
    case "hallucination":
      return {
        fromMyAi: true,
        compareTag: "focus:facts",
        prompt:
          "Объясни только то, что можно уверенно сказать по задаче, и не добавляй неподтверждённые факты про обучение модели.",
        note: "Проверь, осторожнее ли модель обращается с фактами.",
        highlightHiddenBenchmark: false,
      };
    default:
      return {
        fromMyAi: true,
        compareTag: "focus:quality",
        prompt: "Ответь полезно, ясно и без лишних деталей: как студент понимает, что его ИИ стал лучше?",
        note: "Проверь текущее качество ответа на одном понятном примере.",
        highlightHiddenBenchmark: false,
      };
  }
}

function buildHiddenBenchmarkPrefillForFocus(category: string): ComparePrefillState {
  const base = buildComparePrefillForFocus(category);
  return {
    ...base,
    note:
      category.trim() === "hallucination"
        ? "Сначала запусти скрытую проверку, чтобы увидеть, переносится ли осторожность с фактами на новый кейс."
        : "Сначала запусти скрытую проверку, чтобы проверить этот навык на новой задаче.",
    highlightHiddenBenchmark: true,
  };
}

function buildTrainingFocusMeta(
  count: number,
  capabilityStatus?: "strong" | "building" | "needs_work",
): {
  status: "validated" | "needs_check" | "in_progress";
  summary: string;
} {
  if (capabilityStatus === "strong") {
    return {
      status: "validated",
      summary:
        count === 1
          ? "Есть 1 недавний пример, и проверки уже подтверждают улучшение."
          : `Есть ${count} недавних примеров, и проверки уже подтверждают улучшение.`,
    };
  }
  if (capabilityStatus === "building") {
    return {
      status: "needs_check",
      summary:
        count === 1
          ? "Есть 1 недавний пример. Улучшение уже намечается, но его ещё стоит проверить."
          : `Есть ${count} недавних примеров. Улучшение уже намечается, но его ещё стоит проверить.`,
    };
  }
  return {
    status: "in_progress",
    summary:
      count === 1
        ? "Есть 1 недавний пример. Этот навык ещё доучивается."
        : `Есть ${count} недавних примеров. Этот навык ещё доучивается.`,
  };
}

function formatStatusDate(value: string | null | undefined): string {
  if (!value) {
    return "Пока нет";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Пока нет";
  }
  return `Есть проверка · ${parsed.toLocaleString("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  })}`;
}

function formatShortDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function buildNextVersionBlocker(input: BuildMyAiDashboardReadModelInput): string {
  if (!input.pipeline?.exportAvailable) {
    return "Следующий шаг: подготовить данные для обучения.";
  }
  if (!input.pipeline?.adapterAvailable) {
    return "Следующий шаг: запустить обучение и получить обученную версию.";
  }
  if (!input.pipeline?.ollamaModelRegistered) {
    return "Следующий шаг: подключить обученную версию модели.";
  }
  if (!input.pipeline?.usingTrainedModel) {
    return "Следующий шаг: включить обученную модель для новых ответов.";
  }
  if (input.aiStudioHistory[0] && input.aiStudioHistory[0].modelName?.trim()) {
    return "Следующий шаг: проверить текущую версию в Compare, Arena или обновить проект в AI Studio.";
  }
  return "Следующий шаг: подтвердить улучшение в Compare и затем применить модель в AI Studio.";
}

export function buildMyAiDashboardReadModel(
  input: BuildMyAiDashboardReadModelInput,
): MyAiDashboardReadModel {
  const counts = input.artifactSummary?.countsByType ?? {};
  const pipelineExampleCount = input.pipeline
    ? input.pipeline.datasetExampleCount +
      input.pipeline.promptExperimentCount +
      input.pipeline.chatTrainingInteractionCount
    : null;
  const trainingExampleCount =
    pipelineExampleCount ??
    input.training?.datasetSize ??
    input.chatContext?.datasetSize ??
    counts.dataset_example_added ??
    0;
  const strongTrainingExampleCount = input.pipeline?.chatTrainingStrongExampleCount ?? 0;

  const trainingPrepared =
    Boolean(input.pipeline?.exportAvailable) ||
    Boolean(input.pipeline?.adapterAvailable) ||
    (counts.dataset_exported ?? 0) > 0 ||
    (counts.lora_adapter_registered ?? 0) > 0;

  const trainedModelActive =
    Boolean(input.pipeline?.usingTrainedModel) || (counts.trained_model_activated ?? 0) > 0;
  const modelVersion = buildModelVersionFromPipeline(input.pipeline);
  const datasetSnapshot = buildDatasetSnapshotFromPipeline(input.pipeline);
  const latestProject = input.aiStudioHistory[0] ?? null;
  const activeAlias = input.pipeline?.activeStudentModelAlias?.trim() || null;
  const latestProjectModel = latestProject?.modelName?.trim() || null;
  const baseModelLabel = modelVersion.baseModelLabel;
  const latestProjectMatchesActive = latestProjectModel
    ? trainedModelActive
      ? activeAlias
        ? latestProjectModel === activeAlias
        : false
      : latestProjectModel === baseModelLabel
    : null;

  const activeModelLabel = input.inTauri
    ? trainedModelActive
      ? "Обученная модель"
      : "Базовая модель"
    : "Локальный режим недоступен";
  const displayName = input.pipeline?.studentEmail?.split("@")[0]?.trim() || "ученик";

  const hasExamples =
    trainingExampleCount > 0 ||
    (counts.chat_training_saved ?? 0) > 0 ||
    (counts.dataset_example_added ?? 0) > 0;

  const hasChecks =
    (counts.compare_run_completed ?? 0) > 0 || (counts.benchmark_eval_completed ?? 0) > 0;

  const evaluationSummary = buildEvaluationSummaryReadModel({
    compareHistory: input.compareHistory,
    benchmarkHistory: input.benchmarkHistory,
    pairwiseHistory: input.pairwiseHistory,
    currentModelLabel: modelVersion.activeModelLabel,
  });
  const proofLoop = buildStudentAiProofLoopReadModel({
    pipeline: input.pipeline,
    evaluation: evaluationSummary,
    latestProject,
  });

  const trainingFocusCounts = new Map<string, number>();
  const pairwiseTrainingCounts = new Map<string, number>();
  const failureCategoryCounts = new Map<string, number>();
  for (const item of input.chatTrainingHistory) {
    const failureCategory = item.failureCategory.trim();
    if (failureCategory) {
      failureCategoryCounts.set(
        failureCategory,
        (failureCategoryCounts.get(failureCategory) ?? 0) + 1,
      );
    }
    const capabilityId = mapFailureCategoryToCapability(item.failureCategory);
    if (!capabilityId) continue;
    trainingFocusCounts.set(capabilityId, (trainingFocusCounts.get(capabilityId) ?? 0) + 1);
    if (item.referenceAnswer.trim()) {
      pairwiseTrainingCounts.set(
        capabilityId,
        (pairwiseTrainingCounts.get(capabilityId) ?? 0) + 1,
      );
    }
  }

  const capabilityMap = evaluationSummary.capabilityMap.map((capability) => {
    const trainingCount = trainingFocusCounts.get(capability.id) ?? 0;
    if (trainingCount === 0) {
      return capability;
    }
    if (capability.status === "strong") {
      return {
        ...capability,
        summary: `${capability.summary} Сейчас ты ещё закрепляешь этот навык новыми примерами (${trainingCount}).`,
      };
    }
    if (capability.status === "needs_work") {
      return {
        ...capability,
        status: "building" as const,
        summary: `Сейчас ты добавляешь ${trainingCount} примеров, чтобы усилить этот навык.`,
      };
    }
    return {
      ...capability,
      summary: `${capability.summary} В примерах обучения уже есть ${trainingCount} недавних примеров по этому навыку.`,
    };
  });

  const capabilityStatusById = new Map(
    capabilityMap.map((capability) => [capability.id, capability.status] as const),
  );

  const trainingFocus = [...failureCategoryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([category, count]) => {
      const capabilityId = mapFailureCategoryToCapability(category);
      const pairwiseCount = capabilityId ? pairwiseTrainingCounts.get(capabilityId) ?? 0 : 0;
      const meta = buildTrainingFocusMeta(
        count,
        capabilityId ? capabilityStatusById.get(capabilityId) : undefined,
      );
      return {
        id: category,
        title: trainingFocusTitle(category),
        count,
        pairwiseCount,
        status: meta.status,
        summary: meta.summary,
      };
    });
  const trainingFocusNextCheck = trainingFocus.find((focus) => focus.status !== "validated");
  const trainingFocusStrongerCheck = trainingFocus.find((focus) => focus.status === "validated");
  const trainingFocusById = new Map(trainingFocus.map((focus) => [focus.id, focus] as const));
  const primaryAction = !hasExamples
    ? input.nextAction
    : hasExamples && strongTrainingExampleCount < 2
      ? {
          title: "Усиль примеры обучения",
          body: "У тебя уже есть учебные данные, но сильных примеров пока мало. Добавь 1-2 примера с критикой, типом ошибки, правкой и оценкой 4-5.",
          primaryLabel: "Тренируем",
          primaryHref: routes.studentChatTraining,
          secondaryLabel: "AI Clinic",
          secondaryHref: routes.studentAiClinic,
        }
    : hasExamples && !trainingPrepared
      ? {
          title: "Подготовь данные для обучения",
          body: "У тебя уже есть примеры. Следующий сильный шаг — собрать их в данные и перейти к обучению модели.",
          primaryLabel: "Тренируем",
          primaryHref: routes.studentTrain,
          secondaryLabel: "Добавить пример",
          secondaryHref: routes.studentChatTraining,
        }
      : trainingPrepared && !trainedModelActive
        ? {
            title: "Включи обученную модель",
            body: "Данные уже подготовлены. Доведи процесс до подключённой и включённой модели, чтобы Compare проверял именно твоего ИИ.",
            primaryLabel: "Обучить модель",
            primaryHref: routes.studentTrainingManager,
            secondaryLabel: "Примеры обучения",
            secondaryHref: routes.studentChatTraining,
          }
        : trainedModelActive && input.compareHistory.length === 0
          ? {
              title: "Проверь модель в Compare",
              body: "Обученная модель включена. Теперь проверь на одном запросе, изменилось ли её поведение по сравнению с базовой моделью.",
              primaryLabel: "Проверяем",
              primaryHref: routes.studentEvaluate,
              secondaryLabel: "AI Clinic",
              secondaryHref: routes.studentAiClinic,
            }
          : trainedModelActive && latestProject && latestProjectMatchesActive === false
    ? {
        title: "Обнови проект на текущей модели",
        body: "У тебя уже включена новая модель, но последняя версия в AI Studio собрана на другом состоянии. Пересобери или улучши проект на текущей модели.",
        primaryLabel: "Строим",
        primaryHref: routes.studentBuild,
        secondaryLabel: "Проверяем",
        secondaryHref: routes.studentEvaluate,
      }
          : trainingFocusNextCheck && trainedModelActive
            ? {
                title: "Подтверди следующий фокус",
                body: `${trainingFocusNextCheck.title} уже пора проверить на одном понятном примере в Compare.`,
                primaryLabel: "Проверяем",
                primaryHref: routes.studentEvaluate,
                secondaryLabel: "Тренируем",
                secondaryHref: routes.studentTrain,
              }
            : trainingFocusStrongerCheck
              ? {
                  title: "Проверь улучшение на новой задаче",
                  body: `${trainingFocusStrongerCheck.title} уже выглядит сильнее. Теперь лучше проверить этот навык на скрытой новой задаче.`,
                  primaryLabel: "Проверяем",
                  primaryHref: routes.studentEvaluate,
                  secondaryLabel: "Разобрать слабое место",
                  secondaryHref: routes.studentAiClinic,
                }
              : input.nextAction;

  return {
    studentAI: {
      identity: {
        studentEmail: input.pipeline?.studentEmail ?? "",
        displayName,
        activeModelLabel: modelVersion.activeModelLabel,
        baseModelLabel,
      },
      status: {
        activeModelLabel,
        trainingExampleCount,
        strongTrainingExampleCount,
        trainingPrepared,
        trainedModelActive,
        latestCompareLabel: formatStatusDate(input.compareHistory[0]?.createdAt),
        latestArenaLabel: formatStatusDate(input.benchmarkHistory[0]?.createdAt),
        modelLineage: {
          modelVersionId: modelVersion.id,
          datasetSnapshotId: datasetSnapshot.id,
          baseModelLabel,
          activeModelLabel: modelVersion.activeModelLabel,
          exportedDatasetReady: Boolean(input.pipeline?.exportAvailable),
          adapterReady: modelVersion.adapterReady,
          latestProjectModelLabel: latestProjectModel || "пока нет проекта",
          latestProjectMatchesActive,
          latestProjectCreatedAt: latestProject?.createdAt ?? null,
          nextVersionBlocker: buildNextVersionBlocker(input),
          versionTimeline: [
            {
              id: "dataset",
              title: "Набор данных",
              done: Boolean(input.pipeline?.exportAvailable),
              detail: input.pipeline?.exportAvailable
                ? `Данные для обучения уже подготовлены${
                    formatShortDate(input.pipeline?.exportCreatedAt)
                      ? ` · ${formatShortDate(input.pipeline?.exportCreatedAt)}`
                      : ""
                  }.`
                : "Собери и подготовь данные для обучения.",
            },
            {
              id: "adapter",
              title: "Обученная версия",
              done: Boolean(input.pipeline?.adapterAvailable),
              detail: input.pipeline?.adapterAvailable
                ? "Обученная версия уже готова."
                : "Следующий шаг после данных — получить обученную версию.",
            },
            {
              id: "registered",
              title: "Подключение модели",
              done: Boolean(input.pipeline?.ollamaModelRegistered),
              detail: input.pipeline?.ollamaModelRegistered
                ? `Версия модели уже подключена${
                    formatShortDate(input.pipeline?.modelRegisteredAt)
                      ? ` · ${formatShortDate(input.pipeline?.modelRegisteredAt)}`
                      : ""
                   }.`
                : "После обучения подключи модель.",
            },
            {
              id: "active",
              title: "Активная модель",
              done: trainedModelActive,
              detail: trainedModelActive
                ? "Эта версия уже включена для новых ответов."
                : "После регистрации включи новую модель.",
            },
            {
              id: "studio",
              title: "AI Studio",
              done: latestProjectMatchesActive === true,
              detail:
                latestProjectMatchesActive == null
                  ? "Пока нет сохранённой версии проекта на этой модели."
                  : latestProjectMatchesActive
                    ? "Последний проект уже собран на текущей модели."
                    : "Последний проект собран на другом состоянии модели.",
            },
          ],
        },
        trainingFocus,
        trainingFocusNextCheck: trainingFocusNextCheck
          ? {
              title: trainingFocusNextCheck.title,
              summary:
                trainingFocusNextCheck.status === "needs_check"
                  ? "По этому фокусу уже есть прогресс. Следующий хороший шаг — проверить его в Compare."
                  : "По этому фокусу ты ещё только собираешь примеры. После ещё 1-2 примеров проверь его в Compare.",
              comparePrefill: buildComparePrefillForFocus(trainingFocusNextCheck.id),
            }
          : undefined,
        trainingFocusStrongerCheck: trainingFocusStrongerCheck
          ? {
              title: trainingFocusStrongerCheck.title,
              summary:
                "По этому фокусу уже есть подтверждённое улучшение. Следующий честный шаг — скрытая проверка на новой задаче.",
              comparePrefill: buildHiddenBenchmarkPrefillForFocus(trainingFocusStrongerCheck.id),
            }
          : undefined,
      },
      lifecycle: [
        {
          id: "examples",
          title: "1. Дай примеры",
          done: hasExamples,
          detail: hasExamples
            ? `${trainingExampleCount} примеров обучения уже есть · сильных: ${strongTrainingExampleCount}`
            : "Сначала добавь примеры обучения",
        },
        {
          id: "train",
          title: "2. Обучи модель",
          done: trainingPrepared,
          detail: trainingPrepared
            ? "Данные для обучения уже подготовлены или модель уже обучалась"
            : "Следующий шаг — запустить обучение модели",
        },
        {
          id: "activate",
          title: "3. Включи модель",
          done: trainedModelActive,
          detail: trainedModelActive
            ? "Сейчас работает обученная модель"
            : "После обучения включи свою модель",
        },
        {
          id: "check",
          title: "4. Проверь результат",
          done: hasChecks,
          detail: hasChecks ? "Уже есть проверка в Compare или Arena" : "Сначала Compare, потом Arena",
        },
      ],
      evaluation: {
        latestHeadline: evaluationSummary.latestHeadline,
        currentModelLabel: evaluationSummary.currentModelLabel,
        currentModelCheckCount: evaluationSummary.currentModelCheckCount,
        strengths: evaluationSummary.strengths,
        weakSpots: evaluationSummary.weakSpots,
        compareCount: evaluationSummary.compareCount,
        benchmarkCount: evaluationSummary.benchmarkCount,
        hiddenBenchmarkCount: evaluationSummary.hiddenBenchmarkCount,
        pairwiseCount: evaluationSummary.pairwiseCount,
        capabilityMap,
        repairQueue: evaluationSummary.repairQueue.map((task) => {
          const relatedFocusId = task.clinicState
            ? focusIdFromFailureCategory(task.clinicState.failureCategory)
            : "";
          const relatedFocus = relatedFocusId ? trainingFocusById.get(relatedFocusId) : undefined;
          return {
            ...task,
            relatedFocusTitle: relatedFocus?.title,
            relatedFocusStatus: relatedFocus?.status,
          };
        }),
        nextStepTitle: evaluationSummary.nextAction.title,
        nextStepDescription: evaluationSummary.nextAction.description,
      },
      proofLoop,
    },
    primaryAction,
  };
}
