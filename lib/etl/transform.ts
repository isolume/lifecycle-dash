import { addMonths, isBefore } from "date-fns";
import { RISK_BUCKETS } from "../constants";

export interface ParsedNameCode {
  stateCode: string | null;
  siteCode: string | null;
}

export type LifecycleStatus = "Past EoL" | "Past EoS" | "EoL <= 6mo" | "EoS <= 6mo" | "Supported";
export type SupportCoverage = "Supported" | "Unsupported" | "Unknown";
export type SecurityRisk = "High" | "Medium" | "Low";

export function normalizeDeviceName(name: string | null | undefined): string | null {
  if (!name) {
    return null;
  }

  const normalized = name.trim().toUpperCase();
  return normalized.length ? normalized : null;
}

export function splitSerialNumbers(serial: string | null | undefined): Array<string | null> {
  if (!serial) {
    return [null];
  }

  const uniqueSerials = [...new Set(
    serial
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  )];

  if (!uniqueSerials.length) {
    return [null];
  }

  return uniqueSerials;
}

export function buildDeviceId(deviceName: string, serialNumber: string | null): string {
  return `${deviceName}::${serialNumber ?? "NO-SERIAL"}`;
}

export function deriveStateAndSiteCode(deviceName: string | null | undefined): ParsedNameCode {
  const name = normalizeDeviceName(deviceName);
  if (!name || name.length < 5) {
    return { stateCode: null, siteCode: null };
  }

  return {
    stateCode: name.slice(0, 2),
    siteCode: name.slice(2, 5),
  };
}

export function normalizeNaDeviceType(rawType: string | null | undefined): string | null {
  if (!rawType) {
    return null;
  }

  const normalized = rawType.trim().toLowerCase();

  if (normalized.includes("switch")) {
    return "Switch";
  }

  if (normalized.includes("router")) {
    return "Router";
  }

  if (normalized.includes("voice") || normalized.includes("gateway")) {
    return "Voice Gateway";
  }

  return null;
}

export function normalizeCatCtrFamily(rawFamily: string | null | undefined): string {
  const family = (rawFamily ?? "").trim().toLowerCase();

  if (family.includes("unified ap")) {
    return "Access Point";
  }

  if (family.includes("wireless controller")) {
    return "Wireless Controller";
  }

  if (family.includes("switch")) {
    return "Switch";
  }

  if (family.includes("router")) {
    return "Router";
  }

  if (!family) {
    return "Other";
  }

  return rawFamily!.trim();
}

export function normalizeModel(source: "NA" | "PrimeAP" | "PrimeWLC" | "CatCtr", model: string | null | undefined): string | null {
  if (!model) {
    return null;
  }

  let normalized = model.trim().toUpperCase();
  if (!normalized) {
    return null;
  }

  if (source === "CatCtr") {
    normalized = normalized.split(",")[0]?.trim() ?? normalized;
  }

  if (normalized === "NONE") {
    return null;
  }

  return normalized;
}

function toDate(date: Date | string | null | undefined): Date | null {
  if (!date) {
    return null;
  }

  if (date instanceof Date) {
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function classifyLifecycleStatus(
  eosDate: Date | string | null | undefined,
  eolDate: Date | string | null | undefined,
  referenceDate: Date,
  windowMonths = 6,
): LifecycleStatus {
  const eos = toDate(eosDate);
  const eol = toDate(eolDate);
  const windowEnd = addMonths(referenceDate, windowMonths);

  if (eol && isBefore(eol, referenceDate)) {
    return "Past EoL";
  }

  if (eos && isBefore(eos, referenceDate)) {
    return "Past EoS";
  }

  if (eol && eol <= windowEnd) {
    return "EoL <= 6mo";
  }

  if (eos && eos <= windowEnd) {
    return "EoS <= 6mo";
  }

  return "Supported";
}

export function lifecycleScore(status: LifecycleStatus): number {
  switch (status) {
    case "Past EoL":
      return 70;
    case "Past EoS":
      return 55;
    case "EoL <= 6mo":
      return 45;
    case "EoS <= 6mo":
      return 35;
    case "Supported":
    default:
      return 10;
  }
}

export function criticalityScore(deviceType: string): number {
  switch (deviceType) {
    case "Wireless Controller":
      return 10;
    case "Router":
      return 8;
    case "Switch":
      return 7;
    case "Voice Gateway":
      return 6;
    case "Access Point":
      return 5;
    default:
      return 4;
  }
}

export function calculateCostP95(costs: number[]): number {
  if (!costs.length) {
    return 0;
  }

  const sorted = [...costs].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  return sorted[index] ?? 0;
}

export function costScore(materialCost: number | null, p95: number): number {
  if (!materialCost || p95 <= 0) {
    return 0;
  }

  return (Math.min(materialCost, p95) / p95) * 20;
}

export function computeRiskScore(status: LifecycleStatus, deviceType: string, materialCost: number | null, p95: number): number {
  const score = lifecycleScore(status) + costScore(materialCost, p95) + criticalityScore(deviceType);
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function getRiskBucket(score: number): "Critical" | "High" | "Medium" | "Low" {
  if (score >= RISK_BUCKETS.criticalMin) {
    return "Critical";
  }

  if (score >= RISK_BUCKETS.highMin) {
    return "High";
  }

  if (score >= RISK_BUCKETS.mediumMin) {
    return "Medium";
  }

  return "Low";
}

export function deriveSupportCoverage(sourceSystem: string, supportLevel: string | null | undefined): SupportCoverage {
  if (sourceSystem !== "CatCtr") {
    return "Unknown";
  }

  const normalized = (supportLevel ?? "").trim().toLowerCase();
  if (!normalized) {
    return "Unknown";
  }

  if (normalized.includes("support") && normalized.includes("un")) {
    return "Unsupported";
  }

  if (normalized.includes("support")) {
    return "Supported";
  }

  return "Unknown";
}

export function deriveSecurityRisk(status: LifecycleStatus): SecurityRisk {
  switch (status) {
    case "Past EoL":
      return "High";
    case "Past EoS":
    case "EoL <= 6mo":
      return "Medium";
    case "EoS <= 6mo":
    case "Supported":
    default:
      return "Low";
  }
}
