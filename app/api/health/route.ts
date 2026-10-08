import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { handleApiError } from "@/lib/api";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const pool = getPool();

    const [dbCheck, migrations] = await Promise.all([
      pool.query<{ now: string }>(`SELECT NOW()::text AS now`),
      pool.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM schema_migrations`),
    ]);

    return NextResponse.json({
      ok: true,
      databaseTime: dbCheck.rows[0]?.now,
      migrationCount: migrations.rows[0]?.count ?? 0,
    });
  } catch (error) {
    return handleApiError(request, error);
  }
}
