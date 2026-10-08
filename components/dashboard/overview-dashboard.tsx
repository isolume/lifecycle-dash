"use client";

import Link from "next/link";
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
import { DeviceChartsPanel } from "@/components/charts/device-charts-panel";
import { ExceptionChartsPanel } from "@/components/charts/exception-charts-panel";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { getStateDisplayName } from "@/lib/geo/us-state-names";
import { withAsOfDate } from "@/lib/time/query";
import type {
  BreakdownRow,
  DashboardFilters,
  ExceptionRecord,
  KpiResponse,
  RadiusGroup,
  StateMapFeature,
} from "@/lib/types";
import { useTimePreview } from "@/components/time/time-preview-provider";

interface DevicePreviewRow {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  model: string;
  stateCode: string | null;
  riskScore: number;
  estimatedRefreshCost: number;
}

interface DevicePreviewResponse {
  data: DevicePreviewRow[];
  total: number;
  page: number;
  pageSize: number;
}

interface OverviewErrors {
  kpis: string | null;
  heatmap: string | null;
  breakdown: string | null;
  radius: string | null;
  devices: string | null;
  exceptions: string | null;
}

const EMPTY_ERRORS: OverviewErrors = {
  kpis: null,
  heatmap: null,
  breakdown: null,
  radius: null,
  devices: null,
  exceptions: null,
};

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

