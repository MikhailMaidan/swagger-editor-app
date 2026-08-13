import { NextResponse } from "next/server";
import {
  deleteAllHistoryFromDatabase,
  readHistoryFromDatabase,
  saveHistoryToDatabase,
} from "@/lib/database";
import {
  isRequestHistoryRecord,
  mergeRequestHistory,
  parseRequestHistory,
  SERVER_REQUEST_HISTORY_COOKIE,
} from "@/lib/request-history";
import { getRequestUserId, readRequestCookie } from "@/lib/server-auth";

const HISTORY_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

function readServerHistory(request: Request) {
  return parseRequestHistory(
    readRequestCookie(request, SERVER_REQUEST_HISTORY_COOKIE),
  );
}

export async function GET(request: Request) {
  const userId = getRequestUserId(request);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const databaseRecords = await readHistoryFromDatabase(userId);

    if (databaseRecords) {
      return NextResponse.json({ records: databaseRecords });
    }
  } catch {
    // The cookie fallback keeps the local demo usable if the database is down.
  }

  return NextResponse.json({
    records: readServerHistory(request),
  });
}

export async function POST(request: Request) {
  const userId = getRequestUserId(request);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const record = await request.json();

    if (!isRequestHistoryRecord(record)) {
      return NextResponse.json(
        {
          error: "Invalid history record.",
        },
        {
          status: 400,
        },
      );
    }

    // The incoming record must be spread last: mergeRequestHistory dedupes
    // by id with later entries winning, so putting it first would let a
    // stale cookie snapshot of the same id silently overwrite this
    // request's fresh content (the same class of bug fixed in the schemas
    // route's equivalent merge).
    const records = mergeRequestHistory([
      ...readServerHistory(request),
      record,
    ]);

    let savedToDatabase = false;

    try {
      savedToDatabase = await saveHistoryToDatabase(userId, record);
    } catch {
      // The record is still persisted in the server-readable fallback cookie.
    }

    const response = NextResponse.json({
      records,
    });

    if (!savedToDatabase) {
      response.cookies.set(
        SERVER_REQUEST_HISTORY_COOKIE,
        JSON.stringify(records),
        {
          maxAge: HISTORY_COOKIE_MAX_AGE,
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
    await deleteAllHistoryFromDatabase(userId);
  } catch {
    // The cookie fallback below is still cleared regardless, so history
    // disappears from the UI even if the database delete failed.
  }

  const response = NextResponse.json({ records: [] });

  response.cookies.set(SERVER_REQUEST_HISTORY_COOKIE, JSON.stringify([]), {
    maxAge: HISTORY_COOKIE_MAX_AGE,
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
