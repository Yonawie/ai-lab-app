import { useCallback, useEffect, useRef, useState } from "react";
import {
  classificationAvailable,
  fetchClassificationTaskCompleted,
  submitRankingAttempt,
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

function moveItem(list: string[], index: number, delta: number): string[] {
  const j = index + delta;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[index], next[j]] = [next[j], next[index]];
  return next;
}

export function StudentRankingTask({
  lessonId,
  task,
  studentEmail,
  onTaskSuccess,
}: Props) {
  const r = task.ranking;
  const [order, setOrder] = useState<string[]>(() =>
    r?.options?.length ? [...r.options] : [],
  );
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

  if (!r?.options?.length) return null;

  async function handleSubmit() {
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
      const res = await submitRankingAttempt({
        studentEmail,
        lessonId,
        taskId: task.id,
        rankedOrder: order,
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
        <span className={styles.classificationBadge}>Ранжирование</span>
      </div>
      {task.description ? (
        <p className={styles.classificationSub}>{task.description}</p>
      ) : null}

      <div className={styles.classificationPrompt} role="region" aria-label="Текст задания">
        {r.prompt}
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

      <ol className={styles.rankingList} aria-label="Порядок элементов">
        {order.map((label, index) => (
          <li key={`${task.id}-rank-${index}`} className={styles.rankingRow}>
            <span className={styles.rankingIndex}>{index + 1}</span>
            <span className={styles.rankingLabel}>{label}</span>
            <span className={styles.rankingRowActions}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnOutline} ${styles.rankingMoveBtn}`}
                disabled={busy || index === 0}
                onClick={() => setOrder((o) => moveItem(o, index, -1))}
                aria-label="Переместить вверх"
              >
                ↑
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnOutline} ${styles.rankingMoveBtn}`}
                disabled={busy || index === order.length - 1}
                onClick={() => setOrder((o) => moveItem(o, index, 1))}
                aria-label="Переместить вниз"
              >
                ↓
              </button>
            </span>
          </li>
        ))}
      </ol>

      <div className={styles.classificationActions}>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnAccent}`}
          disabled={busy || !studentEmail.trim()}
          onClick={() => void handleSubmit()}
        >
          {busy ? "Отправка…" : "Проверить порядок"}
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
                Правильный порядок: <strong>{submitOutcome.data.correctAnswer}</strong>
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
