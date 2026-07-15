/** Опрос для составления листа закупок занятий с детьми. */

export type Priority = "critical" | "high" | "medium" | "later";

export type PurchaseCategory =
  | "it"
  | "ai-lab"
  | "classroom"
  | "music"
  | "knots"
  | "creative"
  | "safety"
  | "consumables";

export type PurchaseItem = {
  id: string;
  name: string;
  category: PurchaseCategory;
  qty: number;
  unit: string;
  priority: Priority;
  reason: string;
  approxNote?: string;
};

export type SurveyAnswers = {
  ageGroup: string;
  groupSize: string;
  venue: string;
  frequency: string;
  tracks: string[];
  otherTrack: string;
  existingLaptops: string;
  existingProjector: string;
  existingInternet: string;
  existingFurniture: string;
  laptopNeed: string;
  aiExtras: string[];
  musicGear: string[];
  knotGear: string[];
  softSkillsGear: string[];
  budget: string;
  priorityFocus: string[];
  notes: string;
};

export const emptyAnswers: SurveyAnswers = {
  ageGroup: "",
  groupSize: "",
  venue: "",
  frequency: "",
  tracks: ["ai"],
  otherTrack: "",
  existingLaptops: "",
  existingProjector: "",
  existingInternet: "",
  existingFurniture: "",
  laptopNeed: "",
  aiExtras: [],
  musicGear: [],
  knotGear: [],
  softSkillsGear: [],
  budget: "",
  priorityFocus: [],
  notes: "",
};

export type QuestionKind = "single" | "multi" | "text";

export type SurveyOption = {
  id: string;
  label: string;
  hint?: string;
};

export type SurveyStep = {
  id: string;
  title: string;
  subtitle: string;
  field: keyof SurveyAnswers;
  kind: QuestionKind;
  required?: boolean;
  options?: SurveyOption[];
  placeholder?: string;
  /** Показывать шаг только если выбран хотя бы один из треков */
  whenTracks?: string[];
};

export const CATEGORY_LABELS: Record<PurchaseCategory, string> = {
  it: "Ноутбуки и техника",
  "ai-lab": "Лаборатория нейросетей",
  classroom: "Класс и инфраструктура",
  music: "Гитара и музыка",
  knots: "Узлы и верёвки",
  creative: "Творчество и доп. занятия",
  safety: "Безопасность",
  consumables: "Расходники",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  critical: "Срочно",
  high: "Высокий",
  medium: "Средний",
  later: "Позже",
};

