import { Pool } from "pg";
import { HIGH_RISK_MIN } from "../constants";
import type {
  BucketDatum,
  CostDatum,
  DeviceChartsResponse,
  ExceptionChartsResponse,
  KeyCountDatum,
  MonthlyDatum,
  SiteChartsResponse,
  SiteDeviceChartsResponse,
  TopSiteChartDatum,
} from "../types";
import {
  applyFilters,
  baseEffectiveDevicesCte,
  buildTemporalQueryValues,
  type QueryFilters,
  QueryValue,
  TemporalQueryOptions,
} from "./common";

type SiteChartFilters = Pick<QueryFilters, "state" | "affiliate" | "county" | "deviceType" | "includeOutOfScope" | "includeDecomSites">;
type SiteDeviceChartFilters = Pick<QueryFilters, "state" | "affiliate" | "deviceType" | "siteCode" | "includeOutOfScope" | "includeDecomSites">;

function withPlanningTemporal(
  filters: Pick<QueryFilters, "includeOutOfScope" | "includeDecomSites">,
  temporal: TemporalQueryOptions,
): TemporalQueryOptions {
  return {
    ...temporal,
    includeOutOfScope: filters.includeOutOfScope ?? temporal.includeOutOfScope,
    includeDecomSites: filters.includeDecomSites ?? temporal.includeDecomSites,
  };
}

function mapRowsToBucketData(rows: Array<{ bucket: string; count: number }>): BucketDatum[] {
  return rows.map((row) => ({
    bucket: row.bucket,
    count: row.count,
  }));
}

function mapRowsToKeyCountData(rows: Array<{ key: string; count: number }>): KeyCountDatum[] {
  return rows.map((row) => ({
    key: row.key,
    count: row.count,
  }));
}

function mapRowsToCostData(rows: Array<{ label: string; cost: number }>): CostDatum[] {
  return rows.map((row) => ({
    label: row.label,
    cost: row.cost,
  }));
}

function mapRowsToMonthlyData(rows: Array<{ month: string; count: number }>): MonthlyDatum[] {
  return rows.map((row) => ({
    month: row.month,
    count: row.count,
  }));
}

export function getRiskBandLabel(score: number): string {
  if (score >= 80) {
    return "Critical (80+)";
  }

  if (score >= 65) {
    return "High (65-79)";
  }

  if (score >= 45) {
    return "Medium (45-64)";
  }

  return "Low (0-44)";
}

function buildSiteRollupCte(
  includeExceptions: boolean,
  filters: SiteChartFilters,
  highRiskOnly: boolean,
  temporal: TemporalQueryOptions = {},
): { cteSql: string; values: QueryValue[] } {
  const values: QueryValue[] = buildTemporalQueryValues(includeExceptions, withPlanningTemporal(filters, temporal));
  const conditions = ["d.site_code IS NOT NULL"];

  if (filters.deviceType) {
    values.push(filters.deviceType);
    conditions.push(`d.device_type = $${values.length}`);
  }

  if (filters.state) {
    values.push(filters.state);
    conditions.push(`d.state_code = $${values.length}`);
  }

  if (filters.affiliate) {
    values.push(filters.affiliate);
    conditions.push(`d.affiliate = $${values.length}`);
  }

  if (filters.county) {
    values.push(filters.county);
    conditions.push(`d.county = $${values.length}`);
  }

  const highRiskOnlySql = highRiskOnly
    ? `HAVING COUNT(*) FILTER (WHERE d.risk_score >= ${HIGH_RISK_MIN}) > 0`
    : "";

  const cteSql = `
    ${baseEffectiveDevicesCte()}
    , site_rollup AS (
      SELECT
        d.site_code,
        MAX(s.site_name) AS site_name,
        MAX(d.state_code) AS state_code,
        MAX(d.county) AS county,
        AVG(d.risk_score)::float AS risk_score_avg,
        COUNT(*)::int AS device_count,
        COUNT(*) FILTER (WHERE d.risk_score >= ${HIGH_RISK_MIN})::int AS high_risk_count,
        COALESCE(SUM(d.estimated_refresh_cost), 0)::float AS estimated_refresh_cost
      FROM effective_devices d
      LEFT JOIN sites s ON s.site_code = d.site_code
      WHERE ${conditions.join(" AND ")}
      GROUP BY d.site_code
      ${highRiskOnlySql}
    )
  `;

  return { cteSql, values };
}

