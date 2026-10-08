export type CatalogColumnType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "datetime"
  | "json";

export interface ChatTableDefinition {
  description: string;
  columns: Record<string, CatalogColumnType>;
  defaultColumns: string[];
}

const DEVICE_COLUMNS: Record<string, CatalogColumnType> = {
  device_name: "string",
  ingest_run_id: "number",
  source_system: "string",
  device_type: "string",
  device_type_raw: "string",
  model: "string",
  site_code: "string",
  state_code: "string",
  affiliate: "string",
  county: "string",
  lat: "number",
  lon: "number",
  raw_status: "string",
  eos_date: "date",
  eol_date: "date",
  lifecycle_status: "string",
  risk_bucket: "string",
  risk_score: "number",
  material_cost: "number",
  estimated_refresh_cost: "number",
  in_scope: "boolean",
  is_decom_site: "boolean",
  last_refreshed_at: "datetime",
};

export const CHAT_TABLE_CATALOG = {
  schema_migrations: {
    description: "Migration history for schema changes.",
    columns: {
      id: "string",
      executed_at: "datetime",
    },
    defaultColumns: ["id", "executed_at"],
  },
  ingest_runs: {
    description: "Workbook ingest run log and stats.",
    columns: {
      id: "number",
      source_file: "string",
      status: "string",
      stats: "json",
      error: "string",
      started_at: "datetime",
      finished_at: "datetime",
    },
    defaultColumns: ["id", "source_file", "status", "started_at", "finished_at"],
  },
  sites: {
    description: "Site inventory and location metadata.",
    columns: {
      site_code: "string",
      site_name: "string",
      street_address_1: "string",
      street_address_2: "string",
      city: "string",
      state: "string",
      zip: "string",
      owner_affiliate: "string",
      county: "string",
      lat: "number",
      lon: "number",
      is_decom: "boolean",
      updated_at: "datetime",
    },
    defaultColumns: ["site_code", "site_name", "state", "county", "owner_affiliate", "lat", "lon"],
  },
  models: {
    description: "Lifecycle and pricing assumptions by model.",
    columns: {
      model: "string",
      model_parent: "string",
      eos_date: "date",
      eol_date: "date",
      category: "string",
      reference_url: "string",
      in_scope: "boolean",
      replacement_model: "string",
      dna_required: "boolean",
      dna_part_number: "string",
      staging_required: "boolean",
      de_hours: "number",
      se_hours: "number",
      fot_hours: "number",
      pm_hours: "number",
      de_cost: "number",
      se_cost: "number",
      fot_cost: "number",
      labor_cost: "number",
      device_cost: "number",
      dna_cost: "number",
      staging_cost: "number",
      tax_oh: "number",
      material_cost: "number",
      updated_at: "datetime",
    },
    defaultColumns: ["model", "category", "eos_date", "eol_date", "in_scope", "material_cost", "updated_at"],
  },
  pricing: {
    description: "Pricing worksheet rows for materials and labor.",
    columns: {
      id: "number",
      parent_product: "string",
      product: "string",
      description: "string",
      pricing: "number",
      is_device: "boolean",
      notes: "string",
      labor_de: "number",
      labor_se: "number",
      labor_fo: "number",
      updated_at: "datetime",
    },
    defaultColumns: ["id", "parent_product", "product", "pricing", "is_device", "updated_at"],
  },
  device_candidates: {
    description: "Raw pre-normalization device candidates from ingest.",
    columns: {
      id: "number",
      ingest_run_id: "number",
      source_system: "string",
      device_name: "string",
      device_ip: "string",
      model_raw: "string",
      model_normalized: "string",
      device_type_raw: "string",
      device_type_normalized: "string",
      status_raw: "string",
      is_active: "boolean",
      state_code_derived: "string",
      site_code_derived: "string",
      controller_ip: "string",
      controller_name: "string",
      serial_number: "string",
      extra: "json",
      created_at: "datetime",
    },
    defaultColumns: [
      "id",
      "ingest_run_id",
      "source_system",
      "device_name",
      "model_normalized",
      "device_type_normalized",
      "is_active",
      "created_at",
    ],
  },
  devices: {
    description: "Final transformed devices (includes exception-eligible devices).",
    columns: DEVICE_COLUMNS,
    defaultColumns: [
      "device_name",
      "source_system",
      "device_type",
      "model",
      "site_code",
      "state_code",
      "county",
      "lifecycle_status",
      "risk_bucket",
      "risk_score",
      "estimated_refresh_cost",
    ],
  },
  device_exceptions: {
    description: "Manual exception records for devices.",
    columns: {
      id: "string",
      device_name: "string",
      reason: "string",
      project_tag: "string",
      effective_date: "date",
      expires_date: "date",
      is_active: "boolean",
      created_at: "datetime",
      updated_at: "datetime",
    },
    defaultColumns: [
      "id",
      "device_name",
      "reason",
      "project_tag",
      "effective_date",
      "expires_date",
      "is_active",
      "updated_at",
    ],
  },
  v_device_effective: {
    description: "Read-only device view excluding active exception records.",
    columns: DEVICE_COLUMNS,
    defaultColumns: [
      "device_name",
      "source_system",
      "device_type",
      "model",
      "site_code",
      "state_code",
      "county",
      "lifecycle_status",
      "risk_bucket",
      "risk_score",
      "estimated_refresh_cost",
    ],
  },
} as const satisfies Record<string, ChatTableDefinition>;

export type ChatTableName = keyof typeof CHAT_TABLE_CATALOG;

export function isChatTableName(value: string): value is ChatTableName {
  return value in CHAT_TABLE_CATALOG;
}

export function hasColumn(table: ChatTableName, column: string): boolean {
  return column in CHAT_TABLE_CATALOG[table].columns;
}

export function getCatalogPromptText(): string {
  return Object.entries(CHAT_TABLE_CATALOG)
    .map(([table, definition]) => {
      const columns = Object.entries(definition.columns)
        .map(([name, type]) => `${name}:${type}`)
        .join(", ");
      return `${table} - ${definition.description}\ncolumns: ${columns}`;
    })
    .join("\n\n");
}
