import { invoke } from "@tauri-apps/api/core";
import type { UserRole } from "@/shared/auth-context";

export type ResolvedUserPayload = {
  id: string;
  email: string;
  role: UserRole;
  name?: string;
};

export async function resolveUserByEmail(
  email: string,
): Promise<ResolvedUserPayload> {
  return invoke<ResolvedUserPayload>("resolve_user_by_email_cmd", { email });
}

export type LoginUserPayload = {
  id: string;
  email: string;
  role: UserRole;
  displayName?: string;
};

export async function loginUser(
  email: string,
  password: string,
): Promise<LoginUserPayload> {
  return invoke<LoginUserPayload>("login_user_cmd", { email, password });
}

export async function registerStudentUser(
  email: string,
  password: string,
): Promise<LoginUserPayload> {
  return invoke<LoginUserPayload>("register_student_user_cmd", { email, password });
}
