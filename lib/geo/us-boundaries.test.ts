import { describe, expect, it } from "vitest";
import { getCountyFipsForPoint, getCountyBoundariesForState, getStateBoundaries } from "./us-boundaries";

describe("US boundary utilities", () => {
  it("loads state and county boundaries", () => {
    expect(getStateBoundaries().length).toBeGreaterThan(50);
    expect(getCountyBoundariesForState("AL").length).toBeGreaterThan(50);
  });

  it("assigns county fips for known coordinates", () => {
    // Birmingham, AL (Jefferson County)
    expect(getCountyFipsForPoint("AL", 33.5186, -86.8104)).toBe("01073");

    // Atlanta, GA (Fulton County)
    expect(getCountyFipsForPoint("GA", 33.749, -84.388)).toBe("13121");
  });
});
