import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  fetchBenchmarkRunHistory,
  saveBenchmarkRun,
  type BenchmarkRunHistoryItem,
} from "@/shared/arena-benchmark-tauri";
import {
  compareStudentTrainedVsStudent,
  listArenaStudentOpponents,
  type ArenaStudentOpponentRow,
  type StudentVsStudentDuelResult,
} from "@/shared/arena-pvp-tauri";
import { useAuth } from "@/shared/auth-context";
import {
  compareStudentModels,
  fetchPairwisePreferenceHistory,
  fetchCompareRunHistory,
  savePairwisePreference,
  type CompareRunHistoryItem,
  type PairwisePreferenceHistoryItem,
  type PairwisePreferenceWinner,
  type StudentModelCompareResult,
} from "@/shared/model-compare-tauri";
import { routes } from "@/shared/routes";
import {
  fetchStudentTrainingPipelineStatus,
  type StudentTrainingPipelineStatus,
} from "@/shared/training-pipeline-tauri";
import {
  buildClinicStateFromBenchmarkHistory as buildSharedClinicStateFromBenchmarkHistory,
  buildClinicStateFromCompareHistory as buildSharedClinicStateFromCompareHistory,
  buildClinicStateFromCompareResult as buildSharedClinicStateFromCompareResult,
  buildClinicStateFromPairwisePreference as buildSharedClinicStateFromPairwisePreference,
  summarizeBenchmarkHistory as summarizeSharedBenchmarkHistory,
  summarizeCompareHistory as summarizeSharedCompareHistory,
} from "./ai-clinic-prefill-state";
import type { ComparePrefillState } from "./compare-prefill-state";
import { appendPvpHistory, loadPvpHistory } from "./arena-pvp-history";
import { ARENA_MISSIONS, HIDDEN_BENCHMARKS, type ArenaMission } from "./arena-missions";
import {
  computeDuelScores,
  computePvpDuelScores,
  type DuelScores,
  type PvpDuelScores,
  type PvpSideWinner,
} from "./arena-scoring";
import { applyDuelOutcome, loadArenaStats, saveArenaStats, type ArenaStats } from "./arena-stats";
import { markFinalMissionCompareDone } from "./course/lesson6/final-mission-markers";
import { buildEvaluationSummaryReadModel } from "./read-models/evaluation-summary-read-model";
import arenaStyles from "./StudentArena.module.css";
import styles from "./StudentDashboardPage.module.css";

const PRESETS = [
  "Объясни коротко, как работает ИИ",
  "Помоги ответить вежливо на грубое сообщение",
  "Объясни по шагам, что такое обучение с учителем",
] as const;

type ArenaMode = "base" | "pvp";
type CatKey = "structure" | "clarity" | "tone" | "usefulness";
type ClinicFailureCategory = import("./read-models/ai-clinic-read-model").AIClinicFailureCategory;
type AIClinicLinkState = import("./ai-clinic-prefill-state").AIClinicEvaluationPrefillState;
type LastArenaBase = { mode: "base"; mission: ArenaMission; scores: DuelScores };
type LastArenaPvp = {
  mode: "pvp";
  mission: ArenaMission;
  scores: PvpDuelScores;
  opponentEmail: string;
  opponentAlias: string | null;
};
type LastArena = LastArenaBase | LastArenaPvp;
type HiddenBenchmarkOutcome = {
  mission: ArenaMission;
  compare: StudentModelCompareResult;
  scores: DuelScores | null;
};
type CompareVerdictLevel = "strong" | "weak" | "missing";
type CompareSignal = {
  label: string;
  active: boolean;
  detail: string;
};
type CompareVerdict = {
  level: CompareVerdictLevel;
  title: string;
  summary: string;
  nextTitle: string;
  nextRoute: string;
};

const CAT_KEYS: CatKey[] = ["structure", "clarity", "tone", "usefulness"];

function categoryLabel(key: string): string {
  switch (key) {
    case "structure":
      return "Структура";
    case "clarity":
      return "Ясность";
    case "tone":
      return "Тон";
    case "usefulness":
      return "Польза";
    case "instruction-following":
      return "Следование инструкции";
    default:
      return key;
  }
}

function winnerBadgeClass(w: "base" | "trained" | "draw"): string {
  if (w === "trained") return arenaStyles.catWinnerBadgeTrained;
  if (w === "base") return arenaStyles.catWinnerBadgeBase;
  return arenaStyles.catWinnerBadgeDraw;
}

function winnerBadgeText(w: "base" | "trained" | "draw"): string {
  if (w === "trained") return "Твоя модель";
  if (w === "base") return "Базовая модель";
  return "Ничья";
}

function winnerBadgeClassPvp(w: PvpSideWinner): string {
  if (w === "you") return arenaStyles.catWinnerBadgeTrained;
  if (w === "opponent") return arenaStyles.catWinnerBadgeBase;
  return arenaStyles.catWinnerBadgeDraw;
}

function winnerBadgeTextPvp(w: PvpSideWinner): string {
  if (w === "you") return "Твоя модель";
  if (w === "opponent") return "Модель соперника";
  return "Ничья";
}

function arenaBaseResultClass(winner: "base" | "trained" | "draw"): string {
  if (winner === "trained") return arenaStyles.resultWinTrained;
  if (winner === "base") return arenaStyles.resultWinBase;
  return arenaStyles.resultDraw;
}

function arenaPvpResultClass(winner: PvpSideWinner): string {
  if (winner === "you") return arenaStyles.resultWinTrained;
  if (winner === "opponent") return arenaStyles.resultWinBase;
  return arenaStyles.resultDraw;
}

function arenaBaseWinnerTitle(winner: "base" | "trained" | "draw"): string {
  if (winner === "trained") return "Твоя модель сильнее на этой задаче";
  if (winner === "base") return "Базовая модель пока сильнее";
  return "Ничья: разница не доказана";
}

function arenaPvpWinnerTitle(winner: PvpSideWinner): string {
  if (winner === "you") return "Твоя модель выиграла матч";
  if (winner === "opponent") return "Модель соперника сильнее в этом матче";
  return "Ничья: модели сработали близко";
}

function arenaBaseNextStep(winner: "base" | "trained" | "draw"): string {
  if (winner === "trained") {
    return "Запусти ещё одну миссию или попробуй матч против модели другого ученика.";
  }
  return "Разбери слабое место в AI Clinic, добавь пример обучения и вернись к проверке.";
}

function arenaPvpNextStep(winner: PvpSideWinner): string {
  if (winner === "you") {
    return "Проверь преимущество на другой миссии, чтобы убедиться, что модель стабильна.";
  }
  return "Вернись в Compare или Training Manager, найди слабое место и улучши модель новым примером.";
}

function summarizeCompareHistory(item: CompareRunHistoryItem): string {
  if (!item.trainedAvailable) {
    return "Обученная модель была недоступна, поэтому это точечная проверка только базового ответа.";
  }
  if (item.indicators.length > 0) {
    return `Что изменилось: ${item.indicators.join(", ")}.`;
  }
  return "Явное улучшение не выделено автоматически. Сравни ответы вручную и реши, что стоит доработать.";
}

function summarizeBenchmarkHistory(item: BenchmarkRunHistoryItem): string {
  const summary = item.indicators.length > 0 ? item.indicators.join(", ") : item.explanation;
  const winner =
    item.resultWinner === "you" || item.resultWinner === "trained"
      ? "твоя модель"
      : item.resultWinner === "opponent"
        ? "модель соперника"
        : item.resultWinner === "base"
          ? "базовая модель"
          : item.resultWinner === "draw"
            ? "ничья"
            : item.resultWinner || "результат не определён";
  if (item.mode === "pvp") {
    return `Матч против модели другого студента. Лучше сработала: ${winner}. ${summary}`;
  }
  return `Проверка против базовой модели. Лучше сработала: ${winner}. ${summary}`;
}

function pairwiseWinnerLabel(winner: PairwisePreferenceWinner): string {
  switch (winner) {
    case "left":
      return "Базовая модель";
    case "right":
      return "Моя модель";
    case "draw":
    default:
      return "Ничья";
  }
}

function compareSignalText(result: StudentModelCompareResult): string {
  return [
    result.explanation,
    result.baseResponse,
    result.trainedResponse ?? "",
    ...result.indicators,
  ]
    .join(" ")
    .toLowerCase();
}

function buildCompareSignals(result: StudentModelCompareResult): CompareSignal[] {
  const text = compareSignalText(result);
  return [
    {
      label: "Конкретность",
      active: /конкрет|точн|детал|пример|ясн/.test(text),
      detail: "Ответ стал менее общим и ближе к запросу.",
    },
    {
      label: "Структура",
      active: /структур|шаг|пункт|формат|спис/.test(text),
      detail: "Появился порядок, формат или понятные шаги.",
    },
    {
      label: "Тон",
      active: /тон|вежлив|дружел|стил|поддерж/.test(text),
      detail: "Ответ лучше держит нужный стиль общения.",
    },
    {
      label: "Следующий шаг",
      active: /следующ|дальше|действ|проверь|сделай/.test(text),
      detail: "Модель понятнее говорит, что делать дальше.",
    },
  ];
}

function buildCompareVerdict(result: StudentModelCompareResult): CompareVerdict {
  const hasTrainedAnswer = Boolean(result.trainedAvailable && result.trainedResponse?.trim());
  if (!hasTrainedAnswer) {
    return {
      level: "missing",
      title: "Изменение не доказано",
      summary:
        "Обученная модель пока не дала отдельный ответ. Сначала включи свою модель, затем запусти Compare ещё раз.",
      nextTitle: "Включить модель",
      nextRoute: routes.studentTrainingManager,
    };
  }

  const activeSignalCount = buildCompareSignals(result).filter((signal) => signal.active).length;
  if (result.indicators.length >= 2 || activeSignalCount >= 2) {
    return {
      level: "strong",
      title: "Изменение заметно",
      summary:
        "На одном запросе видно, чем твоя модель отличается от базовой. Теперь проверь, держится ли улучшение на разных задачах.",
      nextTitle: "Проверить в Arena",
      nextRoute: routes.studentArena,
    };
  }

  return {
    level: "weak",
    title: "Изменение слабое",
    summary:
      "Разница пока не выглядит убедительной. Лучше разобрать слабый ответ и добавить новый пример обучения.",
    nextTitle: "Создать пример исправления",
    nextRoute: routes.studentAiClinic,
  };
}

