CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ingest_runs (
  id BIGSERIAL PRIMARY KEY,
  source_file TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed')),
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sites (
  site_code TEXT PRIMARY KEY,
  site_name TEXT,
  street_address_1 TEXT,
  street_address_2 TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  owner_affiliate TEXT,
  county TEXT,
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  geom GEOGRAPHY(Point, 4326),
  is_decom BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS models (
  model TEXT PRIMARY KEY,
  model_parent TEXT,
  eos_date DATE,
  eol_date DATE,
  category TEXT,
  reference_url TEXT,
  in_scope BOOLEAN,
  replacement_model TEXT,
  dna_required BOOLEAN,
  dna_part_number TEXT,
  staging_required BOOLEAN,
  de_hours NUMERIC,
  se_hours NUMERIC,
  fot_hours NUMERIC,
  pm_hours NUMERIC,
  de_cost NUMERIC,
  se_cost NUMERIC,
  fot_cost NUMERIC,
  labor_cost NUMERIC,
  device_cost NUMERIC,
  dna_cost NUMERIC,
  staging_cost NUMERIC,
  tax_oh NUMERIC,
  material_cost NUMERIC,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pricing (
  id BIGSERIAL PRIMARY KEY,
  parent_product TEXT,
  product TEXT,
  description TEXT,
  pricing NUMERIC,
  is_device BOOLEAN,
  notes TEXT,
  labor_de NUMERIC,
  labor_se NUMERIC,
  labor_fo NUMERIC,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS device_candidates (
  id BIGSERIAL PRIMARY KEY,
  ingest_run_id BIGINT REFERENCES ingest_runs(id) ON DELETE CASCADE,
  source_system TEXT NOT NULL CHECK (source_system IN ('NA', 'PrimeAP', 'PrimeWLC', 'CatCtr')),
  device_name TEXT NOT NULL,
  device_ip TEXT,
  model_raw TEXT,
  model_normalized TEXT,
  device_type_raw TEXT,
  device_type_normalized TEXT,
  status_raw TEXT,
  is_active BOOLEAN NOT NULL,
  state_code_derived TEXT,
  site_code_derived TEXT,
  controller_ip TEXT,
  controller_name TEXT,
  serial_number TEXT,
  extra JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS devices (
  device_name TEXT PRIMARY KEY,
  ingest_run_id BIGINT REFERENCES ingest_runs(id) ON DELETE SET NULL,
  source_system TEXT NOT NULL,
  device_type TEXT NOT NULL,
  device_type_raw TEXT,
  model TEXT NOT NULL,
  site_code TEXT REFERENCES sites(site_code),
  state_code TEXT,
  affiliate TEXT,
  county TEXT,
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  geom GEOGRAPHY(Point, 4326),
  raw_status TEXT,
  eos_date DATE,
  eol_date DATE,
  lifecycle_status TEXT NOT NULL,
  risk_bucket TEXT NOT NULL,
  risk_score INTEGER NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
  material_cost NUMERIC,
  estimated_refresh_cost NUMERIC,
  in_scope BOOLEAN,
  is_decom_site BOOLEAN NOT NULL DEFAULT FALSE,
  last_refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS device_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_name TEXT NOT NULL REFERENCES devices(device_name) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  project_tag TEXT,
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expires_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_sites_updated_at ON sites;
CREATE TRIGGER set_sites_updated_at
BEFORE UPDATE ON sites
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS set_models_updated_at ON models;
CREATE TRIGGER set_models_updated_at
BEFORE UPDATE ON models
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS set_pricing_updated_at ON pricing;
CREATE TRIGGER set_pricing_updated_at
BEFORE UPDATE ON pricing
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS set_device_exceptions_updated_at ON device_exceptions;
CREATE TRIGGER set_device_exceptions_updated_at
BEFORE UPDATE ON device_exceptions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE INDEX IF NOT EXISTS idx_sites_geom ON sites USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_devices_site_code ON devices(site_code);
CREATE INDEX IF NOT EXISTS idx_devices_device_type ON devices(device_type);
CREATE INDEX IF NOT EXISTS idx_devices_lifecycle_status ON devices(lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_devices_risk_score_desc ON devices(risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_devices_geo_scope ON devices(state_code, affiliate, county);
CREATE INDEX IF NOT EXISTS idx_device_exceptions_lookup ON device_exceptions(device_name, effective_date, expires_date);

CREATE OR REPLACE VIEW v_device_effective AS
SELECT d.*
FROM devices d
WHERE NOT EXISTS (
  SELECT 1
  FROM device_exceptions e
  WHERE e.device_name = d.device_name
    AND e.is_active = TRUE
    AND e.effective_date <= CURRENT_DATE
    AND (e.expires_date IS NULL OR e.expires_date >= CURRENT_DATE)
);
