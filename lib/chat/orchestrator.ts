import OpenAI from "openai";
import { Pool, QueryResultRow } from "pg";
import { z } from "zod";
import { CHAT_TABLE_CATALOG, ChatTableName, getCatalogPromptText, hasColumn, isChatTableName } from "./catalog";
import { CHAT_ANSWER_SYSTEM_PROMPT, CHAT_PLANNER_SYSTEM_PROMPT } from "./prompts";
import {
  aggregate,
  AggregateMetric,
  AggregateRequest,
  ChatFilter,
  CHAT_FILTER_OPERATORS,
  listRows,
  ListRowsRequest,
} from "./query";
import { ChatContext, ChatHistoryItem } from "./request";

const plannerFilterSchema = z.object({
  column: z.string().min(1),
  op: z.enum(CHAT_FILTER_OPERATORS),
  value: z.unknown().optional(),
});

const plannerSortSchema = z.object({
  column: z.string().min(1),
  direction: z.enum(["asc", "desc"]).optional(),
});

const plannerMetricSchema = z.object({
  fn: z.enum(["count", "sum", "avg", "min", "max"]),
  column: z.string().min(1).optional(),
  as: z.string().min(1),
});

const plannerListRowsCallSchema = z.object({
  tool: z.literal("listRows"),
  table: z.string().min(1),
  columns: z.array(z.string().min(1)).optional(),
  filters: z.array(plannerFilterSchema).optional(),
  sort: z.array(plannerSortSchema).optional(),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().nonnegative().optional(),
});

const plannerAggregateCallSchema = z.object({
  tool: z.literal("aggregate"),
  table: z.string().min(1),
  filters: z.array(plannerFilterSchema).optional(),
  groupBy: z.array(z.string().min(1)).optional(),
  metrics: z.array(plannerMetricSchema).min(1),
  limit: z.number().int().positive().optional(),
});

const plannerResponseSchema = z.object({
  calls: z.array(z.union([plannerListRowsCallSchema, plannerAggregateCallSchema])).min(1).max(3),
});

type PlannerCall = z.infer<typeof plannerResponseSchema>["calls"][number];

interface ToolExecution {
  call: PlannerCall;
  table: ChatTableName;
  rowCount: number;
  rows: QueryResultRow[];
  summary: string;
}

export interface ChatOrchestratorInput {
  openai: OpenAI;
  pool: Pool;
  model: string;
  maxToolRows: number;
  message: string;
  history: ChatHistoryItem[];
  context: ChatContext;
}

export interface ChatStreamHandlers {
  onToken: (token: string) => void;
}

const CONTEXT_FILTER_TO_COLUMN: Array<{
  filterKey: keyof ChatContext["filters"];
  column: string;
}> = [
  { filterKey: "state", column: "state_code" },
  { filterKey: "affiliate", column: "affiliate" },
  { filterKey: "county", column: "county" },
  { filterKey: "deviceType", column: "device_type" },
  { filterKey: "siteCode", column: "site_code" },
];

function maybeSwapDevicesTable(
  table: string,
  includeExceptions: boolean | undefined,
): string {
  if (!includeExceptions && table === "devices") {
    return "v_device_effective";
  }

  return table;
}

export function trimToRecentTurns(history: ChatHistoryItem[], turnCount = 3): ChatHistoryItem[] {
  const maxMessages = Math.max(1, turnCount * 2);
  return history.slice(-maxMessages);
}

function mergeContextFilters(
  table: string,
  existing: ChatFilter[] | undefined,
  context: ChatContext["filters"],
): ChatFilter[] {
  if (!isChatTableName(table)) {
    return existing ?? [];
  }

  const merged = [...(existing ?? [])];

  for (const mapping of CONTEXT_FILTER_TO_COLUMN) {
    const value = context[mapping.filterKey];
    if (!value) {
      continue;
    }

    if (!hasColumn(table, mapping.column)) {
      continue;
    }

    const alreadySpecified = merged.some((filter) => filter.column === mapping.column);
    if (!alreadySpecified) {
      merged.push({
        column: mapping.column,
        op: "eq",
        value,
      });
    }
  }

  return merged;
}

export function applyContextFiltersToToolCall(
  call: PlannerCall,
  context: ChatContext["filters"],
): PlannerCall {
  const table = maybeSwapDevicesTable(call.table, context.includeExceptions);

  if (call.tool === "listRows") {
    return {
      ...call,
      table,
      filters: mergeContextFilters(table, call.filters, context),
    };
  }

  return {
    ...call,
    table,
    filters: mergeContextFilters(table, call.filters, context),
  };
}

