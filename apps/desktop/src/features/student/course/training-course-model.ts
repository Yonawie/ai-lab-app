import type { StudentArtifactType } from "@/shared/artifact-ledger-tauri";

export type LessonSectionType = "intro" | "demo" | "gameplay" | "lab" | "summary" | "challenge";

export type LessonSection = {
  id: string;
  type: LessonSectionType;
  title: string;
  content: string;
};

export type RequiredEvidenceRule = {
  artifactType: StudentArtifactType;
  minCount: number;
  label: string;
};

export type ParadigmType =
  | "rules"
  | "supervised"
  | "unsupervised"
  | "reinforcement"
  | "self_supervised"
  | "tournament";

export type Lesson = {
  id: string;
  title: string;
  description: string;
  durationMinutes: number;
  paradigmType: ParadigmType;
  learningGoal: string;
  artifactGoal: string;
  requiredEvidence: RequiredEvidenceRule[];
  realAiActions: string[];
  engineeringSkillFocus: string[];
  sections: LessonSection[];
};

export type TrainingCourse = {
  id: string;
  title: string;
  description: string;
  lessons: Lesson[];
};

export type LessonActionGuide = {
  action: string;
  surface: string;
  result: string;
};

export const COURSE_LESSON_1_ID = "course-intro-algorithm-vs-ml";
export const COURSE_LESSON_2_ID = "course-supervised-dataset-authoring";
export const COURSE_LESSON_3_ID = "course-investigative-data-lab";
export const COURSE_LESSON_4_ID = "course-feedback-engineering-lab";
export const COURSE_LESSON_5_ID = "course-llm-prompt-lab";
export const COURSE_LESSON_6_ID = "course-capstone-proof-loop";

export const LESSON_IDS = {
  intro: COURSE_LESSON_1_ID,
  supervised: COURSE_LESSON_2_ID,
  unsupervised: COURSE_LESSON_3_ID,
  rl: COURSE_LESSON_4_ID,
  ssl: COURSE_LESSON_5_ID,
  final: COURSE_LESSON_6_ID,
} as const;

