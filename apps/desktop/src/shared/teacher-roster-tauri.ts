import { invoke, isTauri } from "@tauri-apps/api/core";

export type TeacherLinkedStudent = {
  studentId: string;
  email: string;
  displayName: string | null;
  groupName: string | null;
  linkedAt: string;
};

export type CreateStudentForTeacherResult = {
  studentId: string;
  studentEmail: string;
  displayName: string | null;
  groupName: string | null;
  linkedAt: string;
  wasNewUser: boolean;
  wasNewLink: boolean;
};

export async function listStudentsForTeacher(
  teacherEmail: string,
  teacherId?: string | null,
): Promise<TeacherLinkedStudent[]> {
  if (!isTauri() || !teacherEmail.trim()) {
    return [];
  }
  return invoke<TeacherLinkedStudent[]>("list_students_for_teacher_cmd", {
    teacherEmail: teacherEmail.trim(),
    teacherId: teacherId?.trim() || null,
  });
}

export async function createStudentForTeacher(input: {
  teacherEmail: string;
  teacherId?: string | null;
  studentEmail: string;
  studentDisplayName?: string | null;
  groupName?: string | null;
}): Promise<CreateStudentForTeacherResult> {
  if (!isTauri()) {
    throw new Error("Доступно только в приложении AI Lab.");
  }
  return invoke<CreateStudentForTeacherResult>("create_student_for_teacher_cmd", {
    teacherEmail: input.teacherEmail.trim(),
    teacherId: input.teacherId?.trim() || null,
    studentEmail: input.studentEmail.trim(),
    studentDisplayName: input.studentDisplayName?.trim() || null,
    groupName: input.groupName?.trim() || null,
  });
}
