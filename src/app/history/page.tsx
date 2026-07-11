import { cookies } from "next/headers";
import { HistoryPageContent } from "@/components/history-page-content";
import { AUTH_TOKEN_COOKIE } from "@/lib/auth";
import { readHistoryFromDatabase } from "@/lib/database";
import {
  parseRequestHistory,
  SERVER_REQUEST_HISTORY_COOKIE,
  sortRequestHistory,
} from "@/lib/request-history";
import { getAuthenticatedUserId } from "@/lib/server-auth";

export default async function HistoryPage() {
  const cookieStore = await cookies();
  const cookieRecords = sortRequestHistory(
    parseRequestHistory(cookieStore.get(SERVER_REQUEST_HISTORY_COOKIE)?.value),
  );
  const userId = getAuthenticatedUserId(
    cookieStore.get(AUTH_TOKEN_COOKIE)?.value,
  );
  let initialRecords = cookieRecords;

  if (userId) {
    try {
      initialRecords = (await readHistoryFromDatabase(userId)) || cookieRecords;
    } catch {
      initialRecords = cookieRecords;
    }
  }

  return <HistoryPageContent initialRecords={initialRecords} />;
}
