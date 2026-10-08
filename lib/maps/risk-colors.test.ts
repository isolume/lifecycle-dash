import { describe, expect, it } from "vitest";
import { getRiskColor, MAP_NO_DATA_COLOR } from "./risk-colors";

describe("risk color mapping", () => {
  it("returns gray for missing data", () => {
    expect(getRiskColor(null)).toBe(MAP_NO_DATA_COLOR);
    expect(getRiskColor(undefined)).toBe(MAP_NO_DATA_COLOR);
  });

  it("clamps values to 0-100 range", () => {
    expect(getRiskColor(-25)).toBe(getRiskColor(0));
    expect(getRiskColor(120)).toBe(getRiskColor(100));
  });

  it("varies color with risk (green = low, red = high)", () => {
    expect(getRiskColor(20)).not.toBe(getRiskColor(80));
    expect(getRiskColor(0)).not.toBe(getRiskColor(100));
  });
});
