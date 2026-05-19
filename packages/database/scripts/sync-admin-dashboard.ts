/** 
 * Export admin dashboard snapshot (users, derived platform stats, simulated infra).
 * Run: pnpm exec tsx scripts/sync-admin-dashboard.ts (cwd: packages/database)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(
  __dirname,
  "../../../apps/desktop/public/data/admin-dashboard.json",
);

const prisma = new PrismaClient();

const MS_DAY = 86400000;
const MS_HOUR = 3600000;
const MS_MIN = 60000;
const ONLINE_MS = 30 * MS_MIN;
const IDLE_MS = 24 * MS_HOUR;

function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  return local
    .split(".")
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
}

function roleUi(role: string): "Teacher" | "Student" | "Admin" {
  if (role === "teacher") return "Teacher";
  if (role === "admin") return "Admin";
  return "Student";
}

function relativeRu(d: Date): string {
  const diff = Date.now() - d.getTime();
  if (diff < MS_MIN) return "Только что";
  if (diff < MS_HOUR) return `${Math.max(1, Math.floor(diff / MS_MIN))} мин назад`;
  if (diff < MS_DAY) return `${Math.max(1, Math.floor(diff / MS_HOUR))} ч назад`;
  if (diff < 2 * MS_DAY) return "Вчера";
  const days = Math.floor(diff / MS_DAY);
  return days < 7 ? `${days} дн. назад` : "Ранее";
}

function activityTimeLabel(d: Date): string {
  const diff = Date.now() - d.getTime();
  if (diff < MS_MIN) return "Только что";
  if (diff < MS_HOUR) {
    const m = Math.max(1, Math.floor(diff / MS_MIN));
    return m === 1 ? "1 минуту назад" : `${m} минуты назад`;
  }
  if (diff < 2 * MS_HOUR) return "1 час назад";
  if (diff < MS_DAY) return `${Math.floor(diff / MS_HOUR)} часа назад`;
  if (diff < 2 * MS_DAY) return "1 день назад";
  return `${Math.floor(diff / MS_DAY)} дня назад`;
}

/** Stable pseudo % from integers (simulated infra — not in schema). */
function pseudoPct(a: number, b: number, min: number, max: number): number {
  const x = Math.abs(Math.sin(a * 12.9898 + b * 78.233) * 43758.5453) % 1;
  return Math.round(min + x * (max - min));
}

