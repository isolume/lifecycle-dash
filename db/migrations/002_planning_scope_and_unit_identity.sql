ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS device_id TEXT,
  ADD COLUMN IF NOT EXISTS serial_number TEXT,
  ADD COLUMN IF NOT EXISTS support_level TEXT,
  ADD COLUMN IF NOT EXISTS support_coverage TEXT,
  ADD COLUMN IF NOT EXISTS security_risk TEXT,
  ADD COLUMN IF NOT EXISTS estimated_labor_cost NUMERIC,
  ADD COLUMN IF NOT EXISTS estimated_total_cost NUMERIC;

UPDATE devices
SET
  device_id = COALESCE(device_id, device_name || '::NO-SERIAL'),
  support_coverage = COALESCE(support_coverage, 'Unknown'),
  security_risk = COALESCE(security_risk, 'Low'),
  estimated_total_cost = COALESCE(estimated_total_cost, estimated_refresh_cost, material_cost),
  estimated_labor_cost = COALESCE(estimated_labor_cost, 0)
WHERE
  device_id IS NULL
  OR support_coverage IS NULL
  OR security_risk IS NULL
  OR estimated_total_cost IS NULL
  OR estimated_labor_cost IS NULL;

ALTER TABLE device_exceptions
  DROP CONSTRAINT IF EXISTS device_exceptions_device_name_fkey;

ALTER TABLE device_exceptions
  ADD COLUMN IF NOT EXISTS device_id TEXT;

ALTER TABLE devices
  DROP CONSTRAINT IF EXISTS devices_pkey;

ALTER TABLE devices
  ALTER COLUMN device_id SET NOT NULL;

ALTER TABLE devices
  ADD CONSTRAINT devices_pkey PRIMARY KEY (device_id);

ALTER TABLE devices
  ADD CONSTRAINT devices_support_coverage_chk
    CHECK (support_coverage IN ('Supported', 'Unsupported', 'Unknown'));

ALTER TABLE devices
  ADD CONSTRAINT devices_security_risk_chk
    CHECK (security_risk IN ('High', 'Medium', 'Low'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_name_serial_unique
  ON devices (device_name, COALESCE(serial_number, ''));

CREATE INDEX IF NOT EXISTS idx_devices_support_coverage
  ON devices (support_coverage);

CREATE INDEX IF NOT EXISTS idx_devices_security_risk
  ON devices (security_risk);

ALTER TABLE device_candidates
  ADD COLUMN IF NOT EXISTS serial_number TEXT,
  ADD COLUMN IF NOT EXISTS device_unit_key TEXT;

WITH unique_devices AS (
  SELECT device_name, MIN(device_id) AS device_id
  FROM devices
  GROUP BY device_name
  HAVING COUNT(*) = 1
)
UPDATE device_exceptions e
SET device_id = u.device_id
FROM unique_devices u
WHERE e.device_id IS NULL
  AND e.device_name = u.device_name;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'device_exceptions_device_id_fkey'
  ) THEN
    ALTER TABLE device_exceptions
      ADD CONSTRAINT device_exceptions_device_id_fkey
      FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_device_exceptions_device_id
  ON device_exceptions (device_id, effective_date, expires_date, is_active);

CREATE OR REPLACE VIEW v_device_effective AS
SELECT d.*
FROM devices d
WHERE NOT EXISTS (
  SELECT 1
  FROM device_exceptions e
  WHERE (
      (e.device_id IS NOT NULL AND e.device_id = d.device_id)
      OR (e.device_id IS NULL AND e.device_name = d.device_name)
    )
    AND e.is_active = TRUE
    AND e.effective_date <= CURRENT_DATE
    AND (e.expires_date IS NULL OR e.expires_date >= CURRENT_DATE)
);
