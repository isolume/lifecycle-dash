"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { getStateDisplayName } from "@/lib/geo/us-state-names";
import { buildMetricDetailHref } from "@/lib/dashboard/metric-links";
import { buildMapFilterQuery } from "@/lib/maps/filter-query";
import { withAsOfDate } from "@/lib/time/query";
import type { DashboardFilters, KpiResponse, StateMapFeature } from "@/lib/types";
import { useTimePreview } from "@/components/time/time-preview-provider";

const DynamicStateRiskMap = dynamic(
  () => import("@/components/maps/state-risk-map").then((mod) => mod.StateRiskMap),
  { ssr: false },
);

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
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

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") {
      continue;
    }

    search.set(key, String(value));
  }

  return search.toString();
}

function formatLargeCurrency(value: number): string {
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1)}B`;
  }

  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }

  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`;
  }

  return formatCurrency(value);
}

export function HeatmapPage() {
  const router = useRouter();
  const { asOfDate, setScope } = useTimePreview();

  const [filters, setFilters] = useState<DashboardFilters | null>(null);
  const [kpis, setKpis] = useState<KpiResponse | null>(null);
  const [stateFeatures, setStateFeatures] = useState<StateMapFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedState, setSelectedState] = useState("");
  const [selectedAffiliate, setSelectedAffiliate] = useState("");
  const [selectedDeviceType, setSelectedDeviceType] = useState("");
  const [includeExceptions, setIncludeExceptions] = useState(false);
  const [includeOutOfScope, setIncludeOutOfScope] = useState(false);
  const [includeDecomSites, setIncludeDecomSites] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadFilterData(): Promise<void> {
      try {
        const filterData = await fetchJson<DashboardFilters>("/api/dashboard/filters");
        if (active) {
          setFilters(filterData);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Unable to load filters");
        }
      }
    }

    void loadFilterData();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadDashboard(): Promise<void> {
      setLoading(true);
      setError(null);

      const sharedQuery = buildQuery({
        includeExceptions,
        includeOutOfScope,
        includeDecomSites,
        state: selectedState || undefined,
        affiliate: selectedAffiliate || undefined,
        deviceType: selectedDeviceType || undefined,
      });

      try {
        const [kpiRes, statesRes] = await Promise.all([
          fetchJson<KpiResponse>(withAsOfDate(`/api/dashboard/kpis?${sharedQuery}`, asOfDate)),
          fetchJson<StateMapFeature[]>(withAsOfDate(`/api/dashboard/map/states?${sharedQuery}`, asOfDate)),
        ]);

        if (!active) {
          return;
        }

        setKpis(kpiRes);
        setStateFeatures(statesRes);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Dashboard load failed");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      active = false;
    };
  }, [asOfDate, includeDecomSites, includeExceptions, includeOutOfScope, selectedState, selectedAffiliate, selectedDeviceType]);

  useEffect(() => {
    setScope({
      includeExceptions,
      includeOutOfScope,
      includeDecomSites,
      state: selectedState || undefined,
      affiliate: selectedAffiliate || undefined,
      deviceType: selectedDeviceType || undefined,
    });
  }, [includeDecomSites, includeExceptions, includeOutOfScope, selectedAffiliate, selectedDeviceType, selectedState, setScope]);

  function handleStateClick(stateCode: string): void {
    const query = buildMapFilterQuery({
      includeExceptions,
      includeOutOfScope,
      includeDecomSites,
      affiliate: selectedAffiliate || undefined,
      deviceType: selectedDeviceType || undefined,
      state: stateCode,
    });

    router.push(query ? `/map/state/${stateCode}?${query}` : `/map/state/${stateCode}`);
  }

  function handleOpenSelectedState(): void {
    if (!selectedState) {
      return;
    }

    const query = buildMapFilterQuery({
      includeExceptions,
      includeOutOfScope,
      includeDecomSites,
      affiliate: selectedAffiliate || undefined,
      deviceType: selectedDeviceType || undefined,
      state: selectedState,
    });

    router.push(query ? `/map/state/${selectedState}?${query}` : `/map/state/${selectedState}`);
  }

  const metricFilters = {
    includeExceptions,
    includeOutOfScope,
    includeDecomSites,
    state: selectedState || undefined,
    affiliate: selectedAffiliate || undefined,
    deviceType: selectedDeviceType || undefined,
  };
  const topHighRiskStates = useMemo(
    () =>
      [...stateFeatures]
        .filter((feature) => feature.deviceCount > 0)
        .sort((a, b) => b.highRiskCount - a.highRiskCount || b.deviceCount - a.deviceCount)
        .slice(0, 8)
        .map((feature) => ({
          state: feature.stateCode,
          label: getStateDisplayName(feature.stateCode),
          highRiskCount: feature.highRiskCount,
        })),
    [stateFeatures],
  );
  const topCostStates = useMemo(
    () =>
      [...stateFeatures]
        .filter((feature) => feature.deviceCount > 0)
        .sort((a, b) => b.estimatedRefreshCost - a.estimatedRefreshCost)
        .slice(0, 8)
        .map((feature) => ({
          state: feature.stateCode,
          label: getStateDisplayName(feature.stateCode),
          estimatedRefreshCost: Math.round(feature.estimatedRefreshCost),
        })),
    [stateFeatures],
  );

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden border border-card-border">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url('https://g.foolcdn.com/image/?url=https%3A%2F%2Fg.foolcdn.com%2Feditorial%2Fimages%2F824225%2Fpower-generation.jpg&w=1920&op=resize')",
          }}
        />
        <div className="absolute inset-0 bg-[#00486f]/72" />
        <div className="relative flex h-[68px] items-center justify-end px-4 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/90">
            Heatmap
          </p>
        </div>
      </section>

      <section className="border border-card-border bg-card-bg p-5">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="flex gap-2">
            <select value={selectedState} onChange={(event) => setSelectedState(event.target.value)} className="flex-1">
              <option value="">All States</option>
              {filters?.states.map((state) => (
                <option key={state} value={state}>
                  {getStateDisplayName(state)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={!selectedState}
              onClick={handleOpenSelectedState}
            >
              Open
            </button>
          </div>

          <select value={selectedAffiliate} onChange={(event) => setSelectedAffiliate(event.target.value)}>
            <option value="">All Affiliates</option>
            {filters?.affiliates.map((affiliate) => (
              <option key={affiliate} value={affiliate}>
                {affiliate}
              </option>
            ))}
          </select>

          <select value={selectedDeviceType} onChange={(event) => setSelectedDeviceType(event.target.value)}>
            <option value="">All Device Types</option>
            {filters?.deviceTypes.map((deviceType) => (
              <option key={deviceType} value={deviceType}>
                {deviceType}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={includeExceptions} onChange={(event) => setIncludeExceptions(event.target.checked)} />
            Include exceptions
          </label>

          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={includeOutOfScope} onChange={(event) => setIncludeOutOfScope(event.target.checked)} />
            Include out-of-scope
          </label>

          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={includeDecomSites} onChange={(event) => setIncludeDecomSites(event.target.checked)} />
            Include decom sites
          </label>

        </div>
      </section>

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

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-foreground">State Risk Heatmap</h2>
          <span className="text-xs text-foreground/40">Click a state to drill into county risk</span>
        </div>
        {loading && stateFeatures.length === 0 ? (
          <div className="space-y-2 py-12">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="skeleton h-10 w-full" />
            ))}
          </div>
        ) : (
          <DynamicStateRiskMap
            features={stateFeatures}
            selectedState={selectedState || undefined}
            onStateClick={handleStateClick}
          />
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="border border-card-border bg-card-bg p-5">
          <h2 className="text-lg font-semibold text-foreground">Top States by High-Risk Devices</h2>
          <p className="mt-1 text-sm text-foreground/60">Highest count of devices with risk score 65+.</p>
          <div className="mt-4 h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topHighRiskStates} margin={{ top: 8, right: 8, left: 4, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-card-border" />
                <XAxis dataKey="state" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip
                  formatter={(value) => [value, "High-Risk Devices"]}
                  labelFormatter={(label) => getStateDisplayName(String(label))}
                  contentStyle={{ backgroundColor: "#ffffff", border: "1px solid #d4d4d4" }}
                />
                <Bar dataKey="highRiskCount" fill="var(--color-danger)" radius={0} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="border border-card-border bg-card-bg p-5">
          <h2 className="text-lg font-semibold text-foreground">Top States by Estimated Cost</h2>
          <p className="mt-1 text-sm text-foreground/60">Largest projected refresh spend in current scope.</p>
          <div className="mt-4 h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topCostStates} margin={{ top: 8, right: 8, left: 4, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-card-border" />
                <XAxis dataKey="state" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(value) => formatLargeCurrency(Number(value))} />
                <Tooltip
                  formatter={(value) => [formatCurrency(Number(value)), "Estimated Cost"]}
                  labelFormatter={(label) => getStateDisplayName(String(label))}
                  contentStyle={{ backgroundColor: "#ffffff", border: "1px solid #d4d4d4" }}
                />
                <Bar dataKey="estimatedRefreshCost" fill="var(--color-accent)" radius={0} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>
    </div>
  );
}

export const DashboardApp = HeatmapPage;