async function planToolCalls(input: ChatOrchestratorInput): Promise<PlannerCall[]> {
  const planningPayload = {
    question: input.message,
    history: trimToRecentTurns(input.history),
    context: input.context,
    tableCatalog: getCatalogPromptText(),
    outputContract: {
      calls: [
        {
          tool: "listRows or aggregate",
          table: "allowlisted table name",
        },
      ],
    },
  };

  const plannerResponse = await input.openai.chat.completions.create({
    model: input.model,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: CHAT_PLANNER_SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(planningPayload) },
    ],
  });

  const firstRawContent = plannerResponse.choices[0]?.message?.content;
  if (firstRawContent) {
    try {
      const parsedJson = JSON.parse(firstRawContent) as unknown;
      const parsed = plannerResponseSchema.parse(parsedJson);
      return parsed.calls;
    } catch {
      // continue to repair attempt
    }
  }

  const repairResponse = await input.openai.chat.completions.create({
    model: input.model,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `${CHAT_PLANNER_SYSTEM_PROMPT}

Return only JSON matching:
{
  "calls": [
    {
      "tool": "listRows" | "aggregate",
      "table": "<allowlisted table>",
      "...": "tool fields"
    }
  ]
}

The array must contain 1 to 3 calls.`,
      },
      { role: "user", content: JSON.stringify(planningPayload) },
      {
        role: "assistant",
        content:
          firstRawContent ??
          "{\"calls\":[]}",
      },
      {
        role: "user",
        content:
          "The previous output was invalid or empty. Fix it and return valid JSON with at least one tool call.",
      },
    ],
  });

  const secondRawContent = repairResponse.choices[0]?.message?.content;
  if (!secondRawContent) {
    return [];
  }

  try {
    const parsedJson = JSON.parse(secondRawContent) as unknown;
    const parsed = plannerResponseSchema.parse(parsedJson);
    return parsed.calls;
  } catch {
    return [];
  }
}

async function executeToolCall(
  pool: Pool,
  call: PlannerCall,
  maxRows: number,
  asOfDate?: string,
): Promise<ToolExecution> {
  if (!isChatTableName(call.table)) {
    throw new Error(`Unknown table '${call.table}'.`);
  }

  if (call.tool === "listRows") {
    const request: ListRowsRequest = {
      table: call.table,
      columns: call.columns,
      filters: call.filters,
      sort: call.sort,
      limit: call.limit,
      offset: call.offset,
    };
    const result = await listRows(pool, request, { maxRows, asOfDate });
    const summary = `columns=${result.request.columns.join(",") || "default"}, filters=${result.request.filters.length}, limit=${result.request.limit}, offset=${result.request.offset}`;

    return {
      call,
      table: result.table,
      rowCount: result.rowCount,
      rows: result.rows,
      summary,
    };
  }

  const request: AggregateRequest = {
    table: call.table,
    filters: call.filters,
    groupBy: call.groupBy,
    metrics: call.metrics as AggregateMetric[],
    limit: call.limit,
  };
  const result = await aggregate(pool, request, { maxRows, asOfDate });
  const summary = `groupBy=${result.request.groupBy.join(",") || "none"}, metrics=${result.request.metrics.map((m) => `${m.fn}:${m.as}`).join(",")}, filters=${result.request.filters.length}, limit=${result.request.limit}`;

  return {
    call,
    table: result.table,
    rowCount: result.rowCount,
    rows: result.rows,
    summary,
  };
}

function tokenizeQuestion(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9_]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function scoreTableForQuestion(table: ChatTableName, tokens: string[]): number {
  const definition = CHAT_TABLE_CATALOG[table];
  const tableName = table.toLowerCase();
  const description = definition.description.toLowerCase();
  const columns = Object.keys(definition.columns).map((column) => column.toLowerCase());
  let score = 0;

  for (const token of tokens) {
    if (tableName.includes(token)) {
      score += 5;
    }
    if (description.includes(token)) {
      score += 2;
    }
    for (const column of columns) {
      if (column.includes(token)) {
        score += 1;
      }
    }
  }

  return score;
}