export async function getDeviceCharts(
  pool: Pool,
  includeExceptions: boolean,
  filters: QueryFilters,
  temporal: TemporalQueryOptions = {},
): Promise<DeviceChartsResponse> {
  const values: QueryValue[] = buildTemporalQueryValues(includeExceptions, withPlanningTemporal(filters, temporal));
  const whereSql = applyFilters(filters, values);

  const [summaryResult, riskResult, lifecycleResult, deviceTypesResult, sourcesResult, supportMatrixResult, securityMatrixResult, securityCostResult] = await Promise.all([
    pool.query<{
      total_devices: number;
      high_risk_devices: number;
      estimated_refresh_cost: number;
    }>(
      `
        ${baseEffectiveDevicesCte()}
        SELECT
          COUNT(*)::int AS total_devices,
          COUNT(*) FILTER (WHERE risk_score >= ${HIGH_RISK_MIN})::int AS high_risk_devices,
          COALESCE(SUM(estimated_refresh_cost), 0)::float AS estimated_refresh_cost
        FROM effective_devices
        ${whereSql}
      `,
      values,
    ),
    pool.query<{ bucket: string; count: number }>(
      `
        ${baseEffectiveDevicesCte()}
        SELECT
          COALESCE(risk_bucket, 'Unknown') AS bucket,
          COUNT(*)::int AS count
        FROM effective_devices
        ${whereSql}
        GROUP BY COALESCE(risk_bucket, 'Unknown')
        ORDER BY count DESC, bucket ASC
      `,
      values,
    ),
    pool.query<{ bucket: string; count: number }>(
      `
        ${baseEffectiveDevicesCte()}
        SELECT
          COALESCE(lifecycle_status, 'Unknown') AS bucket,
          COUNT(*)::int AS count
        FROM effective_devices
        ${whereSql}
        GROUP BY COALESCE(lifecycle_status, 'Unknown')
        ORDER BY count DESC, bucket ASC
      `,
      values,
    ),
    pool.query<{ key: string; count: number }>(
      `
        ${baseEffectiveDevicesCte()}
        SELECT
          COALESCE(device_type, 'Unknown') AS key,
          COUNT(*)::int AS count
        FROM effective_devices
        ${whereSql}
        GROUP BY COALESCE(device_type, 'Unknown')
        ORDER BY count DESC, key ASC
        LIMIT 8
      `,
      values,
    ),
    pool.query<{ key: string; count: number }>(
      `
        ${baseEffectiveDevicesCte()}
        SELECT
          COALESCE(source_system, 'Unknown') AS key,
          COUNT(*)::int AS count
        FROM effective_devices
        ${whereSql}
        GROUP BY COALESCE(source_system, 'Unknown')
        ORDER BY count DESC, key ASC
      `,
      values,
    ),
    pool.query<{
      lifecycle_status: string;
      supported: number;
      unsupported: number;
      unknown: number;
    }>(
      `
        ${baseEffectiveDevicesCte()}
        SELECT
          COALESCE(lifecycle_status, 'Unknown') AS lifecycle_status,
          COUNT(*) FILTER (WHERE support_coverage = 'Supported')::int AS supported,
          COUNT(*) FILTER (WHERE support_coverage = 'Unsupported')::int AS unsupported,
          COUNT(*) FILTER (WHERE support_coverage = 'Unknown')::int AS unknown
        FROM effective_devices
        ${whereSql}
        GROUP BY COALESCE(lifecycle_status, 'Unknown')
        ORDER BY lifecycle_status ASC
      `,
      values,
    ),
    pool.query<{
      lifecycle_status: string;
      high: number;
      medium: number;
      low: number;
    }>(
      `
        ${baseEffectiveDevicesCte()}
        SELECT
          COALESCE(lifecycle_status, 'Unknown') AS lifecycle_status,
          COUNT(*) FILTER (WHERE security_risk = 'High')::int AS high,
          COUNT(*) FILTER (WHERE security_risk = 'Medium')::int AS medium,
          COUNT(*) FILTER (WHERE security_risk = 'Low')::int AS low
        FROM effective_devices
        ${whereSql}
        GROUP BY COALESCE(lifecycle_status, 'Unknown')
        ORDER BY lifecycle_status ASC
      `,
      values,
    ),
    pool.query<{ label: string; cost: number }>(
      `
        ${baseEffectiveDevicesCte()}
        SELECT
          COALESCE(security_risk, 'Unknown') AS label,
          COALESCE(SUM(estimated_refresh_cost), 0)::float AS cost
        FROM effective_devices
        ${whereSql}
        GROUP BY COALESCE(security_risk, 'Unknown')
        ORDER BY cost DESC, label ASC
      `,
      values,
    ),
  ]);

  const summary = summaryResult.rows[0];

  return {
    summary: {
      totalDevices: summary?.total_devices ?? 0,
      highRiskDevices: summary?.high_risk_devices ?? 0,
      estimatedRefreshCost: summary?.estimated_refresh_cost ?? 0,
    },
    riskBuckets: mapRowsToBucketData(riskResult.rows),
    lifecycleStatuses: mapRowsToBucketData(lifecycleResult.rows),
    topDeviceTypes: mapRowsToKeyCountData(deviceTypesResult.rows),
    sourceSystems: mapRowsToKeyCountData(sourcesResult.rows),
    lifecycleBySupportCoverage: supportMatrixResult.rows.map((row) => ({
      lifecycleStatus: row.lifecycle_status,
      supported: row.supported,
      unsupported: row.unsupported,
      unknown: row.unknown,
    })),
    lifecycleBySecurityRisk: securityMatrixResult.rows.map((row) => ({
      lifecycleStatus: row.lifecycle_status,
      high: row.high,
      medium: row.medium,
      low: row.low,
    })),
    costBySecurityRisk: mapRowsToCostData(securityCostResult.rows),
  };
}

