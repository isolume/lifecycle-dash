import { NextRequest, NextResponse } from "next/server";
import { handleApiError, parseBooleanParam, parseDateParam } from "@/lib/api";
import { getPool } from "@/lib/db";
import { getHeatmapPoints } from "@/lib/queries/dashboard";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const params = request.nextUrl.searchParams;
    const includeExceptions = parseBooleanParam(params.get("includeExceptions"), false);

    const points = await getHeatmapPoints(getPool(), includeExceptions, {
      includeOutOfScope: parseBooleanParam(params.get("includeOutOfScope"), false),
      includeDecomSites: parseBooleanParam(params.get("includeDecomSites"), false),
      deviceType: params.get("deviceType") || undefined,
      state: params.get("state") || undefined,
      affiliate: params.get("affiliate") || undefined,
      county: params.get("county") || undefined,
    }, {
      asOfDate: parseDateParam(params.get("asOfDate")),
    });

    return NextResponse.json(points);
  } catch (error) {
    return handleApiError(request, error);
  }
}
