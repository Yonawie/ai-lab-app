import type { BenchmarkRunHistoryItem } from "@/shared/arena-benchmark-tauri";
import type {
  CompareRunHistoryItem,
  PairwisePreferenceHistoryItem,
} from "@/shared/model-compare-tauri";
import { routes } from "@/shared/routes";
import {
  buildClinicStateFromBenchmarkHistory,
  buildClinicStateFromCompareHistory,
  buildClinicStateFromPairwisePreference,
  type AIClinicEvaluationPrefillState,
} from "../ai-clinic-prefill-state";

type EvaluationCategoryKey =
  | "structure"
  | "clarity"
  | "tone"
  | "usefulness"
  | "instruction-following"
  | "general";

export type EvaluationNextAction = {
  kind: "compare" | "hidden_benchmark" | "ai_clinic" | "arena_match" | "pairwise" | "my_ai";
  title: string;
  description: string;
  href?: string;
};

export type EvaluationRepairTask = {
  id: string;
  title: string;
  reason: string;
  actionTitle: string;
  actionHref: string;
  clinicState?: AIClinicEvaluationPrefillState;
};

export type EvaluationCapabilityCard = {
  id: string;
  title: string;
  status: "strong" | "building" | "needs_work";
  summary: string;
};

export type EvaluationSummaryReadModel = {
  compareCount: number;
  benchmarkCount: number;
  hiddenBenchmarkCount: number;
  pairwiseCount: number;
  currentModelLabel: string;
  currentModelCheckCount: number;
  latestHeadline: string;
  strengths: string[];
  weakSpots: string[];
  capabilityMap: EvaluationCapabilityCard[];
  repairQueue: EvaluationRepairTask[];
  nextAction: EvaluationNextAction;
};

type WeakEvaluationCase = {
  id: string;
  createdAt: string;
  category: EvaluationCategoryKey;
  sourceLabel: string;
  clinicState: AIClinicEvaluationPrefillState;
};

function labelForCategory(category: EvaluationCategoryKey): string {
  switch (category) {
    case "structure":
      return "структура ответа";
    case "clarity":
      return "ясность объяснения";
    case "tone":
      return "тон ответа";
    case "usefulness":
      return "практическая польза";
    case "instruction-following":
      return "следование инструкции";
    case "general":
    default:
      return "общее качество ответа";
  }
}

function normalizeCategory(value: string | null | undefined): EvaluationCategoryKey {
  switch ((value ?? "").trim()) {
    case "structure":
      return "structure";
    case "clarity":
      return "clarity";
    case "tone":
      return "tone";
    case "usefulness":
      return "usefulness";
    case "instruction-following":
      return "instruction-following";
    default:
      return "general";
  }
}

function categoryFromClinicFailure(
  category: AIClinicEvaluationPrefillState["failureCategory"],
): EvaluationCategoryKey {
  switch (category) {
    case "format_not_followed":
      return "structure";
    case "tone_issue":
      return "tone";
    case "missing_step":
      return "usefulness";
    case "constraint_broken":
      return "instruction-following";
    case "too_generic":
    case "hallucination":
    default:
      return "clarity";
  }
}

function categoryFromCompare(item: CompareRunHistoryItem): EvaluationCategoryKey {
  const tag = (item.categoryTag ?? "").toLowerCase();
  if (tag.includes("structure")) return "structure";
  if (tag.includes("clarity")) return "clarity";
  if (tag.includes("tone")) return "tone";
  if (tag.includes("usefulness")) return "usefulness";
  if (tag.includes("instruction")) return "instruction-following";

  const haystack = `${item.explanation} ${item.indicators.join(" ")}`.toLowerCase();
  if (haystack.includes("структ")) return "structure";
  if (haystack.includes("тон")) return "tone";
  if (haystack.includes("полез")) return "usefulness";
  if (haystack.includes("ясн")) return "clarity";
  if (haystack.includes("инструк")) return "instruction-following";
  return "general";
}

