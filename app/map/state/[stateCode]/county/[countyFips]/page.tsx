"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { useTimePreview } from "@/components/time/time-preview-provider";
import { buildMetricDetailHref } from "@/lib/dashboard/metric-links";
import { getStateDisplayName } from "@/lib/geo/us-state-names";
import { buildMapFilterQuery, parseMapFilterParams } from "@/lib/maps/filter-query";
import { withAsOfDate } from "@/lib/time/query";
import type { CountySitesResponse, KpiResponse } from "@/lib/types";

const DynamicCountySitesMap = dynamic(
  () => import("@/components/maps/county-sites-map").then((mod) => mod.CountySitesMap),
  { ssr: false },
);

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

export default function CountyMapPage() {
  const { asOfDate, setScope } = useTimePreview();
  const params = useParams<{ stateCode: string; countyFips: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const stateCode = String(params.stateCode ?? "").toUpperCase();
  const stateName = getStateDisplayName(stateCode);
  const countyFips = String(params.countyFips ?? "");

  const [data, setData] = useState<CountySitesResponse | null>(null);
  const [kpis, setKpis] = useState<KpiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

      try {
        const payload = await fetchJson<CountySitesResponse>(
          withAsOfDate(`/api/dashboard/map/states/${stateCode}/counties/${countyFips}/sites?${filterQuery}`, asOfDate),
        );
        const kpiQuery = new URLSearchParams(filterQuery);
        kpiQuery.set("state", stateCode);
        kpiQuery.set("county", payload.countyName);
        const kpiPayload = await fetchJson<KpiResponse>(withAsOfDate(`/api/dashboard/kpis?${kpiQuery.toString()}`, asOfDate));
        if (!active) {
          return;
        }

        setData(payload);
        setKpis(kpiPayload);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load county detail");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    if (stateCode && countyFips) {
      void load();
    }

    return () => {
      active = false;
    };
  }, [asOfDate, countyFips, filterQuery, stateCode]);

  useEffect(() => {
    setScope({
      includeExceptions: mapFilters.includeExceptions,
      includeOutOfScope: mapFilters.includeOutOfScope,
      includeDecomSites: mapFilters.includeDecomSites,
      state: stateCode,
      affiliate: mapFilters.affiliate,
      deviceType: mapFilters.deviceType,
      county: data?.countyName,
    });
  }, [data?.countyName, mapFilters.affiliate, mapFilters.deviceType, mapFilters.includeDecomSites, mapFilters.includeExceptions, mapFilters.includeOutOfScope, setScope, stateCode]);

  function handleSiteClick(siteCode: string): void {
    const target = `/map/state/${stateCode}/county/${countyFips}/site/${siteCode}`;
    router.push(filterQuery ? `${target}?${filterQuery}` : target);
  }

  const metricFilters = {
    includeExceptions: mapFilters.includeExceptions,
    includeOutOfScope: mapFilters.includeOutOfScope,
    includeDecomSites: mapFilters.includeDecomSites,
    state: stateCode,
    affiliate: mapFilters.affiliate,
    deviceType: mapFilters.deviceType,
    county: data?.countyName,
    countyFips,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {stateName} {data?.countyName ?? countyFips} Sites
          </h1>
          <p className="mt-2 text-sm text-foreground/60">
            Click a site marker for a quick breakdown, then open the detailed site page.
          </p>
        </div>
        <Link
          href={filterQuery ? `/map/state/${stateCode}?${filterQuery}` : `/map/state/${stateCode}`}
          className="btn btn-secondary"
        >
          Back to state
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
      ) : !data ? (
        <p className="border border-card-border bg-card-bg px-4 py-3 text-sm text-foreground/60">
          No county data found for the selected filters.
        </p>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <KpiCard
              label="Active Devices"
              value={kpis?.totalActiveDevices ?? 0}
              loading={loading}
              accentColor="accent"
              href={buildMetricDetailHref("active-devices", metricFilters)}
            />
            <KpiCard
              label="High Risk Devices"
              value={kpis?.highRiskDevices ?? 0}
              loading={loading}
              accentColor="danger"
              href={buildMetricDetailHref("high-risk-devices", metricFilters)}
            />
            <KpiCard
              label="Past EoL Devices"
              value={kpis?.pastEolDevices ?? 0}
              loading={loading}
              accentColor="warning"
              href={buildMetricDetailHref("past-eol-devices", metricFilters)}
            />
            <KpiCard
              label="Estimated Refresh Cost"
              value={kpis ? formatCurrency(kpis.estimatedRefreshCost) : formatCurrency(0)}
              loading={loading}
              accentColor="accent"
              href={buildMetricDetailHref("estimated-refresh-cost", metricFilters)}
            />
            <KpiCard
              label="High-Risk Sites"
              value={kpis?.sitesWithHighRisk ?? 0}
              loading={loading}
              accentColor="danger"
              href={buildMetricDetailHref("high-risk-sites", metricFilters)}
            />
          </section>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="border border-card-border bg-card-bg p-4">
              <p className="text-xs uppercase tracking-wider text-foreground/50">Avg Risk</p>
              <p className="font-data mt-2 text-3xl font-bold text-foreground">
                {typeof data.countyRiskScoreAvg === "number" ? data.countyRiskScoreAvg.toFixed(1) : "N/A"}
              </p>
            </div>
            <div className="border border-card-border bg-card-bg p-4">
              <p className="text-xs uppercase tracking-wider text-foreground/50">Devices</p>
              <p className="font-data mt-2 text-3xl font-bold text-foreground">{data.countyDeviceCount}</p>
            </div>
            <div className="border border-card-border bg-card-bg p-4">
              <p className="text-xs uppercase tracking-wider text-foreground/50">High Risk Devices</p>
              <p className="font-data mt-2 text-3xl font-bold text-foreground">{data.countyHighRiskCount}</p>
            </div>
            <div className="border border-card-border bg-card-bg p-4">
              <p className="text-xs uppercase tracking-wider text-foreground/50">Estimated Cost</p>
              <p className="font-data mt-2 text-3xl font-bold text-foreground">
                {formatCurrency(data.countyEstimatedRefreshCost)}
              </p>
            </div>
          </section>

          <DynamicCountySitesMap
            countyName={data.countyName}
            countyGeometry={data.countyGeometry}
            sites={data.sites}
            onSiteClick={handleSiteClick}
          />
        </>
      )}
    </div>
  );
}
