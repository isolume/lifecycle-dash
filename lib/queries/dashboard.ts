import { Pool } from "pg";
import {
  BreakdownRow,
  DashboardFilters,
  HeatPoint,
  KpiResponse,
  RadiusGroup,
  RadiusGroupSiteSummary,
  TimePreviewBoundsResponse,
} from "../types";
import {
  applyFilters,
  baseEffectiveDevicesCte,
  buildTemporalQueryValues,
  milesToMeters,
  QueryFilters,
  QueryValue,
  TemporalQueryOptions,
} from "./common";
import { localIsoDate } from "../time/date";

type PlanningFilterFlags = Pick<QueryFilters, "includeOutOfScope" | "includeDecomSites">;

function withPlanningTemporal(
  filters: PlanningFilterFlags,
  temporal: TemporalQueryOptions,
): TemporalQueryOptions {
  return {
    ...temporal,
    includeOutOfScope: filters.includeOutOfScope ?? temporal.includeOutOfScope,
    includeDecomSites: filters.includeDecomSites ?? temporal.includeDecomSites,
  };
}

export async function getDashboardFilters(pool: Pool): Promise<DashboardFilters> {
  const [states, affiliates, counties, deviceTypes, lifecycleStatuses] = await Promise.all([
    pool.query<{ state_code: string }>(
      `SELECT DISTINCT state_code FROM devices WHERE state_code IS NOT NULL AND state_code <> '' ORDER BY state_code`,
    ),
    pool.query<{ affiliate: string }>(
      `SELECT DISTINCT affiliate FROM devices WHERE affiliate IS NOT NULL AND affiliate <> '' ORDER BY affiliate`,
    ),
    pool.query<{ county: string }>(
      `SELECT DISTINCT county FROM devices WHERE county IS NOT NULL AND county <> '' ORDER BY county`,
    ),
    pool.query<{ device_type: string }>(
      `SELECT DISTINCT device_type FROM devices WHERE device_type IS NOT NULL AND device_type <> '' ORDER BY device_type`,
    ),
    pool.query<{ lifecycle_status: string }>(
      `SELECT DISTINCT lifecycle_status FROM devices WHERE lifecycle_status IS NOT NULL AND lifecycle_status <> '' ORDER BY lifecycle_status`,
    ),
  ]);

  return {
    states: states.rows.map((row) => row.state_code),
    affiliates: affiliates.rows.map((row) => row.affiliate),
    counties: counties.rows.map((row) => row.county),
    deviceTypes: deviceTypes.rows.map((row) => row.device_type),
    lifecycleStatuses: lifecycleStatuses.rows.map((row) => row.lifecycle_status),
  };
}

export async function getTimePreviewBounds(
  pool: Pool,
  currentDate?: string,
): Promise<TimePreviewBoundsResponse> {
  const result = await pool.query<{
    min_date: string;
    max_date: string;
    default_date: string;
  }>(
    `
      WITH requested AS (
        SELECT COALESCE($1::date, CURRENT_DATE) AS current_date
      )
      SELECT
        requested.current_date::text AS min_date,
        GREATEST(
          COALESCE(MAX(d.eol_date), requested.current_date),
          COALESCE(MAX(d.eos_date), requested.current_date),
          requested.current_date
        )::text AS max_date,
        requested.current_date::text AS default_date
      FROM devices d
      CROSS JOIN requested
      GROUP BY requested.current_date
    `,
    [currentDate ?? null],
  );

  const row = result.rows[0];
  const today = localIsoDate();
  return {
    minDate: row?.min_date ?? today,
    maxDate: row?.max_date ?? today,
    defaultDate: row?.default_date ?? today,
  };
}

export async function getKpis(
  pool: Pool,
  includeExceptions: boolean,
  filters: Pick<QueryFilters, "deviceType" | "state" | "affiliate" | "county" | "siteCode" | "siteCodes" | "includeOutOfScope" | "includeDecomSites"> = {},
  temporal: TemporalQueryOptions = {},
): Promise<KpiResponse> {
  const values: QueryValue[] = buildTemporalQueryValues(includeExceptions, withPlanningTemporal(filters, temporal));
  const whereSql = applyFilters(filters, values);
  const query = `
    ${baseEffectiveDevicesCte()}
    SELECT
      COUNT(*)::int AS total_active_devices,
      COUNT(*) FILTER (WHERE risk_score >= 65)::int AS high_risk_devices,
      COUNT(*) FILTER (WHERE lifecycle_status = 'Past EoL')::int AS past_eol_devices,
      COALESCE(SUM(estimated_refresh_cost), 0)::float AS estimated_refresh_cost,
      COUNT(DISTINCT site_code) FILTER (WHERE risk_score >= 65 AND site_code IS NOT NULL)::int AS sites_with_high_risk
    FROM effective_devices
    ${whereSql}
  `;

  const result = await pool.query<{
    total_active_devices: number;
    high_risk_devices: number;
    past_eol_devices: number;
    estimated_refresh_cost: number;
    sites_with_high_risk: number;
  }>(query, values);

  const row = result.rows[0];

  return {
    totalActiveDevices: row?.total_active_devices ?? 0,
    highRiskDevices: row?.high_risk_devices ?? 0,
    pastEolDevices: row?.past_eol_devices ?? 0,
    estimatedRefreshCost: row?.estimated_refresh_cost ?? 0,
    sitesWithHighRisk: row?.sites_with_high_risk ?? 0,
  };
}

