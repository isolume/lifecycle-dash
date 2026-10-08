import { NextRequest, NextResponse } from "next/server";
import { handleApiError, parseBooleanParam, parseDateParam, parseNumberParam } from "@/lib/api";
import { getPool } from "@/lib/db";
import { getDevices } from "@/lib/queries/devices";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const params = request.nextUrl.searchParams;
    const siteCodeParam = params.get("siteCode");
    const parsedSiteCodes = siteCodeParam
      ?.split(",")
      .map((siteCode) => siteCode.trim().toUpperCase())
      .filter(Boolean) ?? [];
    const siteCodes = parsedSiteCodes.length > 1 ? [...new Set(parsedSiteCodes)] : undefined;
    const siteCode = parsedSiteCodes.length === 1 ? parsedSiteCodes[0] : undefined;

    const includeExceptions = parseBooleanParam(params.get("includeExceptions"), false);
    const page = Math.max(1, parseNumberParam(params.get("page"), 1));
    const pageSize = Math.max(1, Math.min(100, parseNumberParam(params.get("pageSize"), 50)));

    const rows = await getDevices(
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
        siteCode,
        siteCodes,
        lifecycleStatus: params.get("lifecycleStatus") || undefined,
        riskMin: params.get("riskMin") ? parseNumberParam(params.get("riskMin"), 0) : undefined,
        riskMax: params.get("riskMax") ? parseNumberParam(params.get("riskMax"), 100) : undefined,
      },
      page,
      pageSize,
      {
        asOfDate: parseDateParam(params.get("asOfDate")),
      },
    );

    return NextResponse.json(rows);
  } catch (error) {
    return handleApiError(request, error);
  }
}
