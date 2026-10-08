import { describe, expect, it } from "vitest";
import {
  applyContextFiltersToToolCall,
  trimToRecentTurns,
} from "./orchestrator";

describe("chat orchestrator helpers", () => {
  it("trims to recent turns", () => {
    const history = Array.from({ length: 12 }).map((_, index) => ({
      role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `m-${index}`,
    }));

    const trimmed = trimToRecentTurns(history, 3);
    expect(trimmed).toHaveLength(6);
    expect(trimmed[0]?.content).toBe("m-6");
  });

  it("applies context filters and switches to effective view when exceptions are excluded", () => {
    const call = applyContextFiltersToToolCall(
      {
        tool: "aggregate",
        table: "devices",
        metrics: [{ fn: "count", as: "device_count" }],
      },
      {
        includeExceptions: false,
        state: "GA",
        deviceType: "Switch",
      },
    );

    expect(call.table).toBe("v_device_effective");
    expect(call.filters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          column: "state_code",
          op: "eq",
          value: "GA",
        }),
        expect.objectContaining({
          column: "device_type",
          op: "eq",
          value: "Switch",
        }),
      ]),
    );
  });

});
