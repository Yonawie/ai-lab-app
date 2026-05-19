import type { ModelTrainingStatus, StudentAiCompanion } from "@/shared/companion-tauri";
import type {
  StudentArtifactRecord,
  StudentArtifactSummary,
} from "@/shared/artifact-ledger-tauri";
import type { StudentTrainingPipelineStatus } from "@/shared/training-pipeline-tauri";
import type { CompareRunHistoryItem } from "@/shared/model-compare-tauri";
import type { BenchmarkRunHistoryItem } from "@/shared/arena-benchmark-tauri";
import type { AiStudioProjectVersion } from "@/shared/ai-studio-tauri";
import type { ArenaStats } from "./arena-stats";
import type { ArenaPvpHistoryEntry } from "./arena-pvp-history";
import type { StoredExamSummary } from "./exam-last-storage";
import type { CourseProgressionReadModel } from "./course/course-lab-read-model";
import { routes, studentCourseLessonPath } from "@/shared/routes";
import { LESSON_IDS } from "./course/training-course-model";

export type ParadigmId = "supervised" | "unsupervised" | "reinforcement" | "self_supervised";

export type ParadigmCard = {
  id: ParadigmId;
  title: string;
  levelLabel: string;
  progressPct: number;
  contributors: string;
  explanation: string;
  courseHref: string;
};

export type MilestoneCard = {
  id: string;
  title: string;
  description: string;
  done: boolean;
  actionLabel?: string;
  actionHref?: string;
};

export type TimelineItem = {
  id: string;
  at: number;
  title: string;
  detail: string;
};

export type NextActionBlock = {
  title: string;
  body: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel?: string;
  secondaryHref?: string;
};

const PERSONALITY_RU: Record<string, string> = {
  explorer: "Исследователь",
  mentor: "Наставник",
  strategist: "Стратег",
  inventor: "Изобретатель",
};

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function artifactCount(
  artifactSummary: StudentArtifactSummary | null,
  key: keyof StudentArtifactSummary["countsByType"] | string,
): number {
  return artifactSummary?.countsByType?.[key] ?? 0;
}

export function personalityLabelRu(code: string): string {
  const key = code.toLowerCase();
  return PERSONALITY_RU[key] ?? code;
}

function levelFromPct(p: number): string {
  if (p >= 85) return "Уровень: зрелость";
  if (p >= 60) return "Уровень: рост";
  if (p >= 35) return "Уровень: основа";
  if (p >= 12) return "Уровень: вход";
  return "Уровень: старт";
}

export function buildParadigmCards(
  pipeline: StudentTrainingPipelineStatus | null,
  training: ModelTrainingStatus | null,
  arena: ArenaStats,
): ParadigmCard[] {
  const datasetExamples = pipeline?.datasetExampleCount ?? 0;
  const datasetSize = pipeline?.datasetSize ?? training?.datasetSize ?? 0;
  const chatRows = pipeline?.chatTrainingInteractionCount ?? 0;
  const promptRuns = pipeline?.promptExperimentCount ?? 0;
  const accuracy = training?.accuracy ?? 0;

  const supervisedPct = clampPct(
    (datasetExamples >= 1 ? 18 : 0) +
      Math.min(45, datasetExamples * 3) +
      Math.min(37, accuracy * 0.45),
  );
  const unsupervisedPct = clampPct(
    Math.min(35, datasetSize * 1.2) +
      Math.min(40, promptRuns * 4) +
      (datasetSize >= 15 ? 25 : 0),
  );
  const reinforcementPct = clampPct(
    Math.min(55, chatRows * 5) +
      Math.min(35, arena.battles * 6) +
      (arena.wins >= 1 ? 15 : 0),
  );
  const selfSupervisedPct = clampPct(
    Math.min(50, promptRuns * 8) +
      (promptRuns >= 3 ? 30 : 0) +
      Math.min(20, datasetExamples * 2),
  );

  return [
    {
      id: "supervised",
      title: "Обучение с учителем",
      levelLabel: levelFromPct(supervisedPct),
      progressPct: supervisedPct,
      contributors: `Примеры обучения: ${datasetExamples} · точность: ${Math.round(accuracy)}%`,
      explanation:
        "Здесь главное — метки, целевые ответы и чистые примеры обучения.",
      courseHref: studentCourseLessonPath(LESSON_IDS.supervised),
    },
    {
      id: "unsupervised",
      title: "Анализ паттернов и ошибок",
      levelLabel: levelFromPct(unsupervisedPct),
      progressPct: unsupervisedPct,
      contributors: `Примеры обучения: ${datasetSize} · эксперименты в Prompt Lab: ${promptRuns}`,
      explanation:
        "Здесь мы ищем скрытую структуру, спорные случаи и причины ошибок.",
      courseHref: studentCourseLessonPath(LESSON_IDS.unsupervised),
    },
    {
      id: "reinforcement",
      title: "Обратная связь и предпочтения",
      levelLabel: levelFromPct(reinforcementPct),
      progressPct: reinforcementPct,
      contributors: `Чат-примеры: ${chatRows} · проверок в Arena: ${arena.battles}`,
      explanation:
        "Здесь важны конкретная критика, выбор лучшего ответа и проверка поведения модели.",
      courseHref: studentCourseLessonPath(LESSON_IDS.rl),
    },
    {
      id: "self_supervised",
      title: "Контекст и инструкции",
      levelLabel: levelFromPct(selfSupervisedPct),
      progressPct: selfSupervisedPct,
      contributors: `Эксперименты в Prompt Lab: ${promptRuns} · примеры обучения: ${datasetExamples}`,
      explanation:
        "Здесь важны работа с контекстом, формулировками и продолжением мысли.",
      courseHref: studentCourseLessonPath(LESSON_IDS.ssl),
    },
  ];
}

