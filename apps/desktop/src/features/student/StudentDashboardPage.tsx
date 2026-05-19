import { Navigate } from "react-router-dom";
import { routes } from "@/shared/routes";

export function StudentDashboardPage() {
  return <Navigate to={routes.studentAiGrowth} replace />;
}