export async function getHeatmapPoints(
  pool: Pool,
  includeExceptions: boolean,
  filters: Pick<QueryFilters, "deviceType" | "state" | "affiliate" | "county" | "includeOutOfScope" | "includeDecomSites">,
  temporal: TemporalQueryOptions = {},
): Promise<HeatPoint[]> {
  const values: QueryValue[] = buildTemporalQueryValues(includeExceptions, withPlanningTemporal(filters, temporal));
  const conditions: string[] = ["lat IS NOT NULL", "lon IS NOT NULL"];

  if (filters.deviceType) {
    values.push(filters.deviceType);
    conditions.push(`device_type = $${values.length}`);
  }

  if (filters.state) {
    values.push(filters.state);
    conditions.push(`state_code = $${values.length}`);
  }

  if (filters.affiliate) {
    values.push(filters.affiliate);
    conditions.push(`affiliate = $${values.length}`);
  }

  if (filters.county) {
    values.push(filters.county);
    conditions.push(`county = $${values.length}`);
  }

  const query = `
    ${baseEffectiveDevicesCte()}
    SELECT
      COALESCE(site_code, 'UNKNOWN') AS site_code,
      AVG(lat)::float AS lat,
      AVG(lon)::float AS lon,
      AVG(risk_score)::float AS risk_score_avg,
      COUNT(*)::int AS device_count,
      COUNT(*) FILTER (WHERE risk_score >= 65)::int AS high_risk_count
    FROM effective_devices
    WHERE ${conditions.join(" AND ")}
    GROUP BY COALESCE(site_code, 'UNKNOWN')
    ORDER BY risk_score_avg DESC
  `;

  const result = await pool.query<{
    site_code: string;
    lat: number;
    lon: number;
    risk_score_avg: number;
    device_count: number;
    high_risk_count: number;
  }>(query, values);

  return result.rows.map((row) => ({
    siteCode: row.site_code,
    lat: row.lat,
    lon: row.lon,
    riskScoreAvg: row.risk_score_avg,
    deviceCount: row.device_count,
    highRiskCount: row.high_risk_count,
  }));
}

const BREAKDOWN_GROUP_COLUMNS: Record<string, string> = {
  state: "COALESCE(state_code, 'Unknown')",
  affiliate: "COALESCE(affiliate, 'Unknown')",
  county: "COALESCE(county, 'Unknown')",
  model: "COALESCE(model, 'Unknown')",
  device_type: "COALESCE(device_type, 'Unknown')",
};

export async function getBreakdown(
  pool: Pool,
  includeExceptions: boolean,
  groupBy: keyof typeof BREAKDOWN_GROUP_COLUMNS,
  filters: Pick<QueryFilters, "deviceType" | "state" | "affiliate" | "county" | "includeOutOfScope" | "includeDecomSites"> = {},
  temporal: TemporalQueryOptions = {},
): Promise<BreakdownRow[]> {
  const groupColumn = BREAKDOWN_GROUP_COLUMNS[groupBy] ?? BREAKDOWN_GROUP_COLUMNS.state;
  const values: QueryValue[] = buildTemporalQueryValues(includeExceptions, withPlanningTemporal(filters, temporal));
  const whereSql = applyFilters(filters, values);

  const query = `
    ${baseEffectiveDevicesCte()}
    SELECT
      ${groupColumn} AS group_value,
      COUNT(*)::int AS device_count,
      COUNT(*) FILTER (WHERE risk_score >= 65)::int AS high_risk_count,
      COUNT(*) FILTER (WHERE lifecycle_status = 'Past EoL')::int AS past_eol_count,
      COALESCE(SUM(estimated_refresh_cost), 0)::float AS estimated_cost
    FROM effective_devices
    ${whereSql}
    GROUP BY ${groupColumn}
    ORDER BY high_risk_count DESC, device_count DESC
    LIMIT 25
  `;

  const result = await pool.query<{
    group_value: string;
    device_count: number;
    high_risk_count: number;
    past_eol_count: number;
    estimated_cost: number;
  }>(query, values);

  return result.rows.map((row) => ({
    group: row.group_value,
    deviceCount: row.device_count,
    highRiskCount: row.high_risk_count,
    pastEolCount: row.past_eol_count,
    estimatedCost: row.estimated_cost,
  }));
}

