import { z } from "zod";

export const chatHistoryItemSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(4_000),
});

export const chatFiltersSchema = z.object({
  includeExceptions: z.boolean().optional(),
  asOfDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  state: z.string().trim().max(8).optional(),
  affiliate: z.string().trim().max(120).optional(),
  county: z.string().trim().max(120).optional(),
  deviceType: z.string().trim().max(120).optional(),
  siteCode: z.string().trim().max(32).optional(),
});

export const chatContextSchema = z.object({
  pathname: z.string().trim().min(1).max(300),
  filters: chatFiltersSchema.default({}),
});

export const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(4_000),
  history: z.array(chatHistoryItemSchema).max(30).default([]),
  context: chatContextSchema,
});

export type ChatHistoryItem = z.infer<typeof chatHistoryItemSchema>;
export type ChatContext = z.infer<typeof chatContextSchema>;
export type ChatRequestPayload = z.infer<typeof chatRequestSchema>;

export function parseChatRequest(input: unknown): ChatRequestPayload {
  const parsed = chatRequestSchema.parse(input);
  return {
    ...parsed,
    history: parsed.history.slice(-6),
  };
}
