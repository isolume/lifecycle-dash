import { NextRequest, NextResponse } from "next/server";
import { handleApiError, parseBooleanParam, parseDateParam, parseNumberParam } from "@/lib/api";
import { getPool } from "@/lib/db";
import { getSiteCharts } from "@/lib/queries/charts";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const params = request.nextUrl.searchParams;
    const includeExceptions = parseBooleanParam(params.get("includeExceptions"), false);
    const highRiskOnly = parseBooleanParam(params.get("highRiskOnly"), false);
    const limit = Math.max(1, Math.min(20, parseNumberParam(params.get("limit"), 8)));

    const charts = await getSiteCharts(
      getPool(),
      includeExceptions,
      {
        includeOutOfScope: parseBooleanParam(params.get("includeOutOfScope"), false),
        includeDecomSites: parseBooleanParam(params.get("includeDecomSites"), false),
        state: params.get("state") || undefined,
        affiliate: params.get("affiliate") || undefined,
        county: params.get("county") || undefined,
        deviceType: params.get("deviceType") || undefined,
      },
      highRiskOnly,
      limit,
      {
        asOfDate: parseDateParam(params.get("asOfDate")),
      },
    );

    return NextResponse.json(charts);
  } catch (error) {
    return handleApiError(request, error);
  }
}