export const TRAINING_COURSE: TrainingCourse = {
  id: "student-ai-engineer-lab",
  title: "AI Lab: прокачай своего ИИ",
  description:
    "Курс построен вокруг рычагов улучшения ИИ: запрос, контекст, пример, feedback, обучение и проверка результата.",
  lessons: [
    {
      id: COURSE_LESSON_1_ID,
      title: "Миссия 1. Управляй ответом через запрос",
      description:
        "Ты даёшь ИИ задачу, меняешь формулировку и видишь, как от этого меняется ответ.",
      durationMinutes: 90,
      paradigmType: "rules",
      learningGoal:
        "Понять, как задача, роль и формат ответа управляют поведением модели.",
      artifactGoal:
        "Получить два ответа ИИ и увидеть, какая формулировка сработала лучше.",
      requiredEvidence: [],
      realAiActions: [
        "запустить реальный ответ модели на простой задаче",
        "улучшить запрос и сравнить изменение ответа",
        "перейти к более точным экспериментам в Prompt Lab",
      ],
      engineeringSkillFocus: ["постановка задачи", "наблюдение за ответом модели", "мышление через запрос"],
      sections: [
        {
          id: "l1-intro",
          type: "intro",
          title: "Твоя первая ручка управления",
          content: "Запрос — самый быстрый способ изменить поведение ИИ без обучения модели.",
        },
        {
          id: "l1-demo",
          type: "demo",
          title: "Что меняем",
          content: "Проверяем роль, задачу и формат: эти три детали часто решают, будет ответ полезным или слабым.",
        },
        {
          id: "l1-gameplay",
          type: "gameplay",
          title: "Раунд A/B",
          content: "Запусти простой запрос, улучши его и сравни: где ответ стал понятнее, точнее или полезнее.",
        },
        {
          id: "l1-lab",
          type: "lab",
          title: "Найди разницу",
          content: "Отметь, что именно изменилось в ответе: структура, тон, детали, формат или полезность.",
        },
        {
          id: "l1-summary",
          type: "summary",
          title: "Главный вывод",
          content: "ИИ не просто “знает ответ”: он реагирует на то, как ты ставишь задачу.",
        },
        {
          id: "l1-challenge",
          type: "challenge",
          title: "Где тренировать навык",
          content: "Prompt Lab — место для более точных экспериментов с запросами и ролями.",
        },
      ],
    },
    {
      id: COURSE_LESSON_2_ID,
      title: "Миссия 2. Дай ИИ хороший пример",
      description:
        "Ты берёшь слабый ответ, объясняешь ошибку и сохраняешь лучший вариант как пример обучения.",
      durationMinutes: 90,
      paradigmType: "supervised",
      learningGoal:
        "Научиться показывать модели, какой ответ ты считаешь хорошим.",
      artifactGoal:
        "Сохранить реальные примеры обучения с понятной ошибкой и улучшенным ответом.",
      requiredEvidence: [
        { artifactType: "chat_training_saved", minCount: 1, label: "пример обучения сохранён" },
        { artifactType: "dataset_example_added", minCount: 1, label: "пример добавлен в набор данных" },
      ],
      realAiActions: [
        "получить реальный черновик ответа от модели",
        "написать критику и целевой ответ",
        "сохранить пример для будущего обучения",
      ],
      engineeringSkillFocus: ["создание данных", "критика ответа", "качество целевого ответа"],
      sections: [
        {
          id: "l2-intro",
          type: "intro",
          title: "Что прокачиваем",
          content: "Пример обучения показывает ИИ: “в такой ситуации отвечай вот так”.",
        },
        {
          id: "l2-demo",
          type: "demo",
          title: "Как выглядит хороший пример",
          content: "Хороший пример содержит запрос, черновик модели, критику и улучшенный целевой ответ.",
        },
        {
          id: "l2-gameplay",
          type: "gameplay",
          title: "Ремонт ответа",
          content: "Найди слабое место, напиши короткую критику и сохрани улучшенный вариант.",
        },
        {
          id: "l2-lab",
          type: "lab",
          title: "Качество примера",
          content: "Пример полезен, если по нему понятно, какую ошибку модель должна больше не повторять.",
        },
        {
          id: "l2-summary",
          type: "summary",
          title: "Как это влияет на модель",
          content: "Сохранённые примеры попадают в обучение и помогают будущей версии ИИ отвечать лучше.",
        },
        {
          id: "l2-challenge",
          type: "challenge",
          title: "Миссия",
          content: "Создай несколько примеров: запрос, слабое место, лучший ответ.",
        },
      ],
    },
    {
      id: COURSE_LESSON_3_ID,
      title: "Миссия 3. Найди слабое место",
      description:
        "Ты ищешь повторяющиеся ошибки, спорные случаи и паттерны, по которым можно улучшать ИИ.",
      durationMinutes: 90,
      paradigmType: "unsupervised",
      learningGoal:
        "Научиться видеть, где модель ошибается системно, а где случайно.",
      artifactGoal:
        "Сформировать гипотезу: какой тип ошибки стоит чинить первым.",
      requiredEvidence: [
        { artifactType: "prompt_experiment_saved", minCount: 1, label: "исследовательский запрос сохранён" },
        { artifactType: "compare_run_completed", minCount: 1, label: "интерпретация проверена в Compare" },
      ],
      realAiActions: [
        "сформировать гипотезу группировки",
        "увидеть, как ИИ объясняет структуру",
        "проверить интерпретацию в Prompt Lab или Compare",
      ],
      engineeringSkillFocus: ["анализ паттернов", "неоднозначность", "интерпретация данных"],
      sections: [
        {
          id: "l3-intro",
          type: "intro",
          title: "Охота за паттерном",
          content: "Если ошибки похожи друг на друга, это уже подсказка: модель можно чинить точнее.",
        },
        {
          id: "l3-demo",
          type: "demo",
          title: "Несколько версий",
          content: "Один набор ответов можно группировать по теме, формату, тону или типу ошибки.",
        },
        {
          id: "l3-gameplay",
          type: "gameplay",
          title: "Карта ошибок",
          content: "Собери группы, отметь спорные ответы и выбери самое важное слабое место.",
        },
        {
          id: "l3-lab",
          type: "lab",
          title: "Как ИИ видит структуру",
          content: "Проверь, согласится ли ИИ с твоей группировкой или увидит другой паттерн.",
        },
        {
          id: "l3-summary",
          type: "summary",
          title: "Главный вывод",
          content: "Сначала найди тип ошибки, потом выбирай способ ремонта: prompt, контекст или пример обучения.",
        },
        {
          id: "l3-challenge",
          type: "challenge",
          title: "Решение",
          content: "Выбери, что чинить первым, и объясни почему именно эта ошибка мешает сильнее всего.",
        },
      ],
    },
    {
      id: COURSE_LESSON_4_ID,
      title: "Миссия 4. Исправь поведение через feedback",
      description:
        "Ты сравниваешь слабый и сильный ответ, объясняешь выбор и создаёшь сигнал для улучшения модели.",
      durationMinutes: 90,
      paradigmType: "reinforcement",
      learningGoal:
        "Понять, какая обратная связь реально помогает модели менять поведение.",
      artifactGoal:
        "Создать feedback-пример и проверить, стало ли поведение модели лучше.",
      requiredEvidence: [
        { artifactType: "chat_training_saved", minCount: 1, label: "пример обратной связи сохранён" },
        { artifactType: "compare_run_completed", minCount: 1, label: "изменение проверено в Compare" },
        { artifactType: "benchmark_eval_completed", minCount: 1, label: "устойчивость проверена в Arena" },
      ],
      realAiActions: [
        "получить ответ модели",
        "написать конкретную обратную связь",
        "сохранить лучший ответ и проверить изменение",
      ],
      engineeringSkillFocus: ["качество обратной связи", "обучение на предпочтениях", "проверка изменения поведения"],
      sections: [
        {
          id: "l4-intro",
          type: "intro",
          title: "Feedback как сигнал",
          content: "Модель улучшается не от оценки “плохо”, а от понятного сигнала: что заменить и почему.",
        },
        {
          id: "l4-demo",
          type: "demo",
          title: "Сильный feedback",
          content: "Хорошая обратная связь называет ошибку, желаемое поведение и пример лучшего ответа.",
        },
        {
          id: "l4-gameplay",
          type: "gameplay",
          title: "Выбери лучший ответ",
          content: "Сравни варианты, выбери победителя и объясни, почему он лучше для задачи.",
        },
        {
          id: "l4-lab",
          type: "lab",
          title: "Проверка без гадания",
          content: "Compare показывает изменение на одном запросе, Arena проверяет похожие задачи.",
        },
        {
          id: "l4-summary",
          type: "summary",
          title: "Главный вывод",
          content: "Feedback полезен, если после него можно проверить конкретное улучшение поведения.",
        },
        {
          id: "l4-challenge",
          type: "challenge",
          title: "Миссия",
          content: "Сохрани feedback-пример и проверь, повлиял ли он на ответ модели.",
        },
      ],
    },
    {
      id: COURSE_LESSON_5_ID,
      title: "Миссия 5. Выбери: prompt или обучение",
      description:
        "Ты проверяешь, когда проблему можно решить контекстом в запросе, а когда уже нужен новый пример обучения.",
      durationMinutes: 90,
      paradigmType: "self_supervised",
      learningGoal:
        "Научиться выбирать правильный рычаг: контекст, инструкция или обучение.",
      artifactGoal:
        "Сохранить эксперимент и объяснить, хватило ли prompt-решения.",
      requiredEvidence: [
        { artifactType: "prompt_experiment_saved", minCount: 1, label: "эксперимент в Prompt Lab сохранён" },
        { artifactType: "compare_run_completed", minCount: 1, label: "результат проверен в Compare" },
      ],
      realAiActions: [
        "сравнить разные формулировки запроса",
        "сохранить лучший эксперимент с запросом",
        "проверить изменение в Compare",
      ],
      engineeringSkillFocus: ["проектирование контекста", "обучение внутри запроса", "выбор: запрос или обучение"],
      sections: [
        {
          id: "l5-intro",
          type: "intro",
          title: "Контекст как быстрый ремонт",
          content: "Иногда модель не надо обучать: ей просто не хватает роли, правила или примера в запросе.",
        },
        {
          id: "l5-demo",
          type: "demo",
          title: "Три добавки к запросу",
          content: "Проверь роль, правило и пример внутри запроса: что сильнее меняет ответ?",
        },
        {
          id: "l5-gameplay",
          type: "gameplay",
          title: "Prompt vs Train",
          content: "Если улучшенный prompt стабильно работает, обучение может не понадобиться. Если нет — нужен пример.",
        },
        {
          id: "l5-lab",
          type: "lab",
          title: "Проверка решения",
          content: "Сохрани сильную формулировку и проверь её на похожем запросе.",
        },
        {
          id: "l5-summary",
          type: "summary",
          title: "Главный вывод",
          content: "Не каждую проблему надо лечить обучением. Иногда лучший ход — точнее дать контекст.",
        },
        {
          id: "l5-challenge",
          type: "challenge",
          title: "Решение",
          content: "Запиши вывод: эту проблему чинит prompt, контекст или новый пример обучения.",
        },
      ],
    },
    {
      id: COURSE_LESSON_6_ID,
      title: "Миссия 6. Докажи, что твой ИИ стал лучше",
      description:
        "Ты собираешь весь цикл: примеры, обучение, включение модели и проверку на Compare и Arena.",
      durationMinutes: 90,
      paradigmType: "tournament",
      learningGoal:
        "Собрать полный цикл улучшения: обучить, включить и доказать результат.",
      artifactGoal:
        "Показать, что у твоего ИИ есть активная версия и проверенные результаты.",
      requiredEvidence: [
        { artifactType: "dataset_exported", minCount: 1, label: "данные подготовлены" },
        { artifactType: "lora_adapter_registered", minCount: 1, label: "модель подключена" },
        { artifactType: "trained_model_activated", minCount: 1, label: "модель включена" },
        { artifactType: "compare_run_completed", minCount: 1, label: "Compare выполнен" },
        { artifactType: "benchmark_eval_completed", minCount: 1, label: "Arena выполнена" },
      ],
      realAiActions: [
        "подготовить данные для обучения",
        "подключить и включить свою модель",
        "подтвердить изменения в Compare и Arena",
      ],
      engineeringSkillFocus: ["включение модели", "сравнение до и после", "проверка на задачах"],
      sections: [
        {
          id: "l6-intro",
          type: "intro",
          title: "Финальный proof loop",
          content: "Финал — это не экран победы, а проверка: модель обучена, включена и реально стала полезнее.",
        },
        {
          id: "l6-demo",
          type: "demo",
          title: "Инвентарь твоего ИИ",
          content: "Проверь: есть ли примеры обучения, подготовленные данные и версия модели.",
        },
        {
          id: "l6-gameplay",
          type: "gameplay",
          title: "Включи свою версию",
          content: "Сделай так, чтобы именно твоя обученная модель стала активной.",
        },
        {
          id: "l6-lab",
          type: "lab",
          title: "Две проверки",
          content: "Compare отвечает: изменилось ли поведение. Arena отвечает: держится ли улучшение на разных задачах.",
        },
        {
          id: "l6-summary",
          type: "summary",
          title: "Что считается победой",
          content: "Победа — это активная модель и сохранённые проверки, а не просто пройденная страница.",
        },
        {
          id: "l6-challenge",
          type: "challenge",
          title: "Финальный результат",
          content: "Собери финальный набор: обученная модель, Compare и Arena.",
        },
      ],
    },
  ],
};

