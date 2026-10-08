"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTimePreview } from "@/components/time/time-preview-provider";
import { HIGH_RISK_MIN, RADIUS_MILES_DEFAULT } from "@/lib/constants";
import type { RadiusGroup } from "@/lib/types";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function RadiusGroupsPage() {
  const { asOfDate, setScope } = useTimePreview();
  const [groups, setGroups] = useState<RadiusGroup[]>([]);
  const [radiusMi, setRadiusMi] = useState(RADIUS_MILES_DEFAULT);
  const [riskMin, setRiskMin] = useState(HIGH_RISK_MIN);
  const [includeExceptions, setIncludeExceptions] = useState(false);
  const [includeOutOfScope, setIncludeOutOfScope] = useState(false);
  const [includeDecomSites, setIncludeDecomSites] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        radiusMi: String(radiusMi),
        riskMin: String(riskMin),
        includeExceptions: String(includeExceptions),
        includeOutOfScope: String(includeOutOfScope),
        includeDecomSites: String(includeDecomSites),
      });
      if (asOfDate) {
        params.set("asOfDate", asOfDate);
      }

      try {
        const res = await fetch(`/api/dashboard/radius-groups?${params}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const data = (await res.json()) as RadiusGroup[];
        if (active) setGroups(data);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Load failed");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => { active = false; };
  }, [asOfDate, includeDecomSites, includeExceptions, includeOutOfScope, radiusMi, riskMin]);

  useEffect(() => {
    setScope({ includeExceptions, includeOutOfScope, includeDecomSites });
  }, [includeDecomSites, includeExceptions, includeOutOfScope, setScope]);

  function buildGroupHref(group: RadiusGroup): string {
    const params = new URLSearchParams({
      sites: group.siteCodes.join(","),
      radiusMi: String(radiusMi),
      riskMin: String(riskMin),
      includeExceptions: String(includeExceptions),
      includeOutOfScope: String(includeOutOfScope),
      includeDecomSites: String(includeDecomSites),
    });

    return `/radius-groups/${group.groupId}?${params.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Radius Opportunity Groups</h1>
        <p className="mt-2 text-sm text-foreground/60">
          Nearby high-risk sites grouped by geographic proximity for coordinated refresh planning.
        </p>
      </div>

      <section className="border border-card-border bg-card-bg p-5">
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-foreground/60">Radius (miles):</span>
            <input
              value={radiusMi}
              onChange={(e) => setRadiusMi(Number(e.target.value) || RADIUS_MILES_DEFAULT)}
              className="w-16"
              type="number"
              min={1}
              max={100}
            />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <span className="text-foreground/60">Risk threshold:</span>
            <input
              value={riskMin}
              onChange={(e) => setRiskMin(Number(e.target.value) || HIGH_RISK_MIN)}
              className="w-16"
              type="number"
              min={1}
              max={100}
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
          <div className="space-y-2 py-12">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton h-10 w-full" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr>
                  <th>Group</th>
                  <th>Sites</th>
                  <th>Devices</th>
                  <th>High Risk</th>
                  <th>Estimated Cost</th>
                  <th>Site Codes</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => {
                  const groupHref = buildGroupHref(group);

                  return (
                    <tr key={group.groupId} className="cursor-pointer">
                      <td className="font-semibold text-foreground">
                        <Link href={groupHref} className="block">
                          {group.groupId}
                        </Link>
                      </td>
                      <td className="font-data text-foreground/80">
                        <Link href={groupHref} className="block">
                          {group.siteCount}
                        </Link>
                      </td>
                      <td className="font-data text-foreground/80">
                        <Link href={groupHref} className="block">
                          {group.deviceCount}
                        </Link>
                      </td>
                      <td className="font-data text-foreground/80">
                        <Link href={groupHref} className="block">
                          {group.highRiskCount}
                        </Link>
                      </td>
                      <td className="font-data text-foreground/80">
                        <Link href={groupHref} className="block">
                          {formatCurrency(group.estimatedCost)}
                        </Link>
                      </td>
                      <td className="text-xs text-foreground/60">
                        <Link href={groupHref} className="block">
                          {group.siteCodes.join(", ")}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {groups.length === 0 ? (
                  <tr>
                    <td className="text-foreground/50" colSpan={6}>
                      No groups found for current risk threshold and radius.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
