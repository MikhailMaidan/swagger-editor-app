import { cookies } from "next/headers";
import { HistoryDetails } from "@/components/history-details";
import { readHistoryRecordFromDatabase } from "@/lib/database";
import {
  parseRequestHistory,
  SERVER_REQUEST_HISTORY_COOKIE,
} from "@/lib/request-history";
import { getAuthenticatedUserIdFromCookies } from "@/lib/server-auth";

export default async function HistoryDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const userId = getAuthenticatedUserIdFromCookies(cookieStore);

  if (!userId) {
    return <HistoryDetails record={null} />;
  }

  const cookieRecord = parseRequestHistory(
    cookieStore.get(SERVER_REQUEST_HISTORY_COOKIE)?.value,
  ).find((record) => record.id === id);
  let record = cookieRecord || null;

  try {
    record =
      (await readHistoryRecordFromDatabase(userId, id)) || cookieRecord || null;
  } catch {
    record = cookieRecord || null;
  }

  return <HistoryDetails record={record} />;
}