export const surveySteps: SurveyStep[] = [
  {
    id: "age",
    title: "Какой возраст детей?",
    subtitle: "От этого зависят мощность техники, мебель и формат материалов.",
    field: "ageGroup",
    kind: "single",
    required: true,
    options: [
      { id: "7-9", label: "7–9 лет", hint: "Младшая школа" },
      { id: "10-12", label: "10–12 лет", hint: "Средняя школа" },
      { id: "13-15", label: "13–15 лет", hint: "Подростки" },
      { id: "mixed", label: "Смешанные группы", hint: "Разный возраст в одном потоке" },
    ],
  },
  {
    id: "size",
    title: "Сколько детей в одной группе?",
    subtitle: "Посчитаем количество ноутбуков, стульев и расходников.",
    field: "groupSize",
    kind: "single",
    required: true,
    options: [
      { id: "4", label: "До 4", hint: "Индивидуальный / мини-формат" },
      { id: "8", label: "5–8", hint: "Малая группа" },
      { id: "12", label: "9–12", hint: "Типичный кружок" },
      { id: "16", label: "13–16+", hint: "Большой класс" },
    ],
  },
  {
    id: "venue",
    title: "Где проходят занятия?",
    subtitle: "Влияет на мебель, интернет, хранение и мобильный комплект.",
    field: "venue",
    kind: "single",
    required: true,
    options: [
      { id: "school", label: "Школьный кабинет", hint: "Есть столы, розетки, доска" },
      { id: "club", label: "Кружок / ДТД / коворкинг", hint: "Делите пространство с другими" },
      { id: "home", label: "Дома / у себя", hint: "Нужно оборудовать с нуля" },
      { id: "mobile", label: "Выездные занятия", hint: "Всё возите с собой" },
    ],
  },
  {
    id: "freq",
    title: "Как часто занятия?",
    subtitle: "Расходники и запасные зарядки зависят от интенсивности.",
    field: "frequency",
    kind: "single",
    required: true,
    options: [
      { id: "1", label: "1 раз в неделю" },
      { id: "2", label: "2 раза в неделю" },
      { id: "intensive", label: "Интенсив / лагерь", hint: "Каждый день или почти" },
      { id: "irregular", label: "Разовые мастер-классы" },
    ],
  },
  {
    id: "tracks",
    title: "Какие направления ведёте или планируете?",
    subtitle: "Нейросети уже отмечены. Добавьте гитару, узлы и всё, что умеете.",
    field: "tracks",
    kind: "multi",
    required: true,
    options: [
      { id: "ai", label: "Нейросети / ИИ (AI Lab)", hint: "Основной курс" },
      { id: "guitar", label: "Гитара / музыка", hint: "Вы умеете играть" },
      { id: "knots", label: "Узлы / туризм", hint: "Вязание узлов и верёвочные практики" },
      { id: "coding", label: "Программирование / логика" },
      { id: "robotics", label: "Робототехника / электроника" },
      { id: "craft", label: "Рукоделие / творчество" },
      { id: "games", label: "Подвижные / командные игры" },
      { id: "other", label: "Другое направление" },
    ],
  },
  {
    id: "otherTrack",
    title: "Какое ещё направление добавить?",
    subtitle: "Коротко опишите — учтём в рекомендациях и заметках к закупке.",
    field: "otherTrack",
    kind: "text",
    placeholder: "Например: шахматры, лего, фотография, кулинария…",
    whenTracks: ["other"],
  },
  {
    id: "laptops-exist",
    title: "Есть ли уже ноутбуки для учеников?",
    subtitle: "Считаем, сколько ещё докупить под курс нейросетей.",
    field: "existingLaptops",
    kind: "single",
    required: true,
    options: [
      { id: "none", label: "Нет совсем" },
      { id: "few", label: "Есть 1–3 своих / общих" },
      { id: "half", label: "Есть примерно на половину группы" },
      { id: "enough", label: "Хватает на всю группу" },
      { id: "byod", label: "Дети приносят свои", hint: "BYOD — нужны запасные и зарядка" },
    ],
  },
  {
    id: "projector",
    title: "Есть проектор, ТВ или большая доска?",
    subtitle: "Для демонстрации AI Lab и разбора заданий у доски.",
    field: "existingProjector",
    kind: "single",
    required: true,
    options: [
      { id: "yes", label: "Да, уже есть" },
      { id: "partial", label: "Есть доска, но нет проектора / ТВ" },
      { id: "no", label: "Нет ничего для показа" },
    ],
  },
  {
    id: "internet",
    title: "Как с интернетом и сетью на месте?",
    subtitle: "Для пилота AI Lab нужен LAN; для Ollama — мощные ПК локально.",
    field: "existingInternet",
    kind: "single",
    required: true,
    options: [
      { id: "stable", label: "Стабильный Wi‑Fi + можно сделать LAN" },
      { id: "wifi-only", label: "Только Wi‑Fi, без шары" },
      { id: "weak", label: "Слабый / нестабильный интернет" },
      { id: "offline", label: "Часто без сети", hint: "Ориентир на офлайн и локальные модели" },
    ],
  },
  {
    id: "furniture",
    title: "Какая мебель и хранение уже есть?",
    subtitle: "Столы под ноутбуки, шкаф для гитар и верёвок, удлинители.",
    field: "existingFurniture",
    kind: "single",
    required: true,
    options: [
      { id: "ready", label: "Кабинет почти готов" },
      { id: "tables", label: "Есть столы, мало розеток / хранения" },
      { id: "minimal", label: "Минимум: нужно оборудовать" },
      { id: "mobile", label: "Только мобильный комплект" },
    ],
  },
  {
    id: "laptop-need",
    title: "Какой уровень ноутбуков нужен под нейросети?",
    subtitle: "Локальные модели (Ollama) требуют сильнее железо, чем браузерный демо-режим.",
    field: "laptopNeed",
    kind: "single",
    required: true,
    whenTracks: ["ai"],
    options: [
      {
        id: "demo",
        label: "Демо / браузерный режим",
        hint: "Хватит офисных ноутбуков, без тяжёлых локальных моделей",
      },
      {
        id: "mid",
        label: "Средний класс + Ollama",
        hint: "16 ГБ RAM, можно qwen и аналоги",
      },
      {
        id: "strong",
        label: "Мощные рабочие станции",
        hint: "32 ГБ+, дискретная видеокарта — учительский и 1–2 «тяжёлых» места",
      },
      {
        id: "mix",
        label: "Микс: много средних + 1 мощный у учителя",
        hint: "Оптимально для кружка",
      },
    ],
  },
  {
    id: "ai-extras",
    title: "Что ещё нужно для лаборатории ИИ?",
    subtitle: "Можно выбрать несколько пунктов.",
    field: "aiExtras",
    kind: "multi",
    whenTracks: ["ai"],
    options: [
      { id: "headphones", label: "Наушники (голос / companion)" },
      { id: "mice", label: "Мыши и коврики" },
      { id: "chargers", label: "Запасные зарядки и удлинители" },
      { id: "cases", label: "Чехлы / сумки для ноутбуков" },
      { id: "router", label: "Роутер / свитч для класса" },
      { id: "ups", label: "ИБП / стабилизатор" },
      { id: "print", label: "Принтер и бумага для чек-листов" },
      { id: "whiteboard", label: "Магнитно-маркерная доска и маркеры" },
    ],
  },
  {
    id: "music",
    title: "Что закупить под гитару и музыку?",
    subtitle: "Вы отметили, что умеете играть — уточним комплект.",
    field: "musicGear",
    kind: "multi",
    whenTracks: ["guitar"],
    options: [
      { id: "guitars", label: "Учебные гитары (несколько штук)" },
      { id: "strings", label: "Струны и медиаторы" },
      { id: "tuner", label: "Тюнеры / приложения + метроном" },
      { id: "stands", label: "Стойки и ремни" },
      { id: "stands-sheet", label: "Пюпитры и нотная бумага" },
      { id: "amp", label: "Комбик / колонка для демо" },
      { id: "cases-m", label: "Чехлы для хранения и выездов" },
    ],
  },
  {
    id: "knots",
    title: "Что нужно для занятий по узлам?",
    subtitle: "Верёвки, карабины и наглядные пособия.",
    field: "knotGear",
    kind: "multi",
    whenTracks: ["knots"],
    options: [
      { id: "rope-soft", label: "Мягкие учебные верёвки (разный диаметр)" },
      { id: "paracord", label: "Паракорд / шнур для простых узлов" },
      { id: "carabiners", label: "Учебные карабины (не альпинистские сертификаты)" },
      { id: "board", label: "Доска / стенд для демонстрации узлов" },
      { id: "posters", label: "Плакаты со схемами узлов" },
      { id: "scissors", label: "Ножницы и зажигалки для оплавления концов (для взрослых)" },
      { id: "storage-k", label: "Мешки / ящики для хранения комплектов" },
    ],
  },
  {
    id: "soft",
    title: "Что ещё усилит занятия?",
    subtitle: "Общие вещи для любого кружка с детьми.",
    field: "softSkillsGear",
    kind: "multi",
    options: [
      { id: "badges", label: "Бейджи / таблички имён" },
      { id: "timer", label: "Таймер / песочные часы для раундов" },
      { id: "firstaid", label: "Аптечка" },
      { id: "water", label: "Кулер / бутылки с водой" },
      { id: "rewards", label: "Наклейки / небольшие награды" },
      { id: "camera", label: "Штатив / камера для записи фрагментов урока" },
      { id: "storage", label: "Пластиковые боксы и подписи" },
    ],
  },
  {
    id: "budget",
    title: "Какой ориентир по бюджету?",
    subtitle: "Поможет расставить приоритеты «срочно / позже».",
    field: "budget",
    kind: "single",
    required: true,
    options: [
      { id: "tight", label: "Минимум", hint: "Только критичное для старта" },
      { id: "moderate", label: "Средний", hint: "Комфортный кружок на семестр" },
      { id: "full", label: "Полный комплект", hint: "С запасом и «вау»-материалами" },
    ],
  },
  {
    id: "focus",
    title: "Что важнее всего прямо сейчас?",
    subtitle: "Эти категории поднимем в приоритет.",
    field: "priorityFocus",
    kind: "multi",
    options: [
      { id: "it", label: "Ноутбуки и сеть" },
      { id: "ai-lab", label: "Готовность AI Lab к пилоту" },
      { id: "music", label: "Музыкальный блок" },
      { id: "knots", label: "Блок по узлам" },
      { id: "space", label: "Обустройство кабинета" },
      { id: "safety", label: "Безопасность и хранение" },
    ],
  },
  {
    id: "notes",
    title: "Есть особые ограничения или пожелания?",
    subtitle: "Бюджетный потолок, бренд техники, запреты школы, сроки — всё сюда.",
    field: "notes",
    kind: "text",
    placeholder: "Например: закупка до 15 сентября, только с HDMI, нельзя сверлить стены…",
  },
];

