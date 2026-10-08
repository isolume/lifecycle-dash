import { describe, expect, it } from "vitest";
import { computeWeightedAverageRisk } from "./aggregation";

describe("weighted risk aggregation", () => {
  it("computes weighted average by device count", () => {
    const value = computeWeightedAverageRisk([
      { riskScoreAvg: 90, deviceCount: 10 },
      { riskScoreAvg: 30, deviceCount: 30 },
    ]);

    expect(value).toBeCloseTo(45, 5);
  });

  it("returns null when there are no usable rows", () => {
    expect(computeWeightedAverageRisk([])).toBeNull();
    expect(computeWeightedAverageRisk([{ riskScoreAvg: 10, deviceCount: 0 }])).toBeNull();
  });
});
