import { Navigate } from "react-router-dom";
import { routes } from "@/shared/routes";

export function StudentLessonDetailPage() {
  return <Navigate to={routes.studentCourse} replace />;
}