export async function getSiteCharts(
  pool: Pool,
  includeExceptions: boolean,
  filters: SiteChartFilters,
  highRiskOnly: boolean,
  limit: number,
  temporal: TemporalQueryOptions = {},
): Promise<SiteChartsResponse> {
  const { cteSql, values } = buildSiteRollupCte(includeExceptions, filters, highRiskOnly, temporal);
  const geographyExpr = filters.state ? "COALESCE(county, 'Unknown')" : "COALESCE(state_code, 'Unknown')";

  const [summaryResult, riskBandsResult, topSitesResult, geographyResult] = await Promise.all([
    pool.query<{
      total_sites: number;
      total_devices: number;
      high_risk_sites: number;
      estimated_refresh_cost: number;
    }>(
      `
        ${cteSql}
        SELECT
          COUNT(*)::int AS total_sites,
          COALESCE(SUM(device_count), 0)::int AS total_devices,
          COUNT(*) FILTER (WHERE high_risk_count > 0)::int AS high_risk_sites,
          COALESCE(SUM(estimated_refresh_cost), 0)::float AS estimated_refresh_cost
        FROM site_rollup
      `,
      values,
    ),
    pool.query<{ bucket: string; count: number }>(
      `
        ${cteSql}
        SELECT
          CASE
            WHEN risk_score_avg >= 80 THEN 'Critical (80+)'
            WHEN risk_score_avg >= 65 THEN 'High (65-79)'
            WHEN risk_score_avg >= 45 THEN 'Medium (45-64)'
            ELSE 'Low (0-44)'
          END AS bucket,
          COUNT(*)::int AS count
        FROM site_rollup
        GROUP BY 1
        ORDER BY count DESC, bucket ASC
      `,
      values,
    ),
    pool.query<{
      site_code: string;
      site_name: string | null;
      state_code: string | null;
      county: string | null;
      risk_score_avg: number;
      device_count: number;
      high_risk_count: number;
      estimated_refresh_cost: number;
    }>(
      `
        ${cteSql}
        SELECT
          site_code,
          site_name,
          state_code,
          county,
          risk_score_avg,
          device_count,
          high_risk_count,
          estimated_refresh_cost
        FROM site_rollup
        ORDER BY high_risk_count DESC, risk_score_avg DESC, estimated_refresh_cost DESC, site_code ASC
        LIMIT $${values.length + 1}
      `,
      [...values, Math.max(1, limit)],
    ),
    pool.query<{ label: string; cost: number }>(
      `
        ${cteSql}
        SELECT
          ${geographyExpr} AS label,
          COALESCE(SUM(estimated_refresh_cost), 0)::float AS cost
        FROM site_rollup
        GROUP BY ${geographyExpr}
        ORDER BY cost DESC, label ASC
        LIMIT 10
      `,
      values,
    ),
  ]);

  const summary = summaryResult.rows[0];
  const topSites: TopSiteChartDatum[] = topSitesResult.rows.map((row) => ({
    siteCode: row.site_code,
    siteName: row.site_name,
    stateCode: row.state_code,
    county: row.county,
    riskScoreAvg: row.risk_score_avg,
    deviceCount: row.device_count,
    highRiskCount: row.high_risk_count,
    estimatedRefreshCost: row.estimated_refresh_cost,
  }));

  return {
    summary: {
      totalSites: summary?.total_sites ?? 0,
      totalDevices: summary?.total_devices ?? 0,
      highRiskSites: summary?.high_risk_sites ?? 0,
      estimatedRefreshCost: summary?.estimated_refresh_cost ?? 0,
    },
    riskBands: mapRowsToBucketData(riskBandsResult.rows),
    geographyCosts: mapRowsToCostData(geographyResult.rows),
    topSites,
  };
}

