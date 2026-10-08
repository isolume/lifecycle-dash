import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api";
import { getPool } from "@/lib/db";
import { AmbiguousDeviceNameError, createException, listExceptions } from "@/lib/queries/exceptions";

const exceptionCreateSchema = z.object({
  deviceId: z.string().min(1).optional(),
  deviceName: z.string().min(1).optional(),
  reason: z.string().min(1),
  projectTag: z.string().optional().nullable(),
  effectiveDate: z.string().optional(),
  expiresDate: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
}).refine((value) => Boolean(value.deviceId || value.deviceName), {
  message: "deviceId or deviceName is required",
  path: ["deviceId"],
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const rows = await listExceptions(getPool());
    return NextResponse.json(rows);
  } catch (error) {
    return handleApiError(request, error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const input = exceptionCreateSchema.parse(body);

    const row = await createException(getPool(), input);
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    if (error instanceof AmbiguousDeviceNameError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return handleApiError(request, error);
  }
}
