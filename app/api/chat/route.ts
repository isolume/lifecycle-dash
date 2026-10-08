import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { handleApiError } from "@/lib/api";
import { runChatOrchestrator } from "@/lib/chat/orchestrator";
import { parseChatRequest } from "@/lib/chat/request";
import { getPool } from "@/lib/db";
import { getEnv } from "@/lib/env";

export const runtime = "nodejs";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }

  return request.headers.get("x-real-ip") || "unknown";
}

function checkRateLimit(ip: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const existing = rateLimitStore.get(ip);

  if (!existing || now >= existing.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + windowMs });
    return false;
  }

  if (existing.count >= maxRequests) {
    return true;
  }

  existing.count += 1;
  return false;
}

function writeSseEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  event: "token" | "done" | "error",
  payload: unknown,
): void {
  controller.enqueue(encoder.encode(`event: ${event}\n`));
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const env = getEnv();

    if (!env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured." },
        { status: 500 },
      );
    }

    const ip = getClientIp(request);
    const limited = checkRateLimit(
      ip,
      Math.max(1, env.CHAT_RATE_LIMIT_MAX_REQUESTS),
      Math.max(1_000, env.CHAT_RATE_LIMIT_WINDOW_MS),
    );
    if (limited) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait and try again." },
        { status: 429 },
      );
    }

    const body = await request.json();
    const payload = parseChatRequest(body);

    const openai = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        void (async () => {
          try {
            await runChatOrchestrator(
              {
                openai,
                pool: getPool(),
                model: env.OPENAI_MODEL,
                maxToolRows: Math.max(1, env.CHAT_MAX_TOOL_ROWS),
                message: payload.message,
                history: payload.history,
                context: payload.context,
              },
              {
                onToken(token) {
                  writeSseEvent(controller, encoder, "token", { token });
                },
              },
            );

            writeSseEvent(controller, encoder, "done", { ok: true });
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unknown chat error";
            writeSseEvent(controller, encoder, "error", { error: message });
          } finally {
            controller.close();
          }
        })();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    return handleApiError(request, error);
  }
}
