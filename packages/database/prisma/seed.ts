import { PrismaClient } from "@prisma/client";
import bcrypt, { hashSync } from "bcryptjs";
import { promisify } from "node:util";

const prisma = new PrismaClient();
const DEV_PASSWORD_HASH = hashSync("12345678", 10);
/** bcryptjs uses callback API; wrapped for async/await like `await bcrypt.hash(...)`. */
const bcryptHash = promisify(bcrypt.hash.bind(bcrypt)) as (
  data: string,
  saltOrRounds: number | string,
) => Promise<string>;

async function main() {
  await prisma.taskAttempt.deleteMany();
  await prisma.userAchievement.deleteMany();
  await prisma.task.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.achievement.deleteMany();
  await prisma.studentProfile.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.create({
    data: { email: "admin@school.ru", role: "admin", passwordHash: DEV_PASSWORD_HASH },
  });

  await prisma.user.createMany({
    data: [
      { email: "elena.petrova@school.ru", role: "teacher", passwordHash: DEV_PASSWORD_HASH },
      { email: "dmitry.ivanov@school.ru", role: "teacher", passwordHash: DEV_PASSWORD_HASH },
    ],
  });

  const daryaHash = await bcryptHash("89027878", 10);
  await prisma.user.upsert({
    where: { email: "darya.kislaya.05@bk.ru" },
    update: {
      role: "teacher",
      displayName: "Дарья",
      passwordHash: daryaHash,
    },
    create: {
      email: "darya.kislaya.05@bk.ru",
      role: "teacher",
      displayName: "Дарья",
      passwordHash: daryaHash,
    },
  });

  const studentRows = await prisma.$transaction([
    prisma.user.create({ data: { email: "alex.student@school.ru", role: "student", passwordHash: DEV_PASSWORD_HASH } }),
    prisma.user.create({ data: { email: "maria.k@school.ru", role: "student", passwordHash: DEV_PASSWORD_HASH } }),
    prisma.user.create({ data: { email: "ivan.s@school.ru", role: "student", passwordHash: DEV_PASSWORD_HASH } }),
    prisma.user.create({ data: { email: "sofia.m@school.ru", role: "student", passwordHash: DEV_PASSWORD_HASH } }),
    prisma.user.create({ data: { email: "pavel.n@school.ru", role: "student", passwordHash: DEV_PASSWORD_HASH } }),
  ]);

  const profiles: { userId: string; level: number; xp: number }[] = [
    { userId: studentRows[0].id, level: 12, xp: 4280 },
    { userId: studentRows[1].id, level: 10, xp: 3100 },
    { userId: studentRows[2].id, level: 8, xp: 2100 },
    { userId: studentRows[3].id, level: 14, xp: 5100 },
    { userId: studentRows[4].id, level: 11, xp: 3600 },
  ];

  for (const p of profiles) {
    await prisma.studentProfile.create({ data: p });
  }

  const companionSpecs = [
    {
      name: "Лума",
      personalityType: "explorer" as const,
      stage: 2,
      logic: 9,
      creativity: 6,
      empathy: 6,
      focus: 8,
    },
    {
      name: "Орион",
      personalityType: "mentor" as const,
      stage: 2,
      logic: 8,
      creativity: 6,
      empathy: 9,
      focus: 7,
    },
    {
      name: "Искра",
      personalityType: "strategist" as const,
      stage: 1,
      logic: 10,
      creativity: 5,
      empathy: 6,
      focus: 8,
    },
    {
      name: "Тетра",
      personalityType: "inventor" as const,
      stage: 3,
      logic: 8,
      creativity: 9,
      empathy: 6,
      focus: 7,
    },
    {
      name: "Эхо",
      personalityType: "explorer" as const,
      stage: 1,
      logic: 7,
      creativity: 7,
      empathy: 7,
      focus: 7,
    },
  ];

  for (let i = 0; i < studentRows.length; i++) {
    const spec = companionSpecs[i]!;
    await prisma.studentAICompanion.create({
      data: {
        studentId: studentRows[i].id,
        name: spec.name,
        stage: spec.stage,
        personalityType: spec.personalityType,
        logic: spec.logic,
        creativity: spec.creativity,
        empathy: spec.empathy,
        focus: spec.focus,
      },
    });
  }

  const lesson1 = await prisma.lesson.create({
    data: {
      title: "Введение в нейросети",
      description: "Как нейросети обрабатывают данные — основы",
    },
  });
  const lesson2 = await prisma.lesson.create({
    data: {
      title: "Обработка естественного языка",
      description: "Как ИИ понимает и генерирует человеческую речь",
    },
  });
  const lesson3 = await prisma.lesson.create({
    data: {
      title: "Ваш первый чат-бот",
      description: "Собираем диалогового ИИ-помощника с нуля",
    },
  });

  const taskL1a = await prisma.task.create({
    data: {
      lessonId: lesson1.id,
      title: "Нейрон и веса",
      description: "Краткий тест на понятие перцептрона",
      taskType: "classification",
      promptText:
        "В простом перцептроне что описывают веса на связи между входом и выходом?",
      optionsJson: [
        "Вклад входного сигнала в итоговое решение (насколько сильно вход влияет на результат)",
        "Тексты всех примеров из обучающей выборки",
        "Случайные числа без связи с входами",
      ],
      correctAnswer:
        "Вклад входного сигнала в итоговое решение (насколько сильно вход влияет на результат)",
    },
  });
  const taskL1b = await prisma.task.create({
    data: {
      lessonId: lesson1.id,
      title: "Слоёная сеть",
      description: "Разметить схему полносвязной сети",
    },
  });
  const taskL2a = await prisma.task.create({
    data: {
      lessonId: lesson2.id,
      title: "Чистка корпуса отзывов",
      description:
        "Мини-игра: отметьте, какие строки годятся для обучения классификатора тональности",
      taskType: "data_cleaning",
      promptText:
        "Собираем короткие отзывы о фильме для обучения модели. Оставьте осмысленные реплики о кино; отфильтруйте спам, мусор и тексты не по теме.",
      optionsJson: [
        {
          id: "ex1",
          text: "Фильм понравился: сюжет цепляющий, актёры убедительны.",
        },
        { id: "ex2", text: "asdf qwerty 12345 !!!!" },
        {
          id: "ex3",
          text: "Купите часы со скидкой 90% — переходите по ссылке в профиле!!!",
        },
        {
          id: "ex4",
          text: "Немного затянуто в середине, но финал сильный и запоминается.",
        },
      ],
      correctAnswer: JSON.stringify({
        clean: ["ex1", "ex4"],
        noisy: ["ex2", "ex3"],
      }),
    },
  });
  await prisma.task.create({
    data: {
      lessonId: lesson3.id,
      title: "Безопасный ответ ассистента",
      description: "Мини-квест: выберите лучшую политику поведения ИИ",
      taskType: "policy_path",
      promptText:
        "Сценарий: пользователь просит школьного чат-бота выдать пошаговую инструкцию, как обойти родительский контроль на домашнем ПК.\n\nКакой ответ ассистента наиболее безопасен и уместен?",
      optionsJson: [
        "Вежливо отказать, объяснить границы и предложить обсудить с родителем или педагогом",
        "Дать общие советы по «настройке сети» без деталей обхода фильтров",
        "Выдать подробную инструкцию по обходу, раз пользователь настаивает",
        "Завершить диалог без объяснения причин",
      ],
      correctAnswer:
        "Вежливо отказать, объяснить границы и предложить обсудить с родителем или педагогом",
    },
  });
  const taskL3a = await prisma.task.create({
    data: {
      lessonId: lesson3.id,
      title: "Первый диалог",
      description: "Собрать минимальный сценарий бота",
    },
  });

  await prisma.taskAttempt.createMany({
    data: [
      {
        userId: studentRows[0].id,
        taskId: taskL1a.id,
        score: 88,
        completedAt: new Date(),
      },
      {
        userId: studentRows[0].id,
        taskId: taskL1b.id,
        score: 72,
        completedAt: new Date(),
      },
      {
        userId: studentRows[1].id,
        taskId: taskL1a.id,
        score: 95,
        completedAt: new Date(),
      },
    ],
  });

  const ach1 = await prisma.achievement.create({
    data: {
      title: "Быстрый старт",
      description: "Пройти 5 уроков за один день",
    },
  });
  const ach2 = await prisma.achievement.create({
    data: {
      title: "Серийный рекорд",
      description: "Держать серию обучения 14 дней",
    },
  });
  const ach3 = await prisma.achievement.create({
    data: {
      title: "Исследователь ИИ",
      description: "Попробовать все режимы ИИ-компаньона",
    },
  });

  await prisma.userAchievement.createMany({
    data: [
      { userId: studentRows[0].id, achievementId: ach1.id },
      { userId: studentRows[0].id, achievementId: ach2.id },
      { userId: studentRows[3].id, achievementId: ach2.id },
    ],
  });
}

main()
  .then(() => {
    console.log("Seed completed.");
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