export function OverviewDashboard() {
  const { asOfDate, setScope } = useTimePreview();
  const [filters, setFilters] = useState<DashboardFilters | null>(null);
  const [kpis, setKpis] = useState<KpiResponse | null>(null);
  const [stateFeatures, setStateFeatures] = useState<StateMapFeature[]>([]);
  const [breakdown, setBreakdown] = useState<BreakdownRow[]>([]);
  const [radiusGroups, setRadiusGroups] = useState<RadiusGroup[]>([]);
  const [exceptions, setExceptions] = useState<ExceptionRecord[]>([]);
  const [devicePreview, setDevicePreview] = useState<DevicePreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<OverviewErrors>(EMPTY_ERRORS);

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
        const payload = await fetchJson<DashboardFilters>("/api/dashboard/filters");
        if (active) {
          setFilters(payload);
        }
      } catch {
        // Keep UI usable even if filter metadata fails.
      }
    }

    void loadFilterData();
    return () => {
      active = false;
    };
  }, []);

  const sharedFilters = useMemo(
    () => ({
      includeExceptions,
      includeOutOfScope,
      includeDecomSites,
      state: selectedState || undefined,
      affiliate: selectedAffiliate || undefined,
      deviceType: selectedDeviceType || undefined,
    }),
    [includeDecomSites, includeExceptions, includeOutOfScope, selectedAffiliate, selectedDeviceType, selectedState],
  );
  const sharedQuery = useMemo(() => buildQuery(sharedFilters), [sharedFilters]);

  useEffect(() => {
    let active = true;

    async function loadOverviewData(): Promise<void> {
      setLoading(true);
      setErrors(EMPTY_ERRORS);

      const breakdownQuery = buildQuery({ ...sharedFilters, groupBy: "state" });
      const devicePreviewQuery = buildQuery({ ...sharedFilters, page: 1, pageSize: 5 });

      const results = await Promise.allSettled([
        fetchJson<KpiResponse>(withAsOfDate(`/api/dashboard/kpis?${sharedQuery}`, asOfDate)),
        fetchJson<StateMapFeature[]>(withAsOfDate(`/api/dashboard/map/states?${sharedQuery}`, asOfDate)),
        fetchJson<BreakdownRow[]>(withAsOfDate(`/api/dashboard/breakdown?${breakdownQuery}`, asOfDate)),
        fetchJson<RadiusGroup[]>(withAsOfDate(`/api/dashboard/radius-groups?${sharedQuery}`, asOfDate)),
        fetchJson<DevicePreviewResponse>(withAsOfDate(`/api/devices?${devicePreviewQuery}`, asOfDate)),
        fetchJson<ExceptionRecord[]>("/api/exceptions"),
      ]);

      if (!active) {
        return;
      }

      const nextErrors: OverviewErrors = { ...EMPTY_ERRORS };

      if (results[0].status === "fulfilled") {
        setKpis(results[0].value);
      } else {
        nextErrors.kpis = results[0].reason instanceof Error ? results[0].reason.message : "KPI load failed";
      }

      if (results[1].status === "fulfilled") {
        setStateFeatures(results[1].value);
      } else {
        nextErrors.heatmap = results[1].reason instanceof Error ? results[1].reason.message : "Heatmap load failed";
      }

      if (results[2].status === "fulfilled") {
        setBreakdown(results[2].value);
      } else {
        nextErrors.breakdown = results[2].reason instanceof Error ? results[2].reason.message : "Breakdown load failed";
      }

      if (results[3].status === "fulfilled") {
        setRadiusGroups(results[3].value);
      } else {
        nextErrors.radius = results[3].reason instanceof Error ? results[3].reason.message : "Radius load failed";
      }

      if (results[4].status === "fulfilled") {
        setDevicePreview(results[4].value);
      } else {
        nextErrors.devices = results[4].reason instanceof Error ? results[4].reason.message : "Device preview failed";
      }

      if (results[5].status === "fulfilled") {
        setExceptions(results[5].value);
      } else {
        nextErrors.exceptions = results[5].reason instanceof Error ? results[5].reason.message : "Exception preview failed";
      }

      setErrors(nextErrors);
      setLoading(false);
    }

    void loadOverviewData();
    return () => {
      active = false;
    };
  }, [asOfDate, sharedFilters, sharedQuery]);

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

  const heatmapLink = sharedQuery ? `/heatmap?${sharedQuery}` : "/heatmap";
  const breakdownLink = sharedQuery ? `/breakdown?${sharedQuery}` : "/breakdown";
  const devicesLink = sharedQuery ? `/devices?${sharedQuery}` : "/devices";
  const radiusLink = sharedQuery ? `/radius-groups?${sharedQuery}` : "/radius-groups";

  const topStateHighRisk = useMemo(
    () =>
      [...stateFeatures]
        .filter((feature) => feature.deviceCount > 0)
        .sort((a, b) => b.highRiskCount - a.highRiskCount || b.deviceCount - a.deviceCount)
        .slice(0, 8)
        .map((feature) => ({
          state: feature.stateCode,
          highRiskCount: feature.highRiskCount,
        })),
    [stateFeatures],
  );
  const topStateCost = useMemo(
    () =>
      [...stateFeatures]
        .filter((feature) => feature.deviceCount > 0)
        .sort((a, b) => b.estimatedRefreshCost - a.estimatedRefreshCost)
        .slice(0, 8)
        .map((feature) => ({
          state: feature.stateCode,
          estimatedRefreshCost: Math.round(feature.estimatedRefreshCost),
        })),
    [stateFeatures],
  );
  const breakdownChartRows = useMemo(
    () => breakdown.slice(0, 8).map((row) => ({ ...row, label: row.group })),
    [breakdown],
  );
  const radiusChartRows = useMemo(
    () =>
      radiusGroups.slice(0, 8).map((row) => ({
        groupId: row.groupId,
        highRiskCount: row.highRiskCount,
        estimatedCost: Math.round(row.estimatedCost),
        siteCount: row.siteCount,
      })),
    [radiusGroups],
  );
  const deviceChartFilters = useMemo(
    () => ({
      includeExceptions,
      includeOutOfScope,
      includeDecomSites,
      state: selectedState || undefined,
      affiliate: selectedAffiliate || undefined,
      deviceType: selectedDeviceType || undefined,
      asOfDate,
    }),
    [asOfDate, includeDecomSites, includeExceptions, includeOutOfScope, selectedAffiliate, selectedDeviceType, selectedState],
  );

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden border border-card-border">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url('https://www.southerncompany.com/future-of-energy/_jcr_content/root/responsivegrid/columnctr_2062999817_1028265797/colTwo/image_copy_copy.coreimg.png/1764952933747/our-future-nccc-1200x675.png')",
          }}
        />
        <div className="absolute inset-0 bg-[#00486f]/62" />
        <div className="relative flex h-[72px] items-center justify-between px-4 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/95">
            Lifecycle Risk Dashboard
          </p>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/90">
            Home
          </p>
        </div>
      </section>

      <section className="border border-card-border bg-card-bg p-5">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <select value={selectedState} onChange={(event) => setSelectedState(event.target.value)}>
            <option value="">All States</option>
            {filters?.states.map((state) => (
              <option key={state} value={state}>
                {getStateDisplayName(state)}
              </option>
            ))}
          </select>

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



      <section className="border border-card-border bg-card-bg p-5">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">Breakdown</h2>
            <p className="text-sm text-foreground/60">Current grouped distribution of high-risk and spend.</p>
          </div>
          <Link href={breakdownLink} className="btn btn-secondary btn-sm">Open full Breakdown</Link>
        </div>
        {errors.breakdown ? <p className="mb-3 text-sm text-red-500">{errors.breakdown}</p> : null}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={breakdownChartRows}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-card-border" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: "#ffffff", border: "1px solid #d4d4d4" }} />
                <Bar dataKey="highRiskCount" fill="var(--danger)" radius={0} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={breakdownChartRows}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-card-border" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(value) => formatCompactCurrency(Number(value))} />
                <Tooltip
                  formatter={(value) => [formatCurrency(Number(value)), "Estimated Cost"]}
                  contentStyle={{ backgroundColor: "#ffffff", border: "1px solid #d4d4d4" }}
                />
                <Bar dataKey="estimatedCost" fill="var(--warning)" radius={0} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th>Group</th>
                <th>High Risk</th>
                <th>Devices</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.slice(0, 5).map((row) => (
                <tr key={row.group}>
                  <td>{row.group}</td>
                  <td>{row.highRiskCount}</td>
                  <td>{row.deviceCount}</td>
                  <td>{formatCurrency(row.estimatedCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4 border border-card-border bg-card-bg p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">Devices</h2>
            <p className="text-sm text-foreground/60">Risk, lifecycle, and type distribution for devices in scope.</p>
          </div>
          <Link href={devicesLink} className="btn btn-secondary btn-sm">Open full Devices</Link>
        </div>
        {errors.devices ? <p className="text-sm text-red-500">{errors.devices}</p> : null}
        <DeviceChartsPanel filters={deviceChartFilters} />
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th>Device</th>
                <th>Type</th>
                <th>Model</th>
                <th>State</th>
                <th>Risk</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              {devicePreview?.data.map((device) => (
                <tr key={device.deviceId}>
                  <td className="font-semibold">{device.deviceName}</td>
                  <td>{device.deviceType}</td>
                  <td>{device.model}</td>
                  <td>{getStateDisplayName(device.stateCode)}</td>
                  <td>{device.riskScore}</td>
                  <td>{formatCurrency(device.estimatedRefreshCost)}</td>
                </tr>
              ))}
              {devicePreview && devicePreview.data.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-foreground/50">No devices for current scope.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="border border-card-border bg-card-bg p-5">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">Radius Groups</h2>
            <p className="text-sm text-foreground/60">Opportunity grouping by geography, risk volume, and spend.</p>
          </div>
          <Link href={radiusLink} className="btn btn-secondary btn-sm">Open full Radius Groups</Link>
        </div>
        {errors.radius ? <p className="mb-3 text-sm text-red-500">{errors.radius}</p> : null}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={radiusChartRows}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-card-border" />
                <XAxis dataKey="groupId" />
                <YAxis allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: "#ffffff", border: "1px solid #d4d4d4" }} />
                <Bar dataKey="highRiskCount" fill="var(--danger)" radius={0} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={radiusChartRows}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-card-border" />
                <XAxis dataKey="groupId" />
                <YAxis tickFormatter={(value) => formatCompactCurrency(Number(value))} />
                <Tooltip
                  formatter={(value) => [formatCurrency(Number(value)), "Estimated Cost"]}
                  contentStyle={{ backgroundColor: "#ffffff", border: "1px solid #d4d4d4" }}
                />
                <Bar dataKey="estimatedCost" fill="var(--accent)" radius={0} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="space-y-4 border border-card-border bg-card-bg p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">Exceptions</h2>
            <p className="text-sm text-foreground/60">Current exception health and trend visibility.</p>
          </div>
          <Link href="/exceptions" className="btn btn-secondary btn-sm">Open full Exceptions</Link>
        </div>
        {errors.exceptions ? <p className="text-sm text-red-500">{errors.exceptions}</p> : null}
        <ExceptionChartsPanel />
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th>Device</th>
                <th>Reason</th>
                <th>Tag</th>
                <th>Status</th>
                <th>Effective</th>
              </tr>
            </thead>
            <tbody>
              {exceptions.slice(0, 5).map((item) => (
                <tr key={item.id}>
                  <td className="font-semibold">{item.deviceName}</td>
                  <td>{item.reason}</td>
                  <td>{item.projectTag || "-"}</td>
                  <td>{item.isActive ? "Active" : "Inactive"}</td>
                  <td>{item.effectiveDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {errors.kpis ? <p className="text-sm text-red-500">{errors.kpis}</p> : null}
    </div>
  );
}