type RadiusSiteStat = {
  site_code: string;
  device_count: number;
  high_risk_count: number;
  estimated_cost: number;
};

type RadiusEdge = {
  a_site: string;
  b_site: string;
};

class UnionFind {
  private parent = new Map<string, string>();

  add(value: string): void {
    if (!this.parent.has(value)) {
      this.parent.set(value, value);
    }
  }

  find(value: string): string {
    const parent = this.parent.get(value);
    if (!parent) {
      this.parent.set(value, value);
      return value;
    }

    if (parent === value) {
      return value;
    }

    const root = this.find(parent);
    this.parent.set(value, root);
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);

    if (rootA !== rootB) {
      this.parent.set(rootB, rootA);
    }
  }

  groups(): Map<string, string[]> {
    const grouped = new Map<string, string[]>();

    for (const value of this.parent.keys()) {
      const root = this.find(value);
      const items = grouped.get(root) ?? [];
      items.push(value);
      grouped.set(root, items);
    }

    return grouped;
  }
}

export async function getRadiusGroups(
  pool: Pool,
  includeExceptions: boolean,
  radiusMi: number,
  riskMin: number,
  filters: Pick<QueryFilters, "deviceType" | "state" | "affiliate" | "county" | "includeOutOfScope" | "includeDecomSites"> = {},
  temporal: TemporalQueryOptions = {},
): Promise<RadiusGroup[]> {
  const radiusMeters = milesToMeters(radiusMi);

  const values: QueryValue[] = buildTemporalQueryValues(includeExceptions, withPlanningTemporal(filters, temporal));
  values.push(riskMin);
  const riskMinIndex = values.length;
  const conditions = [
    "site_code IS NOT NULL",
    "lat IS NOT NULL",
    "lon IS NOT NULL",
    `risk_score >= $${riskMinIndex}`,
  ];

  if (filters.deviceType) {
    values.push(filters.deviceType);
    conditions.push(`device_type = $${values.length}`);
  }

  if (filters.state) {
    values.push(filters.state);
    conditions.push(`state_code = $${values.length}`);
  }

  if (filters.affiliate) {
    values.push(filters.affiliate);
    conditions.push(`affiliate = $${values.length}`);
  }

  if (filters.county) {
    values.push(filters.county);
    conditions.push(`county = $${values.length}`);
  }

  const siteStatsQuery = `
    ${baseEffectiveDevicesCte()}
    SELECT
      site_code,
      COUNT(*)::int AS device_count,
      COUNT(*) FILTER (WHERE risk_score >= $${riskMinIndex})::int AS high_risk_count,
      COALESCE(SUM(estimated_refresh_cost), 0)::float AS estimated_cost
    FROM effective_devices
    WHERE ${conditions.join(" AND ")}
    GROUP BY site_code
  `;

  const siteStatsResult = await pool.query<RadiusSiteStat>(siteStatsQuery, values);
  const siteStats = siteStatsResult.rows;

  if (!siteStats.length) {
    return [];
  }

  const edgeValues: QueryValue[] = buildTemporalQueryValues(includeExceptions, withPlanningTemporal(filters, temporal));
  edgeValues.push(riskMin);
  const edgeRiskMinIndex = edgeValues.length;
  edgeValues.push(radiusMeters);
  const radiusIndex = edgeValues.length;
  const edgeConditions = [
    "site_code IS NOT NULL",
    "lat IS NOT NULL",
    "lon IS NOT NULL",
    `risk_score >= $${edgeRiskMinIndex}`,
  ];

  if (filters.deviceType) {
    edgeValues.push(filters.deviceType);
    edgeConditions.push(`device_type = $${edgeValues.length}`);
  }

  if (filters.state) {
    edgeValues.push(filters.state);
    edgeConditions.push(`state_code = $${edgeValues.length}`);
  }

  if (filters.affiliate) {
    edgeValues.push(filters.affiliate);
    edgeConditions.push(`affiliate = $${edgeValues.length}`);
  }

  if (filters.county) {
    edgeValues.push(filters.county);
    edgeConditions.push(`county = $${edgeValues.length}`);
  }

  const edgeQuery = `
    ${baseEffectiveDevicesCte()}
    , site_nodes AS (
      SELECT
        site_code,
        ST_SetSRID(ST_MakePoint(AVG(lon), AVG(lat)), 4326)::geography AS geom
      FROM effective_devices
      WHERE ${edgeConditions.join(" AND ")}
      GROUP BY site_code
    )
    SELECT a.site_code AS a_site, b.site_code AS b_site
    FROM site_nodes a
    JOIN site_nodes b
     ON a.site_code < b.site_code
     AND ST_DWithin(a.geom, b.geom, $${radiusIndex})
  `;

  const edgeResult = await pool.query<RadiusEdge>(edgeQuery, edgeValues);

  const unionFind = new UnionFind();
  const statBySite = new Map(siteStats.map((row) => [row.site_code, row]));

  for (const stat of siteStats) {
    unionFind.add(stat.site_code);
  }

  for (const edge of edgeResult.rows) {
    unionFind.union(edge.a_site, edge.b_site);
  }

  const groups = unionFind.groups();
  const result: RadiusGroup[] = [];

  let idx = 1;
  for (const siteCodes of groups.values()) {
    const uniqueSiteCodes = [...new Set(siteCodes)].sort();

    let deviceCount = 0;
    let highRiskCount = 0;
    let estimatedCost = 0;

    for (const siteCode of uniqueSiteCodes) {
      const stat = statBySite.get(siteCode);
      if (!stat) {
        continue;
      }

      deviceCount += stat.device_count;
      highRiskCount += stat.high_risk_count;
      estimatedCost += stat.estimated_cost;
    }

    result.push({
      groupId: `RG-${idx.toString().padStart(3, "0")}`,
      radiusMi,
      siteCodes: uniqueSiteCodes,
      siteCount: uniqueSiteCodes.length,
      deviceCount,
      highRiskCount,
      estimatedCost,
    });

    idx += 1;
  }

  return result.sort((a, b) => b.highRiskCount - a.highRiskCount || b.estimatedCost - a.estimatedCost);
}

