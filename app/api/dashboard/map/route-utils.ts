import { NextResponse } from "next/server";
import { parseBooleanParam, parseDateParam } from "@/lib/api";
import { normalizeCountyFips, normalizeSiteCode, normalizeStateCode } from "@/lib/maps/params";

export interface ParsedMapQueryFilters {
  includeExceptions: boolean;
  includeOutOfScope: boolean;
  includeDecomSites: boolean;
  asOfDate?: string;
  affiliate?: string;
  deviceType?: string;
  state?: string;
}

export function parseMapQueryFilters(params: URLSearchParams): ParsedMapQueryFilters {
  return {
    includeExceptions: parseBooleanParam(params.get("includeExceptions"), false),
    includeOutOfScope: parseBooleanParam(params.get("includeOutOfScope"), false),
    includeDecomSites: parseBooleanParam(params.get("includeDecomSites"), false),
    asOfDate: parseDateParam(params.get("asOfDate")),
    affiliate: params.get("affiliate") || undefined,
    deviceType: params.get("deviceType") || undefined,
    state: normalizeStateCode(params.get("state")) ?? undefined,
  };
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function parseStateCodeParam(value: string | undefined): string | null {
  return normalizeStateCode(value);
}

export function parseCountyFipsParam(value: string | undefined): string | null {
  return normalizeCountyFips(value);
}

export function parseSiteCodeParam(value: string | undefined): string | null {
  return normalizeSiteCode(value);
}
