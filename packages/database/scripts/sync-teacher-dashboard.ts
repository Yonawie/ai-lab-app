/**
 * Export teacher class overview + analytics + attention queue from seeded DB.
 * Run: pnpm exec tsx scripts/sync-teacher-dashboard.ts (cwd: packages/database)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(
  __dirname,
  "../../../apps/desktop/public/data/teacher-dashboard.json",
);

/** First seeded teacher — no class assignment in schema; export aggregates all students. */
const TEACHER_EMAIL = "elena.petrova@school.ru";

const prisma = new PrismaClient();

const MS_DAY = 86400000;
const MS_HOUR = 3600000;
const MS_MIN = 60000;
/** Считать «в сети», если был ответ за последние 30 минут. */
const ONLINE_WINDOW_MS = 30 * MS_MIN;

function lessonProgress(taskIds: string[], completed: Set<string>): number {
  if (taskIds.length === 0) return 0;
  const n = taskIds.filter((id) => completed.has(id)).length;
  return Math.round((n / taskIds.length) * 100);
}

function relativeRu(d: Date): string {
  const diff = Date.now() - d.getTime();
  if (diff < MS_HOUR) return "Сейчас";
  if (diff < MS_DAY) return `${Math.max(1, Math.floor(diff / MS_HOUR))} ч назад`;
  if (diff < 2 * MS_DAY) return "Вчера";
  const days = Math.floor(diff / MS_DAY);
  return days < 7 ? `${days} дн. назад` : "Ранее";
}

function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  return local
    .split(".")
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
}

function initialsFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(".").filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  const p = parts[0] ?? "?";
  return p.slice(0, 2).toUpperCase();
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

