import { describe, expect, it } from "vitest";
import { buildTemporalQueryValues } from "./common";

describe("common query helpers", () => {
  it("builds temporal values with planning-first defaults", () => {
    expect(buildTemporalQueryValues(false, {})).toEqual([false, null, 6, false, false]);
  });

  it("passes explicit temporal planning overrides", () => {
    expect(
      buildTemporalQueryValues(true, {
        asOfDate: "2026-03-01",
        windowMonths: 12,
        includeOutOfScope: true,
        includeDecomSites: true,
      }),
    ).toEqual([true, "2026-03-01", 12, true, true]);
  });
});
