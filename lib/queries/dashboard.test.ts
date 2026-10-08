import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { getTimePreviewBounds } from "./dashboard";
import { localIsoDate } from "../time/date";

describe("dashboard query helpers", () => {
  it("maps timeline bounds row into API shape", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            min_date: "2026-03-01",
            max_date: "2030-12-31",
            default_date: "2026-03-01",
          },
        ],
      }),
    } as unknown as Pool;

    const result = await getTimePreviewBounds(pool);

    expect(result).toEqual({
      minDate: "2026-03-01",
      maxDate: "2030-12-31",
      defaultDate: "2026-03-01",
    });
  });

  it("falls back to today's date when query returns no rows", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    } as unknown as Pool;

    const result = await getTimePreviewBounds(pool);
    const today = localIsoDate();

    expect(result).toEqual({
      minDate: today,
      maxDate: today,
      defaultDate: today,
    });
  });
});
