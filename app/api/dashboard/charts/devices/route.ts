import { NextRequest, NextResponse } from "next/server";
import { handleApiError, parseBooleanParam, parseDateParam, parseNumberParam } from "@/lib/api";
import { getPool } from "@/lib/db";
import { getDeviceCharts } from "@/lib/queries/charts";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const params = request.nextUrl.searchParams;
    const includeExceptions = parseBooleanParam(params.get("includeExceptions"), false);
    const riskMin = params.get("riskMin");
    const riskMax = params.get("riskMax");

    const charts = await getDeviceCharts(
      getPool(),
      includeExceptions,
      {
        includeOutOfScope: parseBooleanParam(params.get("includeOutOfScope"), false),
        includeDecomSites: parseBooleanParam(params.get("includeDecomSites"), false),
        search: params.get("search") || undefined,
        deviceType: params.get("deviceType") || undefined,
        state: params.get("state") || undefined,
        affiliate: params.get("affiliate") || undefined,
        county: params.get("county") || undefined,
        siteCode: params.get("siteCode") || undefined,
        lifecycleStatus: params.get("lifecycleStatus") || undefined,
        riskMin: riskMin ? parseNumberParam(riskMin, 0) : undefined,
        riskMax: riskMax ? parseNumberParam(riskMax, 100) : undefined,
      },
      {
        asOfDate: parseDateParam(params.get("asOfDate")),
      },
    );

    return NextResponse.json(charts);
  } catch (error) {
    return handleApiError(request, error);
  }
}