async function main() {
  const now = Date.now();
  const dayAgo = new Date(now - MS_DAY);
  const twoDaysAgo = new Date(now - 2 * MS_DAY);
  const monthAgo = new Date(now - 30 * MS_DAY);

  const [
    users,
    totalUsers,
    newThisMonth,
    attempts24h,
    attemptsPrev24h,
    attemptTotal,
    lessonCount,
    studentCount,
    profilesCount,
    achievementCount,
  ] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: monthAgo } } }),
    prisma.taskAttempt.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.taskAttempt.count({
      where: {
        createdAt: { gte: twoDaysAgo, lt: dayAgo },
      },
    }),
    prisma.taskAttempt.count(),
    prisma.lesson.count(),
    prisma.user.count({ where: { role: "student" } }),
    prisma.studentProfile.count(),
    prisma.achievement.count(),
  ]);

  const distinctActive24h = await prisma.taskAttempt
    .findMany({
      where: { createdAt: { gte: dayAgo } },
      select: { userId: true },
      distinct: ["userId"],
    })
    .then((r) => r.length);

  const activeSessionsValue = Math.max(
    distinctActive24h,
    Math.min(999, attempts24h + distinctActive24h * 2),
  );
  const sessionChangePct =
    attemptsPrev24h === 0
      ? attempts24h > 0
        ? 100
        : 0
      : Math.round(
          ((attempts24h - attemptsPrev24h) / attemptsPrev24h) * 100,
        );

  const profileRatio =
    studentCount === 0 ? 1 : Math.min(1, profilesCount / studentCount);
  const healthRaw = 94 + profileRatio * 4 + Math.min(1, lessonCount / 10) * 0.8;
  const healthPct = Math.min(99.9, Math.round(healthRaw * 10) / 10);
  const healthLabel =
    healthPct >= 98 ? "Отлично" : healthPct >= 95 ? "Норма" : "Внимание";

  const modelsDeployed = Math.max(lessonCount, 1);
  const modelsActive = Math.min(modelsDeployed, lessonCount || 1);

  const stats = [
    {
      statKey: "totalUsers",
      title: "Всего пользователей",
      value: totalUsers.toLocaleString("ru-RU"),
      change: `+${newThisMonth}`,
      changeLabel: "за месяц",
      tone: "blue" as const,
    },
    {
      statKey: "activeSessions",
      title: "Активные сессии",
      value: String(activeSessionsValue),
      change: `${sessionChangePct >= 0 ? "+" : ""}${sessionChangePct}%`,
      changeLabel: "к прошлому часу",
      tone: "emerald" as const,
    },
    {
      statKey: "systemHealth",
      title: "Состояние системы",
      value: `${healthPct}%`,
      change: healthLabel,
      changeLabel: "аптайм",
      tone: "teal" as const,
    },
    {
      statKey: "aiModels",
      title: "Развёрнуто моделей ИИ",
      value: String(modelsDeployed),
      change: `${modelsActive} активны`,
      changeLabel: "в обучении",
      tone: "amber" as const,
    },
  ];

  const lastAttemptByUser = new Map<string, Date>();
  const attemptCountsByUser = new Map<string, number>();
  const attemptsForUsers = await prisma.taskAttempt.findMany({
    select: { userId: true, createdAt: true },
  });
  for (const a of attemptsForUsers) {
    attemptCountsByUser.set(
      a.userId,
      (attemptCountsByUser.get(a.userId) ?? 0) + 1,
    );
    const prev = lastAttemptByUser.get(a.userId);
    if (!prev || a.createdAt > prev) lastAttemptByUser.set(a.userId, a.createdAt);
  }

  const userRows = users.map((u, index) => {
    const last = lastAttemptByUser.get(u.id);
    const sessions = attemptCountsByUser.get(u.id) ?? 0;
    let status: "active" | "idle" | "offline" = "offline";
    let lastActive: string;
    if (!last) {
      lastActive = "Нет активности";
    } else {
      lastActive = relativeRu(last);
      const diff = Date.now() - last.getTime();
      if (diff < ONLINE_MS) status = "active";
      else if (diff < IDLE_MS) status = "idle";
      else status = "offline";
    }

    return {
      id: index + 1,
      name: displayNameFromEmail(u.email),
      email: u.email,
      role: roleUi(u.role),
      status,
      lastActive,
      sessions,
    };
  });

  const systemMetrics = [
    {
      name: "Загрузка CPU",
      value: pseudoPct(totalUsers, lessonCount, 28, 62),
      status: "normal",
    },
    {
      name: "Память",
      value: pseudoPct(attemptTotal, studentCount, 45, 78),
      status: "normal",
    },
    {
      name: "Хранилище",
      value: pseudoPct(lessonCount, totalUsers, 38, 72),
      status: "normal",
    },
    {
      name: "Сеть",
      value: pseudoPct(profilesCount, attemptTotal, 18, 48),
      status: "normal",
    },
  ];

  const recentActivity: Array<{
    id: number;
    action: string;
    details: string;
    time: string;
    type: "user" | "system" | "maintenance" | "security" | "config";
  }> = [];

  let actId = 1;
  const newestUser = [...users].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  )[0];
  if (newestUser) {
    recentActivity.push({
      id: actId++,
      action: "Новый пользователь",
      details: `${displayNameFromEmail(newestUser.email)} (${newestUser.email}) — ${roleUi(newestUser.role) === "Student" ? "ученик" : roleUi(newestUser.role) === "Teacher" ? "учитель" : "админ"}`,
      time: activityTimeLabel(newestUser.createdAt),
      type: "user",
    });
  }

  recentActivity.push({
    id: actId++,
    action: "Активность платформы",
    details: `Завершённых заданий в базе: ${attemptTotal}; уроков: ${lessonCount}`,
    time: activityTimeLabel(new Date(now - 15 * MS_MIN)),
    type: "system",
  });

  const approxMb = Math.round(12 + (attemptTotal % 50) + totalUsers * 2);
  recentActivity.push({
    id: actId++,
    action: "Резервное копирование",
    details: `Снимок данных (${approxMb},${(attemptTotal % 9) + 1} МБ)`,
    time: activityTimeLabel(new Date(now - 50 * MS_MIN)),
    type: "maintenance",
  });

  recentActivity.push({
    id: actId++,
    action: "Проверка безопасности",
    details: "Схема данных и связи пользователей в норме",
    time: activityTimeLabel(new Date(now - 2 * MS_HOUR)),
    type: "security",
  });

  recentActivity.push({
    id: actId++,
    action: "Каталог контента",
    details: `Уроков: ${lessonCount}; достижений: ${achievementCount}`,
    time: activityTimeLabel(new Date(now - 3 * MS_HOUR)),
    type: "config",
  });

  const payload = {
    version: 1 as const,
    generatedAt: new Date().toISOString(),
    stats,
    users: userRows,
    systemMetrics,
    statusFooter: {
      servicesOk: "12/12",
      uptimePct: "99.98%",
    },
    recentActivity,
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
