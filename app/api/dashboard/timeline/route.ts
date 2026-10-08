import { NextRequest, NextResponse } from "next/server";
import { handleApiError, parseDateParam } from "@/lib/api";
import { getPool } from "@/lib/db";
import { getTimePreviewBounds } from "@/lib/queries/dashboard";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const params = request.nextUrl.searchParams;
    const currentDate = parseDateParam(params.get("currentDate"));
    const bounds = await getTimePreviewBounds(getPool(), currentDate);
    return NextResponse.json(bounds);
  } catch (error) {
    return handleApiError(request, error);
  }
}
