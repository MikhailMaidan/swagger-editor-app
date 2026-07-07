import { NextResponse } from "next/server";
import {
  isRequestHistoryRecord,
  mergeRequestHistory,
  parseRequestHistory,
  SERVER_REQUEST_HISTORY_COOKIE,
} from "@/lib/request-history";

const HISTORY_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

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

function readServerHistory(request: Request) {
  return parseRequestHistory(
    readCookie(request, SERVER_REQUEST_HISTORY_COOKIE),
  );
}

export async function GET(request: Request) {
  return NextResponse.json({
    records: readServerHistory(request),
  });
}

export async function POST(request: Request) {
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

    const records = mergeRequestHistory([
      record,
      ...readServerHistory(request),
    ]);
    const response = NextResponse.json({
      records,
    });

    response.cookies.set(
      SERVER_REQUEST_HISTORY_COOKIE,
      JSON.stringify(records),
      {
        maxAge: HISTORY_COOKIE_MAX_AGE,
        path: "/",
        sameSite: "lax",
      },
    );

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
