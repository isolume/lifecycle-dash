import { Pool, QueryResultRow } from "pg";
import {
  CHAT_TABLE_CATALOG,
  ChatTableName,
  CatalogColumnType,
  hasColumn,
  isChatTableName,
} from "./catalog";
import { baseEffectiveDevicesCte } from "../queries/common";

export const CHAT_FILTER_OPERATORS = [
  "eq",
  "neq",
  "in",
  "lt",
  "lte",
  "gt",
  "gte",
  "contains",
  "is_null",
] as const;

export type ChatFilterOperator = (typeof CHAT_FILTER_OPERATORS)[number];

export interface ChatFilter {
  column: string;
  op: ChatFilterOperator;
  value?: unknown;
}

export interface ChatSort {
  column: string;
  direction?: "asc" | "desc";
}

export interface ListRowsRequest {
  table: string;
  columns?: string[];
  filters?: ChatFilter[];
  sort?: ChatSort[];
  limit?: number;
  offset?: number;
}

export interface AggregateMetric {
  fn: "count" | "sum" | "avg" | "min" | "max";
  column?: string;
  as: string;
}

export interface AggregateRequest {
  table: string;
  filters?: ChatFilter[];
  groupBy?: string[];
  metrics: AggregateMetric[];
  limit?: number;
}

export interface QuerySafetyOptions {
  maxRows: number;
  maxFilters: number;
  statementTimeoutMs: number;
  asOfDate?: string;
}

const DEFAULT_QUERY_OPTIONS: QuerySafetyOptions = {
  maxRows: 200,
  maxFilters: 8,
  statementTimeoutMs: 5_000,
};

interface PreparedQuery {
  text: string;
  values: unknown[];
  table: ChatTableName;
}

function shouldUseTemporalDeviceSource(table: ChatTableName, asOfDate?: string): boolean {
  if (!asOfDate) {
    return false;
  }

  return table === "devices" || table === "v_device_effective";
}

export interface ListRowsResult {
  table: ChatTableName;
  rows: QueryResultRow[];
  rowCount: number;
  request: {
    columns: string[];
    filters: ChatFilter[];
    sort: ChatSort[];
    limit: number;
    offset: number;
  };
}

export interface AggregateResult {
  table: ChatTableName;
  rows: QueryResultRow[];
  rowCount: number;
  request: {
    groupBy: string[];
    filters: ChatFilter[];
    metrics: AggregateMetric[];
    limit: number;
  };
}

function ensureFinitePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function ensureFiniteNonNegativeInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function normalizeTable(table: string): ChatTableName {
  if (!isChatTableName(table)) {
    throw new Error(`Unknown table '${table}'.`);
  }

  return table;
}

function normalizeColumn(table: ChatTableName, column: string): string {
  if (!hasColumn(table, column)) {
    throw new Error(`Unknown column '${column}' for table '${table}'.`);
  }

  return column;
}

function isNumericColumn(type: CatalogColumnType): boolean {
  return type === "number";
}

function getColumnType(table: ChatTableName, column: string): CatalogColumnType {
  return (CHAT_TABLE_CATALOG[table].columns as Record<string, CatalogColumnType>)[column];
}

function normalizeFilterValue(op: ChatFilterOperator, value: unknown): unknown {
  if (op === "is_null") {
    if (value === undefined || value === null) {
      return true;
    }

    return Boolean(value);
  }

  if (op === "in") {
    if (!Array.isArray(value) || value.length === 0) {
      throw new Error("Operator 'in' requires a non-empty array value.");
    }

    return value;
  }

  if (value === undefined) {
    throw new Error(`Operator '${op}' requires a value.`);
  }

  return value;
}

function buildWhereClause(
  table: ChatTableName,
  filters: ChatFilter[],
  values: unknown[],
): string {
  if (!filters.length) {
    return "";
  }

  const parts: string[] = [];

  for (const filter of filters) {
    const column = normalizeColumn(table, filter.column);
    const columnType = getColumnType(table, column);
    const op = filter.op;
    const normalizedValue = normalizeFilterValue(op, filter.value);
    const sqlColumn = `t.${quoteIdentifier(column)}`;

    switch (op) {
      case "eq":
        values.push(normalizedValue);
        parts.push(`${sqlColumn} = $${values.length}`);
        break;
      case "neq":
        values.push(normalizedValue);
        parts.push(`${sqlColumn} <> $${values.length}`);
        break;
      case "in":
        values.push(normalizedValue);
        parts.push(`${sqlColumn} = ANY($${values.length})`);
        break;
      case "lt":
      case "lte":
      case "gt":
      case "gte": {
        const supported =
          columnType === "number" ||
          columnType === "date" ||
          columnType === "datetime";
        if (!supported) {
          throw new Error(`Operator '${op}' is not supported for column '${column}'.`);
        }

        const operator = op === "lt" ? "<" : op === "lte" ? "<=" : op === "gt" ? ">" : ">=";
        values.push(normalizedValue);
        parts.push(`${sqlColumn} ${operator} $${values.length}`);
        break;
      }
      case "contains":
        if (columnType !== "string" && columnType !== "json") {
          throw new Error(`Operator 'contains' is not supported for column '${column}'.`);
        }
        values.push(`%${String(normalizedValue)}%`);
        parts.push(`${sqlColumn}::text ILIKE $${values.length}`);
        break;
      case "is_null":
        parts.push(Boolean(normalizedValue) ? `${sqlColumn} IS NULL` : `${sqlColumn} IS NOT NULL`);
        break;
      default:
        throw new Error(`Unsupported operator '${op}'.`);
    }
  }

  return `WHERE ${parts.join(" AND ")}`;
}

