import { NextResponse } from "next/server";
import { deleteSchemaFromDatabase } from "@/lib/database";
import {
  parseSavedSchemas,
  SERVER_SAVED_SCHEMAS_COOKIE,
} from "@/lib/schema-storage";
import { getRequestUserId, readRequestCookie } from "@/lib/server-auth";

const SCHEMAS_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = getRequestUserId(request);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;

  try {
    await deleteSchemaFromDatabase(userId, id);
  } catch {
    // The cookie fallback list below is still updated regardless, so the
    // schema disappears from the UI even if the database delete failed.
  }

  const remainingSchemas = parseSavedSchemas(
    readRequestCookie(request, SERVER_SAVED_SCHEMAS_COOKIE),
  ).filter((schema) => schema.id !== id);

  const response = NextResponse.json({ schemas: remainingSchemas });

  response.cookies.set(
    SERVER_SAVED_SCHEMAS_COOKIE,
    JSON.stringify(remainingSchemas),
    {
      maxAge: SCHEMAS_COOKIE_MAX_AGE,
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  );

  return response;
}
