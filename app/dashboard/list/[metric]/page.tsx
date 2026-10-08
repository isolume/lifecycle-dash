"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PaginationControls } from "@/components/dashboard/pagination-controls";
import { useTimePreview } from "@/components/time/time-preview-provider";
import { buildMapFilterQuery } from "@/lib/maps/filter-query";
import { getStateDisplayName } from "@/lib/geo/us-state-names";
import type { ApiListResult, SiteListItem } from "@/lib/types";

interface DeviceRow {
  deviceId: string;
  deviceName: string;
  serialNumber: string | null;
  sourceSystem: string;
  deviceType: string;
  model: string;
  siteCode: string | null;
  stateCode: string | null;
  affiliate: string | null;
  county: string | null;
  lifecycleStatus: string;
  riskBucket: string;
  riskScore: number;
  estimatedRefreshCost: number;
  hasActiveException: boolean;
}

type MetricKind = "devices" | "sites";

interface MetricConfig {
  title: string;
  description: string;
  kind: MetricKind;
}

const METRIC_CONFIGS: Record<string, MetricConfig> = {
  "active-devices": {
    title: "Active Devices",
    description: "All active devices for the selected scope.",
    kind: "devices",
  },
  "high-risk-devices": {
    title: "High Risk Devices",
    description: "Devices with risk score 65 or higher.",
    kind: "devices",
  },
  "past-eol-devices": {
    title: "Past EoL Devices",
    description: "Devices whose lifecycle status is Past EoL.",
    kind: "devices",
  },
  "estimated-refresh-cost": {
    title: "Estimated Refresh Cost",
    description: "Devices contributing to estimated refresh cost in this scope.",
    kind: "devices",
  },
  "high-risk-sites": {
    title: "High-Risk Sites",
    description: "Sites with at least one high-risk device.",
    kind: "sites",
  },
};

