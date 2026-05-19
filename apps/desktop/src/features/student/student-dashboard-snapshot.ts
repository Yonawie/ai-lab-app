export type StudentLessonContentSections = {
  aboutLesson: string;
  learningOutcomes: string;
  aiConnection: string;
  practice: string;
};

export type SnapshotTask = {
  id: string;
  title: string;
  description: string | null;
  taskType?: string;
  classification?: {
    prompt: string;
    options: string[];
  };
  ranking?: {
    prompt: string;
    options: string[];
  };
  policyPath?: {
    scenario: string;
    options: string[];
  };
  dataCleaning?: {
    prompt: string;
    examples: { id: string; text: string }[];
  };
};

export type SnapshotLesson = {
  id: string;
  title: string;
  description: string;
  progress: number;
  durationLabel: string;
  categoryLabel: string;
  content?: string;
  contentSections?: StudentLessonContentSections;
  tasks?: SnapshotTask[];
};

export type StudentDashboardSnapshotBundle = {
  userEmail: string;
  lessons: SnapshotLesson[];
};

export const STUDENT_DASHBOARD_DATA_URL = "/data/student-dashboard.json";

export async function loadStudentDashboardSnapshot(): Promise<StudentDashboardSnapshotBundle | null> {
  try {
    const res = await fetch(STUDENT_DASHBOARD_DATA_URL, { cache: "no-store" });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    if (
      typeof json !== "object" ||
      json === null ||
      (json as { version?: unknown }).version !== 1
    ) {
      return null;
    }
    const lessons = (json as { lessons?: unknown }).lessons;
    const userEmail = (json as { userEmail?: unknown }).userEmail;
    if (!Array.isArray(lessons) || typeof userEmail !== "string") return null;
    return {
      userEmail,
      lessons: lessons as SnapshotLesson[],
    };
  } catch {
    return null;
  }
}

export async function loadLessonsFromSnapshot(): Promise<SnapshotLesson[] | null> {
  const bundle = await loadStudentDashboardSnapshot();
  return bundle?.lessons ?? null;
}

const KNOWN_LESSON_SECTIONS: Record<string, StudentLessonContentSections> = {
  "Введение в нейросети": {
    aboutLesson:
      "Урок знакомит с базовой идеей нейросетей: модель не получает готовые правила, а подстраивает внутренние веса по примерам. Мы разберем цепочку «вход → преобразование → выход» и увидим, почему для обучения важны данные, а не только формулы.",
    learningOutcomes:
      "После урока вы сможете объяснить, что такое веса, зачем нужна функция ошибки и чем обучение на примерах отличается от жестко заданного алгоритма. Также станет понятнее, почему качество данных напрямую влияет на результат модели.",
    aiConnection:
      "Это фундамент для всего AI Lab: любая модель проходит цикл данных, обучения и проверки качества. Понимание этого шага помогает осмысленно работать с dataset, compare и training manager дальше по курсу.",
    practice:
      "В заданиях вы проверите базовые понятия про нейрон, веса и простую многослойную сеть. После урока полезно нарисовать свою схему «признаки → скрытый слой → решение» для одной бытовой задачи.",
  },
  "Обработка естественного языка": {
    aboutLesson:
      "Здесь мы смотрим, как система работает с текстом: разбивает его на части, учитывает контекст и пытается выделить смысл. Урок связывает токены, контекст и ограничения языковых моделей с реальными продуктами вроде чатов и поиска.",
    learningOutcomes:
      "Вы поймете, что такое токены, почему длина контекста важна и как одно и то же слово может менять смысл в зависимости от соседних фраз. Это поможет легче разбираться в поведении языковых моделей.",
    aiConnection:
      "Для AI Lab это база для prompt engineering и анализа ответов модели. Без понимания контекста трудно объяснить, почему модель отвечает не в тему, теряет детали или путает смысл.",
    practice:
      "Практика фокусируется на разборе текстовых примеров и формулировок. После урока можно взять короткий абзац и вручную отметить, какие части текста сильнее всего влияют на смысл ответа.",
  },
  "Ваш первый чат-бот": {
    aboutLesson:
      "Урок показывает диалог как инженерный сценарий: пользователь пишет запрос, система определяет намерение, выбирает ответ или действие и обрабатывает непонятные случаи. Это мост между учебным интерфейсом и реальной логикой помощников.",
    learningOutcomes:
      "После урока вы сможете описать минимальный сценарий чат-бота, назвать типичные точки отказа и предложить способы смягчить ошибки: уточняющие вопросы, эскалацию и ограничения по опасным темам.",
    aiConnection:
      "Это напрямую связано с тем, как в продукте сочетаются правила, данные и генеративная модель. Урок помогает увидеть, где нужен жесткий контроль, а где уместен ответ модели.",
    practice:
      "В практической части вы соберете простой сценарий бота для одной узкой задачи и подумаете, какие сообщения должен обрабатывать алгоритм, а где уже нужна модель.",
  },
};

