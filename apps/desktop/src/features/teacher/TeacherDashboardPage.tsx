import type { ComponentType, FormEvent, SVGProps } from "react";
import { useCallback, useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useAuth } from "@/shared/auth-context";
import {
  createStudentForTeacher,
  listStudentsForTeacher,
  type TeacherLinkedStudent,
} from "@/shared/teacher-roster-tauri";
import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  BookOpenIcon,
  AlertCircleIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  ClockIcon,
  MoreHorizontalIcon,
  TrendingUpIcon,
  UserCheckIcon,
  UsersIcon,
} from "./TeacherDashboardIcons";
import styles from "./TeacherDashboardPage.module.css";

type DashboardIcon = ComponentType<SVGProps<SVGSVGElement>>;

type StatId = "students" | "active" | "progress" | "lessons";
type StatTone = "blue" | "emerald" | "accent" | "amber";

type TeacherStatJson = {
  id: string;
  title: string;
  value: string;
  change: string;
  trend: "up" | "down";
  tone: string;
};

type TeacherStudentJson = {
  id: number;
  name: string;
  avatar: string;
  initials: string;
  level: number;
  progress: number;
  status: "online" | "offline";
  lastActive: string;
  lessonsCompleted: number;
};

type TeacherInsightJson = {
  id: number;
  title: string;
  value: string;
  subtitle: string;
  trend: "up" | "down";
};

type TeacherTaskJson = {
  id: number;
  type: "review" | "attention" | "task";
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  dueIn: string;
};

type TeacherDashboardPayload = {
  version: 1;
  teacherEmail: string;
  teacherName: string;
  stats: TeacherStatJson[];
  students: TeacherStudentJson[];
  insights: TeacherInsightJson[];
  pendingTasks: TeacherTaskJson[];
};

const DATA_URL = "/data/teacher-dashboard.json";

const STAT_ORDER: StatId[] = [
  "students",
  "active",
  "progress",
  "lessons",
];

const STAT_ICONS: Record<StatId, DashboardIcon> = {
  students: UsersIcon,
  active: UserCheckIcon,
  progress: TrendingUpIcon,
  lessons: BookOpenIcon,
};

const DEFAULT_TONE: Record<StatId, StatTone> = {
  students: "blue",
  active: "emerald",
  progress: "accent",
  lessons: "amber",
};

function normalizeStatTone(tone: string, id: StatId): StatTone {
  if (tone === "blue" || tone === "emerald" || tone === "accent" || tone === "amber") {
    return tone;
  }
  return DEFAULT_TONE[id];
}

function isStatId(id: string): id is StatId {
  return id === "students" || id === "active" || id === "progress" || id === "lessons";
}

async function loadTeacherDashboardData(): Promise<TeacherDashboardPayload | null> {
  try {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    if (!isTeacherPayload(json)) return null;
    return json;
  } catch {
    return null;
  }
}

function isTeacherPayload(x: unknown): x is TeacherDashboardPayload {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  if (o.version !== 1) return false;
  if (!Array.isArray(o.stats) || !Array.isArray(o.students)) return false;
  if (!Array.isArray(o.insights) || !Array.isArray(o.pendingTasks)) return false;
  if (typeof o.teacherEmail !== "string" || typeof o.teacherName !== "string") {
    return false;
  }
  return true;
}