function parseBoolean(value: string | null): boolean {
  return ["1", "true", "yes", "on"].includes((value ?? "").toLowerCase());
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function buildDashboardQuery({
  includeExceptions,
  includeOutOfScope,
  includeDecomSites,
  state,
  affiliate,
  deviceType,
}: {
  includeExceptions: boolean;
  includeOutOfScope?: boolean;
  includeDecomSites?: boolean;
  state?: string;
  affiliate?: string;
  deviceType?: string;
}): string {
  const search = new URLSearchParams();

  if (includeExceptions) {
    search.set("includeExceptions", "true");
  }
  if (includeOutOfScope) {
    search.set("includeOutOfScope", "true");
  }
  if (includeDecomSites) {
    search.set("includeDecomSites", "true");
  }

  if (state) {
    search.set("state", state);
  }

  if (affiliate) {
    search.set("affiliate", affiliate);
  }

  if (deviceType) {
    search.set("deviceType", deviceType);
  }

  return search.toString();
}

export default function MetricListPage() {
  const { asOfDate, setScope } = useTimePreview();
  const params = useParams<{ metric: string }>();
  const searchParams = useSearchParams();

  const metric = String(params.metric ?? "");
  const metricConfig = METRIC_CONFIGS[metric];

  const includeExceptions = parseBoolean(searchParams.get("includeExceptions"));
  const includeOutOfScope = parseBoolean(searchParams.get("includeOutOfScope"));
  const includeDecomSites = parseBoolean(searchParams.get("includeDecomSites"));
  const state = searchParams.get("state") || undefined;
  const affiliate = searchParams.get("affiliate") || undefined;
  const deviceType = searchParams.get("deviceType") || undefined;
  const county = searchParams.get("county") || undefined;
  const countyFips = searchParams.get("countyFips") || undefined;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [deviceRows, setDeviceRows] = useState<ApiListResult<DeviceRow> | null>(null);
  const [siteRows, setSiteRows] = useState<ApiListResult<SiteListItem> | null>(null);

  useEffect(() => {
    setPage(1);
  }, [metric, includeDecomSites, includeExceptions, includeOutOfScope, state, affiliate, deviceType, county]);

  useEffect(() => {
    if (!metricConfig) {
      setLoading(false);
      setError("Unknown metric");
      return;
    }

    let active = true;

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);

      const query = new URLSearchParams();
      if (includeExceptions) query.set("includeExceptions", "true");
      if (includeOutOfScope) query.set("includeOutOfScope", "true");
      if (includeDecomSites) query.set("includeDecomSites", "true");
      if (state) query.set("state", state);
      if (affiliate) query.set("affiliate", affiliate);
      if (deviceType) query.set("deviceType", deviceType);
      if (county) query.set("county", county);
      if (asOfDate) query.set("asOfDate", asOfDate);
      query.set("page", String(page));
      query.set("pageSize", "25");

      try {
        if (metricConfig.kind === "devices") {
          if (metric === "high-risk-devices") {
            query.set("riskMin", "65");
          }

          if (metric === "past-eol-devices") {
            query.set("lifecycleStatus", "Past EoL");
          }

          const response = await fetch(`/api/devices?${query.toString()}`, { cache: "no-store" });
          if (!response.ok) {
            throw new Error(`Request failed (${response.status})`);
          }

          const payload = (await response.json()) as ApiListResult<DeviceRow>;
          if (!active) {
            return;
          }

          setDeviceRows(payload);
          setSiteRows(null);
        } else {
          query.set("highRiskOnly", "true");

          const response = await fetch(`/api/dashboard/sites?${query.toString()}`, { cache: "no-store" });
          if (!response.ok) {
            throw new Error(`Request failed (${response.status})`);
          }

          const payload = (await response.json()) as ApiListResult<SiteListItem>;
          if (!active) {
            return;
          }

          setSiteRows(payload);
          setDeviceRows(null);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load metric list");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [affiliate, asOfDate, county, deviceType, includeDecomSites, includeExceptions, includeOutOfScope, metric, metricConfig, page, state]);

  useEffect(() => {
    setScope({
      includeExceptions,
      includeOutOfScope,
      includeDecomSites,
      state,
      affiliate,
      county,
      deviceType,
    });
  }, [affiliate, county, deviceType, includeDecomSites, includeExceptions, includeOutOfScope, setScope, state]);

  const currentResult = metricConfig?.kind === "sites" ? siteRows : deviceRows;
  const totalPages = currentResult ? Math.max(1, Math.ceil(currentResult.total / currentResult.pageSize)) : 1;

  const scopeLabel = useMemo(() => {
    const stateName = getStateDisplayName(state);

    if (county && state) {
      return `${county}, ${stateName}`;
    }

    if (state) {
      return stateName;
    }

    return "United States";
  }, [county, state]);

  const mapQuery = buildMapFilterQuery({
    includeExceptions,
    includeOutOfScope,
    includeDecomSites,
    affiliate,
    deviceType,
    state,
  });

  const dashboardQuery = buildDashboardQuery({
    includeExceptions,
    includeOutOfScope,
    includeDecomSites,
    state,
    affiliate,
    deviceType,
  });

  const backHref = state
    ? countyFips
      ? (mapQuery
        ? `/map/state/${state}/county/${countyFips}?${mapQuery}`
        : `/map/state/${state}/county/${countyFips}`)
      : (mapQuery ? `/map/state/${state}?${mapQuery}` : `/map/state/${state}`)
    : (dashboardQuery ? `/?${dashboardQuery}` : "/");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {metricConfig?.title ?? "Metric"} List
          </h1>
          <p className="mt-2 text-sm text-foreground/60">
            {metricConfig?.description ?? "Metric details"} Scope: {scopeLabel}.
          </p>
        </div>
        <Link href={backHref} className="btn btn-secondary">
          Back
        </Link>
      </div>

      {error ? (
        <p className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <section className="border border-card-border bg-card-bg p-5">
        {loading ? (
          <div className="space-y-2 py-8">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="skeleton h-10 w-full" />
            ))}
          </div>
        ) : metricConfig?.kind === "sites" ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Location</th>
                  <th>Avg Risk</th>
                  <th>Devices</th>
                  <th>High Risk</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                {siteRows?.data.map((site) => (
                  <tr key={site.siteCode}>
                    <td>
                      <div className="font-semibold text-foreground">{site.siteCode}</div>
                      <div className="text-xs text-foreground/50">{site.siteName || "Unnamed Site"}</div>
                    </td>
                    <td className="text-foreground/80">
                      {[getStateDisplayName(site.stateCode), site.county].filter(Boolean).join(" / ") || "Unknown"}
                    </td>
                    <td className="text-foreground/80">{site.riskScoreAvg.toFixed(1)}</td>
                    <td className="font-data text-foreground/80">{site.deviceCount}</td>
                    <td className="font-data text-foreground/80">{site.highRiskCount}</td>
                    <td className="font-data text-foreground/80">{formatCurrency(site.estimatedRefreshCost)}</td>
                  </tr>
                ))}
                {siteRows && siteRows.data.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-foreground/50">
                      No matching sites.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr>
                  <th>Device</th>
                  <th>Type</th>
                  <th>Model</th>
                  <th>Location</th>
                  <th>Lifecycle</th>
                  <th>Risk</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                {deviceRows?.data.map((device) => (
                  <tr key={device.deviceId}>
                    <td>
                      <div className="font-semibold text-foreground">{device.deviceName}</div>
                      <div className="text-xs text-foreground/50">{device.sourceSystem}</div>
                    </td>
                    <td className="text-foreground/80">{device.deviceType}</td>
                    <td className="text-foreground/80">{device.model}</td>
                    <td className="text-foreground/80">
                      {[getStateDisplayName(device.stateCode), device.county].filter(Boolean).join(" / ") || "Unknown"}
                    </td>
                    <td className="text-foreground/80">{device.lifecycleStatus}</td>
                    <td className="text-foreground/80">
                      {device.riskScore} ({device.riskBucket})
                    </td>
                    <td className="font-data text-foreground/80">{formatCurrency(device.estimatedRefreshCost)}</td>
                  </tr>
                ))}
                {deviceRows && deviceRows.data.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-foreground/50">
                      No matching devices.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between text-sm text-foreground/60">
          <span className="font-data">
            Showing page {currentResult?.page ?? 1} of {totalPages}
          </span>
          <PaginationControls currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      </section>
    </div>
  );
}