function groupSizeNumber(answers: SurveyAnswers): number {
  switch (answers.groupSize) {
    case "4":
      return 4;
    case "8":
      return 8;
    case "12":
      return 12;
    case "16":
      return 16;
    default:
      return 8;
  }
}

function laptopGap(answers: SurveyAnswers): number {
  const n = groupSizeNumber(answers);
  switch (answers.existingLaptops) {
    case "none":
      return n;
    case "few":
      return Math.max(0, n - 2);
    case "half":
      return Math.ceil(n / 2);
    case "enough":
      return 0;
    case "byod":
      return Math.max(2, Math.ceil(n * 0.2));
    default:
      return n;
  }
}

function bump(
  priority: Priority,
  focus: string[],
  categoryKey: string,
): Priority {
  if (!focus.includes(categoryKey)) return priority;
  if (priority === "later") return "medium";
  if (priority === "medium") return "high";
  if (priority === "high") return "critical";
  return priority;
}

function downgrade(priority: Priority, budget: string): Priority {
  if (budget !== "tight") return priority;
  if (priority === "medium") return "later";
  if (priority === "high") return "medium";
  return priority;
}

function item(
  partial: Omit<PurchaseItem, "priority"> & { priority: Priority },
  answers: SurveyAnswers,
  focusKey?: string,
): PurchaseItem {
  let p = partial.priority;
  if (focusKey) p = bump(p, answers.priorityFocus, focusKey);
  p = downgrade(p, answers.budget);
  return { ...partial, priority: p };
}

