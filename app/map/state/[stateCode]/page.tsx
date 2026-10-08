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
import type { CountyMapFeature, KpiResponse } from "@/lib/types";

const DynamicStateCountyMap = dynamic(
  () => import("@/components/maps/state-county-map").then((mod) => mod.StateCountyMap),
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

export default function StateMapPage() {
  const { asOfDate, setScope } = useTimePreview();
  const params = useParams<{ stateCode: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const stateCode = String(params.stateCode ?? "").toUpperCase();
  const stateName = getStateDisplayName(stateCode);

  const [counties, setCounties] = useState<CountyMapFeature[]>([]);
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
        const [countiesData, kpiData] = await Promise.all([
          fetchJson<CountyMapFeature[]>(withAsOfDate(`/api/dashboard/map/states/${stateCode}/counties?${filterQuery}`, asOfDate)),
          fetchJson<KpiResponse>(withAsOfDate(`/api/dashboard/kpis?${filterQuery}`, asOfDate)),
        ]);
        if (!active) {
          return;
        }

        setCounties(countiesData);
        setKpis(kpiData);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load county map");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    if (stateCode) {
      void load();
    }

    return () => {
      active = false;
    };
  }, [asOfDate, filterQuery, stateCode]);

  useEffect(() => {
    setScope({
      includeExceptions: mapFilters.includeExceptions,
      includeOutOfScope: mapFilters.includeOutOfScope,
      includeDecomSites: mapFilters.includeDecomSites,
      state: stateCode,
      affiliate: mapFilters.affiliate,
      deviceType: mapFilters.deviceType,
    });
  }, [mapFilters.affiliate, mapFilters.deviceType, mapFilters.includeDecomSites, mapFilters.includeExceptions, mapFilters.includeOutOfScope, setScope, stateCode]);

  function handleCountyClick(countyFips: string): void {
    const target = `/map/state/${stateCode}/county/${countyFips}`;
    router.push(filterQuery ? `${target}?${filterQuery}` : target);
  }

  const metricFilters = {
    includeExceptions: mapFilters.includeExceptions,
    includeOutOfScope: mapFilters.includeOutOfScope,
    includeDecomSites: mapFilters.includeDecomSites,
    state: stateCode,
    affiliate: mapFilters.affiliate,
    deviceType: mapFilters.deviceType,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{stateName} County Risk Map</h1>
          <p className="mt-2 text-sm text-foreground/60">
            Click a county to inspect site-level risk within this state.
          </p>
        </div>
        <Link href={filterQuery ? `/?${filterQuery}` : "/"} className="btn btn-secondary">
          Back to dashboard
        </Link>
      </div>

      {error ? (
        <p className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

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

      {loading ? (
        <div className="space-y-2 py-12">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="skeleton h-10 w-full" />
          ))}
        </div>
      ) : (
        <DynamicStateCountyMap counties={counties} onCountyClick={handleCountyClick} />
      )}
    </div>
  );
}
