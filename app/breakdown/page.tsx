"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { WINDOW_MONTHS_DEFAULT } from "@/lib/constants";
import { getStateDisplayName } from "@/lib/geo/us-state-names";
import { useTimePreview } from "@/components/time/time-preview-provider";
import type { BreakdownRow } from "@/lib/types";

type GroupByKey = "state" | "affiliate" | "county" | "model" | "device_type";

export default function BreakdownPage() {
  const { asOfDate, setScope } = useTimePreview();
  const [breakdown, setBreakdown] = useState<BreakdownRow[]>([]);
  const [groupBy, setGroupBy] = useState<GroupByKey>("state");
  const [windowMonths, setWindowMonths] = useState(WINDOW_MONTHS_DEFAULT);
  const [includeExceptions, setIncludeExceptions] = useState(false);
  const [includeOutOfScope, setIncludeOutOfScope] = useState(false);
  const [includeDecomSites, setIncludeDecomSites] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const displayBreakdown = groupBy === "state"
    ? breakdown.map((row) => ({ ...row, group: getStateDisplayName(row.group) }))
    : breakdown;

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        groupBy,
        windowMonths: String(windowMonths),
        includeExceptions: String(includeExceptions),
        includeOutOfScope: String(includeOutOfScope),
        includeDecomSites: String(includeDecomSites),
      });
      if (asOfDate) {
        params.set("asOfDate", asOfDate);
      }

      try {
        const res = await fetch(`/api/dashboard/breakdown?${params}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const data = (await res.json()) as BreakdownRow[];
        if (active) setBreakdown(data);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Load failed");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => { active = false; };
  }, [asOfDate, groupBy, includeDecomSites, includeExceptions, includeOutOfScope, windowMonths]);

  useEffect(() => {
    setScope({ includeExceptions, includeOutOfScope, includeDecomSites });
  }, [includeDecomSites, includeExceptions, includeOutOfScope, setScope]);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden border border-card-border">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url('https://www.southerncompany.com//content/dam/southerncompany/images/news/f-150-charging-closeup.jpg')",
          }}
        />
        <div className="absolute inset-0 bg-[#00486f]/62" />
        <div className="relative flex h-[68px] items-center justify-end px-4 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/90">
            Risk Breakdown
          </p>
        </div>
      </section>

      <div>
        <h1 className="text-2xl font-bold text-foreground">Risk Breakdown</h1>
        <p className="mt-2 text-sm text-foreground/60">
          High-risk device counts grouped by various dimensions.
        </p>
      </div>

      <section className="border border-card-border bg-card-bg p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupByKey)}
          >
            <option value="state">State</option>
            <option value="affiliate">Affiliate</option>
            <option value="county">County</option>
            <option value="model">Model</option>
            <option value="device_type">Device Type</option>
          </select>

          <label className="flex items-center gap-2 text-sm">
            <span className="text-foreground/60">Window (months):</span>
            <input
              value={windowMonths}
              onChange={(e) => setWindowMonths(Number(e.target.value) || WINDOW_MONTHS_DEFAULT)}
              className="w-16"
              type="number"
              min={1}
              max={36}
            />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={includeExceptions} onChange={(e) => setIncludeExceptions(e.target.checked)} />
            Include exceptions
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={includeOutOfScope} onChange={(e) => setIncludeOutOfScope(e.target.checked)} />
            Include out-of-scope
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={includeDecomSites} onChange={(e) => setIncludeDecomSites(e.target.checked)} />
            Include decom sites
          </label>

        </div>

        {error ? <p className="mb-4 text-sm text-red-500">{error}</p> : null}

        {loading ? (
          <div className="space-y-3 py-12">
            <div className="skeleton mx-auto h-6 w-3/4" />
            <div className="skeleton mx-auto h-6 w-1/2" />
            <div className="skeleton mx-auto h-6 w-2/3" />
            <div className="skeleton mx-auto h-6 w-1/3" />
          </div>
        ) : (
          <div className="h-[550px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={displayBreakdown} layout="vertical" margin={{ top: 8, right: 8, left: 12, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-card-border" />
                <XAxis type="number" className="text-foreground" />
                <YAxis type="category" dataKey="group" width={140} tick={{ fontSize: 12 }} className="text-foreground" />
                <Tooltip
                  contentStyle={{ backgroundColor: "#ffffff", border: "1px solid #d4d4d4", color: "#000000" }}
                />
                <Bar dataKey="highRiskCount" name="High Risk" fill="#eb1a25" radius={0} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="border border-card-border bg-card-bg p-5">
        <h2 className="mb-3 text-lg font-bold text-foreground">Detail Table</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr>
                <th className="px-3 py-2">Group</th>
                <th className="px-3 py-2">Devices</th>
                <th className="px-3 py-2">High Risk</th>
                <th className="px-3 py-2">Past EoL</th>
                <th className="px-3 py-2">Est. Cost</th>
              </tr>
            </thead>
            <tbody>
              {displayBreakdown.map((row) => (
                <tr key={row.group}>
                  <td className="font-semibold text-foreground">{row.group}</td>
                  <td className="font-data text-foreground/80">{row.deviceCount}</td>
                  <td className="font-data text-foreground/80">{row.highRiskCount}</td>
                  <td className="font-data text-foreground/80">{row.pastEolCount}</td>
                  <td className="font-data text-foreground/80">
                    {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(row.estimatedCost)}
                  </td>
                </tr>
              ))}
              {breakdown.length === 0 && !loading ? (
                <tr>
                  <td className="text-foreground/50" colSpan={5}>No data.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
