import { describe, expect, it } from "vitest";
import {
  buildDeviceId,
  calculateCostP95,
  classifyLifecycleStatus,
  computeRiskScore,
  deriveSecurityRisk,
  deriveSupportCoverage,
  deriveStateAndSiteCode,
  getRiskBucket,
  normalizeModel,
  normalizeNaDeviceType,
  splitSerialNumbers,
} from "./transform";

const REFERENCE = new Date("2026-02-28T00:00:00.000Z");

describe("ETL transform helpers", () => {
  it("maps NA device type to required categories", () => {
    expect(normalizeNaDeviceType("L3Switch")).toBe("Switch");
    expect(normalizeNaDeviceType("Router")).toBe("Router");
    expect(normalizeNaDeviceType("Voice Gateway")).toBe("Voice Gateway");
    expect(normalizeNaDeviceType("Firewall")).toBeNull();
  });

  it("splits CatCtr stacked platform id models", () => {
    expect(normalizeModel("CatCtr", "C9200-48P, C9200-48P")).toBe("C9200-48P");
  });

  it("splits comma-delimited serial values into distinct units", () => {
    expect(splitSerialNumbers("ABC123, DEF456,ABC123")).toEqual(["ABC123", "DEF456"]);
    expect(splitSerialNumbers("")).toEqual([null]);
    expect(buildDeviceId("GAXGPWLGUEST01", null)).toBe("GAXGPWLGUEST01::NO-SERIAL");
  });

  it("derives state and site code from host naming", () => {
    expect(deriveStateAndSiteCode("GAXGPWLGUEST01")).toEqual({
      stateCode: "GA",
      siteCode: "XGP",
    });
  });

  it("classifies lifecycle status with 6 month window", () => {
    expect(classifyLifecycleStatus("2024-01-01", "2025-12-31", REFERENCE, 6)).toBe("Past EoL");
    expect(classifyLifecycleStatus("2024-01-01", "2026-05-01", REFERENCE, 6)).toBe("Past EoS");
    expect(classifyLifecycleStatus("2026-04-01", "2026-07-31", REFERENCE, 6)).toBe("EoL <= 6mo");
    expect(classifyLifecycleStatus("2026-07-15", "2027-02-01", REFERENCE, 6)).toBe("EoS <= 6mo");
    expect(classifyLifecycleStatus("2027-01-01", "2028-01-01", REFERENCE, 6)).toBe("Supported");
  });

  it("produces bounded risk scores and risk buckets", () => {
    const p95 = calculateCostP95([200, 400, 600, 800, 1000]);
    const score = computeRiskScore("Past EoL", "Wireless Controller", 1200, p95);

    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
    expect(getRiskBucket(score)).toBe("Critical");
  });

  it("derives support coverage and lifecycle security proxy values", () => {
    expect(deriveSupportCoverage("CatCtr", "Supported")).toBe("Supported");
    expect(deriveSupportCoverage("CatCtr", "Unsupported")).toBe("Unsupported");
    expect(deriveSupportCoverage("NA", "Supported")).toBe("Unknown");
    expect(deriveSecurityRisk("Past EoL")).toBe("High");
    expect(deriveSecurityRisk("Past EoS")).toBe("Medium");
    expect(deriveSecurityRisk("Supported")).toBe("Low");
  });
});
