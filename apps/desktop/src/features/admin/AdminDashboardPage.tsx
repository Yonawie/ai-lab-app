import type { ComponentType, MouseEvent, SVGProps } from "react";
import { useEffect, useState } from "react";
import {
  ActivityIcon,
  BrainIcon,
  CheckCircle2Icon,
  ClockIcon,
  CpuIcon,
  DatabaseIcon,
  EditIcon,
  EyeIcon,
  HardDriveIcon,
  MoreHorizontalIcon,
  RefreshCwIcon,
  ServerIcon,
  SettingsIcon,
  ShieldIcon,
  Trash2Icon,
  UserPlusIcon,
  UsersIcon,
  WifiIcon,
} from "./AdminDashboardIcons";
import styles from "./AdminDashboardPage.module.css";

type DashboardIcon = ComponentType<SVGProps<SVGSVGElement>>;

type StatKey =
  | "totalUsers"
  | "activeSessions"
  | "systemHealth"
  | "aiModels";
type StatTone = "blue" | "emerald" | "teal" | "amber";

type AdminStatJson = {
  statKey: string;
  title: string;
  value: string;
  change: string;
  changeLabel: string;
  tone: string;
};

type AdminUserJson = {
  id: number;
  name: string;
  email: string;
  role: "Teacher" | "Student" | "Admin";
  status: "active" | "idle" | "offline";
  lastActive: string;
  sessions: number;
};

type AdminMetricJson = {
  name: string;
  value: number;
  status: string;
};

type ActivityType = "user" | "system" | "maintenance" | "security" | "config";

type AdminActivityJson = {
  id: number;
  action: string;
  details: string;
  time: string;
  type: ActivityType;
};

type AdminDashboardPayload = {
  version: 1;
  generatedAt?: string;
  stats: AdminStatJson[];
  users: AdminUserJson[];
  systemMetrics: AdminMetricJson[];
  statusFooter: { servicesOk: string; uptimePct: string };
  recentActivity: AdminActivityJson[];
};

const DATA_URL = "/data/admin-dashboard.json";

const ROLE_LABEL: Record<string, string> = {
  Teacher: "Учитель",
  Student: "Ученик",
  Admin: "Администратор",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Активен",
  idle: "Ожидание",
  offline: "Офлайн",
};

function statusAriaLabel(status: string) {
  const map: Record<string, string> = {
    active: "Статус: активен",
    idle: "Статус: ожидание",
    offline: "Статус: офлайн",
  };
  return map[status] ?? `Статус: ${status}`;
}

