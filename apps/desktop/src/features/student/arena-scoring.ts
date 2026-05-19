import type { ArenaMission } from "./arena-missions";

export type CategoryScores = {
  structure: number;
  clarity: number;
  tone: number;
  usefulness: number;
};

const POLITE = [
  "пожалуйста",
  "спасибо",
  "уважен",
  "понимаю",
  "важно",
  "давайте",
  "не переживай",
  "всё получится",
  "рады помочь",
  "бережно",
  "аккуратно",
];

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 0–100 heuristic */
export function scoreStructure(text: string): number {
  const t = text.trim();
  if (t.length < 20) return 25;
  let s = 35;
  if (/\n/.test(t)) s += 12;
  if (/\d+\./.test(t)) s += 15;
  if (/^[•\-*]\s/m.test(t) || /\n[•\-*]\s/.test(t)) s += 12;
  if (/шаг\s*\d|во-первых|во-вторых|итого|вывод/i.test(t)) s += 14;
  const paras = t.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length;
  if (paras >= 2) s += 12;
  return clamp(Math.round(s), 0, 100);
}

export function scoreClarity(text: string): number {
  const t = text.trim();
  if (t.length < 30) return 30;
  const sents = sentences(t);
  if (sents.length === 0) return 40;
  const lengths = sents.map((x) => x.split(/\s+/).length);
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  let s = 50;
  if (avg >= 6 && avg <= 22) s += 22;
  else if (avg > 22 && avg <= 32) s += 10;
  else s -= 8;
  const longRun = lengths.some((n) => n > 45);
  if (longRun) s -= 15;
  if (sents[0] && sents[0].length <= 140) s += 10;
  return clamp(Math.round(s), 0, 100);
}

export function scoreTone(text: string): number {
  const low = text.toLowerCase();
  let s = 38;
  for (const w of POLITE) {
    if (low.includes(w)) s += 8;
  }
  if (/!{2,}/.test(text)) s -= 10;
  if (/туп|идиот|заткнись/i.test(low)) s -= 35;
  return clamp(Math.round(s), 0, 100);
}

export function scoreUsefulness(text: string, mission: ArenaMission): number {
  const t = text.trim();
  let s = 40;
  const len = t.length;
  if (len >= 120 && len <= 1800) s += 22;
  else if (len < 80) s -= 18;
  else if (len > 3500) s -= 8;
  const low = t.toLowerCase();
  let hits = 0;
  for (const k of mission.keywords) {
    if (low.includes(k.toLowerCase())) hits += 1;
  }
  s += clamp(hits * 10, 0, 30);
  if (/например|к примеру|то есть/i.test(low)) s += 8;
  return clamp(Math.round(s), 0, 100);
}

export function scoreAll(text: string, mission: ArenaMission): CategoryScores {
  return {
    structure: scoreStructure(text),
    clarity: scoreClarity(text),
    tone: scoreTone(text),
    usefulness: scoreUsefulness(text, mission),
  };
}

function weightedTotal(scores: CategoryScores, w: ArenaMission["weights"]): number {
  const sumW = w.structure + w.clarity + w.tone + w.usefulness;
  if (sumW <= 0) return 0;
  return (
    (scores.structure * w.structure +
      scores.clarity * w.clarity +
      scores.tone * w.tone +
      scores.usefulness * w.usefulness) /
    sumW
  );
}

export type DuelScores = {
  base: CategoryScores;
  trained: CategoryScores;
  baseTotal: number;
  trainedTotal: number;
  categoryWinners: {
    structure: "base" | "trained" | "draw";
    clarity: "base" | "trained" | "draw";
    tone: "base" | "trained" | "draw";
    usefulness: "base" | "trained" | "draw";
  };
  roundWinner: "base" | "trained" | "draw";
};

export function computeDuelScores(
  baseText: string,
  trainedText: string | null,
  mission: ArenaMission,
): DuelScores | null {
  if (!trainedText) return null;
  const base = scoreAll(baseText, mission);
  const trained = scoreAll(trainedText, mission);
  const baseTotal = weightedTotal(base, mission.weights);
  const trainedTotal = weightedTotal(trained, mission.weights);
  const eps = 1.5;
  const cat = (a: number, b: number): "base" | "trained" | "draw" => {
    if (Math.abs(a - b) < 3) return "draw";
    return a > b ? "base" : "trained";
  };
  const categoryWinners = {
    structure: cat(base.structure, trained.structure),
    clarity: cat(base.clarity, trained.clarity),
    tone: cat(base.tone, trained.tone),
    usefulness: cat(base.usefulness, trained.usefulness),
  };
  let roundWinner: "base" | "trained" | "draw" = "draw";
  if (baseTotal - trainedTotal > eps) roundWinner = "base";
  else if (trainedTotal - baseTotal > eps) roundWinner = "trained";
  return {
    base,
    trained,
    baseTotal: Math.round(baseTotal * 10) / 10,
    trainedTotal: Math.round(trainedTotal * 10) / 10,
    categoryWinners,
    roundWinner,
  };
}

export type PvpSideWinner = "you" | "opponent" | "draw";

export type PvpDuelScores = {
  you: CategoryScores;
  opponent: CategoryScores;
  youTotal: number;
  opponentTotal: number;
  categoryWinners: {
    structure: PvpSideWinner;
    clarity: PvpSideWinner;
    tone: PvpSideWinner;
    usefulness: PvpSideWinner;
  };
  roundWinner: PvpSideWinner;
};

/** Дуэль двух обученных ответов: «ты» vs «соперник». */
export function computePvpDuelScores(
  youText: string,
  opponentText: string | null,
  mission: ArenaMission,
): PvpDuelScores | null {
  if (!opponentText) return null;
  const you = scoreAll(youText, mission);
  const opponent = scoreAll(opponentText, mission);
  const youTotal = weightedTotal(you, mission.weights);
  const opponentTotal = weightedTotal(opponent, mission.weights);
  const eps = 1.5;
  const cat = (a: number, b: number): PvpSideWinner => {
    if (Math.abs(a - b) < 3) return "draw";
    return a > b ? "you" : "opponent";
  };
  const categoryWinners = {
    structure: cat(you.structure, opponent.structure),
    clarity: cat(you.clarity, opponent.clarity),
    tone: cat(you.tone, opponent.tone),
    usefulness: cat(you.usefulness, opponent.usefulness),
  };
  let roundWinner: PvpSideWinner = "draw";
  if (youTotal - opponentTotal > eps) roundWinner = "you";
  else if (opponentTotal - youTotal > eps) roundWinner = "opponent";
  return {
    you,
    opponent,
    youTotal: Math.round(youTotal * 10) / 10,
    opponentTotal: Math.round(opponentTotal * 10) / 10,
    categoryWinners,
    roundWinner,
  };
}