export function isStepVisible(step: SurveyStep, answers: SurveyAnswers): boolean {
  if (!step.whenTracks || step.whenTracks.length === 0) return true;
  return step.whenTracks.some((t) => answers.tracks.includes(t));
}

export function visibleSteps(answers: SurveyAnswers): SurveyStep[] {
  return surveySteps.filter((s) => isStepVisible(s, answers));
}

export function stepAnswered(step: SurveyStep, answers: SurveyAnswers): boolean {
  const value = answers[step.field];
  if (step.kind === "multi") {
    if (!step.required) return true;
    return Array.isArray(value) && value.length > 0;
  }
  if (step.kind === "text") {
    if (!step.required) return true;
    return typeof value === "string" && value.trim().length > 0;
  }
  if (!step.required) return true;
  return typeof value === "string" && value.length > 0;
}

export function buildPurchaseList(answers: SurveyAnswers): PurchaseItem[] {
  const items: PurchaseItem[] = [];
  const n = groupSizeNumber(answers);
  const gap = laptopGap(answers);
  const hasAi = answers.tracks.includes("ai");
  const hasGuitar = answers.tracks.includes("guitar");
  const hasKnots = answers.tracks.includes("knots");
  const hasCraft = answers.tracks.includes("craft");
  const hasRobotics = answers.tracks.includes("robotics");
  const hasCoding = answers.tracks.includes("coding");
  const hasGames = answers.tracks.includes("games");
  const young = answers.ageGroup === "7-9" || answers.ageGroup === "mixed";

  if (hasAi || gap > 0) {
    if (gap > 0) {
      const need = answers.laptopNeed || "mix";
      const name =
        need === "demo"
          ? "Ноутбук офисный (браузерный демо-режим AI Lab)"
          : need === "strong"
            ? "Мощный ноутбук / ПК (32 ГБ+, для локальных моделей)"
            : need === "mid"
              ? "Ноутбук средний класс (16 ГБ RAM, SSD, под Ollama)"
              : "Ноутбук средний класс для учеников (16 ГБ RAM)";
      items.push(
        item(
          {
            id: "laptops",
            name,
            category: "it",
            qty: gap,
            unit: "шт.",
            priority: "critical",
            reason:
              answers.existingLaptops === "byod"
                ? "Запасные места на случай, если у ребёнка нет устройства или села батарея."
                : `Не хватает техники на группу ~${n} человек.`,
            approxNote:
              need === "demo"
                ? "Можно б/у бизнес-линейку с HDMI"
                : "Проверьте поддержка AVX2 и место под модели Ollama",
          },
          answers,
          "it",
        ),
      );
      if (need === "mix" || need === "strong") {
        items.push(
          item(
            {
              id: "teacher-workstation",
              name: "Рабочее место учителя (мощный ПК/ноутбук + монитор)",
              category: "ai-lab",
              qty: 1,
              unit: "комплект",
              priority: "high",
              reason: "Общая SQLite, демо, шаринг моделей и сопровождение пилота.",
            },
            answers,
            "ai-lab",
          ),
        );
      }
    }

    if (answers.existingProjector === "no") {
      items.push(
        item(
          {
            id: "projector",
            name: "Проектор или ТВ 43–55\" с HDMI",
            category: "classroom",
            qty: 1,
            unit: "шт.",
            priority: "critical",
            reason: "Показ AI Lab, разбор заданий и совместные демонстрации.",
          },
          answers,
          "space",
        ),
      );
      items.push(
        item(
          {
            id: "hdmi-cable",
            name: "HDMI-кабель + адаптеры USB-C/HDMI",
            category: "classroom",
            qty: 2,
            unit: "шт.",
            priority: "high",
            reason: "Совместимость с разными ноутбуками учеников и учителя.",
          },
          answers,
          "space",
        ),
      );
    } else if (answers.existingProjector === "partial") {
      items.push(
        item(
          {
            id: "projector",
            name: "Проектор или большой монитор",
            category: "classroom",
            qty: 1,
            unit: "шт.",
            priority: "high",
            reason: "Доска есть, но для AI Lab нужен цифровой вывод.",
          },
          answers,
          "space",
        ),
      );
    }

    if (
      answers.existingInternet === "weak" ||
      answers.existingInternet === "offline" ||
      answers.existingInternet === "wifi-only"
    ) {
      items.push(
        item(
          {
            id: "router-switch",
            name: "Роутер и/или свитч для классной LAN",
            category: "it",
            qty: 1,
            unit: "комплект",
            priority: answers.existingInternet === "offline" ? "high" : "critical",
            reason:
              "Пилот AI Lab с общей базой работает стабильнее в локальной сети; слабый интернет — больше офлайн-моделей.",
          },
          answers,
          "it",
        ),
      );
    }

    if (answers.aiExtras.includes("router") && !items.some((i) => i.id === "router-switch")) {
      items.push(
        item(
          {
            id: "router-switch",
            name: "Роутер / свитч для класса",
            category: "it",
            qty: 1,
            unit: "комплект",
            priority: "high",
            reason: "Вы отметили нужду в отдельной сети класса.",
          },
          answers,
          "it",
        ),
      );
    }

    const extras: Array<{
      id: keyof typeof AI_EXTRA_CATALOG | string;
      flag: string;
    }> = [
      { id: "headphones", flag: "headphones" },
      { id: "mice", flag: "mice" },
      { id: "chargers", flag: "chargers" },
      { id: "cases", flag: "cases" },
      { id: "ups", flag: "ups" },
      { id: "print", flag: "print" },
      { id: "whiteboard", flag: "whiteboard" },
    ];
    for (const ex of extras) {
      if (!answers.aiExtras.includes(ex.flag)) continue;
      const cat = AI_EXTRA_CATALOG[ex.flag];
      if (!cat) continue;
      items.push(
        item(
          {
            id: cat.id,
            name: cat.name,
            category: cat.category,
            qty: cat.qtyPerStudent ? Math.max(n, cat.minQty ?? 1) : (cat.minQty ?? 1),
            unit: cat.unit,
            priority: cat.priority,
            reason: cat.reason,
          },
          answers,
          cat.focus,
        ),
      );
    }
  }

  if (
    answers.existingFurniture === "minimal" ||
    answers.existingFurniture === "mobile" ||
    answers.venue === "home" ||
    answers.venue === "mobile"
  ) {
    items.push(
      item(
        {
          id: "power-strips",
          name: "Сетевые фильтры / удлинители",
          category: "classroom",
          qty: Math.ceil(n / 4) + 1,
          unit: "шт.",
          priority: "critical",
          reason: "Розеток почти всегда не хватает, когда включены все ноутбуки.",
        },
        answers,
        "space",
      ),
    );
    if (answers.existingFurniture !== "tables" && answers.existingFurniture !== "ready") {
      items.push(
        item(
          {
            id: "tables-chairs",
            name: young
              ? "Столы и стулья подходящей высоты (младший возраст)"
              : "Рабочие столы и стулья для группы",
            category: "classroom",
            qty: n,
            unit: "мест",
            priority: "high",
            reason: "Без устойчивых мест нельзя нормально вести лабораторную работу.",
          },
          answers,
          "space",
        ),
      );
    }
    items.push(
      item(
        {
          id: "storage-cabinets",
          name: "Шкаф / закрытые боксы для техники и материалов",
          category: "classroom",
          qty: 1,
          unit: "комплект",
          priority: "medium",
          reason: "Хранение ноутбуков, гитар и верёвок между занятиями.",
        },
        answers,
        "safety",
      ),
    );
  } else if (answers.existingFurniture === "tables") {
    items.push(
      item(
        {
          id: "power-strips",
          name: "Сетевые фильтры / удлинители",
          category: "classroom",
          qty: Math.ceil(n / 4) + 1,
          unit: "шт.",
          priority: "high",
          reason: "Столы есть, но розеток обычно мало.",
        },
        answers,
        "space",
      ),
    );
  }

  if (hasGuitar) {
    const musicSelected = answers.musicGear;
    const want = (id: string) => musicSelected.length === 0 || musicSelected.includes(id);
    if (want("guitars")) {
      items.push(
        item(
          {
            id: "guitars",
            name: "Акустические учебные гитары (¾ или full size по возрасту)",
            category: "music",
            qty: Math.min(n, Math.max(3, Math.ceil(n / 2))),
            unit: "шт.",
            priority: "high",
            reason: "Чтобы играть не по очереди у одной гитары.",
            approxNote: young ? "Предпочтительно ¾ и нейлон" : "Full size + запас медиаторов",
          },
          answers,
          "music",
        ),
      );
    }
    if (want("strings")) {
      items.push(
        item(
          {
            id: "strings-picks",
            name: "Комплекты струн и медиаторы",
            category: "music",
            qty: Math.max(4, Math.ceil(n / 2)),
            unit: "набор",
            priority: "medium",
            reason: "Расходник: струны рвутся, медиаторы теряются.",
          },
          answers,
          "music",
        ),
      );
    }
    if (want("tuner")) {
      items.push(
        item(
          {
            id: "tuners",
            name: "Клип-тюнеры",
            category: "music",
            qty: Math.min(6, Math.max(2, Math.ceil(n / 3))),
            unit: "шт.",
            priority: "medium",
            reason: "Быстрая настройка перед занятием.",
          },
          answers,
          "music",
        ),
      );
    }
    if (want("stands")) {
      items.push(
        item(
          {
            id: "guitar-stands",
            name: "Стойки и ремни для гитар",
            category: "music",
            qty: Math.min(n, 6),
            unit: "комплект",
            priority: "medium",
            reason: "Безопасное хранение во время занятия.",
          },
          answers,
          "music",
        ),
      );
    }
    if (want("stands-sheet")) {
      items.push(
        item(
          {
            id: "music-stands",
            name: "Пюпитры + тетради/табы",
            category: "music",
            qty: Math.ceil(n / 2),
            unit: "комплект",
            priority: "later",
            reason: "Удобнее разбирать партии в группе.",
          },
          answers,
          "music",
        ),
      );
    }
    if (want("amp")) {
      items.push(
        item(
          {
            id: "amp",
            name: "Небольшая акустическая система / комбик",
            category: "music",
            qty: 1,
            unit: "шт.",
            priority: answers.budget === "full" ? "medium" : "later",
            reason: "Демонстрация приёмов на всю группу.",
          },
          answers,
          "music",
        ),
      );
    }
    if (want("cases-m")) {
      items.push(
        item(
          {
            id: "guitar-cases",
            name: "Чехлы для гитар",
            category: "music",
            qty: Math.min(n, 6),
            unit: "шт.",
            priority: answers.venue === "mobile" ? "high" : "medium",
            reason: "Выездные занятия и хранение.",
          },
          answers,
          "music",
        ),
      );
    }
  }

  if (hasKnots) {
    const knotSelected = answers.knotGear;
    const want = (id: string) => knotSelected.length === 0 || knotSelected.includes(id);
    if (want("rope-soft")) {
      items.push(
        item(
          {
            id: "ropes",
            name: "Учебные верёвки разного диаметра (мягкие)",
            category: "knots",
            qty: n,
            unit: "шт. (по 1.5–2 м)",
            priority: "high",
            reason: "У каждого ребёнка свой комплект — меньше очередей.",
          },
          answers,
          "knots",
        ),
      );
    }
    if (want("paracord")) {
      items.push(
        item(
          {
            id: "paracord",
            name: "Паракорд / шнур для простых узлов",
            category: "knots",
            qty: Math.ceil(n / 2),
            unit: "моток",
            priority: "medium",
            reason: "Дешёвый расходник для тренировки.",
          },
          answers,
          "knots",
        ),
      );
    }
    if (want("carabiners")) {
      items.push(
        item(
          {
            id: "carabiners",
            name: "Учебные карабины (без сертификата для альпинизма)",
            category: "knots",
            qty: n,
            unit: "шт.",
            priority: "medium",
            reason: "Практика крепления и страховки на учебных сценариях.",
          },
          answers,
          "knots",
        ),
      );
    }
    if (want("board")) {
      items.push(
        item(
          {
            id: "knot-board",
            name: "Демонстрационная доска / стенд для узлов",
            category: "knots",
            qty: 1,
            unit: "шт.",
            priority: "high",
            reason: "Видно всей группе, проще объяснять руками.",
          },
          answers,
          "knots",
        ),
      );
    }
    if (want("posters")) {
      items.push(
        item(
          {
            id: "knot-posters",
            name: "Плакаты со схемами базовых узлов",
            category: "knots",
            qty: 1,
            unit: "набор",
            priority: "later",
            reason: "Справка на стене — меньше повторений одного и того же.",
          },
          answers,
          "knots",
        ),
      );
    }
    if (want("scissors")) {
      items.push(
        item(
          {
            id: "rope-tools",
            name: "Ножницы по верёвке + набор для оплавления концов (для взрослых)",
            category: "safety",
            qty: 1,
            unit: "набор",
            priority: "medium",
            reason: "Только под контролем педагога; детям — готовые отрезки.",
          },
          answers,
          "safety",
        ),
      );
    }
    if (want("storage-k")) {
      items.push(
        item(
          {
            id: "knot-storage",
            name: "Мешки / ящики под комплекты верёвок",
            category: "knots",
            qty: Math.ceil(n / 4),
            unit: "шт.",
            priority: "medium",
            reason: "Быстрая раздача и сбор после занятия.",
          },
          answers,
          "knots",
        ),
      );
    }
  }

  if (hasCraft) {
    items.push(
      item(
        {
          id: "craft-kit",
          name: "Базовый набор для рукоделия (клей, ножницы детские, бумага, нитки)",
          category: "creative",
          qty: n,
          unit: "набор",
          priority: "medium",
          reason: "Вы отметили творчество как направление.",
        },
        answers,
      ),
    );
  }
  if (hasRobotics) {
    items.push(
      item(
        {
          id: "robotics-kit",
          name: "Образовательные наборы электроники / робототехники",
          category: "creative",
          qty: Math.ceil(n / 2),
          unit: "набор",
          priority: "high",
          reason: "Парная работа на наборах — экономия бюджета.",
          approxNote: "Совместимость с возрастом и розеточной безопасностью",
        },
        answers,
      ),
    );
  }
  if (hasCoding && !hasAi) {
    items.push(
      item(
        {
          id: "coding-laptops",
          name: "Ноутбуки / планшеты для программирования",
          category: "it",
          qty: gap > 0 ? gap : Math.max(2, Math.ceil(n / 2)),
          unit: "шт.",
          priority: "high",
          reason: "Для блока программирования без полного AI Lab.",
        },
        answers,
        "it",
      ),
    );
  }
  if (hasGames) {
    items.push(
      item(
        {
          id: "game-kit",
          name: "Реквизит для командных игр (мячи soft, конусы, жилетки)",
          category: "creative",
          qty: 1,
          unit: "набор",
          priority: "later",
          reason: "Разминка и смена деятельности между блоками.",
        },
        answers,
      ),
    );
  }

  if (answers.softSkillsGear.includes("badges")) {
    items.push(
      item(
        {
          id: "badges",
          name: "Бейджи / таблички с именами",
          category: "consumables",
          qty: n + 4,
          unit: "шт.",
          priority: "later",
          reason: "Проще обращаться по имени в новой группе.",
        },
        answers,
      ),
    );
  }
  if (answers.softSkillsGear.includes("timer")) {
    items.push(
      item(
        {
          id: "timer",
          name: "Крупный таймер для раундов",
          category: "classroom",
          qty: 1,
          unit: "шт.",
          priority: "later",
          reason: "Видимый таймер держит темп лабораторных заданий.",
        },
        answers,
      ),
    );
  }
  if (answers.softSkillsGear.includes("firstaid") || answers.priorityFocus.includes("safety")) {
    items.push(
      item(
        {
          id: "firstaid",
          name: "Аптечка для кабинета кружка",
          category: "safety",
          qty: 1,
          unit: "шт.",
          priority: "high",
          reason: "Обязательный минимум при работе с детьми (особенно узлы/творчество).",
        },
        answers,
        "safety",
      ),
    );
  }
  if (answers.softSkillsGear.includes("water")) {
    items.push(
      item(
        {
          id: "water",
          name: "Кулер или запас питьевой воды / стаканы",
          category: "classroom",
          qty: 1,
          unit: "комплект",
          priority: "later",
          reason: "Длинные занятия — дети и техника «не засыхают».",
        },
        answers,
      ),
    );
  }
  if (answers.softSkillsGear.includes("rewards")) {
    items.push(
      item(
        {
          id: "rewards",
          name: "Наклейки / небольшие награды за миссии",
          category: "consumables",
          qty: 1,
          unit: "набор",
          priority: "later",
          reason: "Мотивация в конце блоков AI Lab и мастерских.",
        },
        answers,
      ),
    );
  }
  if (answers.softSkillsGear.includes("camera")) {
    items.push(
      item(
        {
          id: "camera",
          name: "Штатив + простая камера/телефон-холдер",
          category: "classroom",
          qty: 1,
          unit: "комплект",
          priority: answers.budget === "full" ? "medium" : "later",
          reason: "Запись фрагментов для разбора и портфолио кружка.",
        },
        answers,
      ),
    );
  }
  if (answers.softSkillsGear.includes("storage")) {
    items.push(
      item(
        {
          id: "bins",
          name: "Пластиковые боксы с подписями",
          category: "classroom",
          qty: 4,
          unit: "шт.",
          priority: "medium",
          reason: "Разделить ИТ, музыку, узлы и расходники.",
        },
        answers,
        "safety",
      ),
    );
  }

  // Всегда полезный минимум для AI Lab пилота
  if (hasAi) {
    items.push(
      item(
        {
          id: "usb-sticks",
          name: "Флешки / внешний SSD с образами моделей и установщиками",
          category: "ai-lab",
          qty: 2,
          unit: "шт.",
          priority: "high",
          reason: "Быстрая раскладка Ollama/моделей без опоры на слабый интернет.",
        },
        answers,
        "ai-lab",
      ),
    );
    items.push(
      item(
        {
          id: "nameplates-stations",
          name: "Нумерация рабочих мест (наклейки 1…N)",
          category: "ai-lab",
          qty: 1,
          unit: "набор",
          priority: "medium",
          reason: "Удобно раздавать доступы и чинить «место №7».",
        },
        answers,
        "ai-lab",
      ),
    );
  }

  if (answers.otherTrack.trim()) {
    items.push(
      item(
        {
          id: "other-track",
          name: `Материалы под направление: ${answers.otherTrack.trim()}`,
          category: "creative",
          qty: 1,
          unit: "пакет",
          priority: "medium",
          reason: "Вы добавили своё направление — заложите отдельную строку в смету.",
        },
        answers,
      ),
    );
  }

  if (answers.notes.trim()) {
    items.push(
      item(
        {
          id: "notes-reminder",
          name: "Учесть ограничения из заметок педагога",
          category: "consumables",
          qty: 1,
          unit: "—",
          priority: "high",
          reason: answers.notes.trim(),
        },
        answers,
      ),
    );
  }

  return sortPurchaseItems(dedupeItems(items));
}

