import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api";
import { getPool } from "@/lib/db";
import { getCountyMapFeatures } from "@/lib/queries/map";
import { badRequest, parseMapQueryFilters, parseStateCodeParam } from "@/app/api/dashboard/map/route-utils";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ stateCode: string }> },
): Promise<NextResponse> {
  try {
    const { stateCode: stateCodeRaw } = await context.params;
    const stateCode = parseStateCodeParam(stateCodeRaw);
    if (!stateCode) {
      return badRequest("Invalid state code");
    }

    const filters = parseMapQueryFilters(request.nextUrl.searchParams);
    const counties = await getCountyMapFeatures(getPool(), filters.includeExceptions, stateCode, {
      includeOutOfScope: filters.includeOutOfScope,
      includeDecomSites: filters.includeDecomSites,
      affiliate: filters.affiliate,
      deviceType: filters.deviceType,
    }, {
      asOfDate: filters.asOfDate,
    });

    return NextResponse.json(counties);
  } catch (error) {
    return handleApiError(request, error);
  }
}
