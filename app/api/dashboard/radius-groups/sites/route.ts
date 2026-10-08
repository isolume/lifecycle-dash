import { NextRequest, NextResponse } from "next/server";
import { handleApiError, parseBooleanParam, parseDateParam, parseNumberParam } from "@/lib/api";
import { HIGH_RISK_MIN } from "@/lib/constants";
import { getPool } from "@/lib/db";
import { getRadiusGroupSiteSummaries } from "@/lib/queries/dashboard";

function parseSiteCodes(value: string | null): string[] {
  return [...new Set(
    (value ?? "")
      .split(",")
      .map((siteCode) => siteCode.trim().toUpperCase())
      .filter(Boolean),
  )];
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const params = request.nextUrl.searchParams;
    const siteCodes = parseSiteCodes(params.get("siteCodes"));

    if (!siteCodes.length) {
      return NextResponse.json({ error: "siteCodes is required" }, { status: 400 });
    }

    const includeExceptions = parseBooleanParam(params.get("includeExceptions"), false);
    const riskMin = parseNumberParam(params.get("riskMin"), HIGH_RISK_MIN);

    const result = await getRadiusGroupSiteSummaries(
      getPool(),
      includeExceptions,
      siteCodes,
      riskMin,
      {
        includeOutOfScope: parseBooleanParam(params.get("includeOutOfScope"), false),
        includeDecomSites: parseBooleanParam(params.get("includeDecomSites"), false),
        state: params.get("state") || undefined,
        county: params.get("county") || undefined,
        affiliate: params.get("affiliate") || undefined,
        deviceType: params.get("deviceType") || undefined,
      },
      {
        asOfDate: parseDateParam(params.get("asOfDate")),
      },
    );
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(request, error);
  }
}
