export type StudentAiV2EntityName =
  | "StudentAI"
  | "TrainingExample"
  | "DatasetSnapshot"
  | "TrainingRun"
  | "ModelVersion"
  | "EvaluationRun"
  | "ProjectVersion"
  | "ArtifactLedger";

export type StudentAiV2EntityMapItem = {
  entity: StudentAiV2EntityName;
  meaning: string;
  currentSources: string[];
  readModels: string[];
  nextHardeningStep: string;
};

export const STUDENT_AI_V2_ENTITY_MAP: StudentAiV2EntityMapItem[] = [
  {
    entity: "StudentAI",
    meaning: "Центральная сущность ученика: текущая модель, статус обучения, проверки и следующий шаг.",
    currentSources: [
      "StudentAICompanion",
      "StudentTrainingExportRef",
      "StudentOllamaModelRef",
      "StudentModelUsagePreference",
      "StudentArtifactLedger",
    ],
    readModels: ["MyAiDashboardReadModel"],
    nextHardeningStep: "Выделить стабильный StudentAI aggregate, если появится несколько моделей на ученика.",
  },
  {
    entity: "TrainingExample",
    meaning: "Реальный пример, которым ученик учит модель: задача, черновик, критика и целевой ответ.",
    currentSources: ["ChatTrainingInteraction", "DatasetExample", "PromptExperiment"],
    readModels: ["TrainingOverviewReadModel", "CourseProgressReadModel"],
    nextHardeningStep: "Добавить качество, теги навыков и происхождение примера перед следующей тренировкой.",
  },
  {
    entity: "DatasetSnapshot",
    meaning: "Зафиксированный набор данных, который пошёл в конкретный цикл обучения.",
    currentSources: ["StudentTrainingExportRef"],
    readModels: ["TrainingOverviewReadModel", "MyAiDashboardReadModel"],
    nextHardeningStep: "Добавить явный split train/test и список включённых example ids.",
  },
  {
    entity: "TrainingRun",
    meaning: "Запуск обучения или подготовки обученной версии модели.",
    currentSources: ["TrainingRun", "StudentTrainingExportRef"],
    readModels: ["TrainingOverviewReadModel"],
    nextHardeningStep: "Разделить queued/running/completed/failed и хранить логи долгих операций.",
  },
  {
    entity: "ModelVersion",
    meaning: "Версия «Мой ИИ»: базовая модель плюс обученная версия и состояние подключения.",
    currentSources: ["StudentOllamaModelRef", "StudentModelUsagePreference"],
    readModels: ["MyAiDashboardReadModel", "TrainingOverviewReadModel"],
    nextHardeningStep: "Хранить несколько версий модели и явный parent dataset snapshot.",
  },
  {
    entity: "EvaluationRun",
    meaning: "Проверка результата: Compare, Arena, скрытая задача или выбор лучшего ответа.",
    currentSources: ["StudentCompareRun", "StudentBenchmarkRun", "StudentPairwisePreference"],
    readModels: ["EvaluationSummaryReadModel", "MyAiDashboardReadModel"],
    nextHardeningStep: "Добавить suites, rubric scores и связь слабого места со следующим training task.",
  },
  {
    entity: "ProjectVersion",
    meaning: "Сохранённая версия проекта, собранная в AI Studio конкретной моделью.",
    currentSources: ["StudentAiStudioProjectVersion"],
    readModels: ["MyAiDashboardReadModel"],
    nextHardeningStep: "Показывать lineage: какая версия модели создала или улучшила проект.",
  },
  {
    entity: "ArtifactLedger",
    meaning: "Журнал важных результатов ученика, из которого строятся прогресс и маршруты.",
    currentSources: ["StudentArtifactLedger"],
    readModels: ["CourseProgressReadModel", "MyAiDashboardReadModel"],
    nextHardeningStep: "Оставить ledger append-only и не использовать его как единственный источник состояния.",
  },
];
