export function addAsOfDateParam(
  params: URLSearchParams,
  asOfDate?: string,
): URLSearchParams {
  if (asOfDate) {
    params.set("asOfDate", asOfDate);
  }

  return params;
}

export function withAsOfDate(url: string, asOfDate?: string): string {
  if (!asOfDate) {
    return url;
  }

  const [path, query = ""] = url.split("?");
  const params = new URLSearchParams(query);
  params.set("asOfDate", asOfDate);
  const nextQuery = params.toString();
  return nextQuery ? `${path}?${nextQuery}` : path;
}

export function normalizeToMonthStart(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return isoDate;
  }

  parsed.setUTCDate(1);
  return parsed.toISOString().slice(0, 10);
}

export function clampIsoDate(date: string, minDate: string, maxDate: string): string {
  if (date < minDate) {
    return minDate;
  }

  if (date > maxDate) {
    return maxDate;
  }

  return date;
}

