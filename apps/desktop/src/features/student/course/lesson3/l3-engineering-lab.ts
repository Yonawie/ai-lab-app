import { CHAOS_ITEMS, LAB_RULES, L3_FINAL_CASES, type ClusterId } from "./l3-data";

export type L3DataOverview = {
  totalExamples: number;
  candidateClusters: number;
  possibleOutlierCandidates: number;
  noLabelsNote: string;
};

export function l3UnlabeledDataOverview(): L3DataOverview {
  return {
    totalExamples: CHAOS_ITEMS.length,
    candidateClusters: 3,
    possibleOutlierCandidates: 2,
    noLabelsNote:
      "В данных нет столбца «правильный класс»: только тексты. Любая группировка — это гипотеза о структуре, которую потом проверяют по пользе и стабильности.",
  };
}

export function l3StudentLayoutQuality(assignments: Record<string, ClusterId | null>): {
  allPlaced: boolean;
  allMatchTeacherKey: boolean;
  mixedZones: number;
  misplacedCount: number;
} {
  const allPlaced = CHAOS_ITEMS.every((it) => assignments[it.id] !== null);
  const misplaced = CHAOS_ITEMS.filter((it) => {
    const z = assignments[it.id];
    return z !== null && z !== it.cluster;
  });
  return {
    allPlaced,
    allMatchTeacherKey: allPlaced && misplaced.length === 0,
    mixedZones: misplaced.length > 0 ? new Set(misplaced.map((it) => assignments[it.id] as ClusterId)).size : 0,
    misplacedCount: misplaced.length,
  };
}

export function l3RuleMismatchCount(ruleKey: "by_pressure" | "by_length"): number {
  const rule = LAB_RULES.find((r) => r.key === ruleKey)!;
  return CHAOS_ITEMS.filter((it) => rule.assign(it.text) !== it.cluster).length;
}

export function l3CrossRuleDisagreements(): number {
  const a = LAB_RULES.find((r) => r.key === "by_pressure")!;
  const b = LAB_RULES.find((r) => r.key === "by_length")!;
  return CHAOS_ITEMS.filter((it) => a.assign(it.text) !== b.assign(it.text)).length;
}

export type L3FinalLabStats = {
  correctDecisions: number;
  outlierResolved: boolean;
  bestPatternLabel: string;
};

export function l3FinalLabStats(finalSolved: boolean[]): L3FinalLabStats {
  const correctDecisions = finalSolved.filter(Boolean).length;
  const outlierIdx = L3_FINAL_CASES.findIndex((c) => c.correct === "outlier");
  const outlierResolved = outlierIdx >= 0 && finalSolved[outlierIdx];
  return {
    correctDecisions,
    outlierResolved,
    bestPatternLabel:
      "тематическое разбиение «спокойные объявления / срочные сигналы / шум и риск» — опорная структура для школьного потока",
  };
}