export function getTrainingLessonById(lessonId: string): Lesson | null {
  return TRAINING_COURSE.lessons.find((lesson) => lesson.id === lessonId) ?? null;
}

export function getLessonActionGuide(lessonId: string): LessonActionGuide {
  switch (lessonId) {
    case COURSE_LESSON_1_ID:
      return {
        action: "Запусти простой запрос, улучши его и сравни два ответа.",
        surface: "Урок ведёт в Prompt Lab для более сильных экспериментов.",
        result: "Ты увидишь, как формулировка меняет поведение ИИ.",
      };
    case COURSE_LESSON_2_ID:
      return {
        action: "Получай черновик ответа, критикуй слабое место и сохраняй лучший вариант.",
        surface: "Главная рабочая зона: Chat Training.",
        result: "У твоего ИИ появятся реальные примеры обучения.",
      };
    case COURSE_LESSON_3_ID:
      return {
        action: "Найди повторяющийся паттерн, спорный пример или тип ошибки.",
        surface: "Проверяй гипотезу через Prompt Lab и Compare.",
        result: "Ты поймёшь, какое слабое место чинить первым.",
      };
    case COURSE_LESSON_4_ID:
      return {
        action: "Дай модели понятный feedback: что не так и какой ответ лучше.",
        surface: "Используй Chat Training, Compare и Arena.",
        result: "Ты создашь сигнал, который помогает менять поведение модели.",
      };
    case COURSE_LESSON_5_ID:
      return {
        action: "Добавь контекст в запрос и проверь, стал ли ответ точнее.",
        surface: "Основная практика: Prompt Lab, затем Compare.",
        result: "Ты увидишь разницу между prompt, контекстом и обучением модели.",
      };
    case COURSE_LESSON_6_ID:
      return {
        action: "Собери полный контур: обучи, включи, сравни и проверь на задачах.",
        surface: "Training Manager, Compare и Arena.",
        result: "Ты докажешь, что твой ИИ действительно стал лучше.",
      };
    default:
      return {
        action: "Выполни практическое действие урока.",
        surface: "Используй рабочие зоны AI Lab.",
        result: "Сохрани понятный результат и переходи к следующему шагу.",
      };
  }
}

export function paradigmLabel(type: ParadigmType): string {
  switch (type) {
    case "rules":
      return "Запрос";
    case "supervised":
      return "Пример";
    case "unsupervised":
      return "Ошибка";
    case "reinforcement":
      return "Feedback";
    case "self_supervised":
      return "Контекст";
    case "tournament":
      return "Proof loop";
    default:
      return "AI Lab";
  }
}

export function summarizeRequiredEvidence(rules: RequiredEvidenceRule[]): string {
  if (rules.length === 0) return "Выполни миссию и сохрани результат.";
  return rules.map((rule) => `${rule.label}: ${rule.minCount}`).join(" · ");
}
