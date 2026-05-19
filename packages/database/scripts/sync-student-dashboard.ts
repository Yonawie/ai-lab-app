/**
 * Export one seeded student (profile, lessons, achievements) to JSON for the desktop app.
 * Run from packages/database: pnpm exec tsx scripts/sync-student-dashboard.ts
 * Needs DATABASE_URL, prisma generate, migrate + seed.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";

import { buildLessonSnapshotContent } from "../src/student-lesson-content";
import { taskToSnapshotTask } from "../src/student-dashboard-task-snapshot";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(
  __dirname,
  "../../../apps/desktop/public/data/student-dashboard.json",
);

const STUDENT_EMAIL = "alex.student@school.ru";

const prisma = new PrismaClient();

function lessonProgress(
  taskIds: string[],
  completed: Set<string>,
): number {
  if (taskIds.length === 0) return 0;
  const n = taskIds.filter((id) => completed.has(id)).length;
  return Math.round((n / taskIds.length) * 100);
}

function relativeRu(d: Date): string {
  const diff = Date.now() - d.getTime();
  const day = 86400000;
  if (diff < day) return "Сегодня";
  if (diff < 2 * day) return "Вчера";
  const days = Math.floor(diff / day);
  return days < 7 ? `${days} дн. назад` : "Ранее";
}

function iconKey(title: string): "star" | "flame" | "target" {
  if (title.includes("Исследователь")) return "target";
  if (title.includes("Серийный")) return "flame";
  return "star";
}

function achRank(title: string): number {
  if (title.includes("Быстрый")) return 0;
  if (title.includes("Серийный")) return 1;
  if (title.includes("Исследователь")) return 2;
  return 99;
}

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: STUDENT_EMAIL, role: "student" },
    include: {
      studentProfile: true,
      taskAttempts: {
        where: { completedAt: { not: null } },
        select: { taskId: true },
      },
      userAchievements: { include: { achievement: true } },
    },
  });

  if (!user?.studentProfile) {
    console.error(`No student+profile for ${STUDENT_EMAIL}. Seed the DB first.`);
    process.exit(1);
  }

  const lessons = await prisma.lesson.findMany({
    include: { tasks: { orderBy: { id: "asc" } } },
    orderBy: { id: "asc" },
  });

  const achievements = (await prisma.achievement.findMany()).sort(
    (a, b) => achRank(a.title) - achRank(b.title),
  );

  const doneTasks = new Set(user.taskAttempts.map((a) => a.taskId));

  const lessonRows = lessons.map((l) => {
    const { content, contentSections } = buildLessonSnapshotContent(
      l.title,
      l.description,
    );
    return {
      id: l.id,
      title: l.title,
      description: l.description,
      progress: lessonProgress(
        l.tasks.map((t) => t.id),
        doneTasks,
      ),
      durationLabel: "—",
      categoryLabel: "Урок",
      content,
      contentSections,
      tasks: l.tasks.map((t) => taskToSnapshotTask(t)),
    };
  });

  const total = lessonRows.length;
  const fullyDone = lessonRows.filter((r) => r.progress === 100).length;

  /** Must match stats.streak — used to decide «Серийный рекорд». */
  const streakDays = 14;

  const achievementRows = achievements.map((a) => {
    const ua = user.userAchievements.find((x) => x.achievementId === a.id);

    if (a.title.includes("Быстрый")) {
      const earned = fullyDone >= 5;
      return {
        id: a.id,
        title: a.title,
        description: a.description,
        iconKey: iconKey(a.title),
        earned,
        earnedAtLabel: earned ? (ua ? relativeRu(ua.earnedAt) : "Сегодня") : null,
        progressCurrent: null,
        progressTotal: null,
      };
    }

    if (a.title.includes("Серийный")) {
      const earned = streakDays >= 14;
      return {
        id: a.id,
        title: a.title,
        description: a.description,
        iconKey: iconKey(a.title),
        earned,
        earnedAtLabel: earned ? (ua ? relativeRu(ua.earnedAt) : "Сегодня") : null,
        progressCurrent: null,
        progressTotal: null,
      };
    }

    if (a.title.includes("Исследователь")) {
      return {
        id: a.id,
        title: a.title,
        description: a.description,
        iconKey: iconKey(a.title),
        earned: false,
        earnedAtLabel: null,
        progressCurrent: 2,
        progressTotal: 5,
      };
    }

    const earned = Boolean(ua);
    return {
      id: a.id,
      title: a.title,
      description: a.description,
      iconKey: iconKey(a.title),
      earned,
      earnedAtLabel: earned && ua ? relativeRu(ua.earnedAt) : null,
      progressCurrent: null,
      progressTotal: null,
    };
  });

  const displayName =
    user.email === "alex.student@school.ru"
      ? "Алекс"
      : (user.email.split("@")[0]?.split(".")[0] ?? "Ученик").replace(
          /^(.)/,
          (c) => c.toUpperCase(),
        );

  const level = user.studentProfile.level;
  const levelSub =
    level >= 12 ? "Продвинутый уровень" : level >= 8 ? "Средний уровень" : "Начинающий";

  const payload = {
    version: 1 as const,
    displayName,
    userEmail: user.email,
    stats: {
      level: { value: String(level), subtext: levelSub },
      xp: {
        value: user.studentProfile.xp.toLocaleString("ru-RU"),
        subtext: "+120 за неделю",
      },
      lessonsDone: {
        value: String(fullyDone),
        subtext: total > 0 ? `из ${total} в каталоге` : "пока нет уроков",
      },
      streak: { value: String(streakDays), subtext: "дней подряд" },
    },
    lessons: lessonRows,
    achievements: achievementRows,
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
