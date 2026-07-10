import { NextResponse } from "next/server";
import {
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

    const schemas = mergeSavedSchemas([schema, ...readServerSchemas(request)]);

    try {
      await saveSchemaToDatabase(userId, schema);
    } catch {
      // The schema is still persisted in the server-readable fallback cookie.
    }

    const response = NextResponse.json({
      schemas,
    });

    response.cookies.set(SERVER_SAVED_SCHEMAS_COOKIE, JSON.stringify(schemas), {
      maxAge: SCHEMAS_COOKIE_MAX_AGE,
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

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
