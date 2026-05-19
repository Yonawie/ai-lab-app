/** Arena missions: prompt + benchmark focus + evaluation priority weights. */

export type ArenaWeights = {
  structure: number;
  tone: number;
  clarity: number;
  usefulness: number;
};

export type ArenaMission = {
  id: string;
  title: string;
  description: string;
  prompt: string;
  benchmarkCategory: string;
  evidenceFocus: string;
  weights: ArenaWeights;
  keywords: string[];
};

export const ARENA_MISSIONS: ArenaMission[] = [
  {
    id: "simple-topic",
    title: "Объясни простыми словами",
    description: "Один и тот же запрос для двух моделей: кто понятнее объяснит сложную тему школьнику.",
    prompt:
      "Объясни простыми словами, что такое нейросеть и чем она отличается от обычной программы. Без воды, максимум 8 предложений.",
    benchmarkCategory: "clarity",
    evidenceFocus: "Побеждает модель, которая объясняет короче, яснее и без лишней теории.",
    weights: { structure: 1.2, tone: 0.9, clarity: 1.4, usefulness: 1.3 },
    keywords: ["нейросеть", "программа", "объяснение", "данные"],
  },
  {
    id: "rude-reply",
    title: "Спокойный ответ под давлением",
    description: "Матч на тон и самообладание: какая модель вежливо отвечает на грубое сообщение.",
    prompt:
      "Тебе написали грубо: «Ты ничего не понимаешь, не лезь». Ответь коротко, вежливо и по делу, без взаимной грубости.",
    benchmarkCategory: "tone",
    evidenceFocus: "Побеждает модель, которая удерживает уважительный тон и снижает конфликт.",
    weights: { structure: 0.9, tone: 1.6, clarity: 1.0, usefulness: 1.2 },
    keywords: ["уважение", "вежливость", "спокойствие", "деэскалация"],
  },
  {
    id: "structured-plan",
    title: "Структурный план",
    description: "Обе модели получают одинаковую задачу на планирование. Побеждает более чёткий и применимый план.",
    prompt:
      "Составь структурированный план из 4-6 шагов: как подготовиться к контрольной по математике за неделю. Каждый шаг — одна строка, в конце — как проверить результат.",
    benchmarkCategory: "structure",
    evidenceFocus: "Побеждает модель, которая лучше держит структуру и переводит ответ в конкретные действия.",
    weights: { structure: 1.7, tone: 0.8, clarity: 1.2, usefulness: 1.2 },
    keywords: ["шаги", "план", "проверка", "результат"],
  },
  {
    id: "help-student",
    title: "Практичная поддержка",
    description: "Проверка на полезность: какая модель не просто поддерживает, а даёт действие на сегодня.",
    prompt:
      "Ученик боится ошибиться на экзамене и прокрастинирует. Дай короткий ответ: поддержка + одно конкретное действие на сегодня + как понять, что день удался.",
    benchmarkCategory: "usefulness",
    evidenceFocus: "Побеждает модель, которая превращает поддержку в понятный следующий шаг.",
    weights: { structure: 1.0, tone: 1.5, clarity: 1.1, usefulness: 1.4 },
    keywords: ["поддержка", "действие", "сегодня", "прогресс", "ученик"],
  },
  {
    id: "supervised-learning",
    title: "Объяснение ML-концепции",
    description: "Матч на следование инструкции: какая модель точнее и понятнее объяснит supervised learning.",
    prompt:
      "Объясни по шагам, что такое обучение с учителем в машинном обучении. 3-5 коротких абзацев и один жизненный пример в конце.",
    benchmarkCategory: "instruction-following",
    evidenceFocus: "Побеждает модель, которая держит формат, раскрывает идею без путаницы и даёт уместный пример.",
    weights: { structure: 1.3, tone: 1.0, clarity: 1.4, usefulness: 1.2 },
    keywords: ["пример", "разметка", "учитель", "метки", "данные"],
  },
];

export const HIDDEN_BENCHMARKS: ArenaMission[] = [
  {
    id: "hidden-clarity-rewrite",
    title: "Скрытая проверка: ясное объяснение",
    description: "Новая задача на понятность, которую студент не видит заранее.",
    prompt:
      "Объясни восьмикласснику, почему нейросеть может ошибаться даже после обучения. Без сложных терминов, 5-7 предложений, в конце — один вывод.",
    benchmarkCategory: "clarity",
    evidenceFocus: "Побеждает ответ, который объясняет просто, по делу и без перегрузки.",
    weights: { structure: 1.1, tone: 0.9, clarity: 1.5, usefulness: 1.2 },
    keywords: ["ошибка", "обучение", "данные", "пример", "вывод"],
  },
  {
    id: "hidden-constraint-brief",
    title: "Скрытая проверка: жёсткое ограничение",
    description: "Скрытая задача на удержание рамки и формата ответа.",
    prompt:
      "Ответь ученику ровно в 3 пунктах: как перестать прокрастинировать перед экзаменом. Каждый пункт — не больше 12 слов. Без вводного абзаца.",
    benchmarkCategory: "structure",
    evidenceFocus: "Побеждает ответ, который действительно удерживает ограничение и остаётся полезным.",
    weights: { structure: 1.7, tone: 0.8, clarity: 1.2, usefulness: 1.2 },
    keywords: ["3 пункта", "экзамен", "действие", "сегодня", "план"],
  },
  {
    id: "hidden-safe-tone",
    title: "Скрытая проверка: аккуратный тон",
    description: "Скрытая задача на уважительный тон под давлением.",
    prompt:
      "Тебе пишут: «У тебя снова всё плохо получается». Ответь коротко, спокойно и поддерживающе, без оправданий и без грубости.",
    benchmarkCategory: "tone",
    evidenceFocus: "Побеждает ответ, который удерживает уважение и снижает напряжение.",
    weights: { structure: 0.9, tone: 1.7, clarity: 1.0, usefulness: 1.2 },
    keywords: ["спокойно", "поддержка", "уважение", "коротко", "без грубости"],
  },
];
