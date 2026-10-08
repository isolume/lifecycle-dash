export interface MapFilterParams {
  includeExceptions: boolean;
  includeOutOfScope?: boolean;
  includeDecomSites?: boolean;
  affiliate?: string;
  deviceType?: string;
  state?: string;
}

export function parseMapFilterParams(params: URLSearchParams): MapFilterParams {
  return {
    includeExceptions: ["1", "true", "yes", "on"].includes((params.get("includeExceptions") ?? "").toLowerCase()),
    includeOutOfScope: ["1", "true", "yes", "on"].includes((params.get("includeOutOfScope") ?? "").toLowerCase()),
    includeDecomSites: ["1", "true", "yes", "on"].includes((params.get("includeDecomSites") ?? "").toLowerCase()),
    affiliate: params.get("affiliate") || undefined,
    deviceType: params.get("deviceType") || undefined,
    state: params.get("state") || undefined,
  };
}

export function buildMapFilterQuery(filters: MapFilterParams): string {
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

  if (filters.affiliate) {
    search.set("affiliate", filters.affiliate);
  }

  if (filters.deviceType) {
    search.set("deviceType", filters.deviceType);
  }

  if (filters.state) {
    search.set("state", filters.state);
  }

  return search.toString();
}
