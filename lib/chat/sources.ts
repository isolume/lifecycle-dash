import type { ChatTableName } from "./catalog";

export type ChatOperation = "listRows" | "aggregate";

export interface ChatSource {
  id: string;
  title: string;
  table: ChatTableName;
  operation: ChatOperation;
  detail: string;
}

export interface RawSourceInput {
  table: ChatTableName;
  operation: ChatOperation;
  rowCount: number;
  summary: string;
}

export function normalizeSources(inputs: RawSourceInput[]): ChatSource[] {
  return inputs.map((input, index) => ({
    id: `S${index + 1}`,
    title: `${input.table} (${input.operation})`,
    table: input.table,
    operation: input.operation,
    detail: `${input.summary}; rows=${input.rowCount}`,
  }));
}
