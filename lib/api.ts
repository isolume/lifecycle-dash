import { NextRequest, NextResponse } from "next/server";

export function parseBooleanParam(value: string | null, fallback = false): boolean {
  if (value === null) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function parseNumberParam(value: string | null, fallback: number): number {
  if (value === null || value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseDateParam(value: string | null, fallback?: string): string | undefined {
  if (value === null || value.trim() === "") {
    return fallback;
  }

  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return fallback;
  }

  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  if (parsed.toISOString().slice(0, 10) !== normalized) {
    return fallback;
  }

  return normalized;
}

export function handleApiError(request: NextRequest, error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : "Unknown server error";

  console.error("API error", {
    method: request.method,
    path: request.nextUrl.pathname,
    message,
  });

  return NextResponse.json(
    {
      error: message,
    },
    { status: 500 },
  );
}
