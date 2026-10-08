export function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];

  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }

  return result;
}

export function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toNullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

export function excelSerialToIsoDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    return null;
  }

  const unixMs = Math.round((num - 25569) * 86400 * 1000);
  const date = new Date(unixMs);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

export function parseBooleanYN(value: unknown): boolean | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const normalized = String(value).trim().toUpperCase();
  if (normalized === "Y" || normalized === "YES" || normalized === "TRUE") {
    return true;
  }

  if (normalized === "N" || normalized === "NO" || normalized === "FALSE") {
    return false;
  }

  return null;
}
