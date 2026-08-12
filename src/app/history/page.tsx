import { cookies } from "next/headers";
import { HistoryPageContent } from "@/components/history-page-content";
import { readHistoryFromDatabase } from "@/lib/database";
import {
  parseRequestHistory,
  SERVER_REQUEST_HISTORY_COOKIE,
  sortRequestHistory,
} from "@/lib/request-history";
import { getAuthenticatedUserIdFromCookies } from "@/lib/server-auth";

export default async function HistoryPage() {
  const cookieStore = await cookies();
  const userId = getAuthenticatedUserIdFromCookies(cookieStore);

  if (!userId) {
    return <HistoryPageContent initialRecords={[]} />;
  }

  const cookieRecords = sortRequestHistory(
    parseRequestHistory(cookieStore.get(SERVER_REQUEST_HISTORY_COOKIE)?.value),
  );
  let initialRecords = cookieRecords;

  try {
    initialRecords = (await readHistoryFromDatabase(userId)) || cookieRecords;
  } catch {
    initialRecords = cookieRecords;
  }

  return <HistoryPageContent initialRecords={initialRecords} />;
}
