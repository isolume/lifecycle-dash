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
import type { SiteChartsResponse } from "@/lib/types";

interface SiteChartFilters {
  includeExceptions: boolean;
  includeOutOfScope?: boolean;
  includeDecomSites?: boolean;
  asOfDate?: string;
  state?: string;
  affiliate?: string;
  county?: string;
  deviceType?: string;
  highRiskOnly?: boolean;
  limit?: number;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCompactCurrency(value: number): string {
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

function toQueryString(filters: SiteChartFilters): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    search.set(key, String(value));
  }

  return search.toString();
}

export function SiteChartsPanel({ filters }: { filters: SiteChartFilters }) {
  const [data, setData] = useState<SiteChartsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => toQueryString(filters), [filters]);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/dashboard/charts/sites?${query}`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Request failed (${response.status})`);
        }

        const payload = (await response.json()) as SiteChartsResponse;
        if (active) {
          setData(payload);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load charts");
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

  const topSites = data?.topSites ?? [];
  const riskBands = data?.riskBands ?? [];
  const geographyCosts = data?.geographyCosts ?? [];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <ChartCard title="Top Sites by High-Risk Count">
        {loading ? (
          <div className="skeleton h-[280px] w-full" />
        ) : topSites.length === 0 ? (
          <ChartEmptyState />
        ) : (
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topSites} margin={{ top: 8, right: 8, left: 24, bottom: 8 }} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-card-border" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis dataKey="siteCode" type="category" width={90} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Bar dataKey="highRiskCount" fill="var(--danger)" radius={0} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      <ChartCard title="Site Risk Bands">
        {loading ? (
          <div className="skeleton h-[280px] w-full" />
        ) : riskBands.length === 0 ? (
          <ChartEmptyState />
        ) : (
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={riskBands} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-card-border" />
                <XAxis dataKey="bucket" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Bar dataKey="count" fill="var(--warning)" radius={0} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      <ChartCard title="Estimated Cost by Geography">
        {loading ? (
          <div className="skeleton h-[280px] w-full" />
        ) : geographyCosts.length === 0 ? (
          <ChartEmptyState />
        ) : (
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={geographyCosts} margin={{ top: 8, right: 8, left: 12, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-card-border" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis width={88} tickFormatter={(value) => formatCompactCurrency(Number(value))} />
                <Tooltip
                  formatter={(value) => [formatCurrency(Number(value)), "Estimated Cost"]}
                  contentStyle={CHART_TOOLTIP_STYLE}
                />
                <Bar dataKey="cost" fill="var(--accent)" radius={0} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>
    </div>
  );
}
