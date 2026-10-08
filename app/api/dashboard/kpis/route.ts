import { NextRequest, NextResponse } from "next/server";
import { parseBooleanParam, parseDateParam } from "@/lib/api";
import { handleApiError } from "@/lib/api";
import { getPool } from "@/lib/db";
import { getKpis } from "@/lib/queries/dashboard";

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
    const kpis = await getKpis(getPool(), includeExceptions, {
      includeOutOfScope: parseBooleanParam(params.get("includeOutOfScope"), false),
      includeDecomSites: parseBooleanParam(params.get("includeDecomSites"), false),
      state: params.get("state") || undefined,
      affiliate: params.get("affiliate") || undefined,
      deviceType: params.get("deviceType") || undefined,
      county: params.get("county") || undefined,
      siteCode,
      siteCodes,
    }, {
      asOfDate: parseDateParam(params.get("asOfDate")),
    });

    return NextResponse.json(kpis);
  } catch (error) {
    return handleApiError(request, error);
  }
}
