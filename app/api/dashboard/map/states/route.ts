import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api";
import { getPool } from "@/lib/db";
import { getStateMapFeatures } from "@/lib/queries/map";
import { parseMapQueryFilters } from "../route-utils";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const filters = parseMapQueryFilters(request.nextUrl.searchParams);
    const features = await getStateMapFeatures(getPool(), filters.includeExceptions, {
      includeOutOfScope: filters.includeOutOfScope,
      includeDecomSites: filters.includeDecomSites,
      affiliate: filters.affiliate,
      deviceType: filters.deviceType,
      state: filters.state,
    }, {
      asOfDate: filters.asOfDate,
    });

    return NextResponse.json(features);
  } catch (error) {
    return handleApiError(request, error);
  }
}
