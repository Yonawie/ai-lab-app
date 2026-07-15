export const routes = {
  login: "/login",
  roleSelect: "/role-select",
  student: "/student",
  studentMyAi: "/student/my-ai",
  studentLearn: "/student/learn",
  studentTrain: "/student/train",
  studentEvaluate: "/student/evaluate",
  studentBuild: "/student/build",
  /** Legacy panel route. The main student entry point is `/student/my-ai`. */
  studentPanel: "/student/panel",
  studentLessons: "/student/lessons",
  studentCompanion: "/student/companion",
  studentPromptLab: "/student/prompt-lab",
  studentAiClinic: "/student/ai-clinic",
  studentChatTraining: "/student/chat-training",
  studentTrainingManager: "/student/training-manager",
  studentModelCompare: "/student/model-compare",
  studentArena: "/student/arena",
  studentAiStudio: "/student/ai-studio",
  studentAiExam: "/student/ai-exam",
  studentAiGrowth: "/student/my-ai",
  studentCourse: "/student/course",
  teacher: "/teacher",
  teacherPurchaseSurvey: "/teacher/purchase-survey",
  admin: "/admin",
} as const;

export function studentLessonDetailPath(lessonId: string) {
  return `${routes.studentLessons}/${encodeURIComponent(lessonId)}`;
}

export function studentCourseLessonPath(lessonId: string) {
  return `${routes.studentCourse}/${encodeURIComponent(lessonId)}`;
}
