export type DashboardMetricSlug =
  | "active-devices"
  | "high-risk-devices"
  | "past-eol-devices"
  | "estimated-refresh-cost"
  | "high-risk-sites";

export interface MetricScopeFilters {
  includeExceptions: boolean;
  includeOutOfScope?: boolean;
  includeDecomSites?: boolean;
  state?: string;
  affiliate?: string;
  deviceType?: string;
  county?: string;
  countyFips?: string;
}

export function buildMetricDetailHref(metric: DashboardMetricSlug, filters: MetricScopeFilters): string {
  const search = new URLSearchParams();

  if (filters.includeExceptions) {
    search.set("includeExceptions", "true");
  }
  if (filters.includeOutOfScope) {
    search.set("includeOutOfScope", "true");
  }
  if (filters.includeDecomSites) {
    search.set("includeDecomSites", "true");
  }

  if (filters.state) {
    search.set("state", filters.state);
  }

  if (filters.affiliate) {
    search.set("affiliate", filters.affiliate);
  }

  if (filters.deviceType) {
    search.set("deviceType", filters.deviceType);
  }

  if (filters.county) {
    search.set("county", filters.county);
  }

  if (filters.countyFips) {
    search.set("countyFips", filters.countyFips);
  }

  const query = search.toString();
  const basePath = `/dashboard/list/${metric}`;

  return query ? `${basePath}?${query}` : basePath;
}
