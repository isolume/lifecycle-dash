import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api";
import { getPool } from "@/lib/db";
import { deleteException, updateException } from "@/lib/queries/exceptions";

const exceptionUpdateSchema = z.object({
  reason: z.string().optional(),
  projectTag: z.string().optional().nullable(),
  effectiveDate: z.string().optional(),
  expiresDate: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const input = exceptionUpdateSchema.parse(body);

    const updated = await updateException(getPool(), id, input);
    if (!updated) {
      return NextResponse.json({ error: "Exception not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    return handleApiError(request, error);
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const deleted = await deleteException(getPool(), id);

    if (!deleted) {
      return NextResponse.json({ error: "Exception not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(request, error);
  }
}