const AI_EXTRA_CATALOG: Record<
  string,
  {
    id: string;
    name: string;
    category: PurchaseCategory;
    unit: string;
    priority: Priority;
    reason: string;
    focus: string;
    qtyPerStudent?: boolean;
    minQty?: number;
  }
> = {
  headphones: {
    id: "headphones",
    name: "Наушники проводные/беспроводные для учеников",
    category: "ai-lab",
    unit: "шт.",
    priority: "medium",
    reason: "Голосовой companion и фокус без шума класса.",
    focus: "ai-lab",
    qtyPerStudent: true,
  },
  mice: {
    id: "mice",
    name: "Мыши и коврики",
    category: "it",
    unit: "шт.",
    priority: "medium",
    reason: "Тачпад у детей часто тормозит работу в лаборатории.",
    focus: "it",
    qtyPerStudent: true,
  },
  chargers: {
    id: "chargers",
    name: "Запасные зарядки и удлинители",
    category: "it",
    unit: "комплект",
    priority: "high",
    reason: "На интенсивных занятиях батареи садятся одновременно.",
    focus: "it",
    minQty: 3,
  },
  cases: {
    id: "cases",
    name: "Чехлы / сумки для ноутбуков",
    category: "it",
    unit: "шт.",
    priority: "medium",
    reason: "Защита при переноске и хранении.",
    focus: "it",
    qtyPerStudent: true,
  },
  ups: {
    id: "ups",
    name: "ИБП / стабилизатор для учительского места",
    category: "classroom",
    unit: "шт.",
    priority: "later",
    reason: "Сохранить общую базу и демо при скачках напряжения.",
    focus: "space",
    minQty: 1,
  },
  print: {
    id: "print",
    name: "Принтер + бумага для чек-листов",
    category: "classroom",
    unit: "комплект",
    priority: "later",
    reason: "Раздаточные схемы узлов, гитарные аппликатуры, AI чек-листы.",
    focus: "space",
    minQty: 1,
  },
  whiteboard: {
    id: "whiteboard",
    name: "Магнитно-маркерная доска и маркеры",
    category: "classroom",
    unit: "комплект",
    priority: "medium",
    reason: "Разбор алгоритмов, схем узлов и аккордов.",
    focus: "space",
    minQty: 1,
  },
};

