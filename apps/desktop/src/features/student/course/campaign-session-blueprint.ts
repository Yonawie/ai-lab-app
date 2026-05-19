/**
 * Student-facing blueprint for each course session.
 * It keeps the same six-phase navigation shell, but frames each lesson as
 * real lab work connected to the AI Lab surfaces.
 */

import { routes } from "@/shared/routes";
import { LESSON_IDS } from "./training-course-model";

export type CampaignPhaseId =
  | "intro"
  | "concept"
  | "activity"
  | "lab"
  | "reflection"
  | "outcome";

export type CampaignLink = { href: string; label: string };

export type CampaignSessionBlock = {
  phase: CampaignPhaseId;
  phaseLabel: string;
  title: string;
  body: string;
  links?: CampaignLink[];
};

const L1 = LESSON_IDS.intro;
const L2 = LESSON_IDS.supervised;
const L3 = LESSON_IDS.unsupervised;
const L4 = LESSON_IDS.rl;
const L5 = LESSON_IDS.ssl;
const L6 = LESSON_IDS.final;

const PHASES = {
  intro: "1. Цель миссии",
  concept: "2. Рычаг улучшения",
  activity: "3. Практика",
  lab: "4. Проверка",
  reflection: "5. Разбор",
  outcome: "6. Результат",
} as const;