const FALLBACK_PAYLOAD: TeacherDashboardPayload = {
  version: 1,
  teacherEmail: "",
  teacherName: "",
  stats: [
    {
      id: "students",
      title: "Всего учеников",
      value: "156",
      change: "+12",
      trend: "up",
      tone: "blue",
    },
    {
      id: "active",
      title: "Активны сегодня",
      value: "89",
      change: "+23",
      trend: "up",
      tone: "emerald",
    },
    {
      id: "progress",
      title: "Средний прогресс",
      value: "73%",
      change: "+5%",
      trend: "up",
      tone: "accent",
    },
    {
      id: "lessons",
      title: "Назначенных уроков",
      value: "24",
      change: "-2",
      trend: "down",
      tone: "amber",
    },
  ],
  students: [
    {
      id: 1,
      name: "Emma Wilson",
      avatar: "",
      initials: "EW",
      level: 12,
      progress: 85,
      status: "online",
      lastActive: "Сейчас",
      lessonsCompleted: 18,
    },
    {
      id: 2,
      name: "James Chen",
      avatar: "",
      initials: "JC",
      level: 10,
      progress: 72,
      status: "online",
      lastActive: "5 мин назад",
      lessonsCompleted: 15,
    },
    {
      id: 3,
      name: "Sofia Martinez",
      avatar: "",
      initials: "SM",
      level: 14,
      progress: 91,
      status: "offline",
      lastActive: "2 ч назад",
      lessonsCompleted: 22,
    },
    {
      id: 4,
      name: "Lucas Johnson",
      avatar: "",
      initials: "LJ",
      level: 8,
      progress: 58,
      status: "online",
      lastActive: "Сейчас",
      lessonsCompleted: 11,
    },
    {
      id: 5,
      name: "Olivia Brown",
      avatar: "",
      initials: "OB",
      level: 11,
      progress: 79,
      status: "offline",
      lastActive: "1 дн. назад",
      lessonsCompleted: 16,
    },
  ],
  insights: [
    {
      id: 1,
      title: "Лучший урок",
      value: "Основы нейросетей",
      subtitle: "92% завершили",
      trend: "up",
    },
    {
      id: 2,
      title: "Сложная тема",
      value: "Обратное распространение",
      subtitle: "45% нуждаются в повторении",
      trend: "down",
    },
    {
      id: 3,
      title: "Пик активности",
      value: "15:00 – 17:00",
      subtitle: "Часы максимальной вовлечённости",
      trend: "up",
    },
    {
      id: 4,
      title: "Рост за неделю",
      value: "+18 уроков",
      subtitle: "К прошлой неделе",
      trend: "up",
    },
  ],
  pendingTasks: [
    {
      id: 1,
      type: "review",
      title: "Проверить 5 работ учеников",
      description: "Тест «Основы машинного обучения»",
      priority: "high",
      dueIn: "через 2 ч",
    },
    {
      id: 2,
      type: "attention",
      title: "3 ученика нуждаются в помощи",
      description: "Застряли на уроке «Архитектура CNN»",
      priority: "high",
      dueIn: "Сейчас",
    },
    {
      id: 3,
      type: "task",
      title: "Обновить материалы урока",
      description: "Добавить примеры в раздел НЛП",
      priority: "medium",
      dueIn: "Завтра",
    },
    {
      id: 4,
      type: "task",
      title: "Запланировать еженедельный разбор",
      description: "Повторение по главе 4",
      priority: "low",
      dueIn: "через 3 дня",
    },
  ],
};

function mergeStats(payload: TeacherDashboardPayload): Array<
  TeacherStatJson & { icon: DashboardIcon; tone: StatTone }
> {
  const byId = new Map(payload.stats.map((s) => [s.id, s]));
  return STAT_ORDER.map((id) => {
    const raw = byId.get(id) ?? FALLBACK_PAYLOAD.stats.find((s) => s.id === id)!;
    const sid = isStatId(raw.id) ? raw.id : id;
    const tone = normalizeStatTone(raw.tone, sid);
    return {
      ...raw,
      id: sid,
      icon: STAT_ICONS[sid],
      tone,
    };
  });
}

const statToneWrap: Record<StatTone, string> = {
  blue: styles.statIconWrap_blue,
  emerald: styles.statIconWrap_emerald,
  accent: styles.statIconWrap_accent,
  amber: styles.statIconWrap_amber,
};

function ProgressBar({ value }: { value: number }) {
  const v = Math.round(Math.min(100, Math.max(0, value)));
  return (
    <div
      className={styles.progressTrack}
      role="progressbar"
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={styles.progressFill} style={{ width: `${v}%` }} />
    </div>
  );
}

function taskIconBoxClass(priority: TeacherTaskJson["priority"]) {
  if (priority === "high") return `${styles.taskIconBox} ${styles.taskIconHigh}`;
  if (priority === "medium") return `${styles.taskIconBox} ${styles.taskIconMedium}`;
  return `${styles.taskIconBox} ${styles.taskIconLow}`;
}

