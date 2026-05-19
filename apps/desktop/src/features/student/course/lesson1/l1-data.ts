/** Static content for Lesson 1 — algorithm vs ML (Russian). */

export type FinalAnswerKey = "algorithm" | "ml";

export type DemoCase = {
  id: string;
  label: string;
  message: string;
  /** What the toy rule-bot outputs */
  botLabel: "спам" | "не спам";
  /** Whether that output matches common sense for this message */
  botWasRight: boolean;
  explanation: string;
};

/** Rule for demo: substring triggers (lowercased text). */
export const DEMO_RULE_DESCRIPTION =
  "Правило бота: если в тексте есть «бесплатно», «выиграл» или «!!!» → СПАМ. Иначе → НЕ СПАМ.";

export const DEMO_CASES: DemoCase[] = [
  {
    id: "d1",
    label: "Явная реклама",
    message: "Бесплатный iPhone — жми сюда!!! Только сегодня.",
    botLabel: "спам",
    botWasRight: true,
    explanation: "Все триггеры на месте: бот угадал, и человек согласится.",
  },
  {
    id: "d2",
    label: "Школьное объявление",
    message: "ДЗ: прочитать параграф про бесплатные колебания маятника к завтрашнему уроку.",
    botLabel: "спам",
    botWasRight: false,
    explanation:
      "Слово «бесплатные» здесь про физику, а не реклама. Жёсткое правило не понимает контекст — типичный провал if/else.",
  },
  {
    id: "d3",
    label: "Нейтральное письмо",
    message: "Переносим созвон на среду, 15:30 по Москве.",
    botLabel: "не спам",
    botWasRight: true,
    explanation: "Триггеров нет — бот спокойно отвёл в «не спам».",
  },
  {
    id: "d4",
    label: "Официальное объявление",
    message: "Завтра школьный автобус едет бесплатно для участников пробного ГИА.",
    botLabel: "спам",
    botWasRight: false,
    explanation:
      "Слово «бесплатно» здесь про льготу, а не реклама. Жёсткое правило снова стреляет мимо контекста.",
  },
];

export type BreakRound = {
  id: string;
  scenario: string;
  /** Does the rigid rule match human-intended label? */
  rulesSucceed: boolean;
  truthLabel: "спам" | "не спам";
  botLabel: "спам" | "не спам";
  explanation: string;
};

export const BREAK_GAME_RULE =
  "Жёсткое правило той же «машины»: есть «бесплатно», «выиграл» или «!!!» → СПАМ. Иначе → НЕ СПАМ.";

export const BREAK_ROUNDS: BreakRound[] = [
  {
    id: "b1",
    scenario: "Бесплатный курс Python за репост!!! Успей зарегистрироваться.",
    rulesSucceed: true,
    truthLabel: "спам",
    botLabel: "спам",
    explanation: "Классический спам — правило и здравый смысл совпали.",
  },
  {
    id: "b2",
    scenario: "Физика: сдайте задачи по теме «бесплатная энергия Гиббса» к пятнице.",
    rulesSucceed: false,
    truthLabel: "не спам",
    botLabel: "спам",
    explanation: "Научный термин зацепил триггер. Одного слова мало, чтобы понять смысл.",
  },
  {
    id: "b3",
    scenario: "Добрый день! Напоминаю: завтра в 10:00 стендап в переговорке А.",
    rulesSucceed: true,
    truthLabel: "не спам",
    botLabel: "не спам",
    explanation: "Спокойный рабочий текст — правило не стреляет, и это верно.",
  },
  {
    id: "b4",
    scenario: "Вы выиграли приз! Перейдите по ссылке немедленно!!!",
    rulesSucceed: true,
    truthLabel: "спам",
    botLabel: "спам",
    explanation: "Шаблонный развод — правило сработало как задумано.",
  },
  {
    id: "b5",
    scenario: "Ты реально выиграл школьный конкурс чистоты — поздравляем на линейке!",
    rulesSucceed: false,
    truthLabel: "не спам",
    botLabel: "спам",
    explanation:
      "Честная новость с словом «выиграл» ошибочно улетела в спам. Контекст важнее словаря.",
  },
  {
    id: "b6",
    scenario:
      "Здравствуйте, это служба безопасности банка. Срочно перезвоните на короткий номер и продиктуйте код из СМС.",
    rulesSucceed: false,
    truthLabel: "спам",
    botLabel: "не спам",
    explanation:
      "Фишинг без «бесплатно» и «!!!» — жёсткое правило не видит смысл. Так ускользает часть спама.",
  },
  {
    id: "b7",
    scenario: "Поздравляем Марию с днём рождения! Торт принесём во второй перерыв.",
    rulesSucceed: true,
    truthLabel: "не спам",
    botLabel: "не спам",
    explanation: "Ни одного триггера — тишина и правильный ответ.",
  },
  {
    id: "b8",
    scenario: "Реклама: чай «Золотой лист» — iPhone в подарок при покупке ящика.",
    rulesSucceed: true,
    truthLabel: "спам",
    botLabel: "спам",
    explanation: "Коммерческий текст с «бесплатным» подарком — бот и человек согласны.",
  },
  {
    id: "b9",
    scenario: "Литература: цитата «он лечил душу бесплатно, как врач из рассказа».",
    rulesSucceed: false,
    truthLabel: "не спам",
    botLabel: "спам",
    explanation: "Художественный текст. Снова ложное срабатывание по подстроке.",
  },
  {
    id: "b10",
    scenario: "!!!Важно!!! Завтра короткий день, занятия до 13:00.",
    rulesSucceed: false,
    truthLabel: "не спам",
    botLabel: "спам",
    explanation:
      "Восклицательные знаки — не всегда агрессия. Официальное объявление пострадало от правила.",
  },
];

