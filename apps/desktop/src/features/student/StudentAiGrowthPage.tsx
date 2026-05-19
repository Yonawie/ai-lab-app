import { isTauri } from "@tauri-apps/api/core";
import type { CSSProperties, PointerEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { deriveCourseProgression } from "./course/course-lab-read-model";
import { loadArenaStats, type ArenaStats } from "./arena-stats";
import { loadLastExamResult, type StoredExamSummary } from "./exam-last-storage";
import { buildNextAction } from "./evolution-data";
import { buildMyAiDashboardReadModel } from "./read-models/my-ai-dashboard-read-model";
import growthStyles from "./StudentAiGrowthPage.module.css";
import styles from "./StudentDashboardPage.module.css";
import {
  COURSE_PROGRESS_STORAGE_KEY,
  getCampaignJourneySummary,
  getCompletedLessonIds,
} from "./course/course-progress-storage";
import { TRAINING_COURSE } from "./course/training-course-model";
import { studentArenaScreenPath } from "./student-surface-paths";
import { useAuth } from "@/shared/auth-context";
import { routes, studentCourseLessonPath } from "@/shared/routes";
import {
  companionDataAvailable,
  fetchModelTrainingStatus,
  fetchStudentAiCompanion,
  type ModelTrainingStatus,
  type StudentAiCompanion,
} from "@/shared/companion-tauri";
import {
  fetchRecentStudentArtifacts,
  fetchStudentArtifactSummary,
  type StudentArtifactRecord,
  type StudentArtifactSummary,
} from "@/shared/artifact-ledger-tauri";
import {
  fetchChatTrainingContext,
  fetchChatTrainingHistory,
  type ChatTrainingContext,
  type ChatTrainingHistoryItem,
} from "@/shared/chat-training-tauri";
import {
  exportStudentAiPackage,
  fetchStudentTrainingPipelineStatus,
  type StudentTrainingPipelineStatus,
} from "@/shared/training-pipeline-tauri";
import {
  fetchCompareRunHistory,
  fetchPairwisePreferenceHistory,
  type CompareRunHistoryItem,
  type PairwisePreferenceHistoryItem,
} from "@/shared/model-compare-tauri";
import {
  fetchBenchmarkRunHistory,
  type BenchmarkRunHistoryItem,
} from "@/shared/arena-benchmark-tauri";
import {
  fetchAiStudioProjectVersions,
  type AiStudioProjectVersion,
} from "@/shared/ai-studio-tauri";

const RESULT_TYPE_LABELS: Record<string, string> = {
  prompt_experiment_saved: "Prompt Lab",
  chat_training_saved: "пример обучения",
  dataset_example_added: "пример обучения",
  dataset_exported: "данные подготовлены",
  lora_adapter_registered: "модель обучена",
  trained_model_activated: "модель включена",
  compare_run_completed: "Compare",
  benchmark_eval_completed: "Arena",
  ai_studio_project_created: "AI Studio",
  ai_studio_version_saved: "версия AI Studio",
};

const ARENA_CATEGORY_LABELS: Record<string, string> = {
  clarity: "ясность",
  tone: "тон",
  structure: "структура",
  usefulness: "польза",
  "instruction-following": "следование инструкции",
};

const STUDIO_PROJECT_TYPE_LABELS: Record<string, string> = {
  mini_game: "мини-приложение",
  interactive_story: "интерактивная история",
  assistant_tool: "полезный инструмент",
};

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value || "—";
  return parsed.toLocaleString("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function truncate(text: string, max = 180): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
}

function arenaCategoryLabel(category: string): string {
  return ARENA_CATEGORY_LABELS[category] ?? category;
}

function studioProjectTypeLabel(projectType: string): string {
  return STUDIO_PROJECT_TYPE_LABELS[projectType] ?? "проект";
}

function lineageDisplayId(value: string): string {
  const clean = value.trim();
  if (!clean || clean.endsWith(":not-ready")) return "пока нет";
  const uuid = clean.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (uuid) return uuid[0].slice(0, 8);
  const lastPart = clean.split(/[\\/]/).filter(Boolean).pop() ?? clean;
  return lastPart.length > 18 ? `${lastPart.slice(0, 17)}…` : lastPart;
}

export function StudentAiGrowthPage() {
  const { userEmail } = useAuth();
  const email = (userEmail ?? "").trim();
  const inTauri = isTauri();

  const [avatarTilt, setAvatarTilt] = useState({ x: 0, y: 0 });
  const [companion, setCompanion] = useState<StudentAiCompanion | null>(null);
  const [chatContext, setChatContext] = useState<ChatTrainingContext | null>(null);
  const [pipeline, setPipeline] = useState<StudentTrainingPipelineStatus | null>(null);
  const [training, setTraining] = useState<ModelTrainingStatus | null>(null);
  const [arena, setArena] = useState<ArenaStats>({
    battles: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    xp: 0,
  });
  const [lastExam, setLastExam] = useState<StoredExamSummary | null>(null);
  const [artifactSummary, setArtifactSummary] = useState<StudentArtifactSummary | null>(null);
  const [recentArtifacts, setRecentArtifacts] = useState<StudentArtifactRecord[]>([]);
  const [chatTrainingHistory, setChatTrainingHistory] = useState<ChatTrainingHistoryItem[]>([]);
  const [compareHistory, setCompareHistory] = useState<CompareRunHistoryItem[]>([]);
  const [benchmarkHistory, setBenchmarkHistory] = useState<BenchmarkRunHistoryItem[]>([]);
  const [pairwiseHistory, setPairwiseHistory] = useState<PairwisePreferenceHistoryItem[]>([]);
  const [aiStudioHistory, setAiStudioHistory] = useState<AiStudioProjectVersion[]>([]);
  const [loadTick, setLoadTick] = useState(0);
  const [packageExporting, setPackageExporting] = useState(false);
  const [packageMessage, setPackageMessage] = useState<string | null>(null);
  const [packageError, setPackageError] = useState<string | null>(null);
  const [campaignCompleted, setCampaignCompleted] = useState<Set<string>>(
    () => getCompletedLessonIds(),
  );

  useEffect(() => {
    if (!email) {
      setCompanion(null);
      setChatContext(null);
      setPipeline(null);
      setTraining(null);
      setArena({ battles: 0, wins: 0, losses: 0, draws: 0, xp: 0 });
      setLastExam(null);
      setArtifactSummary(null);
      setRecentArtifacts([]);
      setChatTrainingHistory([]);
      setCompareHistory([]);
      setBenchmarkHistory([]);
      setPairwiseHistory([]);
      setAiStudioHistory([]);
      setPackageMessage(null);
      setPackageError(null);
      return;
    }

    setArena(loadArenaStats(email));
    setLastExam(loadLastExamResult(email));

    let cancelled = false;
    void (async () => {
      try {
        const [
          companionRow,
          chatRow,
          pipelineRow,
          trainingRow,
          artifactRow,
          artifacts,
          trainingExamples,
          compareRuns,
          benchmarkRuns,
          pairwiseRows,
          studioVersions,
        ] = await Promise.all([
          fetchStudentAiCompanion(email).catch(() => null),
          fetchChatTrainingContext(email).catch(() => null),
          fetchStudentTrainingPipelineStatus(email).catch(() => null),
          fetchModelTrainingStatus(email).catch(() => null),
          fetchStudentArtifactSummary(email).catch(() => null),
          fetchRecentStudentArtifacts(email, 8).catch(() => []),
          fetchChatTrainingHistory(email, 8).catch(() => []),
          fetchCompareRunHistory(email, 5).catch(() => []),
          fetchBenchmarkRunHistory(email, 5).catch(() => []),
          fetchPairwisePreferenceHistory(email, 5).catch(() => []),
          fetchAiStudioProjectVersions(email, 5).catch(() => []),
        ]);
        if (cancelled) return;
        setCompanion(companionDataAvailable() ? companionRow : null);
        setChatContext(companionDataAvailable() ? chatRow : null);
        setPipeline(companionDataAvailable() ? pipelineRow : null);
        setTraining(companionDataAvailable() ? trainingRow : null);
        setArtifactSummary(artifactRow);
        setRecentArtifacts(artifacts);
        setChatTrainingHistory(trainingExamples);
        setCompareHistory(compareRuns);
        setBenchmarkHistory(benchmarkRuns);
        setPairwiseHistory(pairwiseRows);
        setAiStudioHistory(studioVersions);
      } catch {
        if (cancelled) return;
        setCompanion(null);
        setChatContext(null);
        setPipeline(null);
        setTraining(null);
        setArtifactSummary(null);
        setRecentArtifacts([]);
        setChatTrainingHistory([]);
        setCompareHistory([]);
        setBenchmarkHistory([]);
        setPairwiseHistory([]);
        setAiStudioHistory([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [email, loadTick]);

  useEffect(() => {
    const sync = () => setCampaignCompleted(getCompletedLessonIds());
    sync();
    const onStorage = (event: StorageEvent) => {
      if (event.key === COURSE_PROGRESS_STORAGE_KEY || event.key === null) sync();
    };
    window.addEventListener("ai-lab-course-progress", sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("ai-lab-course-progress", sync);
      window.removeEventListener("storage", onStorage);
    };
  }, [email, loadTick]);

  const campaignJourney = useMemo(
    () => getCampaignJourneySummary(campaignCompleted),
    [campaignCompleted],
  );
  const activeLesson =
    campaignJourney.activeLessonIndex != null
      ? TRAINING_COURSE.lessons[campaignJourney.activeLessonIndex]
      : null;
  const progression = useMemo(
    () => deriveCourseProgression(artifactSummary, campaignCompleted),
    [artifactSummary, campaignCompleted],
  );
  const nextAction = useMemo(
    () =>
      buildNextAction(
        pipeline,
        lastExam,
        arena,
        inTauri,
        artifactSummary,
        compareHistory,
        benchmarkHistory,
        aiStudioHistory,
        progression,
      ),
    [
      pipeline,
      lastExam,
      arena,
      inTauri,
      artifactSummary,
      compareHistory,
      benchmarkHistory,
      aiStudioHistory,
      progression,
    ],
  );

  const artifactCounts = artifactSummary?.countsByType ?? {};
  const pipelineExampleCount = pipeline
    ? pipeline.datasetExampleCount + pipeline.promptExperimentCount + pipeline.chatTrainingInteractionCount
    : null;
  const exampleCount =
    pipelineExampleCount ??
    training?.datasetSize ??
    chatContext?.datasetSize ??
    artifactCounts.dataset_example_added ??
    0;
  const strongExampleCount = pipeline?.chatTrainingStrongExampleCount ?? 0;
  const latestCompare = compareHistory[0] ?? null;
  const latestBenchmark = benchmarkHistory[0] ?? null;
  const latestProject = aiStudioHistory[0] ?? null;
  const activeModelLabel =
    pipeline?.usingTrainedModel && pipeline.activeStudentModelAlias?.trim()
      ? pipeline.activeStudentModelAlias.trim()
      : pipeline?.usingTrainedModel
        ? "обученная модель"
        : "базовая модель";
  const hasExamples =
    exampleCount > 0 ||
    (artifactCounts.chat_training_saved ?? 0) > 0 ||
    (artifactCounts.dataset_example_added ?? 0) > 0;
  const hasTraining =
    Boolean(pipeline?.exportAvailable) ||
    Boolean(pipeline?.adapterAvailable) ||
    (artifactCounts.dataset_exported ?? 0) > 0 ||
    (artifactCounts.lora_adapter_registered ?? 0) > 0;
  const hasActivatedModel =
    Boolean(pipeline?.usingTrainedModel) || (artifactCounts.trained_model_activated ?? 0) > 0;
  const hasChecks =
    (artifactCounts.compare_run_completed ?? 0) > 0 ||
    (artifactCounts.benchmark_eval_completed ?? 0) > 0;
  const avatarGrowthStage =
    hasActivatedModel && hasChecks
      ? "proven"
      : hasActivatedModel || hasTraining
        ? "trained"
        : hasExamples
          ? "learning"
          : "base";
  const avatarGrowthClass =
    avatarGrowthStage === "proven"
      ? growthStyles.aiAvatarProven
      : avatarGrowthStage === "trained"
        ? growthStyles.aiAvatarTrained
        : avatarGrowthStage === "learning"
          ? growthStyles.aiAvatarLearning
          : growthStyles.aiAvatarBase;
  const avatarParticleCount =
    avatarGrowthStage === "proven" ? 14 : avatarGrowthStage === "trained" ? 10 : avatarGrowthStage === "learning" ? 7 : 4;
  const avatarGrowthTitle =
    avatarGrowthStage === "proven"
      ? "Proven"
      : avatarGrowthStage === "trained"
        ? "Trained"
        : avatarGrowthStage === "learning"
          ? "Learning"
          : "Base";
  const trainingLoop = [
    {
      id: "examples",
      title: "1. Дай примеры",
      done: hasExamples,
      detail: hasExamples
        ? `${exampleCount} примеров обучения уже есть · сильных: ${strongExampleCount}`
        : "Сначала добавь примеры обучения",
    },
    {
      id: "train",
      title: "2. Обучи модель",
      done: hasTraining,
      detail: hasTraining
        ? "Данные подготовлены или модель уже обучалась"
        : "Следующий шаг — запустить обучение модели",
    },
    {
      id: "activate",
      title: "3. Включи модель",
      done: hasActivatedModel,
      detail: hasActivatedModel
        ? "Сейчас работает твоя обученная модель"
        : "После обучения включи свою модель",
    },
    {
      id: "check",
      title: "4. Проверь результат",
      done: hasChecks,
      detail: hasChecks ? "Уже есть проверка в Compare или Arena" : "Сначала Compare, потом Arena",
    },
  ];
  const pilotRoute = [
    {
      id: "pilot-prompt",
      title: "1. Запусти ИИ",
      detail: "Миссия 1 или Prompt Lab: один простой запрос и улучшенная версия.",
      href: studentCourseLessonPath(TRAINING_COURSE.lessons[0].id),
      cta: "Начать",
      done: (artifactCounts.prompt_experiment_saved ?? 0) > 0 || progression.lessons[0]?.status === "completed",
    },
    {
      id: "pilot-example",
      title: "2. Научи на примере",
      detail: "Chat Training: слабый ответ, критика и лучший целевой ответ.",
      href: routes.studentChatTraining,
      cta: "Дать пример",
      done: (artifactCounts.chat_training_saved ?? 0) > 0 || (artifactCounts.dataset_example_added ?? 0) > 0,
    },
    {
      id: "pilot-check",
      title: "3. Проверь изменение",
      detail: "Compare: один запрос до/после, чтобы увидеть разницу.",
      href: routes.studentModelCompare,
      cta: "Проверить",
      done: (artifactCounts.compare_run_completed ?? 0) > 0,
    },
  ];
  const compareStatus = latestCompare ? `есть · ${formatDateTime(latestCompare.createdAt)}` : "пока нет";
  const arenaStatus = latestBenchmark ? `есть · ${formatDateTime(latestBenchmark.createdAt)}` : "пока нет";
  async function handleExportMyAiPackage() {
    if (!email || packageExporting) return;
    setPackageExporting(true);
    setPackageMessage(null);
    setPackageError(null);
    try {
      const exported = await exportStudentAiPackage(email);
      const warningSuffix =
        exported.warnings.length > 0
          ? ` Есть предупреждения: ${exported.warnings.slice(0, 2).join(" ")}`
          : "";
      setPackageMessage(`Пакет готов: ${exported.exportDir}.${warningSuffix}`);
    } catch (error) {
      setPackageError(error instanceof Error ? error.message : String(error));
    } finally {
      setPackageExporting(false);
    }
  }

  const visibleLessons = progression.lessons.slice(0, 4);
  const myAiDashboard = useMemo(
    () =>
      buildMyAiDashboardReadModel({
        inTauri,
        pipeline,
        training,
        chatContext,
        chatTrainingHistory,
        artifactSummary,
        compareHistory,
        benchmarkHistory,
        pairwiseHistory,
        aiStudioHistory,
        nextAction,
      }),
    [
      inTauri,
      pipeline,
      training,
      chatContext,
      chatTrainingHistory,
      artifactSummary,
      compareHistory,
      benchmarkHistory,
      pairwiseHistory,
      aiStudioHistory,
      nextAction,
    ],
  );
  const recommendedCompareState =
    myAiDashboard.studentAI.status.trainingFocusNextCheck?.comparePrefill ??
    myAiDashboard.studentAI.status.trainingFocusStrongerCheck?.comparePrefill ??
    null;
  const primaryActionState =
    myAiDashboard.primaryAction.primaryHref === routes.studentEvaluate ||
    myAiDashboard.primaryAction.primaryHref === routes.studentModelCompare
      ? recommendedCompareState
      : null;
  const secondaryActionState =
    myAiDashboard.primaryAction.secondaryHref === routes.studentEvaluate ||
    myAiDashboard.primaryAction.secondaryHref === routes.studentModelCompare
      ? recommendedCompareState
      : null;
  const capabilityMap = [
    {
      id: "format",
      title: "Держит формат",
      value: Math.min(100, 18 + (artifactCounts.prompt_experiment_saved ?? 0) * 16 + (artifactCounts.compare_run_completed ?? 0) * 18),
      detail: (artifactCounts.compare_run_completed ?? 0) > 0 ? "проверено в Compare" : "растёт через Prompt Lab",
    },
    {
      id: "examples",
      title: "Учится на примерах",
      value: Math.min(100, exampleCount * 12 + strongExampleCount * 10),
      detail: `${exampleCount} примеров · сильных: ${strongExampleCount}`,
    },
    {
      id: "feedback",
      title: "Реагирует на feedback",
      value: Math.min(100, (artifactCounts.chat_training_saved ?? 0) * 18 + pairwiseHistory.length * 18),
      detail: pairwiseHistory.length > 0 ? `${pairwiseHistory.length} выборов лучшего ответа` : "нужны правки ответов",
    },
    {
      id: "proof",
      title: "Проходит проверки",
      value: Math.min(100, (artifactCounts.compare_run_completed ?? 0) * 22 + (artifactCounts.benchmark_eval_completed ?? 0) * 26),
      detail: hasChecks ? "есть подтверждение результата" : "ждёт Compare или Arena",
    },
  ];
  const modelVersionTimeline = [
    {
      id: "base",
      title: "Base",
      done: true,
      detail: "стартовая модель",
    },
    {
      id: "v1",
      title: "My AI v1",
      done: hasExamples || hasTraining || hasActivatedModel,
      detail: hasExamples ? `${exampleCount} примеров обучения` : "ждёт первый пример",
    },
    {
      id: "v2",
      title: "My AI v2",
      done: hasActivatedModel && hasChecks,
      detail: hasActivatedModel ? (hasChecks ? "включена и проверяется" : "готова к Compare") : "после обучения",
    },
  ];
  const lastChangeText = latestBenchmark
    ? `Последняя Arena: ${latestBenchmark.benchmarkTitle || "проверка на задачах"}`
    : latestCompare
      ? `Последний Compare: ${truncate(latestCompare.prompt, 72)}`
      : latestProject
        ? `Последний проект: ${studioProjectTypeLabel(latestProject.projectType)}`
        : hasExamples
          ? "ИИ уже получил первые примеры. Следующий заметный скачок будет после обучения."
          : "Пока это стартовая модель. Дай ей первый пример, и здесь появится история роста.";
  const avatarStateLabel = hasActivatedModel
    ? "твоя модель активна"
    : hasTraining
      ? "модель готовится"
      : hasExamples
        ? "ИИ набирает примеры"
        : "стартовое ядро";
  const avatarTouchHint = hasActivatedModel
    ? "Поверни меня и проверь в Compare"
    : hasExamples
      ? "Поверни меня: я уже учусь"
      : "Поверни меня и дай первый пример";

  function handleAvatarPointerMove(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 18;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * -18;
    setAvatarTilt({ x: y, y: x });
  }

  function resetAvatarTilt() {
    setAvatarTilt({ x: 0, y: 0 });
  }

  return (
    <div className={styles.page}>
      <div className={styles.gradients} aria-hidden>
        <div className={styles.blob1} />
        <div className={styles.blob2} />
      </div>

      <div className={styles.inner}>
        <header className={styles.header}>
          <div className={growthStyles.hero} aria-labelledby="growth-hero-title">
            <div className={growthStyles.heroGlow} aria-hidden />
            <div className={growthStyles.heroInner}>
              <div className={growthStyles.heroCopy}>
                <p className={growthStyles.heroKicker}>Мой ИИ</p>
                <h1 id="growth-hero-title" className={growthStyles.heroTitle}>
                  Собери своего ИИ-помощника
                </h1>
                <p className={growthStyles.heroLead}>
                  Дай ему примеры, обучи новую версию и докажи, что ответы стали лучше.
                </p>
                <div className={growthStyles.heroStatusRow}>
                  <span className={growthStyles.heroStatusPill}>{avatarStateLabel}</span>
                  <span className={growthStyles.heroStatusPill}>{exampleCount} примеров</span>
                  <span className={growthStyles.heroStatusPill}>{hasChecks ? "есть проверка" : "проверка впереди"}</span>
                </div>
                <div className={growthStyles.treeRow}>
                  <span className={growthStyles.treeNode}>1. Дай примеры</span>
                  <span className={growthStyles.treeLine} />
                  <span className={`${growthStyles.treeNode} ${growthStyles.treeNodeAccent}`}>
                    2. Обучи модель
                  </span>
                  <span className={growthStyles.treeLine} />
                  <span className={growthStyles.treeNode}>3. Включи модель</span>
                  <span className={growthStyles.treeLine} />
                  <span className={growthStyles.treeNode}>4. Проверь результат</span>
                </div>
              </div>

              <div className={growthStyles.aiAvatarStage} aria-label="Визуальное состояние моего ИИ">
                <div
                  className={`${growthStyles.aiAvatarShell} ${avatarGrowthClass}`}
                  style={{
                    "--avatar-tilt-x": `${avatarTilt.x}deg`,
                    "--avatar-tilt-y": `${avatarTilt.y}deg`,
                  } as CSSProperties}
                  onPointerMove={handleAvatarPointerMove}
                  onPointerLeave={resetAvatarTilt}
                >
                  <div className={growthStyles.aiParticleField} aria-hidden>
                    {Array.from({ length: avatarParticleCount }, (_, index) => (
                      <span
                        key={index}
                        className={growthStyles.aiParticle}
                        style={{ animationDelay: `${index * -0.37}s` }}
                      />
                    ))}
                  </div>
                  <div className={growthStyles.aiGrowthHalo} aria-hidden />
                  <div className={growthStyles.aiOrbit} aria-hidden />
                  <div className={growthStyles.aiOrbitTwo} aria-hidden />
                  <div className={growthStyles.aiOrb} aria-hidden>
                    <div className={growthStyles.aiOrbGlow} />
                    <div className={growthStyles.aiOrbCore} />
                  </div>
                  <span className={`${growthStyles.aiAvatarChip} ${growthStyles.aiAvatarChipOne}`}>
                    {hasExamples ? "память растёт" : "ждёт пример"}
                  </span>
                  <span className={`${growthStyles.aiAvatarChip} ${growthStyles.aiAvatarChipTwo}`}>
                    {hasActivatedModel ? "версия включена" : "base mode"}
                  </span>
                </div>
                <p className={growthStyles.aiAvatarLabel}>
                  {companion ? companion.name : myAiDashboard.studentAI.identity.displayName}
                </p>
                <p className={growthStyles.aiAvatarStageLabel}>{avatarGrowthTitle}</p>
                <p className={growthStyles.aiAvatarSub}>{lastChangeText}</p>
                <p className={growthStyles.aiAvatarTouchHint}>{avatarTouchHint}</p>
              </div>
            </div>
          </div>

          <section className={growthStyles.aiLivePanel} aria-label="Способности и версии моего ИИ">
            <div className={growthStyles.capabilityMap}>
              {capabilityMap.map((capability) => (
                <article key={capability.id} className={growthStyles.capabilityCard}>
                  <div className={growthStyles.capabilityTop}>
                    <span>{capability.title}</span>
                    <strong>{capability.value}%</strong>
                  </div>
                  <div className={growthStyles.capabilityBar} aria-hidden>
                    <span
                      className={growthStyles.capabilityBarFill}
                      style={{ width: `${capability.value}%` }}
                    />
                  </div>
                  <p>{capability.detail}</p>
                </article>
              ))}
            </div>
            <div className={growthStyles.versionTimeline}>
              {modelVersionTimeline.map((version, index) => (
                <article
                  key={version.id}
                  className={`${growthStyles.versionStep} ${version.done ? growthStyles.versionStepDone : ""}`}
                >
                  <span className={growthStyles.versionNode}>{index + 1}</span>
                  <div>
                    <strong>{version.title}</strong>
                    <p>{version.detail}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className={growthStyles.pilotPlan} aria-labelledby="pilot-plan-title">
            <div className={growthStyles.pilotPlanHead}>
              <div>
                <p className={growthStyles.pilotPlanKicker}>План на первый урок</p>
                <h2 id="pilot-plan-title" className={growthStyles.pilotPlanTitle}>
                  За 90 минут: запусти, научи, проверь
                </h2>
              </div>
              <span className={growthStyles.pilotPlanBadge}>для класса</span>
            </div>
            <div className={growthStyles.pilotPlanGrid}>
              {pilotRoute.map((step) => (
                <article key={step.id} className={growthStyles.pilotStep}>
                  <span className={`${growthStyles.stageBadge} ${step.done ? growthStyles.stageBadgeDone : ""}`}>
                    {step.done ? "готово" : "сделать"}
                  </span>
                  <div className={growthStyles.stageMain}>
                    <p className={growthStyles.stageTitle}>{step.title}</p>
                    <p className={growthStyles.stageDetail}>{step.detail}</p>
                    <Link to={step.href} className={growthStyles.pilotStepLink}>
                      {step.cta}
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <div className={growthStyles.firstRunBar} role="region" aria-label="Следующий шаг">
            {campaignJourney.allCompleted ? (
              <>
                <p className={growthStyles.firstRunText}>
                  Курс завершён. Теперь эта страница показывает текущее состояние твоей
                  модели и лучший следующий шаг.
                </p>
                <div className={growthStyles.firstRunActions}>
                  <Link to={routes.studentBuild} className={growthStyles.firstRunPrimary}>
                    Строим
                  </Link>
                  <Link to={routes.studentEvaluate} className={growthStyles.firstRunSecondary}>
                    Проверяем
                  </Link>
                </div>
              </>
            ) : activeLesson ? (
              <>
                <p className={growthStyles.firstRunText}>
                  Сейчас активна сессия {campaignJourney.activeLessonIndex! + 1}: «{activeLesson.title}».
                  Продолжи её или открой карту курса.
                </p>
                <div className={growthStyles.firstRunActions}>
                  <Link to={studentCourseLessonPath(activeLesson.id)} className={growthStyles.firstRunPrimary}>
                    Продолжить сессию
                  </Link>
                  <Link to={routes.studentCourse} className={growthStyles.firstRunSecondary}>
                    Карта курса
                  </Link>
                </div>
              </>
            ) : (
              <>
                <p className={growthStyles.firstRunText}>
                  Начни с первой сессии. После первых результатов здесь появится живая
                  картина твоего ИИ.
                </p>
                <div className={growthStyles.firstRunActions}>
                  <Link
                    to={studentCourseLessonPath(TRAINING_COURSE.lessons[0].id)}
                    className={growthStyles.firstRunPrimary}
                  >
                    Начать сессию 1
                  </Link>
                  <Link to={routes.studentCourse} className={growthStyles.firstRunSecondary}>
                    Карта курса
                  </Link>
                </div>
              </>
            )}
          </div>
        </header>

        <section className={`${styles.card} ${styles.cardAccent}`}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Мой ИИ сейчас</h2>
            <p className={styles.cardDesc}>
              Коротко: какая модель включена, чему ты её уже научил и что проверил.
            </p>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnOutline}`}
              style={{ alignSelf: "flex-start", marginTop: "0.35rem" }}
              onClick={() => setLoadTick((tick) => tick + 1)}
            >
              Обновить
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnAccent}`}
              style={{ alignSelf: "flex-start", marginTop: "0.35rem" }}
              onClick={() => void handleExportMyAiPackage()}
              disabled={!email || packageExporting}
            >
              {packageExporting ? "Собираем пакет..." : "Забрать моего ИИ"}
            </button>
            {packageMessage ? (
              <div className={styles.classificationOutcomeOk} style={{ marginTop: "0.7rem" }}>
                {packageMessage}
              </div>
            ) : null}
            {packageError ? (
              <div className={styles.classificationOutcomeBad} style={{ marginTop: "0.7rem" }}>
                {packageError}
              </div>
            ) : null}
          </div>
          <div className={styles.cardBody}>
            <div className={growthStyles.summaryGrid}>
              <div className={growthStyles.summaryCell}>
                <p className={growthStyles.summaryLabel}>Мой ИИ</p>
                <p className={growthStyles.summaryValue}>
                  {companion ? companion.name : myAiDashboard.studentAI.identity.displayName}
                </p>
              </div>
              <div className={growthStyles.summaryCell}>
                <p className={growthStyles.summaryLabel}>Активная модель</p>
                <p className={growthStyles.summaryValue} style={{ fontSize: "0.85rem" }}>
                  {activeModelLabel}
                </p>
              </div>
              <div className={growthStyles.summaryCell}>
                <p className={growthStyles.summaryLabel}>Примеры обучения</p>
                <p className={growthStyles.summaryValue}>{exampleCount}</p>
              </div>
              <div className={growthStyles.summaryCell}>
                <p className={growthStyles.summaryLabel}>Сильные примеры</p>
                <p className={growthStyles.summaryValue}>{strongExampleCount}</p>
              </div>
              <div className={growthStyles.summaryCell}>
                <p className={growthStyles.summaryLabel}>Обучение</p>
                <p className={growthStyles.summaryValue}>
                  {myAiDashboard.studentAI.status.trainingPrepared ? "подготовлено" : "ещё нет"}
                </p>
              </div>
              <div className={growthStyles.summaryCell}>
                <p className={growthStyles.summaryLabel}>Модель включена</p>
                <p className={growthStyles.summaryValue}>
                  {myAiDashboard.studentAI.status.trainedModelActive ? "да" : "нет"}
                </p>
              </div>
              <div className={growthStyles.summaryCell}>
                <p className={growthStyles.summaryLabel}>Compare</p>
                <p className={growthStyles.summaryValue} style={{ fontSize: "0.85rem" }}>
                  {compareStatus}
                </p>
              </div>
              <div className={growthStyles.summaryCell}>
                <p className={growthStyles.summaryLabel}>Arena</p>
                <p className={growthStyles.summaryValue} style={{ fontSize: "0.85rem" }}>
                  {arenaStatus}
                </p>
              </div>
              <div className={growthStyles.summaryCell}>
                <p className={growthStyles.summaryLabel}>Что дальше</p>
                <p className={growthStyles.summaryValue} style={{ fontSize: "0.82rem" }}>
                  {myAiDashboard.primaryAction.title}
                </p>
              </div>
            </div>

            <div className={growthStyles.stageList} style={{ marginTop: "0.9rem" }}>
              {trainingLoop.map((stage) => (
                <article key={stage.id} className={growthStyles.stageRow}>
                  <span className={`${growthStyles.stageBadge} ${stage.done ? growthStyles.stageBadgeDone : ""}`}>
                    {stage.done ? "сделано" : "дальше"}
                  </span>
                  <div className={growthStyles.stageMain}>
                    <p className={growthStyles.stageTitle}>{stage.title}</p>
                    <p className={growthStyles.stageDetail}>{stage.detail}</p>
                  </div>
                </article>
              ))}
            </div>

            {myAiDashboard.studentAI.status.trainingFocus.length > 0 ? (
              <div style={{ marginTop: "0.9rem" }}>
                <h3 className={styles.cardTitle} style={{ marginBottom: "0.5rem" }}>
                  Что ты сейчас доучиваешь
                </h3>
                <div className={growthStyles.stackList}>
                  {myAiDashboard.studentAI.status.trainingFocus.map((focus) => (
                    <article key={focus.id} className={growthStyles.stackRow}>
                      <div className={growthStyles.stackMain}>
                        <p className={growthStyles.stackTitle}>{focus.title}</p>
                        <p className={growthStyles.stackDetail}>{focus.summary}</p>
                        {focus.pairwiseCount > 0 ? (
                          <p className={styles.classificationHint} style={{ marginTop: "0.35rem" }}>
                            Есть опора на более сильный ответ: {focus.pairwiseCount}
                          </p>
                        ) : null}
                      </div>
                      <span className={growthStyles.journeyBadge}>
                        {focus.status === "validated"
                          ? "проверено"
                          : focus.status === "needs_check"
                            ? "проверить"
                            : "в работе"}
                      </span>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            <div className={styles.classificationActions} style={{ marginTop: "0.9rem" }}>
              <Link to={routes.studentTrain} className={`${styles.btn} ${styles.btnAccent}`}>
                Тренируем
              </Link>
              <Link to={routes.studentTrainingManager} className={`${styles.btn} ${styles.btnOutline}`}>
                Обучить модель
              </Link>
              <Link to={routes.studentEvaluate} className={`${styles.btn} ${styles.btnOutline}`}>
                Проверяем
              </Link>
            </div>
          </div>
        </section>

        <div className={growthStyles.dashboardGrid}>
          <section className={`${styles.card} ${styles.cardMuted}`}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Результаты работы</h2>
              <p className={styles.cardDesc}>
                Что уже сохранено в AI Lab.
              </p>
            </div>
            <div className={styles.cardBody}>
              <div className={growthStyles.artifactPanel}>
                <div className={growthStyles.artifactHead}>
                  <div>
                    <p className={growthStyles.artifactEyebrow}>Мои результаты</p>
                    <h3 className={growthStyles.artifactTitle}>Общая картина</h3>
                  </div>
                  <span className={growthStyles.artifactTotal}>
                    {artifactSummary?.totalCount ?? 0}
                  </span>
                </div>
                <div className={growthStyles.artifactGrid}>
                  <div className={growthStyles.artifactCell}>
                    <span className={growthStyles.artifactLabel}>Prompt Lab</span>
                    <strong className={growthStyles.artifactValue}>
                      {artifactCounts.prompt_experiment_saved ?? 0}
                    </strong>
                  </div>
                  <div className={growthStyles.artifactCell}>
                    <span className={growthStyles.artifactLabel}>Примеры обучения</span>
                    <strong className={growthStyles.artifactValue}>
                      {(artifactCounts.chat_training_saved ?? 0) +
                        (artifactCounts.dataset_example_added ?? 0)}
                    </strong>
                  </div>
                  <div className={growthStyles.artifactCell}>
                    <span className={growthStyles.artifactLabel}>Compare</span>
                    <strong className={growthStyles.artifactValue}>
                      {artifactCounts.compare_run_completed ?? 0}
                    </strong>
                  </div>
                  <div className={growthStyles.artifactCell}>
                    <span className={growthStyles.artifactLabel}>Arena</span>
                    <strong className={growthStyles.artifactValue}>
                      {artifactCounts.benchmark_eval_completed ?? 0}
                    </strong>
                  </div>
                  <div className={growthStyles.artifactCell}>
                    <span className={growthStyles.artifactLabel}>AI Studio</span>
                    <strong className={growthStyles.artifactValue}>
                      {(artifactCounts.ai_studio_project_created ?? 0) +
                        (artifactCounts.ai_studio_version_saved ?? 0)}
                    </strong>
                  </div>
                </div>
              </div>

              <div className={growthStyles.artifactRecent}>
                <div className={growthStyles.artifactRecentHead}>
                  <h3 className={growthStyles.artifactRecentTitle}>Последняя активность</h3>
                  <span className={growthStyles.artifactRecentNote}>последние результаты</span>
                </div>
                {recentArtifacts.length === 0 ? (
                  <p className={styles.classificationHint}>
                    Пока нет сохранённых результатов. Первый появится после Prompt Lab,
                    примеров обучения, Compare или AI Studio.
                  </p>
                ) : (
                  <div className={growthStyles.artifactList}>
                    {recentArtifacts.map((artifact) => (
                      <article key={artifact.artifactId} className={growthStyles.artifactRow}>
                        <div className={growthStyles.artifactRowMain}>
                          <p className={growthStyles.artifactRowTitle}>{artifact.label}</p>
                          <p className={growthStyles.artifactRowMeta}>
                            {RESULT_TYPE_LABELS[artifact.artifactType] ?? "результат"}
                            {artifact.detail ? ` · ${artifact.detail}` : ""}
                          </p>
                        </div>
                        <time className={growthStyles.artifactRowTime} dateTime={artifact.createdAt}>
                          {formatDateTime(artifact.createdAt)}
                        </time>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className={`${styles.card} ${styles.cardMuted}`}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Состояние модели</h2>
              <p className={styles.cardDesc}>
                Где сейчас процесс обучения: данные, модель, включение и проверка.
              </p>
            </div>
            <div className={styles.cardBody}>
              <div className={growthStyles.evidenceMiniGrid}>
                <div className={growthStyles.evidenceMiniCell}>
                  <span className={growthStyles.evidenceMiniLabel}>Данные</span>
                  <strong className={growthStyles.evidenceMiniValue}>
                    {pipeline?.exportAvailable ? "готовы" : "нет"}
                  </strong>
                </div>
                <div className={growthStyles.evidenceMiniCell}>
                  <span className={growthStyles.evidenceMiniLabel}>Обученная версия</span>
                  <strong className={growthStyles.evidenceMiniValue}>
                    {pipeline?.adapterAvailable ? "есть" : "нет"}
                  </strong>
                </div>
                <div className={growthStyles.evidenceMiniCell}>
                  <span className={growthStyles.evidenceMiniLabel}>Подключение</span>
                  <strong className={growthStyles.evidenceMiniValue}>
                    {pipeline?.ollamaModelRegistered ? "готова" : "нет"}
                  </strong>
                </div>
                <div className={growthStyles.evidenceMiniCell}>
                  <span className={growthStyles.evidenceMiniLabel}>Активна</span>
                  <strong className={growthStyles.evidenceMiniValue}>
                    {pipeline?.usingTrainedModel ? "моя" : "базовая"}
                  </strong>
                </div>
              </div>
              <div className={growthStyles.proofCard} style={{ marginTop: "0.9rem" }}>
                <p className={growthStyles.proofMeta}>Цикл подтверждения результата</p>
                <p className={growthStyles.proofBody}>{myAiDashboard.studentAI.proofLoop.headline}</p>
                <div className={growthStyles.stageList} style={{ marginTop: "0.9rem" }}>
                  {myAiDashboard.studentAI.proofLoop.steps.map((step) => (
                    <article key={step.id} className={growthStyles.stageRow}>
                      <span
                        className={`${growthStyles.stageBadge} ${
                          step.status === "done" ? growthStyles.stageBadgeDone : ""
                        }`}
                      >
                        {step.status === "done" ? "готово" : step.status === "next" ? "дальше" : "ждет"}
                      </span>
                      <div className={growthStyles.stageMain}>
                        <p className={growthStyles.stageTitle}>{step.title}</p>
                        <p className={growthStyles.stageDetail}>{step.detail}</p>
                      </div>
                    </article>
                  ))}
                </div>
                <div className={styles.classificationActions} style={{ marginTop: "0.9rem" }}>
                  <Link
                    to={myAiDashboard.studentAI.proofLoop.nextProofAction.primaryHref}
                    className={`${styles.btn} ${styles.btnOutline}`}
                  >
                    {myAiDashboard.studentAI.proofLoop.nextProofAction.primaryLabel}
                  </Link>
                </div>
              </div>
              <div className={growthStyles.proofCard} style={{ marginTop: "0.9rem" }}>
                <p className={growthStyles.proofMeta}>Текущая версия модели</p>
                <p className={growthStyles.proofBody}>
                  База: {myAiDashboard.studentAI.status.modelLineage.baseModelLabel} ·
                  активная модель: {myAiDashboard.studentAI.status.modelLineage.activeModelLabel}
                </p>
                <p className={styles.classificationHint} style={{ marginTop: "0.5rem" }}>
                  Версия данных:{" "}
                  <span title={myAiDashboard.studentAI.status.modelLineage.datasetSnapshotId}>
                    {lineageDisplayId(myAiDashboard.studentAI.status.modelLineage.datasetSnapshotId)}
                  </span>{" "}
                  · версия модели:{" "}
                  <span title={myAiDashboard.studentAI.status.modelLineage.modelVersionId}>
                    {lineageDisplayId(myAiDashboard.studentAI.status.modelLineage.modelVersionId)}
                  </span>
                </p>
                <div className={growthStyles.stageList} style={{ marginTop: "0.9rem" }}>
                  {myAiDashboard.studentAI.status.modelLineage.versionTimeline.map((step) => (
                    <article key={step.id} className={growthStyles.stageRow}>
                      <span className={`${growthStyles.stageBadge} ${step.done ? growthStyles.stageBadgeDone : ""}`}>
                        {step.done ? "готово" : "дальше"}
                      </span>
                      <div className={growthStyles.stageMain}>
                        <p className={growthStyles.stageTitle}>{step.title}</p>
                        <p className={growthStyles.stageDetail}>{step.detail}</p>
                      </div>
                    </article>
                  ))}
                </div>
                <p className={styles.classificationHint} style={{ marginTop: "0.75rem" }}>
                  {myAiDashboard.studentAI.status.modelLineage.nextVersionBlocker}
                </p>
              </div>
            </div>
          </section>

          <section className={`${styles.card} ${styles.cardMuted}`}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Качество модели</h2>
              <p className={styles.cardDesc}>
                Compare показывает изменение на одном запросе. Arena проверяет устойчивость на задачах.
              </p>
            </div>
            <div className={styles.cardBody}>
              <div className={growthStyles.evidenceMiniGrid}>
                <div className={growthStyles.evidenceMiniCell}>
                  <span className={growthStyles.evidenceMiniLabel}>Compare</span>
                  <strong className={growthStyles.evidenceMiniValue}>
                    {myAiDashboard.studentAI.evaluation.compareCount}
                  </strong>
                </div>
                <div className={growthStyles.evidenceMiniCell}>
                  <span className={growthStyles.evidenceMiniLabel}>Arena</span>
                  <strong className={growthStyles.evidenceMiniValue}>
                    {myAiDashboard.studentAI.evaluation.benchmarkCount}
                  </strong>
                </div>
                <div className={growthStyles.evidenceMiniCell}>
                  <span className={growthStyles.evidenceMiniLabel}>Скрытые задачи</span>
                  <strong className={growthStyles.evidenceMiniValue}>
                    {myAiDashboard.studentAI.evaluation.hiddenBenchmarkCount}
                  </strong>
                </div>
                <div className={growthStyles.evidenceMiniCell}>
                  <span className={growthStyles.evidenceMiniLabel}>Выбор лучшего ответа</span>
                  <strong className={growthStyles.evidenceMiniValue}>
                    {myAiDashboard.studentAI.evaluation.pairwiseCount}
                  </strong>
                </div>
              </div>
              <div className={growthStyles.proofCard} style={{ marginTop: "0.9rem" }}>
                <p className={growthStyles.proofMeta}>Последний вывод</p>
                <p className={growthStyles.proofBody}>
                  {myAiDashboard.studentAI.evaluation.latestHeadline}
                </p>
                <p className={styles.classificationHint} style={{ marginTop: "0.65rem" }}>
                  Текущая модель: {myAiDashboard.studentAI.evaluation.currentModelLabel} ·
                  проверок этой версии: {myAiDashboard.studentAI.evaluation.currentModelCheckCount}
                </p>
              </div>
              <div className={growthStyles.stackList} style={{ marginTop: "0.9rem" }}>
                {myAiDashboard.studentAI.evaluation.capabilityMap.map((capability) => (
                  <article key={capability.id} className={growthStyles.stackRow}>
                    <div className={growthStyles.stackMain}>
                      <p className={growthStyles.stackTitle}>{capability.title}</p>
                      <p className={growthStyles.stackDetail}>{capability.summary}</p>
                    </div>
                    <span className={growthStyles.journeyBadge}>
                      {capability.status === "strong"
                        ? "сильнее"
                        : capability.status === "building"
                          ? "проверить"
                          : "чинить"}
                    </span>
                  </article>
                ))}
              </div>
              {myAiDashboard.studentAI.evaluation.repairQueue.length > 0 ? (
                <div style={{ marginTop: "0.9rem" }}>
                  <h3 className={styles.cardTitle} style={{ marginBottom: "0.5rem" }}>
                    Что чинить дальше
                  </h3>
                  <div className={growthStyles.stackList}>
                    {myAiDashboard.studentAI.evaluation.repairQueue.slice(0, 2).map((task) => (
                      <article key={task.id} className={growthStyles.stackRow}>
                        <div className={growthStyles.stackMain}>
                          <p className={growthStyles.stackTitle}>{task.title}</p>
                          <p className={growthStyles.stackDetail}>{task.reason}</p>
                          {task.relatedFocusTitle ? (
                            <p className={styles.classificationHint} style={{ marginTop: "0.35rem" }}>
                              Связано с фокусом обучения: {task.relatedFocusTitle}
                            </p>
                          ) : null}
                        </div>
                        <Link
                          to={task.actionHref}
                          state={task.clinicState ?? null}
                          className={`${styles.btn} ${styles.btnOutline}`}
                        >
                          {task.actionTitle}
                        </Link>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className={styles.classificationActions} style={{ marginTop: "0.9rem" }}>
                <Link
                  to={routes.studentModelCompare}
                  state={recommendedCompareState}
                  className={`${styles.btn} ${styles.btnAccent}`}
                >
                  Проверить модель
                </Link>
                <Link to={routes.studentAiClinic} className={`${styles.btn} ${styles.btnOutline}`}>
                  Разобрать слабое место
                </Link>
              </div>
              <p className={styles.classificationHint} style={{ marginTop: "0.75rem" }}>
                <strong>Следующий шаг:</strong> {myAiDashboard.studentAI.evaluation.nextStepTitle} —{" "}
                {myAiDashboard.studentAI.evaluation.nextStepDescription}
              </p>
            </div>
          </section>

          <section className={`${styles.card} ${styles.cardMuted}`}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Последний Compare</h2>
              <p className={styles.cardDesc}>
                Проверка изменения поведения на одном запросе.
              </p>
            </div>
            <div className={styles.cardBody}>
              {latestCompare ? (
                <div className={growthStyles.proofCard}>
                  <p className={growthStyles.proofMeta}>
                    {formatDateTime(latestCompare.createdAt)} · {latestCompare.baseModel}
                    {latestCompare.trainedModelName ? ` → ${latestCompare.trainedModelName}` : ""}
                  </p>
                  <h3 className={growthStyles.proofTitle}>{truncate(latestCompare.prompt, 110)}</h3>
                  <p className={growthStyles.proofBody}>{truncate(latestCompare.explanation, 190)}</p>
                </div>
              ) : (
                <p className={styles.classificationHint}>Результата Compare пока нет.</p>
              )}
              <div className={styles.classificationActions}>
                <Link
                  to={routes.studentModelCompare}
                  state={recommendedCompareState}
                  className={`${styles.btn} ${styles.btnOutline}`}
                >
                  Открыть Compare
                </Link>
              </div>
            </div>
          </section>

          <section className={`${styles.card} ${styles.cardMuted}`}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Последняя Arena</h2>
              <p className={styles.cardDesc}>
                Проверка модели на наборе задач или в матче моделей.
              </p>
            </div>
            <div className={styles.cardBody}>
              {latestBenchmark ? (
                <div className={growthStyles.proofCard}>
                  <p className={growthStyles.proofMeta}>
                    {formatDateTime(latestBenchmark.createdAt)} · {arenaCategoryLabel(latestBenchmark.benchmarkCategory)}
                  </p>
                  <h3 className={growthStyles.proofTitle}>{latestBenchmark.benchmarkTitle}</h3>
                  <p className={growthStyles.proofBody}>
                    {truncate(latestBenchmark.explanation || latestBenchmark.prompt, 190)}
                  </p>
                </div>
              ) : (
                <p className={styles.classificationHint}>Проверок на задачах пока нет.</p>
              )}
              <div className={styles.classificationActions}>
                <Link to={studentArenaScreenPath} className={`${styles.btn} ${styles.btnOutline}`}>
                  Открыть Arena
                </Link>
              </div>
            </div>
          </section>

          <section className={`${styles.card} ${styles.cardMuted}`}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>AI Studio</h2>
              <p className={styles.cardDesc}>
                Где твоя активная модель помогает собрать проект.
              </p>
            </div>
            <div className={styles.cardBody}>
              {latestProject ? (
                <div className={growthStyles.proofCard}>
                  <p className={growthStyles.proofMeta}>
                    {studioProjectTypeLabel(latestProject.projectType)} · {formatDateTime(latestProject.createdAt)}
                    {latestProject.modelName ? ` · ${latestProject.modelName}` : ""}
                  </p>
                  <h3 className={growthStyles.proofTitle}>{truncate(latestProject.goal, 120)}</h3>
                </div>
              ) : (
                <p className={styles.classificationHint}>
                  В AI Studio пока нет проекта. Когда будет активная модель, собери первую версию проекта с её
                  помощью.
                </p>
              )}
              <div className={styles.classificationActions}>
                <Link to={routes.studentAiStudio} className={`${styles.btn} ${styles.btnOutline}`}>
                  Открыть AI Studio
                </Link>
              </div>
            </div>
          </section>

          <section className={`${styles.card} ${styles.cardMuted}`}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Курс</h2>
              <p className={styles.cardDesc}>
                Что уже пройдено и какой следующий учебный шаг.
              </p>
            </div>
            <div className={styles.cardBody}>
              <div className={growthStyles.stackList}>
                {visibleLessons.map((lesson) => (
                  <article key={lesson.lessonId} className={growthStyles.stackRow}>
                    <div className={growthStyles.stackMain}>
                      <p className={growthStyles.stackTitle}>
                        {TRAINING_COURSE.lessons[lesson.lessonIndex]?.title ?? lesson.lessonId}
                      </p>
                      <p className={growthStyles.stackMeta}>
                        {lesson.status === "completed"
                          ? "завершено"
                          : lesson.status === "unlocked"
                            ? "доступно"
                            : "позже"}
                      </p>
                      <p className={growthStyles.stackDetail}>
                        {lesson.nextRequiredAction || lesson.unlockReason}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
              <div className={styles.classificationActions}>
                <Link to={routes.studentCourse} className={`${styles.btn} ${styles.btnOutline}`}>
                  Открыть курс
                </Link>
                {progression.nextRecommendedLessonId ? (
                  <Link
                    to={studentCourseLessonPath(progression.nextRecommendedLessonId)}
                    className={`${styles.btn} ${styles.btnAccent}`}
                  >
                    Следующая сессия
                  </Link>
                ) : null}
              </div>
            </div>
          </section>
        </div>

        <section className={growthStyles.nextBlock}>
          <p className={growthStyles.nextEyebrow}>Главный следующий шаг</p>
          <h2 className={growthStyles.nextTitle}>{myAiDashboard.primaryAction.title}</h2>
          <p className={growthStyles.nextBody}>{myAiDashboard.primaryAction.body}</p>
          <div className={growthStyles.nextActions}>
            <Link
              to={myAiDashboard.primaryAction.primaryHref}
              state={primaryActionState}
              className={growthStyles.nextBtn}
            >
              {myAiDashboard.primaryAction.primaryLabel}
            </Link>
            {myAiDashboard.primaryAction.secondaryHref && myAiDashboard.primaryAction.secondaryLabel ? (
              <Link
                to={myAiDashboard.primaryAction.secondaryHref}
                state={secondaryActionState}
                className={`${growthStyles.nextBtn} ${growthStyles.nextBtnSecondary}`}
              >
                {myAiDashboard.primaryAction.secondaryLabel}
              </Link>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
