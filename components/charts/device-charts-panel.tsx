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
import type { DeviceChartsResponse } from "@/lib/types";

interface DeviceChartFilters {
  includeExceptions: boolean;
  includeOutOfScope?: boolean;
  includeDecomSites?: boolean;
  asOfDate?: string;
  state?: string;
  affiliate?: string;
  county?: string;
  deviceType?: string;
  siteCode?: string;
  lifecycleStatus?: string;
  riskMin?: number;
  riskMax?: number;
  search?: string;
}

interface DeviceChartsPanelProps {
  filters: DeviceChartFilters;
  className?: string;
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

function toQueryString(filters: DeviceChartFilters): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    search.set(key, String(value));
  }

  return search.toString();
}

export function DeviceChartsPanel({ filters, className }: DeviceChartsPanelProps) {
  const [data, setData] = useState<DeviceChartsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => toQueryString(filters), [filters]);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/dashboard/charts/devices?${query}`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Request failed (${response.status})`);
        }

        const payload = (await response.json()) as DeviceChartsResponse;
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
    return <p className={className ? className : ""}>{error}</p>;
  }

  const riskData = data?.riskBuckets ?? [];
  const lifecycleData = data?.lifecycleStatuses ?? [];
  const typeData = data?.topDeviceTypes ?? [];
  const supportMatrix = data?.lifecycleBySupportCoverage ?? [];
  const securityMatrix = data?.lifecycleBySecurityRisk ?? [];
  const securityCost = data?.costBySecurityRisk ?? [];

  return (
    <div className={className}>
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Risk Buckets">
          {loading ? (
            <div className="skeleton h-[280px] w-full" />
          ) : riskData.length === 0 ? (
            <ChartEmptyState />
          ) : (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={riskData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
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

        <ChartCard title="Lifecycle Status Distribution">
          {loading ? (
            <div className="skeleton h-[280px] w-full" />
          ) : lifecycleData.length === 0 ? (
            <ChartEmptyState />
          ) : (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={lifecycleData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
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

        <ChartCard title="Top Device Types">
          {loading ? (
            <div className="skeleton h-[280px] w-full" />
          ) : typeData.length === 0 ? (
            <ChartEmptyState />
          ) : (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={typeData} layout="vertical" margin={{ top: 8, right: 8, left: 24, bottom: 8 }}>
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

        <ChartCard title="Lifecycle x Support Coverage">
          {loading ? (
            <div className="skeleton h-[280px] w-full" />
          ) : supportMatrix.length === 0 ? (
            <ChartEmptyState />
          ) : (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={supportMatrix} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-card-border" />
                  <XAxis dataKey="lifecycleStatus" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Bar dataKey="supported" stackId="support" fill="#0f766e" />
                  <Bar dataKey="unsupported" stackId="support" fill="var(--danger)" />
                  <Bar dataKey="unknown" stackId="support" fill="#64748b" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Lifecycle x Security Risk">
          {loading ? (
            <div className="skeleton h-[280px] w-full" />
          ) : securityMatrix.length === 0 ? (
            <ChartEmptyState />
          ) : (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={securityMatrix} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-card-border" />
                  <XAxis dataKey="lifecycleStatus" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Bar dataKey="high" stackId="security" fill="var(--danger)" />
                  <Bar dataKey="medium" stackId="security" fill="var(--warning)" />
                  <Bar dataKey="low" stackId="security" fill="#0f766e" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Cost by Security Risk">
          {loading ? (
            <div className="skeleton h-[280px] w-full" />
          ) : securityCost.length === 0 ? (
            <ChartEmptyState />
          ) : (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={securityCost} margin={{ top: 8, right: 8, left: 12, bottom: 8 }}>
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
      <p className="mt-2 text-xs text-foreground/50">
        Security risk is a lifecycle-derived proxy, not a CVE feed.
      </p>
    </div>
  );
}