function sessionCountLabel(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return `${n} сессий`;
  if (mod10 === 1) return `${n} сессия`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} сессии`;
  return `${n} сессий`;
}

const STAT_ORDER: StatKey[] = [
  "totalUsers",
  "activeSessions",
  "systemHealth",
  "aiModels",
];

const STAT_ICONS: Record<StatKey, DashboardIcon> = {
  totalUsers: UsersIcon,
  activeSessions: ActivityIcon,
  systemHealth: ServerIcon,
  aiModels: BrainIcon,
};

const DEFAULT_STAT_TONE: Record<StatKey, StatTone> = {
  totalUsers: "blue",
  activeSessions: "emerald",
  systemHealth: "teal",
  aiModels: "amber",
};

function isStatKey(k: string): k is StatKey {
  return (
    k === "totalUsers" ||
    k === "activeSessions" ||
    k === "systemHealth" ||
    k === "aiModels"
  );
}

function normalizeStatTone(tone: string, key: StatKey): StatTone {
  if (
    tone === "blue" ||
    tone === "emerald" ||
    tone === "teal" ||
    tone === "amber"
  ) {
    return tone;
  }
  return DEFAULT_STAT_TONE[key];
}

const METRIC_ICONS: Record<string, DashboardIcon> = {
  "Загрузка CPU": CpuIcon,
  Память: DatabaseIcon,
  Хранилище: HardDriveIcon,
  Сеть: WifiIcon,
};

const ACTIVITY_ICONS: Record<ActivityType, DashboardIcon> = {
  user: UserPlusIcon,
  system: BrainIcon,
  maintenance: RefreshCwIcon,
  security: ShieldIcon,
  config: SettingsIcon,
};

async function loadAdminDashboardData(): Promise<AdminDashboardPayload | null> {
  try {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    if (!isAdminPayload(json)) return null;
    return json;
  } catch {
    return null;
  }
}

function isAdminPayload(x: unknown): x is AdminDashboardPayload {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  if (o.version !== 1) return false;
  if (!Array.isArray(o.stats) || !Array.isArray(o.users)) return false;
  if (!Array.isArray(o.systemMetrics) || !Array.isArray(o.recentActivity)) {
    return false;
  }
  const sf = o.statusFooter;
  if (
    typeof sf !== "object" ||
    sf === null ||
    typeof (sf as { servicesOk?: unknown }).servicesOk !== "string" ||
    typeof (sf as { uptimePct?: unknown }).uptimePct !== "string"
  ) {
    return false;
  }
  return true;
}

const FALLBACK_PAYLOAD: AdminDashboardPayload = {
  version: 1,
  stats: [
    {
      statKey: "totalUsers",
      title: "Всего пользователей",
      value: "2,847",
      change: "+124",
      changeLabel: "за месяц",
      tone: "blue",
    },
    {
      statKey: "activeSessions",
      title: "Активные сессии",
      value: "312",
      change: "+18%",
      changeLabel: "к прошлому часу",
      tone: "emerald",
    },
    {
      statKey: "systemHealth",
      title: "Состояние системы",
      value: "98.7%",
      change: "Отлично",
      changeLabel: "аптайм",
      tone: "teal",
    },
    {
      statKey: "aiModels",
      title: "Развёрнуто моделей ИИ",
      value: "12",
      change: "3 активны",
      changeLabel: "в обучении",
      tone: "amber",
    },
  ],
  users: [
    {
      id: 1,
      name: "Sarah Johnson",
      email: "sarah.j@school.edu",
      role: "Teacher",
      status: "active",
      lastActive: "2 мин назад",
      sessions: 3,
    },
    {
      id: 2,
      name: "Michael Chen",
      email: "m.chen@school.edu",
      role: "Student",
      status: "active",
      lastActive: "5 мин назад",
      sessions: 1,
    },
    {
      id: 3,
      name: "Emily Davis",
      email: "e.davis@school.edu",
      role: "Teacher",
      status: "idle",
      lastActive: "1 ч назад",
      sessions: 0,
    },
    {
      id: 4,
      name: "James Wilson",
      email: "j.wilson@school.edu",
      role: "Admin",
      status: "active",
      lastActive: "Только что",
      sessions: 2,
    },
    {
      id: 5,
      name: "Lisa Thompson",
      email: "l.thompson@school.edu",
      role: "Student",
      status: "offline",
      lastActive: "3 дн. назад",
      sessions: 0,
    },
  ],
  systemMetrics: [
    { name: "Загрузка CPU", value: 42, status: "normal" },
    { name: "Память", value: 68, status: "normal" },
    { name: "Хранилище", value: 54, status: "normal" },
    { name: "Сеть", value: 23, status: "normal" },
  ],
  statusFooter: {
    servicesOk: "12/12",
    uptimePct: "99.98%",
  },
  recentActivity: [
    {
      id: 1,
      action: "Новый пользователь",
      details: "Эмили Паркер зарегистрировалась как ученик",
      time: "2 минуты назад",
      type: "user",
    },
    {
      id: 2,
      action: "Модель ИИ обновлена",
      details: "Развёрнута GPT-Education v2.4",
      time: "15 минут назад",
      type: "system",
    },
    {
      id: 3,
      action: "Резервное копирование",
      details: "Полный бэкап выполнен (45,2 ГБ)",
      time: "1 час назад",
      type: "maintenance",
    },
    {
      id: 4,
      action: "Проверка безопасности",
      details: "Уязвимостей не обнаружено",
      time: "2 часа назад",
      type: "security",
    },
    {
      id: 5,
      action: "Изменена конфигурация",
      details: "Обновлены лимиты API",
      time: "3 часа назад",
      type: "config",
    },
  ],
};

function mergeStats(
  payload: AdminDashboardPayload,
): Array<
  AdminStatJson & { icon: DashboardIcon; tone: StatTone; statKey: StatKey }
> {
  const byKey = new Map(payload.stats.map((s) => [s.statKey, s]));
  return STAT_ORDER.map((key) => {
    const raw = byKey.get(key) ?? FALLBACK_PAYLOAD.stats.find((s) => s.statKey === key)!;
    const sk = isStatKey(raw.statKey) ? raw.statKey : key;
    const tone = normalizeStatTone(raw.tone, sk);
    return {
      ...raw,
      statKey: sk,
      icon: STAT_ICONS[sk],
      tone,
    };
  });
}

function mergeMetrics(
  payload: AdminDashboardPayload,
): Array<AdminMetricJson & { icon: DashboardIcon }> {
  const list =
    payload.systemMetrics.length > 0
      ? payload.systemMetrics
      : FALLBACK_PAYLOAD.systemMetrics;
  return list.map((m) => ({
    ...m,
    icon: METRIC_ICONS[m.name] ?? CpuIcon,
  }));
}

function normalizeActivityType(t: string): ActivityType {
  if (
    t === "user" ||
    t === "system" ||
    t === "maintenance" ||
    t === "security" ||
    t === "config"
  ) {
    return t;
  }
  return "system";
}

function mergeActivity(
  payload: AdminDashboardPayload,
): Array<AdminActivityJson & { icon: DashboardIcon }> {
  const list =
    payload.recentActivity.length > 0
      ? payload.recentActivity
      : FALLBACK_PAYLOAD.recentActivity;
  return list.map((a) => {
    const type = normalizeActivityType(a.type);
    return {
      ...a,
      type,
      icon: ACTIVITY_ICONS[type] ?? SettingsIcon,
    };
  });
}

const statToneWrap: Record<StatTone, string> = {
  blue: styles.statIconWrap_blue,
  emerald: styles.statIconWrap_emerald,
  teal: styles.statIconWrap_teal,
  amber: styles.statIconWrap_amber,
};

function roleBadgeClass(role: string) {
  switch (role) {
    case "Admin":
      return styles.roleAdmin;
    case "Teacher":
      return styles.roleTeacher;
    case "Student":
      return styles.roleStudent;
    default:
      return styles.roleDefault;
  }
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "active":
      return styles.statusActive;
    case "idle":
      return styles.statusIdle;
    case "offline":
      return styles.statusOffline;
    default:
      return styles.roleDefault;
  }
}

function metricFillClass(value: number) {
  if (value < 50) return styles.metricFillLow;
  if (value < 80) return styles.metricFillMid;
  return styles.metricFillHigh;
}

function activityIconClass(type: ActivityType) {
  switch (type) {
    case "user":
      return styles.actUser;
    case "system":
      return styles.actSystem;
    case "maintenance":
      return styles.actMaintenance;
    case "security":
      return styles.actSecurity;
    case "config":
      return styles.actConfig;
    default:
      return styles.actDefault;
  }
}

function closeMenu(e: MouseEvent<HTMLElement>) {
  (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute(
    "open",
  );
}

export function AdminDashboardPage() {
  const [payload, setPayload] = useState<AdminDashboardPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadAdminDashboardData().then((data) => {
      if (!cancelled) setPayload(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const data = payload ?? FALLBACK_PAYLOAD;
  const stats = mergeStats(data);
  const users =
    data.users.length > 0 ? data.users : FALLBACK_PAYLOAD.users;
  const systemMetrics = mergeMetrics(data);
  const recentActivity = mergeActivity(data);
  const statusFooter = data.statusFooter ?? FALLBACK_PAYLOAD.statusFooter;

  return (
    <div className={styles.page}>
      <div className={styles.gradients} aria-hidden>
        <div className={styles.blob1} />
        <div className={styles.blob2} />
        <div className={styles.blob3} />
      </div>

      <div className={styles.inner}>
        <div className={styles.topBar}>
          <div>
            <h1 className={styles.pageTitle}>Панель администратора</h1>
            <p className={styles.subtitle}>
              Управление системой и контроль платформы
            </p>
          </div>
          <div className={styles.headerActions}>
            <button type="button" className={`${styles.btn} ${styles.btnOutline}`}>
              <RefreshCwIcon />
              Обновить
            </button>
            <button type="button" className={`${styles.btn} ${styles.btnAccent}`}>
              <SettingsIcon />
              Настройки системы
            </button>
          </div>
        </div>

        <section className={styles.statsGrid} aria-label="Статистика платформы">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.statKey} className={styles.statCard}>
                <div className={styles.statTop}>
                  <div
                    className={`${styles.statIconWrap} ${statToneWrap[stat.tone]} ${styles.iconStat}`}
                  >
                    <Icon />
                  </div>
                  <span className={styles.statBadge}>{stat.change}</span>
                </div>
                <p className={styles.statValue}>{stat.value}</p>
                <p className={styles.statTitle}>{stat.title}</p>
                <p className={styles.statChangeLabel}>{stat.changeLabel}</p>
              </div>
            );
          })}
        </section>

        <div className={styles.mainGrid}>
          <article className={styles.card}>
            <div className={`${styles.cardHeader} ${styles.cardHeaderRow}`}>
              <div>
                <h2 className={styles.cardTitle}>Пользователи</h2>
                <p className={styles.cardDesc}>
                  Просмотр и управление учётными записями
                </p>
              </div>
              <button type="button" className={`${styles.btn} ${styles.btnAccent}`}>
                <UserPlusIcon />
                Добавить пользователя
              </button>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.userStack}>
                {users.map((user) => (
                  <div key={user.id} className={styles.userRow}>
                    <div className={styles.userLeft}>
                      <div className={styles.avatarWrap}>
                        <div className={styles.avatar} aria-hidden>
                          {user.name.charAt(0)}
                        </div>
                        <span
                          className={`${styles.statusDot} ${
                            user.status === "active"
                              ? styles.dotActive
                              : user.status === "idle"
                                ? styles.dotIdle
                                : styles.dotOffline
                          }`}
                          aria-label={statusAriaLabel(user.status)}
                        />
                      </div>
                      <div>
                        <p className={styles.userName}>{user.name}</p>
                        <p className={styles.userEmail}>{user.email}</p>
                      </div>
                    </div>
                    <div className={styles.userRight}>
                      <span
                        className={`${styles.badge} ${roleBadgeClass(user.role)}`}
                      >
                        {ROLE_LABEL[user.role] ?? user.role}
                      </span>
                      <span
                        className={`${styles.badge} ${statusBadgeClass(user.status)}`}
                      >
                        {STATUS_LABEL[user.status] ?? user.status}
                      </span>
                      <div className={styles.userMetaWide}>
                        <p className={styles.metaLine}>{user.lastActive}</p>
                        <p className={styles.metaSub}>
                          {sessionCountLabel(user.sessions)}
                        </p>
                      </div>
                      <details className={styles.menuDetails}>
                        <summary className={styles.menuSummary}>
                          <span className={styles.menuTrigger}>
                            <MoreHorizontalIcon />
                          </span>
                        </summary>
                        <div className={styles.menuPanel} role="menu">
                          <button
                            type="button"
                            className={styles.menuItem}
                            role="menuitem"
                            onClick={closeMenu}
                          >
                            <EyeIcon />
                            Профиль
                          </button>
                          <button
                            type="button"
                            className={styles.menuItem}
                            role="menuitem"
                            onClick={closeMenu}
                          >
                            <EditIcon />
                            Изменить
                          </button>
                          <button
                            type="button"
                            className={`${styles.menuItem} ${styles.menuItemDanger}`}
                            role="menuitem"
                            onClick={closeMenu}
                          >
                            <Trash2Icon />
                            Удалить
                          </button>
                        </div>
                      </details>
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" className={`${styles.btn} ${styles.btnGhost}`}>
                Все пользователи
              </button>
            </div>
          </article>

          <article className={styles.card}>
            <div className={styles.statusCardHeader}>
              <div className={styles.statusHeaderTop}>
                <h2 className={styles.cardTitle}>Состояние системы</h2>
                <div className={styles.operational}>
                  <span className={styles.pulseDot} aria-hidden />
                  <span className={styles.operationalLabel}>Работает</span>
                </div>
              </div>
              <p className={styles.cardDesc}>
                Мониторинг инфраструктуры в реальном времени
              </p>
            </div>
            <div className={styles.statusBody}>
              {systemMetrics.map((metric) => {
                const Icon = metric.icon;
                return (
                  <div key={metric.name} className={styles.metricBlock}>
                    <div className={styles.metricRow}>
                      <div className={styles.metricLabel}>
                        <Icon />
                        <span>{metric.name}</span>
                      </div>
                      <span className={styles.metricPct}>{metric.value}%</span>
                    </div>
                    <div className={styles.metricTrack}>
                      <div
                        className={`${styles.metricFill} ${metricFillClass(metric.value)}`}
                        style={{ width: `${metric.value}%` }}
                      />
                    </div>
                  </div>
                );
              })}

              <div className={styles.statusFooter}>
                <div className={styles.statusRowOk}>
                  <div className={styles.statusRowLeft}>
                    <CheckCircle2Icon />
                    <span>Все сервисы запущены</span>
                  </div>
                  <span className={`${styles.badge} ${styles.badgeOk}`}>
                    {statusFooter.servicesOk}
                  </span>
                </div>
                <div className={styles.statusRowNeutral}>
                  <div className={styles.statusRowLeft}>
                    <ClockIcon />
                    <span>Аптайм</span>
                  </div>
                  <span className={styles.metricPct}>{statusFooter.uptimePct}</span>
                </div>
              </div>
            </div>
          </article>
        </div>

        <article className={styles.card}>
          <div className={styles.activityHeader}>
            <div>
              <h2 className={styles.cardTitle}>Недавняя активность</h2>
              <p className={styles.cardDesc}>
                Действия администраторов и события системы
              </p>
            </div>
            <button type="button" className={`${styles.btn} ${styles.btnOutline}`}>
              Все журналы
            </button>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.activityGrid}>
              {recentActivity.map((activity) => {
                const Icon = activity.icon;
                return (
                  <div key={activity.id} className={styles.activityCard}>
                    <div className={styles.activityTop}>
                      <div
                        className={`${styles.activityIcon} ${activityIconClass(activity.type)}`}
                      >
                        <Icon />
                      </div>
                      <span className={styles.activityTime}>{activity.time}</span>
                    </div>
                    <p className={styles.activityAction}>{activity.action}</p>
                    <p className={styles.activityDetails}>{activity.details}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}
