import { describe, expect, it } from "vitest";
import { buildAggregateStatement, buildListRowsStatement } from "./query";

describe("chat query safety", () => {
  it("rejects unknown tables", () => {
    expect(() =>
      buildListRowsStatement({
        table: "not_a_real_table",
      }),
    ).toThrow("Unknown table");
  });

  it("rejects unknown columns", () => {
    expect(() =>
      buildListRowsStatement({
        table: "devices",
        columns: ["device_name", "nope_column"],
      }),
    ).toThrow("Unknown column");
  });

  it("parameterizes filter values", () => {
    const statement = buildListRowsStatement({
      table: "devices",
      filters: [
        {
          column: "device_name",
          op: "contains",
          value: "' OR 1=1 --",
        },
      ],
      limit: 10,
    });

    expect(statement.text).toContain("$1");
    expect(statement.text).not.toContain("' OR 1=1 --");
    expect(statement.values[0]).toBe("%' OR 1=1 --%");
  });

  it("enforces max row limit", () => {
    const statement = buildListRowsStatement(
      {
        table: "devices",
        limit: 10_000,
      },
      { maxRows: 200 },
    );

    expect(statement.values.at(-2)).toBe(200);
  });

  it("routes device table reads through temporal source when asOfDate is provided", () => {
    const statement = buildListRowsStatement(
      {
        table: "devices",
        limit: 10,
      },
      {
        asOfDate: "2028-01-01",
      },
    );

    expect(statement.text).toContain("WITH input_params AS");
    expect(statement.text).toContain("FROM effective_devices t");
    expect(statement.values[0]).toBe(true);
    expect(statement.values[1]).toBe("2028-01-01");
  });

  it("rejects unsupported aggregate operation for non-numeric columns", () => {
    expect(() =>
      buildAggregateStatement({
        table: "devices",
        metrics: [{ fn: "sum", column: "device_name", as: "sum_device_name" }],
      }),
    ).toThrow("requires a numeric column");
  });
});
