import type { PvpSideWinner } from "./arena-scoring";

export type ArenaPvpHistoryEntry = {
  id: string;
  opponentEmail: string;
  opponentAlias: string | null;
  missionId: string;
  missionTitle: string;
  winner: PvpSideWinner;
  at: number;
};

const MAX = 50;

export function pvpHistoryKey(studentEmail: string): string {
  return `student-arena-pvp-history:${studentEmail.trim() || "anon"}`;
}

export function loadPvpHistory(studentEmail: string): ArenaPvpHistoryEntry[] {
  try {
    const raw = localStorage.getItem(pvpHistoryKey(studentEmail));
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x) => {
        if (!x || typeof x !== "object") return null;
        const o = x as Record<string, unknown>;
        const winner = o.winner;
        const w =
          winner === "you" || winner === "opponent" || winner === "draw" ? winner : ("draw" as PvpSideWinner);
        return {
          id: String(o.id ?? ""),
          opponentEmail: String(o.opponentEmail ?? ""),
          opponentAlias: o.opponentAlias != null ? String(o.opponentAlias) : null,
          missionId: String(o.missionId ?? ""),
          missionTitle: String(o.missionTitle ?? ""),
          winner: w,
          at: Number(o.at) || 0,
        } satisfies ArenaPvpHistoryEntry;
      })
      .filter((e): e is ArenaPvpHistoryEntry => Boolean(e?.id && e.opponentEmail));
  } catch {
    return [];
  }
}

export function appendPvpHistory(studentEmail: string, entry: Omit<ArenaPvpHistoryEntry, "id" | "at">): void {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const full: ArenaPvpHistoryEntry = { ...entry, id, at: Date.now() };
  const prev = loadPvpHistory(studentEmail);
  const next = [full, ...prev].slice(0, MAX);
  localStorage.setItem(pvpHistoryKey(studentEmail), JSON.stringify(next));
}
