import { NextRequest, NextResponse } from "next/server";
import { handleApiError, parseBooleanParam, parseDateParam, parseNumberParam } from "@/lib/api";
import { RADIUS_MILES_DEFAULT } from "@/lib/constants";
import { getPool } from "@/lib/db";
import { getRadiusGroups } from "@/lib/queries/dashboard";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const params = request.nextUrl.searchParams;
    const radiusMi = parseNumberParam(params.get("radiusMi"), RADIUS_MILES_DEFAULT);
    const riskMin = parseNumberParam(params.get("riskMin"), 65);
    const includeExceptions = parseBooleanParam(params.get("includeExceptions"), false);

    const groups = await getRadiusGroups(getPool(), includeExceptions, radiusMi, riskMin, {
      includeOutOfScope: parseBooleanParam(params.get("includeOutOfScope"), false),
      includeDecomSites: parseBooleanParam(params.get("includeDecomSites"), false),
      state: params.get("state") || undefined,
      affiliate: params.get("affiliate") || undefined,
      county: params.get("county") || undefined,
      deviceType: params.get("deviceType") || undefined,
    }, {
      asOfDate: parseDateParam(params.get("asOfDate")),
    });
    return NextResponse.json(groups);
  } catch (error) {
    return handleApiError(request, error);
  }
}
