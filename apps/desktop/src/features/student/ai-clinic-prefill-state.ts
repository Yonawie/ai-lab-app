import type { BenchmarkRunHistoryItem } from "@/shared/arena-benchmark-tauri";
import type {
  CompareRunHistoryItem,
  PairwisePreferenceHistoryItem,
  StudentModelCompareResult,
} from "@/shared/model-compare-tauri";
import type { AIClinicFailureCategory } from "./read-models/ai-clinic-read-model";

export type AIClinicEvaluationPrefillState = {
  fromEvaluation: true;
  task: string;
  failureCategory: AIClinicFailureCategory;
  draftAnswer: string;
  modelName: string | null;
  usingTrainedModel: boolean;
  qualityNote: string;
  referenceAnswer?: string;
  referenceModelName?: string | null;
};

export function summarizeCompareHistory(item: CompareRunHistoryItem): string {
  if (!item.trainedAvailable) {
    return "Обученная модель была недоступна, поэтому это точечная проверка только базового ответа.";
  }
  if (item.indicators.length > 0) {
    return `Что изменилось: ${item.indicators.join(", ")}.`;
  }
  return "Явное улучшение не выделено автоматически. Сравни ответы вручную и реши, что стоит доработать.";
}

function arenaWinnerLabel(winner: string): string {
  switch (winner) {
    case "you":
    case "trained":
      return "твоя модель";
    case "opponent":
      return "модель соперника";
    case "base":
      return "базовая модель";
    case "draw":
      return "ничья";
    default:
      return winner || "результат не определён";
  }
}

export function summarizeBenchmarkHistory(item: BenchmarkRunHistoryItem): string {
  const summary = item.indicators.length > 0 ? item.indicators.join(", ") : item.explanation;
  const winner = arenaWinnerLabel(item.resultWinner);
  if (item.mode === "pvp") {
    return `Матч против модели другого студента. Лучше сработала: ${winner}. ${summary}`;
  }
  return `Проверка против базовой модели. Лучше сработала: ${winner}. ${summary}`;
}

export function inferAIClinicFailureCategory(input: {
  indicators: string[];
  explanation?: string;
  categoryTag?: string | null;
  benchmarkCategory?: string | null;
}): AIClinicFailureCategory {
  const haystack = [
    input.categoryTag ?? "",
    input.benchmarkCategory ?? "",
    input.explanation ?? "",
    ...input.indicators,
  ]
    .join(" ")
    .toLowerCase();

  if (
    haystack.includes("галлю") ||
    haystack.includes("выдум") ||
    haystack.includes("fact") ||
    haystack.includes("факт")
  ) {
    return "hallucination";
  }
  if (haystack.includes("тон") || haystack.includes("style")) {
    return "tone_issue";
  }
  if (
    haystack.includes("формат") ||
    haystack.includes("структур") ||
    haystack.includes("instruction") ||
    haystack.includes("следование")
  ) {
    return "format_not_followed";
  }
  if (haystack.includes("огранич") || haystack.includes("constraint")) {
    return "constraint_broken";
  }
  if (haystack.includes("полез") || haystack.includes("шаг") || haystack.includes("missing")) {
    return "missing_step";
  }
  if (haystack.includes("ясн") || haystack.includes("общ") || haystack.includes("clarity")) {
    return "too_generic";
  }
  switch (input.benchmarkCategory) {
    case "structure":
      return "format_not_followed";
    case "tone":
      return "tone_issue";
    case "usefulness":
      return "missing_step";
    case "clarity":
    default:
      return "too_generic";
  }
}

export function buildClinicStateFromCompareResult(
  result: StudentModelCompareResult,
): AIClinicEvaluationPrefillState {
  const usingTrainedModel = Boolean(result.trainedAvailable && result.trainedResponse?.trim());
  return {
    fromEvaluation: true,
    task: result.prompt,
    failureCategory: inferAIClinicFailureCategory({
      indicators: result.indicators,
      explanation: result.explanation,
      categoryTag: result.categoryTag,
    }),
    draftAnswer: usingTrainedModel ? result.trainedResponse?.trim() || "" : result.baseResponse,
    modelName: usingTrainedModel ? result.trainedModelAlias : result.baseModel,
    usingTrainedModel,
    qualityNote: result.explanation,
  };
}

export function buildClinicStateFromCompareHistory(
  item: CompareRunHistoryItem,
): AIClinicEvaluationPrefillState {
  const usingTrainedModel = Boolean(item.trainedAvailable && item.trainedOutput?.trim());
  return {
    fromEvaluation: true,
    task: item.prompt,
    failureCategory: inferAIClinicFailureCategory({
      indicators: item.indicators,
      explanation: item.explanation,
      categoryTag: item.categoryTag,
    }),
    draftAnswer: usingTrainedModel ? item.trainedOutput?.trim() || "" : item.baseOutput,
    modelName: usingTrainedModel ? item.trainedModelName : item.baseModel,
    usingTrainedModel,
    qualityNote: summarizeCompareHistory(item),
  };
}

export function buildClinicStateFromBenchmarkHistory(
  item: BenchmarkRunHistoryItem,
): AIClinicEvaluationPrefillState {
  const usingTrainedModel = item.mode === "pvp" ? true : Boolean(item.secondaryOutput?.trim());
  return {
    fromEvaluation: true,
    task: item.prompt,
    failureCategory: inferAIClinicFailureCategory({
      indicators: item.indicators,
      explanation: item.explanation,
      benchmarkCategory: item.benchmarkCategory,
    }),
    draftAnswer:
      item.mode === "pvp"
        ? item.primaryOutput
        : usingTrainedModel
          ? item.secondaryOutput?.trim() || ""
          : item.primaryOutput,
    modelName:
      item.mode === "pvp"
        ? item.primaryModelName
        : usingTrainedModel
          ? item.secondaryModelName
          : item.primaryModelName,
    usingTrainedModel,
    qualityNote: summarizeBenchmarkHistory(item),
  };
}

export function buildClinicStateFromPairwisePreference(
  item: PairwisePreferenceHistoryItem,
): AIClinicEvaluationPrefillState {
  const weakerIsTrained =
    item.chosenWinner === "left" ? true : item.chosenWinner === "right" ? false : true;
  const weakerAnswer =
    item.chosenWinner === "left"
      ? item.rightOutput
      : item.chosenWinner === "right"
        ? item.leftOutput
        : item.rightOutput || item.leftOutput;
  const weakerModelName =
    item.chosenWinner === "left"
      ? item.rightModelName
      : item.chosenWinner === "right"
        ? item.leftModelName
        : item.rightModelName || item.leftModelName;

  return {
    fromEvaluation: true,
    task: item.prompt,
    failureCategory: inferAIClinicFailureCategory({
      indicators: [item.rationale],
      explanation: item.rationale,
    }),
    draftAnswer: weakerAnswer,
    modelName: weakerModelName,
    usingTrainedModel: weakerIsTrained,
    referenceAnswer:
      item.chosenWinner === "draw"
        ? item.leftOutput || item.rightOutput
        : item.chosenWinner === "left"
          ? item.leftOutput
          : item.rightOutput,
    referenceModelName:
      item.chosenWinner === "draw"
        ? item.leftModelName || item.rightModelName
        : item.chosenWinner === "left"
          ? item.leftModelName
          : item.rightModelName,
    qualityNote:
      item.chosenWinner === "draw"
        ? `В выборе лучшего ответа получилась ничья. Разбери ответ и реши, что стоит улучшить: ${item.rationale}`
        : `В выборе лучшего ответа слабее оказался ответ модели «${weakerModelName}». Почему: ${item.rationale}`,
  };
}
