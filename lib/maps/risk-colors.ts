const NO_DATA_COLOR = "#d1d5db";

// Red-only scale: light → very dark. 9 steps, highly defined (percentile buckets).
const RED_ONLY = [
  "#fecaca", "#fca5a5", "#f87171", "#ef4444", "#dc2626",
  "#b91c1c", "#991b1b", "#7f1d1d", "#450a0a",
];

const ALL_COLORS = RED_ONLY;

/** Percentile rank 0–1 (0 = best, 1 = worst). Equal counts in each of 9 buckets. */
export function getRiskColorByPercentile(rank: number): string {
  const t = Math.max(0, Math.min(1, rank));
  const i = Math.min(8, Math.floor(t * 9));
  return ALL_COLORS[i];
}

const REDS_SCORE = ["#fecaca", "#f87171", "#dc2626", "#991b1b"]; // for getRiskColor score-based

export function getRiskColor(score: number | null | undefined): string {
  if (typeof score !== "number" || Number.isNaN(score)) {
    return NO_DATA_COLOR;
  }

  const s = Math.max(0, Math.min(100, score));
  const i = Math.min(3, Math.floor((s / 100) * 4));
  return REDS_SCORE[i];
}

export function isRiskDataAvailable(score: number | null | undefined): boolean {
  return typeof score === "number" && Number.isFinite(score);
}

export const MAP_NO_DATA_COLOR = NO_DATA_COLOR;

/** All 9 reds in order (light → darkest) for legends. */
export function getRiskColorPalette(): string[] {
  return [...ALL_COLORS];
}
