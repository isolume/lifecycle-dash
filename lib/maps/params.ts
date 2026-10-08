const STATE_CODE_REGEX = /^[A-Z]{2}$/;
const COUNTY_FIPS_REGEX = /^\d{5}$/;

export function normalizeStateCode(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return STATE_CODE_REGEX.test(normalized) ? normalized : null;
}

export function normalizeCountyFips(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  return COUNTY_FIPS_REGEX.test(normalized) ? normalized : null;
}

export function normalizeSiteCode(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}