function buildFallbackRepairTask(
  category: EvaluationCategoryKey,
  count: number,
): EvaluationRepairTask {
  switch (category) {
    case "structure":
      return {
        id: `${category}-${count}`,
        title: "Укрепи структуру ответа",
        reason: `Последние проверки ${count} раз показали, что модель слабо держит формат, шаги или шаблон ответа.`,
        actionTitle: "Разобрать в AI Clinic",
        actionHref: routes.studentAiClinic,
      };
    case "clarity":
      return {
        id: `${category}-${count}`,
        title: "Сделай ответ конкретнее",
        reason: `Последние проверки ${count} раз показали слишком общий или расплывчатый ответ.`,
        actionTitle: "Открыть AI Clinic",
        actionHref: routes.studentAiClinic,
      };
    case "tone":
      return {
        id: `${category}-${count}`,
        title: "Подстрой тон ответа",
        reason: `Последние проверки ${count} раз показали, что модели не хватает нужного стиля или аккуратности тона.`,
        actionTitle: "Открыть AI Clinic",
        actionHref: routes.studentAiClinic,
      };
    case "usefulness":
      return {
        id: `${category}-${count}`,
        title: "Добавь больше полезных шагов",
        reason: `Последние проверки ${count} раз показали, что ответу не хватает практической пользы и конкретного действия.`,
        actionTitle: "Открыть AI Clinic",
        actionHref: routes.studentAiClinic,
      };
    case "instruction-following":
      return {
        id: `${category}-${count}`,
        title: "Удержи инструкцию точнее",
        reason: `Последние проверки ${count} раз показали, что модель теряет важные рамки или не выдерживает инструкцию.`,
        actionTitle: "Открыть AI Clinic",
        actionHref: routes.studentAiClinic,
      };
    case "general":
    default:
      return {
        id: `${category}-${count}`,
        title: "Разбери слабый ответ и создай новый пример",
        reason: `Есть ${count} недавние проверки, где улучшение пока не выглядит устойчивым.`,
        actionTitle: "Открыть AI Clinic",
        actionHref: routes.studentAiClinic,
      };
  }
}

function buildCaseRepairTask(weakCase: WeakEvaluationCase): EvaluationRepairTask {
  const categoryLabel = labelForCategory(weakCase.category);
  switch (weakCase.category) {
    case "structure":
      return {
        id: weakCase.id,
        title: "Почини структуру на реальном кейсе",
        reason: `${weakCase.sourceLabel} показал, что модель слабо держит формат или порядок шагов. Разбери этот кейс в AI Clinic.`,
        actionTitle: "Открыть кейс в AI Clinic",
        actionHref: routes.studentAiClinic,
        clinicState: weakCase.clinicState,
      };
    case "clarity":
      return {
        id: weakCase.id,
        title: "Сделай ответ яснее на слабом примере",
        reason: `${weakCase.sourceLabel} показал слишком общий или расплывчатый ответ. Сразу открой этот кейс и преврати его в новый пример обучения.`,
        actionTitle: "Открыть кейс в AI Clinic",
        actionHref: routes.studentAiClinic,
        clinicState: weakCase.clinicState,
      };
    case "tone":
      return {
        id: weakCase.id,
        title: "Подстрой тон на слабом кейсе",
        reason: `${weakCase.sourceLabel} показал, что ответ звучит не в том тоне. Разбери конкретный пример и задай более точную правку.`,
        actionTitle: "Открыть кейс в AI Clinic",
        actionHref: routes.studentAiClinic,
        clinicState: weakCase.clinicState,
      };
    case "usefulness":
      return {
        id: weakCase.id,
        title: "Добавь недостающий шаг",
        reason: `${weakCase.sourceLabel} показал ответ без нужной практической пользы. Открой этот кейс и добавь, чего в нём не хватило.`,
        actionTitle: "Открыть кейс в AI Clinic",
        actionHref: routes.studentAiClinic,
        clinicState: weakCase.clinicState,
      };
    case "instruction-following":
      return {
        id: weakCase.id,
        title: "Верни ответ в рамки инструкции",
        reason: `${weakCase.sourceLabel} показал, что модель не удержала ограничения или формат. Разбери этот пример и задай точную коррекцию.`,
        actionTitle: "Открыть кейс в AI Clinic",
        actionHref: routes.studentAiClinic,
        clinicState: weakCase.clinicState,
      };
    case "general":
    default:
      return {
        id: weakCase.id,
        title: `Разбери слабый кейс: ${categoryLabel}`,
        reason: `${weakCase.sourceLabel} показал нестабильный результат. Открой этот конкретный ответ и реши, как его чинить.`,
        actionTitle: "Открыть кейс в AI Clinic",
        actionHref: routes.studentAiClinic,
        clinicState: weakCase.clinicState,
      };
  }
}

