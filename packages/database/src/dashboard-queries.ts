import type { PrismaClient } from "@prisma/client";

/**
 * Read-model helpers for dashboards. Pass a `PrismaClient` instance (e.g. `prisma` from `./client`).
 * Intended for Node/Tauri backend — not for direct use in the React renderer.
 */

export async function getStudentDashboardBundle(db: PrismaClient, userId: string) {
  return db.user.findUnique({
    where: { id: userId, role: "student" },
    include: {
      studentProfile: true,
      taskAttempts: {
        include: { task: { include: { lesson: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      userAchievements: {
        include: { achievement: true },
        orderBy: { earnedAt: "desc" },
      },
    },
  });
}

export async function listLessonsWithTasks(db: PrismaClient) {
  return db.lesson.findMany({
    include: { tasks: { orderBy: { id: "asc" } } },
    orderBy: { id: "asc" },
  });
}

export async function listAchievementCatalog(db: PrismaClient) {
  return db.achievement.findMany({ orderBy: { id: "asc" } });
}

export async function listStudentsWithProfiles(db: PrismaClient) {
  return db.user.findMany({
    where: { role: "student" },
    include: { studentProfile: true },
    orderBy: { email: "asc" },
  });
}

export async function listTeachers(db: PrismaClient) {
  return db.user.findMany({
    where: { role: "teacher" },
    orderBy: { email: "asc" },
  });
}

export async function listUsersForAdmin(db: PrismaClient) {
  return db.user.findMany({
    include: { studentProfile: true },
    orderBy: [{ role: "asc" }, { email: "asc" }],
  });
}

export async function getPlatformStats(db: PrismaClient) {
  const [userCount, studentCount, teacherCount, lessonCount, attemptCount] =
    await Promise.all([
      db.user.count(),
      db.user.count({ where: { role: "student" } }),
      db.user.count({ where: { role: "teacher" } }),
      db.lesson.count(),
      db.taskAttempt.count(),
    ]);

  return {
    userCount,
    studentCount,
    teacherCount,
    lessonCount,
    attemptCount,
  };
}
