import { describe, expect, it } from "vitest";
import { parseChatRequest } from "./request";

describe("chat request parsing", () => {
  it("trims history to last 6 messages", () => {
    const history = Array.from({ length: 10 }).map((_, index) => ({
      role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `message-${index}`,
    }));

    const parsed = parseChatRequest({
      message: "hello",
      history,
      context: {
        pathname: "/",
        filters: {},
      },
    });

    expect(parsed.history).toHaveLength(6);
    expect(parsed.history[0]?.content).toBe("message-4");
    expect(parsed.history[5]?.content).toBe("message-9");
  });

  it("rejects empty messages", () => {
    expect(() =>
      parseChatRequest({
        message: "   ",
        history: [],
        context: { pathname: "/", filters: {} },
      }),
    ).toThrow();
  });

  it("accepts an optional as-of date in context filters", () => {
    const parsed = parseChatRequest({
      message: "how many past eol devices",
      history: [],
      context: {
        pathname: "/",
        filters: {
          asOfDate: "2028-01-01",
        },
      },
    });

    expect(parsed.context.filters.asOfDate).toBe("2028-01-01");
  });
});
