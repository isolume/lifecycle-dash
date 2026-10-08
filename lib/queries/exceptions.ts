import { Pool } from "pg";
import { ExceptionRecord } from "../types";

export interface CreateExceptionInput {
  deviceId?: string;
  deviceName?: string;
  reason: string;
  projectTag?: string | null;
  effectiveDate?: string;
  expiresDate?: string | null;
  isActive?: boolean;
}

export interface UpdateExceptionInput {
  reason?: string;
  projectTag?: string | null;
  effectiveDate?: string;
  expiresDate?: string | null;
  isActive?: boolean;
}

export class AmbiguousDeviceNameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AmbiguousDeviceNameError";
  }
}

function mapExceptionRecord(row: {
  id: string;
  device_id: string | null;
  device_name: string;
  serial_number: string | null;
  reason: string;
  project_tag: string | null;
  effective_date: string;
  expires_date: string | null;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}): ExceptionRecord {
  return {
    id: row.id,
    deviceId: row.device_id,
    deviceName: row.device_name,
    serialNumber: row.serial_number,
    reason: row.reason,
    projectTag: row.project_tag,
    effectiveDate: row.effective_date,
    expiresDate: row.expires_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isActive: row.is_active,
  };
}

async function resolveExceptionDevice(
  pool: Pool,
  input: Pick<CreateExceptionInput, "deviceId" | "deviceName">,
): Promise<{ deviceId: string; deviceName: string }> {
  if (input.deviceId) {
    const byId = await pool.query<{ device_id: string; device_name: string }>(
      `
        SELECT device_id, device_name
        FROM devices
        WHERE device_id = $1
      `,
      [input.deviceId],
    );

    const row = byId.rows[0];
    if (!row) {
      throw new Error("Selected deviceId was not found.");
    }

    return {
      deviceId: row.device_id,
      deviceName: row.device_name,
    };
  }

  const deviceName = input.deviceName?.trim().toUpperCase();
  if (!deviceName) {
    throw new Error("deviceId or deviceName is required.");
  }

  const byName = await pool.query<{ device_id: string; device_name: string }>(
    `
      SELECT device_id, device_name
      FROM devices
      WHERE device_name = $1
      ORDER BY device_id ASC
      LIMIT 2
    `,
    [deviceName],
  );

  if (byName.rows.length === 0) {
    throw new Error("No device found for deviceName.");
  }

  if (byName.rows.length > 1) {
    throw new AmbiguousDeviceNameError("Device name maps to multiple units. Provide deviceId.");
  }

  return {
    deviceId: byName.rows[0].device_id,
    deviceName: byName.rows[0].device_name,
  };
}

export async function listExceptions(pool: Pool): Promise<ExceptionRecord[]> {
  const result = await pool.query<{
    id: string;
    device_id: string | null;
    device_name: string;
    serial_number: string | null;
    reason: string;
    project_tag: string | null;
    effective_date: string;
    expires_date: string | null;
    created_at: string;
    updated_at: string;
    is_active: boolean;
  }>(`
    SELECT
      e.id,
      e.device_id,
      COALESCE(d.device_name, e.device_name) AS device_name,
      d.serial_number,
      e.reason,
      e.project_tag,
      e.effective_date,
      e.expires_date,
      e.created_at,
      e.updated_at,
      e.is_active
    FROM device_exceptions e
    LEFT JOIN devices d ON d.device_id = e.device_id
    ORDER BY e.is_active DESC, e.created_at DESC
  `);

  return result.rows.map(mapExceptionRecord);
}

export async function createException(pool: Pool, input: CreateExceptionInput): Promise<ExceptionRecord> {
  const resolved = await resolveExceptionDevice(pool, input);

  const result = await pool.query<{
    id: string;
    device_id: string | null;
    device_name: string;
    serial_number: string | null;
    reason: string;
    project_tag: string | null;
    effective_date: string;
    expires_date: string | null;
    created_at: string;
    updated_at: string;
    is_active: boolean;
  }>(
    `
      INSERT INTO device_exceptions (device_id, device_name, reason, project_tag, effective_date, expires_date, is_active)
      VALUES ($1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE), $6::date, COALESCE($7, TRUE))
      RETURNING id, device_id, device_name, NULL::text AS serial_number, reason, project_tag, effective_date, expires_date, created_at, updated_at, is_active
    `,
    [
      resolved.deviceId,
      resolved.deviceName,
      input.reason,
      input.projectTag ?? null,
      input.effectiveDate ?? null,
      input.expiresDate ?? null,
      input.isActive ?? true,
    ],
  );

  const created = result.rows[0];
  const hydrated = await pool.query<{
    id: string;
    device_id: string | null;
    device_name: string;
    serial_number: string | null;
    reason: string;
    project_tag: string | null;
    effective_date: string;
    expires_date: string | null;
    created_at: string;
    updated_at: string;
    is_active: boolean;
  }>(
    `
      SELECT
        e.id,
        e.device_id,
        COALESCE(d.device_name, e.device_name) AS device_name,
        d.serial_number,
        e.reason,
        e.project_tag,
        e.effective_date,
        e.expires_date,
        e.created_at,
        e.updated_at,
        e.is_active
      FROM device_exceptions e
      LEFT JOIN devices d ON d.device_id = e.device_id
      WHERE e.id = $1
    `,
    [created.id],
  );

  return mapExceptionRecord(hydrated.rows[0]);
}

export async function updateException(pool: Pool, id: string, input: UpdateExceptionInput): Promise<ExceptionRecord | null> {
  const existing = await pool.query<{
    id: string;
    device_id: string | null;
    device_name: string;
    reason: string;
    project_tag: string | null;
    effective_date: string;
    expires_date: string | null;
    created_at: string;
    updated_at: string;
    is_active: boolean;
  }>(
    `
      SELECT id, device_id, device_name, reason, project_tag, effective_date, expires_date, created_at, updated_at, is_active
      FROM device_exceptions
      WHERE id = $1
    `,
    [id],
  );

  if (!existing.rows[0]) {
    return null;
  }

  const row = existing.rows[0];
  await pool.query(
    `
      UPDATE device_exceptions
      SET reason = $2,
          project_tag = $3,
          effective_date = $4,
          expires_date = $5,
          is_active = $6
      WHERE id = $1
    `,
    [
      id,
      input.reason ?? row.reason,
      input.projectTag !== undefined ? input.projectTag : row.project_tag,
      input.effectiveDate ?? row.effective_date,
      input.expiresDate !== undefined ? input.expiresDate : row.expires_date,
      input.isActive ?? row.is_active,
    ],
  );

  const hydrated = await pool.query<{
    id: string;
    device_id: string | null;
    device_name: string;
    serial_number: string | null;
    reason: string;
    project_tag: string | null;
    effective_date: string;
    expires_date: string | null;
    created_at: string;
    updated_at: string;
    is_active: boolean;
  }>(
    `
      SELECT
        e.id,
        e.device_id,
        COALESCE(d.device_name, e.device_name) AS device_name,
        d.serial_number,
        e.reason,
        e.project_tag,
        e.effective_date,
        e.expires_date,
        e.created_at,
        e.updated_at,
        e.is_active
      FROM device_exceptions e
      LEFT JOIN devices d ON d.device_id = e.device_id
      WHERE e.id = $1
    `,
    [id],
  );

  return mapExceptionRecord(hydrated.rows[0]);
}

export async function deleteException(pool: Pool, id: string): Promise<boolean> {
  const result = await pool.query(`DELETE FROM device_exceptions WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}
