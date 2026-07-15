import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { LoginPage } from "@/features/auth/LoginPage";
import { RoleSelectPage } from "@/features/auth/RoleSelectPage";
import { AdminDashboardPage } from "@/features/admin/AdminDashboardPage";
import { StudentLayout } from "@/features/student/StudentLayout";
import { StudentAICompanionPage } from "@/features/student/StudentAICompanionPage";
import { StudentAiClinicPage } from "@/features/student/StudentAiClinicPage";
import { StudentAiExamPage } from "@/features/student/StudentAiExamPage";
import { StudentChatTrainingPage } from "@/features/student/StudentChatTrainingPage";
import { StudentCourseLessonPage } from "@/features/student/StudentCourseLessonPage";
import { StudentCoursePage } from "@/features/student/StudentCoursePage";
import { StudentPromptLabPage } from "@/features/student/StudentPromptLabPage";
import { StudentTrainingManagerPage } from "@/features/student/StudentTrainingManagerPage";
import { StudentModelComparePage } from "@/features/student/StudentModelComparePage";
import { StudentAiGrowthPage } from "@/features/student/StudentAiGrowthPage";
import { StudentAiStudioPage } from "@/features/student/StudentAiStudioPage";
import { StudentTrainPage } from "@/features/student/StudentTrainPage";
import { StudentEvaluatePage } from "@/features/student/StudentEvaluatePage";
import { StudentBuildPage } from "@/features/student/StudentBuildPage";
import { TeacherDashboardPage } from "@/features/teacher/TeacherDashboardPage";
import { TeacherPurchaseSurveyPage } from "@/features/teacher/purchase-survey/TeacherPurchaseSurveyPage";
import { useAuth, type UserRole } from "@/shared/auth-context";
import { homeRouteForRole } from "@/shared/auth-routes";
import { routes } from "@/shared/routes";
import { AppShell } from "./AppShell";

function ProtectedShell() {
  const { isAuthenticated, userRole } = useAuth();
  if (!isAuthenticated || !userRole) {
    return <Navigate to={routes.login} replace />;
  }
  return <AppShell />;
}

function RequireRole({ roles }: { roles: readonly UserRole[] }) {
  const { isAuthenticated, userRole } = useAuth();
  if (!isAuthenticated || !userRole) {
    return <Navigate to={routes.login} replace />;
  }
  if (!roles.includes(userRole)) {
    return <Navigate to={homeRouteForRole(userRole)} replace />;
  }
  return <Outlet />;
}

function CatchAllRoute() {
  const { isAuthenticated, userRole } = useAuth();
  if (isAuthenticated && userRole) {
    return <Navigate to={homeRouteForRole(userRole)} replace />;
  }
  return <Navigate to={routes.login} replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path={routes.login} element={<LoginPage />} />
      <Route path={routes.roleSelect} element={<RoleSelectPage />} />
      <Route element={<ProtectedShell />}>
        <Route element={<RequireRole roles={["student"]} />}>
          <Route path={routes.student} element={<StudentLayout />}>
            <Route index element={<Navigate to={routes.studentAiGrowth} replace />} />
            <Route path="my-ai" element={<StudentAiGrowthPage />} />
            <Route path="learn" element={<Navigate to={routes.studentCourse} replace />} />
            <Route path="train" element={<StudentTrainPage />} />
            <Route path="evaluate" element={<StudentEvaluatePage />} />
            <Route path="build" element={<StudentBuildPage />} />
            <Route path="panel" element={<Navigate to={routes.studentAiGrowth} replace />} />
            <Route path="lessons" element={<Navigate to={routes.studentCourse} replace />} />
            <Route path="lessons/:lessonId" element={<Navigate to={routes.studentCourse} replace />} />
            <Route path="companion" element={<StudentAICompanionPage />} />
            <Route path="ai-clinic" element={<StudentAiClinicPage />} />
            <Route path="prompt-lab" element={<StudentPromptLabPage />} />
            <Route path="chat-training" element={<StudentChatTrainingPage />} />
            <Route path="training-manager" element={<StudentTrainingManagerPage />} />
            <Route path="model-compare" element={<StudentModelComparePage />} />
            <Route path="arena" element={<StudentModelComparePage />} />
            <Route path="ai-studio" element={<StudentAiStudioPage />} />
            <Route path="ai-exam" element={<StudentAiExamPage />} />
            <Route path="ai-growth" element={<Navigate to={routes.studentAiGrowth} replace />} />
            <Route path="course" element={<StudentCoursePage />} />
            <Route path="course/:lessonId" element={<StudentCourseLessonPage />} />
          </Route>
        </Route>
        <Route element={<RequireRole roles={["teacher"]} />}>
          <Route path={routes.teacher} element={<TeacherDashboardPage />} />
          <Route
            path={routes.teacherPurchaseSurvey}
            element={<TeacherPurchaseSurveyPage />}
          />
        </Route>
        <Route element={<RequireRole roles={["admin"]} />}>
          <Route path={routes.admin} element={<AdminDashboardPage />} />
        </Route>
      </Route>
      <Route index element={<CatchAllRoute />} />
      <Route path="*" element={<CatchAllRoute />} />
    </Routes>
  );
}