export async function getSiteDeviceCharts(
  pool: Pool,
  includeExceptions: boolean,
  filters: SiteDeviceChartFilters,
  temporal: TemporalQueryOptions = {},
): Promise<SiteDeviceChartsResponse> {
  const values: QueryValue[] = buildTemporalQueryValues(includeExceptions, withPlanningTemporal(filters, temporal));
  const whereSql = applyFilters(
    {
      siteCode: filters.siteCode,
      state: filters.state,
      affiliate: filters.affiliate,
      deviceType: filters.deviceType,
    },
    values,
  );

  const [summaryResult, riskResult, lifecycleResult, typesResult] = await Promise.all([
    pool.query<{
      total_devices: number;
      high_risk_devices: number;
      estimated_refresh_cost: number;
      avg_risk_score: number | null;
    }>(
      `
        ${baseEffectiveDevicesCte()}
        SELECT
          COUNT(*)::int AS total_devices,
          COUNT(*) FILTER (WHERE risk_score >= ${HIGH_RISK_MIN})::int AS high_risk_devices,
          COALESCE(SUM(estimated_refresh_cost), 0)::float AS estimated_refresh_cost,
          AVG(risk_score)::float AS avg_risk_score
        FROM effective_devices
        ${whereSql}
      `,
      values,
    ),
    pool.query<{ bucket: string; count: number }>(
      `
        ${baseEffectiveDevicesCte()}
        SELECT
          COALESCE(risk_bucket, 'Unknown') AS bucket,
          COUNT(*)::int AS count
        FROM effective_devices
        ${whereSql}
        GROUP BY COALESCE(risk_bucket, 'Unknown')
        ORDER BY count DESC, bucket ASC
      `,
      values,
    ),
    pool.query<{ bucket: string; count: number }>(
      `
        ${baseEffectiveDevicesCte()}
        SELECT
          COALESCE(lifecycle_status, 'Unknown') AS bucket,
          COUNT(*)::int AS count
        FROM effective_devices
        ${whereSql}
        GROUP BY COALESCE(lifecycle_status, 'Unknown')
        ORDER BY count DESC, bucket ASC
      `,
      values,
    ),
    pool.query<{ key: string; count: number }>(
      `
        ${baseEffectiveDevicesCte()}
        SELECT
          COALESCE(device_type, 'Unknown') AS key,
          COUNT(*)::int AS count
        FROM effective_devices
        ${whereSql}
        GROUP BY COALESCE(device_type, 'Unknown')
        ORDER BY count DESC, key ASC
        LIMIT 10
      `,
      values,
    ),
  ]);

  const summary = summaryResult.rows[0];
  return {
    summary: {
      totalDevices: summary?.total_devices ?? 0,
      highRiskDevices: summary?.high_risk_devices ?? 0,
      estimatedRefreshCost: summary?.estimated_refresh_cost ?? 0,
      avgRiskScore: summary?.avg_risk_score ?? null,
    },
    riskBuckets: mapRowsToBucketData(riskResult.rows),
    lifecycleStatuses: mapRowsToBucketData(lifecycleResult.rows),
    deviceTypes: mapRowsToKeyCountData(typesResult.rows),
  };
}

export async function getExceptionCharts(
  pool: Pool,
  filters: { projectTag?: string; isActive?: boolean },
): Promise<ExceptionChartsResponse> {
  const values: Array<string | number | boolean> = [];
  const conditions: string[] = [];

  if (filters.projectTag) {
    values.push(filters.projectTag);
    conditions.push(`project_tag = $${values.length}`);
  }

  if (typeof filters.isActive === "boolean") {
    values.push(filters.isActive);
    conditions.push(`is_active = $${values.length}`);
  }

  const whereSql = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [statusResult, tagsResult, monthlyResult] = await Promise.all([
    pool.query<{ bucket: string; count: number }>(
      `
        SELECT
          CASE WHEN is_active THEN 'Active' ELSE 'Inactive' END AS bucket,
          COUNT(*)::int AS count
        FROM device_exceptions
        ${whereSql}
        GROUP BY 1
        ORDER BY count DESC, bucket ASC
      `,
      values,
    ),
    pool.query<{ key: string; count: number }>(
      `
        SELECT
          COALESCE(NULLIF(project_tag, ''), 'Unassigned') AS key,
          COUNT(*)::int AS count
        FROM device_exceptions
        ${whereSql}
        GROUP BY 1
        ORDER BY count DESC, key ASC
        LIMIT 10
      `,
      values,
    ),
    pool.query<{ month: string; count: number }>(
      `
        SELECT
          TO_CHAR(DATE_TRUNC('month', effective_date), 'YYYY-MM') AS month,
          COUNT(*)::int AS count
        FROM device_exceptions
        ${whereSql}
        GROUP BY 1
        ORDER BY month ASC
      `,
      values,
    ),
  ]);

  return {
    statusCounts: mapRowsToBucketData(statusResult.rows),
    byProjectTag: mapRowsToKeyCountData(tagsResult.rows),
    monthlyEffective: mapRowsToMonthlyData(monthlyResult.rows),
  };
}
