"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PaginationControls } from "@/components/dashboard/pagination-controls";
import { useTimePreview } from "@/components/time/time-preview-provider";
import { buildMapFilterQuery, parseMapFilterParams } from "@/lib/maps/filter-query";
import { withAsOfDate } from "@/lib/time/query";
import type { SiteSummaryResponse } from "@/lib/types";

interface DeviceRow {
  deviceId: string;
  deviceName: string;
  sourceSystem: string;
  deviceType: string;
  model: string;
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

export default function SiteDetailPage() {
  const { asOfDate, setScope } = useTimePreview();
  const params = useParams<{ stateCode: string; countyFips: string; siteCode: string }>();
  const searchParams = useSearchParams();

  const stateCode = String(params.stateCode ?? "").toUpperCase();
  const countyFips = String(params.countyFips ?? "");
  const siteCode = String(params.siteCode ?? "").toUpperCase();

  const [summary, setSummary] = useState<SiteSummaryResponse | null>(null);
  const [devices, setDevices] = useState<DeviceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const mapFilters = useMemo(() => {
    const parsed = parseMapFilterParams(new URLSearchParams(searchParams.toString()));
    return {
      ...parsed,
      state: stateCode,
    };
  }, [searchParams, stateCode]);

  const filterQuery = useMemo(() => buildMapFilterQuery(mapFilters), [mapFilters]);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);

      const summaryUrl = withAsOfDate(
        `/api/dashboard/map/states/${stateCode}/counties/${countyFips}/sites/${siteCode}?${filterQuery}`,
        asOfDate,
      );
      const deviceParams = new URLSearchParams(filterQuery);
      deviceParams.set("siteCode", siteCode);
      deviceParams.set("state", stateCode);
      deviceParams.set("page", String(page));
      deviceParams.set("pageSize", "25");
      if (asOfDate) {
        deviceParams.set("asOfDate", asOfDate);
      }

      try {
        const [summaryRes, devicesRes] = await Promise.all([
          fetchJson<SiteSummaryResponse>(summaryUrl),
          fetchJson<DeviceResponse>(`/api/devices?${deviceParams.toString()}`),
        ]);
        if (!active) {
          return;
        }

        setSummary(summaryRes);
        setDevices(devicesRes);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load site details");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    if (stateCode && countyFips && siteCode) {
      void load();
    }

    return () => {
      active = false;
    };
  }, [asOfDate, countyFips, filterQuery, page, siteCode, stateCode]);

  useEffect(() => {
    setScope({
      includeExceptions: mapFilters.includeExceptions,
      includeOutOfScope: mapFilters.includeOutOfScope,
      includeDecomSites: mapFilters.includeDecomSites,
      state: stateCode,
      affiliate: mapFilters.affiliate,
      deviceType: mapFilters.deviceType,
      siteCode,
    });
  }, [mapFilters.affiliate, mapFilters.deviceType, mapFilters.includeDecomSites, mapFilters.includeExceptions, mapFilters.includeOutOfScope, setScope, siteCode, stateCode]);

  const totalPages = devices ? Math.max(1, Math.ceil(devices.total / devices.pageSize)) : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {summary?.siteName || siteCode} ({siteCode})
          </h1>
          <p className="mt-2 text-sm text-foreground/60">
            Site-level summary and device list for detailed risk review.
          </p>
        </div>
        <Link
          href={filterQuery ? `/map/state/${stateCode}/county/${countyFips}?${filterQuery}` : `/map/state/${stateCode}/county/${countyFips}`}
          className="btn btn-secondary"
        >
          Back to county
        </Link>
      </div>

      {error ? (
        <p className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="space-y-2 py-12">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="skeleton h-10 w-full" />
          ))}
        </div>
      ) : !summary ? (
        <p className="border border-card-border bg-card-bg px-4 py-3 text-sm text-foreground/60">
          Site details were not found for the selected filters.
        </p>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="border border-card-border bg-card-bg p-4">
              <p className="text-xs uppercase tracking-wider text-foreground/50">Avg Risk</p>
              <p className="font-data mt-2 text-3xl font-bold text-foreground">{summary.riskScoreAvg.toFixed(1)}</p>
            </div>
            <div className="border border-card-border bg-card-bg p-4">
              <p className="text-xs uppercase tracking-wider text-foreground/50">Devices</p>
              <p className="font-data mt-2 text-3xl font-bold text-foreground">{summary.deviceCount}</p>
            </div>
            <div className="border border-card-border bg-card-bg p-4">
              <p className="text-xs uppercase tracking-wider text-foreground/50">High Risk Devices</p>
              <p className="font-data mt-2 text-3xl font-bold text-foreground">{summary.highRiskCount}</p>
            </div>
            <div className="border border-card-border bg-card-bg p-4">
              <p className="text-xs uppercase tracking-wider text-foreground/50">Estimated Cost</p>
              <p className="font-data mt-2 text-3xl font-bold text-foreground">
                {formatCurrency(summary.estimatedRefreshCost)}
              </p>
            </div>
          </section>

          <section className="border border-card-border bg-card-bg p-5">
            <h2 className="text-lg font-bold text-foreground">Devices at This Site</h2>
            <p className="mt-1 text-sm text-foreground/60">
              Ordered by highest risk score first.
            </p>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr>
                    <th>Device</th>
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
                      <td className="text-foreground/80">{device.sourceSystem}</td>
                      <td className="text-foreground/80">{device.deviceType}</td>
                      <td className="text-foreground/80">{device.model}</td>
                      <td className="text-foreground/80">{device.lifecycleStatus}</td>
                      <td className="text-foreground/80">
                        {device.riskScore} ({device.riskBucket})
                      </td>
                      <td className="font-data text-foreground/80">{formatCurrency(device.estimatedRefreshCost)}</td>
                      <td className="text-foreground/80">{device.hasActiveException ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                  {devices && devices.data.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-foreground/50">
                        No devices found for the selected filters.
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
              <PaginationControls currentPage={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
