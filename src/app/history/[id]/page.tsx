import { cookies } from "next/headers";
import { HistoryDetails } from "@/components/history-details";
import { AUTH_TOKEN_COOKIE } from "@/lib/auth";
import { readHistoryRecordFromDatabase } from "@/lib/database";
import {
  parseRequestHistory,
  SERVER_REQUEST_HISTORY_COOKIE,
} from "@/lib/request-history";
import { getAuthenticatedUserId } from "@/lib/server-auth";

export default async function HistoryDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const cookieRecord = parseRequestHistory(
    cookieStore.get(SERVER_REQUEST_HISTORY_COOKIE)?.value,
  ).find((record) => record.id === id);
  const userId = getAuthenticatedUserId(
    cookieStore.get(AUTH_TOKEN_COOKIE)?.value,
  );
  let record = cookieRecord || null;

  if (userId) {
    try {
      record =
        (await readHistoryRecordFromDatabase(userId, id)) ||
        cookieRecord ||
        null;
    } catch {
      record = cookieRecord || null;
    }
  }

  return <HistoryDetails record={record} />;
}
