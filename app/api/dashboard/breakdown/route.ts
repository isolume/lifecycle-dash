import { NextRequest, NextResponse } from "next/server";
import { handleApiError, parseBooleanParam, parseDateParam, parseNumberParam } from "@/lib/api";
import { getPool } from "@/lib/db";
import { getBreakdown } from "@/lib/queries/dashboard";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const params = request.nextUrl.searchParams;
    const groupBy = (params.get("groupBy") || "state") as "state" | "affiliate" | "county" | "model" | "device_type";
    const includeExceptions = parseBooleanParam(params.get("includeExceptions"), false);
    const windowMonthsRaw = params.get("windowMonths");

    const rows = await getBreakdown(getPool(), includeExceptions, groupBy, {
      includeOutOfScope: parseBooleanParam(params.get("includeOutOfScope"), false),
      includeDecomSites: parseBooleanParam(params.get("includeDecomSites"), false),
      state: params.get("state") || undefined,
      affiliate: params.get("affiliate") || undefined,
      county: params.get("county") || undefined,
      deviceType: params.get("deviceType") || undefined,
    }, {
      asOfDate: parseDateParam(params.get("asOfDate")),
      windowMonths: windowMonthsRaw ? parseNumberParam(windowMonthsRaw, 6) : undefined,
    });
    return NextResponse.json(rows);
  } catch (error) {
    return handleApiError(request, error);
  }
}
