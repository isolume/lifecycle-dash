import { WINDOW_MONTHS_DEFAULT } from "../constants";

export interface QueryFilters {
  includeOutOfScope?: boolean;
  includeDecomSites?: boolean;
  deviceType?: string;
  state?: string;
  affiliate?: string;
  county?: string;
  siteCode?: string;
  siteCodes?: string[];
  lifecycleStatus?: string;
  search?: string;
  riskMin?: number;
  riskMax?: number;
}

export interface TemporalQueryOptions {
  asOfDate?: string;
  windowMonths?: number;
  includeOutOfScope?: boolean;
  includeDecomSites?: boolean;
}

export type QueryValue = string | number | boolean | string[] | null;

function normalizeWindowMonths(windowMonths?: number): number {
  const parsed = Number(windowMonths);
  if (!Number.isFinite(parsed)) {
    return WINDOW_MONTHS_DEFAULT;
  }

  return Math.max(1, Math.min(36, Math.round(parsed)));
}

export function buildTemporalQueryValues(
  includeExceptions: boolean,
  temporal: TemporalQueryOptions = {},
): QueryValue[] {
  return [
    includeExceptions,
    temporal.asOfDate ?? null,
    normalizeWindowMonths(temporal.windowMonths),
    temporal.includeOutOfScope ?? false,
    temporal.includeDecomSites ?? false,
  ];
}

export function baseEffectiveDevicesCte(): string {
  return `
    WITH input_params AS (
      SELECT
        COALESCE($2::date, CURRENT_DATE) AS as_of_date,
        LEAST(GREATEST(COALESCE($3::int, ${WINDOW_MONTHS_DEFAULT}), 1), 36) AS window_months,
        COALESCE($4::boolean, FALSE) AS include_out_of_scope,
        COALESCE($5::boolean, FALSE) AS include_decom_sites
    ),
    effective_devices AS (
      SELECT
        d.device_id,
        d.device_name,
        d.serial_number,
        d.ingest_run_id,
        d.source_system,
        d.device_type,
        d.device_type_raw,
        d.model,
        d.site_code,
        d.state_code,
        d.affiliate,
        d.county,
        d.lat,
        d.lon,
        d.geom,
        d.raw_status,
        d.eos_date,
        d.eol_date,
        lifecycle.lifecycle_status_new AS lifecycle_status,
        CASE
          WHEN risk.risk_score_new >= 80 THEN 'Critical'
          WHEN risk.risk_score_new >= 65 THEN 'High'
          WHEN risk.risk_score_new >= 45 THEN 'Medium'
          ELSE 'Low'
        END AS risk_bucket,
        risk.risk_score_new AS risk_score,
        d.material_cost,
        d.estimated_labor_cost,
        d.estimated_total_cost,
        COALESCE(d.estimated_total_cost, d.estimated_refresh_cost) AS estimated_refresh_cost,
        d.support_level,
        d.support_coverage,
        CASE
          WHEN lifecycle.lifecycle_status_new = 'Past EoL' THEN 'High'
          WHEN lifecycle.lifecycle_status_new IN ('Past EoS', 'EoL <= 6mo') THEN 'Medium'
          ELSE 'Low'
        END AS security_risk,
        d.in_scope,
        d.is_decom_site,
        d.last_refreshed_at
      FROM devices d
      CROSS JOIN input_params p
      CROSS JOIN LATERAL (
        SELECT
          CASE
            WHEN d.eol_date IS NOT NULL AND d.eol_date < p.as_of_date THEN 'Past EoL'
            WHEN d.eos_date IS NOT NULL AND d.eos_date < p.as_of_date THEN 'Past EoS'
            WHEN d.eol_date IS NOT NULL
              AND d.eol_date <= (p.as_of_date + make_interval(months => p.window_months))::date THEN 'EoL <= 6mo'
            WHEN d.eos_date IS NOT NULL
              AND d.eos_date <= (p.as_of_date + make_interval(months => p.window_months))::date THEN 'EoS <= 6mo'
            ELSE 'Supported'
          END AS lifecycle_status_new
      ) lifecycle
      CROSS JOIN LATERAL (
        SELECT
          GREATEST(
            0,
            LEAST(
              100,
              ROUND(
                COALESCE(d.risk_score, 0)::numeric
                - CASE d.lifecycle_status
                    WHEN 'Past EoL' THEN 70
                    WHEN 'Past EoS' THEN 55
                    WHEN 'EoL <= 6mo' THEN 45
                    WHEN 'EoS <= 6mo' THEN 35
                    ELSE 10
                  END
                + CASE lifecycle.lifecycle_status_new
                    WHEN 'Past EoL' THEN 70
                    WHEN 'Past EoS' THEN 55
                    WHEN 'EoL <= 6mo' THEN 45
                    WHEN 'EoS <= 6mo' THEN 35
                    ELSE 10
                  END
              )
            )
          )::int AS risk_score_new
      ) risk
      WHERE (p.include_out_of_scope OR d.in_scope IS TRUE)
        AND (p.include_decom_sites OR d.is_decom_site = FALSE)
        AND (
          $1::boolean = TRUE
          OR NOT EXISTS (
           SELECT 1
           FROM device_exceptions e
            WHERE (
                (e.device_id IS NOT NULL AND e.device_id = d.device_id)
                OR (e.device_id IS NULL AND e.device_name = d.device_name)
              )
              AND e.is_active = TRUE
              AND e.effective_date <= p.as_of_date
              AND (e.expires_date IS NULL OR e.expires_date >= p.as_of_date)
          )
        )
    )
  `;
}

export function applyFilters(
  filters: QueryFilters,
  values: QueryValue[],
): string {
  const conditions: string[] = [];

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

  if (filters.siteCodes && filters.siteCodes.length > 0) {
    values.push(filters.siteCodes);
    conditions.push(`site_code = ANY($${values.length})`);
  } else if (filters.siteCode) {
    values.push(filters.siteCode);
    conditions.push(`site_code = $${values.length}`);
  }

  if (filters.lifecycleStatus) {
    values.push(filters.lifecycleStatus);
    conditions.push(`lifecycle_status = $${values.length}`);
  }

  if (filters.search) {
    values.push(`%${filters.search}%`);
    conditions.push(`(device_name ILIKE $${values.length} OR model ILIKE $${values.length} OR COALESCE(serial_number, '') ILIKE $${values.length})`);
  }

  if (typeof filters.riskMin === "number") {
    values.push(filters.riskMin);
    conditions.push(`risk_score >= $${values.length}`);
  }

  if (typeof filters.riskMax === "number") {
    values.push(filters.riskMax);
    conditions.push(`risk_score <= $${values.length}`);
  }

  if (!conditions.length) {
    return "";
  }

  return `WHERE ${conditions.join(" AND ")}`;
}

export function milesToMeters(radiusMi: number): number {
  return radiusMi * 1609.344;
}