function normalizeFilters(
  table: ChatTableName,
  filters: ChatFilter[] | undefined,
  maxFilters: number,
): ChatFilter[] {
  if (!filters || filters.length === 0) {
    return [];
  }

  if (filters.length > maxFilters) {
    throw new Error(`Too many filters. Maximum is ${maxFilters}.`);
  }

  return filters.map((filter) => {
    if (!CHAT_FILTER_OPERATORS.includes(filter.op)) {
      throw new Error(`Unsupported filter operator '${String(filter.op)}'.`);
    }

    normalizeColumn(table, filter.column);
    return filter;
  });
}

function normalizeSort(
  table: ChatTableName,
  sort: ChatSort[] | undefined,
): ChatSort[] {
  if (!sort || sort.length === 0) {
    return [];
  }

  return sort.map((item) => ({
    column: normalizeColumn(table, item.column),
    direction: item.direction === "desc" ? "desc" : "asc",
  }));
}

function normalizeMetric(table: ChatTableName, metric: AggregateMetric): AggregateMetric {
  const fn = metric.fn;
  const alias = metric.as?.trim();

  if (!alias) {
    throw new Error("Aggregate metric alias ('as') is required.");
  }

  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) {
    throw new Error(`Invalid aggregate alias '${alias}'.`);
  }

  if (fn === "count") {
    if (metric.column) {
      normalizeColumn(table, metric.column);
    }
    return {
      fn,
      column: metric.column,
      as: alias,
    };
  }

  if (!metric.column) {
    throw new Error(`Aggregate fn '${fn}' requires a column.`);
  }

  const column = normalizeColumn(table, metric.column);
  if ((fn === "sum" || fn === "avg") && !isNumericColumn(getColumnType(table, column))) {
    throw new Error(`Aggregate fn '${fn}' requires a numeric column. Column '${column}' is not numeric.`);
  }

  return {
    fn,
    column,
    as: alias,
  };
}

export function buildListRowsStatement(
  request: ListRowsRequest,
  options: Partial<QuerySafetyOptions> = {},
): PreparedQuery {
  const opts = { ...DEFAULT_QUERY_OPTIONS, ...options };
  const table = normalizeTable(request.table);
  const defaultColumns = CHAT_TABLE_CATALOG[table].defaultColumns;
  const selectedColumns =
    request.columns && request.columns.length > 0
      ? request.columns.map((column) => normalizeColumn(table, column))
      : defaultColumns;
  const filters = normalizeFilters(table, request.filters, opts.maxFilters);
  const sort = normalizeSort(table, request.sort);
  const limit = Math.min(
    ensureFinitePositiveInt(request.limit, Math.min(50, opts.maxRows)),
    opts.maxRows,
  );
  const offset = ensureFiniteNonNegativeInt(request.offset, 0);

  const useTemporalSource = shouldUseTemporalDeviceSource(table, opts.asOfDate);
  const values: unknown[] = useTemporalSource
    ? [table === "devices", opts.asOfDate ?? null, 6, false, false]
    : [];
  const selectSql = selectedColumns
    .map((column) => `t.${quoteIdentifier(column)} AS ${quoteIdentifier(column)}`)
    .join(", ");
  const whereSql = buildWhereClause(table, filters, values);
  const orderSql = sort.length
    ? `ORDER BY ${sort
        .map(
          (item) =>
            `t.${quoteIdentifier(item.column)} ${item.direction === "desc" ? "DESC" : "ASC"}`,
        )
        .join(", ")}`
    : "";

  values.push(limit);
  const limitIdx = values.length;
  values.push(offset);
  const offsetIdx = values.length;

  const sourceSql = useTemporalSource ? "effective_devices t" : `${quoteIdentifier(table)} t`;
  const withSql = useTemporalSource ? `${baseEffectiveDevicesCte()}\n` : "";

  return {
    table,
    text: `
      ${withSql}SELECT ${selectSql}
      FROM ${sourceSql}
      ${whereSql}
      ${orderSql}
      LIMIT $${limitIdx}
      OFFSET $${offsetIdx}
    `,
    values,
  };
}