type RadiusGroupSiteSummaryRow = {
  site_code: string;
  device_count: number;
  high_risk_count: number;
  estimated_cost: number;
  risk_score_avg: number;
};

export async function getRadiusGroupSiteSummaries(
  pool: Pool,
  includeExceptions: boolean,
  siteCodes: string[],
  riskMin: number,
  filters: Pick<QueryFilters, "deviceType" | "state" | "affiliate" | "county" | "includeOutOfScope" | "includeDecomSites"> = {},
  temporal: TemporalQueryOptions = {},
): Promise<RadiusGroupSiteSummary[]> {
  const uniqueSiteCodes = [...new Set(siteCodes.map((siteCode) => siteCode.trim().toUpperCase()).filter(Boolean))];
  if (!uniqueSiteCodes.length) {
    return [];
  }

  const values: QueryValue[] = [
    ...buildTemporalQueryValues(includeExceptions, withPlanningTemporal(filters, temporal)),
    uniqueSiteCodes,
    riskMin,
  ];
  const siteCodesIndex = values.length - 1;
  const riskMinIndex = values.length;
  const query = `
    WITH requested_sites AS (
      SELECT DISTINCT UNNEST($${siteCodesIndex}::text[]) AS site_code
    ),
    ${baseEffectiveDevicesCte().trim().replace(/^WITH\s+/i, "")}
    SELECT
      s.site_code,
      COUNT(d.device_name)::int AS device_count,
      COUNT(d.device_name) FILTER (WHERE d.risk_score >= $${riskMinIndex})::int AS high_risk_count,
      COALESCE(SUM(d.estimated_refresh_cost), 0)::float AS estimated_cost,
      COALESCE(AVG(d.risk_score), 0)::float AS risk_score_avg
    FROM requested_sites s
    LEFT JOIN effective_devices d ON d.site_code = s.site_code
    GROUP BY s.site_code
    ORDER BY high_risk_count DESC, estimated_cost DESC, s.site_code ASC
  `;

  const result = await pool.query<RadiusGroupSiteSummaryRow>(query, values);
  return result.rows.map((row) => ({
    siteCode: row.site_code,
    deviceCount: row.device_count,
    highRiskCount: row.high_risk_count,
    estimatedCost: row.estimated_cost,
    riskScoreAvg: row.risk_score_avg,
  }));
}
