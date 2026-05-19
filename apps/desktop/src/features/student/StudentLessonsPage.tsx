import { Navigate } from "react-router-dom";
import { routes } from "@/shared/routes";

export function StudentLessonsPage() {
  return <Navigate to={routes.studentCourse} replace />;
}
