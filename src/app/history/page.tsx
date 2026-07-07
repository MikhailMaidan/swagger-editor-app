import { cookies } from "next/headers";
import { HistoryPageContent } from "@/components/history-page-content";
import {
  parseRequestHistory,
  SERVER_REQUEST_HISTORY_COOKIE,
  sortRequestHistory,
} from "@/lib/request-history";

export default async function HistoryPage() {
  const cookieStore = await cookies();
  const initialRecords = sortRequestHistory(
    parseRequestHistory(cookieStore.get(SERVER_REQUEST_HISTORY_COOKIE)?.value),
  );

  return <HistoryPageContent initialRecords={initialRecords} />;
}
