import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  classificationAvailable,
  fetchClassificationTaskCompleted,
  submitDataCleaningAttempt,
  type SubmitClassificationResponse,
} from "@/shared/classification-tauri";
import type { SnapshotTask } from "./student-dashboard-snapshot";
import styles from "./StudentDashboardPage.module.css";

type Label = "clean" | "noisy";

type Props = {
  lessonId: string;
  task: SnapshotTask;
  studentEmail: string;
  onTaskSuccess?: (result: SubmitClassificationResponse) => void;
};

type SubmitOutcome =
  | { kind: "success"; data: SubmitClassificationResponse }
  | { kind: "failure"; message: string };

export function StudentDataCleaningTask({
  lessonId,
  task,
  studentEmail,
  onTaskSuccess,
}: Props) {
  const dc = task.dataCleaning;
  const [labels, setLabels] = useState<Record<string, Label | null>>({});
  const [busy, setBusy] = useState(false);
  const [hadPriorCompletion, setHadPriorCompletion] = useState(false);
  const [submitOutcome, setSubmitOutcome] = useState<SubmitOutcome | null>(null);
  const outcomeRef = useRef<HTMLDivElement | null>(null);

  const exampleIds = useMemo(() => dc?.examples.map((e) => e.id) ?? [], [dc?.examples]);

  const exampleIdsKey = useMemo(
    () => (dc?.examples ?? []).map((e) => e.id).join("\0"),
    [dc?.examples],
  );

  useEffect(() => {
    if (!dc?.examples.length) return;
    const next: Record<string, Label | null> = {};
    for (const ex of dc.examples) next[ex.id] = null;
    setLabels(next);
  }, [task.id, exampleIdsKey]);

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

  if (!dc?.examples?.length) return null;

  function setExampleLabel(id: string, value: Label) {
    setLabels((prev) => ({ ...prev, [id]: value }));
  }

  const allLabeled = exampleIds.every((id) => labels[id] != null);

  async function handleSubmit() {
    if (!allLabeled) {
      setSubmitOutcome({
        kind: "failure",
        message: "Отметьте каждую строку: оставить в наборе или отфильтровать как шум.",
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

    const cleanIds: string[] = [];
    const noisyIds: string[] = [];
    for (const id of exampleIds) {
      const v = labels[id];
      if (v === "clean") cleanIds.push(id);
      else if (v === "noisy") noisyIds.push(id);
    }

    setBusy(true);
    try {
      const res = await submitDataCleaningAttempt({
        studentEmail,
        lessonId,
        taskId: task.id,
        cleanIds,
        noisyIds,
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
      <div className={styles.dataCleaningHud} role="presentation">
        <span className={styles.dataCleaningHudTag}>Набор данных</span>
        <div className={styles.dataCleaningHudBody}>
          <p className={styles.dataCleaningHudTitle}>Режим фильтрации</p>
          <p className={styles.dataCleaningHudHint}>
            Реши для каждой строки: она годится для обучения или это шум, который лучше убрать.
          </p>
        </div>
      </div>

      <div className={styles.classificationHeader}>
        <h3 className={styles.classificationTitle}>{task.title}</h3>
        <span className={styles.classificationBadge}>Очистка данных</span>
      </div>
      {task.description ? (
        <p className={styles.classificationSub}>{task.description}</p>
      ) : null}

      <div className={styles.classificationPrompt} role="region" aria-label="Инструкция">
        {dc.prompt}
      </div>

      {!classificationAvailable() ? (
        <p className={styles.classificationHint}>
          Сохранение ответа доступно в настольном приложении. В браузере после проверки
          результат показывается в блоке под кнопкой.
        </p>
      ) : null}

      {classificationAvailable() && hadPriorCompletion ? (
        <p className={styles.classificationHint}>
          Вы уже завершали это задание ранее. Новая отправка снова запишет пример в набор данных;
          опыт начисляется только за первое завершение.
        </p>
      ) : null}

      {!studentEmail.trim() ? (
        <p className={styles.classificationHint}>
          Войдите с email ученика из базы (например{" "}
          <strong>alex.student@school.ru</strong>), чтобы сохранить попытку.
        </p>
      ) : null}

      <fieldset className={styles.classificationFieldset} disabled={busy}>
        <legend className={styles.classificationLegend}>Разметка примеров</legend>
        <div className={styles.dataCleaningList}>
          {dc.examples.map((ex) => {
            const cur = labels[ex.id];
            return (
              <div key={ex.id} className={styles.dataCleaningRow}>
                <p className={styles.dataCleaningRowText}>{ex.text}</p>
                <div className={styles.dataCleaningRowActions} role="group" aria-label="Категория">
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnSm} ${
                      cur === "clean" ? styles.btnSmAccent : styles.btnOutline
                    }`}
                    onClick={() => setExampleLabel(ex.id, "clean")}
                  >
                    В набор
                  </button>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnSm} ${
                      cur === "noisy" ? styles.btnSmPrimary : styles.btnOutline
                    }`}
                    onClick={() => setExampleLabel(ex.id, "noisy")}
                  >
                    Шум
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </fieldset>

      <div className={styles.classificationActions}>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnAccent}`}
          disabled={busy || !allLabeled || !studentEmail.trim()}
          onClick={() => void handleSubmit()}
        >
          {busy ? "Отправка…" : "Проверить разметку"}
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
                Эталон: <strong>{submitOutcome.data.correctAnswer}</strong>
              </p>
              <p className={styles.classificationOutcomeXp}>
                Очки за эту попытку:{" "}
                <strong>
                  +{submitOutcome.data.xpEarnedThisAttempt.toLocaleString("ru-RU")} очков
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
