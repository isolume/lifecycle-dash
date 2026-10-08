import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api";
import { getPool } from "@/lib/db";
import { getCountySites } from "@/lib/queries/map";
import {
  badRequest,
  parseCountyFipsParam,
  parseMapQueryFilters,
  parseStateCodeParam,
} from "@/app/api/dashboard/map/route-utils";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ stateCode: string; countyFips: string }> },
): Promise<NextResponse> {
  try {
    const { stateCode: stateCodeRaw, countyFips: countyFipsRaw } = await context.params;
    const stateCode = parseStateCodeParam(stateCodeRaw);
    if (!stateCode) {
      return badRequest("Invalid state code");
    }

    const countyFips = parseCountyFipsParam(countyFipsRaw);
    if (!countyFips) {
      return badRequest("Invalid county FIPS");
    }

    const filters = parseMapQueryFilters(request.nextUrl.searchParams);
    const result = await getCountySites(getPool(), filters.includeExceptions, stateCode, countyFips, {
      includeOutOfScope: filters.includeOutOfScope,
      includeDecomSites: filters.includeDecomSites,
      affiliate: filters.affiliate,
      deviceType: filters.deviceType,
    }, {
      asOfDate: filters.asOfDate,
    });

    if (!result) {
      return NextResponse.json({ error: "County not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(request, error);
  }
}
