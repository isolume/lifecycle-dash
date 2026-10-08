import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api";
import { getPool } from "@/lib/db";
import { getDashboardFilters } from "@/lib/queries/dashboard";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const filters = await getDashboardFilters(getPool());
    return NextResponse.json(filters);
  } catch (error) {
    return handleApiError(request, error);
  }
}
