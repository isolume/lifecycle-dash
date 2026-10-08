"use client";

import { useEffect, useMemo, useState } from "react";
import { PaginationControls } from "@/components/dashboard/pagination-controls";
import { useTimePreview } from "@/components/time/time-preview-provider";
import { getStateDisplayName } from "@/lib/geo/us-state-names";
import type { DashboardFilters } from "@/lib/types";

interface DeviceRow {
  deviceId: string;
  deviceName: string;
  serialNumber: string | null;
  sourceSystem: string;
  deviceType: string;
  model: string;
  siteCode: string | null;
  stateCode: string | null;
  affiliate: string | null;
  county: string | null;
  lifecycleStatus: string;
  riskBucket: string;
  riskScore: number;
  supportCoverage: "Supported" | "Unsupported" | "Unknown";
  securityRisk: "High" | "Medium" | "Low";
  estimatedLaborCost: number;
  estimatedTotalCost: number;
  estimatedRefreshCost: number;
  hasActiveException: boolean;
}

interface DeviceResponse {
  data: DeviceRow[];
  total: number;
  page: number;
  pageSize: number;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function DevicesPage() {
  const { asOfDate, setScope } = useTimePreview();
  const [filters, setFilters] = useState<DashboardFilters | null>(null);
  const [devices, setDevices] = useState<DeviceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedState, setSelectedState] = useState("");
  const [selectedAffiliate, setSelectedAffiliate] = useState("");
  const [selectedCounty, setSelectedCounty] = useState("");
  const [selectedDeviceType, setSelectedDeviceType] = useState("");
  const [selectedLifecycleStatus, setSelectedLifecycleStatus] = useState("");
  const [includeExceptions, setIncludeExceptions] = useState(false);
  const [includeOutOfScope, setIncludeOutOfScope] = useState(false);
  const [includeDecomSites, setIncludeDecomSites] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetch("/api/dashboard/filters", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setFilters(data as DashboardFilters))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (selectedState) params.set("state", selectedState);
      if (selectedAffiliate) params.set("affiliate", selectedAffiliate);
      if (selectedCounty) params.set("county", selectedCounty);
      if (selectedDeviceType) params.set("deviceType", selectedDeviceType);
      if (selectedLifecycleStatus) params.set("lifecycleStatus", selectedLifecycleStatus);
      if (search) params.set("search", search);
      if (asOfDate) params.set("asOfDate", asOfDate);
      params.set("includeExceptions", String(includeExceptions));
      params.set("includeOutOfScope", String(includeOutOfScope));
      params.set("includeDecomSites", String(includeDecomSites));
      params.set("page", String(page));
      params.set("pageSize", "25");

