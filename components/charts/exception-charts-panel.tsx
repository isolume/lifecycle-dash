"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "./chart-card";
import { ChartEmptyState } from "./chart-empty-state";
import { CHART_TOOLTIP_STYLE } from "./chart-tooltip";
import type { ExceptionChartsResponse } from "@/lib/types";

interface ExceptionChartsPanelProps {
  projectTag?: string;
  isActive?: boolean;
}

function toQueryString(props: ExceptionChartsPanelProps): string {
  const search = new URLSearchParams();
  if (props.projectTag) {
    search.set("projectTag", props.projectTag);
  }

  if (typeof props.isActive === "boolean") {
    search.set("isActive", String(props.isActive));
  }

  return search.toString();
}

export function ExceptionChartsPanel(props: ExceptionChartsPanelProps) {
  const [data, setData] = useState<ExceptionChartsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);
      try {
        const query = toQueryString(props);
        const response = await fetch(`/api/dashboard/charts/exceptions${query ? `?${query}` : ""}`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Request failed (${response.status})`);
        }

        const payload = (await response.json()) as ExceptionChartsResponse;
        if (active) {
          setData(payload);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load exception charts");
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
  }, [props.projectTag, props.isActive]);

  if (error) {
    return <p className="text-sm text-red-500">{error}</p>;
  }

  const statusData = data?.statusCounts ?? [];
  const tagData = data?.byProjectTag ?? [];
  const monthlyData = data?.monthlyEffective ?? [];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <ChartCard title="Exception Status Split">
        {loading ? (
          <div className="skeleton h-[260px] w-full" />
        ) : statusData.length === 0 ? (
          <ChartEmptyState />
        ) : (
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-card-border" />
                <XAxis dataKey="bucket" />
                <YAxis allowDecimals={false} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Bar dataKey="count" fill="var(--warning)" radius={0} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      <ChartCard title="Exceptions by Project Tag">
        {loading ? (
          <div className="skeleton h-[260px] w-full" />
        ) : tagData.length === 0 ? (
          <ChartEmptyState />
        ) : (
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tagData} layout="vertical" margin={{ top: 8, right: 8, left: 24, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-card-border" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis dataKey="key" type="category" width={120} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Bar dataKey="count" fill="var(--accent)" radius={0} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      <ChartCard title="Monthly Effective Exceptions">
        {loading ? (
          <div className="skeleton h-[260px] w-full" />
        ) : monthlyData.length === 0 ? (
          <ChartEmptyState />
        ) : (
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-card-border" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Line dataKey="count" stroke="var(--danger)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>
    </div>
  );
}
