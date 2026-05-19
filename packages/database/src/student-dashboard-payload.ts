import type { PrismaClient } from "@prisma/client";
import { listLessonsWithTasks } from "./dashboard-queries";
import { buildLessonSnapshotContent } from "./student-lesson-content";
import type { AchievementIconKey, StudentDashboardPayload } from "./student-dashboard-types";
import { taskToSnapshotTask } from "./student-dashboard-task-snapshot";

export type { AchievementIconKey, StudentDashboardPayload } from "./student-dashboard-types";

function iconKeyForAchievementTitle(title: string): AchievementIconKey {
  if (title.includes("Исследователь")) return "target";
  if (title.includes("Серийный")) return "flame";
  return "star";
}

function levelSubtext(level: number): string {
  if (level >= 12) return "Продвинутый уровень";
  if (level >= 8) return "Средний уровень";
  return "Начинающий";
}

function formatXp(n: number): string {
  return n.toLocaleString("ru-RU");
}

function formatRelativeRu(d: Date): string {
  const now = Date.now();
  const diff = now - d.getTime();
  const day = 86400000;
  if (diff < day) return "Сегодня";
  if (diff < 2 * day) return "Вчера";
  const days = Math.floor(diff / day);
  if (days < 7) return `${days} дн. назад`;
  return "Ранее";
}

function displayNameFromEmail(email: string): string {
  if (email === "alex.student@school.ru") return "Алекс";
  const local = email.split("@")[0] ?? "ученик";
  const part = local.split(".")[0] ?? local;
  if (!part) return "Ученик";
  return part.charAt(0).toUpperCase() + part.slice(1);
}

function lessonProgressPercent(
  lessonTaskIds: string[],
  completedTaskIds: Set<string>,
): number {
  if (lessonTaskIds.length === 0) return 0;
  const done = lessonTaskIds.filter((id) => completedTaskIds.has(id)).length;
  return Math.round((done / lessonTaskIds.length) * 100);
}

const DURATION_PLACEHOLDER = "—";
const CATEGORY_PLACEHOLDER = "Урок";

/**
 * Builds a JSON-serializable payload for one student (by email).
 */
export async function buildStudentDashboardPayload(
  db: PrismaClient,
  studentEmail: string,
): Promise<StudentDashboardPayload | null> {
  const user = await db.user.findUnique({
    where: { email: studentEmail, role: "student" },
    include: {
      studentProfile: true,
      taskAttempts: {
        where: { completedAt: { not: null } },
        select: { taskId: true },
      },
      userAchievements: {
        include: { achievement: true },
        orderBy: { earnedAt: "desc" },
      },
    },
  });

  if (!user || !user.studentProfile) return null;

  const lessons = await listLessonsWithTasks(db);
  const achievementsRaw = await db.achievement.findMany();
  const achievements = [...achievementsRaw].sort((a, b) => {
    const rank = (t: string) => {
      if (t.includes("Быстрый")) return 0;
      if (t.includes("Серийный")) return 1;
      if (t.includes("Исследователь")) return 2;
      return 99;
    };
    return rank(a.title) - rank(b.title);
  });

  const completedTaskIds = new Set(user.taskAttempts.map((a) => a.taskId));

  const lessonRows = lessons.map((lesson) => {
    const taskIds = lesson.tasks.map((t) => t.id);
    const { content, contentSections } = buildLessonSnapshotContent(
      lesson.title,
      lesson.description,
    );
    return {
      id: lesson.id,
      title: lesson.title,
      description: lesson.description,
      progress: lessonProgressPercent(taskIds, completedTaskIds),
      durationLabel: DURATION_PLACEHOLDER,
      categoryLabel: CATEGORY_PLACEHOLDER,
      content,
      contentSections,
      tasks: lesson.tasks.map((t) => taskToSnapshotTask(t)),
    };
  });

  const totalLessons = lessonRows.length;
  const fullyDone = lessonRows.filter((l) => l.progress === 100).length;

  const achievementRows = achievements.map((a) => {
    const earned = user.userAchievements.find(
      (ua) => ua.achievementId === a.id,
    );
    const isExplorer = a.title.includes("Исследователь");
    return {
      id: a.id,
      title: a.title,
      description: a.description,
      iconKey: iconKeyForAchievementTitle(a.title),
      earned: Boolean(earned),
      earnedAtLabel: earned ? formatRelativeRu(earned.earnedAt) : null,
      progressCurrent: earned ? null : isExplorer ? 2 : null,
      progressTotal: earned ? null : isExplorer ? 5 : null,
    };
  });

  return {
    version: 1,
    displayName: displayNameFromEmail(user.email),
    userEmail: user.email,
    stats: {
      level: {
        value: String(user.studentProfile.level),
        subtext: levelSubtext(user.studentProfile.level),
      },
      xp: {
        value: formatXp(user.studentProfile.xp),
        subtext: "+120 за неделю",
      },
      lessonsDone: {
        value: String(fullyDone),
        subtext:
          totalLessons > 0 ? `из ${totalLessons} в каталоге` : "пока нет уроков",
      },
      streak: {
        value: "14",
        subtext: "дней подряд",
      },
    },
    lessons: lessonRows,
    achievements: achievementRows,
  };
}