async function main() {
  const teacher = await prisma.user.findUnique({
    where: { email: TEACHER_EMAIL, role: "teacher" },
  });
  if (!teacher) {
    console.error(`No teacher ${TEACHER_EMAIL}. Run seed first.`);
    process.exit(1);
  }

  const [students, lessons, attempts] = await Promise.all([
    prisma.user.findMany({
      where: { role: "student" },
      include: { studentProfile: true },
      orderBy: { email: "asc" },
    }),
    prisma.lesson.findMany({
      include: { tasks: { orderBy: { id: "asc" } } },
      orderBy: { id: "asc" },
    }),
    prisma.taskAttempt.findMany({
      where: { completedAt: { not: null } },
      select: {
        userId: true,
        taskId: true,
        createdAt: true,
      },
    }),
  ]);

  const allTaskIds = lessons.flatMap((l) => l.tasks.map((t) => t.id));
  const totalTaskCount = allTaskIds.length;
  const lessonCount = lessons.length;

  const attemptsByUser = new Map<string, typeof attempts>();
  for (const a of attempts) {
    const list = attemptsByUser.get(a.userId) ?? [];
    list.push(a);
    attemptsByUser.set(a.userId, list);
  }

  const now = Date.now();
  const dayStart = startOfUtcDay(new Date());
  const weekAgo = new Date(now - 7 * MS_DAY);
  const twoWeeksAgo = new Date(now - 14 * MS_DAY);

  const activeTodayIds = new Set(
    attempts
      .filter((a) => a.createdAt >= dayStart)
      .map((a) => a.userId),
  );

  let attemptsLastWeek = 0;
  let attemptsPrevWeek = 0;
  for (const a of attempts) {
    if (a.createdAt >= weekAgo) attemptsLastWeek += 1;
    else if (a.createdAt >= twoWeeksAgo) attemptsPrevWeek += 1;
  }

  const studentRows: Array<{
    id: number;
    name: string;
    avatar: string;
    initials: string;
    level: number;
    progress: number;
    status: "online" | "offline";
    lastActive: string;
    lessonsCompleted: number;
  }> = [];

  let sumProgress = 0;

  for (let i = 0; i < students.length; i++) {
    const u = students[i]!;
    const profile = u.studentProfile;
    const level = profile?.level ?? 1;
    const userAttempts = attemptsByUser.get(u.id) ?? [];
    const done = new Set(userAttempts.map((x) => x.taskId));

    const overall =
      totalTaskCount > 0
        ? Math.round((done.size / totalTaskCount) * 100)
        : 0;
    sumProgress += overall;

    let lessonsCompleted = 0;
    for (const l of lessons) {
      const ids = l.tasks.map((t) => t.id);
      if (ids.length > 0 && lessonProgress(ids, done) === 100) {
        lessonsCompleted += 1;
      }
    }

    const lastAt = userAttempts.reduce<Date | null>(
      (acc, x) => (!acc || x.createdAt > acc ? x.createdAt : acc),
      null,
    );
    const lastActive = lastAt ? relativeRu(lastAt) : "Нет активности";
    const online =
      lastAt != null && now - lastAt.getTime() < ONLINE_WINDOW_MS;

    studentRows.push({
      id: i + 1,
      name: displayNameFromEmail(u.email),
      avatar: "",
      initials: initialsFromEmail(u.email),
      level,
      progress: overall,
      status: online ? "online" : "offline",
      lastActive,
      lessonsCompleted,
    });
  }

  const avgProgress =
    students.length > 0 ? Math.round(sumProgress / students.length) : 0;

  const progressDelta = attemptsLastWeek - attemptsPrevWeek;
  const progressChangePct =
    attemptsPrevWeek === 0
      ? attemptsLastWeek > 0
        ? 100
        : 0
      : Math.round(
          ((attemptsLastWeek - attemptsPrevWeek) / attemptsPrevWeek) * 100,
        );

  const stats = [
    {
      id: "students",
      title: "Всего учеников",
      value: String(students.length),
      change: students.length > 0 ? "+0" : "0",
      trend: "up" as const,
      tone: "blue" as const,
    },
    {
      id: "active",
      title: "Активны сегодня",
      value: String(activeTodayIds.size),
      change: activeTodayIds.size > 0 ? `+${activeTodayIds.size}` : "+0",
      trend: "up" as const,
      tone: "emerald" as const,
    },
    {
      id: "progress",
      title: "Средний прогресс",
      value: `${avgProgress}%`,
      change: `${progressChangePct >= 0 ? "+" : ""}${progressChangePct}%`,
      trend: progressChangePct >= 0 ? ("up" as const) : ("down" as const),
      tone: "accent" as const,
    },
    {
      id: "lessons",
      title: "Назначенных уроков",
      value: String(lessonCount),
      change: lessonCount > 0 ? "+0" : "0",
      trend: "up" as const,
      tone: "amber" as const,
    },
  ];

  const lessonAvgs: { lessonId: string; title: string; avg: number }[] = [];
  for (const l of lessons) {
    const tids = l.tasks.map((t) => t.id);
    if (tids.length === 0) continue;
    let s = 0;
    for (const u of students) {
      const done = new Set(
        (attemptsByUser.get(u.id) ?? []).map((x) => x.taskId),
      );
      s += lessonProgress(tids, done);
    }
    lessonAvgs.push({
      lessonId: l.id,
      title: l.title,
      avg: students.length > 0 ? Math.round(s / students.length) : 0,
    });
  }

  const sortedAvgs = [...lessonAvgs].sort((a, b) => b.avg - a.avg);
  const best = sortedAvgs[0];
  const worst = sortedAvgs.length > 0 ? sortedAvgs[sortedAvgs.length - 1] : null;

  const hourBuckets = new Map<number, number>();
  for (const a of attempts) {
    const h = a.createdAt.getHours();
    hourBuckets.set(h, (hourBuckets.get(h) ?? 0) + 1);
  }
  let peakLabel = "Нет данных";
  let peakSub = "Нет завершённых заданий";
  if (hourBuckets.size > 0) {
    let topH = 0;
    let topC = -1;
    for (const [h, c] of hourBuckets) {
      if (c > topC) {
        topC = c;
        topH = h;
      }
    }
    const endH = Math.min(23, topH + 2);
    peakLabel = `${String(topH).padStart(2, "0")}:00 – ${String(endH).padStart(2, "0")}:00`;
    peakSub = "По времени отправки ответов";
  }

  const insights = [
    {
      id: 1,
      title: "Лучший урок",
      value: best?.title ?? "—",
      subtitle: best ? `~${best.avg}% в среднем по классу` : "Нет уроков",
      trend: "up" as const,
    },
    {
      id: 2,
      title: "Сложная тема",
      value: worst && worst !== best ? worst.title : "—",
      subtitle:
        worst && worst.avg < 100
          ? `~${worst.avg}% в среднем — нужно повторение`
          : "Недостаточно данных",
      trend: "down" as const,
    },
    {
      id: 3,
      title: "Пик активности",
      value: peakLabel,
      subtitle: peakSub,
      trend: "up" as const,
    },
    {
      id: 4,
      title: "Рост за неделю",
      value: `${progressDelta >= 0 ? "+" : ""}${progressDelta} ответов`,
      subtitle: "Завершённые задания vs предыдущие 7 дней",
      trend: progressDelta >= 0 ? ("up" as const) : ("down" as const),
    },
  ];

  const completedAttempts = attempts.length;
  const stuckCount = studentRows.filter(
    (s) => s.progress > 0 && s.progress < 100,
  ).length;

  let hardestLessonTitle = "курсе";
  if (worst && worst.avg < 100) {
    hardestLessonTitle = `«${worst.title}»`;
  }

  const pendingTasks: Array<{
    id: number;
    type: "review" | "attention" | "task";
    title: string;
    description: string;
    priority: "high" | "medium" | "low";
    dueIn: string;
  }> = [];

  let taskId = 1;
  if (completedAttempts > 0) {
    const ruAnswer =
      completedAttempts % 10 === 1 && completedAttempts % 100 !== 11
        ? "ответ"
        : completedAttempts % 10 >= 2 &&
            completedAttempts % 10 <= 4 &&
            (completedAttempts % 100 < 10 || completedAttempts % 100 >= 20)
          ? "ответа"
          : "ответов";
    pendingTasks.push({
      id: taskId++,
      type: "review",
      title: `Проверить ${completedAttempts} ${ruAnswer}`,
      description:
        lessons[0]?.title != null
          ? `Задания по уроку «${lessons[0]!.title}» и др.`
          : "Завершённые задания учеников",
      priority: "high",
      dueIn: "Сейчас",
    });
  }
  if (stuckCount > 0) {
    pendingTasks.push({
      id: taskId++,
      type: "attention",
      title: `${stuckCount} ученик${stuckCount === 1 ? "" : stuckCount < 5 ? "а" : "ов"} нуждаются в помощи`,
      description: `Неполный прогресс по ${hardestLessonTitle}`,
      priority: "high",
      dueIn: "Сейчас",
    });
  }
  const lowLesson = worst && worst.avg < 70 ? worst : lessonAvgs[0];
  if (lowLesson) {
    pendingTasks.push({
      id: taskId++,
      type: "task",
      title: "Обновить материалы урока",
      description: `Уточнить примеры: «${lowLesson.title}»`,
      priority: "medium",
      dueIn: "Завтра",
    });
  }
  pendingTasks.push({
    id: taskId++,
    type: "task",
    title: "Запланировать еженедельный разбор",
    description: "Сводка по прогрессу класса",
    priority: "low",
    dueIn: "через 3 дня",
  });

  const payload = {
    version: 1 as const,
    teacherEmail: teacher.email,
    teacherName: displayNameFromEmail(teacher.email),
    stats,
    students: studentRows,
    insights,
    pendingTasks,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${OUT}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
