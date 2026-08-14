import { NextResponse } from "next/server";
import {
  deleteAllSchemasFromDatabase,
  readSchemasFromDatabase,
  saveSchemaToDatabase,
} from "@/lib/database";
import {
  isSavedSchemaRecord,
  mergeSavedSchemas,
  parseSavedSchemas,
  SERVER_SAVED_SCHEMAS_COOKIE,
} from "@/lib/schema-storage";
import { getRequestUserId, readRequestCookie } from "@/lib/server-auth";

const SCHEMAS_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

function readServerSchemas(request: Request) {
  return parseSavedSchemas(
    readRequestCookie(request, SERVER_SAVED_SCHEMAS_COOKIE),
  );
}

export async function GET(request: Request) {
  const userId = getRequestUserId(request);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const databaseSchemas = await readSchemasFromDatabase(userId);

    if (databaseSchemas) {
      return NextResponse.json({ schemas: databaseSchemas });
    }
  } catch {
    // The cookie fallback keeps the local demo usable if the database is down.
  }

  return NextResponse.json({
    schemas: readServerSchemas(request),
  });
}

export async function POST(request: Request) {
  const userId = getRequestUserId(request);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const schema = await request.json();

    if (!isSavedSchemaRecord(schema)) {
      return NextResponse.json(
        {
          error: "Invalid saved schema.",
        },
        {
          status: 400,
        },
      );
    }

    // The incoming schema must be spread last: mergeSavedSchemas dedupes by
    // id with later entries winning, so putting it first would let a stale
    // cookie snapshot of the same id (e.g. re-saving an already-saved
    // schema) silently overwrite this request's fresh content.
    const schemas = mergeSavedSchemas([...readServerSchemas(request), schema]);

    let savedToDatabase = false;

    try {
      savedToDatabase = await saveSchemaToDatabase(userId, schema);
    } catch {
      // The schema is still persisted in the server-readable fallback cookie.
    }

    const response = NextResponse.json({
      schemas,
    });

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
      {
        error: "Invalid request payload.",
      },
      {
        status: 400,
      },
    );
  }
}

export async function DELETE(request: Request) {
  const userId = getRequestUserId(request);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    await deleteAllSchemasFromDatabase(userId);
  } catch {
    // The cookie fallback below is still cleared regardless, so the list
    // disappears from the UI even if the database delete failed.
  }

  const response = NextResponse.json({ schemas: [] });

  response.cookies.set(SERVER_SAVED_SCHEMAS_COOKIE, JSON.stringify([]), {
    maxAge: SCHEMAS_COOKIE_MAX_AGE,
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