export const CAMPAIGN_SESSION_BLUEPRINTS: Record<string, CampaignSessionBlock[]> = {
  [L1]: [
    {
      phase: "intro",
      phaseLabel: PHASES.intro,
      title: "Первый запуск",
      body: "Ты сразу даёшь модели задачу и смотришь на живой ответ.",
      links: [{ href: routes.studentCourse, label: "К карте миссий" }],
    },
    {
      phase: "concept",
      phaseLabel: PHASES.concept,
      title: "Рычаг: запрос",
      body: "Меняем формулировку, роль и формат ответа. Смотрим, что стало лучше.",
    },
    {
      phase: "activity",
      phaseLabel: PHASES.activity,
      title: "Раунд A/B",
      body: "Сначала запусти простой запрос, затем улучши его и сравни, как меняется ответ модели на той же задаче.",
    },
    {
      phase: "lab",
      phaseLabel: PHASES.lab,
      title: "Что получилось",
      body: "Результат этого шага простой: ты увидел ответ модели, изменил промпт и заметил, стало ли объяснение полезнее.",
      links: [{ href: routes.studentPromptLab, label: "Prompt Lab" }],
    },
    {
      phase: "reflection",
      phaseLabel: PHASES.reflection,
      title: "Разбор",
      body: "Модель отвечает не сама по себе: качество ответа зависит от того, как именно ты ставишь задачу.",
    },
    {
      phase: "outcome",
      phaseLabel: PHASES.outcome,
      title: "Где продолжить",
      body: "Prompt Lab — место, где удобно делать более точные A/B-проверки запросов.",
      links: [{ href: routes.studentPromptLab, label: "Prompt Lab" }],
    },
  ],
  [L2]: [
    {
      phase: "intro",
      phaseLabel: PHASES.intro,
      title: "Дай ИИ хороший пример",
      body: "Ты создаёшь пару: запрос пользователя и сильный ответ, на котором модель сможет учиться.",
      links: [{ href: routes.studentTrain, label: "Тренируем" }],
    },
    {
      phase: "concept",
      phaseLabel: PHASES.concept,
      title: "Рычаг: пример обучения",
      body: "Качественный пример показывает модели, что считать сильным ответом, а не просто отмечает ошибку.",
    },
    {
      phase: "activity",
      phaseLabel: PHASES.activity,
      title: "Почини реальный ответ",
      body: "Возьми черновик модели, сформулируй критику и запиши целевой ответ так, чтобы пример был полезен для будущего обучения.",
    },
    {
      phase: "lab",
      phaseLabel: PHASES.lab,
      title: "Связь с обучением",
      body: "Сохранённые примеры становятся материалом для будущего обучения модели.",
      links: [
        { href: routes.studentTrain, label: "Тренируем" },
      ],
    },
    {
      phase: "reflection",
      phaseLabel: PHASES.reflection,
      title: "Почему пример сильный",
      body: "Сильный пример не просто исправляет ответ, а ясно показывает, какое поведение модель должна начать делать лучше.",
    },
    {
      phase: "outcome",
      phaseLabel: PHASES.outcome,
      title: "Что получится",
      body: "У тебя появятся примеры, которые можно собрать в данные для обучения.",
      links: [{ href: routes.studentTrain, label: "Тренируем" }],
    },
  ],
  [L3]: [
    {
      phase: "intro",
      phaseLabel: PHASES.intro,
      title: "Найди слабое место",
      body: "Ты смотришь на неоднозначные примеры, ищешь структуру, отмечаешь спорные случаи и проверяешь, как ИИ объясняет эти группы.",
    },
    {
      phase: "concept",
      phaseLabel: PHASES.concept,
      title: "Рычаг: анализ ошибок",
      body: "Сначала ищем повторяющийся тип ошибки, потом решаем, как его чинить.",
    },
    {
      phase: "activity",
      phaseLabel: PHASES.activity,
      title: "Собери карту ошибок",
      body: "Сформируй группы, выдели выбросы и объясни, почему некоторые примеры остаются спорными.",
    },
    {
      phase: "lab",
      phaseLabel: PHASES.lab,
      title: "Сравни свою версию с ИИ",
      body: "Используй Prompt Lab и Compare, чтобы проверить, объясняет ли модель структуру так же, как ты.",
      links: [
        { href: routes.studentTrain, label: "Тренируем" },
        { href: routes.studentEvaluate, label: "Проверяем" },
      ],
    },
    {
      phase: "reflection",
      phaseLabel: PHASES.reflection,
      title: "Что важно заметить",
      body: "Полезный анализ не только находит группы, но и честно показывает неопределенность, выбросы и альтернативные объяснения.",
    },
    {
      phase: "outcome",
      phaseLabel: PHASES.outcome,
      title: "Решение",
      body: "Выбери, что чинить первым: запрос, контекст или пример обучения.",
    },
  ],
  [L4]: [
    {
      phase: "intro",
      phaseLabel: PHASES.intro,
      title: "Исправь поведение через feedback",
      body: "Ты учишься не ставить абстрактные награды, а давать полезный сигнал: что было слабым и какое поведение должно стать лучше.",
    },
    {
      phase: "concept",
      phaseLabel: PHASES.concept,
      title: "Рычаг: обратная связь",
      body: "Модель дает ответ, ты критикуешь слабое место, создаешь лучший целевой вариант и затем проверяешь, изменилось ли поведение.",
    },
    {
      phase: "activity",
      phaseLabel: PHASES.activity,
      title: "Выбери и объясни",
      body: "Выбери слабый ответ, опиши нужное улучшение и сохрани пример, который показывает модели правильное поведение.",
      links: [{ href: routes.studentTrain, label: "Тренируем" }],
    },
    {
      phase: "lab",
      phaseLabel: PHASES.lab,
      title: "Проверь без гадания",
      body: "Compare показывает изменение на одном запросе, Arena проверяет стабильность на наборе задач.",
      links: [
        { href: routes.studentEvaluate, label: "Проверяем" },
      ],
    },
    {
      phase: "reflection",
      phaseLabel: PHASES.reflection,
      title: "Разбор feedback",
      body: "Слабая обратная связь говорит “плохо”. Сильная объясняет, что изменить, почему это важно и как должен выглядеть лучший ответ.",
    },
    {
      phase: "outcome",
      phaseLabel: PHASES.outcome,
      title: "Что получилось",
      body: "Миссия закрыта, когда у тебя есть корректирующий пример и проверка результата.",
    },
  ],
  [L5]: [
    {
      phase: "intro",
      phaseLabel: PHASES.intro,
      title: "Выбери: prompt или обучение",
      body: "Ты учишься улучшать ответ через контекст, примеры и инструкции внутри запроса, а не через переобучение модели.",
    },
    {
      phase: "concept",
      phaseLabel: PHASES.concept,
      title: "Рычаг: контекст",
      body: "Prompt Lab помогает понять, когда достаточно точной инструкции, а когда нужен новый пример обучения.",
    },
    {
      phase: "activity",
      phaseLabel: PHASES.activity,
      title: "Проведи эксперимент",
      body: "Сравни разные варианты контекста и сохрани тот, который дает более полезный ответ.",
      links: [{ href: routes.studentTrain, label: "Тренируем" }],
    },
    {
      phase: "lab",
      phaseLabel: PHASES.lab,
      title: "Проверь решение",
      body: "После удачного промпта открой Compare и проверь, сохраняется ли улучшение на той же задаче.",
      links: [{ href: routes.studentEvaluate, label: "Проверяем" }],
    },
    {
      phase: "reflection",
      phaseLabel: PHASES.reflection,
      title: "Разбор выбора",
      body: "Если поведение чинится инструкцией, начни с промпта. Если ошибка повторяется, создай пример обучения.",
    },
    {
      phase: "outcome",
      phaseLabel: PHASES.outcome,
      title: "Что получилось",
      body: "Ты понимаешь, решается ли проблема запросом или требует нового примера обучения.",
    },
  ],
  [L6]: [
    {
      phase: "intro",
      phaseLabel: PHASES.intro,
      title: "Докажи, что твой ИИ стал лучше",
      body: "Финальная лаборатория связывает все: данные, обучение, включение модели, Compare и Arena.",
    },
    {
      phase: "concept",
      phaseLabel: PHASES.concept,
      title: "Рычаг: полный цикл",
      body: "Курс считается завершенным, когда у тебя есть реальные результаты обучения модели, Compare и Arena, а не просто отметка о посещении страницы.",
    },
    {
      phase: "activity",
      phaseLabel: PHASES.activity,
      title: "Проведи модель через цикл",
      body: "Подготовь данные, зарегистрируй обученную версию, включи модель и подготовь ее к проверке.",
      links: [{ href: routes.studentTrain, label: "Тренируем" }],
    },
    {
      phase: "lab",
      phaseLabel: PHASES.lab,
      title: "Собери проверки",
      body: "Сравни базовую и обученную модель в Compare, затем проверь устойчивость результата в Arena.",
      links: [
        { href: routes.studentEvaluate, label: "Проверяем" },
        { href: routes.studentAiGrowth, label: "Мой ИИ" },
      ],
    },
    {
      phase: "reflection",
      phaseLabel: PHASES.reflection,
      title: "Разбор результата",
      body: "Теперь можно ясно ответить, какие данные ты создал, какую модель включил и где именно подтверждается улучшение.",
    },
    {
      phase: "outcome",
      phaseLabel: PHASES.outcome,
      title: "Что получилось",
      body: "Финал закрыт, когда есть активная обученная модель, Compare и проверка в Arena.",
    },
  ],
};

export function getSessionBlueprint(lessonId: string): CampaignSessionBlock[] {
  return CAMPAIGN_SESSION_BLUEPRINTS[lessonId] ?? [];
}
