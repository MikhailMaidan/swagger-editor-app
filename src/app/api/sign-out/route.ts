import { NextResponse } from "next/server";
import { AUTH_TOKEN_COOKIE, AUTH_USER_COOKIE } from "@/lib/auth";
import { SERVER_REQUEST_HISTORY_COOKIE } from "@/lib/request-history";
import { SERVER_SAVED_SCHEMAS_COOKIE } from "@/lib/schema-storage";

export async function POST() {
  const response = NextResponse.json({ success: true });

  response.cookies.delete(AUTH_TOKEN_COOKIE);
  response.cookies.delete(AUTH_USER_COOKIE);
  response.cookies.delete(SERVER_SAVED_SCHEMAS_COOKIE);
  response.cookies.delete(SERVER_REQUEST_HISTORY_COOKIE);

  return response;
}
