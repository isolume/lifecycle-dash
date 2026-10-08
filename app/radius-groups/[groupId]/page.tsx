"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTimePreview } from "@/components/time/time-preview-provider";
import { HIGH_RISK_MIN, RADIUS_MILES_DEFAULT } from "@/lib/constants";
import type { RadiusGroupSiteSummary } from "@/lib/types";

interface DeviceRow {
  deviceId: string;
  serialNumber: string | null;
  deviceName: string;
  sourceSystem: string;
  deviceType: string;
  model: string;
  siteCode: string | null;
  lifecycleStatus: string;
  riskBucket: string;
  riskScore: number;
  estimatedRefreshCost: number;
  hasActiveException: boolean;
}

interface DeviceResponse {
  data: DeviceRow[];
  total: number;
  page: number;
  pageSize: number;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }

  return (await response.json()) as T;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function parseBooleanQuery(value: string | null, fallback = false): boolean {
  if (value === null) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export default function RadiusGroupDetailPage() {
  const { asOfDate, setScope } = useTimePreview();
  const params = useParams<{ groupId: string }>();
  const searchParams = useSearchParams();
  const groupId = String(params.groupId ?? "");

  const queryContext = useMemo(() => {
    const parsedSiteCodes = [...new Set(
      (searchParams.get("sites") ?? "")
        .split(",")
        .map((siteCode) => siteCode.trim().toUpperCase())
        .filter(Boolean),
    )];

    const parsedRadiusMi = Number(searchParams.get("radiusMi"));
    const radiusMi = Number.isFinite(parsedRadiusMi) && parsedRadiusMi > 0
      ? parsedRadiusMi
      : RADIUS_MILES_DEFAULT;

    const parsedRiskMin = Number(searchParams.get("riskMin"));
    const riskMin = Number.isFinite(parsedRiskMin) ? parsedRiskMin : HIGH_RISK_MIN;

    const includeExceptions = parseBooleanQuery(searchParams.get("includeExceptions"), false);
    const includeOutOfScope = parseBooleanQuery(searchParams.get("includeOutOfScope"), false);
    const includeDecomSites = parseBooleanQuery(searchParams.get("includeDecomSites"), false);
    return {
      siteCodes: parsedSiteCodes,
      siteCodesKey: parsedSiteCodes.join(","),
      radiusMi,
      riskMin,
      includeExceptions,
      includeOutOfScope,
      includeDecomSites,
    };
  }, [searchParams]);

  const [siteSummaries, setSiteSummaries] = useState<RadiusGroupSiteSummary[]>([]);
  const [devices, setDevices] = useState<DeviceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [groupId, queryContext.siteCodesKey, queryContext.includeDecomSites, queryContext.includeExceptions, queryContext.includeOutOfScope]);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      if (!groupId || !queryContext.siteCodes.length) {
        setSiteSummaries([]);
        setDevices({ data: [], total: 0, page: 1, pageSize: 25 });
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      const summariesParams = new URLSearchParams({
        siteCodes: queryContext.siteCodesKey,
        includeExceptions: String(queryContext.includeExceptions),
        includeOutOfScope: String(queryContext.includeOutOfScope),
        includeDecomSites: String(queryContext.includeDecomSites),
        riskMin: String(queryContext.riskMin),
      });
      if (asOfDate) {
        summariesParams.set("asOfDate", asOfDate);
      }

      const deviceParams = new URLSearchParams({
        siteCode: queryContext.siteCodesKey,
        includeExceptions: String(queryContext.includeExceptions),
        includeOutOfScope: String(queryContext.includeOutOfScope),
        includeDecomSites: String(queryContext.includeDecomSites),
        page: String(page),
        pageSize: "25",
      });
      if (asOfDate) {
        deviceParams.set("asOfDate", asOfDate);
      }

      try {
        const [summariesResult, devicesResult] = await Promise.all([
          fetchJson<RadiusGroupSiteSummary[]>(`/api/dashboard/radius-groups/sites?${summariesParams.toString()}`),
          fetchJson<DeviceResponse>(`/api/devices?${deviceParams.toString()}`),
        ]);

        if (!active) {
          return;
        }

        setSiteSummaries(summariesResult);
        setDevices(devicesResult);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load radius group");
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
  }, [asOfDate, groupId, page, queryContext.includeDecomSites, queryContext.includeExceptions, queryContext.includeOutOfScope, queryContext.riskMin, queryContext.siteCodes.length, queryContext.siteCodesKey]);

  useEffect(() => {
    setScope({
      includeExceptions: queryContext.includeExceptions,
      includeOutOfScope: queryContext.includeOutOfScope,
      includeDecomSites: queryContext.includeDecomSites,
      siteCodes: queryContext.siteCodes,
    });
  }, [queryContext.includeDecomSites, queryContext.includeExceptions, queryContext.includeOutOfScope, queryContext.siteCodes, setScope]);

  const totals = useMemo(() => {
    return siteSummaries.reduce(
      (acc, site) => ({
        deviceCount: acc.deviceCount + site.deviceCount,
        highRiskCount: acc.highRiskCount + site.highRiskCount,
        estimatedCost: acc.estimatedCost + site.estimatedCost,
      }),
      { deviceCount: 0, highRiskCount: 0, estimatedCost: 0 },
    );
  }, [siteSummaries]);

  const totalPages = devices ? Math.max(1, Math.ceil(devices.total / devices.pageSize)) : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Radius Group {groupId}</h1>
          <p className="mt-2 text-sm text-foreground/60">
            {queryContext.siteCodes.length} site{queryContext.siteCodes.length === 1 ? "" : "s"} in this opportunity group.
          </p>
          <p className="mt-1 text-xs text-foreground/50">
            Radius {queryContext.radiusMi} miles, risk threshold {queryContext.riskMin}.
          </p>
        </div>
        <Link href="/radius-groups" className="btn btn-secondary">
          Back to Radius Groups
        </Link>
      </div>

      {error ? (
        <p className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {!queryContext.siteCodes.length ? (
        <p className="border border-card-border bg-card-bg px-4 py-3 text-sm text-foreground/60">
          No site codes were provided for this radius group.
        </p>
      ) : loading ? (
        <div className="space-y-2 py-12">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div key={idx} className="skeleton h-10 w-full" />
          ))}
        </div>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="border border-card-border bg-card-bg p-4">
              <p className="text-xs uppercase tracking-wider text-foreground/50">Sites</p>
              <p className="font-data mt-2 text-3xl font-bold text-foreground">{siteSummaries.length}</p>
            </div>
            <div className="border border-card-border bg-card-bg p-4">
              <p className="text-xs uppercase tracking-wider text-foreground/50">Devices</p>
              <p className="font-data mt-2 text-3xl font-bold text-foreground">{totals.deviceCount}</p>
            </div>
            <div className="border border-card-border bg-card-bg p-4">
              <p className="text-xs uppercase tracking-wider text-foreground/50">High Risk Devices</p>
              <p className="font-data mt-2 text-3xl font-bold text-foreground">{totals.highRiskCount}</p>
            </div>
            <div className="border border-card-border bg-card-bg p-4">
              <p className="text-xs uppercase tracking-wider text-foreground/50">Estimated Cost</p>
              <p className="font-data mt-2 text-3xl font-bold text-foreground">{formatCurrency(totals.estimatedCost)}</p>
            </div>
          </section>

          <section className="border border-card-border bg-card-bg p-5">
            <h2 className="text-lg font-bold text-foreground">Sites in This Group</h2>
            <p className="mt-1 text-sm text-foreground/60">
              Site-level summary using risk threshold {queryContext.riskMin}.
            </p>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr>
                    <th>Site Code</th>
                    <th>Devices</th>
                    <th>High Risk</th>
                    <th>Avg Risk</th>
                    <th>Estimated Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {siteSummaries.map((site) => (
                    <tr key={site.siteCode}>
                      <td className="font-semibold text-foreground">{site.siteCode}</td>
                      <td className="font-data text-foreground/80">{site.deviceCount}</td>
                      <td className="font-data text-foreground/80">{site.highRiskCount}</td>
                      <td className="font-data text-foreground/80">{site.riskScoreAvg.toFixed(1)}</td>
                      <td className="font-data text-foreground/80">{formatCurrency(site.estimatedCost)}</td>
                    </tr>
                  ))}
                  {siteSummaries.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-foreground/50">
                        No site summary data found for this group.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="border border-card-border bg-card-bg p-5">
            <h2 className="text-lg font-bold text-foreground">Devices Across Group Sites</h2>
            <p className="mt-1 text-sm text-foreground/60">
              Ordered by highest risk score first.
            </p>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr>
                    <th>Device</th>
                    <th>Site</th>
                    <th>Source</th>
                    <th>Type</th>
                    <th>Model</th>
                    <th>Lifecycle</th>
                    <th>Risk</th>
                    <th>Cost</th>
                    <th>Exception</th>
                  </tr>
                </thead>
                <tbody>
                  {devices?.data.map((device) => (
                    <tr key={device.deviceId}>
                      <td className="font-semibold text-foreground">{device.deviceName}</td>
                      <td className="font-data text-foreground/80">{device.siteCode ?? "Unknown"}</td>
                      <td className="text-foreground/80">{device.sourceSystem}</td>
                      <td className="text-foreground/80">{device.deviceType}</td>
                      <td className="text-foreground/80">{device.model}</td>
                      <td className="text-foreground/80">{device.lifecycleStatus}</td>
                      <td className="font-data text-foreground/80">{device.riskScore} ({device.riskBucket})</td>
                      <td className="font-data text-foreground/80">{formatCurrency(device.estimatedRefreshCost)}</td>
                      <td className="text-foreground/80">{device.hasActiveException ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                  {devices && devices.data.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-foreground/50">
                        No devices found for the selected sites.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between text-sm text-foreground/60">
              <span className="font-data">
                Showing page {devices?.page ?? 1} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className="btn btn-secondary btn-sm"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  className="btn btn-secondary btn-sm"
                >
                  Next
                </button>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