function buildCapabilityCard(
  category: EvaluationCategoryKey,
  strongCount: number,
  weakCount: number,
): EvaluationCapabilityCard {
  const title = labelForCategory(category);
  if (strongCount > 0 && weakCount === 0) {
    return {
      id: category,
      title,
      status: "strong",
      summary: `Уже подтверждено ${strongCount} раз без явных новых слабых мест.`,
    };
  }
  if (strongCount > 0 && weakCount > 0) {
    return {
      id: category,
      title,
      status: "building",
      summary: `Есть улучшение (${strongCount}), но ещё остаются слабые кейсы (${weakCount}).`,
    };
  }
  return {
    id: category,
    title,
    status: "needs_work",
    summary:
      weakCount > 0
        ? `Пока чаще видны слабые результаты (${weakCount}). Нужен новый цикл исправления.`
        : "Пока ещё мало проверок, чтобы считать этот навык устойчивым.",
  };
}

function latestTimestamp(items: string[]): string {
  return items
    .slice()
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? "";
}

export function buildEvaluationSummaryReadModel(input: {
  compareHistory: CompareRunHistoryItem[];
  benchmarkHistory: BenchmarkRunHistoryItem[];
  pairwiseHistory: PairwisePreferenceHistoryItem[];
  currentModelLabel?: string | null;
}): EvaluationSummaryReadModel {
  const { compareHistory, benchmarkHistory, pairwiseHistory } = input;
  const currentModelLabel = input.currentModelLabel?.trim() || "текущая модель";
  const currentModelCheckCount =
    compareHistory.filter((item) => item.trainedModelName?.trim() === currentModelLabel).length +
    benchmarkHistory.filter(
      (item) =>
        item.primaryModelName?.trim() === currentModelLabel ||
        item.secondaryModelName?.trim() === currentModelLabel,
    ).length;
  const hiddenBenchmarkCount = benchmarkHistory.filter((item) =>
    item.benchmarkMissionId.startsWith("hidden-"),
  ).length;

  const strengthCounts = new Map<EvaluationCategoryKey, number>();
  const weakCounts = new Map<EvaluationCategoryKey, number>();
  const weakCases: WeakEvaluationCase[] = [];

  for (const item of benchmarkHistory) {
    const category = normalizeCategory(item.benchmarkCategory);
    const result = item.resultWinner.trim().toLowerCase();
    if (result === "trained" || result === "you") {
      strengthCounts.set(category, (strengthCounts.get(category) ?? 0) + 1);
    } else if (result === "base" || result === "opponent") {
      weakCounts.set(category, (weakCounts.get(category) ?? 0) + 1);
      weakCases.push({
        id: `benchmark-${item.benchmarkRunId}`,
        createdAt: item.createdAt,
        category,
        sourceLabel: item.benchmarkTitle,
        clinicState: buildClinicStateFromBenchmarkHistory(item),
      });
    }
  }

  for (const item of compareHistory) {
    const category = categoryFromCompare(item);
    if (!item.trainedAvailable || item.indicators.length === 0) {
      weakCounts.set(category, (weakCounts.get(category) ?? 0) + 1);
      weakCases.push({
        id: `compare-${item.compareRunId}`,
        createdAt: item.createdAt,
        category,
        sourceLabel: "Compare",
        clinicState: buildClinicStateFromCompareHistory(item),
      });
    } else {
      strengthCounts.set(category, (strengthCounts.get(category) ?? 0) + 1);
    }
  }

  for (const item of pairwiseHistory) {
    const clinicState = buildClinicStateFromPairwisePreference(item);
    const category = categoryFromClinicFailure(clinicState.failureCategory);
    if (item.chosenWinner === "right") {
      strengthCounts.set(category, (strengthCounts.get(category) ?? 0) + 1);
      continue;
    }
    weakCounts.set(category, (weakCounts.get(category) ?? 0) + 1);
    weakCases.push({
      id: `pairwise-${item.preferenceId}`,
      createdAt: item.createdAt,
      category,
      sourceLabel: "Выбор лучшего ответа",
      clinicState,
    });
  }

  const strengths = [...strengthCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([category, count]) => `${labelForCategory(category)} · подтверждено ${count} раз`);

  const weakSpots = [...weakCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([category, count]) => `${labelForCategory(category)} · ещё слабо ${count} раз`);

  const repairQueue =
    weakCases.length > 0
      ? weakCases
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 3)
          .map((weakCase) => buildCaseRepairTask(weakCase))
      : [...weakCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([category, count]) => buildFallbackRepairTask(category, count));

  const capabilityCategories: EvaluationCategoryKey[] = [
    "clarity",
    "structure",
    "instruction-following",
    "tone",
    "usefulness",
  ];
  const capabilityMap = capabilityCategories.map((category) =>
    buildCapabilityCard(
      category,
      strengthCounts.get(category) ?? 0,
      weakCounts.get(category) ?? 0,
    ),
  );

  const latest = latestTimestamp([
    ...compareHistory.map((item) => item.createdAt),
    ...benchmarkHistory.map((item) => item.createdAt),
    ...pairwiseHistory.map((item) => item.createdAt),
  ]);

  let latestHeadline = "Пока мало проверок. Начни с Compare, потом переходи к Arena.";
  const latestCompare = compareHistory.find((item) => item.createdAt === latest);
  const latestBenchmark = benchmarkHistory.find((item) => item.createdAt === latest);
  const latestPairwise = pairwiseHistory.find((item) => item.createdAt === latest);
  if (latestBenchmark) {
    latestHeadline = `Последняя проверка: ${latestBenchmark.benchmarkTitle}. ${latestBenchmark.explanation}`;
  } else if (latestCompare) {
    latestHeadline = `Последний Compare: ${latestCompare.explanation}`;
  } else if (latestPairwise) {
    latestHeadline = `Последний выбор лучшего ответа: ${latestPairwise.rationale}`;
  }

  let nextAction: EvaluationNextAction;
  if (compareHistory.length === 0) {
    nextAction = {
      kind: "compare",
      title: "Начни с Compare",
      description: "Сначала проверь изменение поведения на одном понятном запросе.",
    };
  } else if (weakSpots.length > 0) {
    nextAction = {
      kind: "ai_clinic",
      title: "Разбери слабое место",
      description: "Открой AI Clinic и преврати слабый результат в новый пример обучения.",
      href: routes.studentAiClinic,
    };
  } else if (pairwiseHistory.length === 0) {
    nextAction = {
      kind: "pairwise",
      title: "Сохрани выбор лучшего ответа",
      description: "После Compare выбери лучший ответ и зафиксируй, почему он стал лучше.",
    };
  } else if (benchmarkHistory.length === 0) {
    nextAction = {
      kind: "arena_match",
      title: "Запусти Arena",
      description: "Проверь, держится ли улучшение не на одном примере, а на повторяемой миссии.",
    };
  } else if (hiddenBenchmarkCount === 0) {
    nextAction = {
      kind: "hidden_benchmark",
      title: "Запусти скрытую проверку",
      description: "Проверь модель на новой задаче, которую ты не видел заранее.",
    };
  } else {
    nextAction = {
      kind: "my_ai",
      title: "Вернись к «Мой ИИ»",
      description: "Проверки уже есть. Посмотри общую картину и выбери следующий цикл улучшения.",
      href: routes.studentAiGrowth,
    };
  }

  return {
    compareCount: compareHistory.length,
    benchmarkCount: benchmarkHistory.length,
    hiddenBenchmarkCount,
    pairwiseCount: pairwiseHistory.length,
    currentModelLabel,
    currentModelCheckCount,
    latestHeadline,
    strengths,
    weakSpots,
    capabilityMap,
    repairQueue,
    nextAction,
  };
}