export function buildMilestoneCards(
  pipeline: StudentTrainingPipelineStatus | null,
  arena: ArenaStats,
  lastExam: StoredExamSummary | null,
  artifactSummary: StudentArtifactSummary | null,
): MilestoneCard[] {
  const datasetExamples =
    pipeline?.datasetExampleCount ?? artifactCount(artifactSummary, "dataset_example_added");
  const modelRegistered = pipeline?.ollamaModelRegistered ?? false;
  const promptRuns =
    pipeline?.promptExperimentCount ?? artifactCount(artifactSummary, "prompt_experiment_saved");
  const compareRuns = artifactCount(artifactSummary, "compare_run_completed");
  const benchmarkRuns = artifactCount(artifactSummary, "benchmark_eval_completed");

  return [
    {
      id: "dataset",
      title: "Первые примеры обучения",
      description: "Есть первые примеры обучения.",
      done: datasetExamples >= 1,
      actionLabel: datasetExamples < 1 ? "К заданиям" : undefined,
      actionHref: datasetExamples < 1 ? routes.studentCourse : undefined,
    },
    {
      id: "prompt",
      title: "Эксперименты с запросом",
      description: "Есть сохранённые эксперименты в Prompt Lab.",
      done: promptRuns >= 3,
      actionLabel: promptRuns < 3 ? "Prompt Lab" : undefined,
      actionHref: promptRuns < 3 ? routes.studentPromptLab : undefined,
    },
    {
      id: "ollama",
      title: "Обученная модель подключена",
      description: "Модель подготовлена и готова к проверке.",
      done: modelRegistered,
      actionLabel: !modelRegistered ? "Запуск ИИ" : undefined,
      actionHref: !modelRegistered ? routes.studentTrain : undefined,
    },
    {
      id: "compare",
      title: "Проверка изменения",
      description: "Есть хотя бы одна проверка с разницей до и после.",
      done: compareRuns >= 1,
      actionLabel: compareRuns < 1 ? "Сравнить модели" : undefined,
      actionHref: compareRuns < 1 ? routes.studentEvaluate : undefined,
    },
    {
      id: "arena",
      title: "Проверка на задачах",
      description: "Есть проверка на задачах в Arena.",
      done: benchmarkRuns >= 1 || arena.wins >= 1,
      actionLabel:
        benchmarkRuns < 1 && arena.wins < 1 ? "Проверяем" : undefined,
      actionHref:
        benchmarkRuns < 1 && arena.wins < 1 ? routes.studentEvaluate : undefined,
    },
    {
      id: "exam",
      title: "Первый экзамен",
      description: "Пройдена итоговая проверка навыков.",
      done: lastExam != null,
      actionLabel: lastExam == null ? "Лаборатория оценки" : undefined,
      actionHref: lastExam == null ? routes.studentAiExam : undefined,
    },
  ];
}

