import type { StudentDashboardSnapshotTask } from "./student-dashboard-task-snapshot";

export type AchievementIconKey = "star" | "flame" | "target";

export type { StudentDashboardSnapshotTask };

/** Structured lesson body for the student detail view (sync / payload builder). */
export type StudentLessonContentSections = {
  aboutLesson: string;
  learningOutcomes: string;
  aiConnection: string;
  practice: string;
};

/** Serializable snapshot for the desktop student dashboard. */
export type StudentDashboardPayload = {
  version: 1;
  displayName: string;
  userEmail: string;
  stats: {
    level: { value: string; subtext: string };
    xp: { value: string; subtext: string };
    lessonsDone: { value: string; subtext: string };
    streak: { value: string; subtext: string };
  };
  lessons: Array<{
    id: string;
    title: string;
    description: string;
    progress: number;
    durationLabel: string;
    categoryLabel: string;
    /** Long-form body; mirrors sections for tools that only read one string. */
    content: string;
    /** Rich sections for the lesson detail UI (optional on older snapshots). */
    contentSections?: StudentLessonContentSections;
    tasks: StudentDashboardSnapshotTask[];
  }>;
  achievements: Array<{
    id: string;
    title: string;
    description: string;
    iconKey: AchievementIconKey;
    earned: boolean;
    earnedAtLabel: string | null;
    progressCurrent: number | null;
    progressTotal: number | null;
  }>;
};
