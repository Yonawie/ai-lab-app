import { useCallback, useEffect, useRef, useState } from "react";
import {
  classificationAvailable,
  fetchClassificationTaskCompleted,
  submitPolicyPathAttempt,
  type SubmitClassificationResponse,
} from "@/shared/classification-tauri";
import type { SnapshotTask } from "./student-dashboard-snapshot";
import styles from "./StudentDashboardPage.module.css";

type Props = {
  lessonId: string;
  task: SnapshotTask;
  studentEmail: string;
  onTaskSuccess?: (result: SubmitClassificationResponse) => void;
};

type SubmitOutcome =
  | { kind: "success"; data: SubmitClassificationResponse }
  | { kind: "failure"; message: string };

export function StudentPolicyPathTask({
  lessonId,
  task,
  studentEmail,
  onTaskSuccess,
}: Props) {
  const pp = task.policyPath;
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

  if (!pp?.options?.length) return null;

  async function handleSubmit() {
    if (!selected) {
      setSubmitOutcome({
        kind: "failure",
        message: "Выберите один из вариантов действия.",
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
      const res = await submitPolicyPathAttempt({
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
    <div className={styles.policyPathGame}>
      <div className={styles.policyPathHud}>
        <span className={styles.policyPathHudTag} aria-hidden>
          МИССИЯ
        </span>
        <div className={styles.policyPathHudBody}>
          <p className={styles.policyPathHudTitle}>{task.title}</p>
          {task.description ? (
            <p className={styles.policyPathHudSub}>{task.description}</p>
          ) : null}
        </div>
        <span className={styles.policyPathHudXp} aria-hidden>
          +очки
        </span>
      </div>

      <div className={styles.policyPathScenario} role="region" aria-label="Сценарий">
        <div className={styles.policyPathScenarioLabel}>СИТУАЦИЯ</div>
        <div className={styles.policyPathScenarioText}>{pp.scenario}</div>
      </div>

      {!classificationAvailable() ? (
        <p className={styles.classificationHint}>
          Сохранение ответа доступно в настольном приложении.
        </p>
      ) : null}

      {classificationAvailable() && hadPriorCompletion ? (
        <p className={styles.classificationHint}>
          Вы уже завершали это задание ранее. Новая отправка снова запишет пример; опыт начисляется
          только за первое завершение.
        </p>
      ) : null}

      {!studentEmail.trim() ? (
        <p className={styles.classificationHint}>
          Войдите с email ученика из базы (например{" "}
          <strong>alex.student@school.ru</strong>), чтобы сохранить попытку.
        </p>
      ) : null}

      <fieldset className={styles.policyPathFieldset} disabled={busy}>
        <legend className={styles.policyPathLegend}>Выберите лучший безопасный ответ ИИ</legend>
        <div className={styles.policyPathChoices}>
          {pp.options.map((opt, i) => {
            const id = `pp-${task.id}-${i}`;
            const picked = selected === opt;
            return (
              <label
                key={opt}
                htmlFor={id}
                className={`${styles.policyPathCard} ${picked ? styles.policyPathCardSelected : ""}`}
              >
                <input
                  id={id}
                  type="radio"
                  name={`policy-path-${task.id}`}
                  className={styles.policyPathRadio}
                  checked={picked}
                  onChange={() => setSelected(opt)}
                />
                <span className={styles.policyPathCardIndex}>{i + 1}</span>
                <span className={styles.policyPathCardText}>{opt}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className={styles.policyPathActions}>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnAccent}`}
          disabled={busy || !selected || !studentEmail.trim()}
          onClick={() => void handleSubmit()}
        >
          {busy ? "Проверка…" : "Подтвердить выбор"}
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
              <p className={styles.classificationOutcomeTitle}>Результат</p>
              <p className={styles.classificationOutcomeText}>{submitOutcome.message}</p>
            </>
          ) : (
            <>
              <p className={styles.classificationOutcomeTitle}>
                {submitOutcome.data.isCorrect ? "Отличный выбор!" : "Не тот вариант"}
              </p>
              <p className={styles.classificationOutcomeText}>
                Лучший ответ: <strong>{submitOutcome.data.correctAnswer}</strong>
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