export function buildAggregateStatement(
  request: AggregateRequest,
  options: Partial<QuerySafetyOptions> = {},
): PreparedQuery {
  const opts = { ...DEFAULT_QUERY_OPTIONS, ...options };
  const table = normalizeTable(request.table);
  const groupBy = (request.groupBy ?? []).map((column) => normalizeColumn(table, column));
  const filters = normalizeFilters(table, request.filters, opts.maxFilters);
  const metrics = request.metrics?.map((metric) => normalizeMetric(table, metric)) ?? [];
  const limit = Math.min(
    ensureFinitePositiveInt(request.limit, Math.min(50, opts.maxRows)),
    opts.maxRows,
  );

  if (!metrics.length) {
    throw new Error("At least one aggregate metric is required.");
  }

  const useTemporalSource = shouldUseTemporalDeviceSource(table, opts.asOfDate);
  const values: unknown[] = useTemporalSource
    ? [table === "devices", opts.asOfDate ?? null, 6, false, false]
    : [];
  const groupColumns = groupBy.map((column) => `t.${quoteIdentifier(column)}`);
  const metricSql = metrics
    .map((metric) => {
      if (metric.fn === "count") {
        if (metric.column) {
          return `COUNT(t.${quoteIdentifier(metric.column)}) AS ${quoteIdentifier(metric.as)}`;
        }

        return `COUNT(*) AS ${quoteIdentifier(metric.as)}`;
      }

      return `${metric.fn.toUpperCase()}(t.${quoteIdentifier(metric.column ?? "")}) AS ${quoteIdentifier(metric.as)}`;
    })
    .join(", ");

  const selectParts = [...groupColumns, metricSql].join(", ");
  const whereSql = buildWhereClause(table, filters, values);
  const groupSql = groupColumns.length ? `GROUP BY ${groupColumns.join(", ")}` : "";
  const orderSql =
    metrics.length > 0
      ? `ORDER BY ${quoteIdentifier(metrics[0].as)} DESC`
      : "";

  values.push(limit);
  const limitIdx = values.length;

  const sourceSql = useTemporalSource ? "effective_devices t" : `${quoteIdentifier(table)} t`;
  const withSql = useTemporalSource ? `${baseEffectiveDevicesCte()}\n` : "";

  return {
    table,
    text: `
      ${withSql}SELECT ${selectParts}
      FROM ${sourceSql}
      ${whereSql}
      ${groupSql}
      ${orderSql}
      LIMIT $${limitIdx}
    `,
    values,
  };
}

async function executeReadOnly(
  pool: Pool,
  statement: PreparedQuery,
  options: Partial<QuerySafetyOptions> = {},
): Promise<QueryResultRow[]> {
  const opts = { ...DEFAULT_QUERY_OPTIONS, ...options };
  const timeoutMs = Math.max(200, ensureFinitePositiveInt(opts.statementTimeoutMs, 5_000));
  const client = await pool.connect();

  try {
    await client.query("BEGIN READ ONLY");
    await client.query(`SET LOCAL statement_timeout = ${timeoutMs}`);
    const result = await client.query(statement.text, statement.values);
    await client.query("COMMIT");
    return result.rows;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function listRows(
  pool: Pool,
  request: ListRowsRequest,
  options: Partial<QuerySafetyOptions> = {},
): Promise<ListRowsResult> {
  const statement = buildListRowsStatement(request, options);
  const opts = { ...DEFAULT_QUERY_OPTIONS, ...options };
  const rows = await executeReadOnly(pool, statement, opts);
  const resolvedColumns =
    request.columns && request.columns.length > 0
      ? request.columns
      : [...CHAT_TABLE_CATALOG[statement.table].defaultColumns];

  return {
    table: statement.table,
    rows,
    rowCount: rows.length,
    request: {
      columns: resolvedColumns,
      filters: request.filters ?? [],
      sort: request.sort ?? [],
      limit: Math.min(
        ensureFinitePositiveInt(request.limit, Math.min(50, opts.maxRows)),
        opts.maxRows,
      ),
      offset: ensureFiniteNonNegativeInt(request.offset, 0),
    },
  };
}

export async function aggregate(
  pool: Pool,
  request: AggregateRequest,
  options: Partial<QuerySafetyOptions> = {},
): Promise<AggregateResult> {
  const statement = buildAggregateStatement(request, options);
  const opts = { ...DEFAULT_QUERY_OPTIONS, ...options };
  const rows = await executeReadOnly(pool, statement, opts);

  return {
    table: statement.table,
    rows,
    rowCount: rows.length,
    request: {
      groupBy: request.groupBy ?? [],
      filters: request.filters ?? [],
      metrics: request.metrics ?? [],
      limit: Math.min(
        ensureFinitePositiveInt(request.limit, Math.min(50, opts.maxRows)),
        opts.maxRows,
      ),
    },
  };
}