export function buildTimeline(
  pvpHistory: ArenaPvpHistoryEntry[],
  lastExam: StoredExamSummary | null,
  pipeline: StudentTrainingPipelineStatus | null,
  training: ModelTrainingStatus | null,
  recentArtifacts: StudentArtifactRecord[],
): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const artifact of recentArtifacts.slice(0, 6)) {
    const parsed = Date.parse(artifact.createdAt);
    items.push({
      id: `artifact-${artifact.artifactId}`,
      at: Number.isFinite(parsed) ? parsed : Date.now(),
      title: artifact.label,
      detail: artifact.detail || artifact.artifactType,
    });
  }

  for (const duel of pvpHistory.slice(0, 8)) {
    const result =
      duel.winner === "you"
        ? "Победа"
        : duel.winner === "opponent"
          ? "Поражение"
          : "Ничья";
    items.push({
      id: `pvp-${duel.id}`,
      at: duel.at,
      title: `Arena: матч моделей, ${result.toLowerCase()}`,
      detail: `${duel.missionTitle} · ${duel.opponentEmail}`,
    });
  }

  if (lastExam?.createdAt) {
    const parsed = Date.parse(lastExam.createdAt);
    items.push({
      id: "exam-last",
      at: Number.isFinite(parsed) ? parsed : Date.now(),
      title: "Экзамен AI завершён",
      detail: `Итоговый балл: ${Math.round(lastExam.totalScore)}`,
    });
  }

  if (pipeline?.exportedDatasetPath) {
    items.push({
      id: "export",
      at: Date.now() - 86_400_000,
      title: "Данные для обучения готовы",
      detail: "Набор примеров подготовлен для процесса обучения.",
    });
  }

  if (pipeline?.ollamaModelRegistered) {
    items.push({
      id: "ollama-reg",
      at: Date.now() - 43_200_000,
      title: "Обученная модель подключена",
      detail: pipeline.activeStudentModelAlias
        ? `Имя модели: ${pipeline.activeStudentModelAlias}`
        : "Модель готова к включению.",
    });
  }

  if (pipeline?.usingTrainedModel && pipeline.ollamaModelRegistered) {
    items.push({
      id: "use-trained",
      at: Date.now() - 3_600_000,
      title: "Обученная модель включена",
      detail: "Чат, Compare и Arena используют твою версию модели.",
    });
  }

  if (training?.lastTrainedAt) {
    const parsed = Date.parse(training.lastTrainedAt);
    items.push({
      id: "train",
      at: Number.isFinite(parsed) ? parsed : Date.now() - 7_200_000,
      title: "Запуск обучения",
      detail: `Точность: ${Math.round(training.accuracy)}% · примеры: ${training.datasetSize}`,
    });
  }

  items.sort((a, b) => b.at - a.at);
  return items.slice(0, 12);
}

export function strongestWeakest(companion: StudentAiCompanion | null): {
  strongest: string;
  weakest: string;
} {
  if (!companion) {
    return { strongest: "—", weakest: "—" };
  }
  const stats: Array<[string, number]> = [
    ["Логика", companion.logic],
    ["Креатив", companion.creativity],
    ["Эмпатия", companion.empathy],
    ["Фокус", companion.focus],
  ];
  stats.sort((a, b) => b[1] - a[1]);
  return { strongest: stats[0][0], weakest: stats[stats.length - 1][0] };
}

