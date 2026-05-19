import { routes } from "@/shared/routes";
import type { UserRole } from "@/shared/auth-context";

export function homeRouteForRole(role: UserRole): string {
  switch (role) {
    case "student":
      return routes.studentAiGrowth;
    case "teacher":
      return routes.teacher;
    case "admin":
      return routes.admin;
  }
}