export type LabRow = {
  id: string;
  text: string;
  truth: "спам" | "не спам";
};

export const LAB_TEST_ROWS: LabRow[] = [
  {
    id: "l1",
    text: "Скидка 90% на курсы только сегодня, жми!!!",
    truth: "спам",
  },
  {
    id: "l2",
    text: "Семинар по бесплатному ПО для учителей математики.",
    truth: "не спам",
  },
  {
    id: "l3",
    text: "Выиграй путёвку — оплати налог победителю 5000 руб.",
    truth: "спам",
  },
  {
    id: "l4",
    text: "Команда выиграла регион по робототехнике, поздравляем ребят!",
    truth: "не спам",
  },
  {
    id: "l5",
    text: "Внимание всем: срочно пройти опрос по питанию в столовой.",
    truth: "не спам",
  },
];

export const DEFAULT_LAB_KEYWORDS = "бесплатно, выиграл, !!!";

export function parseLabKeywords(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function labClassify(text: string, triggers: string[]): "спам" | "не спам" {
  const t = text.toLowerCase();
  return triggers.some((kw) => kw && t.includes(kw)) ? "спам" : "не спам";
}

export type FinalScenario = {
  id: string;
  title: string;
  text: string;
  correct: FinalAnswerKey;
  explanation: string;
};

export const FINAL_SCENARIOS: FinalScenario[] = [
  {
    id: "f1",
    title: "Сортировка",
    text: "Отсортировать миллион целых чисел известного диапазона по возрастанию — формат данных фиксирован.",
    correct: "algorithm",
    explanation: "Классический алгоритм с известной сложностью, правила однозначны.",
  },
  {
    id: "f2",
    title: "Эмоции на фото",
    text: "По фото лица в разном свете и ракурсе определить настроение человека для приложения.",
    correct: "ml",
    explanation: "Слишком много вариаций; проще учить модель на примерах, чем выписать все правила.",
  },
  {
    id: "f3",
    title: "Пароль",
    text: "Проверить, совпадает ли введённый пароль с сохранённым хешем в базе.",
    correct: "algorithm",
    explanation: "Детерминированная операция — известная криптографическая функция.",
  },
  {
    id: "f4",
    title: "Сленг и мемы",
    text: "Перевести пост из тиктока с новым сленгом в нейтральный русский для родителей.",
    correct: "ml",
    explanation: "Язык постоянно меняется; статический словарь быстро устаревает.",
  },
  {
    id: "f5",
    title: "Лабиринт",
    text: "Найти кратчайший путь в лабиринте, карта полная и не меняется.",
    correct: "algorithm",
    explanation: "Граф известен — подходят BFS/Дейкстра, ML здесь избыточен.",
  },
];
