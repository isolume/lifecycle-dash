import { describe, expect, it } from "vitest";
import { parseDateParam } from "./api";

describe("API param parsing", () => {
  it("accepts valid ISO date strings", () => {
    expect(parseDateParam("2026-03-01")).toBe("2026-03-01");
  });

  it("rejects malformed or impossible dates", () => {
    expect(parseDateParam("03/01/2026")).toBeUndefined();
    expect(parseDateParam("2026-02-30")).toBeUndefined();
    expect(parseDateParam("2026-13-01")).toBeUndefined();
  });

  it("returns fallback when input is missing or invalid", () => {
    expect(parseDateParam(null, "2026-03-01")).toBe("2026-03-01");
    expect(parseDateParam("not-a-date", "2026-03-01")).toBe("2026-03-01");
  });
});
