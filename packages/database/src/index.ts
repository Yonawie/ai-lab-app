export { prisma, createPrismaClient } from "./client";
export * from "./dashboard-queries";
export type {
  AchievementIconKey,
  StudentDashboardPayload,
  StudentLessonContentSections,
} from "./student-dashboard-types";
export { buildStudentDashboardPayload } from "./student-dashboard-payload";
export {
  taskToSnapshotTask,
  type StudentDashboardSnapshotTask,
} from "./student-dashboard-task-snapshot";
export type {
  Achievement,
  ChatTrainingInteraction,
  Lesson,
  ModelProfile,
  PromptExperiment,
  Prisma,
  Role,
  StudentAiStudioProjectVersion,
  StudentArtifactLedger,
  StudentAICompanion,
  StudentBenchmarkRun,
  StudentCompareRun,
  StudentModelUsagePreference,
  StudentOllamaModelRef,
  StudentPairwisePreference,
  StudentProfile,
  StudentTrainingExportRef,
  Task,
  TaskAttempt,
  TrainingRun,
  User,
  UserAchievement,
} from "@prisma/client";
export { PrismaClient } from "@prisma/client";
