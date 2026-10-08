import { Pool } from "pg";
import { ApiListResult } from "../types";
import {
  applyFilters,
  baseEffectiveDevicesCte,
  buildTemporalQueryValues,
  QueryFilters,
  QueryValue,
  TemporalQueryOptions,
} from "./common";

export interface DeviceListItem {
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

function withPlanningTemporal(filters: QueryFilters, temporal: TemporalQueryOptions): TemporalQueryOptions {
  return {
    ...temporal,
    includeOutOfScope: filters.includeOutOfScope ?? temporal.includeOutOfScope,
    includeDecomSites: filters.includeDecomSites ?? temporal.includeDecomSites,
  };
}

export async function getDevices(
  pool: Pool,
  includeExceptions: boolean,
  filters: QueryFilters,
  page: number,
  pageSize: number,
  temporal: TemporalQueryOptions = {},
): Promise<ApiListResult<DeviceListItem>> {
  const values: QueryValue[] = buildTemporalQueryValues(includeExceptions, withPlanningTemporal(filters, temporal));
  const whereSql = applyFilters(filters, values);

  const offset = (page - 1) * pageSize;
  values.push(pageSize);
  const limitIndex = values.length;
  values.push(offset);
  const offsetIndex = values.length;

  const listQuery = `
    ${baseEffectiveDevicesCte()}
    SELECT
      device_id,
      device_name,
      serial_number,
      source_system,
      device_type,
      model,
      site_code,
      state_code,
      affiliate,
      county,
      lifecycle_status,
      risk_bucket,
      risk_score,
      support_coverage,
      security_risk,
      COALESCE(estimated_labor_cost, 0)::float AS estimated_labor_cost,
      COALESCE(estimated_total_cost, estimated_refresh_cost, 0)::float AS estimated_total_cost,
      COALESCE(estimated_refresh_cost, 0)::float AS estimated_refresh_cost,
      EXISTS (
        SELECT 1
        FROM device_exceptions e
        WHERE (
            (e.device_id IS NOT NULL AND e.device_id = effective_devices.device_id)
            OR (e.device_id IS NULL AND e.device_name = effective_devices.device_name)
          )
          AND e.is_active = TRUE
          AND e.effective_date <= (SELECT as_of_date FROM input_params)
          AND (
            e.expires_date IS NULL
            OR e.expires_date >= (SELECT as_of_date FROM input_params)
          )
      ) AS has_active_exception
    FROM effective_devices
    ${whereSql}
    ORDER BY risk_score DESC, estimated_refresh_cost DESC, device_name ASC
    LIMIT $${limitIndex}
    OFFSET $${offsetIndex}
  `;

  const countValues = values.slice(0, values.length - 2);
  const countQuery = `
    ${baseEffectiveDevicesCte()}
    SELECT COUNT(*)::int AS total
    FROM effective_devices
    ${whereSql}
  `;

  const [listResult, countResult] = await Promise.all([
    pool.query<{
      device_id: string;
      device_name: string;
      serial_number: string | null;
      source_system: string;
      device_type: string;
      model: string;
      site_code: string | null;
      state_code: string | null;
      affiliate: string | null;
      county: string | null;
      lifecycle_status: string;
      risk_bucket: string;
      risk_score: number;
      support_coverage: "Supported" | "Unsupported" | "Unknown";
      security_risk: "High" | "Medium" | "Low";
      estimated_labor_cost: number;
      estimated_total_cost: number;
      estimated_refresh_cost: number;
      has_active_exception: boolean;
    }>(listQuery, values),
    pool.query<{ total: number }>(countQuery, countValues),
  ]);

  return {
    data: listResult.rows.map((row) => ({
      deviceId: row.device_id,
      deviceName: row.device_name,
      serialNumber: row.serial_number,
      sourceSystem: row.source_system,
      deviceType: row.device_type,
      model: row.model,
      siteCode: row.site_code,
      stateCode: row.state_code,
      affiliate: row.affiliate,
      county: row.county,
      lifecycleStatus: row.lifecycle_status,
      riskBucket: row.risk_bucket,
      riskScore: row.risk_score,
      supportCoverage: row.support_coverage,
      securityRisk: row.security_risk,
      estimatedLaborCost: row.estimated_labor_cost,
      estimatedTotalCost: row.estimated_total_cost,
      estimatedRefreshCost: row.estimated_refresh_cost,
      hasActiveException: row.has_active_exception,
    })),
    total: countResult.rows[0]?.total ?? 0,
    page,
    pageSize,
  };
}
