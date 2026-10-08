import { Pool } from "pg";
import { HIGH_RISK_MIN } from "../constants";
import { getCountyBoundariesForState, getCountyFipsForPoint, getStateBoundaries } from "../geo/us-boundaries";
import { computeWeightedAverageRisk } from "../maps/aggregation";
import {
  ApiListResult,
  CountyMapFeature,
  CountySiteMarker,
  CountySitesResponse,
  SiteListItem,
  SiteSummaryResponse,
  StateMapFeature,
} from "../types";
import {
  baseEffectiveDevicesCte,
  buildTemporalQueryValues,
  QueryFilters,
  QueryValue,
  TemporalQueryOptions,
} from "./common";

type MapFilters = Pick<QueryFilters, "affiliate" | "deviceType" | "state" | "includeOutOfScope" | "includeDecomSites">;

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

type StateAggregateRow = {
  state_code: string;
  risk_score_avg: number;
  estimated_refresh_cost: number;
  device_count: number;
  high_risk_count: number;
};

type SiteAggregateRow = {
  site_code: string;
  site_name: string | null;
  lat: number;
  lon: number;
  risk_score_avg: number;
  device_count: number;
  high_risk_count: number;
  estimated_refresh_cost: number;
};

type SiteSummaryRow = {
  site_code: string;
  site_name: string | null;
  lat: number;
  lon: number;
  risk_score_avg: number;
  device_count: number;
  high_risk_count: number;
  estimated_refresh_cost: number;
};

function toSiteMarker(row: SiteAggregateRow): CountySiteMarker {
  return {
    siteCode: row.site_code,
    siteName: row.site_name,
    lat: row.lat,
    lon: row.lon,
    riskScoreAvg: row.risk_score_avg,
    deviceCount: row.device_count,
    highRiskCount: row.high_risk_count,
    estimatedRefreshCost: row.estimated_refresh_cost,
  };
}

async function getSiteAggregates(
  pool: Pool,
  includeExceptions: boolean,
  filters: MapFilters,
  temporal: TemporalQueryOptions = {},
): Promise<SiteAggregateRow[]> {
  const values: QueryValue[] = buildTemporalQueryValues(includeExceptions, withPlanningTemporal(filters, temporal));
  const conditions = ["d.site_code IS NOT NULL", "d.lat IS NOT NULL", "d.lon IS NOT NULL"];

  if (filters.deviceType) {
    values.push(filters.deviceType);
    conditions.push(`d.device_type = $${values.length}`);
  }

  if (filters.affiliate) {
    values.push(filters.affiliate);
    conditions.push(`d.affiliate = $${values.length}`);
  }

  if (filters.state) {
    values.push(filters.state);
    conditions.push(`d.state_code = $${values.length}`);
  }

  const query = `
    ${baseEffectiveDevicesCte()}
    SELECT
      d.site_code,
      MAX(s.site_name) AS site_name,
      AVG(d.lat)::float AS lat,
      AVG(d.lon)::float AS lon,
      AVG(d.risk_score)::float AS risk_score_avg,
      COUNT(*)::int AS device_count,
      COUNT(*) FILTER (WHERE d.risk_score >= ${HIGH_RISK_MIN})::int AS high_risk_count,
      COALESCE(SUM(d.estimated_refresh_cost), 0)::float AS estimated_refresh_cost
    FROM effective_devices d
    LEFT JOIN sites s ON s.site_code = d.site_code
    WHERE ${conditions.join(" AND ")}
    GROUP BY d.site_code
    ORDER BY risk_score_avg DESC
  `;

  const result = await pool.query<SiteAggregateRow>(query, values);
  return result.rows;
}

export async function getStateMapFeatures(
  pool: Pool,
  includeExceptions: boolean,
  filters: MapFilters,
  temporal: TemporalQueryOptions = {},
): Promise<StateMapFeature[]> {
  const values: QueryValue[] = buildTemporalQueryValues(includeExceptions, withPlanningTemporal(filters, temporal));
  const conditions = ["state_code IS NOT NULL"];

  if (filters.deviceType) {
    values.push(filters.deviceType);
    conditions.push(`device_type = $${values.length}`);
  }

  if (filters.affiliate) {
    values.push(filters.affiliate);
    conditions.push(`affiliate = $${values.length}`);
  }

  if (filters.state) {
    values.push(filters.state);
    conditions.push(`state_code = $${values.length}`);
  }

  const query = `
    ${baseEffectiveDevicesCte()}
    SELECT
      state_code,
      AVG(risk_score)::float AS risk_score_avg,
      COALESCE(SUM(estimated_refresh_cost), 0)::float AS estimated_refresh_cost,
      COUNT(*)::int AS device_count,
      COUNT(*) FILTER (WHERE risk_score >= ${HIGH_RISK_MIN})::int AS high_risk_count
    FROM effective_devices
    WHERE ${conditions.join(" AND ")}
    GROUP BY state_code
  `;

  const result = await pool.query<StateAggregateRow>(query, values);
  const metricsByState = new Map(result.rows.map((row) => [row.state_code, row]));

  return getStateBoundaries()
    .map((state): StateMapFeature => {
      const metrics = metricsByState.get(state.stateCode);
      return {
        stateCode: state.stateCode,
        stateFips: state.stateFips,
        stateName: state.stateName,
        geometry: state.geometry,
        riskScoreAvg: metrics?.risk_score_avg ?? null,
        estimatedRefreshCost: metrics?.estimated_refresh_cost ?? 0,
        deviceCount: metrics?.device_count ?? 0,
        highRiskCount: metrics?.high_risk_count ?? 0,
      };
    })
    .sort((a, b) => a.stateCode.localeCompare(b.stateCode));
}

