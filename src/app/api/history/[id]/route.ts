import { NextResponse } from "next/server";
import { deleteHistoryFromDatabase } from "@/lib/database";
import {
  parseRequestHistory,
  SERVER_REQUEST_HISTORY_COOKIE,
} from "@/lib/request-history";
import { getRequestUserId, readRequestCookie } from "@/lib/server-auth";

const HISTORY_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

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
    await deleteHistoryFromDatabase(userId, id);
  } catch {
    // The cookie fallback list below is still updated regardless, so the
    // record disappears from the UI even if the database delete failed.
  }

  const remainingRecords = parseRequestHistory(
    readRequestCookie(request, SERVER_REQUEST_HISTORY_COOKIE),
  ).filter((record) => record.id !== id);

  const response = NextResponse.json({ records: remainingRecords });

  response.cookies.set(
    SERVER_REQUEST_HISTORY_COOKIE,
    JSON.stringify(remainingRecords),
    {
      maxAge: HISTORY_COOKIE_MAX_AGE,
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  );

  return response;
}