      try {
        const res = await fetch(`/api/devices?${params}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const data = (await res.json()) as DeviceResponse;
        if (active) setDevices(data);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Load failed");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => { active = false; };
  }, [asOfDate, includeDecomSites, includeExceptions, includeOutOfScope, selectedState, selectedAffiliate, selectedCounty, selectedDeviceType, selectedLifecycleStatus, search, page]);

  useEffect(() => {
    setScope({
      includeExceptions,
      includeOutOfScope,
      includeDecomSites,
      state: selectedState || undefined,
      affiliate: selectedAffiliate || undefined,
      county: selectedCounty || undefined,
      deviceType: selectedDeviceType || undefined,
    });
  }, [includeDecomSites, includeExceptions, includeOutOfScope, selectedAffiliate, selectedCounty, selectedDeviceType, selectedState, setScope]);

  const pages = useMemo(() => {
    if (!devices) return 1;
    return Math.max(1, Math.ceil(devices.total / devices.pageSize));
  }, [devices]);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden border border-card-border">
        <div
          className="absolute inset-0 bg-cover"
          style={{
            backgroundImage:
              "url('https://www.southerncompany.com/content/dam/southerncompany/images/homepage/Home%20Page_Clean%20Energy_Content_Solar%20Panel.jpg.imgw.1280.1280.jpg')",
            backgroundPosition: "62% 46%",
          }}
        />
        <div className="absolute inset-0 bg-[#00486f]/62" />
        <div className="relative flex h-[68px] items-center justify-end px-4 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/95">
            Devices
          </p>
        </div>
      </section>

      <section className="border border-card-border bg-card-bg p-5">
        <div className="mb-4 grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          <select value={selectedState} onChange={(e) => { setSelectedState(e.target.value); setPage(1); }}>
            <option value="">All States</option>
            {filters?.states.map((s) => <option key={s} value={s}>{getStateDisplayName(s)}</option>)}
          </select>

          <select value={selectedAffiliate} onChange={(e) => { setSelectedAffiliate(e.target.value); setPage(1); }}>
            <option value="">All Affiliates</option>
            {filters?.affiliates.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>

          <select value={selectedCounty} onChange={(e) => { setSelectedCounty(e.target.value); setPage(1); }}>
            <option value="">All Counties</option>
            {filters?.counties.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          <select value={selectedDeviceType} onChange={(e) => { setSelectedDeviceType(e.target.value); setPage(1); }}>
            <option value="">All Device Types</option>
            {filters?.deviceTypes.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>

          <select value={selectedLifecycleStatus} onChange={(e) => { setSelectedLifecycleStatus(e.target.value); setPage(1); }}>
            <option value="">All Lifecycle</option>
            {filters?.lifecycleStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>

          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search device/model"
          />
        </div>

        <label className="mb-4 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={includeExceptions} onChange={(e) => setIncludeExceptions(e.target.checked)} />
          Include exception devices
        </label>

        <div className="mb-4 flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={includeOutOfScope} onChange={(e) => setIncludeOutOfScope(e.target.checked)} />
            Include out-of-scope
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={includeDecomSites} onChange={(e) => setIncludeDecomSites(e.target.checked)} />
            Include decom sites
          </label>
        </div>

        {error ? <p className="mb-4 text-sm text-red-500">{error}</p> : null}

        {loading ? (
          <div className="space-y-2 py-12">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-10 w-full" />
            ))}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr>
                    <th>Device</th>
                    <th>Type</th>
                    <th>Model</th>
                    <th>Location</th>
                    <th>Lifecycle</th>
                    <th>Risk</th>
                    <th>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {devices?.data.map((device) => (
                    <tr key={device.deviceId}>
                      <td>
                        <div className="font-semibold text-foreground">{device.deviceName}</div>
                        <div className="text-xs text-foreground/50">{device.sourceSystem}</div>
                        {device.hasActiveException ? (
                          <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                            Exception
                          </span>
                        ) : null}
                      </td>
                      <td className="text-foreground/80">{device.deviceType}</td>
                      <td className="text-foreground/80">{device.model}</td>
                      <td className="text-foreground/80">
                        {[getStateDisplayName(device.stateCode), device.county].filter(Boolean).join(" / ") || "Unknown"}
                      </td>
                      <td className="text-foreground/80">{device.lifecycleStatus}</td>
                      <td>
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            device.riskScore >= 80
                              ? "bg-red-100 text-red-800"
                              : device.riskScore >= 65
                                ? "bg-orange-100 text-orange-800"
                                : device.riskScore >= 45
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-green-100 text-green-700"
                          }`}
                        >
                          {device.riskScore} ({device.riskBucket})
                        </span>
                      </td>
                      <td className="font-data text-foreground/80">{formatCurrency(device.estimatedRefreshCost)}</td>
                    </tr>
                  ))}
                  {devices && devices.data.length === 0 ? (
                    <tr>
                      <td className="text-foreground/50" colSpan={7}>
                        No matching devices.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between text-sm text-foreground/60">
              <span className="font-data">
                Showing page {devices?.page ?? 1} of {pages}
              </span>
              <PaginationControls currentPage={page} totalPages={pages} onPageChange={setPage} />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
