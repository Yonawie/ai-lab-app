import { useCallback, useEffect, useRef, useState } from "react";
import {
  classificationAvailable,
  fetchClassificationTaskCompleted,
  submitClassificationAttempt,
  type SubmitClassificationResponse,
} from "@/shared/classification-tauri";
import type { SnapshotTask } from "./student-dashboard-snapshot";
import styles from "./StudentDashboardPage.module.css";

type Props = {
  lessonId: string;
  task: SnapshotTask;
  studentEmail: string;
  /** Called after a successful Tauri submit so the lesson page can show live progress. */
  onTaskSuccess?: (result: SubmitClassificationResponse) => void;
};

type SubmitOutcome =
  | { kind: "success"; data: SubmitClassificationResponse }
  | { kind: "failure"; message: string };

export function StudentClassificationTask({
  lessonId,
  task,
  studentEmail,
  onTaskSuccess,
}: Props) {
  const c = task.classification;
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hadPriorCompletion, setHadPriorCompletion] = useState(false);
  const [submitOutcome, setSubmitOutcome] = useState<SubmitOutcome | null>(null);
  const outcomeRef = useRef<HTMLDivElement | null>(null);

  const loadStatus = useCallback(async () => {
    if (!classificationAvailable() || !studentEmail) return;
    try {
      const { completed } = await fetchClassificationTaskCompleted({
        studentEmail,
        taskId: task.id,
      });
      setHadPriorCompletion(completed);
    } catch {
      setHadPriorCompletion(false);
    }
  }, [studentEmail, task.id]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (!submitOutcome) return;
    outcomeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [submitOutcome]);

  if (!c?.options?.length) return null;

  async function handleSubmit() {
    if (!selected) {
      setSubmitOutcome({
        kind: "failure",
        message: "Выберите один из вариантов.",
      });
      return;
    }
    if (!studentEmail.trim()) {
      setSubmitOutcome({
        kind: "failure",
        message:
          "Войдите с email ученика из базы (например alex.student@school.ru), чтобы сохранить попытку.",
      });
      return;
    }
    if (!classificationAvailable()) {
      setSubmitOutcome({
        kind: "failure",
        message:
          "Проверка ответа и сохранение результата доступны в настольном приложении.",
      });
      return;
    }

    setBusy(true);
    try {
      const res = await submitClassificationAttempt({
        studentEmail,
        lessonId,
        taskId: task.id,
        selectedAnswer: selected,
      });
      setSubmitOutcome({ kind: "success", data: res });
      onTaskSuccess?.(res);
      await loadStatus();
    } catch (e) {
      setSubmitOutcome({
        kind: "failure",
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.classificationCard}>
      <div className={styles.classificationHeader}>
        <h3 className={styles.classificationTitle}>{task.title}</h3>
        <span className={styles.classificationBadge}>Классификация</span>
      </div>
      {task.description ? (
        <p className={styles.classificationSub}>{task.description}</p>
      ) : null}

      <div className={styles.classificationPrompt} role="region" aria-label="Текст задания">
        {c.prompt}
      </div>

      {!classificationAvailable() ? (
        <p className={styles.classificationHint}>
          Сохранение ответа доступно в настольном приложении. В браузере после проверки
          результат показывается в блоке под кнопкой.
        </p>
      ) : null}

      {classificationAvailable() && hadPriorCompletion ? (
        <p className={styles.classificationHint}>
          Вы уже завершали это задание ранее. Новая отправка снова запишет пример в набор
          данных; опыт начисляется только за первое завершение.
        </p>
      ) : null}

      {!studentEmail.trim() ? (
        <p className={styles.classificationHint}>
          Войдите с email ученика из базы (например{" "}
          <strong>alex.student@school.ru</strong>), чтобы сохранить попытку.
        </p>
      ) : null}

      <fieldset className={styles.classificationFieldset} disabled={busy}>
        <legend className={styles.classificationLegend}>Выберите категорию</legend>
        <div className={styles.classificationOptions}>
          {c.options.map((opt, i) => {
            const id = `opt-${task.id}-${i}`;
            return (
              <label key={opt} className={styles.classificationOptionLabel} htmlFor={id}>
                <input
                  id={id}
                  type="radio"
                  name={`classification-${task.id}`}
                  className={styles.classificationRadio}
                  checked={selected === opt}
                  onChange={() => setSelected(opt)}
                />
                <span className={styles.classificationOptionText}>{opt}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className={styles.classificationActions}>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnAccent}`}
          disabled={busy || !selected || !studentEmail.trim()}
          onClick={() => void handleSubmit()}
        >
          {busy ? "Отправка…" : "Проверить ответ"}
        </button>
      </div>

      {submitOutcome ? (
        <div
          ref={outcomeRef}
          className={
            submitOutcome.kind === "success" && submitOutcome.data.isCorrect
              ? styles.classificationOutcomeOk
              : styles.classificationOutcomeBad
          }
          role="status"
          aria-live="polite"
        >
          {submitOutcome.kind === "failure" ? (
            <>
              <p className={styles.classificationOutcomeTitle}>Результат проверки</p>
              <p className={styles.classificationOutcomeText}>{submitOutcome.message}</p>
            </>
          ) : (
            <>
              <p className={styles.classificationOutcomeTitle}>
                {submitOutcome.data.isCorrect ? "Верно!" : "Неверно"}
              </p>
              <p className={styles.classificationOutcomeText}>
                Правильный ответ: <strong>{submitOutcome.data.correctAnswer}</strong>
              </p>
              <p className={styles.classificationOutcomeXp}>
                Очки за эту попытку:{" "}
                <strong>
                  +
                  {submitOutcome.data.xpEarnedThisAttempt.toLocaleString("ru-RU")} очков
                </strong>
              </p>
              <p className={styles.classificationOutcomeXp}>
                Всего очков:{" "}
                <strong>{submitOutcome.data.newXp.toLocaleString("ru-RU")} очков</strong>
              </p>
              <p className={styles.classificationOutcomeXp}>
                Прогресс урока:{" "}
                <strong>{Math.round(submitOutcome.data.lessonProgressPercent)}%</strong>
              </p>
              <p className={styles.classificationOutcomeXp}>
                Первое завершение:{" "}
                <strong>{submitOutcome.data.firstCompletion ? "да" : "нет"}</strong>
                {!submitOutcome.data.firstCompletion ? (
                  <span> (опыт за это задание уже был начислен ранее)</span>
                ) : null}
              </p>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
