import { NextRequest, NextResponse } from "next/server";
import { handleApiError, parseBooleanParam } from "@/lib/api";
import { getPool } from "@/lib/db";
import { getExceptionCharts } from "@/lib/queries/charts";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const params = request.nextUrl.searchParams;
    const isActiveParam = params.get("isActive");

    const charts = await getExceptionCharts(getPool(), {
      projectTag: params.get("projectTag") || undefined,
      isActive: isActiveParam === null ? undefined : parseBooleanParam(isActiveParam, false),
    });

    return NextResponse.json(charts);
  } catch (error) {
    return handleApiError(request, error);
  }
}