function TeacherMyStudentsRoster() {
  const { userEmail, userId } = useAuth();
  const [students, setStudents] = useState<TeacherLinkedStudent[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formEmail, setFormEmail] = useState("");
  const [formName, setFormName] = useState("");
  const [formGroup, setFormGroup] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    const email = (userEmail ?? "").trim();
    if (!email || !isTauri()) {
      setStudents([]);
      return;
    }
    setLoadError(null);
    try {
      const list = await listStudentsForTeacher(email, userId);
      setStudents(list);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, [userEmail, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleAddStudent(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const email = (userEmail ?? "").trim();
    if (!email) {
      setFormError("Нет email учителя в сессии. Войдите снова.");
      return;
    }
    if (!isTauri()) {
      setFormError("Добавление учеников доступно только в приложении AI Lab.");
      return;
    }
    const se = formEmail.trim();
    if (!se) {
      setFormError("Укажите email ученика.");
      return;
    }
    setSubmitting(true);
    try {
      await createStudentForTeacher({
        teacherEmail: email,
        teacherId: userId,
        studentEmail: se,
        studentDisplayName: formName.trim() || null,
        groupName: formGroup.trim() || null,
      });
      setFormEmail("");
      setFormName("");
      setFormGroup("");
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <article className={styles.rosterSection}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>Мои ученики</h2>
      </div>
      <div className={styles.cardBody}>
        {!isTauri() ? (
          <p className={styles.rosterEmpty}>
            Список и добавление учеников доступны в приложении AI Lab.
          </p>
        ) : (
          <>
            <form className={styles.rosterForm} onSubmit={handleAddStudent}>
              <div className={styles.rosterFormRow}>
                <div className={styles.rosterField}>
                  <label className={styles.rosterLabel} htmlFor="roster-student-email">
                    Email ученика
                  </label>
                  <input
                    id="roster-student-email"
                    className={styles.rosterInput}
                    type="email"
                    autoComplete="off"
                    value={formEmail}
                    onChange={(ev) => setFormEmail(ev.target.value)}
                    disabled={submitting}
                    required
                  />
                </div>
                <div className={styles.rosterField}>
                  <label className={styles.rosterLabel} htmlFor="roster-student-name">
                    Имя ученика (необязательно)
                  </label>
                  <input
                    id="roster-student-name"
                    className={styles.rosterInput}
                    type="text"
                    autoComplete="name"
                    value={formName}
                    onChange={(ev) => setFormName(ev.target.value)}
                    disabled={submitting}
                  />
                </div>
                <div className={styles.rosterField}>
                  <label className={styles.rosterLabel} htmlFor="roster-group">
                    Группа / класс (необязательно)
                  </label>
                  <input
                    id="roster-group"
                    className={styles.rosterInput}
                    type="text"
                    value={formGroup}
                    onChange={(ev) => setFormGroup(ev.target.value)}
                    disabled={submitting}
                  />
                </div>
                <button
                  type="submit"
                  className={styles.btnPrimary}
                  disabled={submitting}
                  style={{ alignSelf: "stretch" }}
                >
                  {submitting ? "Сохранение…" : "Добавить / привязать"}
                </button>
              </div>
              {formError ? <p className={styles.rosterError}>{formError}</p> : null}
            </form>
            {loadError ? <p className={styles.rosterError}>{loadError}</p> : null}
            {students.length === 0 && !loadError ? (
              <p className={styles.rosterEmpty}>
                Пока нет привязанных учеников. Добавьте ученика по email выше.
              </p>
            ) : (
              <ul className={styles.rosterList}>
                {students.map((s) => (
                  <li key={s.studentId} className={styles.rosterListItem}>
                    <span className={styles.rosterEmail}>{s.email}</span>
                    <span className={styles.rosterMeta}>
                      {[s.displayName, s.groupName].filter(Boolean).join(" · ") ||
                        "—"}
                    </span>
                    <span className={styles.rosterMeta}>{s.linkedAt}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </article>
  );
}

function TaskGlyph({ task }: { task: TeacherTaskJson }) {
  const high = task.priority === "high";
  const alertTone = high ? styles.iconHigh : styles.iconMed;
  if (task.type === "attention") {
    return (
      <span className={alertTone}>
        <AlertCircleIcon />
      </span>
    );
  }
  if (task.type === "review") {
    return (
      <span className={alertTone}>
        <CheckCircle2Icon />
      </span>
    );
  }
  return (
    <span className={styles.iconMuted}>
      <ClockIcon />
    </span>
  );
}

export function TeacherDashboardPage() {
  const [payload, setPayload] = useState<TeacherDashboardPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadTeacherDashboardData().then((data) => {
      if (!cancelled) setPayload(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const data = payload ?? FALLBACK_PAYLOAD;
  const stats = mergeStats(data);
  const students = data.students.length > 0 ? data.students : FALLBACK_PAYLOAD.students;
  const insights =
    data.insights.length > 0 ? data.insights : FALLBACK_PAYLOAD.insights;
  const pendingTasks =
    data.pendingTasks.length > 0 ? data.pendingTasks : FALLBACK_PAYLOAD.pendingTasks;

  return (
    <div className={styles.page}>
      <div className={styles.gradients} aria-hidden>
        <div className={styles.blob1} />
        <div className={styles.blob2} />
      </div>

      <div className={styles.inner}>
        <div className={styles.topBar}>
          <div className={styles.headerText}>
          <h1 className="text-3xl font-bold text-foreground">
  Панель преподавателя{data?.teacherName ? ` — ${data.teacherName}` : ""}
</h1>
            <p className={styles.subtitle}>
              Следите за прогрессом учеников и управляйте уроками
            </p>
          </div>
          <button type="button" className={styles.btnPrimary}>
            Создать урок
          </button>
        </div>

        <TeacherMyStudentsRoster />

        <section className={styles.statsGrid} aria-label="Сводная статистика">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.id} className={styles.statCard}>
                <div className={styles.statTop}>
                  <div
                    className={`${styles.statIconWrap} ${statToneWrap[stat.tone]}`}
                  >
                    <Icon />
                  </div>
                  <div
                    className={`${styles.trend} ${stat.trend === "up" ? styles.trendUp : styles.trendDown}`}
                  >
                    {stat.trend === "up" ? (
                      <ArrowUpRightIcon />
                    ) : (
                      <ArrowDownRightIcon />
                    )}
                    <span>{stat.change}</span>
                  </div>
                </div>
                <p className={styles.statValue}>{stat.value}</p>
                <p className={styles.statTitle}>{stat.title}</p>
              </div>
            );
          })}
        </section>

        <div className={styles.mainGrid}>
          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Обзор класса</h2>
              <button type="button" className={styles.btnGhost}>
                Все ученики
                <ChevronRightIcon />
              </button>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.tableScroll}>
                <div className={styles.tableInner}>
                  <div className={styles.tableHeader}>
                    <div className={styles.thStudent}>Ученик</div>
                    <div className={styles.thLevel}>Уровень</div>
                    <div className={styles.thProgress}>Прогресс</div>
                    <div className={styles.thLessons}>Уроки</div>
                    <div className={styles.thActions} aria-hidden />
                  </div>
                  {students.map((student) => (
                    <div key={student.id} className={styles.row}>
                      <div className={styles.cellStudent}>
                        <div className={styles.avatarWrap}>
                          <div className={styles.avatar}>
                            {student.avatar ? (
                              <img
                                src={student.avatar}
                                alt=""
                                className={styles.avatarImg}
                              />
                            ) : (
                              <span className={styles.avatarFallback}>
                                {student.initials}
                              </span>
                            )}
                          </div>
                          <span
                            className={`${styles.statusDot} ${student.status === "online" ? styles.statusOnline : styles.statusOffline}`}
                            aria-label={
                              student.status === "online"
                                ? "В сети"
                                : "Не в сети"
                            }
                          />
                        </div>
                        <div>
                          <p className={styles.studentName}>{student.name}</p>
                          <p className={styles.studentMeta}>
                            {student.lastActive}
                          </p>
                        </div>
                      </div>
                      <div className={styles.cellLevel}>
                        <span className={styles.badge}>
                          Ур. {student.level}
                        </span>
                      </div>
                      <div className={styles.cellProgress}>
                        <div className={styles.progressRow}>
                          <ProgressBar value={student.progress} />
                          <span className={styles.progressPct}>
                            {student.progress}%
                          </span>
                        </div>
                      </div>
                      <div className={styles.cellLessons}>
                        {student.lessonsCompleted}
                      </div>
                      <div className={styles.cellMenu}>
                        <button
                          type="button"
                          className={styles.rowMenuBtn}
                          aria-label={`Действия: ${student.name}`}
                        >
                          <MoreHorizontalIcon />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </article>

          <article className={styles.card}>
            <div className={`${styles.cardHeader} ${styles.cardHeaderTight}`}>
              <h2 className={styles.cardTitle}>Аналитика</h2>
            </div>
            <div className={styles.cardBodyInsights}>
              {insights.map((insight) => (
                <div key={insight.id} className={styles.insightItem}>
                  <div className={styles.insightTop}>
                    <p className={styles.insightLabel}>{insight.title}</p>
                    {insight.trend === "up" ? (
                      <span className={styles.trendIconUp}>
                        <ArrowUpRightIcon />
                      </span>
                    ) : (
                      <span className={styles.trendIconDown}>
                        <ArrowDownRightIcon />
                      </span>
                    )}
                  </div>
                  <p className={styles.insightValue}>{insight.value}</p>
                  <p className={styles.insightSub}>{insight.subtitle}</p>
                </div>
              ))}
            </div>
          </article>
        </div>

        <article className={styles.card}>
          <div className={styles.tasksCardHeader}>
            <h2 className={styles.cardTitle}>Требуют внимания</h2>
            <span className={`${styles.badge} ${styles.badgePending}`}>
              {pendingTasks.length} в очереди
            </span>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.tasksGrid}>
              {pendingTasks.map((task) => (
                <div key={task.id} className={styles.taskCard}>
                  <div className={styles.taskTop}>
                    <div className={taskIconBoxClass(task.priority)}>
                      <TaskGlyph task={task} />
                    </div>
                    <span className={styles.taskDue}>{task.dueIn}</span>
                  </div>
                  <h4 className={styles.taskTitle}>{task.title}</h4>
                  <p className={styles.taskDesc}>{task.description}</p>
                </div>
              ))}
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}
