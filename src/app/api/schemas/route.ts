import { NextResponse } from "next/server";
import {
  isSavedSchemaRecord,
  mergeSavedSchemas,
  parseSavedSchemas,
  SERVER_SAVED_SCHEMAS_COOKIE,
} from "@/lib/schema-storage";

const SCHEMAS_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

function readCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie") || "";
  const cookie = cookieHeader
    .split("; ")
    .find((item) => item.startsWith(`${name}=`));

  if (!cookie) {
    return null;
  }

  return decodeURIComponent(cookie.split("=").slice(1).join("="));
}

function readServerSchemas(request: Request) {
  return parseSavedSchemas(readCookie(request, SERVER_SAVED_SCHEMAS_COOKIE));
}

export async function GET(request: Request) {
  return NextResponse.json({
    schemas: readServerSchemas(request),
  });
}

export async function POST(request: Request) {
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
    const response = NextResponse.json({
      schemas,
    });

    response.cookies.set(SERVER_SAVED_SCHEMAS_COOKIE, JSON.stringify(schemas), {
      maxAge: SCHEMAS_COOKIE_MAX_AGE,
      path: "/",
      sameSite: "lax",
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
