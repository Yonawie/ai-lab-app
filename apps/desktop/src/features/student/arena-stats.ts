export type ArenaStats = {
  battles: number;
  wins: number;
  losses: number;
  draws: number;
  xp: number;
};

const DEFAULT: ArenaStats = { battles: 0, wins: 0, losses: 0, draws: 0, xp: 0 };

export function arenaStatsKey(studentEmail: string): string {
  return `student-arena-stats:${studentEmail.trim() || "anon"}`;
}

export function loadArenaStats(studentEmail: string): ArenaStats {
  try {
    const raw = localStorage.getItem(arenaStatsKey(studentEmail));
    if (!raw) return { ...DEFAULT };
    const o = JSON.parse(raw) as Partial<ArenaStats>;
    return {
      battles: Math.max(0, Number(o.battles) || 0),
      wins: Math.max(0, Number(o.wins) || 0),
      losses: Math.max(0, Number(o.losses) || 0),
      draws: Math.max(0, Number(o.draws) || 0),
      xp: Math.max(0, Number(o.xp) || 0),
    };
  } catch {
    return { ...DEFAULT };
  }
}

export function saveArenaStats(studentEmail: string, stats: ArenaStats): void {
  localStorage.setItem(arenaStatsKey(studentEmail), JSON.stringify(stats));
}

/** wins = trained model wins duel (student side). */
export function applyDuelOutcome(
  stats: ArenaStats,
  outcome: "trained" | "base" | "draw",
  xpGain: number,
): ArenaStats {
  const next = { ...stats, battles: stats.battles + 1, xp: stats.xp + xpGain };
  if (outcome === "trained") return { ...next, wins: stats.wins + 1 };
  if (outcome === "base") return { ...next, losses: stats.losses + 1 };
  return { ...next, draws: stats.draws + 1 };
}
