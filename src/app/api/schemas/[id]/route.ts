import { NextResponse } from "next/server";
import {
  deleteSchemaFromDatabase,
  readSchemasFromDatabase,
  saveSchemaToDatabase,
} from "@/lib/database";
import {
  mergeSavedSchemas,
  parseSavedSchemas,
  SavedSchemaRecord,
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = getRequestUserId(request);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;

  try {
    const payload = await request.json();
    const title =
      typeof payload.title === "string" ? payload.title.trim() : "";

    if (!title) {
      return NextResponse.json(
        { error: "A schema title is required." },
        { status: 400 },
      );
    }

    const cookieSchemas = parseSavedSchemas(
      readRequestCookie(request, SERVER_SAVED_SCHEMAS_COOKIE),
    );
    let existingSchema: SavedSchemaRecord | undefined = cookieSchemas.find(
      (schema) => schema.id === id,
    );

    if (!existingSchema) {
      try {
        const databaseSchemas = await readSchemasFromDatabase(userId);

        existingSchema = databaseSchemas?.find((schema) => schema.id === id);
      } catch {
        // Falls through to the not-found response below.
      }
    }

    if (!existingSchema) {
      return NextResponse.json(
        { error: "Saved schema not found." },
        { status: 404 },
      );
    }

    const renamedSchema: SavedSchemaRecord = {
      ...existingSchema,
      title,
      updatedAt: new Date().toISOString(),
    };

    const schemas = mergeSavedSchemas([
      ...cookieSchemas.filter((schema) => schema.id !== id),
      renamedSchema,
    ]);

    let savedToDatabase = false;

    try {
      savedToDatabase = await saveSchemaToDatabase(userId, renamedSchema);
    } catch {
      // The rename is still persisted in the server-readable fallback cookie.
    }

    const response = NextResponse.json({ schemas });

    if (!savedToDatabase) {
      response.cookies.set(
        SERVER_SAVED_SCHEMAS_COOKIE,
        JSON.stringify(schemas),
        {
          maxAge: SCHEMAS_COOKIE_MAX_AGE,
          httpOnly: true,
          path: "/",
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
        },
      );
    }

    return response;
  } catch {
    return NextResponse.json(
      { error: "Invalid request payload." },
      { status: 400 },
    );
  }
}