export async function getCountyMapFeatures(
  pool: Pool,
  includeExceptions: boolean,
  stateCode: string,
  filters: Pick<QueryFilters, "affiliate" | "deviceType" | "includeOutOfScope" | "includeDecomSites">,
  temporal: TemporalQueryOptions = {},
): Promise<CountyMapFeature[]> {
  const counties = getCountyBoundariesForState(stateCode);
  if (!counties.length) {
    return [];
  }

  const sites = await getSiteAggregates(pool, includeExceptions, {
    ...filters,
    state: stateCode,
  }, temporal);

  const sitesByCounty = new Map<string, SiteAggregateRow[]>();
  for (const site of sites) {
    const countyFips = getCountyFipsForPoint(stateCode, site.lat, site.lon);
    if (!countyFips) {
      continue;
    }

    const existing = sitesByCounty.get(countyFips) ?? [];
    existing.push(site);
    sitesByCounty.set(countyFips, existing);
  }

  return counties
    .map((county): CountyMapFeature => {
      const siteRows = sitesByCounty.get(county.countyFips) ?? [];
      const riskScoreAvg = computeWeightedAverageRisk(
        siteRows.map((row) => ({
          riskScoreAvg: row.risk_score_avg,
          deviceCount: row.device_count,
        })),
      );

      const deviceCount = siteRows.reduce((sum, row) => sum + row.device_count, 0);
      const highRiskCount = siteRows.reduce((sum, row) => sum + row.high_risk_count, 0);
      const estimatedRefreshCost = siteRows.reduce((sum, row) => sum + row.estimated_refresh_cost, 0);

      return {
        stateCode: county.stateCode,
        stateFips: county.stateFips,
        countyFips: county.countyFips,
        countyName: county.countyName,
        geometry: county.geometry,
        riskScoreAvg,
        deviceCount,
        highRiskCount,
        estimatedRefreshCost,
      };
    })
    .sort((a, b) => a.countyFips.localeCompare(b.countyFips));
}

export async function getCountySites(
  pool: Pool,
  includeExceptions: boolean,
  stateCode: string,
  countyFips: string,
  filters: Pick<QueryFilters, "affiliate" | "deviceType" | "includeOutOfScope" | "includeDecomSites">,
  temporal: TemporalQueryOptions = {},
): Promise<CountySitesResponse | null> {
  const county = getCountyBoundariesForState(stateCode).find((item) => item.countyFips === countyFips);
  if (!county) {
    return null;
  }

  const sites = await getSiteAggregates(pool, includeExceptions, {
    ...filters,
    state: stateCode,
  }, temporal);

  const siteMarkers = sites
    .filter((site) => getCountyFipsForPoint(stateCode, site.lat, site.lon) === countyFips)
    .map(toSiteMarker)
    .sort((a, b) => b.riskScoreAvg - a.riskScoreAvg || b.deviceCount - a.deviceCount);

  const countyRiskScoreAvg = computeWeightedAverageRisk(
    siteMarkers.map((site) => ({
      riskScoreAvg: site.riskScoreAvg,
      deviceCount: site.deviceCount,
    })),
  );
  const countyDeviceCount = siteMarkers.reduce((sum, site) => sum + site.deviceCount, 0);
  const countyHighRiskCount = siteMarkers.reduce((sum, site) => sum + site.highRiskCount, 0);
  const countyEstimatedRefreshCost = siteMarkers.reduce((sum, site) => sum + site.estimatedRefreshCost, 0);

  return {
    stateCode,
    countyFips,
    countyName: county.countyName,
    countyGeometry: county.geometry,
    countyRiskScoreAvg,
    countyDeviceCount,
    countyHighRiskCount,
    countyEstimatedRefreshCost,
    sites: siteMarkers,
  };
}

