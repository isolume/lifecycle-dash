import { NextRequest, NextResponse } from "next/server";
import { handleApiError, parseBooleanParam, parseDateParam, parseNumberParam } from "@/lib/api";
import { getPool } from "@/lib/db";
import { getSiteList } from "@/lib/queries/map";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const params = request.nextUrl.searchParams;
    const includeExceptions = parseBooleanParam(params.get("includeExceptions"), false);
    const highRiskOnly = parseBooleanParam(params.get("highRiskOnly"), false);
    const page = Math.max(1, parseNumberParam(params.get("page"), 1));
    const pageSize = Math.max(1, Math.min(100, parseNumberParam(params.get("pageSize"), 25)));

    const result = await getSiteList(
      getPool(),
      includeExceptions,
      {
        includeOutOfScope: parseBooleanParam(params.get("includeOutOfScope"), false),
        includeDecomSites: parseBooleanParam(params.get("includeDecomSites"), false),
        state: params.get("state") || undefined,
        affiliate: params.get("affiliate") || undefined,
        deviceType: params.get("deviceType") || undefined,
        county: params.get("county") || undefined,
      },
      page,
      pageSize,
      highRiskOnly,
      {
        asOfDate: parseDateParam(params.get("asOfDate")),
      },
    );

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(request, error);
  }
}