function pickRelevantTable(question: string): ChatTableName {
  const tokens = tokenizeQuestion(question);
  const tables = Object.keys(CHAT_TABLE_CATALOG) as ChatTableName[];

  let bestTable: ChatTableName = tables[0] ?? "devices";
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestColumnCount = 0;

  for (const table of tables) {
    const score = scoreTableForQuestion(table, tokens);
    const columnCount = Object.keys(CHAT_TABLE_CATALOG[table].columns).length;
    if (score > bestScore || (score === bestScore && columnCount > bestColumnCount)) {
      bestTable = table;
      bestScore = score;
      bestColumnCount = columnCount;
    }
  }

  return bestTable;
}

function pickGroupColumn(table: ChatTableName): string | undefined {
  const columns = Object.entries(CHAT_TABLE_CATALOG[table].columns).filter(
    ([, type]) => type === "string",
  );

  if (!columns.length) {
    return undefined;
  }

  const ranked = columns
    .map(([name]) => {
      let rank = 0;
      if (name.includes("affiliate")) rank += 6;
      if (name.includes("state")) rank += 5;
      if (name.includes("county")) rank += 4;
      if (name.includes("site")) rank += 3;
      if (name.endsWith("_code")) rank += 2;
      if (name.includes("name")) rank += 1;
      return { name, rank };
    })
    .sort((a, b) => b.rank - a.rank);

  return ranked[0]?.name;
}

function pickNumericColumns(table: ChatTableName): string[] {
  return Object.entries(CHAT_TABLE_CATALOG[table].columns)
    .filter(([, type]) => type === "number")
    .map(([name]) => name);
}

function fallbackCall(question: string, context: ChatContext["filters"]): PlannerCall {
  const guessedTable = pickRelevantTable(question);
  const table = maybeSwapDevicesTable(guessedTable, context.includeExceptions) as ChatTableName;
  const numericColumns = pickNumericColumns(table);
  const groupColumn = pickGroupColumn(table);

  if (numericColumns.length > 0) {
    const metrics: AggregateMetric[] = [{ fn: "count", as: "row_count" }];
    const riskColumn = numericColumns.find((column) => column === "risk_score");
    const costColumn = numericColumns.find((column) => column === "estimated_refresh_cost");
    const avgColumn = riskColumn ?? numericColumns[0];

    if (avgColumn) {
      metrics.push({ fn: "avg", column: avgColumn, as: `avg_${avgColumn}` });
    }
    if (costColumn) {
      metrics.push({ fn: "sum", column: costColumn, as: `sum_${costColumn}` });
    }

    return {
      tool: "aggregate",
      table,
      groupBy: groupColumn ? [groupColumn] : undefined,
      metrics,
      limit: 10,
    };
  }

  return {
    tool: "listRows",
    table,
    limit: 25,
  };
}

export async function runChatOrchestrator(
  input: ChatOrchestratorInput,
  handlers: ChatStreamHandlers,
): Promise<void> {
  const plannedCalls = await planToolCalls(input);
  const baseCalls =
    plannedCalls.length > 0
      ? plannedCalls
      : [fallbackCall(input.message, input.context.filters)];
  const calls = baseCalls
    .slice(0, 3)
    .map((call) => applyContextFiltersToToolCall(call, input.context.filters));

  const executions: ToolExecution[] = [];
  for (const call of calls) {
    try {
      const execution = await executeToolCall(
        input.pool,
        call,
        input.maxToolRows,
        input.context.filters.asOfDate,
      );
      executions.push(execution);
    } catch (error) {
      if (isChatTableName(call.table)) {
        executions.push({
          call,
          table: call.table,
          rowCount: 0,
          rows: [],
          summary:
            error instanceof Error
              ? `error=${error.message}`
              : "error=Unknown query error",
        });
      }
    }
  }

  const answerPayload = {
    question: input.message,
    history: trimToRecentTurns(input.history),
    context: input.context,
    toolResults: executions.map((execution) => ({
      table: execution.table,
      tool: execution.call.tool,
      rowCount: execution.rowCount,
      summary: execution.summary,
      rows: execution.rows.slice(0, 120),
    })),
  };

  const stream = await input.openai.chat.completions.create({
    model: input.model,
    temperature: 0.1,
    stream: true,
    messages: [
      {
        role: "system",
        content: CHAT_ANSWER_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: JSON.stringify(answerPayload),
      },
    ],
  });

  for await (const chunk of stream) {
    const token = chunk.choices[0]?.delta?.content;
    if (typeof token === "string" && token.length > 0) {
      handlers.onToken(token);
    }
  }
}

export function getCatalogTablesForTests(): string[] {
  return Object.keys(CHAT_TABLE_CATALOG);
}
