"use client";

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
import { ChartCard } from "./chart-card";
import { ChartEmptyState } from "./chart-empty-state";
import { CHART_TOOLTIP_STYLE } from "./chart-tooltip";
import type { SiteDeviceChartsResponse } from "@/lib/types";

interface SiteDeviceChartFilters {
  includeExceptions: boolean;
  includeOutOfScope?: boolean;
  includeDecomSites?: boolean;
  asOfDate?: string;
  state?: string;
  countyFips?: string;
  siteCode: string;
  affiliate?: string;
  deviceType?: string;
}

function toQueryString(filters: SiteDeviceChartFilters): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    search.set(key, String(value));
  }

  return search.toString();
}

export function SiteDeviceChartsPanel({ filters }: { filters: SiteDeviceChartFilters }) {
  const [data, setData] = useState<SiteDeviceChartsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const query = useMemo(() => toQueryString(filters), [filters]);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/dashboard/charts/site-devices?${query}`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Request failed (${response.status})`);
        }

        const payload = (await response.json()) as SiteDeviceChartsResponse;
        if (active) {
          setData(payload);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load site charts");
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
  }, [query]);

  if (error) {
    return <p className="text-sm text-red-500">{error}</p>;
  }

  const risk = data?.riskBuckets ?? [];
  const lifecycle = data?.lifecycleStatuses ?? [];
  const types = data?.deviceTypes ?? [];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <ChartCard title="Site Risk Buckets">
        {loading ? (
          <div className="skeleton h-[260px] w-full" />
        ) : risk.length === 0 ? (
          <ChartEmptyState />
        ) : (
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={risk} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-card-border" />
                <XAxis dataKey="bucket" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Bar dataKey="count" fill="var(--danger)" radius={0} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      <ChartCard title="Site Lifecycle Statuses">
        {loading ? (
          <div className="skeleton h-[260px] w-full" />
        ) : lifecycle.length === 0 ? (
          <ChartEmptyState />
        ) : (
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={lifecycle} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-card-border" />
                <XAxis dataKey="bucket" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Bar dataKey="count" fill="var(--accent)" radius={0} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      <ChartCard title="Site Device Types">
        {loading ? (
          <div className="skeleton h-[260px] w-full" />
        ) : types.length === 0 ? (
          <ChartEmptyState />
        ) : (
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={types} layout="vertical" margin={{ top: 8, right: 8, left: 24, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-card-border" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis dataKey="key" type="category" width={120} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Bar dataKey="count" fill="var(--warning)" radius={0} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>
    </div>
  );
}