export function buildNextAction(
  pipeline: StudentTrainingPipelineStatus | null,
  lastExam: StoredExamSummary | null,
  arena: ArenaStats,
  inTauri: boolean,
  artifactSummary: StudentArtifactSummary | null,
  compareHistory: CompareRunHistoryItem[] = [],
  benchmarkHistory: BenchmarkRunHistoryItem[] = [],
  aiStudioHistory: AiStudioProjectVersion[] = [],
  progression: CourseProgressionReadModel | null = null,
): NextActionBlock {
  if (!inTauri) {
    return {
      title: "Открой desktop-приложение",
      body: "Полный цикл с локальной моделью, Compare и Arena доступен в установленной версии приложения.",
      primaryLabel: "Мой ИИ",
      primaryHref: routes.studentAiGrowth,
    };
  }

  const datasetExamples =
    pipeline?.datasetExampleCount ?? artifactCount(artifactSummary, "dataset_example_added");
  const modelRegistered = pipeline?.ollamaModelRegistered ?? false;
  const useTrainedModel = pipeline?.usingTrainedModel ?? false;
  const promptRuns =
    pipeline?.promptExperimentCount ?? artifactCount(artifactSummary, "prompt_experiment_saved");
  const compareRuns = artifactCount(artifactSummary, "compare_run_completed");
  const benchmarkRuns = artifactCount(artifactSummary, "benchmark_eval_completed");
  const studioVersions = artifactCount(artifactSummary, "ai_studio_version_saved");
  const latestCompare = compareHistory[0] ?? null;
  const latestBenchmark = benchmarkHistory[0] ?? null;
  const latestStudio = aiStudioHistory[0] ?? null;
  const nextLessonId = progression?.nextRecommendedLessonId ?? null;
  const nextLessonHref = nextLessonId
    ? studentCourseLessonPath(nextLessonId)
    : routes.studentCourse;
  const missingLessonAction = progression?.nextRequiredAction ?? null;

  if (datasetExamples < 3) {
    return {
      title: "Собери больше примеров обучения",
      body: "Сначала собери чистые примеры обучения и сохранённые исправления ответов.",
      primaryLabel: "Задания от преподавателя",
      primaryHref: routes.studentCourse,
      secondaryLabel: "Тренируем",
      secondaryHref: routes.studentTrain,
    };
  }

  if (!latestStudio && datasetExamples >= 3) {
    return {
      title: "Собери первый проект",
      body: "У тебя уже есть данные. Теперь собери проект в AI Studio и сохрани первую версию.",
      primaryLabel: "Строим",
      primaryHref: routes.studentBuild,
      secondaryLabel: "Тренируем",
      secondaryHref: routes.studentTrain,
    };
  }

  if (!pipeline?.exportAvailable && datasetExamples >= 3) {
    return {
      title: "Подготовь данные",
      body: "Собери набор примеров для процесса обучения.",
      primaryLabel: "Тренируем",
      primaryHref: routes.studentTrain,
    };
  }

  if (pipeline?.adapterAvailable && !modelRegistered) {
    return {
      title: "Зарегистрируй свою модель",
      body: "После обучения нужно подключить модель. Без этого нельзя честно перейти к Compare и Arena.",
      primaryLabel: "Тренируем",
      primaryHref: routes.studentTrain,
    };
  }

  if (!useTrainedModel && modelRegistered) {
    return {
      title: "Включи обученную модель",
      body: "Модель уже готова. Активируй её и переходи к Compare.",
      primaryLabel: "Тренируем",
      primaryHref: routes.studentTrain,
      secondaryLabel: "Проверяем",
      secondaryHref: routes.studentEvaluate,
    };
  }

  if (promptRuns < 2) {
    return {
      title: "Сохрани эксперименты с промптом",
      body: "Сохрани несколько экспериментов, чтобы увидеть, как контекст меняет поведение модели.",
      primaryLabel: "Тренируем",
      primaryHref: routes.studentTrain,
      secondaryLabel: "Учимся",
      secondaryHref: studentCourseLessonPath(LESSON_IDS.ssl),
    };
  }

  if (compareRuns < 1 || !latestCompare) {
    return {
      title: "Проверь изменение в Compare",
      body: "Сравни базовую и обученную модель и посмотри разницу до и после обучения.",
      primaryLabel: "Проверяем",
      primaryHref: routes.studentEvaluate,
      secondaryLabel: latestStudio ? "Строим" : "Тренируем",
      secondaryHref: latestStudio ? routes.studentBuild : routes.studentTrain,
    };
  }

  if ((benchmarkRuns < 1 && arena.battles < 1) || !latestBenchmark) {
    return {
      title: "Пройди проверку в Arena",
      body: "После Compare проверь, держится ли улучшение на наборе задач.",
      primaryLabel: "Проверяем",
      primaryHref: routes.studentEvaluate,
      secondaryLabel: "Compare",
      secondaryHref: routes.studentEvaluate,
    };
  }

  if (studioVersions < 2 && latestStudio) {
    return {
      title: "Сохрани ещё одну версию проекта",
      body: "Одна версия показывает старт. Улучши проект и сохрани следующую итерацию.",
      primaryLabel: "Строим",
      primaryHref: routes.studentBuild,
      secondaryLabel: "Проверяем",
      secondaryHref: routes.studentEvaluate,
    };
  }

  if (progression && !progression.allCompleted && nextLessonId) {
    return {
      title: "Подтверди следующий шаг курса",
      body: missingLessonAction
        ? `Курс ждёт следующий реальный шаг: ${missingLessonAction}.`
        : "Следующая сессия уже открыта.",
      primaryLabel: "Открыть урок",
      primaryHref: nextLessonHref,
      secondaryLabel: "Дорожная карта",
      secondaryHref: routes.studentCourse,
    };
  }

  if (!lastExam) {
    return {
      title: "Закрепи цикл экзаменом",
      body: "После работы с данными, Compare и Arena закрой цикл итоговой оценкой.",
      primaryLabel: "Проверяем",
      primaryHref: routes.studentEvaluate,
      secondaryLabel: "Итоговая проверка",
      secondaryHref: routes.studentAiExam,
    };
  }

  return {
    title: "Цикл AI Lab собран",
    body: "У тебя уже есть данные, процесс обучения, Compare, Arena и история сборок. Можно идти в следующую итерацию.",
    primaryLabel: "Строим",
    primaryHref: routes.studentBuild,
    secondaryLabel: "Проверяем",
    secondaryHref: routes.studentEvaluate,
  };
}
