/**
 * Lesson 2 — deterministic “ML lab” numbers derived from lesson-local state (no backend).
 */
import { L2_LAB_CANDIDATES, TRAINING_CENTER_ROUNDS, type MsgClass } from "./l2-data";

export type L2ClassHistogram = { important: number; spam: number };

export type L2TrainValSplit = { train: number; val: number; trainPct: number; valPct: number };

export type L2Metrics = {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  /** Rounded for 2×2 grid (not necessarily summing to total examples — учебная модель). */
  confusion: { tp: number; fp: number; tn: number; fn: number };
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function round1(n: number): number {
  return Math.round(n * 1000) / 10;
}

/** Гистограмма эталонных меток по уже «закрытым» раундам центра. */
export function l2HistogramFromCenter(completedRounds: number): L2ClassHistogram {
  let important = 0;
  let spam = 0;
  const n = clamp(completedRounds, 0, TRAINING_CENTER_ROUNDS.length);
  for (let i = 0; i < n; i++) {
    const t = TRAINING_CENTER_ROUNDS[i]!.truth;
    if (t === "важное") important += 1;
    else spam += 1;
  }
  return { important, spam };
}

/** Сколько «чистых» пар добавлено из лаборатории (верное включение). */
export function l2LabCleanAdds(labResolved: Record<string, boolean>): number {
  return L2_LAB_CANDIDATES.filter((c) => labResolved[c.id] && c.shouldInclude).length;
}

/** Сколько шумовых карточек корректно отсеяно. */
export function l2LabNoiseRejected(labResolved: Record<string, boolean>): number {
  return L2_LAB_CANDIDATES.filter((c) => labResolved[c.id] && !c.shouldInclude).length;
}

/**
 * Учебная схема: ~75% примеров идёт в обучение, остальное — отложенная проверка (валидация).
 */
export function l2TrainValSplit(totalLabeledFromCenter: number): L2TrainValSplit {
  if (totalLabeledFromCenter <= 0) {
    return { train: 0, val: 0, trainPct: 0, valPct: 0 };
  }
  const val = Math.max(2, Math.ceil(totalLabeledFromCenter * 0.22));
  const train = Math.max(1, totalLabeledFromCenter - val);
  const sum = train + val;
  return {
    train,
    val,
    trainPct: Math.round((train / sum) * 100),
    valPct: Math.round((val / sum) * 100),
  };
}

function confusionFromSignals(
  examplesAdded: number,
  corrections: number,
  labComplete: boolean,
  retrainDone: boolean,
  allFinalSolved: boolean,
  /** Неверные решения в лаборатории качества — «ломают» проверочную картину до исправления. */
  labMistakes: number,
): L2Metrics["confusion"] {
  const labNoise = clamp(labMistakes, 0, 8);
  const base = 8 + examplesAdded * 2 + corrections;
  let tp = Math.round(base * 0.38) + (labComplete ? 2 : 0) + (retrainDone ? 3 : 0) + (allFinalSolved ? 2 : 0);
  let tn = Math.round(base * 0.35) + (labComplete ? 1 : 0) + (retrainDone ? 2 : 0) + (allFinalSolved ? 1 : 0);
  let fp = Math.max(1, Math.round(base * 0.14) - corrections + (labComplete ? -1 : 0) - (retrainDone ? 2 : 0) - (allFinalSolved ? 1 : 0));
  let fn = Math.max(1, Math.round(base * 0.13) - Math.floor(corrections / 2) + (retrainDone ? -1 : 0) - (allFinalSolved ? 1 : 0));
  if (!labComplete && labNoise > 0) {
    fp += Math.ceil(labNoise / 2);
    fn += Math.floor(labNoise / 2);
    tp = Math.max(3, tp - 1);
  }
  fp = clamp(fp, 1, 18);
  fn = clamp(fn, 1, 16);
  tp = clamp(tp, 4, 40);
  tn = clamp(tn, 4, 40);
  return { tp, fp, tn, fn };
}

export function l2ComputeMetrics(input: {
  examplesAdded: number;
  corrections: number;
  accuracyHud: number;
  labComplete: boolean;
  retrainDone: boolean;
  allFinalSolved?: boolean;
  /** Сколько раз ученик ошибся в лаборатории (до завершения лаборатории влияет на «валидацию»). */
  labMistakes?: number;
}): L2Metrics {
  const {
    examplesAdded,
    corrections,
    accuracyHud,
    labComplete,
    retrainDone,
    allFinalSolved = false,
    labMistakes = 0,
  } = input;
  const cm = confusionFromSignals(
    examplesAdded,
    corrections,
    labComplete,
    retrainDone,
    allFinalSolved,
    labMistakes,
  );
  const total = cm.tp + cm.fp + cm.tn + cm.fn;
  const acc = (cm.tp + cm.tn) / total;
  const prec = cm.tp / Math.max(1, cm.tp + cm.fp);
  const rec = cm.tp / Math.max(1, cm.tp + cm.fn);
  const f1 = (2 * prec * rec) / Math.max(1e-6, prec + rec);
  const hudBlend = clamp(accuracyHud / 100, 0.45, 0.96);
  const blendedAcc = clamp(acc * 0.55 + hudBlend * 0.45, 0.48, 0.95);
  const scale = blendedAcc / Math.max(1e-6, acc);
  return {
    accuracy: round1(blendedAcc * 100),
    precision: round1(prec * scale * 100),
    recall: round1(rec * scale * 100),
    f1: round1(f1 * scale * 100),
    confusion: cm,
  };
}

export type L2MistakeRow = {
  id: string;
  truth: MsgClass;
  modelSays: MsgClass;
  kind: "ложноположительный" | "ложноотрицательный" | "пограничный";
  snippet: string;
  why: string;
};

export const L2_ERROR_ANALYSIS_ROWS: L2MistakeRow[] = [
  {
    id: "e1",
    truth: "важное",
    modelSays: "спам",
    kind: "ложноотрицательный",
    snippet: "Бесплатная линия поддержки открыта ночью…",
    why: "Триггеры «бесплатно» и восклицания перетягивают вес в сторону рекламы — без контекста школы.",
  },
  {
    id: "e2",
    truth: "спам",
    modelSays: "важное",
    kind: "ложноположительный",
    snippet: "Ты выиграл приз — отправь СМС на короткий номер…",
    why: "Модель цепляется за вежливый тон и длину текста, а не за опасный призыв к действию.",
  },
  {
    id: "e3",
    truth: "важное",
    modelSays: "спам",
    kind: "пограничный",
    snippet: "Спасибо!!! За урок!!! Вы клевые!!!",
    why: "Шум и повтор «!!!» похожи на крик рекламы — граница классов размыта, нужны похожие «спокойные» примеры.",
  },
];
