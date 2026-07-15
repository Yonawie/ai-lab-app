import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { routes } from "@/shared/routes";
import {
  buildPurchaseList,
  CATEGORY_LABELS,
  emptyAnswers,
  formatPurchaseListText,
  PRIORITY_LABELS,
  purchaseSummary,
  stepAnswered,
  type Priority,
  type PurchaseItem,
  type SurveyAnswers,
  type SurveyStep,
  visibleSteps,
} from "./survey-model";
import styles from "./TeacherPurchaseSurveyPage.module.css";

type Phase = "survey" | "result";

function toggleInList(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

function priorityClass(p: Priority): string {
  if (p === "critical") return styles.prioCritical;
  if (p === "high") return styles.prioHigh;
  if (p === "medium") return styles.prioMedium;
  return styles.prioLater;
}

export function TeacherPurchaseSurveyPage() {
  const [answers, setAnswers] = useState<SurveyAnswers>(emptyAnswers);
  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("survey");
  const [copied, setCopied] = useState(false);

  const steps = useMemo(() => visibleSteps(answers), [answers]);
  const safeIndex = Math.min(stepIndex, Math.max(0, steps.length - 1));
  const step = steps[safeIndex];
  const progress = steps.length === 0 ? 0 : ((safeIndex + 1) / steps.length) * 100;

  const items = useMemo(
    () => (phase === "result" ? buildPurchaseList(answers) : []),
    [phase, answers],
  );
  const summary = useMemo(() => purchaseSummary(items), [items]);

  function updateField<K extends keyof SurveyAnswers>(field: K, value: SurveyAnswers[K]) {
    setAnswers((prev) => {
      const next = { ...prev, [field]: value };
      // AI track stays available as default hint but user can uncheck — keep at least one track soft hint
      return next;
    });
    setStepIndex((i) => i); // keep position; visible steps may shrink
  }

  function goNext() {
    if (!step) return;
    if (!stepAnswered(step, answers)) return;
    if (safeIndex >= steps.length - 1) {
      setPhase("result");
      return;
    }
    setStepIndex(safeIndex + 1);
  }

  function goBack() {
    if (phase === "result") {
      setPhase("survey");
      setStepIndex(Math.max(0, steps.length - 1));
      return;
    }
    setStepIndex(Math.max(0, safeIndex - 1));
  }

  function restart() {
    setAnswers({ ...emptyAnswers, tracks: ["ai"] });
    setStepIndex(0);
    setPhase("survey");
    setCopied(false);
  }

  async function copyList() {
    const text = formatPurchaseListText(items, answers);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  function downloadList() {
    const text = formatPurchaseListText(items, answers);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "list-zakupok-zanyatiya.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className={styles.page}>
      <div className={styles.gradients} aria-hidden>
        <div className={styles.blob1} />
        <div className={styles.blob2} />
      </div>

      <div className={styles.inner}>
        <header className={styles.topBar}>
          <div>
            <p className={styles.eyebrow}>
              <Link to={routes.teacher} className={styles.backLink}>
                ← Панель преподавателя
              </Link>
            </p>
            <h1 className={styles.title}>Опрос: лист закупок</h1>
            <p className={styles.subtitle}>
              Ответьте на вопросы — соберём список техники и материалов под нейросети,
              гитару, узлы и остальные ваши навыки.
            </p>
          </div>
        </header>

        {phase === "survey" && step ? (
          <SurveyCard
            step={step}
            stepIndex={safeIndex}
            stepCount={steps.length}
            progress={progress}
            answers={answers}
            onSingle={(field, id) => updateField(field, id as never)}
            onMulti={(field, id) => {
              const current = answers[field];
              if (!Array.isArray(current)) return;
              updateField(field, toggleInList(current, id) as never);
            }}
            onText={(field, value) => updateField(field, value as never)}
            onBack={goBack}
            onNext={goNext}
            canNext={stepAnswered(step, answers)}
            canBack={safeIndex > 0}
          />
        ) : null}

        {phase === "result" ? (
          <ResultPanel
            items={items}
            summary={summary}
            copied={copied}
            onCopy={copyList}
            onDownload={downloadList}
            onBack={goBack}
            onRestart={restart}
          />
        ) : null}
      </div>
    </div>
  );
}

function SurveyCard({
  step,
  stepIndex,
  stepCount,
  progress,
  answers,
  onSingle,
  onMulti,
  onText,
  onBack,
  onNext,
  canNext,
  canBack,
}: {
  step: SurveyStep;
  stepIndex: number;
  stepCount: number;
  progress: number;
  answers: SurveyAnswers;
  onSingle: (field: keyof SurveyAnswers, id: string) => void;
  onMulti: (field: keyof SurveyAnswers, id: string) => void;
  onText: (field: keyof SurveyAnswers, value: string) => void;
  onBack: () => void;
  onNext: () => void;
  canNext: boolean;
  canBack: boolean;
}) {
  const value = answers[step.field];

  return (
    <section className={styles.card} aria-labelledby="survey-step-title">
      <div className={styles.progressMeta}>
        <span>
          Шаг {stepIndex + 1} из {stepCount}
        </span>
        <span>{Math.round(progress)}%</span>
      </div>
      <div className={styles.progressTrack} aria-hidden>
        <div className={styles.progressFill} style={{ width: `${progress}%` }} />
      </div>

      <h2 id="survey-step-title" className={styles.stepTitle}>
        {step.title}
      </h2>
      <p className={styles.stepSubtitle}>{step.subtitle}</p>

      {step.kind === "text" ? (
        <textarea
          className={styles.textarea}
          value={typeof value === "string" ? value : ""}
          placeholder={step.placeholder}
          rows={4}
          onChange={(e) => onText(step.field, e.target.value)}
        />
      ) : (
        <div
          className={styles.options}
          role={step.kind === "single" ? "radiogroup" : "group"}
          aria-label={step.title}
        >
          {(step.options ?? []).map((opt) => {
            const selected =
              step.kind === "multi"
                ? Array.isArray(value) && value.includes(opt.id)
                : value === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                className={
                  selected ? `${styles.option} ${styles.optionSelected}` : styles.option
                }
                aria-pressed={selected}
                onClick={() =>
                  step.kind === "multi"
                    ? onMulti(step.field, opt.id)
                    : onSingle(step.field, opt.id)
                }
              >
                <span className={styles.optionLabel}>{opt.label}</span>
                {opt.hint ? <span className={styles.optionHint}>{opt.hint}</span> : null}
              </button>
            );
          })}
        </div>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.btnGhost}
          onClick={onBack}
          disabled={!canBack}
        >
          Назад
        </button>
        <button
          type="button"
          className={styles.btnPrimary}
          onClick={onNext}
          disabled={!canNext}
        >
          {stepIndex >= stepCount - 1 ? "Собрать лист закупок" : "Далее"}
        </button>
      </div>
    </section>
  );
}

function ResultPanel({
  items,
  summary,
  copied,
  onCopy,
  onDownload,
  onBack,
  onRestart,
}: {
  items: PurchaseItem[];
  summary: ReturnType<typeof purchaseSummary>;
  copied: boolean;
  onCopy: () => void;
  onDownload: () => void;
  onBack: () => void;
  onRestart: () => void;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, PurchaseItem[]>();
    for (const it of items) {
      const list = map.get(it.category) ?? [];
      list.push(it);
      map.set(it.category, list);
    }
    return [...map.entries()];
  }, [items]);

  return (
    <section className={styles.result} aria-labelledby="result-title">
      <div className={styles.resultHeader}>
        <div>
          <h2 id="result-title" className={styles.stepTitle}>
            Ваш лист закупок
          </h2>
          <p className={styles.stepSubtitle}>
            {summary.total} позиций · срочно {summary.byPriority.critical} · высокий{" "}
            {summary.byPriority.high} · средний {summary.byPriority.medium} · позже{" "}
            {summary.byPriority.later}
          </p>
        </div>
        <div className={styles.resultActions}>
          <button type="button" className={styles.btnGhost} onClick={onBack}>
            Изменить ответы
          </button>
          <button type="button" className={styles.btnGhost} onClick={onRestart}>
            Начать заново
          </button>
          <button type="button" className={styles.btnSecondary} onClick={onCopy}>
            {copied ? "Скопировано" : "Копировать"}
          </button>
          <button type="button" className={styles.btnPrimary} onClick={onDownload}>
            Скачать .txt
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className={styles.empty}>
          Пока нечего покупать — похоже, всё уже есть. Отметьте направления или пробелы в
          технике, чтобы появились рекомендации.
        </p>
      ) : (
        <div className={styles.groups}>
          {grouped.map(([category, list]) => (
            <article key={category} className={styles.group}>
              <h3 className={styles.groupTitle}>
                {CATEGORY_LABELS[category as PurchaseItem["category"]]}
              </h3>
              <ul className={styles.itemList}>
                {list.map((it) => (
                  <li key={it.id} className={styles.item}>
                    <div className={styles.itemTop}>
                      <span className={`${styles.prio} ${priorityClass(it.priority)}`}>
                        {PRIORITY_LABELS[it.priority]}
                      </span>
                      <span className={styles.itemQty}>
                        {it.qty} {it.unit}
                      </span>
                    </div>
                    <p className={styles.itemName}>{it.name}</p>
                    <p className={styles.itemReason}>{it.reason}</p>
                    {it.approxNote ? (
                      <p className={styles.itemNote}>{it.approxNote}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