function dedupeItems(items: PurchaseItem[]): PurchaseItem[] {
  const map = new Map<string, PurchaseItem>();
  for (const it of items) {
    const prev = map.get(it.id);
    if (!prev) {
      map.set(it.id, it);
      continue;
    }
    map.set(it.id, {
      ...prev,
      qty: Math.max(prev.qty, it.qty),
      priority: higherPriority(prev.priority, it.priority),
      reason: prev.reason.length >= it.reason.length ? prev.reason : it.reason,
    });
  }
  return [...map.values()];
}

function higherPriority(a: Priority, b: Priority): Priority {
  const order: Priority[] = ["critical", "high", "medium", "later"];
  return order.indexOf(a) <= order.indexOf(b) ? a : b;
}

function sortPurchaseItems(items: PurchaseItem[]): PurchaseItem[] {
  const order: Priority[] = ["critical", "high", "medium", "later"];
  return [...items].sort((a, b) => {
    const pd = order.indexOf(a.priority) - order.indexOf(b.priority);
    if (pd !== 0) return pd;
    return a.name.localeCompare(b.name, "ru");
  });
}

export function formatPurchaseListText(items: PurchaseItem[], answers: SurveyAnswers): string {
  const lines: string[] = [
    "Лист закупок — занятия с детьми",
    `Группа: ~${groupSizeNumber(answers)} чел., возраст: ${answers.ageGroup || "—"}`,
    `Площадка: ${answers.venue || "—"}, частота: ${answers.frequency || "—"}`,
    `Направления: ${answers.tracks.join(", ")}${answers.otherTrack ? ` (+ ${answers.otherTrack})` : ""}`,
    "",
  ];
  let current: PurchaseCategory | null = null;
  for (const it of items) {
    if (it.category !== current) {
      current = it.category;
      lines.push(`## ${CATEGORY_LABELS[current]}`);
    }
    lines.push(
      `- [${PRIORITY_LABELS[it.priority]}] ${it.name} — ${it.qty} ${it.unit}`,
    );
    lines.push(`  Почему: ${it.reason}`);
    if (it.approxNote) lines.push(`  Заметка: ${it.approxNote}`);
  }
  if (answers.notes.trim()) {
    lines.push("", "## Заметки педагога", answers.notes.trim());
  }
  return lines.join("\n");
}

export function purchaseSummary(items: PurchaseItem[]) {
  const byPriority: Record<Priority, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    later: 0,
  };
  for (const it of items) byPriority[it.priority] += 1;
  return {
    total: items.length,
    byPriority,
  };
}
