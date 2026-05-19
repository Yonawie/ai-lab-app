/** Отмечает, что ученик выполнил сравнение базы и обученной модели (для урока 6). */
const compareKey = (email: string) => `student-l6-final-compare-done:${email.trim() || "anon"}`;

export function markFinalMissionCompareDone(studentEmail: string): void {
  try {
    localStorage.setItem(compareKey(studentEmail), new Date().toISOString());
    window.dispatchEvent(new CustomEvent("ai-lab-final-mission"));
  } catch {
    /* ignore */
  }
}

export function isFinalMissionCompareDone(studentEmail: string): boolean {
  try {
    return localStorage.getItem(compareKey(studentEmail.trim() || "anon")) != null;
  } catch {
    return false;
  }
}
