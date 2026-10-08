export const REFERENCE_DATE = new Date("2026-02-28T00:00:00.000Z");
export const WINDOW_MONTHS_DEFAULT = 6;
export const RADIUS_MILES_DEFAULT = 5;
export const HIGH_RISK_MIN = 65;

export const SOURCE_PRIORITY: Record<string, number> = {
  NA: 1,
  PrimeAP: 2,
  PrimeWLC: 3,
  CatCtr: 4,
};

export const REQUIRED_SHEETS = [
  "SOLID",
  "SOLID-Loc",
  "NA",
  "PrimeAP",
  "PrimeWLC",
  "CatCtr",
  "Decom",
  "ModelData",
  "Pricing",
  "Glossary",
] as const;

export const RISK_BUCKETS = {
  criticalMin: 80,
  highMin: 65,
  mediumMin: 45,
} as const;
