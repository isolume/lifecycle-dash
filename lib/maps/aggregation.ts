export interface WeightedRiskInput {
  riskScoreAvg: number;
  deviceCount: number;
}

export function computeWeightedAverageRisk(rows: WeightedRiskInput[]): number | null {
  let weightedSum = 0;
  let totalDevices = 0;

  for (const row of rows) {
    if (!Number.isFinite(row.riskScoreAvg) || !Number.isFinite(row.deviceCount) || row.deviceCount <= 0) {
      continue;
    }

    weightedSum += row.riskScoreAvg * row.deviceCount;
    totalDevices += row.deviceCount;
  }

  if (totalDevices === 0) {
    return null;
  }

  return weightedSum / totalDevices;
}