function defaultLessonContentSections(description: string): StudentLessonContentSections {
  const topic = description.trim() || "эту тему";
  return {
    aboutLesson: `В этом уроке вы последовательно разберете тему: ${topic}. Материал идет от понятных примеров к более общим выводам, чтобы идеи было легче перенести на новые задачи.`,
    learningOutcomes: `После прохождения вы сможете своими словами объяснить ключевые идеи урока, связанные с темой «${topic}», и увидеть, как они встраиваются в общий курс по ИИ.`,
    aiConnection: `Связь с обучением ИИ: вы увидите, как описанные идеи входят в цикл данных, модели, обучения и оценки качества, и почему аккуратность на каждом шаге влияет на надежность системы.`,
    practice: "Практическая часть закрепляет материал через задания ниже. Выполняйте их по порядку и возвращайтесь к тексту урока, если захотите освежить формулировки.",
  };
}

function lessonContentSectionsForSnapshot(
  title: string,
  description: string,
): StudentLessonContentSections {
  return KNOWN_LESSON_SECTIONS[title] ?? defaultLessonContentSections(description);
}

function lessonLegacyContentFromSections(
  description: string,
  sections: StudentLessonContentSections,
): string {
  return [
    description,
    `О чем этот урок\n${sections.aboutLesson}`,
    `Что поймет ученик\n${sections.learningOutcomes}`,
    `Как это связано с обучением ИИ\n${sections.aiConnection}`,
    `Практика\n${sections.practice}`,
  ].join("\n\n");
}

function buildLessonSnapshotContent(
  title: string,
  description: string,
): {
  contentSections: StudentLessonContentSections;
  content: string;
} {
  const contentSections = lessonContentSectionsForSnapshot(title, description);
  const content = lessonLegacyContentFromSections(description, contentSections);
  return { contentSections, content };
}

function fallbackLesson(
  id: string,
  title: string,
  description: string,
  progress: number,
  durationLabel: string,
  categoryLabel: string,
  tasks: SnapshotTask[],
): SnapshotLesson {
  const { content, contentSections } = buildLessonSnapshotContent(title, description);
  return {
    id,
    title,
    description,
    progress,
    durationLabel,
    categoryLabel,
    content,
    contentSections,
    tasks,
  };
}

export const FALLBACK_LESSONS: SnapshotLesson[] = [
  fallbackLesson(
    "fallback-l1",
    "Введение в нейросети",
    "Как нейросети обрабатывают данные: базовые принципы и роль обучения на примерах.",
    75,
    "25 мин",
    "Машинное обучение",
    [
      {
        id: "fallback-l1-t1",
        title: "Нейрон и веса",
        description: "Короткий вопрос на понимание того, что описывают веса в простой модели.",
        taskType: "classification",
        classification: {
          prompt:
            "В простом перцептроне что описывают веса на связи между входом и выходом?",
          options: [
            "Насколько сильно входной сигнал влияет на итоговое решение",
            "Все тексты из обучающей выборки",
            "Случайные числа без связи с данными",
          ],
        },
      },
      {
        id: "fallback-l1-t2",
        title: "Слоистая сеть",
        description: "Разметить простую схему полносвязной сети и понять роли слоев.",
        taskType: "classification",
      },
    ],
  ),
  fallbackLesson(
    "fallback-l2",
    "Обработка естественного языка",
    "Как ИИ работает с текстом, контекстом и значением слов.",
    30,
    "40 мин",
    "NLP",
    [
      {
        id: "fallback-l2-t1",
        title: "Токенизация",
        description: "Что такое токены и зачем они нужны языковой модели.",
        taskType: "classification",
      },
    ],
  ),
  fallbackLesson(
    "fallback-l3",
    "Ваш первый чат-бот",
    "Собираем минимальный сценарий диалогового ИИ-помощника.",
    0,
    "1 ч",
    "Практика",
    [
      {
        id: "fallback-l3-t1",
        title: "Первый диалог",
        description: "Собрать минимальный сценарий бота и продумать его ограничения.",
        taskType: "classification",
      },
    ],
  ),
];