function buildClinicStateFromPairwisePreference(item: PairwisePreferenceHistoryItem): AIClinicLinkState {
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
  const failureCategory = inferFailureCategory({
    indicators: [item.rationale],
    explanation: item.rationale,
  });

  return {
    fromEvaluation: true,
    task: item.prompt,
    failureCategory,
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

function inferFailureCategory(input: {
  indicators: string[];
  explanation?: string;
  categoryTag?: string | null;
  benchmarkCategory?: string | null;
}): ClinicFailureCategory {
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

function buildClinicStateFromCompareResult(result: StudentModelCompareResult): AIClinicLinkState {
  const usingTrainedModel = Boolean(result.trainedAvailable && result.trainedResponse?.trim());
  return {
    fromEvaluation: true,
    task: result.prompt,
    failureCategory: inferFailureCategory({
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

function buildClinicStateFromCompareHistory(item: CompareRunHistoryItem): AIClinicLinkState {
  const usingTrainedModel = Boolean(item.trainedAvailable && item.trainedOutput?.trim());
  return {
    fromEvaluation: true,
    task: item.prompt,
    failureCategory: inferFailureCategory({
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

function buildClinicStateFromBenchmarkHistory(item: BenchmarkRunHistoryItem): AIClinicLinkState {
  const usingTrainedModel = item.mode === "pvp" ? true : Boolean(item.secondaryOutput?.trim());
  return {
    fromEvaluation: true,
    task: item.prompt,
    failureCategory: inferFailureCategory({
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

function scoreBar(
  label: string,
  value: number,
  kind: "base" | "trained",
) {
  return (
    <div key={label} className={arenaStyles.scoreBarRow}>
      <div className={arenaStyles.scoreBarMeta}>
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className={arenaStyles.scoreBarTrack}>
        <div
          className={kind === "trained" ? arenaStyles.scoreBarFillTrained : arenaStyles.scoreBarFillBase}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

void [
  summarizeCompareHistory,
  summarizeBenchmarkHistory,
  buildClinicStateFromPairwisePreference,
  buildClinicStateFromCompareResult,
  buildClinicStateFromCompareHistory,
  buildClinicStateFromBenchmarkHistory,
];

export function StudentModelComparePage() {
  const { userEmail } = useAuth();
  const location = useLocation();
  const email = (userEmail ?? "").trim();
  const inTauri = isTauri();
  const comparePrefill = (location.state ?? null) as ComparePrefillState | null;

  const [prompt, setPrompt] = useState("");
  const [compareTag, setCompareTag] = useState("");
  const [comparePrefillNote, setComparePrefillNote] = useState<string | null>(null);
  const [hiddenBenchmarkPrefillNote, setHiddenBenchmarkPrefillNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StudentModelCompareResult | null>(null);
  const [pvpResult, setPvpResult] = useState<StudentVsStudentDuelResult | null>(null);
  const [arenaMode, setArenaMode] = useState<ArenaMode>("pvp");
  const [opponents, setOpponents] = useState<ArenaStudentOpponentRow[]>([]);
  const [opponentsLoading, setOpponentsLoading] = useState(false);
  const [selectedOpponentEmail, setSelectedOpponentEmail] = useState<string | null>(null);
  const [selectedMission, setSelectedMission] = useState<ArenaMission | null>(ARENA_MISSIONS[0] ?? null);
  const [lastArena, setLastArena] = useState<LastArena | null>(null);
  const [hiddenBenchmarkOutcome, setHiddenBenchmarkOutcome] = useState<HiddenBenchmarkOutcome | null>(null);
  const [compareHistory, setCompareHistory] = useState<CompareRunHistoryItem[]>([]);
  const [compareHistoryLoading, setCompareHistoryLoading] = useState(false);
  const [benchmarkHistory, setBenchmarkHistory] = useState<BenchmarkRunHistoryItem[]>([]);
  const [benchmarkHistoryLoading, setBenchmarkHistoryLoading] = useState(false);
  const [pairwiseHistory, setPairwiseHistory] = useState<PairwisePreferenceHistoryItem[]>([]);
  const [pairwiseHistoryLoading, setPairwiseHistoryLoading] = useState(false);
  const [pipelineStatus, setPipelineStatus] = useState<StudentTrainingPipelineStatus | null>(null);
  const [preferenceWinner, setPreferenceWinner] = useState<PairwisePreferenceWinner>("right");
  const [preferenceRationale, setPreferenceRationale] = useState("");
  const [preferenceSaving, setPreferenceSaving] = useState(false);
  const [stats, setStats] = useState<ArenaStats>({
    battles: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    xp: 0,
  });
  const [historyTick, setHistoryTick] = useState(0);

  const storageKey = useMemo(() => `student-model-compare-prompt:${email || "anon"}`, [email]);
  const pvpHistoryList = useMemo(() => loadPvpHistory(email), [email, historyTick]);
  const hiddenBenchmarkHistory = useMemo(
    () => benchmarkHistory.filter((item) => item.benchmarkMissionId.startsWith("hidden-")),
    [benchmarkHistory],
  );
  const nextHiddenBenchmark = useMemo(() => {
    if (HIDDEN_BENCHMARKS.length === 0) return null;
    const usedIds = new Set(hiddenBenchmarkHistory.map((item) => item.benchmarkMissionId));
    const unseen = HIDDEN_BENCHMARKS.find((mission) => !usedIds.has(mission.id));
    if (unseen) return unseen;
    return HIDDEN_BENCHMARKS[hiddenBenchmarkHistory.length % HIDDEN_BENCHMARKS.length] ?? HIDDEN_BENCHMARKS[0];
  }, [hiddenBenchmarkHistory]);
  const currentModelLabel = useMemo(() => {
    if (pipelineStatus?.usingTrainedModel && pipelineStatus.activeStudentModelAlias?.trim()) {
      return pipelineStatus.activeStudentModelAlias.trim();
    }
    return pipelineStatus?.baseModelName?.trim() || "qwen3:8b";
  }, [pipelineStatus]);
  const evaluationSummary = useMemo(
    () =>
      buildEvaluationSummaryReadModel({
        compareHistory,
        benchmarkHistory,
        pairwiseHistory,
        currentModelLabel,
      }),
    [benchmarkHistory, compareHistory, currentModelLabel, pairwiseHistory],
  );

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    setPrompt(saved && saved.trim() ? saved : PRESETS[0]);
  }, [storageKey]);

  useEffect(() => {
    if (!comparePrefill?.fromMyAi) {
      setComparePrefillNote(null);
      setHiddenBenchmarkPrefillNote(null);
      return;
    }
    if (comparePrefill.prompt.trim()) {
      setPrompt(comparePrefill.prompt.trim());
    }
    setCompareTag(comparePrefill.compareTag ?? "");
    setComparePrefillNote(comparePrefill.note?.trim() ? comparePrefill.note.trim() : null);
    setHiddenBenchmarkPrefillNote(
      comparePrefill.highlightHiddenBenchmark && comparePrefill.note?.trim() ? comparePrefill.note.trim() : null,
    );
  }, [comparePrefill]);

  useEffect(() => {
    if (location.pathname !== routes.studentArena) return;
    const id = window.setTimeout(() => scrollToProofSection("arena-match"), 120);
    return () => window.clearTimeout(id);
  }, [location.pathname]);

  useEffect(() => {
    if (email) setStats(loadArenaStats(email));
  }, [email]);

  useEffect(() => {
    if (!inTauri || !email) {
      setOpponents([]);
      return;
    }
    let cancelled = false;
    setOpponentsLoading(true);
    void (async () => {
      try {
        const rows = await listArenaStudentOpponents(email);
        if (!cancelled) setOpponents(rows);
      } catch {
        if (!cancelled) setOpponents([]);
      } finally {
        if (!cancelled) setOpponentsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [email, inTauri]);

  useEffect(() => {
    if (arenaMode !== "pvp") return;
    if (opponents.length === 0) {
      setSelectedOpponentEmail(null);
      return;
    }
    setSelectedOpponentEmail((prev) => {
      if (prev && opponents.some((o) => o.studentEmail === prev)) return prev;
      return opponents[0]?.studentEmail ?? null;
    });
  }, [arenaMode, opponents]);

  useEffect(() => {
    if (!inTauri || !email) {
      setCompareHistory([]);
      return;
    }
    let cancelled = false;
    setCompareHistoryLoading(true);
    void (async () => {
      try {
        const rows = await fetchCompareRunHistory(email, 8);
        if (!cancelled) setCompareHistory(rows);
      } catch {
        if (!cancelled) setCompareHistory([]);
      } finally {
        if (!cancelled) setCompareHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [email, inTauri]);

  useEffect(() => {
    if (!inTauri || !email) {
      setBenchmarkHistory([]);
      return;
    }
    let cancelled = false;
    setBenchmarkHistoryLoading(true);
    void (async () => {
      try {
        const rows = await fetchBenchmarkRunHistory(email, 8);
        if (!cancelled) setBenchmarkHistory(rows);
      } catch {
        if (!cancelled) setBenchmarkHistory([]);
      } finally {
        if (!cancelled) setBenchmarkHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [email, inTauri]);

  useEffect(() => {
    if (!inTauri || !email) {
      setPairwiseHistory([]);
      return;
    }
    let cancelled = false;
    setPairwiseHistoryLoading(true);
    void (async () => {
      try {
        const rows = await fetchPairwisePreferenceHistory(email, 8);
        if (!cancelled) setPairwiseHistory(rows);
      } catch {
        if (!cancelled) setPairwiseHistory([]);
      } finally {
        if (!cancelled) setPairwiseHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [email, inTauri]);

  useEffect(() => {
    if (!inTauri || !email) {
      setPipelineStatus(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const status = await fetchStudentTrainingPipelineStatus(email);
        if (!cancelled) setPipelineStatus(status);
      } catch {
        if (!cancelled) setPipelineStatus(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [email, inTauri]);

  function switchArenaMode(mode: ArenaMode) {
    setArenaMode(mode);
    setLastArena(null);
    setHiddenBenchmarkOutcome(null);
    setResult(null);
    setPvpResult(null);
    setError(null);
  }

  function scrollToProofSection(sectionId: "compare-check" | "arena-match") {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function refreshCompareHistory() {
    if (!email || !inTauri) return;
    setCompareHistory(await fetchCompareRunHistory(email, 8));
  }

  async function refreshBenchmarkHistory() {
    if (!email || !inTauri) return;
    setBenchmarkHistory(await fetchBenchmarkRunHistory(email, 8));
  }

  async function refreshPairwisePreferenceHistory() {
    if (!email || !inTauri) return;
    setPairwiseHistory(await fetchPairwisePreferenceHistory(email, 8));
  }

  async function runSavedCompare(nextPrompt: string, nextTag?: string | null) {
    if (!email || !nextPrompt.trim()) return;
    setBusy(true);
    setError(null);
    setLastArena(null);
    setHiddenBenchmarkOutcome(null);
    setPvpResult(null);
    if (!inTauri) {
      localStorage.setItem(storageKey, nextPrompt.trim());
      setPrompt(nextPrompt.trim());
      setCompareTag(nextTag ?? "");
      setResult({
        compareRunId: `browser-demo-compare:${Date.now()}`,
        baseModel: "базовая модель",
        trainedModelAlias: "демо-версия моего ИИ",
        trainedAvailable: true,
        prompt: nextPrompt.trim(),
        baseResponse:
          "Базовый ответ: можно попробовать поискать информацию и сделать вывод. Ответ общий, без структуры и проверки результата.",
        trainedResponse:
          "Мой ИИ отвечает лучше: сначала уточняет задачу, затем даёт 3 конкретных шага, пример и короткую проверку результата.",
        indicators: ["ответ стал конкретнее", "появилась структура", "есть проверяемый следующий шаг"],
        explanation:
          "В демо-режиме Compare показывает смысл проверки: один и тот же запрос, два поведения модели, понятная разница.",
        categoryTag: nextTag ?? null,
        createdAt: new Date().toISOString(),
      });
      setBusy(false);
      return;
    }
    try {
      localStorage.setItem(storageKey, nextPrompt.trim());
      setPrompt(nextPrompt.trim());
      setCompareTag(nextTag ?? "");
      const res = await compareStudentModels(email, nextPrompt.trim(), nextTag ?? undefined);
      setResult(res);
      await refreshCompareHistory();
      markFinalMissionCompareDone(email);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  async function persistBaseBenchmarkRun(
    mission: ArenaMission,
    compareResult: StudentModelCompareResult,
    scores: DuelScores,
  ) {
    await saveBenchmarkRun({
      studentEmail: email,
      mode: "base",
      benchmarkMissionId: mission.id,
      benchmarkTitle: mission.title,
      benchmarkCategory: mission.benchmarkCategory,
      prompt: mission.prompt,
      primaryModelName: compareResult.baseModel,
      secondaryModelName: compareResult.trainedModelAlias,
      primaryOutput: compareResult.baseResponse,
      secondaryOutput: compareResult.trainedResponse,
      resultWinner: scores.roundWinner,
      indicators: compareResult.indicators,
      explanation: compareResult.explanation,
    });
    await refreshBenchmarkHistory();
  }

  async function persistPvpBenchmarkRun(
    mission: ArenaMission,
    duelResult: StudentVsStudentDuelResult,
    scores: PvpDuelScores,
  ) {
    await saveBenchmarkRun({
      studentEmail: email,
      mode: "pvp",
      benchmarkMissionId: mission.id,
      benchmarkTitle: mission.title,
      benchmarkCategory: mission.benchmarkCategory,
      prompt: mission.prompt,
      primaryModelName: duelResult.selfModelAlias ?? "student-model",
      secondaryModelName: duelResult.opponentModelAlias,
      primaryOutput: duelResult.selfResponse ?? "",
      secondaryOutput: duelResult.opponentResponse,
      resultWinner: scores.roundWinner,
      indicators: duelResult.indicators,
      explanation: duelResult.explanation,
      opponentStudentEmail: duelResult.opponentStudentEmail,
    });
    await refreshBenchmarkHistory();
  }

  async function runArenaBenchmark(
    mission: ArenaMission,
    mode: ArenaMode,
    opponentEmailOverride?: string | null,
  ) {
    if (!email) return;
    if (mode === "pvp" && !(opponentEmailOverride ?? selectedOpponentEmail)) return;

    setBusy(true);
    setError(null);

    try {
      const missionPrompt = mission.prompt.trim();
      localStorage.setItem(storageKey, missionPrompt);
      setPrompt(missionPrompt);
      setCompareTag(mission.id);

      if (mode === "pvp") {
        const opponentEmail = opponentEmailOverride ?? selectedOpponentEmail;
        if (!opponentEmail) return;
        setResult(null);
        const duel = await compareStudentTrainedVsStudent(email, opponentEmail, missionPrompt);
        setPvpResult(duel);
        if (duel.selfAvailable && duel.opponentAvailable) {
          const youText = (duel.selfResponse ?? "").trim();
          const oppText = (duel.opponentResponse ?? "").trim();
          const scores = computePvpDuelScores(youText, oppText.length > 0 ? oppText : null, mission);
          if (scores) {
            setLastArena({
              mode: "pvp",
              mission,
              scores,
              opponentEmail: duel.opponentStudentEmail,
              opponentAlias: duel.opponentModelAlias,
            });
            const outcome =
              scores.roundWinner === "you"
                ? "trained"
                : scores.roundWinner === "opponent"
                  ? "base"
                  : "draw";
            const xpGain = outcome === "trained" ? 32 : outcome === "draw" ? 14 : 9;
            setStats((prev) => {
              const next = applyDuelOutcome(prev, outcome, xpGain);
              saveArenaStats(email, next);
              return next;
            });
            appendPvpHistory(email, {
              opponentEmail: duel.opponentStudentEmail,
              opponentAlias: duel.opponentModelAlias,
              missionId: mission.id,
              missionTitle: mission.title,
              winner: scores.roundWinner,
            });
            await persistPvpBenchmarkRun(mission, duel, scores);
            setHistoryTick((t) => t + 1);
          } else {
            setLastArena(null);
          }
        } else {
          setLastArena(null);
        }
        return;
      }

      setPvpResult(null);
      const compare = await compareStudentModels(email, missionPrompt, mission.id);
      setResult(compare);
      await refreshCompareHistory();
      markFinalMissionCompareDone(email);

      const trainedTrim = (compare.trainedResponse ?? "").trim();
      const trainedText = compare.trainedAvailable && trainedTrim.length > 0 ? trainedTrim : null;
      const scores = computeDuelScores(compare.baseResponse, trainedText, mission);
      if (scores && compare.trainedAvailable) {
        setLastArena({ mode: "base", mission, scores });
        const outcome =
          scores.roundWinner === "trained"
            ? "trained"
            : scores.roundWinner === "base"
              ? "base"
              : "draw";
        const xpGain = outcome === "trained" ? 32 : outcome === "draw" ? 14 : 9;
        setStats((prev) => {
          const next = applyDuelOutcome(prev, outcome, xpGain);
          saveArenaStats(email, next);
          return next;
        });
        await persistBaseBenchmarkRun(mission, compare, scores);
      } else {
        setLastArena(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
      setPvpResult(null);
      setLastArena(null);
    } finally {
      setBusy(false);
    }
  }

  async function runSavedBenchmark(item: BenchmarkRunHistoryItem) {
    const mission = ARENA_MISSIONS.find((candidate) => candidate.id === item.benchmarkMissionId);
    if (!mission) return;
    setSelectedMission(mission);
    setArenaMode(item.mode);
    if (item.mode === "pvp" && item.opponentStudentEmail) {
      setSelectedOpponentEmail(item.opponentStudentEmail);
    }
    await runArenaBenchmark(mission, item.mode, item.opponentStudentEmail);
  }

  async function handleClassicCompare() {
    if (!email || !prompt.trim()) return;
    setBusy(true);
    setError(null);
    setLastArena(null);
    setHiddenBenchmarkOutcome(null);
    setPvpResult(null);
    if (!inTauri) {
      localStorage.setItem(storageKey, prompt.trim());
      setResult({
        compareRunId: `browser-demo-compare:${Date.now()}`,
        baseModel: "базовая модель",
        trainedModelAlias: "демо-версия моего ИИ",
        trainedAvailable: true,
        prompt: prompt.trim(),
        baseResponse:
          "Базовый ответ: можно попробовать поискать информацию и сделать вывод. Ответ общий, без структуры и проверки результата.",
        trainedResponse:
          "Мой ИИ отвечает лучше: сначала уточняет задачу, затем даёт 3 конкретных шага, пример и короткую проверку результата.",
        indicators: ["ответ стал конкретнее", "появилась структура", "есть проверяемый следующий шаг"],
        explanation:
          "В демо-режиме Compare показывает смысл проверки: один и тот же запрос, два поведения модели, понятная разница.",
        categoryTag: compareTag || null,
        createdAt: new Date().toISOString(),
      });
      setPreferenceWinner("right");
      setPreferenceRationale("");
      setBusy(false);
      return;
    }
    try {
      localStorage.setItem(storageKey, prompt.trim());
      const res = await compareStudentModels(email, prompt.trim(), compareTag);
      setResult(res);
      setPreferenceWinner("right");
      setPreferenceRationale("");
      await refreshCompareHistory();
      markFinalMissionCompareDone(email);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleSavePairwisePreference() {
    if (!email || !result || lastArena) return;
    if (!result.trainedAvailable || !result.trainedResponse?.trim()) {
      setError("Сначала нужен Compare с доступной обученной моделью.");
      return;
    }
    if (!preferenceRationale.trim()) {
      setError("Коротко объясни, почему один из ответов лучше.");
      return;
    }

    setPreferenceSaving(true);
    setError(null);
    try {
      await savePairwisePreference({
        studentEmail: email,
        prompt: result.prompt,
        leftModelName: result.baseModel,
        rightModelName: result.trainedModelAlias ?? "обученная модель",
        leftOutput: result.baseResponse,
        rightOutput: result.trainedResponse,
        chosenWinner: preferenceWinner,
        rationale: preferenceRationale,
        sourceSurface: "compare",
        compareRunId: result.compareRunId,
      });
      setPreferenceRationale("");
      await refreshPairwisePreferenceHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPreferenceSaving(false);
    }
  }

  async function handleArenaDuel() {
    if (!email || !selectedMission) return;
    if (arenaMode === "pvp" && (!selectedOpponentEmail || opponents.length === 0)) return;
    setHiddenBenchmarkOutcome(null);
    await runArenaBenchmark(selectedMission, arenaMode, selectedOpponentEmail);
  }

  async function handleHiddenBenchmark(missionOverride?: ArenaMission | null) {
    const mission = missionOverride ?? nextHiddenBenchmark;
    if (!email || !mission) return;

    setBusy(true);
    setError(null);
    setResult(null);
    setPvpResult(null);
    setLastArena(null);
    setHiddenBenchmarkOutcome(null);

    try {
      const compare = await compareStudentModels(email, mission.prompt.trim(), mission.id);
      const trainedTrim = (compare.trainedResponse ?? "").trim();
      const trainedText = compare.trainedAvailable && trainedTrim.length > 0 ? trainedTrim : null;
      const scores = computeDuelScores(compare.baseResponse, trainedText, mission);

      await saveBenchmarkRun({
        studentEmail: email,
        mode: "base",
        benchmarkMissionId: mission.id,
        benchmarkTitle: mission.title,
        benchmarkCategory: mission.benchmarkCategory,
        prompt: mission.prompt,
        primaryModelName: compare.baseModel,
        secondaryModelName: compare.trainedModelAlias,
        primaryOutput: compare.baseResponse,
        secondaryOutput: compare.trainedResponse,
        resultWinner: scores?.roundWinner ?? (compare.trainedAvailable ? "draw" : "base"),
        indicators: compare.indicators,
        explanation: compare.explanation,
      });

      setHiddenBenchmarkOutcome({ mission, compare, scores });
      await refreshCompareHistory();
      await refreshBenchmarkHistory();
      markFinalMissionCompareDone(email);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function replaySameMission() {
    void handleArenaDuel();
  }

  function pickAnotherMission() {
    setLastArena(null);
    setResult(null);
    setPvpResult(null);
  }

  const duelDisabled =
    busy ||
    !email ||
    !inTauri ||
    !selectedMission ||
    (arenaMode === "pvp" && (!selectedOpponentEmail || opponents.length === 0));
  const isArenaRoute = location.pathname === routes.studentArena;
  const compareVerdict = result && !lastArena ? buildCompareVerdict(result) : null;
  const compareSignals = result && !lastArena ? buildCompareSignals(result) : [];
  const compareVerdictClass =
    compareVerdict?.level === "strong"
      ? styles.compareVerdictStrong
      : compareVerdict?.level === "weak"
        ? styles.compareVerdictWeak
        : styles.compareVerdictMissing;

  return (
    <div className={styles.page}>
      <div className={styles.gradients} aria-hidden>
        <div className={styles.blob1} />
        <div className={styles.blob2} />
      </div>

      <div className={styles.inner}>
        <header className={styles.header}>
          <Link to={routes.studentAiGrowth} className={styles.backLink}>
            ← К «Мой ИИ»
          </Link>
          <div className={styles.labHero}>
            <div className={styles.labHeroCopy}>
              <p className={styles.labKicker}>Рычаг: проверка результата</p>
              <h1 className={styles.pageTitle}>{isArenaRoute ? "Arena" : "Compare и Arena"}</h1>
              <p className={styles.labHeroText}>
                {isArenaRoute
                  ? "Устрой матч моделей на одинаковых задачах и посмотри, чья версия отвечает сильнее."
                  : "Compare проверяет изменение на одном запросе. Arena показывает, держится ли улучшение на разных задачах."}
              </p>
              <div className={styles.labHeroStats}>
                <span className={styles.labStat}>Compare: один запрос</span>
                <span className={styles.labStat}>Arena: набор задач</span>
                <span className={styles.labStat}>итог: доказательство</span>
              </div>
            </div>
            <div className={styles.labHeroVisual} aria-hidden>
              <div className={`${styles.miniCore} ${styles.miniCoreProven}`} />
            </div>
          </div>
        </header>

        {!inTauri ? (
          <article className={`${styles.card} ${styles.cardMuted}`}>
            <div className={styles.cardBody}>
              <p className={styles.classificationHint}>
                Браузерный демо-режим: Compare покажет учебный пример сравнения. В настольном приложении здесь
                сравниваются реальные ответы локальной модели.
              </p>
            </div>
          </article>
        ) : null}

        {busy ? (
          <div className={styles.aiThinkingPanel} role="status" aria-live="polite">
            <div className={styles.aiThinkingOrb} aria-hidden />
            <div className={styles.aiThinkingCopy}>
              <p className={styles.aiThinkingTitle}>
                ИИ проверяет результат
                <span className={styles.aiThinkingDots} aria-hidden>
                  <span />
                  <span />
                  <span />
                </span>
              </p>
              <p className={styles.aiThinkingText}>
                Compare или Arena запускает модели на одинаковом задании. Это может занять немного времени.
              </p>
            </div>
          </div>
        ) : null}

        <article className={`${styles.card} ${styles.cardAccent}`}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Соревнование моделей</h2>
            <p className={styles.cardDesc}>
              Ты обучил модель. Теперь проверь, выигрывает ли она у другой модели на одинаковых запросах.
            </p>
          </div>
          <div className={styles.cardBody}>
            <p className={styles.classificationHint}>
              <strong>Как работает Arena:</strong> две модели получают один и тот же запрос, система
              сравнивает ответы по нескольким критериям и фиксирует исход матча.
            </p>
            <p className={styles.classificationHint}>
              <strong>Главный режим:</strong> матч против другой студенческой модели. Это основной способ
              доказать, что твоя модель стала лучше.
            </p>
            <p className={styles.classificationHint} style={{ marginBottom: 0 }}>
              <strong>После активации модели:</strong> переходи сюда из зоны «Тренируем», запускай матч и
              сохраняй результат как проверку качества.
            </p>
          </div>
        </article>

        <article className={`${styles.card} ${styles.cardMuted}`}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Compare и Arena</h2>
            <p className={styles.cardDesc}>
              Эти поверхности нужны для разных вопросов и должны работать вместе.
            </p>
          </div>
          <div className={styles.cardBody}>
            <p className={styles.classificationHint}>
              <strong>Compare:</strong> одна проверка на одном запросе. Используй его, когда хочешь быстро
              понять, изменилось ли поведение модели на конкретном примере.
            </p>
            <p className={styles.classificationHint}>
              <strong>Arena:</strong> соревнование моделей на повторяемых задачах. Используй её, когда нужно
              проверить, держится ли улучшение на нескольких типовых миссиях.
            </p>
            <p className={styles.classificationHint} style={{ marginBottom: 0 }}>
              Сначала удобно подтвердить изменение в Compare, потом перейти в Arena и проверить, выдерживает
              ли модель более серьёзную конкуренцию.
            </p>
            <div className={styles.classificationOutcomeBad} style={{ marginTop: "0.9rem" }}>
              <p className={styles.classificationOutcomeTitle}>Если проверка слабая</p>
              <p className={styles.classificationOutcomeText}>
                Не просто повторяй запуск. Открой AI Clinic, найди тип ошибки, затем вернись
                в зону «Тренируем» и создай следующий улучшенный шаг для своей модели.
              </p>
              <div className={styles.classificationActions} style={{ marginTop: "0.75rem" }}>
                <Link to={routes.studentAiClinic} className={`${styles.btn} ${styles.btnOutline}`}>
                  Разобрать в AI Clinic
                </Link>
                <Link to={routes.studentTrain} className={`${styles.btn} ${styles.btnOutline}`}>
                  Открыть «Тренируем»
                </Link>
              </div>
            </div>
          </div>
        </article>

        <article className={`${styles.card} ${styles.cardAccent}`}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Сводка проверки результата</h2>
            <p className={styles.cardDesc}>
              Здесь собраны последние выводы из Compare, скрытых проверок и Arena, чтобы было понятно, что
              уже стало лучше и что чинить дальше.
            </p>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.modelTrainingGrid}>
              <div>
                <dt className={styles.modelTrainingDt}>Compare</dt>
                <dd className={styles.modelTrainingDd}>{evaluationSummary.compareCount}</dd>
              </div>
              <div>
                <dt className={styles.modelTrainingDt}>Проверки Arena</dt>
                <dd className={styles.modelTrainingDd}>{evaluationSummary.benchmarkCount}</dd>
              </div>
              <div>
                <dt className={styles.modelTrainingDt}>Скрытые проверки</dt>
                <dd className={styles.modelTrainingDd}>{evaluationSummary.hiddenBenchmarkCount}</dd>
              </div>
              <div>
                <dt className={styles.modelTrainingDt}>Выбор лучшего ответа</dt>
                <dd className={styles.modelTrainingDd}>{evaluationSummary.pairwiseCount}</dd>
              </div>
            </div>

            <div className={styles.classificationOutcomeOk} style={{ marginTop: "1rem" }}>
              <p className={styles.classificationOutcomeTitle}>Последний вывод</p>
              <p className={styles.classificationOutcomeText}>{evaluationSummary.latestHeadline}</p>
              <p className={styles.classificationHint} style={{ marginTop: "0.65rem" }}>
                Текущая модель: {evaluationSummary.currentModelLabel} · проверок этой версии:{" "}
                {evaluationSummary.currentModelCheckCount}
              </p>
            </div>

            <div className={styles.promptLabGrid} style={{ marginTop: "1rem" }}>
              <article className={`${styles.card} ${styles.cardMuted}`}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>Что уже подтверждено</h3>
                </div>
                <div className={styles.cardBody}>
                  {evaluationSummary.strengths.length > 0 ? (
                    <ul className={styles.taskList}>
                      {evaluationSummary.strengths.map((item) => (
                        <li key={item} className={styles.classificationCard}>
                          <p className={styles.classificationHint}>{item}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className={styles.classificationHint}>
                      Пока рано делать вывод о сильных сторонах. Нужны ещё Compare и проверки Arena.
                    </p>
                  )}
                </div>
              </article>
              <article className={`${styles.card} ${styles.cardMuted}`}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>Что ещё слабое</h3>
                </div>
                <div className={styles.cardBody}>
                  {evaluationSummary.weakSpots.length > 0 ? (
                    <ul className={styles.taskList}>
                      {evaluationSummary.weakSpots.map((item) => (
                        <li key={item} className={styles.classificationCard}>
                          <p className={styles.classificationHint}>{item}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className={styles.classificationHint}>
                      Явных слабых мест по последним проверкам не выделено. Продолжай проверять на новых задачах.
                    </p>
                  )}
                </div>
              </article>
            </div>

            <div className={styles.classificationOutcomeBad} style={{ marginTop: "1rem" }}>
              <p className={styles.classificationOutcomeTitle}>{evaluationSummary.nextAction.title}</p>
              <p className={styles.classificationOutcomeText}>{evaluationSummary.nextAction.description}</p>
              <div className={styles.classificationActions} style={{ marginTop: "0.75rem" }}>
                {evaluationSummary.nextAction.kind === "compare" ? (
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnAccent}`}
                    onClick={() => scrollToProofSection("compare-check")}
                  >
                    Перейти к Compare
                  </button>
                ) : evaluationSummary.nextAction.kind === "arena_match" ? (
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnAccent}`}
                    onClick={() => scrollToProofSection("arena-match")}
                  >
                    Перейти к Arena
                  </button>
                ) : evaluationSummary.nextAction.kind === "hidden_benchmark" ? (
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnAccent}`}
                    onClick={() => void handleHiddenBenchmark()}
                    disabled={busy || !email || !inTauri}
                  >
                    Запустить скрытую проверку
                  </button>
                ) : evaluationSummary.nextAction.href ? (
                  <Link
                    to={evaluationSummary.nextAction.href}
                    className={`${styles.btn} ${styles.btnAccent}`}
                  >
                    Перейти
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        </article>

        <article className={`${styles.card} ${styles.cardAccent}`}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Скрытая проверка</h2>
            <p className={styles.cardDesc}>
              Здесь модель получает новую задачу, которую ты не видел заранее. Это честная проверка
              переноса улучшения на незнакомый пример.
            </p>
          </div>
          <div className={styles.cardBody}>
            <p className={styles.classificationHint}>
              <strong>Что скрыто:</strong> точный запрос не показывается до запуска.
            </p>
            <p className={styles.classificationHint}>
              <strong>Зачем это нужно:</strong> скрытая задача помогает отличить реальное улучшение от ответа,
              который модель могла просто повторить из примеров обучения.
            </p>
            {hiddenBenchmarkPrefillNote ? (
              <p className={styles.classificationHint}>
                <strong>Рекомендованная скрытая проверка:</strong> {hiddenBenchmarkPrefillNote}
              </p>
            ) : null}
            {nextHiddenBenchmark ? (
              <>
                <p className={styles.classificationHint}>
                  <strong>Следующая проверка:</strong> {nextHiddenBenchmark.title} ·{" "}
                  {categoryLabel(nextHiddenBenchmark.benchmarkCategory)}
                </p>
                <p className={styles.classificationHint}>
                  <strong>Что проверяем:</strong> {nextHiddenBenchmark.evidenceFocus}
                </p>
                <div className={styles.classificationActions}>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnAccent}`}
                    onClick={() => void handleHiddenBenchmark()}
                    disabled={busy || !email || !inTauri}
                  >
                    {busy ? "Запускаем скрытую проверку..." : "Запустить скрытую проверку"}
                  </button>
                </div>
              </>
            ) : (
              <p className={styles.classificationHint}>Скрытые проверки пока не настроены.</p>
            )}
          </div>
        </article>

        {hiddenBenchmarkOutcome ? (
          <article className={`${styles.card} ${styles.cardMuted}`}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Результат скрытой проверки</h2>
              <p className={styles.cardDesc}>
                Это была новая задача. Теперь видно, переносится ли улучшение модели на незнакомый случай.
              </p>
            </div>
            <div className={styles.cardBody}>
              <p className={styles.classificationHint}>
                <strong>Проверка:</strong> {hiddenBenchmarkOutcome.mission.title}
              </p>
              <p className={styles.classificationHint}>
                <strong>Запрос:</strong> {hiddenBenchmarkOutcome.mission.prompt}
              </p>
              <p className={styles.classificationHint}>
                <strong>Итог:</strong>{" "}
                {hiddenBenchmarkOutcome.scores
                  ? hiddenBenchmarkOutcome.scores.roundWinner === "trained"
                    ? "Моя модель лучше справилась с новой задачей."
                    : hiddenBenchmarkOutcome.scores.roundWinner === "base"
                      ? "Базовая модель пока лучше на этой новой задаче."
                      : "На новой задаче получилась ничья."
                  : "Проверка сохранена, но обученная модель пока недоступна для полного сравнения."}
              </p>
              <p className={styles.classificationHint}>{hiddenBenchmarkOutcome.compare.explanation}</p>
              {hiddenBenchmarkOutcome.compare.indicators.length > 0 ? (
                <div className={styles.classificationActions}>
                  {hiddenBenchmarkOutcome.compare.indicators.map((indicator) => (
                    <span key={`hidden-live-${indicator}`} className={styles.badge}>
                      {indicator}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className={styles.classificationActions}>
                <Link
                  to={routes.studentAiClinic}
                  state={buildSharedClinicStateFromCompareResult(hiddenBenchmarkOutcome.compare)}
                  className={`${styles.btn} ${styles.btnOutline}`}
                >
                  Разобрать слабое место в AI Clinic
                </Link>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnOutline}`}
                  onClick={() => void handleHiddenBenchmark(hiddenBenchmarkOutcome.mission)}
                  disabled={busy || !inTauri}
                >
                  Повторить эту скрытую проверку
                </button>
              </div>
            </div>
          </article>
        ) : null}

        <section className={`${styles.card} ${styles.cardAccent}`}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Сводка Arena</h2>
            <p className={styles.cardDesc}>
              Здесь видна общая статистика матчей и последние соревнования с другими моделями.
            </p>
          </div>
          <div className={styles.cardBody}>
            <div className={arenaStyles.hud}>
              <div className={arenaStyles.hudStat}>
                <div className={arenaStyles.hudStatValue}>{stats.battles}</div>
                <div className={arenaStyles.hudStatLabel}>Матчи</div>
              </div>
              <div className={arenaStyles.hudStat}>
                <div className={arenaStyles.hudStatValue}>{stats.wins}</div>
                <div className={arenaStyles.hudStatLabel}>Победы</div>
              </div>
              <div className={arenaStyles.hudStat}>
                <div className={arenaStyles.hudStatValue}>{stats.losses}</div>
                <div className={arenaStyles.hudStatLabel}>Поражения</div>
              </div>
              <div className={arenaStyles.hudStat}>
                <div className={arenaStyles.hudStatValue}>{stats.draws}</div>
                <div className={arenaStyles.hudStatLabel}>Ничьи</div>
              </div>
              <div className={arenaStyles.hudStat}>
                <div className={arenaStyles.hudStatValue}>{stats.xp}</div>
                <div className={arenaStyles.hudStatLabel}>Очки проверки</div>
              </div>
            </div>

            {arenaMode === "pvp" && pvpHistoryList.length > 0 ? (
              <div style={{ marginTop: "1.25rem" }}>
                <p className={arenaStyles.sectionEyebrow} style={{ marginBottom: "0.5rem" }}>
                  Последние матчи моделей
                </p>
                <div className={arenaStyles.historyList}>
                  {pvpHistoryList.slice(0, 12).map((h) => (
                    <div key={h.id} className={arenaStyles.historyRow}>
                      <span
                        className={`${arenaStyles.historyWinner} ${
                          h.winner === "you"
                            ? arenaStyles.historyWinnerYou
                            : h.winner === "opponent"
                              ? arenaStyles.historyWinnerOpp
                              : arenaStyles.historyWinnerDraw
                        }`}
                      >
                        {h.winner === "you" ? "Победа" : h.winner === "opponent" ? "Поражение" : "Ничья"}
                      </span>
                      <span className={arenaStyles.historyMeta}>
                        {h.missionTitle} · {h.opponentEmail}
                        {h.opponentAlias ? ` · ${h.opponentAlias}` : ""}
                      </span>
                      <span className={arenaStyles.historyMeta}>
                        {new Date(h.at).toLocaleString("ru-RU", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <article className={`${styles.card} ${styles.cardMuted}`}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>История матчей и проверок</h2>
            <p className={styles.cardDesc}>
              Сохранённые результаты Arena можно повторять, чтобы понять, изменилась ли модель после новых
              улучшений.
            </p>
          </div>
          <div className={styles.cardBody}>
            {benchmarkHistoryLoading ? (
              <p className={styles.classificationHint}>Загружаем историю Arena...</p>
            ) : benchmarkHistory.length === 0 ? (
              <p className={styles.classificationHint}>
                История пока пустая. Запусти первый матч или проверку ниже, чтобы сохранить результат.
              </p>
            ) : (
              <ul className={styles.taskList}>
                {benchmarkHistory.map((item) => (
                  <li key={item.benchmarkRunId} className={styles.classificationCard}>
                    <div className={styles.classificationHeader}>
                      <div>
                        <p className={styles.classificationTitle}>{item.benchmarkTitle}</p>
                        <p className={styles.classificationSub}>
                          {new Date(item.createdAt).toLocaleString("ru-RU")} ·{" "}
                          {categoryLabel(item.benchmarkCategory)} ·{" "}
                          {item.mode === "pvp" ? "матч моделей" : "проверка против базы"}
                        </p>
                      </div>
                      <span className={styles.classificationBadge}>Arena</span>
                    </div>
                    <p className={styles.classificationHint}>
                      <strong>Запрос:</strong> {item.prompt}
                    </p>
                    <p className={styles.classificationHint}>
                      <strong>Модели:</strong> {item.primaryModelName}
                      {item.secondaryModelName ? ` → ${item.secondaryModelName}` : ""}
                      {item.opponentStudentEmail ? ` · соперник: ${item.opponentStudentEmail}` : ""}
                    </p>
                    <p className={styles.classificationHint}>
                        <strong>Итог:</strong> {summarizeSharedBenchmarkHistory(item)}
                    </p>
                    {item.indicators.length > 0 ? (
                      <div className={styles.classificationActions}>
                        {item.indicators.map((indicator) => (
                          <span key={`${item.benchmarkRunId}-${indicator}`} className={styles.badge}>
                            {indicator}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className={styles.classificationActions}>
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.btnOutline}`}
                        onClick={() => void runSavedBenchmark(item)}
                        disabled={busy || !inTauri}
                      >
                        Повторить этот матч
                      </button>
                      <Link
                        to={routes.studentAiClinic}
                        state={buildSharedClinicStateFromBenchmarkHistory(item)}
                        className={`${styles.btn} ${styles.btnOutline}`}
                      >
                        Разобрать в AI Clinic
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </article>

        {hiddenBenchmarkHistory.length > 0 ? (
          <article className={`${styles.card} ${styles.cardMuted}`}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>История скрытых проверок</h2>
              <p className={styles.cardDesc}>
                Эти результаты показывают, как модель ведёт себя на новых задачах, которых не было в
                обычной практике заранее.
              </p>
            </div>
            <div className={styles.cardBody}>
              <ul className={styles.taskList}>
                {hiddenBenchmarkHistory.map((item) => (
                  <li key={item.benchmarkRunId} className={styles.classificationCard}>
                    <div className={styles.classificationHeader}>
                      <div>
                        <p className={styles.classificationTitle}>{item.benchmarkTitle}</p>
                        <p className={styles.classificationSub}>
                          {new Date(item.createdAt).toLocaleString("ru-RU")} ·{" "}
                          {categoryLabel(item.benchmarkCategory)}
                        </p>
                      </div>
                      <span className={styles.classificationBadge}>Скрытая проверка</span>
                    </div>
                    <p className={styles.classificationHint}>
                        <strong>Итог:</strong> {summarizeSharedBenchmarkHistory(item)}
                    </p>
                    <div className={styles.classificationActions}>
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.btnOutline}`}
                        onClick={() => void runSavedBenchmark(item)}
                        disabled={busy || !inTauri}
                      >
                        Повторить скрытую проверку
                      </button>
                      <Link
                        to={routes.studentAiClinic}
                        state={buildSharedClinicStateFromBenchmarkHistory(item)}
                        className={`${styles.btn} ${styles.btnOutline}`}
                      >
                        Исправить через AI Clinic
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </article>
        ) : null}

        <section id="arena-match" className={`${styles.card} ${styles.cardMuted}`}>
          <div className={styles.cardHeader}>
            <p className={arenaStyles.sectionEyebrow}>Шаг 1</p>
            <h2 className={styles.cardTitle}>Запустить матч Arena</h2>
            <p className={styles.cardDesc}>
              Выбери формат соревнования, затем миссию. Одна миссия = один матч на одинаковом запросе.
            </p>
          </div>
          <div className={styles.cardBody}>
            <p className={styles.classificationHint}>
              <strong>Когда идти сюда:</strong> после обучения модели или Compare, когда уже есть модель,
              которую нужно проверить в более серьёзном сравнении.
            </p>
            <div className={arenaStyles.modeRow}>
              <button
                type="button"
                className={`${arenaStyles.modeBtn} ${arenaMode === "pvp" ? arenaStyles.modeBtnActive : ""}`}
                onClick={() => switchArenaMode("pvp")}
                disabled={busy || !inTauri}
              >
                Матч с другой моделью
              </button>
              <button
                type="button"
                className={`${arenaStyles.modeBtn} ${arenaMode === "base" ? arenaStyles.modeBtnActive : ""}`}
                onClick={() => switchArenaMode("base")}
                disabled={busy}
              >
                Проверка против базы
              </button>
            </div>

            <p className={styles.classificationHint} style={{ marginTop: "0.75rem" }}>
              {arenaMode === "pvp"
                ? "Главный режим Arena: твоя модель соревнуется с моделью другого студента на тех же миссиях."
                : "Дополнительный режим: проверь, выигрывает ли активная модель у базовой версии на тех же задачах."}
            </p>

            <div className={arenaStyles.matchBlueprint}>
              <div>
                <span>1</span>
                <strong>Один запрос</strong>
                <p>Обе модели получают одинаковую задачу.</p>
              </div>
              <div>
                <span>2</span>
                <strong>Два ответа</strong>
                <p>Сравниваются структура, ясность, тон и польза.</p>
              </div>
              <div>
                <span>3</span>
                <strong>Итог матча</strong>
                <p>Arena показывает, какая модель сработала сильнее.</p>
              </div>
            </div>

            {arenaMode === "pvp" && inTauri ? (
              <div style={{ marginTop: "1rem" }}>
                <p className={styles.classificationLegend}>Выбери соперника</p>
                {opponentsLoading ? (
                  <p className={styles.classificationHint}>Загружаем список моделей соперников...</p>
                ) : opponents.length === 0 ? (
                  <p className={styles.classificationHint}>
                    Пока нет других подключённых моделей студентов для матча.
                  </p>
                ) : (
                  <div className={arenaStyles.opponentGrid} style={{ marginTop: "0.5rem" }}>
                    {opponents.map((o) => {
                      const selected = selectedOpponentEmail === o.studentEmail;
                      return (
                        <button
                          key={o.studentEmail}
                          type="button"
                          className={`${arenaStyles.opponentCard} ${selected ? arenaStyles.opponentCardSelected : ""}`}
                          onClick={() => {
                            setSelectedOpponentEmail(o.studentEmail);
                            setLastArena(null);
                          }}
                          disabled={busy}
                        >
                          <div className={arenaStyles.opponentEmail}>{o.studentEmail}</div>
                          <div className={arenaStyles.opponentAlias}>Модель: {o.ollamaModelAlias}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}

            <div className={arenaStyles.missionGrid} style={{ marginTop: "1rem" }}>
              {ARENA_MISSIONS.map((mission) => {
                const selected = selectedMission?.id === mission.id;
                return (
                  <button
                    key={mission.id}
                    type="button"
                    className={`${arenaStyles.missionCard} ${selected ? arenaStyles.missionCardSelected : ""}`}
                    onClick={() => {
                      setSelectedMission(mission);
                      setLastArena(null);
                      setPrompt(mission.prompt);
                      setCompareTag(mission.id);
                    }}
                    disabled={busy}
                  >
                    <p className={arenaStyles.missionKicker}>{categoryLabel(mission.benchmarkCategory)}</p>
                    <h3 className={arenaStyles.missionTitle}>{mission.title}</h3>
                    <p className={arenaStyles.missionDesc}>{mission.description}</p>
                    <p className={styles.classificationHint}>{mission.evidenceFocus}</p>
                  </button>
                );
              })}
            </div>

            <div className={styles.classificationActions} style={{ marginTop: "1rem" }}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnAccent}`}
                onClick={() => void handleArenaDuel()}
                disabled={duelDisabled}
              >
                {busy ? "Запускаем матч..." : "Запустить матч"}
              </button>
              {lastArena ? (
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnOutline}`}
                  onClick={replaySameMission}
                  disabled={busy}
                >
                  Повторить матч
                </button>
              ) : null}
              <button
                type="button"
                className={`${styles.btn} ${styles.btnOutline}`}
                onClick={pickAnotherMission}
                disabled={busy}
              >
                Сбросить выбор
              </button>
            </div>

            {error ? <p className={styles.classificationError}>{error}</p> : null}
          </div>
        </section>

        {lastArena?.mode === "base" && result ? (
          <>
            <article className={`${styles.card} ${styles.cardMuted}`}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Результат матча с базовой моделью</h2>
                <p className={styles.cardDesc}>
                  Миссия: {lastArena.mission.title} · категория: {categoryLabel(lastArena.mission.benchmarkCategory)}
                </p>
              </div>
              <div className={styles.cardBody}>
                <div className={`${arenaStyles.resultShell} ${arenaBaseResultClass(lastArena.scores.roundWinner)}`}>
                  <div className={arenaStyles.resultBanner}>
                    <p className={arenaStyles.resultLabel}>Итог матча Arena</p>
                    <h3 className={arenaStyles.resultTitle}>{arenaBaseWinnerTitle(lastArena.scores.roundWinner)}</h3>
                    <p className={arenaStyles.resultSub}>
                      {lastArena.scores.baseTotal} : {lastArena.scores.trainedTotal} ·{" "}
                      {winnerBadgeText(lastArena.scores.roundWinner)}
                    </p>
                  </div>
                </div>
                <p className={styles.classificationHint}>
                  <strong>Победитель матча:</strong> {winnerBadgeText(lastArena.scores.roundWinner)}
                </p>
                <p className={styles.classificationHint}>
                  <strong>Почему:</strong> {result.explanation}
                </p>
                <p className={styles.classificationHint}>
                  <strong>Что дальше:</strong> {arenaBaseNextStep(lastArena.scores.roundWinner)}
                </p>
                <div className={styles.classificationActions}>
                  <Link
                    to={routes.studentAiClinic}
                    state={buildSharedClinicStateFromCompareResult(result)}
                    className={`${styles.btn} ${styles.btnOutline}`}
                  >
                    Разобрать в AI Clinic
                  </Link>
                </div>
                {result.indicators.length > 0 ? (
                  <div className={styles.classificationActions}>
                    {result.indicators.map((indicator) => (
                      <span key={indicator} className={styles.badge}>
                        {indicator}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </article>

            <div className={arenaStyles.scoreboard}>
              <div>
                <h3 className={arenaStyles.scoreColTitle}>Базовая модель · {result.baseModel}</h3>
                {CAT_KEYS.map((key) => scoreBar(categoryLabel(key), lastArena.scores.base[key], "base"))}
                <p className={arenaStyles.scoreBarMeta} style={{ marginTop: "0.5rem" }}>
                  <span>Итог</span>
                  <span>{lastArena.scores.baseTotal}</span>
                </p>
              </div>
              <div>
                <h3 className={arenaStyles.scoreColTitle}>
                  Твоя модель · {result.trainedModelAlias ?? "активная обученная модель"}
                </h3>
                {CAT_KEYS.map((key) => scoreBar(categoryLabel(key), lastArena.scores.trained[key], "trained"))}
                <p className={arenaStyles.scoreBarMeta} style={{ marginTop: "0.5rem" }}>
                  <span>Итог</span>
                  <span>{lastArena.scores.trainedTotal}</span>
                </p>
              </div>
            </div>

            <div className={arenaStyles.catWinners}>
              {CAT_KEYS.map((key) => (
                <span
                  key={key}
                  className={`${arenaStyles.catWinnerBadge} ${winnerBadgeClass(lastArena.scores.categoryWinners[key])}`}
                >
                  {categoryLabel(key)}: {winnerBadgeText(lastArena.scores.categoryWinners[key])}
                </span>
              ))}
            </div>

            <div className={arenaStyles.versusBanner}>
              <div className={arenaStyles.versusSide}>Базовая модель</div>
              <div className={arenaStyles.versusVs}>VS</div>
              <div className={arenaStyles.versusSide}>Моя модель</div>
            </div>

            <section className={styles.promptLabGrid}>
              <article className={`${styles.card} ${styles.cardMuted}`}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>Базовая модель</h3>
                  <p className={styles.cardDesc}>{result.baseModel}</p>
                </div>
                <div className={styles.cardBody}>
                  <p className={styles.chatBubbleText}>{result.baseResponse}</p>
                </div>
              </article>
              <article className={`${styles.card} ${styles.cardAccent}`}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>Твоя модель</h3>
                  <p className={styles.cardDesc}>{result.trainedModelAlias ?? "модель ещё не подключена"}</p>
                </div>
                <div className={styles.cardBody}>
                  <p className={styles.chatBubbleText}>{result.trainedResponse ?? "Пустой ответ"}</p>
                </div>
              </article>
            </section>
          </>
        ) : null}

        {lastArena?.mode === "pvp" && pvpResult ? (
          <>
            <article className={`${styles.card} ${styles.cardMuted}`}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Результат матча моделей</h2>
                <p className={styles.cardDesc}>
                  Миссия: {lastArena.mission.title} · категория: {categoryLabel(lastArena.mission.benchmarkCategory)}
                </p>
              </div>
              <div className={styles.cardBody}>
                <div className={`${arenaStyles.resultShell} ${arenaPvpResultClass(lastArena.scores.roundWinner)}`}>
                  <div className={arenaStyles.resultBanner}>
                    <p className={arenaStyles.resultLabel}>Итог соревнования моделей</p>
                    <h3 className={arenaStyles.resultTitle}>{arenaPvpWinnerTitle(lastArena.scores.roundWinner)}</h3>
                    <p className={arenaStyles.resultSub}>
                      {lastArena.scores.youTotal} : {lastArena.scores.opponentTotal} ·{" "}
                      {winnerBadgeTextPvp(lastArena.scores.roundWinner)}
                    </p>
                  </div>
                </div>
                <p className={styles.classificationHint}>
                  <strong>Победитель матча:</strong> {winnerBadgeTextPvp(lastArena.scores.roundWinner)}
                </p>
                <p className={styles.classificationHint}>
                  <strong>Почему:</strong> {pvpResult.explanation}
                </p>
                <p className={styles.classificationHint}>
                  <strong>Что дальше:</strong> {arenaPvpNextStep(lastArena.scores.roundWinner)}
                </p>
                <div className={styles.classificationActions}>
                  <Link
                    to={routes.studentAiClinic}
                    state={buildSharedClinicStateFromBenchmarkHistory({
                      benchmarkRunId: "live-pvp",
                      mode: "pvp",
                      benchmarkMissionId: lastArena.mission.id,
                      benchmarkTitle: lastArena.mission.title,
                      benchmarkCategory: lastArena.mission.benchmarkCategory,
                      prompt: lastArena.mission.prompt,
                      primaryModelName: pvpResult.selfModelAlias ?? "student-model",
                      secondaryModelName: pvpResult.opponentModelAlias,
                      primaryOutput: pvpResult.selfResponse ?? "",
                      secondaryOutput: pvpResult.opponentResponse,
                      resultWinner: lastArena.scores.roundWinner,
                      indicators: pvpResult.indicators,
                      explanation: pvpResult.explanation,
                      opponentStudentEmail: pvpResult.opponentStudentEmail,
                      createdAt: new Date().toISOString(),
                    })}
                    className={`${styles.btn} ${styles.btnOutline}`}
                  >
                    Разобрать в AI Clinic
                  </Link>
                </div>
                {pvpResult.indicators.length > 0 ? (
                  <div className={styles.classificationActions}>
                    {pvpResult.indicators.map((indicator) => (
                      <span key={indicator} className={styles.badge}>
                        {indicator}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </article>

            <div className={arenaStyles.scoreboard}>
              <div>
                <h3 className={arenaStyles.scoreColTitle}>Твоя модель · {pvpResult.selfModelAlias ?? "—"}</h3>
                {CAT_KEYS.map((key) => scoreBar(categoryLabel(key), lastArena.scores.you[key], "trained"))}
                <p className={arenaStyles.scoreBarMeta} style={{ marginTop: "0.5rem" }}>
                  <span>Итог</span>
                  <span>{lastArena.scores.youTotal}</span>
                </p>
              </div>
              <div>
                <h3 className={arenaStyles.scoreColTitle}>
                  Модель соперника · {pvpResult.opponentModelAlias ?? "—"}
                </h3>
                {CAT_KEYS.map((key) => scoreBar(categoryLabel(key), lastArena.scores.opponent[key], "base"))}
                <p className={arenaStyles.scoreBarMeta} style={{ marginTop: "0.5rem" }}>
                  <span>Итог</span>
                  <span>{lastArena.scores.opponentTotal}</span>
                </p>
              </div>
            </div>

            <div className={arenaStyles.catWinners}>
              {CAT_KEYS.map((key) => (
                <span
                  key={key}
                  className={`${arenaStyles.catWinnerBadge} ${winnerBadgeClassPvp(lastArena.scores.categoryWinners[key])}`}
                >
                  {categoryLabel(key)}: {winnerBadgeTextPvp(lastArena.scores.categoryWinners[key])}
                </span>
              ))}
            </div>

            <div className={arenaStyles.versusBanner}>
              <div className={arenaStyles.versusSide}>Моя модель</div>
              <div className={arenaStyles.versusVs}>VS</div>
              <div className={arenaStyles.versusSide}>Модель соперника</div>
            </div>

            <section className={styles.promptLabGrid}>
              <article className={`${styles.card} ${styles.cardAccent}`}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>Твоя модель</h3>
                  <p className={styles.cardDesc}>{pvpResult.selfModelAlias ?? "—"}</p>
                </div>
                <div className={styles.cardBody}>
                  <p className={styles.chatBubbleText}>{pvpResult.selfResponse ?? "—"}</p>
                </div>
              </article>
              <article className={`${styles.card} ${styles.cardMuted}`}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>Модель соперника</h3>
                  <p className={styles.cardDesc}>
                    {pvpResult.opponentStudentEmail} · {pvpResult.opponentModelAlias ?? "—"}
                  </p>
                </div>
                <div className={styles.cardBody}>
                  <p className={styles.chatBubbleText}>{pvpResult.opponentResponse ?? "—"}</p>
                </div>
              </article>
            </section>
          </>
        ) : null}

        <article className={`${styles.card} ${styles.cardMuted}`}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>История Compare</h2>
            <p className={styles.cardDesc}>
              Это история точечных проверок: один запрос, два ответа и вывод о том, изменилось ли поведение.
            </p>
          </div>
          <div className={styles.cardBody}>
            {compareHistoryLoading ? (
              <p className={styles.classificationHint}>Загружаем историю Compare...</p>
            ) : compareHistory.length === 0 ? (
              <p className={styles.classificationHint}>История Compare пока пустая.</p>
            ) : (
              <ul className={styles.taskList}>
                {compareHistory.map((item) => (
                  <li key={item.compareRunId} className={styles.classificationCard}>
                    <div className={styles.classificationHeader}>
                      <div>
                        <p className={styles.classificationTitle}>Результат Compare</p>
                        <p className={styles.classificationSub}>
                          {new Date(item.createdAt).toLocaleString("ru-RU")}
                          {item.categoryTag ? ` · тег: ${item.categoryTag}` : ""}
                        </p>
                      </div>
                      <span className={styles.classificationBadge}>Compare</span>
                    </div>
                    <p className={styles.classificationHint}>
                      <strong>Запрос:</strong> {item.prompt}
                    </p>
                    <p className={styles.classificationHint}>
                      <strong>Модели:</strong> {item.baseModel} →{" "}
                      {item.trainedModelName ?? "обученная модель недоступна"}
                    </p>
                    <p className={styles.classificationHint}>
                        <strong>Вывод:</strong> {summarizeSharedCompareHistory(item)}
                    </p>
                    {item.indicators.length > 0 ? (
                      <div className={styles.classificationActions}>
                        {item.indicators.map((indicator) => (
                          <span key={`${item.compareRunId}-${indicator}`} className={styles.badge}>
                            {indicator}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className={styles.classificationActions}>
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.btnOutline}`}
                        onClick={() => void runSavedCompare(item.prompt, item.categoryTag)}
                        disabled={busy || !inTauri}
                      >
                        Повторить Compare
                      </button>
                      <Link
                        to={routes.studentAiClinic}
                        state={buildSharedClinicStateFromCompareHistory(item)}
                        className={`${styles.btn} ${styles.btnOutline}`}
                      >
                        Разобрать в AI Clinic
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </article>

        <article className={`${styles.card} ${styles.cardMuted}`}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>История выбора лучшего ответа</h2>
            <p className={styles.cardDesc}>
              Здесь сохраняется твой выбор лучшего ответа и причина, почему он оказался сильнее.
            </p>
          </div>
          <div className={styles.cardBody}>
            {pairwiseHistoryLoading ? (
              <p className={styles.classificationHint}>Загружаем историю выбора...</p>
            ) : pairwiseHistory.length === 0 ? (
              <p className={styles.classificationHint}>
                История пока пустая. Сначала запусти Compare и выбери лучший ответ.
              </p>
            ) : (
              <ul className={styles.taskList}>
                {pairwiseHistory.map((item) => (
                  <li key={item.preferenceId} className={styles.classificationCard}>
                    <div className={styles.classificationHeader}>
                      <div>
                        <p className={styles.classificationTitle}>Выбор лучшего ответа</p>
                        <p className={styles.classificationSub}>
                          {new Date(item.createdAt).toLocaleString("ru-RU")} · победитель:{" "}
                          {pairwiseWinnerLabel(item.chosenWinner)}
                        </p>
                      </div>
                      <span className={styles.classificationBadge}>Compare</span>
                    </div>
                    <p className={styles.classificationHint}>
                      <strong>Запрос:</strong> {item.prompt}
                    </p>
                    <p className={styles.classificationHint}>
                      <strong>Пара моделей:</strong> {item.leftModelName} → {item.rightModelName}
                    </p>
                    <p className={styles.classificationHint}>
                      <strong>Почему этот ответ лучше:</strong> {item.rationale}
                    </p>
                    <div className={styles.classificationActions}>
                      <Link
                        to={routes.studentAiClinic}
                        state={buildSharedClinicStateFromPairwisePreference(item)}
                        className={`${styles.btn} ${styles.btnOutline}`}
                      >
                        Исправить слабый ответ в AI Clinic
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </article>

        <details
          id="compare-check"
          className={`${styles.card} ${styles.cardAccent} ${arenaStyles.classicDetails}`}
          open={compareHistory.length === 0}
        >
          <summary className={arenaStyles.classicToggle}>Compare: одна проверка на одном запросе</summary>
          <div className={styles.cardBody}>
            <p className={styles.cardDesc}>
              Один запрос, два ответа. Этот блок нужен для точечной проверки изменения и не заменяет матч в
              Arena.
            </p>
            <p className={styles.classificationHint}>
              <strong>Когда использовать:</strong> после Prompt Lab, примеров обучения или обучения модели, когда
              нужно быстро увидеть, стало ли лучше на одном конкретном примере.
            </p>
            <p className={styles.classificationHint}>
              <strong>Честная проверка:</strong> по возможности бери новый запрос, которого не было в твоих
              примерах обучения. Так ты проверяешь улучшение поведения, а не запоминание.
            </p>
            <div className={styles.classificationActions}>
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`${styles.btn} ${styles.btnOutline}`}
                  onClick={() => setPrompt(preset)}
                  disabled={busy}
                >
                  {preset}
                </button>
              ))}
            </div>
            <div className={styles.promptLabInputWrap}>
              <label className={styles.classificationLegend}>Тег Compare</label>
              <input
                className={styles.promptLabTextarea}
                value={compareTag}
                onChange={(e) => setCompareTag(e.target.value)}
                placeholder="Например: prompt-lab, chat-training, after-activation"
                disabled={busy}
              />
            </div>
            <div className={styles.promptLabInputWrap}>
              <label className={styles.classificationLegend}>Запрос</label>
              <textarea
                className={styles.promptLabTextarea}
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Введи запрос, чтобы увидеть оба ответа..."
                disabled={busy}
              />
            </div>
            {comparePrefillNote ? (
              <p className={styles.classificationHint}>
                <strong>Рекомендованная проверка:</strong> {comparePrefillNote}
              </p>
            ) : null}
            <div className={styles.classificationActions}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnAccent}`}
                onClick={() => void handleClassicCompare()}
                disabled={busy || !prompt.trim() || !email}
              >
                {busy ? "Запускаем Compare..." : "Запустить Compare"}
              </button>
            </div>
            {result && !lastArena ? (
              <>
                <p className={styles.classificationHint}>
                  Результат Compare: <strong>{result.compareRunId}</strong> ·{" "}
                  {new Date(result.createdAt).toLocaleString("ru-RU")}
                </p>
                {compareVerdict ? (
                  <article className={`${styles.compareVerdictCard} ${compareVerdictClass}`}>
                    <div className={styles.compareVerdictHead}>
                      <div>
                        <p className={styles.compareVerdictKicker}>Вывод Compare</p>
                        <h3 className={styles.compareVerdictTitle}>{compareVerdict.title}</h3>
                      </div>
                      <Link
                        to={compareVerdict.nextRoute}
                        state={
                          compareVerdict.level === "weak"
                            ? buildSharedClinicStateFromCompareResult(result)
                            : undefined
                        }
                        className={`${styles.btn} ${styles.btnAccent}`}
                      >
                        {compareVerdict.nextTitle}
                      </Link>
                    </div>
                    <p className={styles.compareVerdictSummary}>{compareVerdict.summary}</p>
                    <p className={styles.compareVerdictSummary}>{result.explanation}</p>
                    <div className={styles.compareSignalGrid}>
                      {compareSignals.map((signal) => (
                        <div
                          key={signal.label}
                          className={`${styles.compareSignal} ${
                            signal.active ? styles.compareSignalActive : styles.compareSignalMuted
                          }`}
                        >
                          <span>{signal.active ? "видно" : "пока не видно"}</span>
                          <strong>{signal.label}</strong>
                          <p>{signal.detail}</p>
                        </div>
                      ))}
                    </div>
                    <div className={styles.classificationActions}>
                      <Link
                        to={routes.studentAiClinic}
                        state={buildSharedClinicStateFromCompareResult(result)}
                        className={`${styles.btn} ${styles.btnOutline}`}
                      >
                        Разобрать слабое место
                      </Link>
                      <Link to={routes.studentPromptLab} className={`${styles.btn} ${styles.btnOutline}`}>
                        Улучшить запрос
                      </Link>
                      <Link to={routes.studentChatTraining} className={`${styles.btn} ${styles.btnOutline}`}>
                        Добавить пример обучения
                      </Link>
                    </div>
                  </article>
                ) : null}
                <section className={styles.promptLabGrid}>
                  <article className={`${styles.card} ${styles.cardMuted} ${styles.compareAnswerCard} ${styles.compareAnswerBase}`}>
                    <div className={styles.cardHeader}>
                      <div className={styles.promptLabResultHead}>
                        <h3 className={styles.cardTitle}>Базовая модель</h3>
                        <span className={styles.compareAnswerTag}>до</span>
                      </div>
                      <p className={styles.cardDesc}>{result.baseModel}</p>
                    </div>
                    <div className={styles.cardBody}>
                      <p className={styles.chatBubbleText}>{result.baseResponse}</p>
                    </div>
                  </article>
                  <article className={`${styles.card} ${styles.cardAccent} ${styles.compareAnswerCard} ${styles.compareAnswerTrained}`}>
                    <div className={styles.cardHeader}>
                      <div className={styles.promptLabResultHead}>
                        <h3 className={styles.cardTitle}>Моя модель</h3>
                        <span className={`${styles.compareAnswerTag} ${styles.compareAnswerTagAfter}`}>после</span>
                      </div>
                      <p className={styles.cardDesc}>{result.trainedModelAlias ?? "модель ещё не подключена"}</p>
                    </div>
                    <div className={styles.cardBody}>
                      <p className={styles.chatBubbleText}>
                        {result.trainedResponse ?? "Обученная модель пока недоступна"}
                      </p>
                    </div>
                  </article>
                </section>
                {result.trainedAvailable && result.trainedResponse?.trim() ? (
                  <article className={`${styles.card} ${styles.cardMuted}`} style={{ marginTop: "1rem" }}>
                    <div className={styles.cardHeader}>
                      <h3 className={styles.cardTitle}>Сохранить выбор лучшего ответа</h3>
                      <p className={styles.cardDesc}>
                        Выбери лучший ответ и коротко объясни почему. Это сохранит понятный сигнал о
                        качестве для твоего ИИ.
                      </p>
                    </div>
                    <div className={styles.cardBody}>
                      <div className={styles.classificationActions}>
                        <button
                          type="button"
                          className={`${styles.btn} ${
                            preferenceWinner === "left" ? styles.btnAccent : styles.btnOutline
                          }`}
                          onClick={() => setPreferenceWinner("left")}
                          disabled={preferenceSaving}
                        >
                          База лучше
                        </button>
                        <button
                          type="button"
                          className={`${styles.btn} ${
                            preferenceWinner === "right" ? styles.btnAccent : styles.btnOutline
                          }`}
                          onClick={() => setPreferenceWinner("right")}
                          disabled={preferenceSaving}
                        >
                          Моя модель лучше
                        </button>
                        <button
                          type="button"
                          className={`${styles.btn} ${
                            preferenceWinner === "draw" ? styles.btnAccent : styles.btnOutline
                          }`}
                          onClick={() => setPreferenceWinner("draw")}
                          disabled={preferenceSaving}
                        >
                          Ничья
                        </button>
                      </div>
                      <div className={styles.promptLabInputWrap}>
                        <label className={styles.classificationLegend}>Почему этот ответ лучше</label>
                        <textarea
                          className={styles.promptLabTextarea}
                          rows={4}
                          value={preferenceRationale}
                          onChange={(e) => setPreferenceRationale(e.target.value)}
                          placeholder="Например: лучше держит формат, точнее отвечает и не пропускает шаги."
                          disabled={preferenceSaving}
                        />
                      </div>
                      <div className={styles.classificationActions}>
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.btnAccent}`}
                          onClick={() => void handleSavePairwisePreference()}
                          disabled={preferenceSaving || !preferenceRationale.trim()}
                        >
                          {preferenceSaving ? "Сохраняем выбор..." : "Сохранить выбор"}
                        </button>
                        <Link
                          to={routes.studentAiClinic}
                          state={buildSharedClinicStateFromPairwisePreference({
                            preferenceId: "live-compare",
                            prompt: result.prompt,
                            leftModelName: result.baseModel,
                            rightModelName: result.trainedModelAlias ?? "обученная модель",
                            leftOutput: result.baseResponse,
                            rightOutput: result.trainedResponse,
                            chosenWinner: preferenceWinner,
                            rationale:
                              preferenceRationale.trim() ||
                              "Нужно разобрать, почему один из ответов оказался слабее.",
                            sourceSurface: "compare",
                            compareRunId: result.compareRunId,
                            createdAt: result.createdAt,
                          })}
                          className={`${styles.btn} ${styles.btnOutline}`}
                        >
                          Разобрать слабый ответ в AI Clinic
                        </Link>
                      </div>
                    </div>
                  </article>
                ) : null}
              </>
            ) : null}
            {error ? <p className={styles.classificationError}>{error}</p> : null}
          </div>
        </details>
      </div>
    </div>
  );
}