export async function getSiteSummary(
  pool: Pool,
  includeExceptions: boolean,
  stateCode: string,
  countyFips: string,
  siteCode: string,
  filters: Pick<QueryFilters, "affiliate" | "deviceType" | "state" | "county" | "includeOutOfScope" | "includeDecomSites">,
  temporal: TemporalQueryOptions = {},
): Promise<SiteSummaryResponse | null> {
  const county = getCountyBoundariesForState(stateCode).find((item) => item.countyFips === countyFips);
  if (!county) {
    return null;
  }

  const values: QueryValue[] = buildTemporalQueryValues(includeExceptions, withPlanningTemporal(filters, temporal));
  const conditions: string[] = [];
  values.push(siteCode);
  conditions.push(`d.site_code = $${values.length}`);
  values.push(stateCode);
  conditions.push(`d.state_code = $${values.length}`);

  if (filters.deviceType) {
    values.push(filters.deviceType);
    conditions.push(`d.device_type = $${values.length}`);
  }

  if (filters.affiliate) {
    values.push(filters.affiliate);
    conditions.push(`d.affiliate = $${values.length}`);
  }

  const query = `
    ${baseEffectiveDevicesCte()}
    SELECT
      d.site_code,
      MAX(s.site_name) AS site_name,
      AVG(d.lat)::float AS lat,
      AVG(d.lon)::float AS lon,
      AVG(d.risk_score)::float AS risk_score_avg,
      COUNT(*)::int AS device_count,
      COUNT(*) FILTER (WHERE d.risk_score >= ${HIGH_RISK_MIN})::int AS high_risk_count,
      COALESCE(SUM(d.estimated_refresh_cost), 0)::float AS estimated_refresh_cost
    FROM effective_devices d
    LEFT JOIN sites s ON s.site_code = d.site_code
    WHERE ${conditions.join(" AND ")}
    GROUP BY d.site_code
  `;

  const result = await pool.query<SiteSummaryRow>(query, values);
  const row = result.rows[0];
  if (!row) {
    return null;
  }

  const resolvedCountyFips = getCountyFipsForPoint(stateCode, row.lat, row.lon);
  if (resolvedCountyFips !== countyFips) {
    return null;
  }

  return {
    stateCode,
    countyFips,
    countyName: county.countyName,
    siteCode: row.site_code,
    siteName: row.site_name,
    riskScoreAvg: row.risk_score_avg,
    deviceCount: row.device_count,
    highRiskCount: row.high_risk_count,
    estimatedRefreshCost: row.estimated_refresh_cost,
  };
}

export async function getSiteList(
  pool: Pool,
  includeExceptions: boolean,
  filters: Pick<QueryFilters, "affiliate" | "deviceType" | "state" | "county" | "includeOutOfScope" | "includeDecomSites">,
  page: number,
  pageSize: number,
  highRiskOnly: boolean,
  temporal: TemporalQueryOptions = {},
): Promise<ApiListResult<SiteListItem>> {
  const values: QueryValue[] = buildTemporalQueryValues(includeExceptions, withPlanningTemporal(filters, temporal));
  const conditions = ["d.site_code IS NOT NULL"];

  if (filters.deviceType) {
    values.push(filters.deviceType);
    conditions.push(`d.device_type = $${values.length}`);
  }

  if (filters.affiliate) {
    values.push(filters.affiliate);
    conditions.push(`d.affiliate = $${values.length}`);
  }

  if (filters.state) {
    values.push(filters.state);
    conditions.push(`d.state_code = $${values.length}`);
  }

  if (filters.county) {
    values.push(filters.county);
    conditions.push(`d.county = $${values.length}`);
  }

  const whereSql = `WHERE ${conditions.join(" AND ")}`;
  const highRiskOnlySql = highRiskOnly ? `HAVING COUNT(*) FILTER (WHERE d.risk_score >= ${HIGH_RISK_MIN}) > 0` : "";

  const offset = (page - 1) * pageSize;
  values.push(pageSize);
  const limitIndex = values.length;
  values.push(offset);
  const offsetIndex = values.length;

  const listQuery = `
    ${baseEffectiveDevicesCte()}
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
    ${whereSql}
    GROUP BY d.site_code
    ${highRiskOnlySql}
    ORDER BY high_risk_count DESC, risk_score_avg DESC, estimated_refresh_cost DESC, d.site_code ASC
    LIMIT $${limitIndex}
    OFFSET $${offsetIndex}
  `;

  const countValues = values.slice(0, values.length - 2);
  const countQuery = `
    ${baseEffectiveDevicesCte()}
    SELECT COUNT(*)::int AS total
    FROM (
      SELECT d.site_code
      FROM effective_devices d
      ${whereSql}
      GROUP BY d.site_code
      ${highRiskOnlySql}
    ) grouped_sites
  `;

  const [listResult, countResult] = await Promise.all([
    pool.query<{
      site_code: string;
      site_name: string | null;
      state_code: string | null;
      county: string | null;
      risk_score_avg: number;
      device_count: number;
      high_risk_count: number;
      estimated_refresh_cost: number;
    }>(listQuery, values),
    pool.query<{ total: number }>(countQuery, countValues),
  ]);

  return {
    data: listResult.rows.map((row) => ({
      siteCode: row.site_code,
      siteName: row.site_name,
      stateCode: row.state_code,
      county: row.county,
      riskScoreAvg: row.risk_score_avg,
      deviceCount: row.device_count,
      highRiskCount: row.high_risk_count,
      estimatedRefreshCost: row.estimated_refresh_cost,
    })),
    total: countResult.rows[0]?.total ?? 0,
    page,
    pageSize,
  };
}
