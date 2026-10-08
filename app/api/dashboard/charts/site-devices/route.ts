import { NextRequest, NextResponse } from "next/server";
import { handleApiError, parseBooleanParam, parseDateParam } from "@/lib/api";
import { getPool } from "@/lib/db";
import { getSiteDeviceCharts } from "@/lib/queries/charts";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const params = request.nextUrl.searchParams;
    const includeExceptions = parseBooleanParam(params.get("includeExceptions"), false);
    const siteCode = params.get("siteCode") || undefined;

    if (!siteCode) {
      return NextResponse.json({ error: "siteCode is required" }, { status: 400 });
    }

    const charts = await getSiteDeviceCharts(
      getPool(),
      includeExceptions,
      {
        siteCode,
        includeOutOfScope: parseBooleanParam(params.get("includeOutOfScope"), false),
        includeDecomSites: parseBooleanParam(params.get("includeDecomSites"), false),
        state: params.get("state") || undefined,
        affiliate: params.get("affiliate") || undefined,
        deviceType: params.get("deviceType") || undefined,
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
