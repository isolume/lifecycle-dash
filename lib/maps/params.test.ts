import { describe, expect, it } from "vitest";
import { normalizeCountyFips, normalizeSiteCode, normalizeStateCode } from "./params";

describe("map parameter normalization", () => {
  it("normalizes valid state codes", () => {
    expect(normalizeStateCode("ga")).toBe("GA");
    expect(normalizeStateCode("AL")).toBe("AL");
  });

  it("rejects invalid state codes", () => {
    expect(normalizeStateCode("GAX")).toBeNull();
    expect(normalizeStateCode("1A")).toBeNull();
  });

  it("normalizes county fips and site codes", () => {
    expect(normalizeCountyFips("01073")).toBe("01073");
    expect(normalizeCountyFips("1073")).toBeNull();
    expect(normalizeSiteCode(" xgp ")).toBe("XGP");
  });
});
